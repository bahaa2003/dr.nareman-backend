import { createHash } from "node:crypto";

import argon2 from "argon2";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";

const adminEmail = "admin@example.com";
const adminPassword = "correct horse battery staple";
let mongoMemoryServer: MongoMemoryServer | undefined;

function extractCookieValue(setCookie: string): string {
  const cookiePair = setCookie.split(";", 1)[0];
  return cookiePair.slice(cookiePair.indexOf("=") + 1);
}

async function createActiveAdmin(): Promise<void> {
  await provisionAdmin({ email: adminEmail, password: adminPassword });
}

describe("admin authentication", () => {
  beforeAll(async () => {
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await connectDatabase(mongoMemoryServer.getUri());
    await Promise.all([AdminModel.init(), AdminSessionModel.init()]);
  });

  afterEach(async () => {
    await Promise.all([AdminModel.deleteMany({}), AdminSessionModel.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
  });

  it("stores only an Argon2 password hash and rejects duplicate provisioning", async () => {
    await createActiveAdmin();

    const storedAdmin = await AdminModel.findOne({ email: adminEmail }).select("+passwordHash");
    expect(storedAdmin?.passwordHash).not.toBe(adminPassword);
    expect(await argon2.verify(storedAdmin?.passwordHash ?? "", adminPassword)).toBe(true);
    await expect(provisionAdmin({ email: adminEmail, password: adminPassword })).rejects.toMatchObject({
      name: "AdminAlreadyExistsError"
    });
  });

  it("issues an HttpOnly session cookie and persists only its hash", async () => {
    await createActiveAdmin();

    const response = await request(app).post("/api/admin/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });

    expect(response.status).toBe(200);
    expect(response.body.admin).toEqual({ id: expect.any(String), email: adminEmail });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("tokenHash");

    const setCookie = response.headers["set-cookie"]?.[0];
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const rawToken = extractCookieValue(setCookie ?? "");
    const session = await AdminSessionModel.findOne({ adminId: response.body.admin.id }).select("+tokenHash");
    expect(session?.tokenHash).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(session?.tokenHash).not.toBe(rawToken);

    const indexes = await AdminSessionModel.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })
      ])
    );
  });

  it("returns the same generic error for unknown emails and wrong passwords", async () => {
    await createActiveAdmin();

    const unknownEmail = await request(app).post("/api/admin/auth/login").send({
      email: "unknown@example.com",
      password: adminPassword
    });
    const wrongPassword = await request(app).post("/api/admin/auth/login").send({
      email: adminEmail,
      password: "wrong password"
    });
    const malformed = await request(app).post("/api/admin/auth/login").send({ email: "invalid" });

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(malformed.status).toBe(400);
  });

  it("protects /me and returns the active admin identity for a valid session", async () => {
    await createActiveAdmin();
    const agent = request.agent(app);

    const missingSession = await request(app).get("/api/admin/auth/me");
    expect(missingSession.status).toBe(401);

    await agent.post("/api/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    const response = await agent.get("/api/admin/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.admin).toEqual({ id: expect.any(String), email: adminEmail });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("rejects expired sessions even before TTL cleanup and rejects inactive admins", async () => {
    await createActiveAdmin();
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/admin/auth/login")
      .send({ email: adminEmail, password: adminPassword });
    const adminId = loginResponse.body.admin.id;

    await AdminSessionModel.updateOne({ adminId }, { expiresAt: new Date(Date.now() - 1_000) });
    expect((await agent.get("/api/admin/auth/me")).status).toBe(401);

    const secondAgent = request.agent(app);
    await secondAgent.post("/api/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    await AdminModel.updateOne({ _id: adminId }, { isActive: false });
    expect((await secondAgent.get("/api/admin/auth/me")).status).toBe(401);
  });

  it("revokes sessions during idempotent logout", async () => {
    await createActiveAdmin();
    const agent = request.agent(app);

    await agent.post("/api/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    const logoutResponse = await agent.post("/api/admin/auth/logout");

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers["set-cookie"]?.[0]).toContain("dr_nareman_admin_session=");
    expect(await AdminSessionModel.countDocuments()).toBe(0);
    expect((await agent.get("/api/admin/auth/me")).status).toBe(401);
    expect((await agent.post("/api/admin/auth/logout")).status).toBe(204);
  });

  it("limits repeated failed login attempts", async () => {
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await request(app).post("/api/admin/auth/login").send({
        email: "rate-limit@example.com",
        password: adminPassword
      });
      expect(response.status).toBe(401);
    }

    const limitedResponse = await request(app).post("/api/admin/auth/login").send({
      email: "rate-limit@example.com",
      password: adminPassword
    });

    expect(limitedResponse.status).toBe(429);
  });
});

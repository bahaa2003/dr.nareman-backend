import { createHash } from "node:crypto";

import { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request, { type SuperAgentTest } from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { adminSessionCookieName } from "../src/modules/adminAuth/adminAuth.cookies.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";
import { ArticleModel } from "../src/modules/articles/article.model.js";
import { createArticle } from "../src/modules/articles/article.service.js";
import { leadCreateRateLimiter } from "../src/modules/leads/lead.rateLimit.js";

let mongoMemoryServer: MongoMemoryServer | undefined;

const adminEmail = "security-editor@example.com";
const adminPassword = "correct horse battery staple";
const allowedOrigin = "http://localhost:3000";
const disallowedOrigin = "https://untrusted.example";
const forwardedClientOne = "203.0.113.10";
const forwardedClientTwo = "203.0.113.11";
const baseArticle = {
  title: "Fertility Guide",
  excerpt: "A concise fertility guide for patients.",
  content: "Full Markdown-compatible article content for patients.",
  category: "Fertility"
};

function extractCookieValue(setCookie: string): string {
  const cookiePair = setCookie.split(";", 1)[0];
  return cookiePair.slice(cookiePair.indexOf("=") + 1);
}

async function authenticatedAgent(): Promise<SuperAgentTest> {
  await provisionAdmin({ email: adminEmail, password: adminPassword });
  const agent = request.agent(app);
  const response = await agent.post("/api/admin/auth/login").send({
    email: adminEmail,
    password: adminPassword
  });

  expect(response.status).toBe(200);
  return agent;
}

describe("security hardening", () => {
  beforeAll(async () => {
    expect(env.allowedOrigins).toContain(allowedOrigin);
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await connectDatabase(mongoMemoryServer.getUri());
    await Promise.all([AdminModel.init(), AdminSessionModel.init(), ArticleModel.init()]);
  });

  afterEach(async () => {
    await Promise.all([
      AdminModel.deleteMany({}),
      AdminSessionModel.deleteMany({}),
      ArticleModel.deleteMany({})
    ]);
    leadCreateRateLimiter.resetKey(forwardedClientOne);
    leadCreateRateLimiter.resetKey(forwardedClientTwo);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
  });

  it("uses Helmet headers and credential-compatible allowlisted CORS", async () => {
    const allowed = await request(app).get("/api/health").set("Origin", allowedOrigin);
    const rejected = await request(app).get("/api/health").set("Origin", disallowedOrigin);
    const preflight = await request(app)
      .options("/api/admin/articles")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST");

    expect(allowed.status).toBe(200);
    expect(allowed.headers["x-powered-by"]).toBeUndefined();
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual({ success: false, error: { message: "Origin is not allowed by CORS policy" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("trusts forwarded client addresses only from the loopback reverse proxy", async () => {
    const trustProxy = app.get("trust proxy fn") as (address: string, index: number) => boolean;
    const createLeadFrom = (clientAddress: string, name: string) =>
      request(app)
        .post("/api/leads")
        .set("X-Forwarded-For", clientAddress)
        .send({
          name,
          phone: "+20101234567",
          source: "ovulation_calculator",
          privacyNoticeAccepted: true,
          marketingConsent: false
        });

    expect(app.get("trust proxy")).toBe("loopback");
    expect(trustProxy("127.0.0.1", 0)).toBe(true);
    expect(trustProxy("::1", 0)).toBe(true);
    expect(trustProxy("203.0.113.99", 0)).toBe(false);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await createLeadFrom(forwardedClientOne, `Client one ${attempt}`)).status).toBe(201);
    }

    expect((await createLeadFrom(forwardedClientOne, "Client one limited")).status).toBe(429);
    expect((await createLeadFrom(forwardedClientTwo, "Client two")).status).toBe(201);
  });

  it("sets no-store for Admin responses and blocks unsafe disallowed browser origins", async () => {
    const agent = await authenticatedAgent();
    const loginResponse = await request(app).post("/api/admin/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });
    const adminRead = await agent.get("/api/admin/auth/me");
    const disallowedMutation = await agent
      .post("/api/admin/articles")
      .set("Origin", disallowedOrigin)
      .send(baseArticle);
    const allowedMutation = await agent
      .post("/api/admin/articles")
      .set("Origin", allowedOrigin)
      .send(baseArticle);

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers["cache-control"]).toBe("no-store");
    expect(adminRead.headers["cache-control"]).toBe("no-store");
    expect(disallowedMutation.status).toBe(403);
    expect(disallowedMutation.body).toEqual({
      success: false,
      error: { message: "Origin is not allowed for admin requests" }
    });
    expect(allowedMutation.status).toBe(201);
  });

  it("creates a fresh session token for each successful login and retains safe session indexes", async () => {
    await provisionAdmin({ email: adminEmail, password: adminPassword });
    const firstLogin = await request(app).post("/api/admin/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });
    const secondLogin = await request(app).post("/api/admin/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });
    const firstToken = extractCookieValue(firstLogin.headers["set-cookie"]?.[0] ?? "");
    const secondToken = extractCookieValue(secondLogin.headers["set-cookie"]?.[0] ?? "");
    const indexes = await AdminSessionModel.collection.indexes();

    expect(firstLogin.status).toBe(200);
    expect(secondLogin.status).toBe(200);
    expect(firstToken).not.toBe(secondToken);
    expect(await AdminSessionModel.countDocuments()).toBe(2);
    expect(await AdminSessionModel.exists({ tokenHash: firstToken })).toBeNull();
    expect(await AdminSessionModel.exists({ tokenHash: createHash("sha256").update(firstToken).digest("hex") })).not.toBeNull();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { adminId: 1 } }),
        expect.objectContaining({ key: { tokenHash: 1 }, unique: true }),
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })
      ])
    );
    expect(adminSessionCookieName).toBe("dr_nareman_admin_session");
    expect(firstLogin.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(firstLogin.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(firstLogin.headers["set-cookie"]?.[0]).toContain("Path=/api/admin");
  });

  it("rejects malformed and operator-shaped input without exposing internals", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle(baseArticle);
    const arrayQuery = await request(app).get("/api/articles?page=1&page=2");
    const operatorQuery = await agent.get("/api/admin/articles?status[$ne]=draft");
    const objectLogin = await request(app).post("/api/admin/auth/login").send({
      email: { $ne: "" },
      password: adminPassword
    });
    const unexpectedArticleProperty = await agent
      .patch(`/api/admin/articles/${article.id}`)
      .send({ unexpected: "value" });
    const malformedJson = await request(app)
      .post("/api/admin/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');
    const unknownRoute = await request(app).get("/api/unknown");

    expect(arrayQuery.status).toBe(400);
    expect(operatorQuery.status).toBe(400);
    expect(objectLogin.status).toBe(400);
    expect(unexpectedArticleProperty.status).toBe(400);
    expect(malformedJson.status).toBe(400);
    expect(malformedJson.body).toEqual({
      success: false,
      error: { message: "Malformed JSON request body" }
    });
    expect(JSON.stringify(malformedJson.body)).not.toMatch(/syntaxerror|stack|mongoose/i);
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body).toEqual({ success: false, error: { message: "Route not found" } });
  });

  it("enforces a controlled JSON limit while allowing the validated long-form Article boundary", async () => {
    const agent = await authenticatedAgent();
    const oversizedJson = await request(app)
      .post("/api/admin/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: adminEmail, password: "x".repeat(300_000) });
    const maximumDomainContent = "😀".repeat(25_000);
    const articleResponse = await agent.post("/api/admin/articles").send({
      ...baseArticle,
      title: "Maximum body article",
      content: maximumDomainContent
    });

    expect(oversizedJson.status).toBe(413);
    expect(oversizedJson.body).toEqual({ success: false, error: { message: "Request body is too large" } });
    expect(articleResponse.status).toBe(201);
  });

  it("keeps draft privacy and static media traversal boundaries intact", async () => {
    const draft = await createArticle({ ...baseArticle, title: "Private draft" });
    const published = await createArticle({ ...baseArticle, title: "Public article", status: "published" });
    const publicList = await request(app).get("/api/articles");
    const draftDetail = await request(app).get(`/api/articles/${draft.slug}`);
    const unknownDetail = await request(app).get("/api/articles/does-not-exist");
    const staticTraversal = await request(app).get("/uploads/articles/%2e%2e%2fpackage.json");

    expect(publicList.status).toBe(200);
    expect(publicList.body.pagination.total).toBe(1);
    expect(publicList.body.items[0].id).toBe(published.id);
    expect(draftDetail.status).toBe(404);
    expect(draftDetail.body).toEqual(unknownDetail.body);
    expect(staticTraversal.status).not.toBe(200);
    expect(JSON.stringify(staticTraversal.body)).not.toContain("dr-nareman-backend");
  });

  it("rejects malformed ObjectIds without passing a CastError to clients", async () => {
    const agent = await authenticatedAgent();
    const response = await agent.get("/api/admin/articles/not-an-object-id");

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toMatch(/casterror|mongoose/i);
    expect(new Types.ObjectId().toString()).toHaveLength(24);
  });
});

import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import request, { type SuperAgentTest } from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";
import { LeadModel } from "../src/modules/leads/lead.model.js";
import { leadCreateRateLimiter } from "../src/modules/leads/lead.rateLimit.js";

let mongoMemoryServer: MongoMemoryServer | undefined;
const adminEmail = "lead-editor@example.com";
const adminPassword = "correct horse battery staple";

function leadInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "مراجعة تجريبية",
    phone: "+20 (010) 123-4567",
    source: "ovulation_calculator",
    privacyNoticeAccepted: true,
    marketingConsent: false,
    ...overrides
  };
}

async function authenticatedAgent(): Promise<SuperAgentTest> {
  await provisionAdmin({ email: adminEmail, password: adminPassword });
  const agent = request.agent(app);
  expect((await agent.post("/api/admin/auth/login").send({ email: adminEmail, password: adminPassword })).status).toBe(200);
  return agent;
}

async function createPublicLead(overrides: Record<string, unknown> = {}) {
  return request(app).post("/api/leads").send(leadInput(overrides));
}

function resetLeadRateLimit(): void {
  leadCreateRateLimiter.resetKey("::ffff:127.0.0.1");
  leadCreateRateLimiter.resetKey("::1");
  leadCreateRateLimiter.resetKey("127.0.0.1");
}

describe("marketing lead API", () => {
  beforeAll(async () => {
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await connectDatabase(mongoMemoryServer.getUri());
    await Promise.all([AdminModel.init(), AdminSessionModel.init(), LeadModel.init()]);
  });

  afterEach(async () => {
    await Promise.all([AdminModel.deleteMany({}), AdminSessionModel.deleteMany({}), LeadModel.deleteMany({})]);
    resetLeadRateLimit();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
  });

  it("creates a minimal public response with server-authoritative timestamps and normalized phone", async () => {
    const response = await createPublicLead({
      phone: "+٢٠ (٠١٠) ١٢٣-٤٥٦٧",
      email: " Lead@Example.com ",
      attribution: {
        utmSource: "instagram",
        utmCampaign: "spring",
        landingPath: "/ovulation-calculator",
        referrerHost: "WWW.Instagram.COM",
        clickIds: { gclid: "campaign-click" }
      }
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true, lead: { id: expect.any(String) } });
    const lead = await LeadModel.findById(response.body.lead.id).lean();
    expect(lead).toMatchObject({
      contact: { phone: "+200101234567", email: "lead@example.com" },
      source: "ovulation_calculator",
      marketingConsent: false,
      marketingConsentAt: null,
      status: "new",
      attribution: { landingPath: "/ovulation-calculator", referrerHost: "www.instagram.com" }
    });
    expect(lead?.privacyNoticeAcceptedAt).toBeInstanceOf(Date);
    expect(lead).not.toHaveProperty("diagnosis");
  });

  it("requires privacy notice acceptance and rejects health, client timestamp, and arbitrary-field injection", async () => {
    const invalidInputs = [
      { privacyNoticeAccepted: false }, { privacyNoticeAcceptedAt: "2020-01-01" }, { question: "private question" },
      { diagnosis: "private diagnosis" }, { pregnancyStatus: "private status" },
      { attribution: { landingPath: "https://example.com/path" } }, { attribution: { landingPath: "/calculator?secret=1" } },
      { attribution: { referrerHost: "https://example.com/path" } }, { phone: "++20101234567" }
    ];
    for (const invalidInput of invalidInputs) {
      expect((await createPublicLead(invalidInput)).status).toBe(400);
      resetLeadRateLimit();
    }
    expect(await LeadModel.countDocuments()).toBe(0);
  });

  it("records marketing consent only when explicitly true and preserves strict schema boundaries", async () => {
    const response = await createPublicLead({ marketingConsent: true, source: "weekly_live", region: "الرياض", city: "الرياض" });
    expect(response.status).toBe(201);
    const lead = await LeadModel.findById(response.body.lead.id).lean();
    expect(lead?.marketingConsentAt).toBeInstanceOf(Date);
    expect(lead?.privacyNoticeAcceptedAt).toBeInstanceOf(Date);
    await expect(LeadModel.create({
      contact: { name: "Test", phone: "+20101234567" }, source: "weekly_live", privacyNoticeAcceptedAt: new Date(), marketingConsent: false, status: "new", treatment: "must fail"
    })).rejects.toThrow();
  });

  it("accepts normal local and international phone forms, rejects unsafe forms, and rate-limits anonymous capture", async () => {
    const validPhones = ["050 123-4567", "+966 (50) 123 4567"];
    for (const phone of validPhones) {
      expect((await createPublicLead({ phone })).status).toBe(201);
    }
    resetLeadRateLimit();
    for (const phone of ["01A1234567", "++20101234567", "20+101234567", "123456", "+1234567890123456"]) {
      expect((await createPublicLead({ phone })).status).toBe(400);
      resetLeadRateLimit();
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await createPublicLead({ name: `Lead ${attempt}` })).status).toBe(201);
    }
    expect((await createPublicLead({ name: "Rate limited lead" })).status).toBe(429);
  });

  it("requires Admin authentication for management, status updates, deletion, and CSV export", async () => {
    const id = new Types.ObjectId().toString();
    const responses = await Promise.all([
      request(app).get("/api/admin/leads"),
      request(app).get("/api/admin/leads/export.csv"),
      request(app).get(`/api/admin/leads/${id}`),
      request(app).patch(`/api/admin/leads/${id}`).send({ status: "contacted" }),
      request(app).delete(`/api/admin/leads/${id}`)
    ]);
    responses.forEach((response) => expect(response.status).toBe(401));
  });

  it("lists, filters, fetches, updates only status, and deletes leads through protected Admin routes", async () => {
    const first = await createPublicLead({ source: "weekly_live", marketingConsent: true, attribution: { utmCampaign: "launch" } });
    const second = await createPublicLead({ source: "ovulation_calculator", marketingConsent: false, attribution: { utmCampaign: "other" } });
    const agent = await authenticatedAgent();
    const list = await agent.get("/api/admin/leads?source=weekly_live&marketingConsent=true&utmCampaign=launch");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: first.body.lead.id, source: "weekly_live", marketingConsent: true, status: "new" });
    expect(list.body.items[0]).not.toHaveProperty("_id");
    expect(list.body.items[0]).not.toHaveProperty("contact.password");

    const detail = await agent.get(`/api/admin/leads/${first.body.lead.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lead.contact.phone).toBe("+200101234567");
    const invalidUpdate = await agent.patch(`/api/admin/leads/${first.body.lead.id}`).send({ status: "qualified", source: "ovulation_calculator" });
    expect(invalidUpdate.status).toBe(400);
    const updated = await agent.patch(`/api/admin/leads/${first.body.lead.id}`).send({ status: "qualified" });
    expect(updated.status).toBe(200);
    expect(updated.body.lead.status).toBe("qualified");
    await LeadModel.collection.updateOne({ _id: new Types.ObjectId(first.body.lead.id) }, { $set: { createdAt: new Date("2020-01-02T00:00:00.000Z") } });
    const statusFiltered = await agent.get("/api/admin/leads?status=qualified");
    expect(statusFiltered.body.items).toHaveLength(1);
    expect(statusFiltered.body.items[0].id).toBe(first.body.lead.id);
    const dateFiltered = await agent.get("/api/admin/leads?dateTo=2020-01-03T00:00:00.000Z");
    expect(dateFiltered.body.items).toHaveLength(1);
    expect(dateFiltered.body.items[0].id).toBe(first.body.lead.id);
    const newestFirst = await agent.get("/api/admin/leads?limit=1&page=1");
    expect(newestFirst.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(newestFirst.body.items[0].id).toBe(second.body.lead.id);
    expect((await agent.delete(`/api/admin/leads/${second.body.lead.id}`)).status).toBe(204);
    expect(await LeadModel.exists({ _id: second.body.lead.id })).toBeNull();
    expect((await agent.get(`/api/admin/leads/${new Types.ObjectId()}`)).status).toBe(404);
    expect((await agent.get("/api/admin/leads/not-an-id")).status).toBe(400);
  });

  it("applies Admin no-store and unsafe-origin protection without exposing public captures to it", async () => {
    const created = await createPublicLead();
    const agent = await authenticatedAgent();
    const list = await agent.get("/api/admin/leads");
    expect(list.headers["cache-control"]).toContain("no-store");
    const blocked = await agent.patch(`/api/admin/leads/${created.body.lead.id}`)
      .set("Origin", "https://untrusted.example")
      .send({ status: "contacted" });
    expect(blocked.status).toBe(403);
  });

  it("exports a bounded UTF-8 BOM CSV with escaped and formula-neutralized cells", async () => {
    await createPublicLead({ name: "=formula, \"quoted\"", attribution: { utmCampaign: "csv" } });
    const agent = await authenticatedAgent();
    const response = await agent.get("/api/admin/leads/export.csv?utmCampaign=csv&limit=1");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("leads-export.csv");
    expect(response.text.startsWith("\uFEFF")).toBe(true);
    expect(response.text).toContain("\"'=formula, \"\"quoted\"\"\"");
    expect(response.text).not.toContain("diagnosis");
    expect((await agent.get("/api/admin/leads/export.csv?limit=1001")).status).toBe(400);
  });
});

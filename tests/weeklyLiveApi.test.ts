import { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request, { type SuperAgentTest } from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";
import { LeadModel } from "../src/modules/leads/lead.model.js";
import { WeeklyLiveModel, WeeklyLiveQuestionModel } from "../src/modules/weeklyLive/weeklyLive.model.js";
import { weeklyLiveQuestionRateLimiter } from "../src/modules/weeklyLive/weeklyLive.rateLimit.js";

let mongoMemoryServer: MongoMemoryServer | undefined;
const adminEmail = "weekly-live-editor@example.com";
const adminPassword = "correct horse battery staple";
const liveInput = {
  title: "جلسة أسئلة أسبوعية",
  scheduledAt: "2026-10-10T17:00:00.000Z",
  meetingUrl: "https://video.example.test/weekly-live",
  isVisible: true,
  acceptingQuestions: true
};
const questionInput = {
  contactName: "سارة للتواصل",
  phone: "٠٥٠ ١٢٣ ٤٥٦٧",
  email: "sara@example.test",
  displayName: "سارة",
  age: 29,
  region: "Riyadh",
  city: "Riyadh",
  question: "ما النصائح العامة للتحضير لموعد متابعة الخصوبة؟",
  consent: true,
  privacyNoticeAccepted: true,
  marketingConsent: false,
  attribution: { utmSource: "paid", utmCampaign: "weekly-october", landingPath: "/weekly-live", clickIds: { fbclid: "safe-click" } }
};
const {
  contactName: _contactName,
  phone: _phone,
  email: _email,
  privacyNoticeAccepted: _privacyNoticeAccepted,
  marketingConsent: _marketingConsent,
  attribution: _attribution,
  consent: _consent,
  ...questionFields
} = questionInput;

function resetQuestionRateLimit(): void {
  ["::ffff:127.0.0.1", "::1", "127.0.0.1"].forEach((key) => weeklyLiveQuestionRateLimiter.resetKey(key));
}

async function authenticatedAgent(): Promise<SuperAgentTest> {
  await provisionAdmin({ email: adminEmail, password: adminPassword });
  const agent = request.agent(app);
  const login = await agent.post("/api/admin/auth/login").send({ email: adminEmail, password: adminPassword });
  expect(login.status).toBe(200);
  return agent;
}

describe("weekly live API", () => {
  beforeAll(async () => {
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await connectDatabase(mongoMemoryServer.getUri());
    await Promise.all([AdminModel.init(), AdminSessionModel.init(), LeadModel.init(), WeeklyLiveModel.init(), WeeklyLiveQuestionModel.init()]);
  });

  afterEach(async () => {
    resetQuestionRateLimit();
    await Promise.all([AdminModel.deleteMany({}), AdminSessionModel.deleteMany({}), LeadModel.deleteMany({}), WeeklyLiveQuestionModel.deleteMany({}), WeeklyLiveModel.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
  });

  it("keeps discovery public-safe and requires admin authentication for management", async () => {
    const [current, adminLives, adminQuestions] = await Promise.all([
      request(app).get("/api/weekly-live/current"),
      request(app).get("/api/admin/weekly-live"),
      request(app).get(`/api/admin/weekly-live/${new Types.ObjectId().toString()}/questions`)
    ]);
    expect(current.status).toBe(200);
    expect(current.body).toEqual({ success: true, live: null });
    expect(adminLives.status).toBe(401);
    expect(adminQuestions.status).toBe(401);
  });

  it("validates HTTPS events, applies Riyadh defaults, and keeps only one event visible", async () => {
    const agent = await authenticatedAgent();
    const invalid = await agent.post("/api/admin/weekly-live").send({ ...liveInput, meetingUrl: "http://video.example.test/live" });
    const first = await agent.post("/api/admin/weekly-live").send(liveInput);
    const second = await agent.post("/api/admin/weekly-live").send({ ...liveInput, title: "Weekly live two", scheduledAt: "2026-10-17T17:00:00.000Z" });
    const updated = await agent.patch(`/api/admin/weekly-live/${first.body.live.id}`).send({ title: "Updated weekly live" });
    const page = await agent.get("/api/admin/weekly-live?page=2&limit=1");
    const firstStored = await WeeklyLiveModel.findById(first.body.live.id).lean();

    expect(invalid.status).toBe(400);
    expect(first.status).toBe(201);
    expect(first.body.live).toMatchObject({ timezone: "Asia/Riyadh", isVisible: true });
    expect(first.body.live.scheduledAt).toBe(liveInput.scheduledAt);
    expect(second.status).toBe(201);
    expect(updated.body.live.title).toBe("Updated weekly live");
    expect(page.body.pagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(firstStored?.isVisible).toBe(false);
    expect(await WeeklyLiveModel.countDocuments({ isVisible: true })).toBe(1);
  });

  it("stores a consented question only for an eligible event and releases its link after persistence", async () => {
    const live = await WeeklyLiveModel.create({ ...liveInput, timezone: "Asia/Riyadh" });
    const current = await request(app).get("/api/weekly-live/current");
    const submission = await request(app).post(`/api/weekly-live/${live.id}/questions`).send(questionInput);
    const stored = await WeeklyLiveQuestionModel.findById(submission.body.submissionId).lean();
    const lead = stored?.leadId ? await LeadModel.findById(stored.leadId).lean() : null;

    expect(current.status).toBe(200);
    expect(current.body.live).toMatchObject({ id: live.id, title: liveInput.title, acceptingQuestions: true });
    expect(JSON.stringify(current.body)).not.toContain("meetingUrl");
    expect(JSON.stringify(current.body)).not.toContain("questions");
    expect(submission.status).toBe(201);
    expect(submission.body.joinUrl).toBe(liveInput.meetingUrl);
    expect(stored).toMatchObject({ weeklyLiveId: live._id, status: "new", privacyNoticeVersion: "weekly-live-v1" });
    expect(stored?.consentAt).toBeInstanceOf(Date);
    expect(stored).not.toHaveProperty("meetingUrl");
    expect(lead).toMatchObject({ source: "weekly_live", marketingConsent: false, marketingConsentAt: null, contact: { name: questionInput.contactName, phone: "0501234567", email: questionInput.email }, location: { region: questionInput.region, city: questionInput.city } });
    expect(lead?.attribution).toMatchObject({ utmSource: "paid", utmCampaign: "weekly-october", landingPath: "/weekly-live", clickIds: { fbclid: "safe-click" } });
    expect(lead).not.toHaveProperty("age");
    expect(lead).not.toHaveProperty("question");
    expect(lead).not.toHaveProperty("moderatedQuestion");
  });

  it("does not release a join URL when question persistence fails", async () => {
    const live = await WeeklyLiveModel.create({ ...liveInput, timezone: "Asia/Riyadh" });
    const createFailure = vi.spyOn(WeeklyLiveQuestionModel, "create").mockRejectedValueOnce(new Error("test persistence failure"));
    const response = await request(app).post(`/api/weekly-live/${live.id}/questions`).send(questionInput);
    createFailure.mockRestore();

    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("joinUrl");
    expect(response.body.error.message).toBe("Internal server error");
    expect(await LeadModel.countDocuments({})).toBe(0);
  });

  it("rejects missing consent, unsupported data, invalid ages, hidden events, and closed events", async () => {
    const visible = await WeeklyLiveModel.create({ ...liveInput, timezone: "Asia/Riyadh" });
    const hidden = await WeeklyLiveModel.create({ ...liveInput, title: "Hidden", isVisible: false, timezone: "Asia/Riyadh" });
    const closed = await WeeklyLiveModel.create({ ...liveInput, title: "Closed", isVisible: true, acceptingQuestions: false, timezone: "Asia/Riyadh" });
    const missingConsent = await request(app).post(`/api/weekly-live/${visible.id}/questions`).send({ ...questionInput, consent: false });
    resetQuestionRateLimit();
    const unsupported = await request(app).post(`/api/weekly-live/${visible.id}/questions`).send({ ...questionInput, meetingUrl: liveInput.meetingUrl });
    resetQuestionRateLimit();
    const invalidAge = await request(app).post(`/api/weekly-live/${visible.id}/questions`).send({ ...questionInput, age: 17 });
    resetQuestionRateLimit();
    const invalidId = await request(app).post("/api/weekly-live/not-an-id/questions").send(questionInput);
    resetQuestionRateLimit();
    const hiddenResponse = await request(app).post(`/api/weekly-live/${hidden.id}/questions`).send(questionInput);
    resetQuestionRateLimit();
    const closedResponse = await request(app).post(`/api/weekly-live/${closed.id}/questions`).send(questionInput);
    expect(missingConsent.status).toBe(400);
    expect(unsupported.status).toBe(400);
    expect(invalidAge.status).toBe(400);
    expect(invalidId.status).toBe(400);
    expect(hiddenResponse.status).toBe(404);
    expect(closedResponse.status).toBe(409);
    expect(await LeadModel.countDocuments({})).toBe(0);
  });

  it("requires Lead privacy acknowledgement while allowing optional marketing consent", async () => {
    const live = await WeeklyLiveModel.create({ ...liveInput, timezone: "Asia/Riyadh" });
    const rejected = await request(app).post("/api/weekly-live/" + live.id + "/questions").send({ ...questionInput, privacyNoticeAccepted: false });
    resetQuestionRateLimit();
    const accepted = await request(app).post("/api/weekly-live/" + live.id + "/questions").send({ ...questionInput, marketingConsent: true });
    const question = await WeeklyLiveQuestionModel.findById(accepted.body.submissionId).lean();
    const lead = question?.leadId ? await LeadModel.findById(question.leadId).lean() : null;

    expect(rejected.status).toBe(400);
    expect(rejected.body).not.toHaveProperty("joinUrl");
    expect(await WeeklyLiveQuestionModel.countDocuments({})).toBe(1);
    expect(accepted.status).toBe(201);
    expect(accepted.body.joinUrl).toBe(liveInput.meetingUrl);
    expect(lead?.marketingConsent).toBe(true);
    expect(lead?.marketingConsentAt).toBeInstanceOf(Date);
  });

  it("lets an Admin paginate, filter, moderate, and delete without rewriting the original question", async () => {
    const live = await WeeklyLiveModel.create({ ...liveInput, timezone: "Asia/Riyadh" });
    const first = await WeeklyLiveQuestionModel.create({ weeklyLiveId: live._id, ...questionFields, status: "new", consentAt: new Date(), privacyNoticeVersion: "weekly-live-v1" });
    await WeeklyLiveQuestionModel.create({ weeklyLiveId: live._id, ...questionFields, displayName: "منى", age: 35, region: "Makkah", city: "Jeddah", question: "هذا نص مختلف لسؤال متابعة الخصوبة في الجلسة العامة.", status: "selected", consentAt: new Date(), privacyNoticeVersion: "weekly-live-v1" });
    const agent = await authenticatedAgent();
    const list = await agent.get(`/api/admin/weekly-live/${live.id}/questions?status=new&region=Riyadh&city=Riyadh&minAge=20&maxAge=30&dateFrom=2020-01-01T00%3A00%3A00.000Z&dateTo=2030-01-01T00%3A00%3A00.000Z&search=${encodeURIComponent("سارة")}`);
    const update = await agent.patch(`/api/admin/weekly-live/questions/${first.id}`).send({ status: "answered", moderatedQuestion: "صياغة عامة منزوعة الهوية للسؤال." });
    const clear = await agent.patch(`/api/admin/weekly-live/questions/${first.id}`).send({ moderatedQuestion: null });
    const rewrite = await agent.patch(`/api/admin/weekly-live/questions/${first.id}`).send({ question: "rewrite" });
    const detail = await agent.get(`/api/admin/weekly-live/questions/${first.id}`);
    const rejectedOrigin = await agent.patch(`/api/admin/weekly-live/${live.id}`).set("Origin", "https://untrusted.example").send({ title: "Blocked" });
    const deleted = await agent.delete(`/api/admin/weekly-live/questions/${first.id}`);

    expect(list.status).toBe(200);
    expect(list.body.pagination.total).toBe(1);
    expect(update.body.question).toMatchObject({ status: "answered", moderatedQuestion: "صياغة عامة منزوعة الهوية للسؤال." });
    expect(clear.body.question.moderatedQuestion).toBeNull();
    expect(rewrite.status).toBe(400);
    expect(detail.body.question.question).toBe(questionInput.question);
    expect(rejectedOrigin.status).toBe(403);
    expect(rejectedOrigin.headers["cache-control"]).toContain("no-store");
    expect(deleted.status).toBe(204);
    expect(await WeeklyLiveModel.exists({ _id: live._id })).not.toBeNull();
  });

  it("rate limits public question attempts to five per fifteen minutes", async () => {
    const liveId = new Types.ObjectId().toString();
    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(await request(app).post(`/api/weekly-live/${liveId}/questions`).send(questionInput));
    }
    expect(attempts.slice(0, 5).every((response) => response.status === 404)).toBe(true);
    expect(attempts[5].status).toBe(429);
  });
});

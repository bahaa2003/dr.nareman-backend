import { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request, { type SuperAgentTest } from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";
import { ArticleModel } from "../src/modules/articles/article.model.js";
import { createArticle } from "../src/modules/articles/article.service.js";

let mongoMemoryServer: MongoMemoryServer | undefined;

const adminEmail = "editor@example.com";
const adminPassword = "correct horse battery staple";
const baseArticle = {
  title: "Fertility Guide",
  excerpt: "A concise fertility guide for patients.",
  content: "Full Markdown-compatible article content for patients.",
  category: "Fertility"
};

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

async function setUpdatedAt(articleId: string, date: Date): Promise<void> {
  await ArticleModel.updateOne({ _id: articleId }, { updatedAt: date }, { timestamps: false });
}

describe("admin article API", () => {
  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
  });

  it("requires an authenticated Admin session for every article route", async () => {
    const articleId = new Types.ObjectId().toString();
    const responses = await Promise.all([
      request(app).get("/api/admin/articles"),
      request(app).get(`/api/admin/articles/${articleId}`),
      request(app).post("/api/admin/articles").send(baseArticle),
      request(app).patch(`/api/admin/articles/${articleId}`).send({ title: "Updated" }),
      request(app).delete(`/api/admin/articles/${articleId}`)
    ]);

    responses.forEach((response) => expect(response.status).toBe(401));
  });

  it("lists drafts and published articles with pagination, filters, safe search, and no content", async () => {
    const draft = await createArticle({ ...baseArticle, title: "Draft fertility article" });
    const published = await createArticle({ ...baseArticle, title: "Published IVF article", status: "published", category: "IVF" });
    const literalSearch = await createArticle({
      ...baseArticle,
      title: "Literal Fertility.* article",
      category: "IVF"
    });
    await setUpdatedAt(draft.id, new Date("2025-01-01T00:00:00.000Z"));
    await setUpdatedAt(published.id, new Date("2025-02-01T00:00:00.000Z"));
    await setUpdatedAt(literalSearch.id, new Date("2025-03-01T00:00:00.000Z"));
    const agent = await authenticatedAgent();

    const defaultList = await agent.get("/api/admin/articles");
    const customPage = await agent.get("/api/admin/articles?page=2&limit=1");
    const statusFilter = await agent.get("/api/admin/articles?status=published");
    const categoryFilter = await agent.get("/api/admin/articles?category=%20IVF%20");
    const safeSearch = await agent.get("/api/admin/articles").query({ search: "Fertility.*" });
    const maximumLimit = await agent.get("/api/admin/articles?limit=100");
    const invalidPage = await agent.get("/api/admin/articles?page=0");
    const invalidLimit = await agent.get("/api/admin/articles?limit=101");
    const invalidStatus = await agent.get("/api/admin/articles?status=archived");

    expect(defaultList.status).toBe(200);
    expect(defaultList.body.pagination).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(defaultList.body.items.map((article: { title: string }) => article.title)).toEqual([
      "Literal Fertility.* article",
      "Published IVF article",
      "Draft fertility article"
    ]);
    expect(defaultList.body.items[0]).not.toHaveProperty("content");
    expect(defaultList.body.items[0]).not.toHaveProperty("_id");
    expect(customPage.status).toBe(200);
    expect(customPage.body.pagination).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });
    expect(statusFilter.body.items).toHaveLength(1);
    expect(statusFilter.body.items[0].status).toBe("published");
    expect(categoryFilter.body.pagination.total).toBe(2);
    expect(safeSearch.body.items.map((article: { title: string }) => article.title)).toEqual([
      "Literal Fertility.* article"
    ]);
    expect(maximumLimit.status).toBe(200);
    expect(maximumLimit.body.pagination.limit).toBe(100);
    expect(invalidPage.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
    expect(invalidStatus.status).toBe(400);
  });

  it("returns both draft and published detail safely and validates article ids", async () => {
    const draft = await createArticle(baseArticle);
    const published = await createArticle({ ...baseArticle, title: "Published article", status: "published" });
    const agent = await authenticatedAgent();

    const draftResponse = await agent.get(`/api/admin/articles/${draft.id}`);
    const publishedResponse = await agent.get(`/api/admin/articles/${published.id}`);
    const malformedId = await agent.get("/api/admin/articles/not-an-object-id");
    const missingId = await agent.get(`/api/admin/articles/${new Types.ObjectId().toString()}`);

    expect(draftResponse.status).toBe(200);
    expect(draftResponse.body.article).toMatchObject({ id: draft.id, status: "draft", content: baseArticle.content });
    expect(publishedResponse.status).toBe(200);
    expect(publishedResponse.body.article.status).toBe("published");
    expect(draftResponse.body.article).not.toHaveProperty("_id");
    expect(draftResponse.body.article).not.toHaveProperty("__v");
    expect(malformedId.status).toBe(400);
    expect(missingId.status).toBe(404);
  });

  it("creates draft and published articles through the domain service with safe slug behavior", async () => {
    const agent = await authenticatedAgent();
    const draftResponse = await agent.post("/api/admin/articles").send(baseArticle);
    const publishedResponse = await agent.post("/api/admin/articles").send({
      ...baseArticle,
      title: "متابعة التبويض خطوة بخطوة",
      status: "published"
    });
    const explicitSlugResponse = await agent.post("/api/admin/articles").send({
      ...baseArticle,
      title: "Explicit slug article",
      slug: "  Custom Article Slug!  "
    });
    const duplicateResponse = await agent.post("/api/admin/articles").send({
      ...baseArticle,
      title: "Duplicate explicit slug",
      slug: "custom-article-slug"
    });
    const invalidResponse = await agent.post("/api/admin/articles").send({ title: "Incomplete" });

    expect(draftResponse.status).toBe(201);
    expect(draftResponse.body.article).toMatchObject({ status: "draft", readingTime: 1 });
    expect(publishedResponse.status).toBe(201);
    expect(publishedResponse.body.article).toMatchObject({
      status: "published",
      slug: "متابعة-التبويض-خطوة-بخطوة",
      publishedAt: expect.any(String)
    });
    expect(explicitSlugResponse.status).toBe(201);
    expect(explicitSlugResponse.body.article.slug).toBe("custom-article-slug");
    expect(duplicateResponse.status).toBe(409);
    expect(invalidResponse.status).toBe(400);
  });

  it("updates articles through the domain lifecycle and preserves slugs unless explicitly changed", async () => {
    const article = await createArticle(baseArticle);
    const agent = await authenticatedAgent();
    const titleUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({ title: "Updated title" });
    const slugUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({ slug: "Updated Custom Slug!" });
    const longContent = Array.from({ length: 201 }, () => "word").join(" ");
    const contentUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({ content: longContent });
    const publishedUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({ status: "published" });
    const unpublishedUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({ status: "draft" });
    const emptyUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({});
    const malformedId = await agent.patch("/api/admin/articles/not-an-object-id").send({ title: "Updated" });
    const missingId = await agent
      .patch(`/api/admin/articles/${new Types.ObjectId().toString()}`)
      .send({ title: "Updated" });

    expect(titleUpdate.status).toBe(200);
    expect(titleUpdate.body.article.slug).toBe(article.slug);
    expect(slugUpdate.body.article.slug).toBe("updated-custom-slug");
    expect(contentUpdate.body.article.readingTime).toBe(2);
    expect(publishedUpdate.body.article).toMatchObject({ status: "published", publishedAt: expect.any(String) });
    expect(unpublishedUpdate.body.article.status).toBe("draft");
    expect(unpublishedUpdate.body.article.publishedAt).toBe(publishedUpdate.body.article.publishedAt);
    expect(emptyUpdate.status).toBe(400);
    expect(malformedId.status).toBe(400);
    expect(missingId.status).toBe(404);
  });

  it("clears optional SEO fields with null while preserving omitted SEO fields", async () => {
    const agent = await authenticatedAgent();
    const createResponse = await agent.post("/api/admin/articles").send({
      ...baseArticle,
      title: "SEO clearing article",
      seoTitle: "Existing SEO title",
      seoDescription: "Existing SEO description"
    });
    const articleId = createResponse.body.article.id as string;

    const clearTitle = await agent.patch(`/api/admin/articles/${articleId}`).send({ seoTitle: null });
    const omitSeoFields = await agent.patch(`/api/admin/articles/${articleId}`).send({
      excerpt: "Updated excerpt while preserving SEO description."
    });
    const clearDescription = await agent.patch(`/api/admin/articles/${articleId}`).send({ seoDescription: null });
    const oversizedTitle = await agent.patch(`/api/admin/articles/${articleId}`).send({ seoTitle: "x".repeat(71) });
    const oversizedDescription = await agent
      .patch(`/api/admin/articles/${articleId}`)
      .send({ seoDescription: "x".repeat(171) });

    expect(createResponse.status).toBe(201);
    expect(clearTitle.status).toBe(200);
    expect(clearTitle.body.article).toMatchObject({
      seoTitle: null,
      seoDescription: "Existing SEO description"
    });
    expect(omitSeoFields.status).toBe(200);
    expect(omitSeoFields.body.article).toMatchObject({
      seoTitle: null,
      seoDescription: "Existing SEO description"
    });
    expect(clearDescription.status).toBe(200);
    expect(clearDescription.body.article).toMatchObject({ seoTitle: null, seoDescription: null });
    expect(oversizedTitle.status).toBe(400);
    expect(oversizedDescription.status).toBe(400);
  });

  it("hard-deletes the article document without a media cleanup attempt", async () => {
    const article = await createArticle(baseArticle);
    const agent = await authenticatedAgent();
    const deleteResponse = await agent.delete(`/api/admin/articles/${article.id}`);
    const fetchDeletedResponse = await agent.get(`/api/admin/articles/${article.id}`);
    const malformedId = await agent.delete("/api/admin/articles/not-an-object-id");
    const missingId = await agent.delete(`/api/admin/articles/${new Types.ObjectId().toString()}`);

    expect(deleteResponse.status).toBe(204);
    expect(fetchDeletedResponse.status).toBe(404);
    expect(malformedId.status).toBe(400);
    expect(missingId.status).toBe(404);
  });
});

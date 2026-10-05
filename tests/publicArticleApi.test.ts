import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { ArticleModel } from "../src/modules/articles/article.model.js";
import { createArticle } from "../src/modules/articles/article.service.js";

let mongoMemoryServer: MongoMemoryServer | undefined;

const baseArticle = {
  title: "Fertility Guide",
  excerpt: "A concise fertility guide for patients.",
  content: "Full Markdown-compatible article content for patients.",
  category: "Fertility"
};

async function createPublishedArticle(overrides: Record<string, unknown> = {}) {
  return createArticle({ ...baseArticle, status: "published", ...overrides });
}

async function setPublishedAt(articleId: string, date: Date): Promise<void> {
  await ArticleModel.updateOne({ _id: articleId }, { publishedAt: date });
}

describe("public article API", () => {
  beforeAll(async () => {
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await connectDatabase(mongoMemoryServer.getUri());
    await ArticleModel.init();
  });

  afterEach(async () => {
    await ArticleModel.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
  });

  it("lists only published articles, newest first, without content or persistence internals", async () => {
    const older = await createPublishedArticle({ title: "Older article" });
    const newer = await createPublishedArticle({ title: "Newer article" });
    await createArticle({ ...baseArticle, title: "Private draft" });
    await setPublishedAt(older.id, new Date("2025-01-01T00:00:00.000Z"));
    await setPublishedAt(newer.id, new Date("2025-02-01T00:00:00.000Z"));

    const response = await request(app).get("/api/articles");

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
    expect(response.body.items.map((article: { title: string }) => article.title)).toEqual([
      "Newer article",
      "Older article"
    ]);
    expect(response.body.items[0]).not.toHaveProperty("content");
    expect(response.body.items[0]).not.toHaveProperty("_id");
    expect(response.body.items[0]).not.toHaveProperty("__v");
  });

  it("supports validated pagination and correct pagination metadata", async () => {
    const first = await createPublishedArticle({ title: "First article" });
    const second = await createPublishedArticle({ title: "Second article" });
    const third = await createPublishedArticle({ title: "Third article" });
    await setPublishedAt(first.id, new Date("2025-01-01T00:00:00.000Z"));
    await setPublishedAt(second.id, new Date("2025-02-01T00:00:00.000Z"));
    await setPublishedAt(third.id, new Date("2025-03-01T00:00:00.000Z"));

    const customPage = await request(app).get("/api/articles?page=2&limit=1");
    const maximumLimit = await request(app).get("/api/articles?limit=50");
    const invalidPage = await request(app).get("/api/articles?page=0");
    const invalidLimit = await request(app).get("/api/articles?limit=51");

    expect(customPage.status).toBe(200);
    expect(customPage.body.pagination).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });
    expect(customPage.body.items).toHaveLength(1);
    expect(maximumLimit.status).toBe(200);
    expect(maximumLimit.body.pagination.limit).toBe(50);
    expect(invalidPage.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
  });

  it("filters by a trimmed exact category while keeping drafts private", async () => {
    await createPublishedArticle({ title: "IVF article", category: "IVF" });
    await createPublishedArticle({ title: "Pregnancy article", category: "Pregnancy" });
    await createArticle({ ...baseArticle, title: "Draft IVF article", category: "IVF" });

    const response = await request(app).get("/api/articles?category=%20IVF%20");

    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ title: "IVF article", category: "IVF" });
  });

  it("returns published details, including content, for English, Arabic, and mixed-language slugs", async () => {
    const englishArticle = await createPublishedArticle();
    const arabicArticle = await createPublishedArticle({ title: "متابعة التبويض خطوة بخطوة" });
    const mixedArticle = await createPublishedArticle({ title: "الفرق بين IVF و ICSI" });

    const englishResponse = await request(app).get(`/api/articles/${englishArticle.slug}`);
    const arabicResponse = await request(app).get(`/api/articles/${encodeURIComponent(arabicArticle.slug)}`);
    const mixedResponse = await request(app).get(`/api/articles/${encodeURIComponent(mixedArticle.slug)}`);

    expect(englishResponse.status).toBe(200);
    expect(englishResponse.body.article.content).toBe(baseArticle.content);
    expect(englishResponse.body.article).not.toHaveProperty("_id");
    expect(englishResponse.body.article).not.toHaveProperty("__v");
    expect(arabicResponse.status).toBe(200);
    expect(arabicResponse.body.article.slug).toBe(arabicArticle.slug);
    expect(mixedResponse.status).toBe(200);
    expect(mixedResponse.body.article.slug).toBe(mixedArticle.slug);
  });

  it("returns 404 for drafts and unknown slugs, and 400 for malformed percent encoding", async () => {
    const draft = await createArticle({ ...baseArticle, title: "Private article" });
    const draftResponse = await request(app).get(`/api/articles/${draft.slug}`);
    const unknownResponse = await request(app).get("/api/articles/does-not-exist");
    const malformedEncodingResponse = await request(app).get("/api/articles/%E0%A4%A");

    expect(draftResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    expect(malformedEncodingResponse.status).toBe(400);
    expect(draftResponse.body).toEqual(unknownResponse.body);
  });
});

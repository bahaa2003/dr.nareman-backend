import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { ArticleModel } from "../src/modules/articles/article.model.js";
import { createArticle, updateArticle } from "../src/modules/articles/article.service.js";

let mongoMemoryServer: MongoMemoryServer | undefined;

const baseArticle = {
  title: "Fertility Guide",
  excerpt: "A concise fertility guide for patients.",
  content: "This is Markdown-compatible article content for patients.",
  category: "Fertility"
};

async function createBaseArticle(overrides: Record<string, unknown> = {}) {
  return createArticle({ ...baseArticle, ...overrides });
}

describe("article domain", () => {
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

  it("creates normalized drafts with derived reading time and safe serialization", async () => {
    const article = await createBaseArticle({
      title: "  Fertility Guide  ",
      excerpt: "  A concise fertility guide for patients.  ",
      content: "  This is Markdown-compatible article content for patients.  ",
      category: "  Fertility  ",
      coverImage: { url: "/media/guide.jpg", alt: "  Fertility guide cover  " }
    });

    expect(article).toMatchObject({
      title: "Fertility Guide",
      slug: "fertility-guide",
      excerpt: "A concise fertility guide for patients.",
      content: "This is Markdown-compatible article content for patients.",
      category: "Fertility",
      status: "draft",
      publishedAt: null,
      readingTime: 1,
      coverImage: { url: "/media/guide.jpg", alt: "Fertility guide cover" }
    });
    expect(article).toHaveProperty("id");
    expect(article).not.toHaveProperty("_id");
    expect(article).not.toHaveProperty("__v");
  });

  it("generates useful Arabic and mixed Arabic/Latin slugs", async () => {
    const arabicArticle = await createBaseArticle({ title: "متابعة التبويض خطوة بخطوة" });
    const mixedArticle = await createBaseArticle({ title: "الفرق بين IVF و ICSI" });

    expect(arabicArticle.slug).toBe("متابعة-التبويض-خطوة-بخطوة");
    expect(mixedArticle.slug).toBe("الفرق-بين-ivf-و-icsi");
  });

  it("creates readable suffixes for automatic slug collisions and rejects explicit duplicates", async () => {
    const first = await createBaseArticle();
    const second = await createBaseArticle();

    expect(first.slug).toBe("fertility-guide");
    expect(second.slug).toBe("fertility-guide-2");

    await expect(createBaseArticle({ slug: "fertility-guide" })).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it("preserves slugs on title-only updates and normalizes explicitly supplied replacements", async () => {
    const article = await createBaseArticle();
    const titleUpdated = await updateArticle(article.id, { title: "A New Fertility Guide" });
    const slugUpdated = await updateArticle(article.id, { slug: "  New Custom Slug!  " });

    expect(titleUpdated.slug).toBe("fertility-guide");
    expect(slugUpdated.slug).toBe("new-custom-slug");
  });

  it("applies publication lifecycle rules and preserves publication history", async () => {
    const draft = await createBaseArticle();
    const published = await updateArticle(draft.id, { status: "published" });
    const publishedAt = published.publishedAt;
    const edited = await updateArticle(draft.id, { excerpt: "Updated preview text." });
    const unpublished = await updateArticle(draft.id, { status: "draft" });

    expect(published.status).toBe("published");
    expect(publishedAt).not.toBeNull();
    expect(edited.publishedAt).toBe(publishedAt);
    expect(unpublished.status).toBe("draft");
    expect(unpublished.publishedAt).toBe(publishedAt);

    const explicitPublished = await createBaseArticle({ title: "Published on creation", status: "published" });
    expect(explicitPublished.publishedAt).not.toBeNull();
  });

  it("recalculates reading time from content and always returns at least one minute", async () => {
    const article = await createBaseArticle({ content: "short" });
    const longContent = Array.from({ length: 201 }, () => "word").join(" ");
    const updatedArticle = await updateArticle(article.id, { content: longContent });

    expect(article.readingTime).toBe(1);
    expect(updatedArticle.readingTime).toBe(2);
  });

  it("rejects invalid input, empty updates, unsupported properties, and invalid statuses", async () => {
    await expect(createArticle({ title: "Missing fields" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createBaseArticle({ seoTitle: "x".repeat(71) })).rejects.toMatchObject({
      statusCode: 400
    });

    const article = await createBaseArticle();
    await expect(updateArticle(article.id, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateArticle(article.id, { readingTime: 10 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateArticle(article.id, { status: "scheduled" })).rejects.toMatchObject({
      statusCode: 400
    });
  });
});

import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import sharp from "sharp";
import request, { type SuperAgentTest } from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";
import { ArticleModel } from "../src/modules/articles/article.model.js";
import { localMediaStorage } from "../src/modules/media/localMediaStorage.js";
import { TestimonialModel } from "../src/modules/testimonials/testimonial.model.js";

let mongoMemoryServer: MongoMemoryServer | undefined;
const adminEmail = "testimonial-editor@example.com";
const adminPassword = "correct horse battery staple";

async function authenticatedAgent(): Promise<SuperAgentTest> {
  await provisionAdmin({ email: adminEmail, password: adminPassword });
  const agent = request.agent(app);
  expect((await agent.post("/api/admin/auth/login").send({ email: adminEmail, password: adminPassword })).status).toBe(200);
  return agent;
}

async function makeImage(format: "jpeg" | "png" | "webp", width = 72, height = 128): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 50, g: 110, b: 170 } } }).toFormat(format).toBuffer();
}

async function upload(agent: SuperAgentTest, format: "jpeg" | "png" | "webp" = "jpeg") {
  return agent.post("/api/admin/testimonials")
    .field("alt", "رسالة شكر من إحدى المراجعات")
    .field("privacyConfirmed", "true")
    .field("publicationApproved", "true")
    .attach("image", await makeImage(format), `private-name.${format === "jpeg" ? "jpg" : format}`);
}

function testimonialPath(url: string): string {
  return join(localMediaStorage.testimonialDirectory, basename(url));
}

describe("testimonial screenshot API", () => {
  beforeAll(async () => {
    await rm(env.uploadRootDir, { recursive: true, force: true });
    await localMediaStorage.initialize();
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await connectDatabase(mongoMemoryServer.getUri());
    await Promise.all([AdminModel.init(), AdminSessionModel.init(), TestimonialModel.init(), ArticleModel.init()]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([AdminModel.deleteMany({}), AdminSessionModel.deleteMany({}), TestimonialModel.deleteMany({})]);
    await rm(localMediaStorage.testimonialDirectory, { recursive: true, force: true });
    await localMediaStorage.initialize();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
    await rm(env.uploadRootDir, { recursive: true, force: true });
  });

  it("requires Admin authentication for all mutation and management routes", async () => {
    const id = new Types.ObjectId().toString();
    const image = await makeImage("jpeg");
    const responses = await Promise.all([
      request(app).get("/api/admin/testimonials"),
      request(app).post("/api/admin/testimonials").field("alt", "Alt").attach("image", image, "a.jpg"),
      request(app).patch(`/api/admin/testimonials/${id}`).send({ isVisible: true }),
      request(app).put(`/api/admin/testimonials/${id}/image`).field("alt", "Alt").attach("image", image, "a.jpg"),
      request(app).delete(`/api/admin/testimonials/${id}`)
    ]);
    responses.forEach((response) => expect(response.status).toBe(401));
  });

  it("accepts JPEG, PNG, and WebP, creates hidden records, and strips metadata into generated WebP", async () => {
    const agent = await authenticatedAgent();
    for (const format of ["jpeg", "png", "webp"] as const) {
      const response = await upload(agent, format);
      expect(response.status).toBe(201);
      expect(response.body.testimonial).toMatchObject({ isVisible: false, image: { alt: "رسالة شكر من إحدى المراجعات" } });
      expect(response.body.testimonial.image.url).toMatch(/^\/uploads\/testimonials\/[0-9a-f-]{36}\.webp$/);
      expect(response.body.testimonial.image.url).not.toContain("private-name");
      expect(response.body.testimonial).not.toHaveProperty("_id");
      expect(response.body.testimonial).not.toHaveProperty("image.path");
      expect(await sharp(await readFile(testimonialPath(response.body.testimonial.image.url))).metadata()).toMatchObject({ format: "webp" });
    }
  });

  it("requires both explicit attestations before writing any media and rejects invalid image uploads", async () => {
    const agent = await authenticatedAgent();
    const image = await makeImage("jpeg");
    const responses = [
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("publicationApproved", "true").attach("image", image, "a.jpg"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "false").field("publicationApproved", "true").attach("image", image, "a.jpg"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "false").attach("image", image, "a.jpg"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("image", Buffer.from("not an image"), "fake.jpg"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("image", Buffer.from("<svg></svg>"), "vector.svg"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "true").field("privacyConfirmedAt", "2020-01-01").attach("image", image, "a.jpg"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "true"),
      await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("unexpected", image, "a.jpg")
    ];
    responses.forEach((response) => expect([400, 415]).toContain(response.status));
    expect(await TestimonialModel.countDocuments()).toBe(0);
    expect(await readdir(localMediaStorage.testimonialDirectory)).toEqual([]);
  });

  it("does not retain source EXIF metadata", async () => {
    const agent = await authenticatedAgent();
    const source = await sharp({ create: { width: 72, height: 128, channels: 3, background: "#336699" } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "private source metadata" } } })
      .toBuffer();
    const response = await agent.post("/api/admin/testimonials")
      .field("alt", "رسالة شكر من إحدى المراجعات")
      .field("privacyConfirmed", "true")
      .field("publicationApproved", "true")
      .attach("image", source, "screenshot.jpg");

    expect(response.status).toBe(201);
    const metadata = await sharp(await readFile(testimonialPath(response.body.testimonial.image.url))).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("enforces file, metadata, visibility, ordering, and minimal-public-DTO boundaries", async () => {
    const agent = await authenticatedAgent();
    const first = await upload(agent, "jpeg");
    const second = await upload(agent, "png");
    const firstId = first.body.testimonial.id as string;
    const secondId = second.body.testimonial.id as string;
    const oversized = await agent.post("/api/admin/testimonials").field("alt", "Alt").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), "large.jpg");
    const injected = await agent.patch(`/api/admin/testimonials/${firstId}`).send({ "image.url": "/uploads/articles/x.webp" });
    const blankAlt = await agent.patch(`/api/admin/testimonials/${firstId}`).send({ alt: "  " });
    const longAlt = await agent.patch(`/api/admin/testimonials/${firstId}`).send({ alt: "x".repeat(161) });
    await agent.patch(`/api/admin/testimonials/${firstId}`).send({ sortOrder: 10, isVisible: true });
    await agent.patch(`/api/admin/testimonials/${secondId}`).send({ sortOrder: 1, isVisible: true });
    const visible = await request(app).get("/api/testimonials?limit=1");

    expect(oversized.status).toBe(413);
    expect(injected.status).toBe(400);
    expect(blankAlt.status).toBe(400);
    expect(longAlt.status).toBe(400);
    expect(visible.status).toBe(200);
    expect(visible.body.items).toHaveLength(1);
    expect(visible.body.items[0].id).toBe(secondId);
    expect(visible.body.items[0]).toEqual({ id: secondId, image: expect.any(Object) });
    expect(visible.body.items[0]).not.toHaveProperty("privacyConfirmedAt");
    expect(visible.body.items[0]).not.toHaveProperty("sortOrder");
  });

  it("replaces only after confirmations, preserves safe visibility, and cleans the previous file after persistence", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const id = created.body.testimonial.id as string;
    const oldUrl = created.body.testimonial.image.url as string;
    await agent.patch(`/api/admin/testimonials/${id}`).send({ isVisible: true });
    const missingAttestation = await agent.put(`/api/admin/testimonials/${id}/image`).field("alt", "Replacement").field("privacyConfirmed", "true").attach("image", await makeImage("png"), "replacement.png");
    const replacement = await agent.put(`/api/admin/testimonials/${id}/image`).field("alt", "Replacement").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("image", await makeImage("png"), "replacement.png");

    expect(missingAttestation.status).toBe(400);
    expect(replacement.status).toBe(200);
    expect(replacement.body.testimonial.isVisible).toBe(true);
    expect(replacement.body.testimonial.image.url).not.toBe(oldUrl);
    await expect(stat(testimonialPath(oldUrl))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(testimonialPath(replacement.body.testimonial.image.url))).resolves.toBeDefined();
  });

  it("does not permit a malformed stored record to be made visible", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const id = created.body.testimonial.id as string;
    await TestimonialModel.collection.updateOne({ _id: new Types.ObjectId(id) }, { $unset: { privacyConfirmedAt: "" } });
    const response = await agent.patch(`/api/admin/testimonials/${id}`).send({ isVisible: true });

    expect(response.status).toBe(400);
    expect((await TestimonialModel.findById(id))?.isVisible).toBe(false);
  });

  it("removes newly written replacement media when database persistence fails", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const id = created.body.testimonial.id as string;
    const oldUrl = created.body.testimonial.image.url as string;
    vi.spyOn(TestimonialModel.prototype, "save").mockRejectedValueOnce(new Error("database unavailable"));
    const response = await agent.put(`/api/admin/testimonials/${id}/image`).field("alt", "Replacement").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("image", await makeImage("png"), "replacement.png");

    expect(response.status).toBe(500);
    expect((await TestimonialModel.findById(id))?.image.url).toBe(oldUrl);
    expect(await readdir(localMediaStorage.testimonialDirectory)).toEqual([basename(oldUrl)]);
  });

  it("keeps the successful database reference when old-file cleanup fails", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const id = created.body.testimonial.id as string;
    const oldUrl = created.body.testimonial.image.url as string;
    vi.spyOn(localMediaStorage, "deleteTestimonial").mockRejectedValueOnce(new Error("cleanup unavailable"));
    const response = await agent.put(`/api/admin/testimonials/${id}/image`).field("alt", "Replacement").field("privacyConfirmed", "true").field("publicationApproved", "true").attach("image", await makeImage("png"), "replacement.png");

    expect(response.status).toBe(200);
    expect(response.body.testimonial.image.url).not.toBe(oldUrl);
    expect((await TestimonialModel.findById(id))?.image.url).toBe(response.body.testimonial.image.url);
    await expect(stat(testimonialPath(oldUrl))).resolves.toBeDefined();
  });

  it("serves only the testimonial namespace as immutable WebP without directory listing or traversal", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const url = created.body.testimonial.image.url as string;
    const articleMedia = await localMediaStorage.saveArticleCover(await makeImage("jpeg"));
    const [served, directory, traversal, articleServed] = await Promise.all([
      request(app).get(url),
      request(app).get("/uploads/testimonials/"),
      request(app).get("/uploads/testimonials/%2e%2e%2farticles/" + basename(articleMedia.url)),
      request(app).get(articleMedia.url)
    ]);

    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toContain("image/webp");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect(served.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(directory.status).not.toBe(200);
    expect(traversal.status).not.toBe(200);
    expect(articleServed.status).toBe(200);
    await localMediaStorage.deleteArticleCover(articleMedia.url);
  });

  it("deletes the record before best-effort media cleanup and never deletes outside its namespace", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const id = created.body.testimonial.id as string;
    const url = created.body.testimonial.image.url as string;
    const deletion = await agent.delete(`/api/admin/testimonials/${id}`);
    expect(deletion.status).toBe(204);
    expect(await TestimonialModel.exists({ _id: id })).toBeNull();
    await expect(stat(testimonialPath(url))).rejects.toMatchObject({ code: "ENOENT" });
    const unrelatedArticleFile = join(localMediaStorage.articleDirectory, "unrelated.txt");
    await writeFile(unrelatedArticleFile, "must remain");
    await localMediaStorage.deleteTestimonial("/uploads/testimonials/../../package.json");
    await localMediaStorage.deleteTestimonial("https://example.test/file.webp");
    await localMediaStorage.deleteTestimonial("/uploads/articles/00000000-0000-0000-0000-000000000000.webp");
    await expect(readFile(unrelatedArticleFile, "utf8")).resolves.toBe("must remain");
  });

  it("does not resurrect a deleted record when media cleanup fails", async () => {
    const agent = await authenticatedAgent();
    const created = await upload(agent);
    const id = created.body.testimonial.id as string;
    const url = created.body.testimonial.image.url as string;
    vi.spyOn(localMediaStorage, "deleteTestimonial").mockRejectedValueOnce(new Error("cleanup unavailable"));
    const response = await agent.delete(`/api/admin/testimonials/${id}`);

    expect(response.status).toBe(204);
    expect(await TestimonialModel.exists({ _id: id })).toBeNull();
    await expect(stat(testimonialPath(url))).resolves.toBeDefined();
  });
});

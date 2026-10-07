import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import sharp from "sharp";
import request, { type SuperAgentTest } from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { AdminModel } from "../src/modules/adminAuth/admin.model.js";
import { provisionAdmin } from "../src/modules/adminAuth/adminAuth.service.js";
import { AdminSessionModel } from "../src/modules/adminAuth/session.model.js";
import { ArticleModel } from "../src/modules/articles/article.model.js";
import { createArticle } from "../src/modules/articles/article.service.js";
import { localMediaStorage } from "../src/modules/media/localMediaStorage.js";
import { articleVideoUploadMaxBytes } from "../src/modules/media/localMediaStorage.js";

let mongoMemoryServer: MongoMemoryServer | undefined;

const adminEmail = "media-editor@example.com";
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

async function makeImage(format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 80, g: 120, b: 180 }
    }
  })
    .toFormat(format)
    .toBuffer();
}

function coverFilePath(url: string): string {
  return join(localMediaStorage.articleDirectory, basename(url));
}

function videoFilePath(url: string): string {
  return join(localMediaStorage.articleVideoDirectory, basename(url));
}

function makeMp4(): Buffer {
  const video = Buffer.alloc(16);
  video.writeUInt32BE(16, 0);
  video.write("ftyp", 4, "ascii");
  video.write("isom", 8, "ascii");
  return video;
}

function makeWebm(): Buffer {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
}

async function expectFileMissing(path: string): Promise<void> {
  await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

describe("article cover media API", () => {
  beforeAll(async () => {
    expect(env.NODE_ENV).toBe("test");
    await rm(env.uploadRootDir, { recursive: true, force: true });
    await localMediaStorage.initialize();
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
    await rm(localMediaStorage.articleDirectory, { recursive: true, force: true });
    await localMediaStorage.initialize();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoMemoryServer?.stop();
    await rm(env.uploadRootDir, { recursive: true, force: true });
  });

  it("requires a real Admin session for all cover-image mutation routes", async () => {
    const articleId = new Types.ObjectId().toString();
    const image = await makeImage("jpeg");
    const responses = await Promise.all([
      request(app)
        .put(`/api/admin/articles/${articleId}/cover-image`)
        .field("alt", "Cover image")
        .attach("image", image, "cover.jpg"),
      request(app).patch(`/api/admin/articles/${articleId}/cover-image`).send({ alt: "Cover image" }),
      request(app).delete(`/api/admin/articles/${articleId}/cover-image`),
      request(app).post(`/api/admin/articles/${articleId}/videos`).attach("video", makeMp4(), {
        filename: "video.mp4",
        contentType: "video/mp4"
      }),
      request(app).delete(`/api/admin/articles/${articleId}/videos/${randomUUID()}`)
    ]);

    responses.forEach((response) => expect(response.status).toBe(401));
  });

  it("accepts JPEG, PNG, and WebP input, converts every result to WebP, and never uses the original name", async () => {
    const agent = await authenticatedAgent();
    const formats: Array<"jpeg" | "png" | "webp"> = ["jpeg", "png", "webp"];

    for (const format of formats) {
      const article = await createArticle({ ...baseArticle, title: `Article ${format}` });
      const response = await agent
        .put(`/api/admin/articles/${article.id}/cover-image`)
        .field("alt", `Cover for ${format}`)
        .attach("image", await makeImage(format), `client-provided-name.${format}`);

      expect(response.status).toBe(200);
      expect(response.body.article.coverImage).toMatchObject({
        url: expect.stringMatching(/^\/uploads\/articles\/[0-9a-f-]+\.webp$/),
        alt: `Cover for ${format}`
      });
      expect(response.body.article.coverImage.url).not.toContain("client-provided-name");

      const output = await readFile(coverFilePath(response.body.article.coverImage.url));
      expect((await sharp(output).metadata()).format).toBe("webp");
    }
  });

  it("rejects invalid, corrupt, and unsupported image content without storing media", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle(baseArticle);
    const fakeJpeg = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Fake image")
      .attach("image", Buffer.from("not an image"), "fake.jpg");
    const corruptJpeg = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Corrupt image")
      .attach("image", Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), "corrupt.jpg");
    const svg = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "SVG image")
      .attach("image", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "vector.svg");

    expect(fakeJpeg.status).toBe(415);
    expect(corruptJpeg.status).toBe(415);
    expect(svg.status).toBe(415);
    expect(await ArticleModel.findById(article.id)).toMatchObject({ coverImage: null });
    expect(await readDirectory()).toEqual([]);
  });

  it("enforces upload and field validation limits", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle(baseArticle);
    const oversized = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Large image")
      .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), "large.jpg");
    const missingFile = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Missing image");
    const unexpectedField = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Unexpected field")
      .attach("unexpected", await makeImage("jpeg"), "cover.jpg");
    const emptyAlt = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "   ")
      .attach("image", await makeImage("jpeg"), "cover.jpg");
    const longAlt = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "x".repeat(181))
      .attach("image", await makeImage("jpeg"), "cover.jpg");

    expect(oversized.status).toBe(413);
    expect(missingFile.status).toBe(400);
    expect(unexpectedField.status).toBe(400);
    expect(emptyAlt.status).toBe(400);
    expect(longAlt.status).toBe(400);
  });

  it("validates article ids and missing Articles before media is written", async () => {
    const agent = await authenticatedAgent();
    const image = await makeImage("png");
    const malformedId = await agent
      .put("/api/admin/articles/not-an-object-id/cover-image")
      .field("alt", "Cover image")
      .attach("image", image, "cover.png");
    const missingId = await agent
      .put(`/api/admin/articles/${new Types.ObjectId().toString()}/cover-image`)
      .field("alt", "Cover image")
      .attach("image", image, "cover.png");

    expect(malformedId.status).toBe(400);
    expect(missingId.status).toBe(404);
    expect(await readDirectory()).toEqual([]);
  });

  it("serves uploaded images safely with immutable cache behavior and media-specific CORP", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle(baseArticle);
    const upload = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Cover image")
      .attach("image", await makeImage("png"), "cover.png");
    const url = upload.body.article.coverImage.url as string;

    const served = await request(app).get(url);

    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toContain("image/webp");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect(served.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("replaces covers after the new reference is saved and removes the prior managed file", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle(baseArticle);
    const first = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "First cover")
      .attach("image", await makeImage("jpeg"), "first.jpg");
    const firstUrl = first.body.article.coverImage.url as string;
    const firstPath = coverFilePath(firstUrl);
    const second = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Second cover")
      .attach("image", await makeImage("png"), "second.png");
    const secondUrl = second.body.article.coverImage.url as string;

    expect(second.status).toBe(200);
    expect(secondUrl).not.toBe(firstUrl);
    await expectFileMissing(firstPath);
    await expect(stat(coverFilePath(secondUrl))).resolves.toBeDefined();
  });

  it("updates alt text without rewriting media and removes covers idempotently", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle(baseArticle);
    const upload = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Original alt")
      .attach("image", await makeImage("webp"), "cover.webp");
    const url = upload.body.article.coverImage.url as string;
    const updateAlt = await agent
      .patch(`/api/admin/articles/${article.id}/cover-image`)
      .send({ alt: "Updated alt" });
    const remove = await agent.delete(`/api/admin/articles/${article.id}/cover-image`);
    const repeatedRemove = await agent.delete(`/api/admin/articles/${article.id}/cover-image`);
    const noCoverArticle = await createArticle({ ...baseArticle, title: "No cover article" });
    const missingCoverAlt = await agent
      .patch(`/api/admin/articles/${noCoverArticle.id}/cover-image`)
      .send({ alt: "Updated alt" });

    expect(updateAlt.status).toBe(200);
    expect(updateAlt.body.article.coverImage).toEqual({ url, alt: "Updated alt" });
    expect(remove.status).toBe(200);
    expect(remove.body.article.coverImage).toBeNull();
    await expectFileMissing(coverFilePath(url));
    expect(repeatedRemove.status).toBe(200);
    expect(repeatedRemove.body.article.coverImage).toBeNull();
    expect(missingCoverAlt.status).toBe(404);
  });

  it("cleans owned media after Article deletion and rejects direct JSON cover injection", async () => {
    const agent = await authenticatedAgent();
    const directCreate = await agent.post("/api/admin/articles").send({
      ...baseArticle,
      coverImage: { url: "/uploads/articles/not-managed.webp", alt: "Injected" }
    });
    const article = await createArticle(baseArticle);
    const directUpdate = await agent.patch(`/api/admin/articles/${article.id}`).send({
      coverImage: { url: "/uploads/articles/not-managed.webp", alt: "Injected" }
    });
    const upload = await agent
      .put(`/api/admin/articles/${article.id}/cover-image`)
      .field("alt", "Cover image")
      .attach("image", await makeImage("jpeg"), "cover.jpg");
    const coverPath = coverFilePath(upload.body.article.coverImage.url as string);
    const deletion = await agent.delete(`/api/admin/articles/${article.id}`);

    expect(directCreate.status).toBe(400);
    expect(directUpdate.status).toBe(400);
    expect(deletion.status).toBe(204);
    await expectFileMissing(coverPath);
  });

  it("cannot delete arbitrary paths through managed cover deletion", async () => {
    const externalDirectory = await mkdtemp(join(tmpdir(), "dr-nareman-media-path-safety-"));
    const externalFile = join(externalDirectory, "important.txt");
    await writeFile(externalFile, "must remain");

    await localMediaStorage.deleteArticleCover("/uploads/articles/../../important.txt");
    await localMediaStorage.deleteArticleCover("https://example.com/cover.webp");

    await expect(readFile(externalFile, "utf8")).resolves.toBe("must remain");
    await rm(externalDirectory, { recursive: true, force: true });
  });

  it("accepts signature-validated videos with generated managed URLs and serves byte ranges", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle({ ...baseArticle, title: "Article video", status: "published" });
    const upload = await agent
      .post(`/api/admin/articles/${article.id}/videos`)
      .attach("video", makeMp4(), { filename: "client supplied name.mp4", contentType: "video/mp4" });

    expect(upload.status).toBe(201);
    expect(upload.body.article.videos).toHaveLength(1);
    expect(upload.body.article.videos[0]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      url: expect.stringMatching(/^\/uploads\/articles\/videos\/[0-9a-f-]{36}\.mp4$/),
      originalName: "client supplied name.mp4",
      mimeType: "video/mp4",
      sizeBytes: 16,
      createdAt: expect.any(String)
    });
    expect(upload.body.article.videos[0]).not.toHaveProperty("path");
    await expect(stat(videoFilePath(upload.body.article.videos[0].url))).resolves.toBeDefined();

    const webmUpload = await agent
      .post(`/api/admin/articles/${article.id}/videos`)
      .attach("video", makeWebm(), { filename: "second.webm", contentType: "video/webm" });
    expect(webmUpload.status).toBe(201);
    expect(webmUpload.body.article.videos[1]).toMatchObject({ mimeType: "video/webm" });

    const ranged = await request(app).get(upload.body.article.videos[0].url).set("Range", "bytes=0-3");
    expect(ranged.status).toBe(206);
    expect(ranged.headers["content-range"]).toBe("bytes 0-3/16");
    expect(ranged.headers["content-type"]).toContain("video/mp4");

    const publicArticle = await request(app).get(`/api/articles/${article.slug}`);
    expect(publicArticle.status).toBe(200);
    expect(publicArticle.body.article.videos[0]).toMatchObject({ url: upload.body.article.videos[0].url });
    expect(JSON.stringify(publicArticle.body.article.videos[0])).not.toContain(localMediaStorage.articleDirectory);
  });

  it("rejects unsupported video content, keeps the exact 1 GiB limit, and leaves no temporary file", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle({ ...baseArticle, title: "Rejected video" });
    const rejected = await agent
      .post(`/api/admin/articles/${article.id}/videos`)
      .attach("video", Buffer.from("not a video"), { filename: "fake.mp4", contentType: "video/mp4" });

    expect(articleVideoUploadMaxBytes).toBe(1_073_741_824);
    expect(rejected.status).toBe(415);
    expect((await ArticleModel.findById(article.id))?.videos).toEqual([]);
    expect(await readdir(localMediaStorage.articleVideoTemporaryDirectory)).toEqual([]);
  });

  it("removes a video from the Article and disk, and cleans all videos when the Article is deleted", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle({ ...baseArticle, title: "Video cleanup" });
    const firstUpload = await agent
      .post(`/api/admin/articles/${article.id}/videos`)
      .attach("video", makeMp4(), { filename: "first.mp4", contentType: "video/mp4" });
    const first = firstUpload.body.article.videos[0] as { id: string; url: string };
    const firstPath = videoFilePath(first.url);
    const removal = await agent.delete(`/api/admin/articles/${article.id}/videos/${first.id}`);

    expect(removal.status).toBe(200);
    expect(removal.body.article.videos).toEqual([]);
    await expectFileMissing(firstPath);

    const secondUpload = await agent
      .post(`/api/admin/articles/${article.id}/videos`)
      .attach("video", makeMp4(), { filename: "second.mp4", contentType: "video/mp4" });
    const second = secondUpload.body.article.videos[0] as { url: string };
    const secondPath = videoFilePath(second.url);
    const deletion = await agent.delete(`/api/admin/articles/${article.id}`);

    expect(deletion.status).toBe(204);
    await expectFileMissing(secondPath);
  });

  it("removes a newly promoted video if Article persistence fails", async () => {
    const agent = await authenticatedAgent();
    const article = await createArticle({ ...baseArticle, title: "Video persistence failure" });
    const saveSpy = vi.spyOn(ArticleModel.prototype, "save").mockRejectedValueOnce(new Error("database unavailable"));

    try {
      const upload = await agent
        .post(`/api/admin/articles/${article.id}/videos`)
        .attach("video", makeMp4(), { filename: "will-be-cleaned.mp4", contentType: "video/mp4" });

      expect(upload.status).toBe(500);
      expect(await readdir(localMediaStorage.articleVideoDirectory)).toEqual([".tmp"]);
    } finally {
      saveSpy.mockRestore();
    }
  });
});

async function readDirectory(): Promise<string[]> {
  try {
    return (await readdir(localMediaStorage.articleDirectory)).filter((entry) => entry !== "videos");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

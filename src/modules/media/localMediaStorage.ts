import { randomUUID } from "node:crypto";
import { access, link, mkdir, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import sharp from "sharp";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/AppError.js";

const articleCoverDirectoryName = "articles";
const testimonialDirectoryName = "testimonials";
const maxInputPixels = 40_000_000;
const maxCoverDimension = 1_920;
// Screenshots often contain small text. This permits a legible phone screenshot
// without accepting an unbounded rendered image.
const maxTestimonialDimension = 2_560;
const webpQuality = 82;
const managedArticleCoverUrlPattern =
  /^\/uploads\/articles\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)$/i;
const managedTestimonialUrlPattern =
  /^\/uploads\/testimonials\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)$/i;
const allowedInputFormats = new Set(["jpeg", "png", "webp"]);

export const articleCoverUploadMaxBytes = 5 * 1024 * 1024;

export function isManagedTestimonialUrl(url: string): boolean {
  return managedTestimonialUrlPattern.test(url);
}

export interface StoredMedia {
  url: string;
}

export interface MediaStorage {
  initialize(): Promise<void>;
  saveArticleCover(input: Buffer): Promise<StoredMedia>;
  deleteArticleCover(url: string): Promise<void>;
  saveTestimonial(input: Buffer): Promise<StoredMedia>;
  deleteTestimonial(url: string): Promise<void>;
  hasTestimonial(url: string): Promise<boolean>;
}

export class LocalMediaStorage implements MediaStorage {
  public readonly articleDirectory: string;
  public readonly testimonialDirectory: string;

  constructor(private readonly rootDirectory: string) {
    if (!isAbsolute(rootDirectory)) {
      throw new Error("Local media storage root must be absolute");
    }

    this.articleDirectory = resolve(rootDirectory, articleCoverDirectoryName);
    this.testimonialDirectory = resolve(rootDirectory, testimonialDirectoryName);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.articleDirectory, { recursive: true }),
      mkdir(this.testimonialDirectory, { recursive: true })
    ]);
    await Promise.all([
      access(this.articleDirectory, constants.R_OK | constants.W_OK),
      access(this.testimonialDirectory, constants.R_OK | constants.W_OK)
    ]);
  }

  async saveArticleCover(input: Buffer): Promise<StoredMedia> {
    const processedImage = await processArticleCover(input);
    const filename = `${randomUUID()}.webp`;
    const destinationPath = this.resolveArticlePath(filename);
    const temporaryPath = this.resolveArticlePath(`.${filename}.tmp`);

    try {
      await writeFile(temporaryPath, processedImage, { flag: "wx", mode: 0o644 });
      await link(temporaryPath, destinationPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    await unlink(temporaryPath).catch(() => undefined);

    return { url: `/uploads/articles/${filename}` };
  }

  async deleteArticleCover(url: string): Promise<void> {
    const filePath = this.resolveManagedArticleCoverPath(url);

    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return;
      }

      throw error;
    }
  }

  async saveTestimonial(input: Buffer): Promise<StoredMedia> {
    return this.saveProcessedMedia(input, this.testimonialDirectory, maxTestimonialDimension, "testimonials");
  }

  async deleteTestimonial(url: string): Promise<void> {
    const filePath = this.resolveManagedTestimonialPath(url);

    if (!filePath) {
      return;
    }

    await this.deleteFile(filePath);
  }

  async hasTestimonial(url: string): Promise<boolean> {
    const filePath = this.resolveManagedTestimonialPath(url);
    if (!filePath) {
      return false;
    }

    try {
      await access(filePath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  private resolveArticlePath(filename: string): string {
    return this.resolvePathInsideDirectory(this.articleDirectory, filename);
  }

  private resolveTestimonialPath(filename: string): string {
    return this.resolvePathInsideDirectory(this.testimonialDirectory, filename);
  }

  private resolvePathInsideDirectory(directory: string, filename: string): string {
    const destinationPath = resolve(directory, filename);
    const relativePath = relative(directory, destinationPath);

    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Unsafe article media path");
    }

    return destinationPath;
  }

  private resolveManagedArticleCoverPath(url: string): string | null {
    const match = managedArticleCoverUrlPattern.exec(url);

    const filename = match?.[1];

    if (!filename) {
      return null;
    }

    return this.resolveArticlePath(filename);
  }

  private resolveManagedTestimonialPath(url: string): string | null {
    const match = managedTestimonialUrlPattern.exec(url);
    const filename = match?.[1];

    if (!filename) {
      return null;
    }

    return this.resolveTestimonialPath(filename);
  }

  private async saveProcessedMedia(
    input: Buffer,
    directory: string,
    maximumDimension: number,
    urlNamespace: "articles" | "testimonials"
  ): Promise<StoredMedia> {
    const processedImage = await processImage(input, maximumDimension);
    const filename = `${randomUUID()}.webp`;
    const destinationPath = this.resolvePathInsideDirectory(directory, filename);
    const temporaryPath = this.resolvePathInsideDirectory(directory, `.${filename}.tmp`);

    try {
      await writeFile(temporaryPath, processedImage, { flag: "wx", mode: 0o644 });
      await link(temporaryPath, destinationPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    await unlink(temporaryPath).catch(() => undefined);
    return { url: `/uploads/${urlNamespace}/${filename}` };
  }

  private async deleteFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return;
      }

      throw error;
    }
  }
}

export const localMediaStorage = new LocalMediaStorage(env.uploadRootDir);

export async function initializeMediaStorage(): Promise<void> {
  await localMediaStorage.initialize();
}

async function processArticleCover(input: Buffer): Promise<Buffer> {
  return processImage(input, maxCoverDimension);
}

async function processImage(input: Buffer, maximumDimension: number): Promise<Buffer> {
  try {
    const source = sharp(input, { failOn: "error", limitInputPixels: maxInputPixels });
    const metadata = await source.metadata();

    if (!metadata.format || !allowedInputFormats.has(metadata.format)) {
      throw new AppError("Unsupported image format", 415);
    }

    return await sharp(input, { failOn: "error", limitInputPixels: maxInputPixels })
      .rotate()
      .resize({
        width: maximumDimension,
        height: maximumDimension,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: webpQuality })
      .toBuffer();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Invalid or unsupported image", 415);
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

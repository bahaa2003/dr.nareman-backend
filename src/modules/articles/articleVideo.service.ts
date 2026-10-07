import { basename } from "node:path";

import { AppError } from "../../shared/errors/AppError.js";
import { logger } from "../../utils/logger.js";
import { localMediaStorage } from "../media/localMediaStorage.js";
import { ArticleModel } from "./article.model.js";
import { toSafeArticle } from "./article.service.js";
import type { SafeArticle } from "./article.types.js";

export async function addArticleVideo(articleId: string, file: Express.Multer.File): Promise<SafeArticle> {
  let storedVideo: Awaited<ReturnType<typeof localMediaStorage.saveArticleVideo>> | undefined;

  try {
    const article = await findArticle(articleId);
    storedVideo = await localMediaStorage.saveArticleVideo(file.path, file.mimetype);
    article.videos.push({
      id: storedVideo.id,
      url: storedVideo.url,
      originalName: sanitizeOriginalName(file.originalname),
      mimeType: storedVideo.mimeType,
      sizeBytes: storedVideo.sizeBytes,
      createdAt: new Date()
    });
    await article.save();
    return toSafeArticle(article);
  } catch (error) {
    if (storedVideo) {
      await cleanupVideo(storedVideo.url, "video persistence failure");
    } else {
      await localMediaStorage.deleteTemporaryArticleVideo(file.path).catch(() => undefined);
    }
    throw error;
  }
}

export async function removeArticleVideo(articleId: string, videoId: string): Promise<SafeArticle> {
  const article = await findArticle(articleId);
  const video = article.videos.find((candidate) => candidate.id === videoId);

  if (!video) {
    throw new AppError("Article video not found", 404);
  }

  article.videos = article.videos.filter((candidate) => candidate.id !== videoId);
  await article.save();
  await cleanupVideo(video.url, "video removal");

  return toSafeArticle(article);
}

export async function cleanupArticleVideos(videos: Array<{ url: string }>): Promise<void> {
  await Promise.all(videos.map((video) => cleanupVideo(video.url, "article deletion")));
}

async function findArticle(articleId: string) {
  const article = await ArticleModel.findById(articleId);

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  return article;
}

async function cleanupVideo(url: string, operation: string): Promise<void> {
  try {
    await localMediaStorage.deleteArticleVideo(url);
  } catch (error) {
    logger.warn({ errorName: getErrorName(error), operation }, "Failed to clean up article video");
  }
}

function sanitizeOriginalName(value: string): string {
  const filename = basename(value).replace(/[\\/\u0000-\u001f\u007f]/gu, "_").trim();
  return (filename || "video").slice(0, 255);
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

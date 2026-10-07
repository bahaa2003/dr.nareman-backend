import { AppError } from "../../shared/errors/AppError.js";
import { logger } from "../../utils/logger.js";
import { ArticleModel } from "./article.model.js";
import { deleteArticle, toSafeArticle } from "./article.service.js";
import type { SafeArticle } from "./article.types.js";
import { localMediaStorage } from "../media/localMediaStorage.js";
import { cleanupArticleVideos } from "./articleVideo.service.js";

export async function replaceArticleCover(
  articleId: string,
  alt: string,
  imageBuffer: Buffer
): Promise<SafeArticle> {
  const article = await findArticle(articleId);
  const previousUrl = article.coverImage?.url;
  const storedMedia = await localMediaStorage.saveArticleCover(imageBuffer);

  try {
    article.coverImage = { url: storedMedia.url, alt };
    await article.save();
  } catch (error) {
    await cleanupNewMediaAfterFailedPersistence(storedMedia.url);
    throw error;
  }

  if (previousUrl) {
    await cleanupPreviousMedia(previousUrl, "cover replacement");
  }

  return toSafeArticle(article);
}

export async function updateArticleCoverAlt(articleId: string, alt: string): Promise<SafeArticle> {
  const article = await findArticle(articleId);

  if (!article.coverImage) {
    throw new AppError("Article cover image not found", 404);
  }

  article.coverImage = { url: article.coverImage.url, alt };
  await article.save();

  return toSafeArticle(article);
}

export async function removeArticleCover(articleId: string): Promise<SafeArticle> {
  const article = await findArticle(articleId);
  const previousUrl = article.coverImage?.url;

  if (!previousUrl) {
    return toSafeArticle(article);
  }

  article.coverImage = null;
  await article.save();
  await cleanupPreviousMedia(previousUrl, "cover removal");

  return toSafeArticle(article);
}

export async function deleteArticleWithMediaCleanup(articleId: string): Promise<void> {
  const deletedArticle = await deleteArticle(articleId);

  await Promise.all([
    ...(deletedArticle.coverImage?.url
      ? [cleanupPreviousMedia(deletedArticle.coverImage.url, "article deletion")]
      : []),
    cleanupArticleVideos(deletedArticle.videos)
  ]);
}

async function findArticle(articleId: string) {
  const article = await ArticleModel.findById(articleId);

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  return article;
}

async function cleanupNewMediaAfterFailedPersistence(url: string): Promise<void> {
  try {
    await localMediaStorage.deleteArticleCover(url);
  } catch (error) {
    logger.warn({ errorName: getErrorName(error) }, "Failed to clean up newly stored article media");
  }
}

async function cleanupPreviousMedia(url: string, operation: string): Promise<void> {
  try {
    await localMediaStorage.deleteArticleCover(url);
  } catch (error) {
    logger.warn({ errorName: getErrorName(error), operation }, "Failed to clean up article media");
  }
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

import { AppError } from "../../shared/errors/AppError.js";
import { ArticleModel, type ArticleDocument } from "./article.model.js";
import {
  createArticleSchema,
  updateArticleSchema,
  type CreateArticleInput,
  type UpdateArticleInput
} from "./article.schema.js";
import { normalizeSlug } from "./article.slug.js";
import type {
  AdminArticleListInput,
  AdminArticleListItem,
  AdminArticleListResult,
  ArticleListItem,
  ArticlePersistenceShape,
  PublicArticleListInput,
  PublicArticleListResult,
  SafeArticle
} from "./article.types.js";

const wordsPerMinute = 200;
const maxAutomaticSlugAttempts = 20;

export function calculateReadingTime(content: string): number {
  const wordCount = content.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

export function toSafeArticle(article: ArticlePersistenceShape): SafeArticle {
  return {
    id: article._id.toString(),
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    category: article.category,
    status: article.status,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    readingTime: article.readingTime,
    coverImage: article.coverImage
      ? { url: article.coverImage.url, alt: article.coverImage.alt }
      : null,
    seoTitle: article.seoTitle ?? null,
    seoDescription: article.seoDescription ?? null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString()
  };
}

export function toArticleListItem(article: ArticlePersistenceShape): ArticleListItem {
  const safeArticle = toSafeArticle(article);

  if (safeArticle.status !== "published" || safeArticle.publishedAt === null) {
    throw new AppError("Published article data is invalid", 500, false);
  }

  return {
    id: safeArticle.id,
    title: safeArticle.title,
    slug: safeArticle.slug,
    excerpt: safeArticle.excerpt,
    category: safeArticle.category,
    status: "published",
    publishedAt: safeArticle.publishedAt,
    readingTime: safeArticle.readingTime,
    coverImage: safeArticle.coverImage,
    seoTitle: safeArticle.seoTitle,
    seoDescription: safeArticle.seoDescription
  };
}

export function toAdminArticleListItem(article: ArticlePersistenceShape): AdminArticleListItem {
  const { content: _content, ...listItem } = toSafeArticle(article);
  return listItem;
}

export async function createArticle(input: unknown): Promise<SafeArticle> {
  const articleInput = parseCreateArticleInput(input);
  const baseSlug = normalizeSlug(articleInput.slug ?? articleInput.title);
  const hasExplicitSlug = articleInput.slug !== undefined;

  for (let attempt = 0; attempt < maxAutomaticSlugAttempts; attempt += 1) {
    const slug = hasExplicitSlug ? baseSlug : await findAvailableSlug(baseSlug);

    try {
      const articleData = {
        title: articleInput.title,
        slug,
        excerpt: articleInput.excerpt,
        content: articleInput.content,
        category: articleInput.category,
        status: articleInput.status,
        publishedAt: articleInput.status === "published" ? new Date() : null,
        readingTime: calculateReadingTime(articleInput.content),
        coverImage: articleInput.coverImage ?? null,
        ...(articleInput.seoTitle === undefined ? {} : { seoTitle: articleInput.seoTitle }),
        ...(articleInput.seoDescription === undefined
          ? {}
          : { seoDescription: articleInput.seoDescription })
      };
      const article = await ArticleModel.create(articleData);

      return toSafeArticle(article);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      if (hasExplicitSlug) {
        throw new AppError("Slug already exists", 409);
      }
    }
  }

  throw new AppError("Unable to generate a unique slug", 409);
}

export async function getArticleById(id: string): Promise<SafeArticle> {
  const article = await ArticleModel.findById(id);

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  return toSafeArticle(article);
}

export async function listPublishedArticles(
  input: PublicArticleListInput
): Promise<PublicArticleListResult> {
  const filter = {
    status: "published" as const,
    ...(input.category === undefined ? {} : { category: input.category })
  };
  const skip = (input.page - 1) * input.limit;
  const [articles, total] = await Promise.all([
    ArticleModel.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(input.limit)
      .lean<ArticlePersistenceShape[]>(),
    ArticleModel.countDocuments(filter)
  ]);

  return {
    items: articles.map(toArticleListItem),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit)
    }
  };
}

export async function getPublishedArticleBySlug(slug: string): Promise<SafeArticle> {
  const normalizedSlug = normalizeSlug(slug);
  const article = await ArticleModel.findOne({ slug: normalizedSlug, status: "published" })
    .lean<ArticlePersistenceShape | null>();

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  return toSafeArticle(article);
}

export async function listAdminArticles(input: AdminArticleListInput): Promise<AdminArticleListResult> {
  const filter: Record<string, unknown> = {};

  if (input.status !== undefined) {
    filter.status = input.status;
  }
  if (input.category !== undefined) {
    filter.category = input.category;
  }
  if (input.search !== undefined) {
    const searchExpression = new RegExp(escapeRegex(input.search), "i");
    filter.$or = [{ title: searchExpression }, { excerpt: searchExpression }];
  }

  const skip = (input.page - 1) * input.limit;
  const [articles, total] = await Promise.all([
    ArticleModel.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(input.limit)
      .lean<ArticlePersistenceShape[]>(),
    ArticleModel.countDocuments(filter)
  ]);

  return {
    items: articles.map(toAdminArticleListItem),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit)
    }
  };
}

export async function updateArticle(id: string, input: unknown): Promise<SafeArticle> {
  const articleInput = parseUpdateArticleInput(input);
  const article = await ArticleModel.findById(id);

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  applyArticleChanges(article, articleInput);

  if (articleInput.slug !== undefined) {
    article.slug = normalizeSlug(articleInput.slug);
  }

  applyPublicationLifecycle(article, articleInput.status);

  try {
    await article.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("Slug already exists", 409);
    }

    throw error;
  }

  return toSafeArticle(article);
}

export async function deleteArticle(id: string): Promise<SafeArticle> {
  const article = await ArticleModel.findByIdAndDelete(id);

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  return toSafeArticle(article);
}

function parseCreateArticleInput(input: unknown): CreateArticleInput {
  const result = createArticleSchema.safeParse(input);

  if (!result.success) {
    throw new AppError("Invalid article input", 400);
  }

  return result.data;
}

function parseUpdateArticleInput(input: unknown): UpdateArticleInput {
  const result = updateArticleSchema.safeParse(input);

  if (!result.success) {
    throw new AppError("Invalid article update", 400);
  }

  return result.data;
}

function applyArticleChanges(article: ArticleDocument, input: UpdateArticleInput): void {
  if (input.title !== undefined) {
    article.title = input.title;
  }
  if (input.excerpt !== undefined) {
    article.excerpt = input.excerpt;
  }
  if (input.content !== undefined) {
    article.content = input.content;
    article.readingTime = calculateReadingTime(input.content);
  }
  if (input.category !== undefined) {
    article.category = input.category;
  }
  if (input.coverImage !== undefined) {
    article.coverImage = input.coverImage;
  }
  if (input.seoTitle !== undefined) {
    article.seoTitle = input.seoTitle;
  }
  if (input.seoDescription !== undefined) {
    article.seoDescription = input.seoDescription;
  }
}

function applyPublicationLifecycle(article: ArticleDocument, nextStatus: UpdateArticleInput["status"]): void {
  if (nextStatus === undefined) {
    return;
  }

  if (article.status === "draft" && nextStatus === "published" && !article.publishedAt) {
    article.publishedAt = new Date();
  }

  article.status = nextStatus;
}

async function findAvailableSlug(baseSlug: string): Promise<string> {
  for (let suffix = 1; suffix <= maxAutomaticSlugAttempts; suffix += 1) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const existingArticle = await ArticleModel.exists({ slug: candidate });

    if (!existingArticle) {
      return candidate;
    }
  }

  throw new AppError("Unable to generate a unique slug", 409);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import type { Types } from "mongoose";

export const articleStatuses = ["draft", "published"] as const;

export type ArticleStatus = (typeof articleStatuses)[number];

export interface CoverImageReference {
  url: string;
  alt: string;
}

export interface ArticleVideoReference {
  id: string;
  url: string;
  originalName: string;
  mimeType: "video/mp4" | "video/webm";
  sizeBytes: number;
  createdAt: Date;
}

export interface SafeArticleVideoReference extends Omit<ArticleVideoReference, "createdAt"> {
  createdAt: string;
}

export interface Article {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  status: ArticleStatus;
  publishedAt: Date | null;
  readingTime: number;
  coverImage: CoverImageReference | null;
  videos: ArticleVideoReference[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticlePersistenceShape extends Article {
  _id: Types.ObjectId;
}

export interface SafeArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  status: ArticleStatus;
  publishedAt: string | null;
  readingTime: number;
  coverImage: CoverImageReference | null;
  videos: SafeArticleVideoReference[];
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  status: "published";
  publishedAt: string;
  readingTime: number;
  coverImage: CoverImageReference | null;
  videos: SafeArticleVideoReference[];
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface PublicArticleListInput {
  page: number;
  limit: number;
  category?: string | undefined;
}

export interface PublicArticleListResult {
  items: ArticleListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  status: ArticleStatus;
  publishedAt: string | null;
  readingTime: number;
  coverImage: CoverImageReference | null;
  videos: SafeArticleVideoReference[];
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminArticleListInput {
  page: number;
  limit: number;
  status?: ArticleStatus | undefined;
  category?: string | undefined;
  search?: string | undefined;
}

export interface AdminArticleListResult {
  items: AdminArticleListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

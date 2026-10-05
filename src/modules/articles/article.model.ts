import mongoose, { type HydratedDocument, type Model, Schema } from "mongoose";

import { articleStatuses, type Article, type CoverImageReference } from "./article.types.js";

export type ArticleDocument = HydratedDocument<Article>;

const coverImageSchema = new Schema<CoverImageReference>(
  {
    url: {
      type: String,
      required: true,
      trim: true
    },
    alt: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    _id: false,
    id: false
  }
);

const articleSchema = new Schema<Article>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50_000
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    status: {
      type: String,
      required: true,
      enum: articleStatuses,
      default: "draft"
    },
    publishedAt: {
      type: Date,
      default: null
    },
    readingTime: {
      type: Number,
      required: true,
      min: 1
    },
    coverImage: {
      type: coverImageSchema,
      default: null
    },
    seoTitle: {
      type: String,
      trim: true,
      maxlength: 70
    },
    seoDescription: {
      type: String,
      trim: true,
      maxlength: 170
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw"
  }
);

articleSchema.index({ status: 1, publishedAt: -1 });

export const ArticleModel: Model<Article> =
  (mongoose.models.Article as Model<Article> | undefined) ?? mongoose.model<Article>("Article", articleSchema);

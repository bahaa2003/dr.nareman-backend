import { z } from "zod";
import { isValidObjectId } from "mongoose";

import { articleStatuses } from "./article.types.js";

const nonEmptyString = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

const slugInputSchema = z.string().trim().min(1).max(220);

const coverImageUrlSchema = z.string().trim().min(1).max(2_048).refine(
  (value) => {
    if (value.startsWith("/") && !value.startsWith("//")) {
      return true;
    }

    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  },
  { message: "Cover image URL must be an HTTP(S) URL or an application-relative path" }
);

const coverImageSchema = z.strictObject({
  url: coverImageUrlSchema,
  alt: nonEmptyString(180)
});

const createArticleFields = {
  title: nonEmptyString(180),
  slug: slugInputSchema.optional(),
  excerpt: nonEmptyString(320),
  content: nonEmptyString(50_000),
  category: nonEmptyString(80),
  status: z.enum(articleStatuses).default("draft"),
  coverImage: coverImageSchema.nullable().optional(),
  seoTitle: nonEmptyString(70).optional(),
  seoDescription: nonEmptyString(170).optional()
};

export const createArticleSchema = z.strictObject(createArticleFields);

const updateArticleFields = {
  title: createArticleFields.title.optional(),
  slug: slugInputSchema.optional(),
  excerpt: createArticleFields.excerpt.optional(),
  content: createArticleFields.content.optional(),
  category: createArticleFields.category.optional(),
  status: z.enum(articleStatuses).optional(),
  coverImage: coverImageSchema.nullable().optional(),
  seoTitle: nonEmptyString(70).nullable().optional(),
  seoDescription: nonEmptyString(170).nullable().optional()
};

export const updateArticleSchema = z
  .strictObject(updateArticleFields)
  .refine((value) => Object.keys(value).length > 0, { message: "Article update cannot be empty" });

export const adminCreateArticleSchema = createArticleSchema.omit({ coverImage: true });
export const adminUpdateArticleSchema = z
  .strictObject({
    title: updateArticleFields.title,
    slug: updateArticleFields.slug,
    excerpt: updateArticleFields.excerpt,
    content: updateArticleFields.content,
    category: updateArticleFields.category,
    status: updateArticleFields.status,
    seoTitle: updateArticleFields.seoTitle,
    seoDescription: updateArticleFields.seoDescription
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Article update cannot be empty" });

export const coverImageAltSchema = z.strictObject({
  alt: nonEmptyString(180)
});

function positiveIntegerQuery(maximum: number) {
  return z
    .string()
    .regex(/^[1-9]\d*$/, "Must be a positive integer")
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(maximum));
}

export const publicArticleListQuerySchema = z.strictObject({
  page: positiveIntegerQuery(Number.MAX_SAFE_INTEGER).optional().default(1),
  limit: positiveIntegerQuery(50).optional().default(10),
  category: nonEmptyString(80).optional()
});

export const publicArticleSlugParamsSchema = z.strictObject({
  slug: slugInputSchema
});

export const adminArticleListQuerySchema = z.strictObject({
  page: positiveIntegerQuery(Number.MAX_SAFE_INTEGER).optional().default(1),
  limit: positiveIntegerQuery(100).optional().default(20),
  status: z.enum(articleStatuses).optional(),
  category: nonEmptyString(80).optional(),
  search: nonEmptyString(100).optional()
});

const articleIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid article id")
  .refine((value) => isValidObjectId(value), "Invalid article id");

export const articleIdParamsSchema = z.strictObject({
  id: articleIdSchema
});

export const articleVideoParamsSchema = z.strictObject({
  id: articleIdSchema,
  videoId: z.string().uuid("Invalid video id")
});

export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
export type CoverImageAltInput = z.infer<typeof coverImageAltSchema>;
export type PublicArticleListQuery = z.infer<typeof publicArticleListQuerySchema>;
export type PublicArticleSlugParams = z.infer<typeof publicArticleSlugParamsSchema>;
export type AdminArticleListQuery = z.infer<typeof adminArticleListQuerySchema>;
export type ArticleIdParams = z.infer<typeof articleIdParamsSchema>;
export type ArticleVideoParams = z.infer<typeof articleVideoParamsSchema>;

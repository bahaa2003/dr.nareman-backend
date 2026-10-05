import { AppError } from "../../shared/errors/AppError.js";

export function normalizeSlug(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    throw new AppError("Slug must contain at least one letter or number", 400);
  }

  return slug;
}

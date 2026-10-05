import { isValidObjectId } from "mongoose";
import { z } from "zod";

const nonEmptyString = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);
const explicitTrue = z.union([z.literal("true"), z.literal(true)]).transform(() => true);
const positiveIntegerQuery = (maximum: number) =>
  z.string().regex(/^[1-9]\d*$/, "Must be a positive integer").transform(Number).pipe(z.number().int().min(1).max(maximum));

export const testimonialIdParamsSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid testimonial id").refine(isValidObjectId, "Invalid testimonial id")
});

export const testimonialUploadSchema = z.strictObject({
  alt: nonEmptyString(160),
  privacyConfirmed: explicitTrue,
  publicationApproved: explicitTrue
});

export const testimonialUpdateSchema = z
  .strictObject({
    alt: nonEmptyString(160).optional(),
    isVisible: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Testimonial update cannot be empty" });

export const adminTestimonialListQuerySchema = z.strictObject({
  page: positiveIntegerQuery(Number.MAX_SAFE_INTEGER).optional().default(1),
  limit: positiveIntegerQuery(100).optional().default(20),
  isVisible: z.enum(["true", "false"]).transform((value) => value === "true").optional()
});

export const publicTestimonialListQuerySchema = z.strictObject({
  limit: positiveIntegerQuery(30).optional().default(10)
});

export type TestimonialIdParams = z.infer<typeof testimonialIdParamsSchema>;
export type TestimonialUploadInput = z.infer<typeof testimonialUploadSchema>;
export type TestimonialUpdateInput = z.infer<typeof testimonialUpdateSchema>;
export type AdminTestimonialListQuery = z.infer<typeof adminTestimonialListQuerySchema>;
export type PublicTestimonialListQuery = z.infer<typeof publicTestimonialListQuerySchema>;

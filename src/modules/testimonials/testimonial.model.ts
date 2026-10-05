import mongoose, { type HydratedDocument, type Model, Schema } from "mongoose";

import { type Testimonial, type TestimonialImageReference } from "./testimonial.types.js";

export type TestimonialDocument = HydratedDocument<Testimonial>;

const testimonialImageSchema = new Schema<TestimonialImageReference>(
  {
    url: { type: String, required: true, trim: true, match: /^\/uploads\/testimonials\/[0-9a-f-]{36}\.webp$/i },
    alt: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 }
  },
  { _id: false, id: false }
);

const testimonialSchema = new Schema<Testimonial>(
  {
    image: { type: testimonialImageSchema, required: true },
    isVisible: { type: Boolean, required: true, default: false },
    sortOrder: { type: Number, required: true, default: 0, min: 0, max: 1_000_000, validate: { validator: Number.isInteger, message: "sortOrder must be an integer" } },
    privacyConfirmedAt: { type: Date, required: true },
    publicationApprovedAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

testimonialSchema.index({ isVisible: 1, sortOrder: 1, _id: 1 });
testimonialSchema.index({ sortOrder: 1, _id: 1 });

export const TestimonialModel: Model<Testimonial> =
  (mongoose.models.Testimonial as Model<Testimonial> | undefined) ??
  mongoose.model<Testimonial>("Testimonial", testimonialSchema);

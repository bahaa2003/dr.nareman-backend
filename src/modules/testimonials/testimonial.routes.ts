import { Router } from "express";

import { validateBody, validateParams, validateQuery } from "../../middleware/validate.middleware.js";
import { requireAdmin } from "../adminAuth/requireAdmin.middleware.js";
import {
  createAdminTestimonial,
  deleteAdminTestimonial,
  getAdminTestimonialController,
  listAdminTestimonialsController,
  listPublicTestimonialsController,
  replaceAdminTestimonialImage,
  updateAdminTestimonial
} from "./testimonial.controller.js";
import {
  adminTestimonialListQuerySchema,
  publicTestimonialListQuerySchema,
  testimonialIdParamsSchema,
  testimonialUpdateSchema,
  testimonialUploadSchema
} from "./testimonial.schema.js";
import { testimonialImageUpload } from "./testimonial.upload.js";

export const adminTestimonialRouter = Router();
adminTestimonialRouter.use(requireAdmin);
adminTestimonialRouter.get("/", validateQuery(adminTestimonialListQuerySchema), listAdminTestimonialsController);
adminTestimonialRouter.post("/", testimonialImageUpload.single("image"), validateBody(testimonialUploadSchema), createAdminTestimonial);
adminTestimonialRouter.get("/:id", validateParams(testimonialIdParamsSchema), getAdminTestimonialController);
adminTestimonialRouter.patch("/:id", validateParams(testimonialIdParamsSchema), validateBody(testimonialUpdateSchema), updateAdminTestimonial);
adminTestimonialRouter.put("/:id/image", validateParams(testimonialIdParamsSchema), testimonialImageUpload.single("image"), validateBody(testimonialUploadSchema), replaceAdminTestimonialImage);
adminTestimonialRouter.delete("/:id", validateParams(testimonialIdParamsSchema), deleteAdminTestimonial);

export const publicTestimonialRouter = Router();
publicTestimonialRouter.get("/", validateQuery(publicTestimonialListQuerySchema), listPublicTestimonialsController);

import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import type {
  AdminTestimonialListQuery,
  PublicTestimonialListQuery,
  TestimonialIdParams,
  TestimonialUpdateInput,
  TestimonialUploadInput
} from "./testimonial.schema.js";
import {
  createTestimonial,
  deleteTestimonial,
  getAdminTestimonial,
  listAdminTestimonials,
  listPublicTestimonials,
  replaceTestimonialImage,
  updateTestimonial
} from "./testimonial.service.js";

export const createAdminTestimonial: RequestHandler = async (request, response, next) => {
  try {
    if (!request.file) throw new AppError("Image file is required", 400);
    const { alt } = request.body as TestimonialUploadInput;
    const testimonial = await createTestimonial(alt, request.file.buffer);
    response.status(201).json({ success: true, testimonial });
  } catch (error) { next(error); }
};

export const listAdminTestimonialsController: RequestHandler = async (_request, response, next) => {
  try { response.status(200).json({ success: true, ...(await listAdminTestimonials(response.locals.validatedQuery as AdminTestimonialListQuery)) }); }
  catch (error) { next(error); }
};

export const getAdminTestimonialController: RequestHandler = async (_request, response, next) => {
  try { response.status(200).json({ success: true, testimonial: await getAdminTestimonial((response.locals.validatedParams as TestimonialIdParams).id) }); }
  catch (error) { next(error); }
};

export const updateAdminTestimonial: RequestHandler = async (request, response, next) => {
  try { response.status(200).json({ success: true, testimonial: await updateTestimonial((response.locals.validatedParams as TestimonialIdParams).id, request.body as TestimonialUpdateInput) }); }
  catch (error) { next(error); }
};

export const replaceAdminTestimonialImage: RequestHandler = async (request, response, next) => {
  try {
    if (!request.file) throw new AppError("Image file is required", 400);
    const { alt } = request.body as TestimonialUploadInput;
    response.status(200).json({ success: true, testimonial: await replaceTestimonialImage((response.locals.validatedParams as TestimonialIdParams).id, alt, request.file.buffer) });
  } catch (error) { next(error); }
};

export const deleteAdminTestimonial: RequestHandler = async (_request, response, next) => {
  try { await deleteTestimonial((response.locals.validatedParams as TestimonialIdParams).id); response.status(204).send(); }
  catch (error) { next(error); }
};

export const listPublicTestimonialsController: RequestHandler = async (_request, response, next) => {
  try { response.status(200).json({ success: true, items: await listPublicTestimonials(response.locals.validatedQuery as PublicTestimonialListQuery) }); }
  catch (error) { next(error); }
};

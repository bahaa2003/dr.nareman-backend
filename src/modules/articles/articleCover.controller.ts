import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import type { ArticleIdParams, CoverImageAltInput } from "./article.schema.js";
import {
  removeArticleCover,
  replaceArticleCover as replaceArticleCoverMedia,
  updateArticleCoverAlt as updateArticleCoverAltMedia
} from "./articleCover.service.js";

export const replaceArticleCover: RequestHandler = async (request, response, next) => {
  try {
    if (!request.file) {
      throw new AppError("Image file is required", 400);
    }

    const { id } = response.locals.validatedParams as ArticleIdParams;
    const { alt } = request.body as CoverImageAltInput;
    const article = await replaceArticleCoverMedia(id, alt, request.file.buffer);
    response.status(200).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

export const updateArticleCoverAlt: RequestHandler = async (request, response, next) => {
  try {
    const { id } = response.locals.validatedParams as ArticleIdParams;
    const { alt } = request.body as CoverImageAltInput;
    const article = await updateArticleCoverAltMedia(id, alt);
    response.status(200).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

export const deleteArticleCover: RequestHandler = async (_request, response, next) => {
  try {
    const { id } = response.locals.validatedParams as ArticleIdParams;
    const article = await removeArticleCover(id);
    response.status(200).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

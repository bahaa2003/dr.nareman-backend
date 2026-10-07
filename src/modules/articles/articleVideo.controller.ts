import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import type { ArticleIdParams, ArticleVideoParams } from "./article.schema.js";
import { addArticleVideo, removeArticleVideo } from "./articleVideo.service.js";

export const uploadArticleVideo: RequestHandler = async (request, response, next) => {
  try {
    if (!request.file) {
      throw new AppError("Video file is required", 400);
    }

    const { id } = response.locals.validatedParams as ArticleIdParams;
    const article = await addArticleVideo(id, request.file);
    response.status(201).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

export const deleteArticleVideo: RequestHandler = async (_request, response, next) => {
  try {
    const { id, videoId } = response.locals.validatedParams as ArticleVideoParams;
    const article = await removeArticleVideo(id, videoId);
    response.status(200).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

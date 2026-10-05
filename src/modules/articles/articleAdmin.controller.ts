import type { RequestHandler } from "express";

import type {
  AdminArticleListQuery,
  ArticleIdParams,
  CreateArticleInput,
  UpdateArticleInput
} from "./article.schema.js";
import {
  createArticle,
  getArticleById,
  listAdminArticles,
  updateArticle
} from "./article.service.js";
import { deleteArticleWithCoverCleanup } from "./articleCover.service.js";

export const listAdminArticlesController: RequestHandler = async (_request, response, next) => {
  try {
    const result = await listAdminArticles(response.locals.validatedQuery as AdminArticleListQuery);
    response.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const getAdminArticle: RequestHandler = async (_request, response, next) => {
  try {
    const { id } = response.locals.validatedParams as ArticleIdParams;
    const article = await getArticleById(id);
    response.status(200).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

export const createAdminArticle: RequestHandler = async (request, response, next) => {
  try {
    const article = await createArticle(request.body as CreateArticleInput);
    response.status(201).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

export const updateAdminArticle: RequestHandler = async (request, response, next) => {
  try {
    const { id } = response.locals.validatedParams as ArticleIdParams;
    const article = await updateArticle(id, request.body as UpdateArticleInput);
    response.status(200).json({ success: true, article });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminArticle: RequestHandler = async (_request, response, next) => {
  try {
    const { id } = response.locals.validatedParams as ArticleIdParams;
    await deleteArticleWithCoverCleanup(id);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

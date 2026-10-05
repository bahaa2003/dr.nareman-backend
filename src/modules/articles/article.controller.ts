import type { RequestHandler } from "express";

import type { PublicArticleListQuery, PublicArticleSlugParams } from "./article.schema.js";
import { getPublishedArticleBySlug, listPublishedArticles } from "./article.service.js";

export const listPublicArticles: RequestHandler = async (_request, response, next) => {
  try {
    const result = await listPublishedArticles(response.locals.validatedQuery as PublicArticleListQuery);

    response.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicArticle: RequestHandler = async (_request, response, next) => {
  try {
    const { slug } = response.locals.validatedParams as PublicArticleSlugParams;
    const article = await getPublishedArticleBySlug(slug);

    response.status(200).json({
      success: true,
      article
    });
  } catch (error) {
    next(error);
  }
};

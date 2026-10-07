import { Router } from "express";

import { requireAdmin } from "../adminAuth/requireAdmin.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.middleware.js";
import { coverImageUpload } from "./articleCover.upload.js";
import { articleVideoUpload } from "./articleVideo.upload.js";
import {
  deleteArticleCover,
  replaceArticleCover,
  updateArticleCoverAlt
} from "./articleCover.controller.js";
import { deleteArticleVideo, uploadArticleVideo } from "./articleVideo.controller.js";
import {
  createAdminArticle,
  deleteAdminArticle,
  getAdminArticle,
  listAdminArticlesController,
  updateAdminArticle
} from "./articleAdmin.controller.js";
import {
  adminArticleListQuerySchema,
  adminCreateArticleSchema,
  adminUpdateArticleSchema,
  articleIdParamsSchema,
  articleVideoParamsSchema,
  coverImageAltSchema
} from "./article.schema.js";

export const adminArticleRouter = Router();

adminArticleRouter.use(requireAdmin);
adminArticleRouter.get("/", validateQuery(adminArticleListQuerySchema), listAdminArticlesController);
adminArticleRouter.put(
  "/:id/cover-image",
  validateParams(articleIdParamsSchema),
  coverImageUpload.single("image"),
  validateBody(coverImageAltSchema),
  replaceArticleCover
);
adminArticleRouter.post(
  "/:id/videos",
  validateParams(articleIdParamsSchema),
  articleVideoUpload.single("video"),
  uploadArticleVideo
);
adminArticleRouter.delete(
  "/:id/videos/:videoId",
  validateParams(articleVideoParamsSchema),
  deleteArticleVideo
);
adminArticleRouter.patch(
  "/:id/cover-image",
  validateParams(articleIdParamsSchema),
  validateBody(coverImageAltSchema),
  updateArticleCoverAlt
);
adminArticleRouter.delete(
  "/:id/cover-image",
  validateParams(articleIdParamsSchema),
  deleteArticleCover
);
adminArticleRouter.get("/:id", validateParams(articleIdParamsSchema), getAdminArticle);
adminArticleRouter.post("/", validateBody(adminCreateArticleSchema), createAdminArticle);
adminArticleRouter.patch(
  "/:id",
  validateParams(articleIdParamsSchema),
  validateBody(adminUpdateArticleSchema),
  updateAdminArticle
);
adminArticleRouter.delete("/:id", validateParams(articleIdParamsSchema), deleteAdminArticle);

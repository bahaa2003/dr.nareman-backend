import { Router } from "express";

import { validateBody, validateParams, validateQuery } from "../../middleware/validate.middleware.js";
import { requireAdmin } from "../adminAuth/requireAdmin.middleware.js";
import { createWeeklyLiveController, deleteWeeklyLiveQuestionController, getCurrentWeeklyLiveController, getWeeklyLiveController, getWeeklyLiveQuestionController, listWeeklyLiveQuestionsController, listWeeklyLivesController, submitQuestionController, updateWeeklyLiveController, updateWeeklyLiveQuestionController } from "./weeklyLive.controller.js";
import { weeklyLiveQuestionRateLimiter } from "./weeklyLive.rateLimit.js";
import { adminQuestionListQuerySchema, adminQuestionUpdateSchema, adminWeeklyLiveListQuerySchema, createWeeklyLiveSchema, publicQuestionSchema, updateWeeklyLiveSchema, weeklyLiveIdParamsSchema, weeklyLiveQuestionIdParamsSchema } from "./weeklyLive.schema.js";

export const publicWeeklyLiveRouter = Router();
publicWeeklyLiveRouter.get("/current", getCurrentWeeklyLiveController);
publicWeeklyLiveRouter.post("/:id/questions", weeklyLiveQuestionRateLimiter, validateParams(weeklyLiveIdParamsSchema), validateBody(publicQuestionSchema), submitQuestionController);

export const adminWeeklyLiveRouter = Router();
adminWeeklyLiveRouter.use(requireAdmin);
adminWeeklyLiveRouter.get("/", validateQuery(adminWeeklyLiveListQuerySchema), listWeeklyLivesController);
adminWeeklyLiveRouter.post("/", validateBody(createWeeklyLiveSchema), createWeeklyLiveController);
adminWeeklyLiveRouter.get("/questions/:questionId", validateParams(weeklyLiveQuestionIdParamsSchema), getWeeklyLiveQuestionController);
adminWeeklyLiveRouter.patch("/questions/:questionId", validateParams(weeklyLiveQuestionIdParamsSchema), validateBody(adminQuestionUpdateSchema), updateWeeklyLiveQuestionController);
adminWeeklyLiveRouter.delete("/questions/:questionId", validateParams(weeklyLiveQuestionIdParamsSchema), deleteWeeklyLiveQuestionController);
adminWeeklyLiveRouter.get("/:id/questions", validateParams(weeklyLiveIdParamsSchema), validateQuery(adminQuestionListQuerySchema), listWeeklyLiveQuestionsController);
adminWeeklyLiveRouter.get("/:id", validateParams(weeklyLiveIdParamsSchema), getWeeklyLiveController);
adminWeeklyLiveRouter.patch("/:id", validateParams(weeklyLiveIdParamsSchema), validateBody(updateWeeklyLiveSchema), updateWeeklyLiveController);

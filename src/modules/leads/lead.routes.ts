import { Router } from "express";

import { validateBody, validateParams, validateQuery } from "../../middleware/validate.middleware.js";
import { requireAdmin } from "../adminAuth/requireAdmin.middleware.js";
import { createPublicLeadController, deleteAdminLeadController, exportAdminLeadsController, getAdminLeadController, listAdminLeadsController, updateAdminLeadController } from "./lead.controller.js";
import { leadCreateRateLimiter } from "./lead.rateLimit.js";
import { adminLeadExportQuerySchema, adminLeadListQuerySchema, createLeadSchema, leadIdParamsSchema, updateLeadStatusSchema } from "./lead.schema.js";

export const publicLeadRouter = Router();
publicLeadRouter.post("/", leadCreateRateLimiter, validateBody(createLeadSchema), createPublicLeadController);

export const adminLeadRouter = Router();
adminLeadRouter.use(requireAdmin);
adminLeadRouter.get("/", validateQuery(adminLeadListQuerySchema), listAdminLeadsController);
adminLeadRouter.get("/export.csv", validateQuery(adminLeadExportQuerySchema), exportAdminLeadsController);
adminLeadRouter.get("/:id", validateParams(leadIdParamsSchema), getAdminLeadController);
adminLeadRouter.patch("/:id", validateParams(leadIdParamsSchema), validateBody(updateLeadStatusSchema), updateAdminLeadController);
adminLeadRouter.delete("/:id", validateParams(leadIdParamsSchema), deleteAdminLeadController);

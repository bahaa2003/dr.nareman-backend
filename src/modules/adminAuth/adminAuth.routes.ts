import { Router } from "express";

import { validateBody } from "../../middleware/validate.middleware.js";
import { login, logout, me } from "./adminAuth.controller.js";
import { loginRateLimiter } from "./adminAuth.rateLimit.js";
import { loginSchema } from "./adminAuth.schema.js";
import { requireAdmin } from "./requireAdmin.middleware.js";

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", loginRateLimiter, validateBody(loginSchema), login);
adminAuthRouter.post("/logout", logout);
adminAuthRouter.get("/me", requireAdmin, me);

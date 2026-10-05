import type { RequestHandler } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import { AdminModel } from "./admin.model.js";
import { adminSessionCookieName } from "./adminAuth.cookies.js";
import { hashSessionToken, toSafeAdminIdentity } from "./adminAuth.service.js";
import { AdminSessionModel } from "./session.model.js";

const unauthorized = (): AppError => new AppError("Unauthorized", 401);

export const requireAdmin: RequestHandler = async (request, _response, next) => {
  try {
    const sessionToken = request.cookies[adminSessionCookieName];

    if (typeof sessionToken !== "string" || sessionToken.length === 0) {
      next(unauthorized());
      return;
    }

    const session = await AdminSessionModel.findOne({
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: { $gt: new Date() }
    });

    if (!session) {
      next(unauthorized());
      return;
    }

    const admin = await AdminModel.findById(session.adminId).select("_id email isActive");

    if (!admin || !admin.isActive) {
      next(unauthorized());
      return;
    }

    request.admin = toSafeAdminIdentity(admin);
    next();
  } catch (error) {
    next(error);
  }
};

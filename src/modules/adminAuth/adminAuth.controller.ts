import type { RequestHandler } from "express";

import { adminSessionCookieName, getSessionCookieClearOptions, getSessionCookieOptions } from "./adminAuth.cookies.js";
import { authenticateAdmin, revokeSessionByToken } from "./adminAuth.service.js";
import type { LoginInput } from "./adminAuth.schema.js";

export const login: RequestHandler = async (request, response, next) => {
  try {
    const { admin, sessionToken } = await authenticateAdmin(request.body as LoginInput);

    response.cookie(adminSessionCookieName, sessionToken, getSessionCookieOptions());
    response.status(200).json({
      success: true,
      admin
    });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (request, response, next) => {
  try {
    const sessionToken = request.cookies[adminSessionCookieName];

    if (typeof sessionToken === "string" && sessionToken.length > 0) {
      await revokeSessionByToken(sessionToken);
    }

    response.clearCookie(adminSessionCookieName, getSessionCookieClearOptions());
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = (request, response) => {
  response.status(200).json({
    success: true,
    admin: request.admin
  });
};

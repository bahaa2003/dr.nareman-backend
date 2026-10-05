import type { RequestHandler } from "express";

import { env } from "../config/env.js";
import { AppError } from "../shared/errors/AppError.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const adminOriginGuard: RequestHandler = (request, _response, next) => {
  if (!unsafeMethods.has(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");

  if (origin && !env.allowedOrigins.includes(origin)) {
    next(new AppError("Origin is not allowed for admin requests", 403));
    return;
  }

  next();
};

export const adminNoStore: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
};

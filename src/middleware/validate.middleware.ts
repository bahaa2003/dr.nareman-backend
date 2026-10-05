import type { RequestHandler } from "express";
import type { z } from "zod";

import { AppError } from "../shared/errors/AppError.js";

export function validateBody(schema: z.ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      next(new AppError("Invalid request body", 400));
      return;
    }

    request.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodType): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      next(new AppError("Invalid request query", 400));
      return;
    }

    response.locals.validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema: z.ZodType): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      next(new AppError("Invalid request parameters", 400));
      return;
    }

    response.locals.validatedParams = result.data;
    next();
  };
}

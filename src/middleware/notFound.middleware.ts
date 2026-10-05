import type { RequestHandler } from "express";

import { AppError } from "../shared/errors/AppError.js";

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError("Route not found", 404));
};

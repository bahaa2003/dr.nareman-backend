import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import multer from "multer";

import { AppError } from "../shared/errors/AppError.js";
import { logger } from "../utils/logger.js";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const isKnownError = error instanceof AppError && error.isOperational;
  const isInvalidUrlEncoding = error instanceof URIError;
  const isMulterError = error instanceof multer.MulterError;
  const isMalformedJson = hasErrorType(error, "entity.parse.failed");
  const isPayloadTooLarge = hasErrorType(error, "entity.too.large");
  const isMongooseValidationError = error instanceof mongoose.Error.ValidationError;
  const isMongooseCastError = error instanceof mongoose.Error.CastError;
  const isDuplicateKeyError = hasErrorCode(error, 11_000);
  const statusCode = isKnownError
    ? error.statusCode
    : isInvalidUrlEncoding
      ? 400
      : isMalformedJson
        ? 400
        : isPayloadTooLarge
          ? 413
      : isMulterError && error.code === "LIMIT_FILE_SIZE"
        ? 413
        : isMulterError
          ? 400
          : isMongooseValidationError || isMongooseCastError
            ? 400
            : isDuplicateKeyError
              ? 409
              : 500;
  const message = isKnownError
    ? error.message
    : isInvalidUrlEncoding
      ? "Invalid URL encoding"
      : isMalformedJson
        ? "Malformed JSON request body"
        : isPayloadTooLarge
          ? "Request body is too large"
      : isMulterError && error.code === "LIMIT_FILE_SIZE"
        ? request.originalUrl.includes("/videos")
          ? "Video file exceeds the 1 GiB limit"
          : "Image file is too large"
      : isMulterError
          ? request.originalUrl.includes("/videos")
            ? "Invalid video upload"
            : "Invalid image upload"
          : isMongooseValidationError
            ? "Invalid request data"
            : isMongooseCastError
              ? "Invalid request parameter"
              : isDuplicateKeyError
                ? "Resource already exists"
                : "Internal server error";

  if (statusCode >= 500) {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        method: request.method,
        url: request.originalUrl.split("?")[0]
      },
      "Request failed with an unexpected error"
    );
  }

  response.status(statusCode).json({
    success: false,
    error: {
      message
    }
  });
};

function hasErrorType(error: unknown, type: string): boolean {
  return typeof error === "object" && error !== null && "type" in error && error.type === type;
}

function hasErrorCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

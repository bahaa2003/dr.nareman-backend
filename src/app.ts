import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { adminNoStore, adminOriginGuard } from "./middleware/adminSecurity.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";
import { localMediaStorage } from "./modules/media/localMediaStorage.js";
import { apiRouter } from "./routes/index.js";
import { AppError } from "./shared/errors/AppError.js";

export const app = express();

app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(requestLogger);
app.use(helmet());
app.use("/api/admin", adminNoStore, adminOriginGuard);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new AppError("Origin is not allowed by CORS policy", 403));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(
  "/uploads/articles",
  express.static(localMediaStorage.articleDirectory, {
    index: false,
    redirect: false,
    immutable: true,
    maxAge: "1y",
    setHeaders(response) {
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  })
);
app.use(
  "/uploads/testimonials",
  express.static(localMediaStorage.testimonialDirectory, {
    index: false,
    redirect: false,
    immutable: true,
    maxAge: "1y",
    setHeaders(response) {
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  })
);

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

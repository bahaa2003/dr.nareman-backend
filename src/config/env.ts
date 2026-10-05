import "dotenv/config";

import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const defaultDevelopmentOrigins = "http://localhost:3000,http://127.0.0.1:3000";

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    ALLOWED_ORIGINS: z.string().trim().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
    MONGODB_URI: z.string().trim().min(1),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(8_760).default(168),
    UPLOAD_ROOT_DIR: z.string().trim().min(1).optional()
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === "production" && !values.ALLOWED_ORIGINS) {
      context.addIssue({
        code: "custom",
        path: ["ALLOWED_ORIGINS"],
        message: "ALLOWED_ORIGINS must be configured in production."
      });
    }

    if (values.NODE_ENV === "production" && !values.UPLOAD_ROOT_DIR) {
      context.addIssue({
        code: "custom",
        path: ["UPLOAD_ROOT_DIR"],
        message: "UPLOAD_ROOT_DIR must be configured in production."
      });
    }

    if (
      values.NODE_ENV === "production" &&
      values.UPLOAD_ROOT_DIR !== undefined &&
      !isAbsolute(values.UPLOAD_ROOT_DIR)
    ) {
      context.addIssue({
        code: "custom",
        path: ["UPLOAD_ROOT_DIR"],
        message: "UPLOAD_ROOT_DIR must be an absolute path in production."
      });
    }
  })
  .transform((values, context) => {
    const rawOrigins = values.ALLOWED_ORIGINS ?? defaultDevelopmentOrigins;
    const allowedOrigins = rawOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (allowedOrigins.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["ALLOWED_ORIGINS"],
        message: "ALLOWED_ORIGINS must include at least one origin."
      });
    }

    for (const origin of allowedOrigins) {
      if (origin === "*") {
        context.addIssue({
          code: "custom",
          path: ["ALLOWED_ORIGINS"],
          message: "Wildcard CORS origins are not permitted."
        });
        continue;
      }

      try {
        const parsedOrigin = new URL(origin);
        if (!isHttpOrigin(parsedOrigin)) {
          throw new Error("Unsupported protocol");
        }
      } catch {
        context.addIssue({
          code: "custom",
          path: ["ALLOWED_ORIGINS"],
          message: "ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins."
        });
      }
    }

    const uploadRootDir = resolve(values.UPLOAD_ROOT_DIR ?? "./uploads");

    if (values.NODE_ENV === "production" && isPathInside(process.cwd(), uploadRootDir)) {
      context.addIssue({
        code: "custom",
        path: ["UPLOAD_ROOT_DIR"],
        message: "UPLOAD_ROOT_DIR must be outside the application release directory in production."
      });
    }

    return {
      ...values,
      allowedOrigins,
      apiDocsEnabled:
        values.API_DOCS_ENABLED === undefined
          ? values.NODE_ENV !== "production"
          : values.API_DOCS_ENABLED === "true",
      uploadRootDir
    };
  });

function isHttpOrigin(origin: URL): boolean {
  return (origin.protocol === "http:" || origin.protocol === "https:") && origin.pathname === "/";
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

const parsedEnv = rawEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Values are deliberately not logged; validation output only identifies invalid variable names.
  console.error("Invalid environment configuration:", parsedEnv.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;

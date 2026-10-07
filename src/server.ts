import http from "node:http";

import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { initializeMediaStorage } from "./modules/media/localMediaStorage.js";
import { logger } from "./utils/logger.js";

const server = http.createServer(app);

// Node's default request timeout is five minutes, which can end a legitimate
// disk-streamed 1 GiB upload on a slow connection. Keep header and idle
// keep-alive defenses at their conservative defaults; only the total request
// receive window is extended for the upload contract.
server.requestTimeout = 60 * 60 * 1_000;
server.headersTimeout = 60 * 1_000;
server.keepAliveTimeout = 5 * 1_000;

let isShuttingDown = false;

function shutdown(signal: string, exitCode: number): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, "Shutdown started");

  const forceExitTimer = setTimeout(() => {
    logger.error({ signal }, "Forced shutdown after timeout");
    process.exit(exitCode || 1);
  }, 10_000);
  forceExitTimer.unref();

  const completeShutdown = async (serverCloseError?: Error): Promise<void> => {
    clearTimeout(forceExitTimer);

    let finalExitCode = exitCode;

    if (serverCloseError) {
      logger.error({ errorName: serverCloseError.name, signal }, "HTTP server shutdown failed");
      finalExitCode = 1;
    }

    try {
      await disconnectDatabase();
    } catch (error) {
      logger.error({ errorName: getErrorName(error), signal }, "MongoDB disconnect failed");
      finalExitCode = 1;
    }

    logger.info({ signal }, "Shutdown complete");
    process.exit(finalExitCode);
  };

  if (!server.listening) {
    void completeShutdown();
    return;
  }

  server.close((error) => {
    void completeShutdown(error ?? undefined);
  });
}

function handleFatalError(error: unknown, origin: string): void {
  logger.fatal({ errorName: getErrorName(error), origin }, "Fatal process error");
  shutdown(origin, 1);
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

server.on("error", (error) => {
  handleFatalError(error, "http-server");
});

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("uncaughtException", (error) => handleFatalError(error, "uncaughtException"));
process.on("unhandledRejection", (reason) => handleFatalError(reason, "unhandledRejection"));

async function startServer(): Promise<void> {
  try {
    await initializeMediaStorage();
    await connectDatabase();
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "HTTP server listening");
    });
  } catch (error) {
    logger.fatal({ errorName: getErrorName(error) }, "Backend startup failed");

    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      logger.error(
        { errorName: getErrorName(disconnectError) },
        "MongoDB disconnect failed after startup error"
      );
    }

    process.exit(1);
  }
}

void startServer();

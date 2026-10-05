import mongoose from "mongoose";

import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const serverSelectionTimeoutMS = 5_000;
let areConnectionEventsRegistered = false;

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function registerConnectionEvents(): void {
  if (areConnectionEventsRegistered) {
    return;
  }

  areConnectionEventsRegistered = true;
  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connection established");
  });
  mongoose.connection.on("disconnected", () => {
    logger.info("MongoDB connection closed");
  });
  mongoose.connection.on("error", (error: unknown) => {
    logger.error({ errorName: getErrorName(error) }, "MongoDB connection error");
  });
}

export async function connectDatabase(uri = env.MONGODB_URI): Promise<void> {
  registerConnectionEvents();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS
  });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) {
    return;
  }

  await mongoose.disconnect();
}

export function getDatabaseReadiness(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

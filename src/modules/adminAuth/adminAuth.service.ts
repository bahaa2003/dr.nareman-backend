import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/AppError.js";
import { AdminModel } from "./admin.model.js";
import { AdminSessionModel } from "./session.model.js";
import type { LoginInput, ProvisionAdminInput } from "./adminAuth.schema.js";
import type { SafeAdminIdentity } from "./adminAuth.types.js";

const passwordHashingOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const;

const sessionLifetimeMilliseconds = env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1_000;

export class AdminAlreadyExistsError extends Error {
  constructor() {
    super("An Admin with this email already exists");
    this.name = "AdminAlreadyExistsError";
  }
}

export function toSafeAdminIdentity(admin: { _id: Types.ObjectId; email: string }): SafeAdminIdentity {
  return {
    id: admin._id.toString(),
    email: admin.email
  };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordHashingOptions);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function provisionAdmin(input: ProvisionAdminInput): Promise<SafeAdminIdentity> {
  const existingAdmin = await AdminModel.exists({ email: input.email });

  if (existingAdmin) {
    throw new AdminAlreadyExistsError();
  }

  try {
    const passwordHash = await hashPassword(input.password);
    const admin = await AdminModel.create({
      email: input.email,
      passwordHash,
      isActive: true
    });

    return toSafeAdminIdentity(admin);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AdminAlreadyExistsError();
    }

    throw error;
  }
}

export async function authenticateAdmin(input: LoginInput): Promise<{
  admin: SafeAdminIdentity;
  sessionToken: string;
}> {
  const admin = await AdminModel.findOne({ email: input.email, isActive: true }).select("+passwordHash");
  const passwordHash = admin?.passwordHash ?? (await hashPassword("invalid-password"));
  const passwordMatches = await argon2.verify(passwordHash, input.password);

  if (!admin || !passwordMatches) {
    throw new AppError("Invalid email or password", 401);
  }

  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionLifetimeMilliseconds);

  await AdminSessionModel.create({
    adminId: admin._id,
    tokenHash: hashSessionToken(sessionToken),
    expiresAt
  });

  return {
    admin: toSafeAdminIdentity(admin),
    sessionToken
  };
}

export async function revokeSessionByToken(sessionToken: string): Promise<void> {
  await AdminSessionModel.deleteOne({ tokenHash: hashSessionToken(sessionToken) });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11_000;
}

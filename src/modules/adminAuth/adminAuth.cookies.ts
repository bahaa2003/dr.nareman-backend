import type { CookieOptions } from "express";

import { env } from "../../config/env.js";

export const adminSessionCookieName = "dr_nareman_admin_session";

const sessionMaxAgeMilliseconds = env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1_000;

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/admin"
};

export function getSessionCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions,
    maxAge: sessionMaxAgeMilliseconds
  };
}

export function getSessionCookieClearOptions(): CookieOptions {
  return baseCookieOptions;
}

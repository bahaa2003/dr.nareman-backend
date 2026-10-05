import { rateLimit } from "express-rate-limit";

export const leadCreateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many lead submissions. Please try again later." } }
});

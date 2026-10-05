import { rateLimit } from "express-rate-limit";

export const weeklyLiveQuestionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many question submissions. Please try again later." } }
});

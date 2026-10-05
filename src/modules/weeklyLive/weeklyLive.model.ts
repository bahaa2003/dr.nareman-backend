import mongoose, { type Model, Schema } from "mongoose";

import type { WeeklyLive, WeeklyLiveQuestion } from "./weeklyLive.types.js";
import { weeklyLiveQuestionStatuses } from "./weeklyLive.types.js";

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const weeklyLiveSchema = new Schema<WeeklyLive>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    scheduledAt: { type: Date, required: true },
    timezone: { type: String, required: true, enum: ["Asia/Riyadh"], default: "Asia/Riyadh" },
    meetingUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2_048,
      validate: { validator: isHttpsUrl, message: "Meeting URL must be an HTTPS URL" }
    },
    isVisible: { type: Boolean, required: true, default: false },
    acceptingQuestions: { type: Boolean, required: true, default: false }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

weeklyLiveSchema.index({ isVisible: 1, scheduledAt: 1 });

const weeklyLiveQuestionSchema = new Schema<WeeklyLiveQuestion>(
  {
    weeklyLiveId: { type: Schema.Types.ObjectId, required: true, ref: "WeeklyLive", index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", index: true },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    age: { type: Number, required: true, min: 18, max: 100, validate: Number.isInteger },
    region: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    question: { type: String, required: true, trim: true, minlength: 10, maxlength: 2_000 },
    status: { type: String, required: true, enum: weeklyLiveQuestionStatuses, default: "new" },
    moderatedQuestion: { type: String, trim: true, maxlength: 2_000, default: null },
    consentAt: { type: Date, required: true },
    privacyNoticeVersion: { type: String, required: true, enum: ["weekly-live-v1"] }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

weeklyLiveQuestionSchema.index({ weeklyLiveId: 1, createdAt: -1 });
weeklyLiveQuestionSchema.index({ weeklyLiveId: 1, status: 1, createdAt: -1 });

export const WeeklyLiveModel: Model<WeeklyLive> =
  (mongoose.models.WeeklyLive as Model<WeeklyLive> | undefined) ??
  mongoose.model<WeeklyLive>("WeeklyLive", weeklyLiveSchema);

export const WeeklyLiveQuestionModel: Model<WeeklyLiveQuestion> =
  (mongoose.models.WeeklyLiveQuestion as Model<WeeklyLiveQuestion> | undefined) ??
  mongoose.model<WeeklyLiveQuestion>("WeeklyLiveQuestion", weeklyLiveQuestionSchema);

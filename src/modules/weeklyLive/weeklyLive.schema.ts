import { isValidObjectId } from "mongoose";
import { z } from "zod";

import { leadAttributionSchema, leadOptionalEmailSchema, leadPhoneInputSchema } from "../leads/lead.schema.js";
import { weeklyLiveQuestionStatuses } from "./weeklyLive.types.js";

const nonEmptyString = (maximum: number) => z.string().trim().min(1).max(maximum);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id").refine(isValidObjectId, "Invalid id");
const dateInput = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), "Invalid date");
const httpsUrl = z.string().trim().min(1).max(2_048).refine(
  (value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "Meeting URL must be an HTTPS URL" }
);
const positiveIntegerQuery = (maximum: number) =>
  z.string().regex(/^[1-9]\d*$/, "Must be a positive integer").transform(Number).pipe(z.number().int().min(1).max(maximum));
const adultAgeQuery = z.string().regex(/^\d+$/, "Must be an integer").transform(Number).pipe(z.number().int().min(18).max(100));

const liveFields = {
  title: nonEmptyString(120),
  scheduledAt: dateInput,
  meetingUrl: httpsUrl,
  isVisible: z.boolean().default(false),
  acceptingQuestions: z.boolean().default(false)
};

export const weeklyLiveIdParamsSchema = z.strictObject({ id: objectId });
export const weeklyLiveQuestionIdParamsSchema = z.strictObject({ questionId: objectId });
export const createWeeklyLiveSchema = z.strictObject(liveFields);
export const updateWeeklyLiveSchema = z.strictObject({
  title: liveFields.title.optional(),
  scheduledAt: liveFields.scheduledAt.optional(),
  meetingUrl: liveFields.meetingUrl.optional(),
  isVisible: z.boolean().optional(),
  acceptingQuestions: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "Weekly live update cannot be empty" });

export const publicQuestionSchema = z.strictObject({
  contactName: nonEmptyString(100),
  phone: leadPhoneInputSchema,
  email: leadOptionalEmailSchema.optional(),
  displayName: z.string().trim().min(2).max(80),
  age: z.number().int().min(18).max(100),
  region: nonEmptyString(80),
  city: nonEmptyString(100),
  question: z.string().trim().min(10).max(2_000),
  consent: z.literal(true),
  privacyNoticeAccepted: z.literal(true),
  marketingConsent: z.boolean(),
  attribution: leadAttributionSchema.optional()
});

export const adminWeeklyLiveListQuerySchema = z.strictObject({
  page: positiveIntegerQuery(Number.MAX_SAFE_INTEGER).optional().default(1),
  limit: positiveIntegerQuery(100).optional().default(20)
});

export const adminQuestionListQuerySchema = z.strictObject({
  page: positiveIntegerQuery(Number.MAX_SAFE_INTEGER).optional().default(1),
  limit: positiveIntegerQuery(100).optional().default(20),
  status: z.enum(weeklyLiveQuestionStatuses).optional(),
  region: nonEmptyString(80).optional(),
  city: nonEmptyString(100).optional(),
  minAge: adultAgeQuery.optional(),
  maxAge: adultAgeQuery.optional(),
  dateFrom: dateInput.optional(),
  dateTo: dateInput.optional(),
  search: nonEmptyString(100).optional()
}).refine((value) => value.minAge === undefined || value.maxAge === undefined || value.minAge <= value.maxAge, {
  message: "minAge must be less than or equal to maxAge"
}).refine((value) => value.dateFrom === undefined || value.dateTo === undefined || value.dateFrom <= value.dateTo, {
  message: "dateFrom must be before or equal to dateTo"
});

export const adminQuestionUpdateSchema = z.strictObject({
  status: z.enum(weeklyLiveQuestionStatuses).optional(),
  moderatedQuestion: z.string().trim().min(1).max(2_000).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "Question update cannot be empty" });

export type WeeklyLiveIdParams = z.infer<typeof weeklyLiveIdParamsSchema>;
export type WeeklyLiveQuestionIdParams = z.infer<typeof weeklyLiveQuestionIdParamsSchema>;
export type CreateWeeklyLiveInput = z.infer<typeof createWeeklyLiveSchema>;
export type UpdateWeeklyLiveInput = z.infer<typeof updateWeeklyLiveSchema>;
export type PublicQuestionInput = z.infer<typeof publicQuestionSchema>;
export type AdminWeeklyLiveListQuery = z.infer<typeof adminWeeklyLiveListQuerySchema>;
export type AdminQuestionListQuery = z.infer<typeof adminQuestionListQuerySchema>;
export type AdminQuestionUpdateInput = z.infer<typeof adminQuestionUpdateSchema>;

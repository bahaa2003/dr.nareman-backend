import { isValidObjectId } from "mongoose";
import { z } from "zod";

import { leadSources, leadStatuses } from "./lead.types.js";

const nonEmptyString = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || undefined).pipe(z.string().max(maximum).optional());
export const leadOptionalEmailSchema = z
  .string()
  .trim()
  .max(254)
  .transform((value) => value || undefined)
  .pipe(z.string().email().max(254).optional());
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid lead id").refine(isValidObjectId, "Invalid lead id");
const dateInput = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), "Invalid date");

function positiveIntegerQuery(maximum: number) {
  return z.string().regex(/^[1-9]\d*$/, "Must be a positive integer").transform(Number).pipe(z.number().int().min(1).max(maximum));
}

export function normalizeLeadPhone(value: string): string {
  const asciiDigits = value
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)))
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)));
  const normalized = asciiDigits.trim().replace(/[\s()\-]/gu, "");

  if (!/^\+?\d+$/u.test(normalized)) {
    throw new Error("Phone must contain only digits with an optional leading +");
  }

  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("Phone digit count must be between 7 and 15");
  }

  return normalized;
}

export const leadPhoneInputSchema = z.string().trim().min(1).max(60).transform((value, context) => {
  try {
    return normalizeLeadPhone(value);
  } catch {
    context.addIssue({ code: "custom", message: "Invalid phone number" });
    return z.NEVER;
  }
});

const landingPath = optionalText(500).refine(
  (value) => value === undefined || (value.startsWith("/") && !value.startsWith("//") && !/[?#\\]/u.test(value)),
  "landingPath must be an application-relative path without query or fragment"
);

const referrerHost = optionalText(253)
  .transform((value) => value?.toLowerCase())
  .refine(
    (value) => value === undefined || /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value),
    "referrerHost must be a host only"
  );

export const leadAttributionSchema = z.strictObject({
  utmSource: optionalText(200).optional(),
  utmMedium: optionalText(200).optional(),
  utmCampaign: optionalText(200).optional(),
  utmContent: optionalText(200).optional(),
  utmTerm: optionalText(200).optional(),
  landingPath: landingPath.optional(),
  referrerHost: referrerHost.optional(),
  clickIds: z
    .strictObject({
      gclid: optionalText(512).optional(),
      fbclid: optionalText(512).optional(),
      ttclid: optionalText(512).optional(),
      msclkid: optionalText(512).optional()
    })
    .optional()
});

export const createLeadSchema = z.strictObject({
  name: nonEmptyString(100),
  phone: leadPhoneInputSchema,
  email: leadOptionalEmailSchema.optional(),
  region: optionalText(80).optional(),
  city: optionalText(100).optional(),
  source: z.enum(leadSources),
  attribution: leadAttributionSchema.optional(),
  privacyNoticeAccepted: z.literal(true),
  marketingConsent: z.boolean()
});

export const leadIdParamsSchema = z.strictObject({ id: objectId });

export const updateLeadStatusSchema = z.strictObject({
  status: z.enum(leadStatuses)
});

const adminLeadFilterFields = {
  source: z.enum(leadSources).optional(),
  status: z.enum(leadStatuses).optional(),
  marketingConsent: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  utmCampaign: nonEmptyString(200).optional(),
  dateFrom: dateInput.optional(),
  dateTo: dateInput.optional()
};

export const adminLeadListQuerySchema = z
  .strictObject({
    page: positiveIntegerQuery(Number.MAX_SAFE_INTEGER).optional().default(1),
    limit: positiveIntegerQuery(100).optional().default(20),
    ...adminLeadFilterFields
  })
  .refine((value) => value.dateFrom === undefined || value.dateTo === undefined || value.dateFrom <= value.dateTo, {
    message: "dateFrom must be before or equal to dateTo"
  });

export const adminLeadExportQuerySchema = z
  .strictObject({
    limit: positiveIntegerQuery(1_000).optional().default(1_000),
    ...adminLeadFilterFields
  })
  .refine((value) => value.dateFrom === undefined || value.dateTo === undefined || value.dateFrom <= value.dateTo, {
    message: "dateFrom must be before or equal to dateTo"
  });

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type LeadIdParams = z.infer<typeof leadIdParamsSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type AdminLeadListQuery = z.infer<typeof adminLeadListQuerySchema>;
export type AdminLeadExportQuery = z.infer<typeof adminLeadExportQuerySchema>;

import mongoose, { type Model, Schema } from "mongoose";

import { leadSources, leadStatuses, type Lead } from "./lead.types.js";

const leadContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    phone: { type: String, required: true, trim: true, minlength: 7, maxlength: 16 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 }
  },
  { _id: false, id: false, strict: "throw" }
);

const leadLocationSchema = new Schema(
  {
    region: { type: String, trim: true, maxlength: 80 },
    city: { type: String, trim: true, maxlength: 100 }
  },
  { _id: false, id: false, strict: "throw" }
);

const leadClickIdsSchema = new Schema(
  {
    gclid: { type: String, trim: true, maxlength: 512 },
    fbclid: { type: String, trim: true, maxlength: 512 },
    ttclid: { type: String, trim: true, maxlength: 512 },
    msclkid: { type: String, trim: true, maxlength: 512 }
  },
  { _id: false, id: false, strict: "throw" }
);

const leadAttributionSchema = new Schema(
  {
    utmSource: { type: String, trim: true, maxlength: 200 },
    utmMedium: { type: String, trim: true, maxlength: 200 },
    utmCampaign: { type: String, trim: true, maxlength: 200 },
    utmContent: { type: String, trim: true, maxlength: 200 },
    utmTerm: { type: String, trim: true, maxlength: 200 },
    landingPath: { type: String, trim: true, maxlength: 500 },
    referrerHost: { type: String, trim: true, lowercase: true, maxlength: 253 },
    clickIds: { type: leadClickIdsSchema }
  },
  { _id: false, id: false, strict: "throw" }
);

const leadSchema = new Schema<Lead>(
  {
    contact: { type: leadContactSchema, required: true },
    location: { type: leadLocationSchema },
    source: { type: String, required: true, enum: leadSources },
    attribution: { type: leadAttributionSchema },
    privacyNoticeAcceptedAt: { type: Date, required: true },
    marketingConsent: { type: Boolean, required: true, default: false },
    marketingConsentAt: { type: Date, default: null },
    status: { type: String, required: true, enum: leadStatuses, default: "new" }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

leadSchema.index({ createdAt: -1, _id: -1 });
leadSchema.index({ source: 1, createdAt: -1, _id: -1 });
leadSchema.index({ status: 1, createdAt: -1, _id: -1 });
leadSchema.index({ marketingConsent: 1, createdAt: -1, _id: -1 });
leadSchema.index({ "attribution.utmCampaign": 1, createdAt: -1, _id: -1 });

export const LeadModel: Model<Lead> =
  (mongoose.models.Lead as Model<Lead> | undefined) ?? mongoose.model<Lead>("Lead", leadSchema);

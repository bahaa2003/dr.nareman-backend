import type { Types } from "mongoose";

export const leadSources = ["ovulation_calculator", "weekly_live"] as const;
export const leadStatuses = ["new", "contacted", "qualified", "converted", "not_interested", "do_not_contact"] as const;

export type LeadSource = (typeof leadSources)[number];
export type LeadStatus = (typeof leadStatuses)[number];

export interface LeadContact {
  name: string;
  phone: string;
  email?: string | undefined;
}

export interface LeadLocation {
  region?: string | undefined;
  city?: string | undefined;
}

export interface LeadClickIds {
  gclid?: string | undefined;
  fbclid?: string | undefined;
  ttclid?: string | undefined;
  msclkid?: string | undefined;
}

export interface LeadAttribution {
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;
  utmContent?: string | undefined;
  utmTerm?: string | undefined;
  landingPath?: string | undefined;
  referrerHost?: string | undefined;
  clickIds?: LeadClickIds | undefined;
}

export interface Lead {
  contact: LeadContact;
  location?: LeadLocation | undefined;
  source: LeadSource;
  attribution?: LeadAttribution | undefined;
  privacyNoticeAcceptedAt: Date;
  marketingConsent: boolean;
  marketingConsentAt: Date | null;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadPersistenceShape extends Lead {
  _id: Types.ObjectId;
}

export interface SafeAdminLead {
  id: string;
  contact: { name: string; phone: string; email: string | null };
  location: { region: string | null; city: string | null };
  source: LeadSource;
  attribution: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    landingPath: string | null;
    referrerHost: string | null;
    clickIds: { gclid: string | null; fbclid: string | null; ttclid: string | null; msclkid: string | null };
  };
  privacyNoticeAcceptedAt: string;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLeadListInput {
  page: number;
  limit: number;
  source?: LeadSource | undefined;
  status?: LeadStatus | undefined;
  marketingConsent?: boolean | undefined;
  utmCampaign?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
}

export interface AdminLeadExportInput extends Omit<AdminLeadListInput, "page"> {}

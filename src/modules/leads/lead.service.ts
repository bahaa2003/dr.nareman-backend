import { Types } from "mongoose";

import { AppError } from "../../shared/errors/AppError.js";
import { LeadModel } from "./lead.model.js";
import type { CreateLeadInput, UpdateLeadStatusInput } from "./lead.schema.js";
import type { AdminLeadExportInput, AdminLeadListInput, LeadAttribution, LeadPersistenceShape, SafeAdminLead } from "./lead.types.js";

export function toSafeAdminLead(lead: LeadPersistenceShape): SafeAdminLead {
  const attribution = lead.attribution;
  const clickIds = attribution?.clickIds;

  return {
    id: lead._id.toString(),
    contact: { name: lead.contact.name, phone: lead.contact.phone, email: lead.contact.email ?? null },
    location: { region: lead.location?.region ?? null, city: lead.location?.city ?? null },
    source: lead.source,
    attribution: {
      utmSource: attribution?.utmSource ?? null,
      utmMedium: attribution?.utmMedium ?? null,
      utmCampaign: attribution?.utmCampaign ?? null,
      utmContent: attribution?.utmContent ?? null,
      utmTerm: attribution?.utmTerm ?? null,
      landingPath: attribution?.landingPath ?? null,
      referrerHost: attribution?.referrerHost ?? null,
      clickIds: {
        gclid: clickIds?.gclid ?? null,
        fbclid: clickIds?.fbclid ?? null,
        ttclid: clickIds?.ttclid ?? null,
        msclkid: clickIds?.msclkid ?? null
      }
    },
    privacyNoticeAcceptedAt: lead.privacyNoticeAcceptedAt.toISOString(),
    marketingConsent: lead.marketingConsent,
    marketingConsentAt: lead.marketingConsentAt?.toISOString() ?? null,
    status: lead.status,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString()
  };
}

export async function createLead(input: CreateLeadInput): Promise<{ id: string }> {
  const now = new Date();
  const location = omitEmptyObject({ region: input.region, city: input.city });
  const attribution = normalizeAttribution(input.attribution);
  const leadData = {
    contact: { name: input.name, phone: input.phone, ...(input.email === undefined ? {} : { email: input.email }) },
    ...(location === undefined ? {} : { location }),
    source: input.source,
    ...(attribution === undefined ? {} : { attribution }),
    privacyNoticeAcceptedAt: now,
    marketingConsent: input.marketingConsent,
    marketingConsentAt: input.marketingConsent ? now : null,
    status: "new"
  } as unknown as LeadPersistenceShape;
  const lead = await LeadModel.create(leadData);

  return { id: lead._id.toString() };
}

export async function deleteLeadAfterFailedWeeklyLiveSubmission(id: string): Promise<void> {
  await LeadModel.findByIdAndDelete(id);
}

export async function listAdminLeads(input: AdminLeadListInput) {
  const filter = buildLeadFilter(input);
  const skip = (input.page - 1) * input.limit;
  const [leads, total] = await Promise.all([
    LeadModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(input.limit).lean<LeadPersistenceShape[]>(),
    LeadModel.countDocuments(filter)
  ]);
  return {
    items: leads.map(toSafeAdminLead),
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) }
  };
}

export async function getAdminLead(id: string): Promise<SafeAdminLead> {
  const lead = await LeadModel.findById(id).lean<LeadPersistenceShape | null>();
  if (!lead) throw new AppError("Lead not found", 404);
  return toSafeAdminLead(lead);
}

export async function updateLeadStatus(id: string, input: UpdateLeadStatusInput): Promise<SafeAdminLead> {
  const lead = await LeadModel.findById(id);
  if (!lead) throw new AppError("Lead not found", 404);
  lead.status = input.status;
  await lead.save();
  return toSafeAdminLead(lead.toObject() as LeadPersistenceShape);
}

export async function deleteLead(id: string): Promise<void> {
  const lead = await LeadModel.findByIdAndDelete(id);
  if (!lead) throw new AppError("Lead not found", 404);
}

export async function exportAdminLeads(input: AdminLeadExportInput): Promise<LeadPersistenceShape[]> {
  return LeadModel.find(buildLeadFilter(input))
    .sort({ createdAt: -1, _id: -1 })
    .limit(input.limit)
    .lean<LeadPersistenceShape[]>();
}

export function leadsToCsv(leads: LeadPersistenceShape[]): string {
  const headers = [
    "id", "name", "phone", "email", "region", "city", "source", "status", "marketingConsent",
    "privacyNoticeAcceptedAt", "marketingConsentAt", "utmSource", "utmMedium", "utmCampaign", "utmContent",
    "utmTerm", "landingPath", "referrerHost", "gclid", "fbclid", "ttclid", "msclkid", "createdAt", "updatedAt"
  ];
  const rows = leads.map((lead) => {
    const attribution = lead.attribution;
    const clickIds = attribution?.clickIds;
    return [
      lead._id.toString(), lead.contact.name, lead.contact.phone, lead.contact.email ?? "", lead.location?.region ?? "", lead.location?.city ?? "",
      lead.source, lead.status, String(lead.marketingConsent), lead.privacyNoticeAcceptedAt.toISOString(), lead.marketingConsentAt?.toISOString() ?? "",
      attribution?.utmSource ?? "", attribution?.utmMedium ?? "", attribution?.utmCampaign ?? "", attribution?.utmContent ?? "", attribution?.utmTerm ?? "",
      attribution?.landingPath ?? "", attribution?.referrerHost ?? "", clickIds?.gclid ?? "", clickIds?.fbclid ?? "", clickIds?.ttclid ?? "", clickIds?.msclkid ?? "",
      lead.createdAt.toISOString(), lead.updatedAt.toISOString()
    ].map(csvCell).join(",");
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

function buildLeadFilter(input: Omit<AdminLeadListInput, "page" | "limit">): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (input.source !== undefined) filter.source = input.source;
  if (input.status !== undefined) filter.status = input.status;
  if (input.marketingConsent !== undefined) filter.marketingConsent = input.marketingConsent;
  if (input.utmCampaign !== undefined) filter["attribution.utmCampaign"] = input.utmCampaign;
  if (input.dateFrom !== undefined || input.dateTo !== undefined) {
    filter.createdAt = {
      ...(input.dateFrom === undefined ? {} : { $gte: input.dateFrom }),
      ...(input.dateTo === undefined ? {} : { $lte: input.dateTo })
    };
  }
  return filter;
}

function normalizeAttribution(attribution: CreateLeadInput["attribution"]): LeadAttribution | undefined {
  if (!attribution) return undefined;
  const clickIds = omitEmptyObject(attribution.clickIds ?? {});
  return omitEmptyObject({
    utmSource: attribution.utmSource,
    utmMedium: attribution.utmMedium,
    utmCampaign: attribution.utmCampaign,
    utmContent: attribution.utmContent,
    utmTerm: attribution.utmTerm,
    landingPath: attribution.landingPath,
    referrerHost: attribution.referrerHost,
    ...(clickIds === undefined ? {} : { clickIds })
  }) as LeadAttribution | undefined;
}

function omitEmptyObject<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "");
  return entries.length === 0 ? undefined : Object.fromEntries(entries) as T;
}

function csvCell(value: string): string {
  const neutralized = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

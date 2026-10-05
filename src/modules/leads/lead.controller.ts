import type { RequestHandler } from "express";

import type { AdminLeadExportQuery, AdminLeadListQuery, CreateLeadInput, LeadIdParams, UpdateLeadStatusInput } from "./lead.schema.js";
import { createLead, deleteLead, exportAdminLeads, getAdminLead, leadsToCsv, listAdminLeads, updateLeadStatus } from "./lead.service.js";

export const createPublicLeadController: RequestHandler = async (request, response, next) => {
  try {
    const lead = await createLead(request.body as CreateLeadInput);
    response.status(201).json({ success: true, lead });
  } catch (error) { next(error); }
};

export const listAdminLeadsController: RequestHandler = async (_request, response, next) => {
  try { response.status(200).json({ success: true, ...(await listAdminLeads(response.locals.validatedQuery as AdminLeadListQuery)) }); }
  catch (error) { next(error); }
};

export const exportAdminLeadsController: RequestHandler = async (_request, response, next) => {
  try {
    const leads = await exportAdminLeads(response.locals.validatedQuery as AdminLeadExportQuery);
    response.status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="leads-export.csv"')
      .send(leadsToCsv(leads));
  } catch (error) { next(error); }
};

export const getAdminLeadController: RequestHandler = async (_request, response, next) => {
  try { response.status(200).json({ success: true, lead: await getAdminLead((response.locals.validatedParams as LeadIdParams).id) }); }
  catch (error) { next(error); }
};

export const updateAdminLeadController: RequestHandler = async (request, response, next) => {
  try { response.status(200).json({ success: true, lead: await updateLeadStatus((response.locals.validatedParams as LeadIdParams).id, request.body as UpdateLeadStatusInput) }); }
  catch (error) { next(error); }
};

export const deleteAdminLeadController: RequestHandler = async (_request, response, next) => {
  try { await deleteLead((response.locals.validatedParams as LeadIdParams).id); response.status(204).send(); }
  catch (error) { next(error); }
};

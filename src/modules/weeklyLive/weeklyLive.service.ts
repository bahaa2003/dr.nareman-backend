import { Types } from "mongoose";

import { AppError } from "../../shared/errors/AppError.js";
import { logger } from "../../utils/logger.js";
import { createLead, deleteLeadAfterFailedWeeklyLiveSubmission } from "../leads/lead.service.js";
import { WeeklyLiveModel, WeeklyLiveQuestionModel } from "./weeklyLive.model.js";
import type {
  AdminQuestionListQuery,
  AdminQuestionUpdateInput,
  AdminWeeklyLiveListQuery,
  CreateWeeklyLiveInput,
  PublicQuestionInput,
  UpdateWeeklyLiveInput
} from "./weeklyLive.schema.js";
import type { WeeklyLivePersistenceShape, WeeklyLiveQuestionPersistenceShape } from "./weeklyLive.types.js";

const privacyNoticeVersion = "weekly-live-v1" as const;

export function toAdminLive(live: WeeklyLivePersistenceShape, questionCount?: number) {
  return {
    id: live._id.toString(), title: live.title, scheduledAt: live.scheduledAt.toISOString(), timezone: live.timezone,
    meetingUrl: live.meetingUrl, isVisible: live.isVisible, acceptingQuestions: live.acceptingQuestions,
    ...(questionCount === undefined ? {} : { questionCount }),
    createdAt: live.createdAt.toISOString(), updatedAt: live.updatedAt.toISOString()
  };
}

function toPublicLive(live: WeeklyLivePersistenceShape) {
  return { id: live._id.toString(), title: live.title, scheduledAt: live.scheduledAt.toISOString(), timezone: live.timezone, acceptingQuestions: live.acceptingQuestions };
}

function toAdminQuestion(question: WeeklyLiveQuestionPersistenceShape) {
  return {
    id: question._id.toString(), weeklyLiveId: question.weeklyLiveId.toString(), displayName: question.displayName,
    age: question.age, region: question.region, city: question.city, question: question.question, status: question.status,
    moderatedQuestion: question.moderatedQuestion, consentAt: question.consentAt.toISOString(),
    privacyNoticeVersion: question.privacyNoticeVersion, createdAt: question.createdAt.toISOString(), updatedAt: question.updatedAt.toISOString()
  };
}

export async function createWeeklyLive(input: CreateWeeklyLiveInput) {
  if (input.isVisible) await WeeklyLiveModel.updateMany({ isVisible: true }, { $set: { isVisible: false } });
  const live = await WeeklyLiveModel.create({ ...input, timezone: "Asia/Riyadh" });
  return toAdminLive(live.toObject() as WeeklyLivePersistenceShape, 0);
}

export async function getWeeklyLive(id: string) {
  const live = await WeeklyLiveModel.findById(id).lean<WeeklyLivePersistenceShape | null>();
  if (!live) throw new AppError("Weekly live not found", 404);
  const questionCount = await WeeklyLiveQuestionModel.countDocuments({ weeklyLiveId: live._id });
  return toAdminLive(live, questionCount);
}

export async function updateWeeklyLive(id: string, input: UpdateWeeklyLiveInput) {
  const live = await WeeklyLiveModel.findById(id);
  if (!live) throw new AppError("Weekly live not found", 404);
  if (input.title !== undefined) live.title = input.title;
  if (input.scheduledAt !== undefined) live.scheduledAt = input.scheduledAt;
  if (input.meetingUrl !== undefined) live.meetingUrl = input.meetingUrl;
  if (input.acceptingQuestions !== undefined) live.acceptingQuestions = input.acceptingQuestions;
  if (input.isVisible !== undefined) live.isVisible = input.isVisible;
  if (live.isVisible) {
    await WeeklyLiveModel.updateMany({ _id: { $ne: live._id }, isVisible: true }, { $set: { isVisible: false } });
  }
  await live.save();
  const questionCount = await WeeklyLiveQuestionModel.countDocuments({ weeklyLiveId: live._id });
  return toAdminLive(live.toObject() as WeeklyLivePersistenceShape, questionCount);
}

export async function listWeeklyLives(input: AdminWeeklyLiveListQuery) {
  const skip = (input.page - 1) * input.limit;
  const [lives, total, counts] = await Promise.all([
    WeeklyLiveModel.find({}).sort({ scheduledAt: -1, _id: -1 }).skip(skip).limit(input.limit).lean<WeeklyLivePersistenceShape[]>(),
    WeeklyLiveModel.countDocuments({}),
    WeeklyLiveQuestionModel.aggregate<{ _id: Types.ObjectId; count: number }>([{ $group: { _id: "$weeklyLiveId", count: { $sum: 1 } } }])
  ]);
  const countByLiveId = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));
  return { items: lives.map((live) => toAdminLive(live, countByLiveId.get(live._id.toString()) ?? 0)), pagination: pagination(input.page, input.limit, total) };
}

export async function getCurrentWeeklyLive() {
  const live = await WeeklyLiveModel.findOne({ isVisible: true }).sort({ scheduledAt: 1, _id: 1 }).lean<WeeklyLivePersistenceShape | null>();
  return live ? toPublicLive(live) : null;
}

export async function submitQuestion(weeklyLiveId: string, input: PublicQuestionInput) {
  const live = await WeeklyLiveModel.findById(weeklyLiveId);
  if (!live || !live.isVisible) throw new AppError("Weekly live not found", 404);
  if (!isHttpsUrl(live.meetingUrl)) throw new AppError("Weekly live not found", 404);
  if (!live.acceptingQuestions) throw new AppError("Questions are not being accepted for this weekly live", 409);
  const lead = await createLead({
    name: input.contactName,
    phone: input.phone,
    ...(input.email === undefined ? {} : { email: input.email }),
    region: input.region,
    city: input.city,
    source: "weekly_live",
    privacyNoticeAccepted: true,
    marketingConsent: input.marketingConsent,
    ...(input.attribution === undefined ? {} : { attribution: input.attribution })
  });

  let question;
  try {
    question = await WeeklyLiveQuestionModel.create({
      weeklyLiveId: live._id, leadId: new Types.ObjectId(lead.id), displayName: input.displayName, age: input.age, region: input.region, city: input.city,
      question: input.question, consentAt: new Date(), privacyNoticeVersion
    });
  } catch (error) {
    try {
      await deleteLeadAfterFailedWeeklyLiveSubmission(lead.id);
    } catch (cleanupError) {
      logger.error({ errorName: getErrorName(cleanupError), operation: "weekly-live question compensation" }, "Failed to clean up Lead after question persistence failure");
    }
    throw error;
  }
  return {
    submissionId: question._id.toString(), joinUrl: live.meetingUrl, event: {
      title: live.title, scheduledAt: live.scheduledAt.toISOString(), timezone: live.timezone
    }
  };
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export async function listWeeklyLiveQuestions(weeklyLiveId: string, input: AdminQuestionListQuery) {
  const exists = await WeeklyLiveModel.exists({ _id: weeklyLiveId });
  if (!exists) throw new AppError("Weekly live not found", 404);
  const filter: Record<string, unknown> = { weeklyLiveId: new Types.ObjectId(weeklyLiveId) };
  if (input.status !== undefined) filter.status = input.status;
  if (input.region !== undefined) filter.region = input.region;
  if (input.city !== undefined) filter.city = input.city;
  if (input.minAge !== undefined || input.maxAge !== undefined) filter.age = { ...(input.minAge === undefined ? {} : { $gte: input.minAge }), ...(input.maxAge === undefined ? {} : { $lte: input.maxAge }) };
  if (input.dateFrom !== undefined || input.dateTo !== undefined) filter.createdAt = { ...(input.dateFrom === undefined ? {} : { $gte: input.dateFrom }), ...(input.dateTo === undefined ? {} : { $lte: input.dateTo }) };
  if (input.search !== undefined) {
    const expression = new RegExp(escapeRegex(input.search), "i");
    filter.$or = [{ displayName: expression }, { question: expression }, { moderatedQuestion: expression }];
  }
  const skip = (input.page - 1) * input.limit;
  const [questions, total] = await Promise.all([
    WeeklyLiveQuestionModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(input.limit).lean<WeeklyLiveQuestionPersistenceShape[]>(),
    WeeklyLiveQuestionModel.countDocuments(filter)
  ]);
  return { items: questions.map(toAdminQuestion), pagination: pagination(input.page, input.limit, total) };
}

export async function getWeeklyLiveQuestion(questionId: string) {
  const question = await WeeklyLiveQuestionModel.findById(questionId).lean<WeeklyLiveQuestionPersistenceShape | null>();
  if (!question) throw new AppError("Weekly live question not found", 404);
  const live = await WeeklyLiveModel.findById(question.weeklyLiveId).lean<WeeklyLivePersistenceShape | null>();
  if (!live) throw new AppError("Weekly live not found", 404);
  return { ...toAdminQuestion(question), weeklyLive: { id: live._id.toString(), title: live.title, scheduledAt: live.scheduledAt.toISOString(), timezone: live.timezone } };
}

export async function updateWeeklyLiveQuestion(questionId: string, input: AdminQuestionUpdateInput) {
  const question = await WeeklyLiveQuestionModel.findById(questionId);
  if (!question) throw new AppError("Weekly live question not found", 404);
  if (input.status !== undefined) question.status = input.status;
  if (input.moderatedQuestion !== undefined) question.moderatedQuestion = input.moderatedQuestion;
  await question.save();
  return toAdminQuestion(question.toObject() as WeeklyLiveQuestionPersistenceShape);
}

export async function deleteWeeklyLiveQuestion(questionId: string) {
  const question = await WeeklyLiveQuestionModel.findByIdAndDelete(questionId);
  if (!question) throw new AppError("Weekly live question not found", 404);
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

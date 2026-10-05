import type { Types } from "mongoose";

export const weeklyLiveQuestionStatuses = ["new", "selected", "answered", "archived"] as const;

export type WeeklyLiveQuestionStatus = (typeof weeklyLiveQuestionStatuses)[number];

export interface WeeklyLive {
  title: string;
  scheduledAt: Date;
  timezone: "Asia/Riyadh";
  meetingUrl: string;
  isVisible: boolean;
  acceptingQuestions: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeeklyLiveQuestion {
  weeklyLiveId: Types.ObjectId;
  leadId?: Types.ObjectId | undefined;
  displayName: string;
  age: number;
  region: string;
  city: string;
  question: string;
  status: WeeklyLiveQuestionStatus;
  moderatedQuestion: string | null;
  consentAt: Date;
  privacyNoticeVersion: "weekly-live-v1";
  createdAt: Date;
  updatedAt: Date;
}

export interface WeeklyLivePersistenceShape extends WeeklyLive {
  _id: Types.ObjectId;
}

export interface WeeklyLiveQuestionPersistenceShape extends WeeklyLiveQuestion {
  _id: Types.ObjectId;
}

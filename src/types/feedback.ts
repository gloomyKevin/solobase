import { z } from "zod/v4";

export const FeedbackTypeValues = [
  "error_report",
  "project_suggestion",
  "feature_request",
  "general",
] as const;

export const FeedbackStatusValues = [
  "new",
  "reviewed",
  "acted",
  "dismissed",
] as const;

export const FeedbackSchema = z.object({
  id: z.string(),
  type: z.enum(FeedbackTypeValues),

  content: z.object({
    projectId: z.string().optional(),
    description: z.string(),
    severity: z.enum(["low", "medium", "high"]).optional(),
    suggestedUrl: z.string().optional(),
  }),

  aiAnalysis: z
    .object({
      category: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative"]),
      actionable: z.boolean(),
      summary: z.string(),
    })
    .optional(),

  status: z.enum(FeedbackStatusValues).default("new"),
  submittedAt: z.string().default(() => new Date().toISOString()),
});

export type FeedbackType = (typeof FeedbackTypeValues)[number];
export type FeedbackStatus = (typeof FeedbackStatusValues)[number];
export type Feedback = z.infer<typeof FeedbackSchema>;

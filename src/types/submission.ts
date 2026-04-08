import { z } from "zod/v4";
import {
  BusinessModelValues,
  BuildEffortValues,
  GrowthChannelValues,
  FounderTypeValues,
  ProjectStageValues,
} from "./project";

export const SubmissionStatusValues = [
  "pending_prefill",
  "pending_confirm",
  "pending_review",
  "approved",
  "rejected",
] as const;

export const AIPrefillResultSchema = z.object({
  name: z.string().optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  suggestedCategories: z
    .object({
      businessModel: z.enum(BusinessModelValues).optional(),
      buildEffort: z.enum(BuildEffortValues).optional(),
      growthChannel: z.enum(GrowthChannelValues).optional(),
      founderType: z.enum(FounderTypeValues).optional(),
      stage: z.enum(ProjectStageValues).optional(),
    })
    .optional(),
  suggestedTags: z.array(z.string()).default([]),
  screenshot: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0),
});

export const SubmissionSchema = z.object({
  id: z.string(),
  type: z.enum(["self_submit", "recommend"]),

  // User input
  url: z.string(),
  additionalText: z.string().optional(),
  recommendReason: z.string().optional(),
  recommendedBy: z.string().optional(),

  // AI prefill
  aiPrefilled: AIPrefillResultSchema.optional(),

  // User-confirmed data
  confirmedData: z
    .object({
      name: z.string().optional(),
      tagline: z.string().optional(),
      description: z.string().optional(),
      businessModel: z.enum(BusinessModelValues).optional(),
      buildEffort: z.enum(BuildEffortValues).optional(),
      growthChannel: z.enum(GrowthChannelValues).optional(),
      founderType: z.enum(FounderTypeValues).optional(),
      stage: z.enum(ProjectStageValues).optional(),
    })
    .optional(),

  // Status
  status: z.enum(SubmissionStatusValues).default("pending_prefill"),
  reviewNotes: z.string().optional(),

  submittedBy: z.string().optional(),
  submittedAt: z.string().default(() => new Date().toISOString()),
  reviewedAt: z.string().optional(),
});

export type SubmissionStatus = (typeof SubmissionStatusValues)[number];
export type Submission = z.infer<typeof SubmissionSchema>;
export type AIPrefillResult = z.infer<typeof AIPrefillResultSchema>;

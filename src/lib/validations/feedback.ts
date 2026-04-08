import { z } from "zod/v4";
import { FeedbackTypeValues } from "@/types/feedback";

export const FeedbackRequestSchema = z.object({
  type: z.enum(FeedbackTypeValues),
  content: z.object({
    projectId: z.string().optional(),
    description: z.string().min(1, "请填写反馈内容"),
    severity: z.enum(["low", "medium", "high"]).optional(),
    suggestedUrl: z.string().optional(),
  }),
});

export const RecommendRequestSchema = z.object({
  url: z.string().url("请输入有效的产品 URL"),
  recommendedBy: z.string().optional(),
  recommendReason: z.string().min(1, "请填写推荐理由"),
  additionalNotes: z.string().optional(),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

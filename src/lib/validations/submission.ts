import { z } from "zod/v4";
import {
  BusinessModelValues,
  BuildEffortValues,
  GrowthChannelValues,
  FounderTypeValues,
  ProjectStageValues,
} from "@/types/project";

export const PrefillRequestSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
}).refine((data) => data.url || data.text, {
  message: "请提供产品 URL 或文字描述",
});

export const SubmitRequestSchema = z.object({
  url: z.string(),
  additionalText: z.string().optional(),
  confirmedData: z.object({
    name: z.string().min(1, "请填写产品名称"),
    tagline: z.string().min(1, "请填写一句话描述"),
    description: z.string().optional(),
    businessModel: z.enum(BusinessModelValues).optional(),
    buildEffort: z.enum(BuildEffortValues).optional(),
    growthChannel: z.enum(GrowthChannelValues).optional(),
    founderType: z.enum(FounderTypeValues).optional(),
    stage: z.enum(ProjectStageValues).optional(),
  }),
});

export type PrefillRequest = z.infer<typeof PrefillRequestSchema>;
export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;

import { z } from "zod/v4";

// ===== Classification Enums =====

export const BusinessModelValues = [
  "subscription",
  "one_time",
  "freemium",
  "ad_revenue",
  "commission",
  "open_source_plus",
  "content_paid",
  "undetermined",
] as const;

export const BuildEffortValues = [
  "weekend",
  "monthly",
  "ongoing",
  "undetermined",
] as const;

export const GrowthChannelValues = [
  "seo",
  "community",
  "content_marketing",
  "paid_ads",
  "viral",
  "mixed",
  "undetermined",
] as const;

export const FounderTypeValues = [
  "tech_to_product",
  "designer",
  "product_manager",
  "non_tech_ai",
  "small_team",
  "undetermined",
] as const;

export const ProjectStageValues = [
  "idea",
  "building",
  "launched",
  "revenue",
  "scaling",
] as const;

export const RevenueRangeValues = [
  "pre_revenue",
  "under_1k",
  "1k_5k",
  "5k_10k",
  "10k_50k",
  "50k_plus",
] as const;

export const ProjectStatusValues = [
  "draft",
  "basic",
  "featured",
  "story",
] as const;

export const FieldSourceTypeValues = [
  "public_page",
  "third_party_public",
  "founder_submitted",
  "founder_confirmed",
  "editor_verified",
  "ai_inference_internal",
] as const;

export const VerificationStatusValues = [
  "unverified",
  "founder_confirmed",
  "editor_verified",
] as const;

// ===== Zod Schemas =====

export const VerifiableFieldSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    sourceType: z.enum(FieldSourceTypeValues).optional(),
    sourceUrl: z.string().optional(),
    verificationStatus: z.enum(VerificationStatusValues).default("unverified"),
    updatedAt: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    isPublic: z.boolean().default(true),
  });

export const DerivedInsightSchema = z.object({
  text: z.string(),
  sampleSize: z.number(),
  basedOnProjectIds: z.array(z.string()),
  generatedAt: z.string(),
});

export const TrackStatsSchema = z.object({
  sampleSize: z.number(),
  totalInTrack: z.number(),
  businessModelDistribution: z.record(z.string(), z.number()),
  growthChannelDistribution: z.record(z.string(), z.number()),
  buildEffortDistribution: z.record(z.string(), z.number()).optional(),
  avgBuildEffort: z.string().optional(),
  revenueDistribution: z.record(z.string(), z.number()).optional(),
  generatedAt: z.string(),
});

export const ProjectTagsSchema = z.object({
  track: z.array(z.string()).default([]),
  taskScenario: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),
  market: z.array(z.string()).default([]),
  platform: z.array(z.string()).default([]),
});

export const BuildStorySchema = z.object({
  origin: z.string().optional(),
  toolsUsed: z.string().optional(),
  timeline: z.string().optional(),
  challenges: z.string().optional(),
  acquisition: z.string().optional(),
  currentStatus: z.string().optional(),
});

export const ProjectMetricsSchema = z.object({
  revenueRange: VerifiableFieldSchema(z.enum(RevenueRangeValues)).optional(),
  userCount: VerifiableFieldSchema(z.string()).optional(),
  launchedDate: VerifiableFieldSchema(z.string()).optional(),
  buildDuration: VerifiableFieldSchema(z.string()).optional(),
});

export const ProjectSourceSchema = z.object({
  type: z.enum(["self_submit", "recommended", "curated"]),
  recommendedBy: z.string().optional(),
  recommendReason: z.string().optional(),
  originalSource: z.string().optional(),
  claimedByFounder: z.boolean().default(false),
  claimedAt: z.string().optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(ProjectStatusValues).default("basic"),

  // Core info
  name: z.string(),
  tagline: z.string(),
  description: z.string().default(""),
  url: z.string().default(""),
  screenshots: z.array(z.string()).default([]),
  logo: z.string().optional(),

  // Classification
  businessModel: z.enum(BusinessModelValues).default("undetermined"),
  buildEffort: z.enum(BuildEffortValues).default("undetermined"),
  growthChannel: z.enum(GrowthChannelValues).default("undetermined"),
  founderType: z.enum(FounderTypeValues).default("undetermined"),
  stage: z.enum(ProjectStageValues).default("launched"),

  // Tags
  tags: ProjectTagsSchema.default({
    track: [],
    taskScenario: [],
    tools: [],
    techStack: [],
    market: [],
    platform: [],
  }),

  // Optional rich data
  metrics: ProjectMetricsSchema.optional(),
  buildStory: BuildStorySchema.optional(),

  // Derived data
  derived: z
    .object({
      relatedByTrack: z.array(z.string()).default([]),
      relatedByGrowth: z.array(z.string()).default([]),
      relatedByFounder: z.array(z.string()).default([]),
      trackStats: TrackStatsSchema.optional(),
      insights: z.array(DerivedInsightSchema).default([]),
    })
    .optional(),

  // Source & editorial
  source: ProjectSourceSchema.default({
    type: "curated",
    claimedByFounder: false,
  }),
  founderId: z.string().optional(),
  editorNotes: z.string().optional(),
  featuredInsight: z.string().optional(),
  isEditorsPick: z.boolean().default(false),

  // Display hints (for card rendering)
  stageColor: z.string().optional(),

  // Metadata
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
  publishedAt: z.string().optional(),
});

// ===== Inferred Types =====

export type BusinessModel = (typeof BusinessModelValues)[number];
export type BuildEffort = (typeof BuildEffortValues)[number];
export type GrowthChannel = (typeof GrowthChannelValues)[number];
export type FounderType = (typeof FounderTypeValues)[number];
export type ProjectStage = (typeof ProjectStageValues)[number];
export type RevenueRange = (typeof RevenueRangeValues)[number];
export type ProjectStatus = (typeof ProjectStatusValues)[number];
export type FieldSourceType = (typeof FieldSourceTypeValues)[number];
export type VerificationStatus = (typeof VerificationStatusValues)[number];

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectTags = z.infer<typeof ProjectTagsSchema>;
export type BuildStory = z.infer<typeof BuildStorySchema>;
export type ProjectMetrics = z.infer<typeof ProjectMetricsSchema>;
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;
export type TrackStats = z.infer<typeof TrackStatsSchema>;
export type DerivedInsight = z.infer<typeof DerivedInsightSchema>;

// ===== Filters & Pagination =====

export const ProjectFiltersSchema = z.object({
  status: z.array(z.enum(ProjectStatusValues)).optional(),
  businessModel: z.array(z.enum(BusinessModelValues)).optional(),
  buildEffort: z.array(z.enum(BuildEffortValues)).optional(),
  growthChannel: z.array(z.enum(GrowthChannelValues)).optional(),
  founderType: z.array(z.enum(FounderTypeValues)).optional(),
  stage: z.array(z.enum(ProjectStageValues)).optional(),
  taskScenario: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.number().default(1),
  pageSize: z.number().default(20),
  sortBy: z.enum(["newest", "oldest", "name"]).default("newest"),
});

export type ProjectFilters = z.infer<typeof ProjectFiltersSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;

export interface ProjectListResult {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
}

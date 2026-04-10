/**
 * Data types for card image generation.
 */

export interface CardMetric {
  label: string;
  value: string;
  icon?: string;
}

export interface CardTag {
  label: string;
  dimension: "business" | "growth" | "effort" | "founder" | "stage" | "default";
}

export interface CardData {
  // Core
  name: string;
  tagline: string;
  description?: string;
  url?: string;

  // Visual
  screenshotUrl?: string; // URL or base64 data URI
  logoUrl?: string;

  // Classification
  stage?: string;
  stageLabel?: string;
  stageColor?: string;

  // Metrics
  metrics: CardMetric[];

  // Tags (max 3-4 for card display)
  tags: CardTag[];

  // Editorial
  insight?: string; // Featured insight one-liner
  founderName?: string;

  // Platform branding
  platformName?: string; // defaults to "Solobase"
  platformUrl?: string;
}

export type TemplateVariant = "editorial" | "data-grid" | "hero-screenshot";

export type CardSize = "xiaohongshu" | "xiaohongshuSquare" | "og" | "wechat";

export interface RenderOptions {
  template: TemplateVariant;
  size: CardSize;
  data: CardData;
}

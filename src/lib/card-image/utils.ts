/**
 * Utility to convert a Project to CardData for card image generation.
 */

import type { Project } from "@/types";
import type { CardData, CardMetric, CardTag } from "./types";
import {
  businessModelOptions,
  growthChannelOptions,
  founderTypeOptions,
  buildEffortOptions,
  projectStageOptions,
  revenueRangeOptions,
  stageColorMap,
  getCategoryLabel,
} from "@/config/categories";

export function projectToCardData(project: Project): CardData {
  // Build metrics
  const metrics: CardMetric[] = [];
  if (project.metrics?.revenueRange?.value) {
    metrics.push({
      label: "月收入",
      value: getCategoryLabel(revenueRangeOptions, project.metrics.revenueRange.value),
      icon: "💰",
    });
  }
  if (project.metrics?.userCount?.value) {
    metrics.push({
      label: "用户数",
      value: project.metrics.userCount.value,
      icon: "👥",
    });
  }
  if (project.metrics?.buildDuration?.value) {
    metrics.push({
      label: "构建周期",
      value: project.metrics.buildDuration.value,
      icon: "⏱",
    });
  }
  if (project.metrics?.launchedDate?.value) {
    metrics.push({
      label: "上线时间",
      value: project.metrics.launchedDate.value,
    });
  }
  // Add growth channel and business model as "metrics" for data-grid template
  if (project.growthChannel && project.growthChannel !== "undetermined") {
    metrics.push({
      label: "增长方式",
      value: getCategoryLabel(growthChannelOptions, project.growthChannel),
    });
  }
  if (project.businessModel && project.businessModel !== "undetermined") {
    metrics.push({
      label: "商业模式",
      value: getCategoryLabel(businessModelOptions, project.businessModel),
    });
  }

  // Build tags
  const tags: CardTag[] = [];
  if (project.businessModel && project.businessModel !== "undetermined") {
    tags.push({
      label: getCategoryLabel(businessModelOptions, project.businessModel),
      dimension: "business",
    });
  }
  if (project.growthChannel && project.growthChannel !== "undetermined") {
    tags.push({
      label: getCategoryLabel(growthChannelOptions, project.growthChannel),
      dimension: "growth",
    });
  }
  if (project.buildEffort && project.buildEffort !== "undetermined") {
    tags.push({
      label: getCategoryLabel(buildEffortOptions, project.buildEffort),
      dimension: "effort",
    });
  }
  if (project.founderType && project.founderType !== "undetermined") {
    tags.push({
      label: getCategoryLabel(founderTypeOptions, project.founderType),
      dimension: "founder",
    });
  }

  const stageLabel = getCategoryLabel(projectStageOptions, project.stage);

  return {
    name: project.name,
    tagline: project.tagline,
    description: project.description,
    url: project.url,
    screenshotUrl: project.screenshots[0],
    logoUrl: project.logo,
    stage: project.stage,
    stageLabel,
    stageColor: project.stageColor || stageColorMap[project.stage] || "#9CA3AF",
    metrics,
    tags: tags.slice(0, 4),
    insight: project.featuredInsight,
    platformName: "Solobase",
  };
}

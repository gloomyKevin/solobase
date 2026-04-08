import type { Project } from "@/types";
import type { ProjectCardData } from "@/components/project/ProjectCard";
import type { TagDimension } from "@/components/common/TagBadge";
import {
  businessModelOptions,
  growthChannelOptions,
  founderTypeOptions,
  buildEffortOptions,
  projectStageOptions,
  stageColorMap,
  getCategoryLabel,
} from "@/config/categories";

// Map classification values to TagBadge dimension
const dimensionMap: Record<string, TagDimension> = {
  businessModel: "business",
  growthChannel: "growth",
  buildEffort: "effort",
  founderType: "founder",
  stage: "stage",
};

export function toCardData(project: Project): ProjectCardData {
  const tags: { label: string; dimension: TagDimension }[] = [];

  // Add classification-based tags
  if (project.businessModel && project.businessModel !== "undetermined") {
    tags.push({
      label: getCategoryLabel(businessModelOptions, project.businessModel),
      dimension: dimensionMap.businessModel,
    });
  }
  if (project.growthChannel && project.growthChannel !== "undetermined") {
    tags.push({
      label: getCategoryLabel(growthChannelOptions, project.growthChannel),
      dimension: dimensionMap.growthChannel,
    });
  }
  if (project.founderType && project.founderType !== "undetermined") {
    tags.push({
      label: getCategoryLabel(founderTypeOptions, project.founderType),
      dimension: dimensionMap.founderType,
    });
  }
  if (project.buildEffort && project.buildEffort !== "undetermined") {
    tags.push({
      label: getCategoryLabel(buildEffortOptions, project.buildEffort),
      dimension: dimensionMap.buildEffort,
    });
  }

  // Stage label
  const stageLabel = getCategoryLabel(projectStageOptions, project.stage);

  return {
    slug: project.slug,
    name: project.name,
    tagline: project.tagline,
    screenshot: project.screenshots[0] ?? "",
    tags: tags.slice(0, 3), // Card shows max 3 tags
    stage: stageLabel,
    stageColor: project.stageColor ?? stageColorMap[project.stage] ?? "#9CA3AF",
    featuredInsight: project.featuredInsight,
    isEditorsPick: project.isEditorsPick,
  };
}

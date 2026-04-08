import type { Metadata } from "next";
import type { Project } from "@/types";
import { siteConfig } from "@/config/site";
import { getCategoryLabel, projectStageOptions } from "@/config/categories";

export function generateProjectMetadata(project: Project): Metadata {
  const title = `${project.name} — ${project.tagline} | ${siteConfig.name}`;
  const description = project.description?.slice(0, 160) || project.tagline;

  return {
    title,
    description,
    openGraph: {
      title: project.name,
      description: project.tagline,
      type: "website",
      images: [
        {
          url: project.screenshots[0] || siteConfig.defaultOgImage,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: project.name,
      description: project.tagline,
    },
  };
}

export function generateProjectJsonLd(project: Project) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: project.name,
    description: project.description || project.tagline,
    url: project.url,
    applicationCategory: project.tags.track?.[0] || "WebApplication",
    operatingSystem: "Web",
    offers: project.metrics?.revenueRange
      ? {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: getCategoryLabel(
            projectStageOptions,
            project.stage
          ),
        }
      : undefined,
  };
}

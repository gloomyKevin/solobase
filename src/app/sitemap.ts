import type { MetadataRoute } from "next";
import { getDataService } from "@/services/data";
import { siteConfig } from "@/config/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dataService = getDataService();
  const { items: projects } = await dataService.listProjects(
    {},
    { pageSize: 1000, sortBy: "newest" }
  );

  const projectUrls: MetadataRoute.Sitemap = projects.map((p) => ({
    url: `${siteConfig.url}/project/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: p.status === "featured" ? 0.9 : 0.7,
  }));

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified: new Date().toISOString(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteConfig.url}/browse`,
      lastModified: new Date().toISOString(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/submit`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteConfig.url}/recommend`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteConfig.url}/feedback`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  return [...staticPages, ...projectUrls];
}

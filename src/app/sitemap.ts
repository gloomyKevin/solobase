import type { MetadataRoute } from "next";
import { loadFeedData, loadPostsForFeed } from "@/lib/feed-data";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const feedItems = loadFeedData();
  const projects = feedItems.filter(i => i.kind === "project") as any[];
  const posts = loadPostsForFeed();

  const projectUrls: MetadataRoute.Sitemap = projects.map((p) => ({
    url: `${siteConfig.url}/project/${p.slug}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const postUrls: MetadataRoute.Sitemap = posts.map((p: any) => ({
    url: `${siteConfig.url}/post/${p.slug}`,
    lastModified: p.publishedAt ? new Date(p.publishedAt).toISOString() : new Date().toISOString(),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteConfig.url, lastModified: new Date().toISOString(), changeFrequency: "daily", priority: 1 },
    { url: `${siteConfig.url}/browse`, lastModified: new Date().toISOString(), changeFrequency: "daily", priority: 0.8 },
    { url: `${siteConfig.url}/submit`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteConfig.url}/recommend`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteConfig.url}/feedback`, changeFrequency: "monthly", priority: 0.3 },
  ];

  return [...staticPages, ...projectUrls, ...postUrls];
}

/**
 * Feed 数据读取层 — 只读 data/feed.json，零处理
 */

import fs from "node:fs";
import path from "node:path";
import type { FeedProjectItem, FeedPostItem, FeedEntry } from "@/app/Feed";

const FEED_PATH = path.join(process.cwd(), "data", "feed.json");

interface FeedCache {
  projects: any[];
  posts: any[];
  meta: { generatedAt: string; projectCount: number; postCount: number };
}

let _cache: FeedCache | null = null;

function readCache(): FeedCache {
  if (_cache) return _cache;
  if (!fs.existsSync(FEED_PATH)) {
    return { projects: [], posts: [], meta: { generatedAt: "", projectCount: 0, postCount: 0 } };
  }
  _cache = JSON.parse(fs.readFileSync(FEED_PATH, "utf-8"));
  return _cache!;
}

/** 首页 feed 用 */
export function loadFeedData(): FeedEntry[] {
  const cache = readCache();

  const projects: FeedProjectItem[] = cache.projects.map(p => ({
    id: `project:${p.slug}`,
    kind: "project" as const,
    score: p.score,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    url: p.url,
    screenshot: p.screenshot,
    stage: p.stage,
    stageColor: p.stageColor,
    topic: p.topics?.[0] ?? "",
    source: p.source,
    topics: p.topics ?? [],
    author: p.author ?? "",
  }));

  const posts: FeedPostItem[] = cache.posts.map(p => ({
    id: p.id,
    kind: "post" as const,
    score: p.score,
    topic: p.type,
    source: "",
    slug: p.slug,
    title: p.title,
    body: p.body,
    author: p.author,
    postType: p.type,
    topics: p.topics ?? [],
  }));

  return [...projects, ...posts];
}

/** 详情页用 — 按 slug 查找单个 project */
export function getProjectBySlug(slug: string): any | null {
  const cache = readCache();
  return cache.projects.find(p => p.slug === slug) ?? null;
}

/** 多维度相关推荐 */
export function getRelatedProjects(slug: string, limit: number = 4, dimension: "topic" | "stage" | "author" = "topic"): any[] {
  const cache = readCache();
  const current = cache.projects.find((p: any) => p.slug === slug);
  if (!current) return [];

  let candidates: any[];

  switch (dimension) {
    case "topic": {
      const currentTopics = new Set(current.topics ?? []);
      candidates = cache.projects.filter((p: any) =>
        p.slug !== slug && (p.topics ?? []).some((t: string) => currentTopics.has(t))
      );
      break;
    }
    case "stage": {
      candidates = cache.projects.filter((p: any) =>
        p.slug !== slug && p.stage === current.stage
      );
      break;
    }
    case "author": {
      candidates = cache.projects.filter((p: any) =>
        p.slug !== slug && p.author && p.author === current.author
      );
      break;
    }
    default:
      candidates = [];
  }

  return candidates.slice(0, limit);
}

/** Post 详情页 — 按 slug 查找 */
export function getPostBySlug(slug: string): any | null {
  const cache = readCache();
  return cache.posts.find((p: any) => p.slug === slug) ?? null;
}

/** Post 相关推荐 — 同 topic 的其他 posts */
export function getRelatedPosts(slug: string, limit: number = 3): any[] {
  const cache = readCache();
  const current = cache.posts.find((p: any) => p.slug === slug);
  if (!current) return [];

  const currentTopics = new Set(current.topics ?? []);
  return cache.posts
    .filter((p: any) => p.slug !== slug && (p.topics ?? []).some((t: string) => currentTopics.has(t)))
    .slice(0, limit);
}

/** Post 详情页：提取正文中出现的相关产品 */
export function getRelatedProjectsForPost(postBody: string, limit: number = 3): any[] {
  const cache = readCache();
  const bodyLower = postBody.toLowerCase();
  return cache.projects
    .filter((p: any) => {
      const nameLower = (p.name || '').toLowerCase();
      return nameLower.length >= 3 && bodyLower.includes(nameLower);
    })
    .slice(0, limit);
}

/** 首页 feed 用的 posts 列表 */
export function loadPostsForFeed(): any[] {
  return readCache().posts;
}

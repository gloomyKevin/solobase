/**
 * Feed 数据层 — 直接从管道输出构建 feed，零中间文件
 *
 * 职责：
 * 1. 读管道输出
 * 2. 识别产品（有产品URL + 有图 + 质量够高）
 * 3. 精选少量 Post
 * 4. 返回 FeedEntry[]
 */

import fs from "node:fs";
import path from "node:path";
import type { FeedProjectItem, FeedPostItem, FeedEntry } from "@/app/Feed";

const PIPELINE_DIR = path.join(process.cwd(), "data", "pipeline");

const stageColorMap: Record<string, string> = {
  idea: "#9CA3AF", building: "#F59E0B", launched: "#DB6B25",
  revenue: "#3B9B8B", scaling: "#6C4FD6",
};

// ═══════════════════════════════════════════════════════════════
// URL 分类 — 宽松策略，尽量多收
// ═══════════════════════════════════════════════════════════════

// 明确不是产品的链接
const REJECT_HOSTS = new Set([
  "twitter.com", "x.com", "youtube.com", "youtu.be", "bilibili.com",
  "reddit.com", "hackernews.com", "news.ycombinator.com",
  "wired.com", "sspai.com", "zhihu.com", "juejin.cn",
  "medium.com", "substack.com", "arxiv.org",
  "web.okjike.com", "m.okjike.com", "okjike.com",
  "linux.do", "v2ex.com",
  "image-qiniu.jellow.site",
]);

function isProductUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "").toLowerCase();
    if ([...REJECT_HOSTS].some(r => host.includes(r))) return false;
    return true;
  } catch {
    return false;
  }
}

function extractProductName(url: string, body: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "").toLowerCase();

    // GitHub 仓库
    if (host === "github.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[1].length >= 2) return parts[1];
      return null;
    }

    // App Store
    if (host.includes("apps.apple.com")) {
      const m = u.pathname.match(/\/app\/([^/]+)/);
      if (m?.[1]) return decodeURIComponent(m[1]).replace(/-/g, " ").slice(0, 25);
    }

    // Chrome Web Store
    if (host.includes("chromewebstore")) return null; // name from body instead

    // 自有域名
    const domain = host.split(".")[0];
    if (domain.length >= 3 && domain.length <= 20) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  } catch { /* ignore */ }

  // 从正文提取
  const patterns = [
    /(?:做了|发布了?|上线了?|开源了?|推出了?)\s*(?:一个|一款)?\s*([A-Za-z][\w.-]{2,25})/,
    /(?:做了|发布了?|上线了?|开源了?|推出了?)\s*(?:一个|一款)?\s*[「【《]([^」】》\n]{2,20})[」】》]/,
    /^([A-Za-z][\w.-]{3,25})\s*[，,—\-:：|]/m,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m?.[1] && m[1].length >= 2) return m[1].trim();
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// 图片检测 — 只信任可靠的图片源
// ═══════════════════════════════════════════════════════════════

// 即刻 CDN 图片可能有防盗链，标记为需要验证
function isReliableImage(url: string): boolean {
  if (!url) return false;
  // 即刻 CDN — 实际可能加载不了
  if (url.includes("cdnv2.ruguoapp.com")) return true; // 暂时信任，客户端用 onError 兜底
  // GitHub/imgur 等公共 CDN
  if (url.includes("github") || url.includes("imgur") || url.includes("placehold")) return true;
  // 其他 HTTPS 图片
  if (url.startsWith("https://")) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════
// 从管道条目构建 FeedProjectItem
// ═══════════════════════════════════════════════════════════════

function inferStage(body: string): string {
  if (/mrr|收入|营收|月入|付费用户/i.test(body)) return "revenue";
  if (/上线|发布|launch|ship|正式版/i.test(body)) return "launched";
  if (/开发中|building|beta|内测/i.test(body)) return "building";
  return "launched";
}

function inferTopics(body: string): string[] {
  const b = body.toLowerCase();
  const t: string[] = [];
  if (/\bai\b|人工智能|gpt|claude|模型/.test(b)) t.push("ai");
  if (/出海|global|海外/.test(b)) t.push("出海");
  if (/开发者|devtool|github|开源/.test(b)) t.push("开发工具");
  if (/效率|productivity|workflow/.test(b)) t.push("效率");
  if (/chrome|扩展|extension|插件/.test(b)) t.push("扩展");
  if (/ios|app store|移动/.test(b)) t.push("App");
  if (/开源|open.?source/.test(b)) t.push("开源");
  if (/saas|订阅/.test(b)) t.push("SaaS");
  if (/设计|design/.test(b)) t.push("设计");
  return t.length > 0 ? t.slice(0, 2) : [];
}

function pipelineToProject(item: any, name: string, productUrl: string): FeedProjectItem | null {
  const images = (item.media || []).filter(isReliableImage);
  if (images.length === 0) return null;

  const score = item.density_score?.total ?? 0;
  const stage = inferStage(item.body || "");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  if (!slug) return null;

  const lines = (item.body || "").split(/\n/).map((s: string) => s.trim()).filter((s: string) => s.length > 10 && s.length < 120);
  const tagline = lines[0]?.slice(0, 80) || (item.body || "").slice(0, 80);

  return {
    id: `project:${slug}`,
    kind: "project",
    score,
    slug,
    name,
    tagline,
    url: productUrl,
    screenshot: images[0],
    stage,
    stageColor: stageColorMap[stage] || "#9CA3AF",
    topic: inferTopics(item.body || "")[0] ?? "",
    source: item.source ?? "",
    topics: inferTopics(item.body || ""),
  };
}

// ═══════════════════════════════════════════════════════════════
// 加载管道数据，构建 Feed
// ═══════════════════════════════════════════════════════════════

// 有价值的 Post 类型
const WORTHY_POST_TYPES = new Set([
  "build_log", "revenue_report", "strategy_insight",
  "experience_share", "failure_postmortem",
]);

function loadAllPipelineItems(): any[] {
  const sources = ["jike.json", "v2ex.json", "linuxdo.json"];
  const all: any[] = [];
  for (const src of sources) {
    const p = path.join(PIPELINE_DIR, src);
    if (!fs.existsSync(p)) continue;
    all.push(...JSON.parse(fs.readFileSync(p, "utf-8")));
  }
  return all;
}

export function loadFeedData(): FeedEntry[] {
  const items = loadAllPipelineItems();

  // ── 提取 Project ──
  const projects: FeedProjectItem[] = [];
  const seenSlugs = new Set<string>();
  const seenUrls = new Set<string>();

  // 按分数降序，同一个产品取最高分的帖子
  const sorted = [...items].sort((a, b) => (b.density_score?.total ?? 0) - (a.density_score?.total ?? 0));

  for (const item of sorted) {
    if ((item.density_score?.total ?? 0) < 8) continue;

    // 找产品 URL
    const productLinks = (item.external_links || []).filter(isProductUrl);
    if (productLinks.length === 0) continue;

    const primaryUrl = productLinks[0];
    if (seenUrls.has(primaryUrl)) continue;

    // 提取名字
    const name = extractProductName(primaryUrl, item.body || "");
    if (!name || name.length < 2) continue;

    // 构建 Project
    const proj = pipelineToProject(item, name, primaryUrl);
    if (!proj) continue;
    if (seenSlugs.has(proj.slug)) continue;

    seenSlugs.add(proj.slug);
    seenUrls.add(primaryUrl);
    projects.push(proj);
  }

  // ── 精选 Post ──
  const maxPosts = Math.max(Math.floor(projects.length / 4), 3);
  const posts: FeedPostItem[] = [];

  for (const item of sorted) {
    if (posts.length >= maxPosts) break;
    if (item.inferred_type === "product_launch") continue;
    if (!WORTHY_POST_TYPES.has(item.inferred_type)) continue;
    if ((item.density_score?.total ?? 0) < 18) continue;

    posts.push({
      id: item.id,
      kind: "post",
      score: item.density_score?.total ?? 0,
      topic: item.inferred_type ?? "",
      source: item.source ?? "",
      title: item.title ?? "",
      body: item.body ?? "",
      author: item.author_name ?? "",
      postType: item.inferred_type ?? "other",
      sourceUrl: item.source_url ?? "",
      engagement: item.engagement ?? { likes: 0, comments: 0 },
      topics: [],
    });
  }

  return [...projects, ...posts];
}

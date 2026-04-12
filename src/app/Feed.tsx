"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { rankFeed, type FeedItem } from "@/lib/feed";
import Link from "next/link";

/* ============================================================
   Types
   ============================================================ */

export interface FeedProjectItem extends FeedItem {
  kind: "project";
  slug: string;
  name: string;
  tagline: string;
  url: string;
  screenshot: string;
  stage: string;
  stageColor: string;
  topics: string[];
  author?: string;
}

export interface FeedPostItem extends FeedItem {
  kind: "post";
  title: string;
  body: string;
  author: string;
  postType: string;
  sourceUrl: string;
  engagement: { likes: number; comments: number };
  topics: string[];
}

export type FeedEntry = FeedProjectItem | FeedPostItem;

const SN: Record<string, string> = {
  idea: "构思中", building: "开发中", launched: "已上线",
  revenue: "有收入", scaling: "增长中",
};

const PT: Record<string, string> = {
  product_launch: "产品", build_log: "复盘", revenue_milestone: "里程碑",
  tool_recommendation: "工具推荐", strategy_insight: "方法论",
  experience_share: "经验", tutorial: "教程", resource_collection: "合集",
  market_observation: "观察", failure_postmortem: "反思", idea: "想法",
  user_feedback: "反馈", other: "分享",
};

/* ============================================================
   Cards
   ============================================================ */

function ProjectCard({ item, onImageError }: { item: FeedProjectItem; onImageError?: (id: string) => void }) {
  const [imgOk, setImgOk] = useState(true);

  if (!imgOk) return null; // 图片加载失败，整个卡片隐藏

  return (
    <Link href={`/project/${item.slug}`} target="_blank" className="group block">
      <article className="overflow-hidden rounded-xl border border-border/40 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 cursor-pointer flex flex-col h-full">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.screenshot}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={() => { setImgOk(false); onImageError?.(item.id); }}
          />
        </div>
        <div className="p-3 flex flex-col flex-1">
          <h3 className="text-[13px] font-semibold truncate">{item.name}</h3>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex-1">{item.tagline}</p>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/10">
            <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ backgroundColor: item.stageColor }} />
            <span className="text-[10px] text-muted-foreground">{SN[item.stage] || item.stage}</span>
            {item.topics[0] && (
              <span className="ml-auto text-[9px] text-muted-foreground/40 bg-muted/40 rounded-full px-1.5 py-0.5">{item.topics[0]}</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

function PostCard({ item }: { item: FeedPostItem }) {
  return (
    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="group block">
      <article className="overflow-hidden rounded-xl border border-border/40 bg-[color-mix(in_oklch,var(--accent)_3%,var(--card)_97%)] shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 cursor-pointer p-3.5 flex flex-col h-full">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/8 text-primary/60 font-medium">{PT[item.postType] || "分享"}</span>
          <span className="text-[9px] text-muted-foreground/30">{item.author}</span>
        </div>
        <h3 className="text-[13px] font-semibold leading-snug line-clamp-2 flex-1">
          {item.title || item.body.slice(0, 60)}
        </h3>
        {item.body && !item.title && (
          <p className="text-[11px] text-muted-foreground/50 line-clamp-2 mt-1">{item.body.slice(0, 100)}</p>
        )}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/10">
          <span className="text-[9px] text-muted-foreground/30">{item.author}</span>
          {item.topics[0] && (
            <span className="ml-auto text-[9px] text-muted-foreground/40 bg-muted/40 rounded-full px-1.5 py-0.5">{item.topics[0]}</span>
          )}
        </div>
      </article>
    </a>
  );
}

/* ============================================================
   Feed
   ============================================================ */

export function Feed({ items, topicFilter }: { items: FeedEntry[]; topicFilter?: string | null }) {
  const [page, setPage] = useState(0);
  const [ranked, setRanked] = useState<FeedEntry[]>([]);
  const loaderRef = useRef<HTMLDivElement>(null);

  // 重新排序：topic 变化或首次加载
  useEffect(() => {
    const filtered = topicFilter
      ? items.filter(i => i.topics?.some(t => t.toLowerCase().includes(topicFilter.toLowerCase())))
      : items;
    setRanked(rankFeed(filtered));
    setPage(0);
  }, [items, topicFilter]);

  const pageSize = 12;
  const visible = ranked.slice(0, (page + 1) * pageSize);
  const hasMore = visible.length < ranked.length;

  // intersection observer for infinite scroll
  const loadMore = useCallback(() => {
    if (hasMore) setPage(p => p + 1);
  }, [hasMore]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (visible.length === 0) {
    return (
      <div className="text-center py-12 text-[13px] text-muted-foreground/40">
        {topicFilter ? `"${topicFilter}" 下暂无内容` : "暂无内容"}
      </div>
    );
  }

  return (
    <div>
      {topicFilter && (
        <div className="mb-4 text-[12px] text-muted-foreground/50">
          筛选：<span className="font-medium text-foreground/70">{topicFilter}</span>
          <span className="ml-2 text-muted-foreground/30">({ranked.length} 条)</span>
        </div>
      )}
      <div className="columns-1 sm:columns-2 gap-3 [column-fill:_balance]">
        {visible.map((item) => (
          <div key={item.id} className="break-inside-avoid mb-3">
            {item.kind === "project"
              ? <ProjectCard item={item as FeedProjectItem} />
              : <PostCard item={item as FeedPostItem} />
            }
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={loaderRef} className="py-8 text-center text-[11px] text-muted-foreground/25">
          加载更多...
        </div>
      )}
    </div>
  );
}

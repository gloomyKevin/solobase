import { getPostBySlug, getRelatedPosts, getRelatedProjectsForPost } from "@/lib/feed-data";
import { ChevronLeft, ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// ─── Type Labels ───

const TYPE_LABEL: Record<string, { text: string; color: string }> = {
  build_log:           { text: "复盘",   color: "#F59E0B" },
  revenue_report:      { text: "营收",   color: "#3B9B8B" },
  strategy_insight:    { text: "方法论", color: "#6C4FD6" },
  failure_postmortem:  { text: "反思",   color: "#EF4444" },
  tutorial:            { text: "教程",   color: "#3B82F6" },
  tool_recommendation: { text: "推荐",   color: "#DB6B25" },
  market_observation:  { text: "观察",   color: "#8B5CF6" },
  resource_collection: { text: "合集",   color: "#14B8A6" },
  experience_share:    { text: "经验",   color: "#F59E0B" },
  other:               { text: "分享",   color: "#9CA3AF" },
};

const SN: Record<string, string> = {
  idea: "构思中", building: "开发中", launched: "已上线", revenue: "有收入", scaling: "增长中",
};

// ─── Metadata ───

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getPostBySlug(id);
  if (!p) return { title: "内容未找到" };
  const description = (p.title ? p.body : p.body).replace(/\n/g, " ").slice(0, 140);
  return {
    title: `${p.title || p.body.slice(0, 40)} — Solobase`,
    description,
  };
}

// ─── Body Renderer ───
// 支持 ## 标题、**加粗**、- 无序列表、1. 有序列表、空行分段

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-foreground/80">{part.slice(2, -2)}</strong>
      : part
  );
}

function renderBody(text: string) {
  type Block = { type: "h2" | "p" | "li" | "ol_li"; content: string };
  const blocks: Block[] = [];
  let listItems: { type: "li" | "ol_li"; content: string }[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    listItems.forEach(item => blocks.push(item));
    listItems = [];
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }

    if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "h2", content: line.slice(3) });
    } else if (/^[-*•]\s/.test(line)) {
      listItems.push({ type: "li", content: line.replace(/^[-*•]\s/, "") });
    } else if (/^\d+[.)]\s/.test(line)) {
      listItems.push({ type: "ol_li", content: line.replace(/^\d+[.)]\s/, "") });
    } else {
      flushList();
      blocks.push({ type: "p", content: line });
    }
  }
  flushList();

  let olCounter = 0;
  return blocks.map((b, i) => {
    if (b.type !== "ol_li") olCounter = 0;

    if (b.type === "h2") {
      return <h2 key={i} className="text-[15px] font-bold mt-7 mb-2.5 text-foreground/85">{b.content}</h2>;
    }
    if (b.type === "li") {
      return (
        <div key={i} className="flex gap-2.5 pl-0.5 mb-1.5">
          <span className="shrink-0 mt-[9px] h-[4px] w-[4px] rounded-full bg-muted-foreground/30" />
          <p className="text-[14px] leading-[1.85] text-foreground/65">{renderInline(b.content)}</p>
        </div>
      );
    }
    if (b.type === "ol_li") {
      olCounter++;
      return (
        <div key={i} className="flex gap-2.5 pl-0.5 mb-1.5">
          <span className="shrink-0 text-[12px] text-muted-foreground/35 font-medium w-4 text-right mt-[3px]">{olCounter}.</span>
          <p className="text-[14px] leading-[1.85] text-foreground/65">{renderInline(b.content)}</p>
        </div>
      );
    }
    // paragraph
    return <p key={i} className="text-[14px] leading-[1.85] text-foreground/65 mb-3">{renderInline(b.content)}</p>;
  });
}

// ─── Page ───

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPostBySlug(id);
  if (!p) notFound();

  const relatedPosts = getRelatedPosts(id, 3);
  const relatedProjects = getRelatedProjectsForPost(p.body, 3);

  const typeInfo = TYPE_LABEL[p.type] || TYPE_LABEL.other;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title || p.body.slice(0, 80),
    description: p.body.replace(/\n/g, " ").slice(0, 160),
    ...(p.author && { author: { "@type": "Person", name: p.author } }),
    ...(p.publishedAt && { datePublished: p.publishedAt.slice(0, 10) }),
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/10">
        <div className="max-w-[680px] mx-auto px-4 sm:px-6 h-11 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />首页
          </Link>
          <Link href="/" className="font-latin text-[14px] font-bold tracking-tight text-foreground/25">solobase</Link>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-[680px] mx-auto px-4 sm:px-6 pt-8 pb-28">

        {/* ─── Meta bar ─── */}
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full font-medium shrink-0"
            style={{ background: typeInfo.color + "18", color: typeInfo.color }}
          >
            {typeInfo.text}
          </span>
          {p.readingTime > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/35">
              <Clock className="h-3 w-3" />{p.readingTime} 分钟
            </span>
          )}
          {p.publishedAt && (
            <span className="text-[11px] text-muted-foreground/30">
              {p.publishedAt.slice(0, 10)}
            </span>
          )}
        </div>

        {/* ─── Title ─── */}
        {p.title ? (
          <h1 className="text-[22px] sm:text-[25px] font-bold leading-tight tracking-tight">{p.title}</h1>
        ) : (
          <h1 className="text-[22px] sm:text-[25px] font-bold leading-tight tracking-tight text-foreground/70">
            {p.body.slice(0, 60)}
          </h1>
        )}

        {/* ─── Author ─── */}
        <div className="mt-4 flex items-center gap-3 pb-5 border-b border-border/12">
          <div className="h-8 w-8 rounded-full bg-primary/8 flex items-center justify-center text-[12px] text-primary/60 font-semibold shrink-0">
            {(p.author || "?")[0]}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-medium">{p.author || "匿名"}</span>
            {p.authorBio && (
              <p className="text-[11px] text-muted-foreground/40 mt-0.5 truncate">{p.authorBio}</p>
            )}
          </div>
          {(p.engagement?.likes > 0 || p.engagement?.comments > 0) && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/30 shrink-0">
              {p.engagement.likes > 0 && <span>{p.engagement.likes} 赞</span>}
              {p.engagement.comments > 0 && <span>{p.engagement.comments} 评论</span>}
            </div>
          )}
        </div>

        {/* ─── Body ─── */}
        <article className="mt-6 min-h-[200px]">
          {renderBody(p.body)}
        </article>

        {/* ─── Topics ─── */}
        {p.topics?.length > 0 && (
          <div className="mt-8 pt-5 border-t border-border/12">
            <div className="flex flex-wrap gap-1.5">
              {p.topics.map((t: string) => (
                <span key={t} className="text-[11px] px-2.5 py-0.5 rounded-md bg-primary/6 text-primary/60 font-medium">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Related Products ─── */}
        {relatedProjects.length > 0 && (
          <>
            <div className="mt-6 border-t border-border/12" />
            <div className="mt-5">
              <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">文中提到的产品</h3>
              <div className="space-y-2">
                {relatedProjects.map((r: any) => (
                  <Link
                    key={r.slug}
                    href={`/project/${r.slug}`}
                    target="_blank"
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-border/15 bg-card hover:border-border/30 transition-colors group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-muted/30 shrink-0 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.screenshot
                        ? <img src={r.screenshot} alt={r.name} className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center text-[12px] font-bold text-muted-foreground/30">{r.name?.[0]}</span>
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground/40 truncate">{r.tagline}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: r.stageColor }} />
                      <span className="text-[10px] text-muted-foreground/30">{SN[r.stage] || r.stage}</span>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-primary/50 transition-colors ml-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── Related Posts ─── */}
        {relatedPosts.length > 0 && (
          <>
            <div className="mt-6 border-t border-border/12" />
            <div className="mt-5">
              <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">相关内容</h3>
              <div className="space-y-2">
                {relatedPosts.map((r: any) => {
                  const rt = TYPE_LABEL[r.type] || TYPE_LABEL.other;
                  return (
                    <Link
                      key={r.slug}
                      href={`/post/${r.slug}`}
                      className="flex items-start gap-3 p-2.5 rounded-xl border border-border/15 bg-card hover:border-border/30 transition-colors group"
                    >
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-md font-medium shrink-0 mt-0.5"
                        style={{ background: rt.color + "12", color: rt.color }}
                      >
                        {rt.text}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                          {r.title || r.body?.slice(0, 60)}
                        </p>
                        <p className="text-[11px] text-muted-foreground/35 mt-1">
                          {r.author}
                          {r.topics?.[0] && <span className="ml-1.5">· {r.topics[0]}</span>}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

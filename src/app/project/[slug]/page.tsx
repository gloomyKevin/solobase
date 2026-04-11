import type { Metadata } from "next";
import { getDataService } from "@/services/data";
import { generateProjectMetadata, generateProjectJsonLd } from "@/lib/seo";
import { getCategoryLabel, projectStageOptions, stageColorMap } from "@/config/categories";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Project } from "@/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getDataService().getProject(slug);
  if (!project) return { title: "项目未找到" };
  return generateProjectMetadata(project);
}

function getMetrics(project: Project) {
  const metrics: { k: string; v: string }[] = [];

  const rangeLabels: Record<string, string> = {
    pre_revenue: "尚无收入", under_1k: "< $1k/月", "1k_5k": "$1k-5k/月",
    "5k_10k": "$5k-10k/月", "10k_50k": "$10k-50k/月", "50k_plus": "$50k+/月",
  };

  if (project.metrics?.revenueRange?.value && project.metrics.revenueRange.value !== "pre_revenue") {
    metrics.push({ k: "月收入", v: rangeLabels[project.metrics.revenueRange.value] ?? project.metrics.revenueRange.value });
  }
  if (project.metrics?.userCount?.value) {
    metrics.push({ k: "用户", v: project.metrics.userCount.value });
  }
  if (project.metrics?.launchedDate?.value) {
    metrics.push({ k: "上线", v: project.metrics.launchedDate.value });
  }
  if (project.metrics?.buildDuration?.value) {
    metrics.push({ k: "构建", v: project.metrics.buildDuration.value });
  }

  // 产品阶段始终显示
  metrics.push({ k: "阶段", v: getCategoryLabel(projectStageOptions, project.stage) });

  return metrics;
}

function getTimeline(project: Project) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (project as any)._pipeline;
  const events: { date: string; src?: string; text: string }[] = [];

  // 从 top_comments 提取有时间感的评论
  if (pipeline?.topComments?.length) {
    for (const c of pipeline.topComments.slice(0, 2)) {
      if (c.content && c.content.length > 10) {
        events.push({ date: "", src: c.author, text: `"${c.content.slice(0, 80)}"` });
      }
    }
  }

  // 发布时间
  if (project.publishedAt) {
    events.push({ date: project.publishedAt.slice(0, 10), text: "内容发布" });
  }

  return events;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ds = getDataService();
  const project = await ds.getProject(slug);
  if (!project) notFound();

  const stageLabel = getCategoryLabel(projectStageOptions, project.stage);
  const stageColor = project.stageColor ?? stageColorMap[project.stage] ?? "#9CA3AF";
  const screenshot = project.screenshots?.[0] ?? "";
  const metrics = getMetrics(project);
  const timeline = getTimeline(project);
  const tags = [...(project.tags?.track ?? []), ...(project.tags?.platform ?? [])].filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (project as any)._pipeline;
  const authorName = pipeline?.author || "";
  const authorBio = pipeline?.authorBio || "";
  const sourceLabel = pipeline?.source === "jike" ? "即刻" : pipeline?.source === "v2ex" ? "V2EX" : pipeline?.source || "";

  // 相关项目
  const related = await ds.getRelatedProjects(slug, "track", 3);

  // vibes（品味标签）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vibes: string[] = (project as any).vibes || [];

  const jsonLd = generateProjectJsonLd(project);

  return (
    <div className="min-h-screen bg-background">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/10">
        <div className="max-w-[860px] mx-auto px-4 sm:px-6 h-11 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />返回
          </Link>
          <Link href="/" className="font-latin text-[14px] font-bold tracking-tight text-foreground/25">solobase</Link>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-4 sm:px-6 pt-5 pb-28">
        {/* top: info + screenshot */}
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 md:items-start">
          {/* left: core info */}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-bold leading-tight">{project.name}</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: stageColor + "15", color: stageColor }}>
                {stageLabel}
              </span>
              <a href={project.url} target="_blank" rel="noopener noreferrer" className="ml-auto hidden md:inline-flex items-center gap-1 text-[12px] text-primary font-medium hover:underline">
                访问产品 <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground/65 leading-relaxed">{project.tagline}</p>

            {/* insight */}
            {project.featuredInsight && (
              <div className="mt-4 pl-3 border-l-[2.5px] border-primary/25">
                <p className="text-[15px] font-semibold leading-[1.75] text-foreground/90">{project.featuredInsight}</p>
              </div>
            )}

            {/* vibes */}
            {vibes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {vibes.map((v) => (
                  <span key={v} className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/8 text-primary/60 font-medium">{v}</span>
                ))}
              </div>
            )}

            {/* metrics */}
            {metrics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {metrics.map((m) => (
                  <span key={m.k} className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-[5px] rounded-lg bg-muted/40">
                    <span className="text-muted-foreground/45">{m.k}</span>
                    <span className="font-semibold text-foreground/75">{m.v}</span>
                  </span>
                ))}
              </div>
            )}

            {/* creator */}
            {authorName && (
              <div className="mt-4 flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-[11px] text-muted-foreground/50 font-medium shrink-0">
                  {authorName[0]}
                </div>
                <div className="min-w-0">
                  <span className="text-[13px] font-medium">{authorName}</span>
                  {authorBio && <span className="text-[11px] text-muted-foreground/45 ml-1.5">{authorBio.slice(0, 50)}</span>}
                </div>
              </div>
            )}
          </div>

          {/* right: screenshot */}
          {screenshot ? (
            <a href={project.url} target="_blank" rel="noopener noreferrer" className="group block mt-4 md:mt-0 rounded-xl overflow-hidden bg-muted/20 border border-border/15 hover:border-border/30 transition-colors">
              <div className="aspect-[16/10] bg-cover bg-center relative" style={{ backgroundImage: `url(${screenshot})` }}>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/8">
                  <span className="bg-black/50 text-white text-[11px] px-3 py-1 rounded-full flex items-center gap-1">
                    访问 <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </a>
          ) : (
            <div className="mt-4 md:mt-0 aspect-[16/10] rounded-xl bg-muted/20 border border-border/15 flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground/30">暂无截图</span>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-border/12" />

        {/* narrative */}
        <article className="mt-5 space-y-3">
          {project.description.split("\n\n").filter(Boolean).slice(0, 3).map((paragraph, i) => (
            <p key={i} className="text-[14px] leading-[1.85] text-foreground/70">{paragraph.slice(0, 300)}</p>
          ))}
          {sourceLabel && (
            <p className="text-[11px] text-muted-foreground/30">内容来源：{sourceLabel}</p>
          )}
        </article>

        {/* timeline */}
        {timeline.length > 0 && (
          <div className="mt-7">
            <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">动态</h3>
            {timeline.map((ev, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center pt-[7px]">
                  <div className="h-[5px] w-[5px] rounded-full bg-muted-foreground/20 shrink-0" />
                  {i < timeline.length - 1 && <div className="w-px flex-1 bg-border/15 my-0.5" />}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-[11px] text-muted-foreground/35">
                    {ev.date}
                    {ev.src && <span className="ml-1 text-muted-foreground/25">· {ev.src}</span>}
                  </p>
                  <p className="text-[13px] text-foreground/60 leading-relaxed mt-0.5">{ev.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* tags */}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-muted/30 text-muted-foreground/40">{t}</span>
            ))}
          </div>
        )}

        <div className="mt-6 border-t border-border/12" />

        {/* related */}
        {related.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">相关产品</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
              {related.map((r) => (
                <Link key={r.slug} href={`/project/${r.slug}`} className="shrink-0 w-[180px] rounded-xl border border-border/15 bg-card overflow-hidden hover:border-border/30 transition-colors">
                  {r.screenshots?.[0] ? (
                    <div className="aspect-[16/10] bg-cover bg-center" style={{ backgroundImage: `url(${r.screenshots[0]})` }} />
                  ) : (
                    <div className="aspect-[16/10] bg-muted/20 flex items-center justify-center">
                      <span className="text-[11px] text-muted-foreground/20">{r.name[0]}</span>
                    </div>
                  )}
                  <div className="px-2.5 py-2">
                    <p className="text-[13px] font-medium leading-tight">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground/45 mt-0.5">{r.tagline?.slice(0, 25)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* floating CTA (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="bg-background/90 backdrop-blur-md border-t border-border/10 px-4 py-2.5 flex items-center gap-3 max-w-[860px] mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold truncate">{project.name}</p>
            <p className="text-[11px] text-muted-foreground/45 truncate">{project.tagline}</p>
          </div>
          <a href={project.url} target="_blank" rel="noopener noreferrer" className="shrink-0 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors">
            访问 →
          </a>
        </div>
      </div>
    </div>
  );
}

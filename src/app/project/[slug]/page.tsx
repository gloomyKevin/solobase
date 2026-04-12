import { getProjectBySlug, getRelatedProjects } from "@/lib/feed-data";
import { ArrowUpRight, ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getProjectBySlug(slug);
  if (!p) return { title: "项目未找到" };
  return { title: `${p.name} — Solobase`, description: p.tagline };
}

const SN: Record<string, string> = {
  idea: "构思中", building: "开发中", launched: "已上线", revenue: "有收入", scaling: "增长中",
};

function cleanBody(text: string): string {
  return text
    .replace(/@[\w\u4e00-\u9fff]+/g, '')
    .replace(/即友们?|佬友们?|佬们/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/👉|👇|👆|🔗|📍|📱|⏬/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getProjectBySlug(slug);
  if (!p) notFound();

  const qualityComments = (p.topComments || [])
    .filter((c: any) => c.content?.length > 20)
    .slice(0, 5);

  const byTopic = p.topics?.length > 0 ? getRelatedProjects(slug, 6, "topic") : [];
  const byAuthor = p.author ? getRelatedProjects(slug, 4, "author") : [];

  const cleaned = cleanBody(p.description || "");
  const paragraphs = cleaned.split(/\n{2,}/).filter((s: string) => s.trim().length > 15);

  // 时间轴：产品自身的里程碑
  // 冷启动阶段：发帖时间 ≈ 产品发布/分享时间，是产品的真实节点
  // 原生阶段：maker 填写完整的里程碑（开发、上线、营收突破等）
  const milestones: { date: string; text: string }[] = [
    ...((p.milestones as any[]) || []),
  ];
  if (p.publishedAt) {
    milestones.push({ date: p.publishedAt.slice(0, 10), text: "产品发布" });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: p.name,
    description: p.tagline,
    url: p.url,
    ...(p.screenshot && { image: p.screenshot }),
    ...(p.author && { author: { "@type": "Person", name: p.author } }),
    ...(p.publishedAt && { datePublished: p.publishedAt.slice(0, 10) }),
    applicationCategory: p.topics?.[0] || "Utility",
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/10">
        <div className="max-w-[860px] mx-auto px-4 sm:px-6 h-11 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />首页
          </Link>
          <Link href="/" className="font-latin text-[14px] font-bold tracking-tight text-foreground/25">solobase</Link>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-4 sm:px-6 pt-5 pb-28">

        {/* ─── Hero ─── */}
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 md:items-start">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-bold leading-tight">{p.name}</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: p.stageColor + "15", color: p.stageColor }}>
                {SN[p.stage] || p.stage}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] text-muted-foreground/65 leading-relaxed">{p.tagline}</p>

            {/* CTA */}
            <a href={p.url} target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90">
              访问产品 <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {/* topics */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.topics?.map((t: string) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-primary/6 text-primary/70 font-medium">{t}</span>
              ))}
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted/40 text-muted-foreground/40">{SN[p.stage]}</span>
            </div>

            {/* creator */}
            {p.author && (
              <div className="mt-4 flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-[11px] text-muted-foreground/50 font-medium shrink-0">
                  {p.author[0]}
                </div>
                <div className="min-w-0">
                  <span className="text-[13px] font-medium">{p.author}</span>
                  {p.authorBio && <span className="text-[11px] text-muted-foreground/45 ml-1.5">{p.authorBio.slice(0, 60)}</span>}
                </div>
              </div>
            )}
          </div>

          {/* screenshot */}
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block mt-4 md:mt-0 rounded-xl overflow-hidden bg-muted/20 border border-border/15 hover:border-border/30 transition-colors">
            <div className="aspect-[16/10] relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.screenshot} alt={p.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/8">
                <span className="bg-black/50 text-white text-[11px] px-3 py-1 rounded-full flex items-center gap-1">
                  访问 <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </a>
        </div>

        <div className="mt-6 border-t border-border/12" />

        {/* ─── About ─── */}
        <div className="mt-5">
          <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">关于这个产品</h3>
          <article className="space-y-3">
            {paragraphs.slice(0, 4).map((para: string, i: number) => (
              <p key={i} className="text-[14px] leading-[1.85] text-foreground/70">{para.slice(0, 400)}</p>
            ))}
          </article>
          {p.author && (
            <p className="mt-3 text-[11px] text-muted-foreground/30">由 {p.author} 分享</p>
          )}
        </div>

        {/* ─── Timeline ─── */}
        {milestones.length > 0 && (
          <>
            <div className="mt-6 border-t border-border/12" />
            <div className="mt-5">
              <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">时间线</h3>
              {milestones.map((m, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center pt-[7px]">
                    <div className="h-[6px] w-[6px] rounded-full bg-primary/40 shrink-0" />
                    {i < milestones.length - 1 && <div className="w-px flex-1 bg-border/15 my-0.5" />}
                  </div>
                  <div className="pb-3.5 min-w-0">
                    <p className="text-[11px] text-muted-foreground/35">{m.date}</p>
                    <p className="text-[13px] text-foreground/70 leading-relaxed mt-0.5">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─── Community Voices ─── */}
        {qualityComments.length > 0 && (
          <>
            <div className="mt-6 border-t border-border/12" />
            <div className="mt-5">
              <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">社区怎么说</h3>
              {qualityComments.map((c: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center pt-[7px]">
                    <div className={`h-[6px] w-[6px] rounded-full shrink-0 ${c.likes >= 10 ? 'bg-primary/50' : 'bg-muted-foreground/20'}`} />
                    {i < qualityComments.length - 1 && <div className="w-px flex-1 bg-border/15 my-0.5" />}
                  </div>
                  <div className="pb-3.5 min-w-0">
                    <p className={`text-[13px] leading-relaxed ${c.likes >= 10 ? 'text-foreground/75' : 'text-foreground/55'}`}>
                      &ldquo;{c.content}&rdquo;
                    </p>
                    <p className="text-[11px] text-muted-foreground/30 mt-0.5">
                      {c.author}
                      {c.likes > 0 && <span className="ml-1.5">· {c.likes} 人觉得有用</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─── Recommendations ─── */}
        {byTopic.length > 0 && (
          <>
            <div className="mt-6 border-t border-border/12" />
            <RecommendSection title={`更多${p.topics?.[0] || "相关"}产品`} items={byTopic} />
          </>
        )}
        {byAuthor.length > 0 && (
          <RecommendSection title={`${p.author} 的其他作品`} items={byAuthor} />
        )}
      </main>

      {/* mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="bg-background/90 backdrop-blur-md border-t border-border/10 px-4 py-2.5 flex items-center gap-3 max-w-[860px] mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold truncate">{p.name}</p>
            <p className="text-[11px] text-muted-foreground/45 truncate">{p.tagline}</p>
          </div>
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors">
            访问 →
          </a>
        </div>
      </div>
    </div>
  );
}

function RecommendSection({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="mt-5">
      <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">{title}</h3>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
        {items.map((r: any) => (
          <Link key={r.slug} href={`/project/${r.slug}`} target="_blank" className="shrink-0 w-[160px] rounded-xl border border-border/15 bg-card overflow-hidden hover:border-border/30 transition-colors">
            <div className="aspect-[16/10] overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.screenshot} alt={r.name} className="w-full h-full object-cover" />
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[12px] font-medium leading-tight truncate">{r.name}</p>
              <p className="text-[10px] text-muted-foreground/45 mt-0.5 truncate">{r.tagline?.slice(0, 30)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

import { ArrowUpRight, ChevronLeft } from "lucide-react";
import Link from "next/link";

/* ── hardcoded demo data ─────────────────────────────────── */
const p = {
  name: "写手 AI",
  tagline: "小红书爆款文案生成器，10 秒出 5 条标题",
  url: "https://ai-copywriter.example.com",
  screenshot: "https://placehold.co/800x500/E8E2D8/b8a99a?text=%E5%86%99%E6%89%8BAI",
  insight: "非技术出身，3 周做出月入 $2000 的小红书工具",
  insightSource: "据创始人在即刻分享",
  stage: "有收入",
  stageColor: "#3B9B8B",
  metrics: [
    { k: "月收入", v: "$1-5k" },
    { k: "用户", v: "5,000+" },
    { k: "上线", v: "2026-02" },
    { k: "构建", v: "~3 周" },
  ],
  creator: { name: "陈小明", bio: "前运营 · 非技术背景 · 2025 年开始用 AI 做产品" },
  desc: "专为小红书内容创作者打造，输入产品关键词，10 秒生成 5 条爆款标题和配套文案。通过精准的付费投放快速起量，ROI 稳定在 3x 以上。",
  story:
    "做小红书运营时发现写标题是最痛苦的环节，AI 正好能解决。用 Next.js + OpenAI API 部署在 Vercel，3 周出了 MVP。最大的坑是文案质量不稳定，靠大量 prompt engineering 才稳住。获客靠小红书信息流投放，ROI 稳定后逐步放量，目前月入 $1-5k，正在做小程序版本。",
  storySource: "综合即刻动态与小红书帖子整理",
  tags: ["AI", "内容创作", "订阅制", "付费投放", "小程序"],
  timeline: [
    { date: "03-15", src: "即刻", text: "\u201c三月收入突破 $2000，信息流 ROI 稳定 3x\u201d" },
    { date: "02-28", src: "小红书", text: "\u201c用了这个工具后写标题效率翻倍\u201d \u2014 用户" },
    { date: "02-10", text: "产品正式上线" },
    { date: "01-20", text: "开始构建 MVP" },
  ],
  related: [
    { name: "PhotoAI Editor", tag: "AI 产品图", sc: "https://placehold.co/400x250/F3EEE6/c4b5a5?text=PhotoAI" },
    { name: "SEO Dashboard", tag: "关键词追踪", sc: "https://placehold.co/400x250/E6F0E8/a5b8aa?text=SEO" },
    { name: "简历匠", tag: "AI 简历", sc: "https://placehold.co/400x250/F0E6F3/b8a5c4?text=Resume" },
  ],
};

/* ── page ─────────────────────────────────────────────────── */
export default function DemoProductPage() {
  return (
    <div className="min-h-screen bg-background">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      {/* ── header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/10">
        <div className="max-w-[860px] mx-auto px-4 sm:px-6 h-11 flex items-center justify-between">
          <Link href="/demo" className="flex items-center gap-0.5 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />返回
          </Link>
          <span className="font-latin text-[14px] font-bold tracking-tight text-foreground/25">solobase</span>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-4 sm:px-6 pt-5 pb-28">
        {/* ── top: info + screenshot ─────────────────────── */}
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 md:items-start">
          {/* left: core info */}
          <div>
            {/* name row */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[20px] font-bold leading-tight">{p.name}</h1>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
                style={{ background: p.stageColor + "15", color: p.stageColor }}
              >
                {p.stage}
              </span>
              {/* desktop visit */}
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto hidden md:inline-flex items-center gap-1 text-[12px] text-primary font-medium hover:underline"
              >
                访问产品 <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground/65 leading-relaxed">{p.tagline}</p>

            {/* insight */}
            <div className="mt-4 pl-3 border-l-[2.5px] border-primary/25">
              <p className="text-[15px] font-semibold leading-[1.75] text-foreground/90">{p.insight}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/40">{p.insightSource}</p>
            </div>

            {/* metrics */}
            <div className="mt-4 flex flex-wrap gap-2">
              {p.metrics.map((m) => (
                <span key={m.k} className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-[5px] rounded-lg bg-muted/40">
                  <span className="text-muted-foreground/45">{m.k}</span>
                  <span className="font-semibold text-foreground/75">{m.v}</span>
                </span>
              ))}
            </div>

            {/* creator */}
            <div className="mt-4 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-[11px] text-muted-foreground/50 font-medium shrink-0">
                {p.creator.name[0]}
              </div>
              <div className="min-w-0">
                <span className="text-[13px] font-medium">{p.creator.name}</span>
                <span className="text-[11px] text-muted-foreground/45 ml-1.5">{p.creator.bio}</span>
              </div>
            </div>
          </div>

          {/* right: screenshot */}
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block mt-4 md:mt-0 rounded-xl overflow-hidden bg-muted/20 border border-border/15 hover:border-border/30 transition-colors"
          >
            <div
              className="aspect-[16/10] bg-cover bg-center relative"
              style={{ backgroundImage: `url(${p.screenshot})` }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/8">
                <span className="bg-black/50 text-white text-[11px] px-3 py-1 rounded-full flex items-center gap-1">
                  访问 <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </a>
        </div>

        {/* ── divider ────────────────────────────────────── */}
        <div className="mt-6 border-t border-border/12" />

        {/* ── narrative ──────────────────────────────────── */}
        <article className="mt-5 space-y-3">
          <p className="text-[14px] leading-[1.85] text-foreground/70">{p.desc}</p>
          <p className="text-[14px] leading-[1.85] text-foreground/70">{p.story}</p>
          <p className="text-[11px] text-muted-foreground/30">{p.storySource}</p>
        </article>

        {/* ── timeline ───────────────────────────────────── */}
        <div className="mt-7">
          <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">产品动态</h3>
          {p.timeline.map((ev, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-[7px]">
                <div className="h-[5px] w-[5px] rounded-full bg-muted-foreground/20 shrink-0" />
                {i < p.timeline.length - 1 && <div className="w-px flex-1 bg-border/15 my-0.5" />}
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

        {/* ── tags ────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-muted/30 text-muted-foreground/40">{t}</span>
          ))}
        </div>

        {/* ── divider ────────────────────────────────────── */}
        <div className="mt-6 border-t border-border/12" />

        {/* ── related ────────────────────────────────────── */}
        <div className="mt-5">
          <h3 className="text-[12px] font-medium text-muted-foreground/35 mb-3">相关产品</h3>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
            {p.related.map((r) => (
              <div key={r.name} className="shrink-0 w-[180px] rounded-xl border border-border/15 bg-card overflow-hidden hover:border-border/30 transition-colors cursor-pointer">
                <div className="aspect-[16/10] bg-cover bg-center" style={{ backgroundImage: `url(${r.sc})` }} />
                <div className="px-2.5 py-2">
                  <p className="text-[13px] font-medium leading-tight">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground/45 mt-0.5">{r.tag}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── floating CTA (mobile) ────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="bg-background/90 backdrop-blur-md border-t border-border/10 px-4 py-2.5 flex items-center gap-3 max-w-[860px] mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold truncate">{p.name}</p>
            <p className="text-[11px] text-muted-foreground/45 truncate">{p.tagline}</p>
          </div>
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors"
          >
            访问 →
          </a>
        </div>
      </div>
    </div>
  );
}

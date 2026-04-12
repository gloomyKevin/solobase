"use client";

import { useState, useRef } from "react";
import { Heart, TrendingUp, Plus, ArrowRight, LayoutGrid, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
// Link unused — all cards now open product URLs in new tab

/* ============================================================
   Types
   ============================================================ */

interface ProjectData {
  slug: string; name: string; tagline: string; screenshot: string;
  url?: string; stage: string; stageColor: string; revenue: string | null;
  founderType: string; buildEffort: string; isEditorsPick: boolean;
  featuredInsight?: string;
}

interface LayoutItem {
  id: string;
  type: string;
  dataSrc: string;
  span: 1 | 3;
}

/* ============================================================
   Container registry
   span: 1 = 1/3 width (pairs with 2 others)
   span: 3 = full width (standalone row)
   ============================================================ */

const TYPES: Record<string, { name: string; desc: string; span: 1 | 3; compat: string[] }> = {
  A: { name: "大图", desc: "视觉冲击", span: 3, compat: ["编辑精选", "热门", "最新", "在赚钱的"] },
  B: { name: "标准卡", desc: "图文主力", span: 1, compat: ["热门", "最新", "在赚钱的", "AI 做的", "轻量创造", "想法"] },
  C: { name: "紧凑行", desc: "三联高密度", span: 3, compat: ["热门", "最新", "在赚钱的", "AI 做的", "想法"] },
  D: { name: "文字块", desc: "想法/洞察", span: 1, compat: ["想法", "编辑洞察"] },
  E: { name: "胶囊行", desc: "人/分类", span: 3, compat: ["创作者", "分类入口"] },
  F: { name: "数字面板", desc: "指标一览", span: 3, compat: ["平台统计"] },
  G: { name: "排行榜", desc: "热门排名", span: 3, compat: ["热门", "最新", "在赚钱的", "轻量创造"] },
  H: { name: "轮播", desc: "横滑预览", span: 3, compat: ["最新", "热门", "在赚钱的", "AI 做的", "轻量创造"] },
  I: { name: "引述", desc: "大字金句", span: 1, compat: ["编辑精选", "编辑洞察"] },
  J: { name: "拼贴", desc: "合集入口", span: 1, compat: ["在赚钱的", "AI 做的", "轻量创造", "编辑精选"] },
  K: { name: "通栏", desc: "数据/公告", span: 3, compat: ["平台统计", "本周动态"] },
};

/* ============================================================
   Static data
   ============================================================ */

// 从真实管道数据中提取的经验帖洞察
const IDEAS = [
  { text: "出海前 1000 用户获取实操清单：Reddit 监控竞品关键词 + 各社群冷启动", author: "42要早睡早起", tags: ["出海", "增长"], saves: 12 },
  { text: "独立开发 2 年，把 SEO 关键词直接做成产品功能页是核心获客策略", author: "Indie-Maker-Fox", tags: ["SEO", "SaaS"], saves: 389 },
  { text: "MRR 破 1000 的两个关键：Reddit 监控品牌词 + 回复中只发产品名不贪心带链接", author: "我是恬恬酱", tags: ["变现", "出海"], saves: 38 },
  { text: "翻石头挖需求找 PMF，分析 toolify 美区榜前 200 的产品趋势", author: "张翼Joey", tags: ["选品", "AI"], saves: 5 },
];

// 真实创作者（来自即刻抓取数据）
const CREATORS = [
  { name: "AGENT橘", bio: "ColaOS/MarsWave CEO · TypeNo", emoji: "🚀" },
  { name: "西元Levy", bio: "FateTell · 玄学出海", emoji: "🔮" },
  { name: "Alchian花生", bio: "Claude Code 橙皮书作者", emoji: "📙" },
  { name: "歸藏", bio: "AI 设计师 · AIGC Weekly", emoji: "🎨" },
  { name: "玉伯", bio: "YouMind · AI创作工具", emoji: "🌲" },
];

// 真实数据驱动的分类
const CATEGORIES = [
  { emoji: "💰", label: "在赚钱的", sub: "2 个创造" },
  { emoji: "🤖", label: "AI 相关", sub: "8 个创造" },
  { emoji: "🌏", label: "出海产品", sub: "3 个创造" },
  { emoji: "🔧", label: "开发者工具", sub: "5 个创造" },
  { emoji: "✨", label: "小而美", sub: "4 个创造" },
];

const SN: Record<string, string> = { idea: "构思中", building: "开发中", launched: "已上线", revenue: "有收入", scaling: "增长中" };

function resolve(src: string, projects: ProjectData[]): ProjectData[] {
  switch (src) {
    case "编辑精选": return projects.filter(p => p.isEditorsPick);
    case "热门": return projects.slice(0, 6);
    case "最新": return [...projects].reverse();
    case "在赚钱的": return projects.filter(p => p.stage === "revenue" || p.stage === "scaling");
    case "AI 做的": return projects.filter(p => p.founderType === "non_tech_ai");
    case "轻量创造": return projects.filter(p => p.buildEffort === "weekend" || p.buildEffort === "monthly");
    default: return projects;
  }
}

/* ============================================================
   Default layout — only span 1 and span 3, no imbalance
   ============================================================ */

const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: "1", type: "A", dataSrc: "编辑精选", span: 3 },
  { id: "2", type: "E", dataSrc: "创作者", span: 3 },
  { id: "3", type: "G", dataSrc: "热门", span: 3 },
  { id: "4", type: "I", dataSrc: "编辑精选", span: 1 },
  { id: "5", type: "J", dataSrc: "在赚钱的", span: 1 },
  { id: "6", type: "D", dataSrc: "想法", span: 1 },
  { id: "7", type: "K", dataSrc: "平台统计", span: 3 },
];

/* ============================================================
   DynamicGrid
   ============================================================ */

export function DynamicGrid({ projects, onTopicFilter }: { projects: ProjectData[]; onTopicFilter?: (topic: string | null) => void }) {
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const nextId = useRef(100);

  const remove = (id: string) => { setLayout(l => l.filter(i => i.id !== id)); setSheetId(null); };
  const move = (id: string, dir: -1 | 1) => {
    setLayout(l => {
      const i = l.findIndex(x => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  };
  const changeSrc = (id: string, src: string) => setLayout(l => l.map(i => i.id === id ? { ...i, dataSrc: src } : i));
  const add = (type: string) => {
    const t = TYPES[type];
    nextId.current += 1;
    setLayout(l => [...l, { id: String(nextId.current), type, dataSrc: t.compat[0], span: t.span }]);
    setAddOpen(false);
  };

  const activeItem = sheetId ? layout.find(i => i.id === sheetId) : null;
  const activeIdx = sheetId ? layout.findIndex(i => i.id === sheetId) : -1;

  // Track per-source index to avoid duplicate content
  const srcCounters: Record<string, number> = {};
  function nextIdx(src: string) {
    if (!srcCounters[src]) srcCounters[src] = 0;
    return srcCounters[src]++;
  }

  // Group items into explicit rows — each row controls its own grid
  // This avoids cross-row CSS conflicts entirely
  const rows: LayoutItem[][] = [];
  let buf: LayoutItem[] = [];
  for (const item of layout) {
    if (item.span === 3) {
      if (buf.length) { rows.push(buf); buf = []; }
      rows.push([item]);
    } else {
      buf.push(item);
      if (buf.length === 3) { rows.push(buf); buf = []; }
    }
  }
  if (buf.length) rows.push(buf);

  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((row, ri) => {
          const full = row.length === 1 && row[0].span === 3;
          const n = row.length;

          // Full-width row: no grid needed
          if (full) {
            const item = row[0];
            return (
              <div key={item.id}
                className={editing ? "cursor-pointer" : undefined}
                onClick={editing ? () => { setSheetId(item.id); setAddOpen(false); } : undefined}
              >
                <div className={cn("h-full relative", editing && "animate-[jiggle_0.25s_ease-in-out_infinite_alternate]")}>
                  {editing && <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/20 pointer-events-none z-10" />}
                  <RenderContainer item={item} projects={projects} seqIdx={nextIdx(item.dataSrc)} onTopicFilter={onTopicFilter} />
                </div>
              </div>
            );
          }

          // Span-1 items: row-level grid
          // n=3 → 3 cols on desktop, 2 on mobile (last wraps full)
          // n=2 → always 2 cols
          // n=1 → full width
          return (
            <div key={`row-${ri}`} className={cn(
              "grid gap-3 items-stretch",
              n === 3 ? "grid-cols-2 md:grid-cols-3" :
              n === 2 ? "grid-cols-2" :
              "grid-cols-1"
            )}>
              {row.map((item, i) => {
                // Triplet orphan: 3rd item on 2-col mobile wraps to full width
                const isOrphan = n === 3 && i === 2;
                return (
                  <div key={item.id}
                    className={cn(
                      isOrphan && "col-span-2 md:col-span-1",
                      editing && "cursor-pointer"
                    )}
                    onClick={editing ? () => { setSheetId(item.id); setAddOpen(false); } : undefined}
                  >
                    <div className={cn("h-full relative", editing && "animate-[jiggle_0.25s_ease-in-out_infinite_alternate]")}>
                      {editing && <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/20 pointer-events-none z-10" />}
                      <RenderContainer item={item} projects={projects} seqIdx={nextIdx(item.dataSrc)} onTopicFilter={onTopicFilter} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {editing && (
          <button onClick={() => { setAddOpen(true); setSheetId(null); }}
            className="w-full rounded-2xl border-2 border-dashed border-primary/15 hover:border-primary/30 bg-primary/[0.02] hover:bg-primary/[0.04] py-5 flex flex-col items-center gap-1.5 transition-all active:scale-[0.99] mt-1">
            <Plus className="h-5 w-5 text-primary/30" />
            <span className="text-[12px] font-medium text-primary/40">添加模块</span>
          </button>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditing(e => !e); setSheetId(null); setAddOpen(false); }}
        className={cn("fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 h-10 text-[12px] font-medium shadow-lg transition-all",
          editing ? "bg-primary text-primary-foreground" : "bg-foreground/90 text-background hover:bg-foreground")}>
        <LayoutGrid className="h-3.5 w-3.5" />
        {editing ? "完成" : "自定义"}
      </button>

      {/* Config sheet */}
      {activeItem && (
        <Sheet onClose={() => setSheetId(null)}>
          <h3 className="text-[15px] font-semibold">{TYPES[activeItem.type]?.name}</h3>
          <p className="text-[11px] font-medium text-muted-foreground/50 mt-5 mb-2">数据源</p>
          <div className="space-y-0.5">
            {(TYPES[activeItem.type]?.compat ?? []).map(src => (
              <button key={src} onClick={() => changeSrc(activeItem.id, src)}
                className={cn("flex items-center w-full rounded-xl px-3.5 py-2.5 text-[13px] text-left transition-colors",
                  activeItem.dataSrc === src ? "bg-primary/8 text-primary font-medium" : "hover:bg-muted/40 text-foreground/70")}>
                <span className={cn("h-4 w-4 rounded-full border-2 mr-3 flex items-center justify-center shrink-0",
                  activeItem.dataSrc === src ? "border-primary" : "border-border")}>
                  {activeItem.dataSrc === src && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>{src}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground/50 mt-5 mb-2">位置</p>
          <div className="flex gap-2">
            <button disabled={activeIdx <= 0} onClick={() => move(activeItem.id, -1)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border/40 py-2.5 text-[12px] text-foreground/70 hover:bg-muted/40 transition-colors disabled:opacity-25 disabled:pointer-events-none">
              <ChevronUp className="h-3.5 w-3.5" />上移</button>
            <button disabled={activeIdx >= layout.length - 1} onClick={() => move(activeItem.id, 1)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border/40 py-2.5 text-[12px] text-foreground/70 hover:bg-muted/40 transition-colors disabled:opacity-25 disabled:pointer-events-none">
              <ChevronDown className="h-3.5 w-3.5" />下移</button>
          </div>
          <button onClick={() => remove(activeItem.id)} className="flex items-center gap-2 mt-5 px-3.5 py-2.5 rounded-xl text-[13px] text-destructive/70 hover:bg-destructive/5 w-full">
            <Trash2 className="h-3.5 w-3.5" />移除此模块</button>
        </Sheet>
      )}

      {/* Add sheet */}
      {addOpen && (
        <Sheet onClose={() => setAddOpen(false)}>
          <h3 className="text-[15px] font-semibold mb-4">添加模块</h3>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(TYPES).map(([key, t]) => (
              <button key={key} onClick={() => add(key)}
                className="rounded-xl border border-border/40 hover:border-primary/30 p-3 text-left transition-all hover:bg-primary/[0.02] active:scale-95">
                <div className="flex items-center gap-1.5">
                  <span className="font-latin text-[10px] font-bold text-muted-foreground/20">{key}</span>
                  <span className="text-[8px] text-muted-foreground/30">{t.span === 3 ? "整行" : "1/3"}</span>
                </div>
                <p className="text-[12px] font-semibold mt-0.5">{t.name}</p>
                <p className="text-[9px] text-muted-foreground/40">{t.desc}</p>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ============================================================
   Sheet
   ============================================================ */

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/8 backdrop-blur-[2px]" />
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl border-t border-border/40 shadow-[var(--shadow-elevated)] max-h-[60vh] overflow-auto animate-[slideUp_0.2s_ease-out]"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card pt-3 pb-2 flex justify-center"><div className="w-8 h-1 rounded-full bg-border/60" /></div>
        <div className="px-5 pb-8">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Container renderer
   All containers: h-full + flex col for uniform row height
   ============================================================ */

function RenderContainer({ item, projects, seqIdx, onTopicFilter }: {
  item: LayoutItem; projects: ProjectData[]; seqIdx: number; onTopicFilter?: (topic: string | null) => void;
}) {
  const ps = resolve(item.dataSrc, projects);

  switch (item.type) {

    /* ─── A: Hero — full-width horizontal layout ─── */
    case "A": {
      const p = ps[seqIdx % Math.max(ps.length, 1)] ?? projects[0];
      if (!p) return null;
      return (
        <a href={`/project/${p.slug}`} target="_blank" className="block h-full"><article className="group overflow-hidden rounded-2xl bg-card border border-border/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 h-full flex flex-col md:flex-row cursor-pointer">
          <div className="relative md:w-[55%] shrink-0 aspect-[16/9] md:aspect-auto md:min-h-[200px] overflow-hidden bg-muted">
            <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]" style={{ backgroundImage: `url(${p.screenshot})` }} />
            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/30 via-transparent to-transparent" />
            {p.revenue && <span className="absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm bg-secondary/15 text-secondary">💰 {p.revenue}</span>}
          </div>
          <div className="flex-1 p-4 md:p-5 flex flex-col justify-center">
            <h3 className="text-[16px] md:text-[18px] font-semibold leading-snug">{p.name}</h3>
            <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">{p.tagline}</p>
            {p.featuredInsight && <p className="text-[12px] text-muted-foreground/50 italic mt-3 line-clamp-2">&ldquo;{p.featuredInsight}&rdquo;</p>}
            <div className="flex items-center gap-2 mt-3">
              <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: p.stageColor }} />
              <span className="text-[11px] text-muted-foreground">{SN[p.stage]}</span>
              <Heart className="ml-auto h-3.5 w-3.5 text-muted-foreground/20" />
            </div>
          </div>
        </article></a>
      );
    }

    /* ─── B: Standard — span-1, h-full stretches to row ─── */
    case "B": {
      if (item.dataSrc === "想法") {
        const idea = IDEAS[seqIdx % IDEAS.length];
        return (
          <article className="group overflow-hidden rounded-xl border border-border/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 h-full cursor-pointer bg-[color-mix(in_oklch,var(--accent)_3%,var(--card)_97%)] flex flex-col">
            <div className="p-3 flex flex-col flex-1">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px]">💡</span>
                <span className="text-[9px] text-muted-foreground/40">想法</span>
              </div>
              <h3 className="text-[13px] font-semibold line-clamp-2 flex-1">{idea.text}</h3>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/15">
                <span className="text-[10px] text-muted-foreground/40">{idea.author}</span>
                {idea.tags.slice(0, 2).map(t => <span key={t} className="text-[8px] text-muted-foreground/30 bg-muted/40 rounded-full px-1.5 py-0.5">{t}</span>)}
                <span className="ml-auto text-[9px] text-muted-foreground/25">♡ {idea.saves}</span>
              </div>
            </div>
          </article>
        );
      }
      const p = ps[seqIdx % Math.max(ps.length, 1)] ?? projects[seqIdx % Math.max(projects.length, 1)];
      if (!p) return null;
      const badge = p.revenue ? { label: `💰 ${p.revenue}`, cls: "bg-secondary/10 text-secondary" } : p.founderType === "non_tech_ai" ? { label: "🤖 AI 做的", cls: "bg-primary/10 text-primary" } : null;
      return (
        <a href={`/project/${p.slug}`} target="_blank" className="block h-full"><article className="group overflow-hidden rounded-xl border border-border/40 bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 h-full cursor-pointer flex flex-col">
          <div className="relative aspect-[16/10] overflow-hidden bg-muted shrink-0">
            <div className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]" style={{ backgroundImage: `url(${p.screenshot})` }} />
            {badge && <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-semibold backdrop-blur-sm ${badge.cls}`}>{badge.label}</span>}
          </div>
          <div className="p-3 flex flex-col flex-1">
            <h3 className="text-[13px] font-semibold truncate">{p.name}</h3>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex-1">{p.tagline}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="h-[4px] w-[4px] rounded-full" style={{ backgroundColor: p.stageColor }} />
              <span className="text-[10px] text-muted-foreground">{SN[p.stage]}</span>
              <Heart className="ml-auto h-3 w-3 text-muted-foreground/20" />
            </div>
          </div>
        </article></a>
      );
    }

    /* ─── C: Compact row — full-width, 3 items side by side ─── */
    case "C": {
      const isIdea = item.dataSrc === "想法";
      const list = isIdea
        ? IDEAS.slice(0, 3).map(i => ({ slug: "", title: i.text.slice(0, 20) + "...", sub: i.author, img: "", dot: "#F59E0B", meta: "想法" }))
        : ps.slice(0, 3).map(p => ({ slug: p.slug, title: p.name, sub: p.tagline, img: p.screenshot, dot: p.stageColor, meta: SN[p.stage] }));
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 h-full">
          {list.map((c, i) => {
            const inner = (
              <article className="flex gap-3 rounded-xl bg-card border border-border/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all p-2.5 cursor-pointer h-full">
                {c.img ? (
                  <div className="shrink-0 h-11 w-11 rounded-lg bg-muted overflow-hidden"><div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${c.img})` }} /></div>
                ) : (
                  <div className="shrink-0 h-11 w-11 rounded-lg bg-accent/10 flex items-center justify-center text-base">💡</div>
                )}
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <h3 className="text-[12px] font-semibold truncate">{c.title}</h3>
                  <p className="text-[10px] text-muted-foreground truncate">{c.sub}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="h-[3px] w-[3px] rounded-full" style={{ backgroundColor: c.dot }} />
                    <span className="text-[9px] text-muted-foreground">{c.meta}</span>
                  </div>
                </div>
              </article>
            );
            return c.slug ? <a key={i} href={`/project/${c.slug}`} target="_blank">{inner}</a> : <div key={i}>{inner}</div>;
          })}
        </div>
      );
    }

    /* ─── D: Text block — span-1, flex-col stretches ─── */
    case "D": {
      const idea = IDEAS[seqIdx % IDEAS.length];
      const isInsight = item.dataSrc === "编辑洞察";
      const text = isInsight ? (projects[0]?.featuredInsight ?? idea.text) : idea.text;
      const author = isInsight ? projects[0]?.name : idea.author;
      return (
        <article className="rounded-2xl border border-border/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 cursor-pointer bg-[color-mix(in_oklch,var(--accent)_3%,var(--card)_97%)] h-full flex flex-col">
          <div className="p-4 sm:p-5 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-accent/15 text-[11px]">💡</span>
              <span className="text-[10px] font-medium text-muted-foreground/40">{isInsight ? "洞察" : "想法"}</span>
            </div>
            <blockquote className="flex-1 text-[13px] leading-relaxed text-foreground/75 font-medium">&ldquo;{text}&rdquo;</blockquote>
            <div className="mt-3 pt-2.5 border-t border-border/15 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/40">{author}</span>
              {!isInsight && <div className="flex items-center gap-1 text-[10px] text-muted-foreground/25"><Heart className="h-2.5 w-2.5" />{idea.saves}</div>}
            </div>
          </div>
        </article>
      );
    }

    /* ─── E: Chips — full-width ─── */
    case "E": {
      const isCategory = item.dataSrc === "分类入口";
      const chips = isCategory ? CATEGORIES : CREATORS.map(c => ({ emoji: c.emoji, label: c.name, sub: c.bio }));
      return (
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 h-full items-center">
          {chips.map(c => (
            <div key={c.label} onClick={() => onTopicFilter?.(c.label)} className={cn(
              "shrink-0 flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1 border transition-all cursor-pointer",
              isCategory ? "border-primary/12 bg-primary/[0.03] hover:bg-primary/[0.06]" : "border-border/30 bg-card hover:bg-muted/30"
            )}>
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-muted/60 text-xs">{c.emoji}</span>
              <div>
                <p className="text-[11px] font-medium whitespace-nowrap leading-tight">{c.label}</p>
                <p className="text-[9px] text-muted-foreground/50 whitespace-nowrap leading-tight">{c.sub}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    /* ─── F: Metrics — full-width, 4 items in a row ─── */
    case "F": {
      const stats = [
        { n: "6", l: "在赚钱", c: "var(--secondary)" },
        { n: "3", l: "AI 做的", c: "var(--primary)" },
        { n: "4", l: "轻量创造", c: "var(--accent)" },
        { n: String(projects.length), l: "总创造", c: "var(--muted-foreground)" },
      ];
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 h-full">
          {stats.map(s => (
            <article key={s.l} className="rounded-xl bg-card border border-border/40 shadow-[var(--shadow-card)] p-3 flex flex-col items-center text-center justify-center">
              <span className="font-latin text-[24px] font-bold leading-none" style={{ color: s.c }}>{s.n}</span>
              <span className="text-[10px] text-muted-foreground/50 mt-1">{s.l}</span>
            </article>
          ))}
        </div>
      );
    }

    /* ─── G: Ranked list — full-width ─── */
    case "G": {
      const list = ps.slice(0, 5);
      return (
        <article className="rounded-2xl bg-card border border-border/40 shadow-[var(--shadow-card)] p-4 h-full flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary/50" />
            <span className="text-[13px] font-semibold">{item.dataSrc}</span>
          </div>
          <div className="flex-1 space-y-px">
            {list.map((p, i) => (
              <a key={p.slug} href={`/project/${p.slug}`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/30 transition-colors cursor-pointer">
                <span className="font-latin text-[13px] font-bold text-muted-foreground/20 w-4 text-right shrink-0">{i + 1}</span>
                <div className="shrink-0 h-8 w-8 rounded-md bg-muted overflow-hidden"><div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${p.screenshot})` }} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold truncate">{p.name}</p>
                  <p className="text-[9px] text-muted-foreground/50 truncate">{p.tagline}</p>
                </div>
                {p.revenue && <span className="shrink-0 text-[8px] font-medium text-secondary bg-secondary/10 rounded-full px-1.5 py-0.5">{p.revenue}</span>}
              </a>
            ))}
          </div>
        </article>
      );
    }

    /* ─── H: Peek carousel — full-width ─── */
    case "H": {
      const list = ps.slice(0, 5);
      return (
        <article className="rounded-2xl bg-card border border-border/40 shadow-[var(--shadow-card)] p-4 overflow-hidden h-full flex flex-col">
          <h3 className="text-[13px] font-semibold mb-3">{item.dataSrc}</h3>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mr-4 pr-4 flex-1">
            {list.map(p => (
              <a key={p.slug} href={`/project/${p.slug}`} className="shrink-0 w-[45%] sm:w-[28%] cursor-pointer group/inner">
                <div className="aspect-[16/10] rounded-lg bg-muted overflow-hidden mb-2">
                  <div className="w-full h-full bg-cover bg-center transition-transform duration-300 group-hover/inner:scale-[1.03]" style={{ backgroundImage: `url(${p.screenshot})` }} />
                </div>
                <p className="text-[12px] font-semibold truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{p.tagline}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="h-[3px] w-[3px] rounded-full" style={{ backgroundColor: p.stageColor }} />
                  <span className="text-[9px] text-muted-foreground">{SN[p.stage]}</span>
                </div>
              </a>
            ))}
          </div>
        </article>
      );
    }

    /* ─── I: Spotlight — span-1, stretches to row ─── */
    case "I": {
      const ep = ps[0] ?? projects[0];
      const text = ep?.featuredInsight ?? `${ep?.name} — ${ep?.tagline}`;
      return (
        <article className="rounded-2xl bg-card border border-border/40 shadow-[var(--shadow-card)] p-5 h-full flex flex-col justify-center">
          <blockquote className="text-[14px] sm:text-[16px] font-semibold leading-snug text-foreground/75">&ldquo;{text}&rdquo;</blockquote>
          <p className="text-[11px] text-muted-foreground/35 mt-3">— {ep?.name}</p>
        </article>
      );
    }

    /* ─── J: Collection mosaic — span-1, stretches to row ─── */
    case "J": {
      const list = ps.slice(0, 6);
      const emoji = item.dataSrc === "在赚钱的" ? "💰" : item.dataSrc === "AI 做的" ? "🤖" : item.dataSrc === "轻量创造" ? "⚡" : "📦";
      return (
        <article className="rounded-2xl bg-card border border-border/40 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all p-4 cursor-pointer h-full flex flex-col group">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">{emoji}</span>
            <h3 className="text-[13px] font-semibold">{item.dataSrc}</h3>
          </div>
          <div className="grid grid-cols-3 gap-1.5 flex-1 content-start">
            {list.map((p, i) => (
              <div key={i} className="aspect-[4/3] rounded-md bg-muted overflow-hidden">
                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${p.screenshot})` }} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-muted-foreground/40">{list.length} 个创造</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
          </div>
        </article>
      );
    }

    /* ─── K: Banner — full-width ─── */
    case "K": {
      return (
        <div className="rounded-xl bg-muted/20 border border-border/15 px-4 py-2.5 flex items-center flex-wrap gap-0.5 h-full">
          <span className="text-[12px] text-muted-foreground/50">本周新增</span>
          <span className="text-[13px] font-semibold mx-1.5">3</span>
          <span className="text-[12px] text-muted-foreground/50">个创造 ·</span>
          <span className="text-[12px] text-muted-foreground/50 ml-1.5">累计</span>
          <span className="text-[13px] font-semibold mx-1.5">{projects.length}</span>
          <span className="text-[12px] text-muted-foreground/50">个产品</span>
          <span className="ml-auto text-[11px] text-primary/50 cursor-pointer hover:text-primary transition-colors">浏览全部 →</span>
        </div>
      );
    }

    default:
      return <div className="rounded-xl bg-muted/20 border border-dashed border-border/30 p-4 text-center text-[11px] text-muted-foreground/40 h-full flex items-center justify-center">未知容器</div>;
  }
}

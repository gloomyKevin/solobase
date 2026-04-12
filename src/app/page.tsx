import { HomeClient } from "./HomeClient";
import { HeaderSearch } from "./HeaderSearch";
import { loadFeedData } from "@/lib/feed-data";
import { Plus } from "lucide-react";

export default async function HomePage() {
  const feedItems = loadFeedData();

  // DynamicGrid 需要的 ProjectData 格式 — 直接从 feed 数据转换
  const projects = feedItems
    .filter(i => i.kind === "project")
    .map(i => {
      const p = i as typeof feedItems[number] & { slug: string; name: string; tagline: string; screenshot: string; stage: string; stageColor: string; topics: string[] };
      return {
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        screenshot: p.screenshot,
        url: p.url,
        stage: p.stage,
        stageColor: p.stageColor,
        revenue: p.stage === "revenue" ? "有收入" : null,
        founderType: "undetermined",
        buildEffort: "undetermined",
        isEditorsPick: p.score >= 18,
        featuredInsight: undefined as string | undefined,
      };
    });

  return (
    <div className="min-h-screen bg-background">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}@keyframes jiggle{0%{transform:rotate(-0.4deg)}100%{transform:rotate(0.4deg)}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/15">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
          <h1 className="font-latin text-[17px] font-bold tracking-tight shrink-0">solobase</h1>
          <div className="flex-1 flex justify-center"><HeaderSearch /></div>
          <button className="shrink-0 flex items-center gap-1.5 rounded-lg bg-primary/90 hover:bg-primary px-3 h-8 text-[11px] font-medium text-primary-foreground transition-colors">
            <Plus className="h-3 w-3" /><span className="hidden sm:inline">分享</span>
          </button>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-5 pb-24">
        <HomeClient projects={projects} feedItems={feedItems} />
      </main>

      <footer className="border-t border-border/30 py-6 text-center">
        <p className="text-[11px] text-muted-foreground/30">solobase</p>
      </footer>
    </div>
  );
}

import { DynamicGrid } from "./DynamicGrid";
import { HeaderSearch } from "./HeaderSearch";
import { getDataService } from "@/services/data";
import { getCategoryLabel, revenueRangeOptions, stageColorMap } from "@/config/categories";
import { Plus } from "lucide-react";

export default async function DemoPage() {
  const ds = getDataService();
  const { items } = await ds.listProjects({}, { pageSize: 10, sortBy: "newest" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = items.map((p: any) => {
    const metrics = p.metrics as Record<string, { value?: string }> | undefined;
    const revValue = metrics?.revenueRange?.value;
    return {
      slug: String(p.slug),
      name: String(p.name),
      tagline: String(p.tagline),
      screenshot: String(p.screenshots?.[0] ?? ""),
      stage: String(p.stage),
      stageColor: String(p.stageColor ?? stageColorMap[p.stage] ?? "#9CA3AF"),
      revenue: revValue && revValue !== "pre_revenue" ? getCategoryLabel(revenueRangeOptions, revValue) : null,
      founderType: String(p.founderType),
      buildEffort: String(p.buildEffort),
      isEditorsPick: Boolean(p.isEditorsPick),
      featuredInsight: p.featuredInsight ? String(p.featuredInsight) : undefined,
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
        <DynamicGrid projects={projects} />
      </main>

      <footer className="border-t border-border/30 py-6 text-center">
        <p className="text-[11px] text-muted-foreground/30">solobase &middot; customizable home</p>
      </footer>
    </div>
  );
}

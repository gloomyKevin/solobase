import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectCard } from "@/components/project/ProjectCard";
import { ProjectFilters } from "@/components/project/ProjectFilters";
import { getDataService } from "@/services/data";
import { toCardData } from "@/lib/project-utils";
import type { ProjectFilters as Filters } from "@/types";
import type {
  BusinessModel,
  BuildEffort,
  GrowthChannel,
  FounderType,
  ProjectStage,
} from "@/types";

// Map URL param keys to ProjectFilters fields
function parseSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): Filters {
  const filters: Filters = {};

  const str = (key: string): string | undefined => {
    const val = searchParams[key];
    return typeof val === "string" ? val : undefined;
  };

  if (str("model")) {
    filters.businessModel = str("model")!.split(",") as BusinessModel[];
  }
  if (str("effort")) {
    filters.buildEffort = str("effort")!.split(",") as BuildEffort[];
  }
  if (str("growth")) {
    filters.growthChannel = str("growth")!.split(",") as GrowthChannel[];
  }
  if (str("founder")) {
    // Map shorthand values
    const raw = str("founder")!.split(",");
    const mapped = raw.map((v) => {
      const map: Record<string, string> = {
        "non-tech": "non_tech_ai",
        designer: "designer",
        pm: "product_manager",
        tech: "tech_to_product",
      };
      return map[v] ?? v;
    });
    filters.founderType = mapped as FounderType[];
  }
  if (str("stage")) {
    filters.stage = str("stage")!.split(",") as ProjectStage[];
  }
  if (str("tag")) {
    filters.tags = str("tag")!.split(",");
  }
  if (str("q")) {
    filters.search = str("q");
  }

  return filters;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSearchParams(params);
  const dataService = getDataService();
  const { items: projects, total } = await dataService.listProjects(filters, {
    pageSize: 50,
    sortBy: "newest",
  });

  const cards = projects.map(toCardData);

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold sm:text-2xl">探索产品</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {total} 个产品
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            {/* Sidebar filters */}
            <aside className="lg:sticky lg:top-20 lg:self-start">
              <Suspense>
                <ProjectFilters />
              </Suspense>
            </aside>

            {/* Results */}
            <div>
              {cards.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-card p-12 text-center">
                  <p className="text-muted-foreground">
                    没有找到匹配的产品，试试调整筛选条件？
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {cards.map((project) => (
                    <ProjectCard
                      key={project.slug}
                      project={project}
                      variant="compact"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

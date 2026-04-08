import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectCard } from "@/components/project/ProjectCard";
import { SectionTitle } from "@/components/common/SectionTitle";
import { exploreTags, radarStats } from "@/lib/static-data";
import { getDataService } from "@/services/data";
import { toCardData } from "@/lib/project-utils";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

export default async function Home() {
  const dataService = getDataService();
  const { items: projects } = await dataService.listProjects(
    {},
    { pageSize: 10, sortBy: "newest" }
  );
  const p = projects.map(toCardData);

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="flex-1">
        {/* ===== Featured Zone ===== */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="pointer-events-none absolute top-48 -left-40 h-64 w-64 rounded-full bg-secondary/[0.04] blur-3xl" />

          <div className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6 sm:pt-10">
            {/* Brand line */}
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h1 className="text-lg font-bold sm:text-xl">
                  发现值得关注的<span className="text-primary">个人产品</span>
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  每周精选有启发的独立产品和 maker 故事
                </p>
              </div>
              <Link
                href="/browse"
                className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                浏览全部
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Row 1: 1 wide featured + 1 compact, equal height */}
            {p.length >= 2 && (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-5">
                <div className="sm:col-span-3">
                  <ProjectCard project={p[0]} variant="compact" className="h-full" />
                </div>
                <div className="sm:col-span-2">
                  <ProjectCard project={p[1]} variant="compact" className="h-full" />
                </div>
              </div>
            )}

            {/* Row 2: 3 equal */}
            {p.length >= 5 && (
              <div className="mt-3 sm:mt-4 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
                <ProjectCard project={p[2]} variant="compact" />
                <ProjectCard project={p[3]} variant="compact" />
                <div className="col-span-2 lg:col-span-1">
                  <ProjectCard project={p[4]} variant="compact" />
                </div>
              </div>
            )}

            {/* Row 3: 4 tighter cards */}
            {p.length >= 9 && (
              <div className="mt-3 sm:mt-4 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
                <ProjectCard project={p[5]} variant="compact" />
                <ProjectCard project={p[6]} variant="compact" />
                <ProjectCard project={p[7]} variant="compact" />
                <div className="col-span-2 lg:col-span-1">
                  <ProjectCard project={p[8]} variant="compact" />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===== Explore + Submit ===== */}
        <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
            <div className="flex-1 min-w-0">
              <p className="mb-3 text-xs font-medium text-muted-foreground tracking-wider uppercase">
                快速探索
              </p>
              <div className="flex flex-wrap gap-2">
                {exploreTags.map((tag) => (
                  <Link
                    key={tag.label}
                    href={tag.href}
                    className="inline-flex items-center rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm text-foreground/80 hover:border-primary/30 hover:text-primary hover:shadow-sm transition-all duration-200"
                  >
                    {tag.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="shrink-0 lg:w-[340px]">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-card to-secondary/8 border border-border/40 p-6">
                <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">提交你的产品</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    粘贴 URL，AI 帮你 30 秒填好资料，进入编辑精选池
                  </p>
                  <Link
                    href="/submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    开始提交
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Latest ===== */}
        {p.length > 7 && (
          <section className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6">
            <SectionTitle
              title="最新收录"
              action={{ label: "查看全部", href: "/browse" }}
            />
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
              {p.slice(7).map((project) => (
                <ProjectCard
                  key={project.slug}
                  project={project}
                  variant="compact"
                />
              ))}
            </div>
          </section>
        )}

        {/* ===== Radar ===== */}
        <section className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
          <div className="rounded-2xl bg-surface-sunken/70 border border-border/30 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold">Radar 数据洞察</h2>
                <p className="text-[11px] text-muted-foreground">即将上线</p>
              </div>
              <span className="text-[10px] text-muted-foreground/50 px-2 py-0.5 rounded-full bg-muted">
                模拟数据
              </span>
            </div>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {radarStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-card p-3.5 shadow-sm"
                >
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-bold">{stat.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {stat.sub}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

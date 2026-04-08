import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectCard } from "@/components/project/ProjectCard";
import { TagBadge } from "@/components/common/TagBadge";
import { SectionTitle } from "@/components/common/SectionTitle";
import { getDataService } from "@/services/data";
import { toCardData } from "@/lib/project-utils";
import { generateProjectMetadata, generateProjectJsonLd } from "@/lib/seo";
import {
  getCategoryLabel,
  businessModelOptions,
  growthChannelOptions,
  founderTypeOptions,
  buildEffortOptions,
  projectStageOptions,
  stageColorMap,
} from "@/config/categories";
import {
  ExternalLink,
  Share2,
  AlertCircle,
  ChevronRight,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { TagDimension } from "@/components/common/TagBadge";
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

function buildDisplayTags(project: Project) {
  const tags: { label: string; dimension: TagDimension }[] = [];

  if (project.businessModel && project.businessModel !== "undetermined") {
    tags.push({
      label: getCategoryLabel(businessModelOptions, project.businessModel),
      dimension: "business",
    });
  }
  if (project.growthChannel && project.growthChannel !== "undetermined") {
    tags.push({
      label: getCategoryLabel(growthChannelOptions, project.growthChannel),
      dimension: "growth",
    });
  }
  if (project.founderType && project.founderType !== "undetermined") {
    tags.push({
      label: getCategoryLabel(founderTypeOptions, project.founderType),
      dimension: "founder",
    });
  }
  if (project.buildEffort && project.buildEffort !== "undetermined") {
    tags.push({
      label: getCategoryLabel(buildEffortOptions, project.buildEffort),
      dimension: "effort",
    });
  }

  // Add track tags
  for (const track of project.tags.track ?? []) {
    tags.push({ label: track, dimension: "default" });
  }

  // Deduplicate
  return tags.filter(
    (tag, i, arr) => arr.findIndex((t) => t.label === tag.label) === i
  );
}

function getMetrics(project: Project) {
  const metrics: { label: string; value: string; source: string }[] = [];

  if (project.metrics?.revenueRange) {
    const rv = project.metrics.revenueRange.value;
    const rangeLabels: Record<string, string> = {
      pre_revenue: "尚无收入",
      under_1k: "< $1k/月",
      "1k_5k": "$1k - 5k/月",
      "5k_10k": "$5k - 10k/月",
      "10k_50k": "$10k - 50k/月",
      "50k_plus": "$50k+/月",
    };
    metrics.push({
      label: "收入区间",
      value: rangeLabels[rv] ?? rv,
      source: project.metrics.revenueRange.sourceType === "founder_submitted" ? "创始人提供" : "公开信息",
    });
  }

  if (project.metrics?.userCount) {
    metrics.push({
      label: "用户量",
      value: project.metrics.userCount.value,
      source: "公开信息",
    });
  }

  if (project.metrics?.launchedDate) {
    metrics.push({
      label: "上线时间",
      value: project.metrics.launchedDate.value,
      source: "公开信息",
    });
  }

  metrics.push({
    label: "产品阶段",
    value: getCategoryLabel(projectStageOptions, project.stage),
    source: "平台标注",
  });

  if (project.metrics?.buildDuration) {
    metrics.push({
      label: "构建耗时",
      value: project.metrics.buildDuration.value,
      source: project.metrics.buildDuration.sourceType === "founder_submitted" ? "创始人提供" : "公开信息",
    });
  }

  if (project.growthChannel && project.growthChannel !== "undetermined") {
    metrics.push({
      label: "核心打法",
      value: getCategoryLabel(growthChannelOptions, project.growthChannel),
      source: "编辑总结",
    });
  }

  return metrics;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dataService = getDataService();
  const project = await dataService.getProject(slug);

  if (!project) {
    notFound();
  }

  const tags = buildDisplayTags(project);
  const metrics = getMetrics(project);
  const stageLabel = getCategoryLabel(projectStageOptions, project.stage);
  const stageColor = project.stageColor ?? stageColorMap[project.stage] ?? "#9CA3AF";
  const screenshot = project.screenshots[0] ?? "";

  // Related projects
  const relatedByTrack = await dataService.getRelatedProjects(slug, "track", 3);
  const relatedByGrowth = await dataService.getRelatedProjects(slug, "growth", 3);

  // Founder
  const founder = project.founderId
    ? await dataService.getFounder(project.founderId)
    : null;

  // Growth label for section title
  const growthLabel = project.growthChannel !== "undetermined"
    ? getCategoryLabel(growthChannelOptions, project.growthChannel)
    : null;

  // Track name
  const trackName = project.tags.track?.[0] ?? "";

  const jsonLd = generateProjectJsonLd(project);

  return (
    <div className="flex min-h-full flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              首页
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/browse" className="transition-colors hover:text-foreground">
              探索
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{project.name}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-10">
              {/* Screenshot */}
              <div className="overflow-hidden rounded-2xl bg-muted">
                <div
                  className="aspect-[16/10] w-full bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${screenshot})` }}
                />
              </div>

              {/* Title + Tags */}
              <div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold sm:text-3xl">{project.name}</h1>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {project.tagline}
                    </p>
                  </div>
                  <a
                    href={project.url}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    访问
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <TagBadge key={tag.label} label={tag.label} dimension={tag.dimension} />
                  ))}
                  <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: stageColor }}
                    />
                    {stageLabel}
                  </span>
                </div>
              </div>

              {/* Metrics */}
              {metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-xl border border-border/60 p-4">
                      <p className="text-xs text-muted-foreground">{metric.label}</p>
                      <p className="mt-1 text-lg font-bold">{metric.value}</p>
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        <span className="h-1 w-1 rounded-full bg-secondary/50" />
                        {metric.source}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Description */}
              {project.description && (
                <div>
                  <h2 className="mb-3 text-lg font-semibold">产品介绍</h2>
                  <div className="article-copy text-foreground/90">
                    {project.description.split("\n\n").map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Build Story */}
              {project.buildStory && (
                <div>
                  <h2 className="mb-4 text-lg font-semibold">构建故事</h2>
                  <div className="space-y-4">
                    {[
                      { q: "这个想法怎么来的？", a: project.buildStory.origin },
                      { q: "用了什么工具和技术栈？", a: project.buildStory.toolsUsed },
                      { q: "从 idea 到上线花了多久？", a: project.buildStory.timeline },
                      { q: "遇到的最大坑是什么？", a: project.buildStory.challenges },
                      { q: "怎么获取的前 100 个用户？", a: project.buildStory.acquisition },
                      { q: "目前状态和下一步计划？", a: project.buildStory.currentStatus },
                    ]
                      .filter((item) => item.a)
                      .map((item) => (
                        <div key={item.q} className="rounded-xl border border-border/60 p-4">
                          <p className="text-sm font-medium text-primary">{item.q}</p>
                          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                            {item.a}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Related by Track */}
              {relatedByTrack.length > 0 && (
                <div>
                  <SectionTitle
                    title="同赛道的其他项目"
                    subtitle={trackName}
                    action={{ label: "查看全部", href: "/browse" }}
                  />
                  <div className="grid gap-4 sm:grid-cols-3">
                    {relatedByTrack.map((item) => (
                      <ProjectCard key={item.slug} project={toCardData(item)} variant="compact" />
                    ))}
                  </div>
                </div>
              )}

              {/* Related by Growth */}
              {relatedByGrowth.length > 0 && growthLabel && (
                <div>
                  <SectionTitle
                    title={`同样用 ${growthLabel} 增长的项目`}
                    action={{ label: "查看全部", href: "/browse" }}
                  />
                  <div className="grid gap-4 sm:grid-cols-3">
                    {relatedByGrowth.map((item) => (
                      <ProjectCard key={item.slug} project={toCardData(item)} variant="compact" />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
              {/* Founder Card */}
              {founder && (
                <div className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${founder.avatar ?? ""})` }}
                    />
                    <div>
                      <p className="font-semibold">{founder.name}</p>
                      <p className="text-xs text-muted-foreground">{founder.bio}</p>
                    </div>
                  </div>
                  {founder.socialLinks && (
                    <div className="mt-4 flex gap-3">
                      {founder.socialLinks.jike && (
                        <a
                          href={founder.socialLinks.jike}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          即刻
                        </a>
                      )}
                      {founder.socialLinks.twitter && (
                        <a
                          href={founder.socialLinks.twitter}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Globe className="h-3 w-3" />
                          Twitter
                        </a>
                      )}
                      {founder.socialLinks.github && (
                        <a
                          href={founder.socialLinks.github}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Globe className="h-3 w-3" />
                          GitHub
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
                  <Share2 className="h-4 w-4" />
                  分享这个项目
                </button>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <AlertCircle className="h-4 w-4" />
                  信息有误？反馈纠错
                </button>
              </div>

              {/* Tags */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <p className="mb-3 text-sm font-semibold">标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <TagBadge key={tag.label} label={tag.label} dimension={tag.dimension} />
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

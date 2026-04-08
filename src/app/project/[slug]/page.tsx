import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectCard, type ProjectCardData } from "@/components/project/ProjectCard";
import { TagBadge, type TagDimension } from "@/components/common/TagBadge";
import { SectionTitle } from "@/components/common/SectionTitle";
import { mockProjects } from "@/lib/mock-data";
import {
  ExternalLink,
  Share2,
  AlertCircle,
  ChevronRight,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const founderProfiles = [
  {
    name: "张三",
    bio: "全栈开发者，前字节员工，目前全职做独立产品",
    avatar: "https://placehold.co/80x80/DB6B25/FFFFFF?text=Z",
  },
  {
    name: "Luna",
    bio: "内容创作者转型产品人，擅长把灵感打磨成可售卖体验",
    avatar: "https://placehold.co/80x80/3B9B8B/FFFFFF?text=L",
  },
  {
    name: "陈一",
    bio: "独立开发者，喜欢做轻量但上手即用的工作流工具",
    avatar: "https://placehold.co/80x80/6C4FD6/FFFFFF?text=C",
  },
];

const heroPalettes = [
  { bg: "F3EEE6", fg: "6A5748" },
  { bg: "E8F4F0", fg: "2E6C61" },
  { bg: "F0ECF9", fg: "5B4B7D" },
];

const effortTags = ["周末项目", "月度项目", "持续工程"] as const;

const trackInsightPresets = [
  {
    trackName: "AI 应用",
    total: 12,
    businessModel: { "订阅制": 7, "一次性付费": 3, "免费增值": 2 },
    growthChannel: { "SEO 驱动": 5, "社区驱动": 3, "内容营销": 2, "付费投放": 2 },
    buildEffort: { "周末项目": 3, "月度项目": 7, "持续工程": 2 },
  },
  {
    trackName: "效率工具",
    total: 9,
    businessModel: { "免费增值": 4, "订阅制": 3, "一次性付费": 2 },
    growthChannel: { "社区驱动": 4, "内容营销": 3, "SEO 驱动": 2 },
    buildEffort: { "周末项目": 2, "月度项目": 5, "持续工程": 2 },
  },
  {
    trackName: "开发者工具",
    total: 7,
    businessModel: { "开源+付费": 3, "订阅制": 2, "免费增值": 2 },
    growthChannel: { "SEO 驱动": 3, "内容营销": 2, "社区驱动": 2 },
    buildEffort: { "周末项目": 1, "月度项目": 3, "持续工程": 3 },
  },
];

function getDetailScreenshot(project: ProjectCardData, index: number) {
  const palette = heroPalettes[index % heroPalettes.length];

  return `https://placehold.co/1200x750/${palette.bg}/${palette.fg}?text=${encodeURIComponent(
    project.name
  )}&font=source-sans-pro`;
}

function getMetricPreset(project: ProjectCardData, index: number) {
  const ranges = ["$1k - 5k/月", "$5k - 10k/月", "验证中", "$500 - 2k/月"];
  const launchMonths = ["2026-01", "2025-12", "2026-02", "2025-11"];
  const buildCycles = ["~3 周", "~5 周", "~2 周", "~6 周"];
  const users = ["2,000+", "800+", "5,000+", "1,200+"];

  return [
    { label: "收入区间", value: ranges[index % ranges.length], source: "创始人提供" },
    { label: "用户量", value: users[index % users.length], source: "公开信息" },
    { label: "上线时间", value: launchMonths[index % launchMonths.length], source: "公开信息" },
    { label: "产品阶段", value: project.stage, source: "平台标注" },
    { label: "构建耗时", value: buildCycles[index % buildCycles.length], source: "创始人提供" },
    { label: "核心打法", value: project.tags[1]?.label ?? "内容营销", source: "编辑总结" },
  ];
}

function buildDetail(project: ProjectCardData, index: number) {
  const founder = founderProfiles[index % founderProfiles.length];
  const trackInsights = trackInsightPresets[index % trackInsightPresets.length];
  const growthTag = project.tags.find((tag) => tag.dimension === "growth");
  const effortTag = effortTags[index % effortTags.length];
  const tags = [
    ...project.tags,
    { label: effortTag, dimension: "effort" as TagDimension },
    { label: trackInsights.trackName, dimension: "default" as TagDimension },
  ].filter(
    (tag, tagIndex, allTags) =>
      allTags.findIndex((candidate) => candidate.label === tag.label) === tagIndex
  );

  return {
    name: project.name,
    tagline: project.tagline,
    url: `https://${project.slug}.example.com`,
    screenshot: getDetailScreenshot(project, index),
    description: `${project.name} 是一个${project.tagline}。这个 demo 详情页保留了编辑精选的叙事风格，但内容已经会跟随当前项目切换，方便直接检查长标题、不同标签组合和多段正文在这套视觉语言里的表现。

它的页面结构围绕“项目是什么、怎么做出来、如何增长”展开：上方是更有杂志感的大图和摘要，中间用指标卡与问答卡片承接信息密度，侧边栏则承担人物感和补充动作。这样即使还没接真实数据源，也能先验证内容层级、留白和卡片节奏。

当前案例的核心亮点是「${growthTag?.label ?? "内容营销"} + ${project.stage}」。如果后续把真实截图、创始人故事和更多指标接进来，这一版骨架已经足够支撑多种内容长度，不会再出现所有项目详情完全同质化的情况。`,
    tags,
    stage: project.stage,
    stageColor: project.stageColor,
    metrics: getMetricPreset(project, index),
    buildStory: {
      origin: `最初的想法来自一个非常具体的使用场景：团队在重复处理「${project.tagline}」这类需求时，发现通用工具都不够顺手，于是先做了一个只解决单点问题的 MVP。`,
      tools:
        "Cursor + Claude（开发）、Next.js + Tailwind CSS（前端）、Supabase（后端）、Vercel（部署）",
      timeline: `第一阶段先把核心流程跑通，第二阶段补齐基础展示和提交链路，第三阶段再回头优化视觉细节与真实内容承载。当前项目在 demo 中对应的预估构建周期为 ${getMetricPreset(
        project,
        index
      )[4].value}。`,
      challenges:
        "最大的难点不是功能本身，而是如何让信息密度高的页面仍然保持呼吸感。这里通过大卡片、柔和底色和稳定的间距体系把阅读压力压了下来。",
      acquisition: `当前项目更适合通过「${growthTag?.label ?? "内容营销"}」启动增长。详情页里的推荐区和标签区也是按这个维度组织的，方便后面直接扩展成更完整的发现路径。`,
      currentStatus: `现在这版更像可用的视觉样机：卡片、详情、提交流程已经能串起来，下一步可以逐步替换成真实数据、截图和创始人资料。`,
    },
    founder: {
      ...founder,
      social: {
        jike: "#",
        twitter: "#",
        github: "#",
      },
    },
    trackInsights,
    growthTag,
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const projectIndex = mockProjects.findIndex((project) => project.slug === slug);

  if (projectIndex === -1) {
    notFound();
  }

  const project = mockProjects[projectIndex];
  const detail = buildDetail(project, projectIndex);
  const growthTag = detail.growthTag;
  const related = mockProjects.filter((item) => item.slug !== project.slug).slice(0, 3);
  const relatedByGrowth =
    mockProjects
      .filter(
        (item) =>
          item.slug !== project.slug &&
          growthTag &&
          item.tags.some(
            (tag) => tag.dimension === "growth" && tag.label === growthTag.label
          )
      )
      .slice(0, 3) || [];
  const growthRelatedProjects =
    relatedByGrowth.length > 0 ? relatedByGrowth : mockProjects.filter((item) => item.slug !== project.slug).slice(3, 6);

  return (
    <div className="flex min-h-full flex-col">
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
            <span className="text-foreground">{detail.name}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-10">
              <div className="overflow-hidden rounded-2xl bg-muted">
                <div
                  className="aspect-[16/10] w-full bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url(${detail.screenshot})`,
                  }}
                />
              </div>

              <div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold sm:text-3xl">{detail.name}</h1>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {detail.tagline}
                    </p>
                  </div>
                  <a
                    href={detail.url}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    访问
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {detail.tags.map((tag) => (
                    <TagBadge
                      key={tag.label}
                      label={tag.label}
                      dimension={tag.dimension}
                    />
                  ))}
                  <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: detail.stageColor }}
                    />
                    {detail.stage}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {detail.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-border/60 p-4"
                  >
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-lg font-bold">{metric.value}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <span className="h-1 w-1 rounded-full bg-secondary/50" />
                      {metric.source}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="mb-3 text-lg font-semibold">产品介绍</h2>
                <div className="article-copy text-foreground/90">
                  {detail.description.split("\n\n").map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-4 text-lg font-semibold">构建故事</h2>
                <div className="space-y-4">
                  {[
                    { q: "这个想法怎么来的？", a: detail.buildStory.origin },
                    { q: "用了什么工具和技术栈？", a: detail.buildStory.tools },
                    { q: "从 idea 到上线花了多久？", a: detail.buildStory.timeline },
                    { q: "遇到的最大坑是什么？", a: detail.buildStory.challenges },
                    { q: "怎么获取的前 100 个用户？", a: detail.buildStory.acquisition },
                    { q: "目前状态和下一步计划？", a: detail.buildStory.currentStatus },
                  ].map((item) => (
                    <div
                      key={item.q}
                      className="rounded-xl border border-border/60 p-4"
                    >
                      <p className="text-sm font-medium text-primary">{item.q}</p>
                      <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle
                  title="同赛道的其他项目"
                  subtitle={detail.trackInsights.trackName}
                  action={{ label: "查看全部", href: "/browse" }}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  {related.map((item) => (
                    <ProjectCard key={item.slug} project={item} variant="compact" />
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle
                  title={`同样用 ${growthTag?.label ?? "相似方式"} 增长的项目`}
                  action={{ label: "查看全部", href: "/browse" }}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  {growthRelatedProjects.map((item) => (
                    <ProjectCard key={item.slug} project={item} variant="compact" />
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle
                  title="赛道事实观察"
                  subtitle={`基于平台已收录的 ${detail.trackInsights.total} 个${detail.trackInsights.trackName}项目`}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      商业模式分布
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(detail.trackInsights.businessModel).map(
                        ([label, value]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-sm">{label}</span>
                            <span className="text-sm font-medium">{value}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      获客渠道分布
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(detail.trackInsights.growthChannel).map(
                        ([label, value]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-sm">{label}</span>
                            <span className="text-sm font-medium">{value}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      构建周期分布
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(detail.trackInsights.buildEffort).map(
                        ([label, value]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-sm">{label}</span>
                            <span className="text-sm font-medium">{value}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground/60">
                  数据基于截至 2026-04-08 的平台收录项目，仅供参考
                </p>
              </div>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-full bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${detail.founder.avatar})`,
                    }}
                  />
                  <div>
                    <p className="font-semibold">{detail.founder.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {detail.founder.bio}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <a
                    href={detail.founder.social.jike}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    即刻
                  </a>
                  <a
                    href={detail.founder.social.twitter}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Globe className="h-3 w-3" />
                    Twitter
                  </a>
                  <a
                    href={detail.founder.social.github}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Globe className="h-3 w-3" />
                    GitHub
                  </a>
                </div>
              </div>

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

              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <p className="mb-3 text-sm font-semibold">标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((tag) => (
                    <TagBadge
                      key={tag.label}
                      label={tag.label}
                      dimension={tag.dimension}
                    />
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

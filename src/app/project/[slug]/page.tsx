import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectCard } from "@/components/project/ProjectCard";
import { TagBadge } from "@/components/common/TagBadge";
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

const mockDetail = {
  name: "PhotoAI Editor",
  tagline: "用 AI 一键修出专业级产品图，个人卖家的秘密武器",
  url: "https://photoai-editor.example.com",
  screenshot:
    "https://placehold.co/1200x750/F3EEE6/586172?text=PhotoAI+Editor&font=source-sans-pro",
  description: `PhotoAI Editor 是一个面向电商个人卖家和小团队的 AI 图片编辑工具。它的核心功能是"一键生成产品图"——用户只需要上传原始产品照片，AI 自动完成背景去除、场景生成、光影调整和文字排版，输出可以直接上架的产品主图。

与 Canva、美图秀秀等工具不同，PhotoAI Editor 专注于"电商产品图"这个垂直场景，所有模板和 AI 模型都针对产品拍摄场景优化。这种垂直化策略让它在一个细分领域做到了比通用工具更好的效果。

创始人张三是一个前字节跳动的前端工程师，利用业余时间用 Cursor + Claude 在 3 周内完成了 MVP。他的核心增长策略是 SEO——把每一个具体的产品拍摄需求（如"白底产品图生成""淘宝主图 AI 制作"）都做成独立的功能页面和着陆页。目前月收入已达到 $3,000，用户主要来自百度和 Google 搜索。`,
  tags: [
    { label: "订阅制", dimension: "business" as const },
    { label: "SEO 驱动", dimension: "growth" as const },
    { label: "技术转产品", dimension: "founder" as const },
    { label: "月度项目", dimension: "effort" as const },
    { label: "AI 应用", dimension: "default" as const },
    { label: "效率工具", dimension: "default" as const },
  ],
  stage: "Revenue",
  metrics: [
    { label: "收入区间", value: "$1k - 5k/月", source: "创始人提供" },
    { label: "用户量", value: "2,000+", source: "公开信息" },
    { label: "上线时间", value: "2026-01", source: "公开信息" },
    { label: "构建耗时", value: "~3 周", source: "创始人提供" },
  ],
  buildStory: {
    origin:
      "在帮朋友的淘宝店拍产品图时，发现现有工具都太通用，没有专门为产品图优化的 AI 方案。自己试着用 Stable Diffusion 做了个脚本，效果很好，就决定做成产品。",
    tools: "Cursor + Claude (开发), Next.js + TailwindCSS (前端), Replicate API (AI 图像生成), Supabase (后端), Vercel (部署)",
    timeline:
      "第 1 周搭建核心 AI pipeline 和基础 UI，第 2 周做支付和用户系统，第 3 周优化生成效果和做 SEO 着陆页。",
    challenges:
      "最大的坑是 AI 生成图片的一致性——同一个产品多次生成出来的风格不统一。最后通过固定 seed 和自定义 LoRA 模型解决了。",
    acquisition:
      "核心策略是 SEO。把每个具体需求（'白底产品图生成'、'淘宝主图 AI'、'产品场景图制作'）都做成独立的着陆页，每个页面都有真实的 before/after 对比图。3 个月内在百度和 Google 上拿到了 20+ 个长尾关键词的前三名。",
    currentStatus:
      "目前月入 $3,000，月活 2,000+。下一步计划加入批量处理功能和 API 接口，面向有量的大卖家。",
  },
  founder: {
    name: "张三",
    avatar: "https://placehold.co/80x80/DB6B25/FFFFFF?text=Z",
    bio: "全栈开发者，前字节员工，目前全职做独立产品",
    social: {
      jike: "#",
      twitter: "#",
      github: "#",
    },
  },
  trackInsights: {
    trackName: "AI 应用",
    total: 12,
    businessModel: { "订阅制": 7, "一次性付费": 3, "免费增值": 2 },
    growthChannel: { "SEO 驱动": 5, "社区驱动": 3, "内容营销": 2, "付费投放": 2 },
    buildEffort: { "周末项目": 3, "月度项目": 7, "持续工程": 2 },
  },
};

export default function ProjectDetailPage() {
  const related = mockProjects.filter((p) => p.slug !== "photoai-editor").slice(0, 3);

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              首页
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href="/browse"
              className="hover:text-foreground transition-colors"
            >
              探索
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{mockDetail.name}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* ===== Main Content ===== */}
            <div className="space-y-10">
              {/* Hero screenshot */}
              <div className="overflow-hidden rounded-2xl bg-muted">
                <div
                  className="aspect-[16/10] w-full bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url(${mockDetail.screenshot})`,
                  }}
                />
              </div>

              {/* Title block */}
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold sm:text-3xl">
                      {mockDetail.name}
                    </h1>
                    <p className="mt-2 text-base text-muted-foreground leading-relaxed">
                      {mockDetail.tagline}
                    </p>
                  </div>
                  <a
                    href={mockDetail.url}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    访问
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                {/* Tags + stage */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {mockDetail.tags.map((tag) => (
                    <TagBadge
                      key={tag.label}
                      label={tag.label}
                      dimension={tag.dimension}
                    />
                  ))}
                  <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                    {mockDetail.stage}
                  </span>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {mockDetail.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-border/60 p-4"
                  >
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="mt-1 text-lg font-bold">{m.value}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <span className="h-1 w-1 rounded-full bg-secondary/50" />
                      {m.source}
                    </p>
                  </div>
                ))}
              </div>

              {/* Description */}
              <div>
                <h2 className="text-lg font-semibold mb-3">产品介绍</h2>
                <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed whitespace-pre-line">
                  {mockDetail.description}
                </div>
              </div>

              {/* Build Story */}
              <div>
                <h2 className="text-lg font-semibold mb-4">构建故事</h2>
                <div className="space-y-4">
                  {[
                    { q: "这个想法怎么来的？", a: mockDetail.buildStory.origin },
                    { q: "用了什么工具和技术栈？", a: mockDetail.buildStory.tools },
                    { q: "从 idea 到上线花了多久？", a: mockDetail.buildStory.timeline },
                    { q: "遇到的最大坑是什么？", a: mockDetail.buildStory.challenges },
                    { q: "怎么获取的前 100 个用户？", a: mockDetail.buildStory.acquisition },
                    { q: "目前状态和下一步计划？", a: mockDetail.buildStory.currentStatus },
                  ].map((item) => (
                    <div
                      key={item.q}
                      className="rounded-xl border border-border/60 p-4"
                    >
                      <p className="text-sm font-medium text-primary">
                        {item.q}
                      </p>
                      <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related: Same Track */}
              <div>
                <SectionTitle
                  title="同赛道的其他项目"
                  subtitle="AI 应用"
                  action={{ label: "查看全部", href: "/browse?tag=ai" }}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  {related.map((p) => (
                    <ProjectCard key={p.slug} project={p} variant="compact" />
                  ))}
                </div>
              </div>

              {/* Related: Same Growth */}
              <div>
                <SectionTitle
                  title="同样用 SEO 增长的项目"
                  action={{
                    label: "查看全部",
                    href: "/browse?growth=seo",
                  }}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  {mockProjects.slice(2, 5).map((p) => (
                    <ProjectCard key={p.slug} project={p} variant="compact" />
                  ))}
                </div>
              </div>

              {/* Track Insights */}
              <div>
                <SectionTitle
                  title="赛道事实观察"
                  subtitle={`基于平台已收录的 ${mockDetail.trackInsights.total} 个${mockDetail.trackInsights.trackName}项目`}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      商业模式分布
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(
                        mockDetail.trackInsights.businessModel
                      ).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-sm">{k}</span>
                          <span className="text-sm font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      获客渠道分布
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(
                        mockDetail.trackInsights.growthChannel
                      ).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-sm">{k}</span>
                          <span className="text-sm font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-sunken p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      构建周期分布
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(
                        mockDetail.trackInsights.buildEffort
                      ).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-sm">{k}</span>
                          <span className="text-sm font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground/60">
                  数据基于截至 2026-04-08 的平台收录项目，仅供参考
                </p>
              </div>
            </div>

            {/* ===== Sidebar ===== */}
            <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
              {/* Founder Card */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-full bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${mockDetail.founder.avatar})`,
                    }}
                  />
                  <div>
                    <p className="font-semibold">{mockDetail.founder.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {mockDetail.founder.bio}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <a
                    href={mockDetail.founder.social.jike}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    即刻
                  </a>
                  <a
                    href={mockDetail.founder.social.twitter}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Globe className="h-3 w-3" />
                    Twitter
                  </a>
                  <a
                    href={mockDetail.founder.social.github}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Globe className="h-3 w-3" />
                    GitHub
                  </a>
                </div>
              </div>

              {/* Actions */}
              <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
                <button className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                  <Share2 className="h-4 w-4" />
                  分享这个项目
                </button>
                <button className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <AlertCircle className="h-4 w-4" />
                  信息有误？反馈纠错
                </button>
              </div>

              {/* All Tags */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <p className="text-sm font-semibold mb-3">标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {mockDetail.tags.map((tag) => (
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

import type { ProjectCardData } from "@/components/project/ProjectCard";

export const mockProjects: ProjectCardData[] = [
  {
    slug: "photoai-editor",
    name: "PhotoAI Editor",
    tagline: "用 AI 一键修出专业级产品图，个人卖家的秘密武器",
    screenshot:
      "https://placehold.co/800x500/F3EEE6/F3EEE6",
    tags: [
      { label: "订阅制", dimension: "business" },
      { label: "SEO 驱动", dimension: "growth" },
      { label: "技术转产品", dimension: "founder" },
    ],
    stage: "Revenue",
    stageColor: "#3B9B8B",
    featuredInsight:
      "从 Side Project 到月入 $3000，他只做了一件事：把 SEO 关键词直接做成产品功能页",
    isEditorsPick: true,
  },
  {
    slug: "riji-app",
    name: "日记本 App",
    tagline: "极简 AI 日记，帮你把碎碎念变成人生洞察",
    screenshot:
      "https://placehold.co/800x500/E8F4F0/E8F4F0",
    tags: [
      { label: "Freemium", dimension: "business" },
      { label: "社区驱动", dimension: "growth" },
      { label: "非技术 AI", dimension: "founder" },
    ],
    stage: "Launched",
    stageColor: "#DB6B25",
  },
  {
    slug: "seo-dashboard",
    name: "SEO Dashboard",
    tagline: "独立开发者的 SEO 数据中心，一个面板管所有站点",
    screenshot:
      "https://placehold.co/800x500/FDF5EB/FDF5EB",
    tags: [
      { label: "订阅制", dimension: "business" },
      { label: "内容营销", dimension: "growth" },
      { label: "小团队", dimension: "founder" },
    ],
    stage: "Scaling",
    stageColor: "#6C4FD6",
    isEditorsPick: true,
    featuredInsight:
      "两个人的团队，通过写 SEO 教程博客反向获客，3 个月从 0 到 500 付费用户",
  },
  {
    slug: "invoice-ninja",
    name: "Invoice Ninja CN",
    tagline: "面向自由职业者的中文发票和收款管理工具",
    screenshot:
      "https://placehold.co/800x500/F0ECF9/F0ECF9",
    tags: [
      { label: "一次性付费", dimension: "business" },
      { label: "口碑传播", dimension: "growth" },
      { label: "产品经理", dimension: "founder" },
    ],
    stage: "Revenue",
    stageColor: "#3B9B8B",
  },
  {
    slug: "color-palette-gen",
    name: "ColorPal",
    tagline: "给独立开发者的配色方案生成器，一键导出 Tailwind 变量",
    screenshot:
      "https://placehold.co/800x500/FBF5E8/FBF5E8",
    tags: [
      { label: "免费增值", dimension: "business" },
      { label: "产品自传播", dimension: "growth" },
      { label: "设计师", dimension: "founder" },
    ],
    stage: "Launched",
    stageColor: "#DB6B25",
  },
  {
    slug: "ai-copywriter",
    name: "写手 AI",
    tagline: "小红书爆款文案生成器，10 秒出 5 条标题",
    screenshot:
      "https://placehold.co/800x500/E8F0F4/E8F0F4",
    tags: [
      { label: "订阅制", dimension: "business" },
      { label: "付费投放", dimension: "growth" },
      { label: "非技术 AI", dimension: "founder" },
    ],
    stage: "Revenue",
    stageColor: "#3B9B8B",
  },
  {
    slug: "notionflow",
    name: "NotionFlow",
    tagline: "把 Notion 数据库一键变成公开网站，零代码建站",
    screenshot:
      "https://placehold.co/800x500/E6EFF4/E6EFF4",
    tags: [
      { label: "订阅制", dimension: "business" },
      { label: "社区驱动", dimension: "growth" },
      { label: "技术转产品", dimension: "founder" },
    ],
    stage: "Revenue",
    stageColor: "#3B9B8B",
    isEditorsPick: true,
    featuredInsight: "瞄准 Notion 生态的长尾需求，PMF 来得比预期快很多",
  },
  {
    slug: "habit-loop",
    name: "习惯回路",
    tagline: "21 天习惯养成 App，用游戏化机制让你坚持下去",
    screenshot:
      "https://placehold.co/800x500/F0E8F4/F0E8F4",
    tags: [
      { label: "Freemium", dimension: "business" },
      { label: "内容营销", dimension: "growth" },
      { label: "非技术 AI", dimension: "founder" },
    ],
    stage: "Launched",
    stageColor: "#DB6B25",
  },
  {
    slug: "api-monitor",
    name: "PingBot",
    tagline: "API 监控和状态页面，5 分钟部署，永久免费基础版",
    screenshot:
      "https://placehold.co/800x500/E4EEE8/E4EEE8",
    tags: [
      { label: "开源+付费", dimension: "business" },
      { label: "SEO 驱动", dimension: "growth" },
      { label: "技术转产品", dimension: "founder" },
    ],
    stage: "Scaling",
    stageColor: "#6C4FD6",
  },
  {
    slug: "resume-craft",
    name: "简历匠",
    tagline: "AI 帮你写简历，针对 JD 自动优化关键词匹配度",
    screenshot:
      "https://placehold.co/800x500/FBF0E6/FBF0E6",
    tags: [
      { label: "Freemium", dimension: "business" },
      { label: "SEO 驱动", dimension: "growth" },
      { label: "产品经理", dimension: "founder" },
    ],
    stage: "Revenue",
    stageColor: "#3B9B8B",
  },
];

export const exploreTags = [
  { label: "周末能做完", href: "/browse?effort=weekend" },
  { label: "月入过千", href: "/browse?revenue=1k_plus" },
  { label: "非技术也能做", href: "/browse?founder=non-tech" },
  { label: "SEO 起量", href: "/browse?growth=seo" },
  { label: "订阅制 SaaS", href: "/browse?model=subscription" },
  { label: "AI 应用", href: "/browse?tag=ai" },
  { label: "冷启动打法", href: "/browse?scenario=cold-start" },
  { label: "出海产品", href: "/browse?market=global" },
  { label: "开发者工具", href: "/browse?tag=devtools" },
  { label: "内容创作", href: "/browse?tag=content" },
  { label: "设计师做产品", href: "/browse?founder=designer" },
  { label: "社区驱动", href: "/browse?growth=community" },
  { label: "一次性付费", href: "/browse?model=one-time" },
  { label: "效率工具", href: "/browse?tag=productivity" },
  { label: "Chrome 插件", href: "/browse?platform=chrome-ext" },
  { label: "小程序", href: "/browse?platform=miniapp" },
  { label: "开源变现", href: "/browse?model=open-source" },
  { label: "产品经理转型", href: "/browse?founder=pm" },
];

export const radarStats = [
  { label: "本月最热赛道", value: "AI 应用", sub: "新增 8 个项目" },
  { label: "最常用工具", value: "Cursor", sub: "32% 的项目使用" },
  { label: "平均构建周期", value: "23 天", sub: "从 idea 到上线" },
  { label: "最有效增长方式", value: "SEO 驱动", sub: "38% 的盈利项目" },
];

# Solo Product 技术设计文档 v1.0

> 配套文档：《产品策略文档 v2.0》
> 更新时间：2026-04-08
> 目标读者：开发者（你自己 + AI 编码助手 + 未来招聘的工程师）

---

## 一、技术栈选型与理由

### 1.1 前端

| 技术 | 选型 | 理由 |
|------|------|------|
| 框架 | Next.js (App Router) | SSR/SSG 支持 SEO，API Routes 做轻量后端，生态成熟，AI 工具生成代码质量最高 |
| 样式 | TailwindCSS | AI 友好的原子化 CSS，开发效率高，响应式便捷 |
| UI 组件 | Shadcn/ui | 可定制、不绑定运行时、设计质量高、复制粘贴式引入不增加依赖 |
| 图标 | Lucide React | Shadcn/ui 默认搭配，体积小 |
| 动画 | Framer Motion（按需） | 仅在关键交互处使用，不滥用 |
| 状态管理 | Zustand（如需要） | 轻量，MVP 阶段大部分状态用 React Server Components 即可 |

### 1.2 后端 / API

| 技术 | 选型 | 理由 |
|------|------|------|
| API 层 | Next.js API Routes (Route Handlers) | 与前端同项目，部署简单，MVP 够用 |
| 数据验证 | Zod | 类型安全，前后端共享 schema |
| 后期 API 框架 | tRPC（可选升级） | 端到端类型安全，适合后续 App 端对接 |

### 1.3 数据存储（渐进式）

| 阶段 | 方案 | 说明 |
|------|------|------|
| MVP | 本地 JSON 文件 | 零成本，开发快，数据量小时完全够用 |
| 第二阶段 | Supabase (PostgreSQL) | 只用数据库能力，不绑定 Auth/Storage 等 |
| 国内迁移 | 阿里云 RDS / 腾讯云 PostgreSQL | 数据导出导入，改连接字符串即可 |

### 1.4 文件存储

| 阶段 | 方案 | 说明 |
|------|------|------|
| MVP | 本地 public 目录 + Vercel 托管 | 最简方案，截图直接存项目目录 |
| 第二阶段 | Cloudflare R2 | 免费额度大，S3 兼容 API |
| 国内迁移 | 阿里云 OSS / 腾讯云 COS | S3 兼容，换 endpoint 即可 |

### 1.5 部署

| 阶段 | 方案 | 说明 |
|------|------|------|
| MVP | Vercel | 零配置部署 Next.js，自带 CDN，免费额度够 |
| 国内迁移 | Docker + 阿里云 ECS / 轻量服务器 | Nginx 反代 + Node.js，接国内 CDN |

### 1.6 AI 服务

| 用途 | 方案 | 说明 |
|------|------|------|
| 内容生产（筛选/草稿/分析） | OneAPI 中转 | 统一接口，可切换后端模型 |
| 提交预填 | Claude API（Claude Team） | 理解能力强，适合从网页内容提取结构化信息 |
| 翻译 | OneAPI 中转 | 海外项目本地化 |

### 1.7 其他

| 用途 | 方案 |
|------|------|
| 版本管理 | GitHub（私有仓库） |
| 包管理 | pnpm |
| 代码规范 | ESLint + Prettier |
| 类型 | TypeScript（严格模式） |
| 截图服务 | Playwright（本地）/ screenshotone.com API（线上） |
| 邮件 | 公开发布前里程碑接入 Resend → 阿里云邮件推送（国内迁移后） |
| 分析 | Umami（自部署，隐私友好）或 Plausible |
| 错误监控 | Sentry |

---

## 二、项目结构

```
solo-product/
├── src/
│   ├── app/                          # Next.js App Router 页面
│   │   ├── layout.tsx                # 全局 Layout
│   │   ├── page.tsx                  # 首页
│   │   ├── browse/
│   │   │   └── [dimension]/
│   │   │       └── [value]/
│   │   │           └── page.tsx      # 按维度浏览页
│   │   ├── project/
│   │   │   └── [slug]/
│   │   │       └── page.tsx          # 项目详情页
│   │   ├── submit/
│   │   │   └── page.tsx              # 提交页
│   │   ├── recommend/
│   │   │   └── page.tsx              # 他荐推荐页
│   │   ├── radar/
│   │   │   └── page.tsx              # Radar 数据洞察页
│   │   ├── feedback/
│   │   │   └── page.tsx              # 反馈页
│   │   ├── api/                      # API Route Handlers
│   │   │   ├── projects/
│   │   │   │   ├── route.ts          # GET 项目列表 / POST 新增项目
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts      # GET/PUT/DELETE 单个项目
│   │   │   ├── submit/
│   │   │   │   ├── prefill/
│   │   │   │   │   └── route.ts      # POST URL → AI 预填
│   │   │   │   └── route.ts          # POST 提交项目
│   │   │   ├── recommend/
│   │   │   │   └── route.ts          # POST 他荐推荐
│   │   │   ├── feedback/
│   │   │   │   └── route.ts          # POST 提交反馈
│   │   │   ├── og/
│   │   │   │   └── route.tsx         # 动态 OG 图片生成
│   │   │   └── share/
│   │   │       └── route.tsx         # 分享卡片图片生成
│   │   └── sitemap.ts                # 自动生成 sitemap
│   │
│   ├── components/                   # UI 组件
│   │   ├── ui/                       # Shadcn/ui 基础组件
│   │   ├── layout/                   # 布局组件
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Navigation.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── project/                  # 项目相关组件
│   │   │   ├── ProjectCard.tsx       # 列表态卡片
│   │   │   ├── ProjectDetail.tsx     # 详情态
│   │   │   ├── ProjectGallery.tsx    # 卡片列表/网格
│   │   │   ├── ProjectFilters.tsx    # 筛选器
│   │   │   ├── RelatedProjects.tsx   # 智能关联导航
│   │   │   ├── TrackInsights.tsx     # 赛道事实观察
│   │   │   ├── DerivedIdeas.tsx      # 衍生机会
│   │   │   └── ShareCard.tsx         # 分享卡片渲染
│   │   ├── submit/                   # 提交相关组件
│   │   │   ├── SubmitForm.tsx        # 自荐表单
│   │   │   ├── RecommendForm.tsx     # 他荐表单
│   │   │   └── AIPrefillPreview.tsx  # AI 预填预览
│   │   ├── radar/                    # Radar 数据洞察组件
│   │   ├── feedback/                 # 反馈组件
│   │   └── common/                   # 通用组件
│   │       ├── TagBadge.tsx
│   │       ├── StageIndicator.tsx
│   │       └── SectionTitle.tsx
│   │
│   ├── services/                     # 服务层（核心抽象层）
│   │   ├── data/                     # 数据访问层
│   │   │   ├── index.ts              # 统一导出
│   │   │   ├── types.ts              # 数据类型定义
│   │   │   ├── local-json.ts         # MVP: 本地 JSON 实现
│   │   │   └── supabase.ts           # 第二阶段: Supabase 实现（预留）
│   │   ├── storage/                  # 文件存储层
│   │   │   ├── index.ts
│   │   │   ├── local.ts              # MVP: 本地文件系统
│   │   │   └── s3-compatible.ts      # 第二阶段: S3 兼容实现
│   │   ├── ai/                       # AI 服务层
│   │   │   ├── index.ts
│   │   │   ├── client.ts             # OneAPI / Claude API 客户端
│   │   │   ├── prefill.ts            # URL → 结构化数据提取
│   │   │   ├── scoring.ts            # 项目评分
│   │   │   ├── content-gen.ts        # 内容草稿生成
│   │   │   └── prompts/              # Prompt 模板管理
│   │   │       ├── prefill.md
│   │   │       ├── scoring.md
│   │   │       ├── content-jike.md
│   │   │       ├── content-xiaohongshu.md
│   │   │       └── insights.md
│   │   ├── notification/             # 通知服务层
│   │   │   ├── index.ts
│   │   │   ├── email.ts              # 邮件通知
│   │   │   └── wechat.ts             # 微信推送（预留）
│   │   ├── screenshot/               # 截图服务
│   │   │   ├── index.ts
│   │   │   └── playwright.ts
│   │   └── analytics/                # 数据分析层
│   │       └── index.ts
│   │
│   ├── lib/                          # 工具函数
│   │   ├── utils.ts                  # 通用工具
│   │   ├── slug.ts                   # URL slug 生成
│   │   ├── url-validator.ts          # URL 可达性验证
│   │   ├── seo.ts                    # SEO 相关工具（meta 生成等）
│   │   └── share-image.ts            # 分享图生成工具
│   │
│   ├── config/                       # 配置文件（分类体系等）
│   │   ├── categories.ts             # 主分类维度配置
│   │   ├── tags.ts                   # Tag 体系配置
│   │   ├── site.ts                   # 站点基础配置
│   │   └── sources.ts                # 信息源配置
│   │
│   ├── types/                        # 全局类型定义
│   │   ├── project.ts
│   │   ├── founder.ts
│   │   ├── feedback.ts
│   │   └── api.ts
│   │
│   └── styles/                       # 全局样式
│       └── globals.css               # TailwindCSS 入口 + Design Token CSS 变量
│
├── data/                             # MVP 本地数据存储
│   ├── projects/                     # 项目数据（每个项目一个 JSON 文件）
│   │   ├── project-slug-1.json
│   │   └── project-slug-2.json
│   ├── founders/                     # 创始人数据
│   ├── feedback/                     # 反馈数据
│   ├── submissions/                  # 待审核的提交
│   └── recommendations/              # 他荐推荐
│
├── scripts/                          # 自动化脚本
│   ├── pipeline/                     # 人机协作工作流
│   │   ├── scan-sources.ts           # Step 1: 扫描信息源
│   │   ├── ai-scoring.ts             # Step 2: AI 初筛打分
│   │   ├── generate-draft.ts         # Step 4: 生成内容草稿
│   │   └── generate-share-image.ts   # 生成小红书卡片图
│   ├── utils/
│   │   ├── screenshot.ts             # 批量截图工具
│   │   ├── url-check.ts              # 批量 URL 检测
│   │   └── data-migrate.ts           # 数据迁移脚本（JSON → SQL）
│   └── seed/
│       └── seed-projects.ts          # 种子数据填充
│
├── public/
│   ├── screenshots/                  # 产品截图（MVP 本地存储）
│   ├── avatars/                      # 创始人头像
│   ├── templates/                    # 小红书卡片模板底图
│   └── og/                           # 预生成的 OG 图片
│
├── prompts/                          # AI Prompt 版本管理
│   ├── scoring/
│   │   ├── v1.md                     # 初版评分标准
│   │   └── examples/                 # Few-shot 示例
│   │       ├── selected.json         # 你选择的项目案例
│   │       └── rejected.json         # 你拒绝的项目案例
│   ├── prefill/
│   │   └── v1.md
│   └── content/
│       ├── jike-v1.md
│       └── xiaohongshu-v1.md
│
├── .env.local                        # 环境变量（API keys 等）
├── .env.example                      # 环境变量模板
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 三、数据模型详细设计

### 3.1 Project（项目）

```typescript
type FieldSourceType =
  | 'public_page'
  | 'third_party_public'
  | 'founder_submitted'
  | 'founder_confirmed'
  | 'editor_verified'
  | 'ai_inference_internal';

type VerificationStatus = 'unverified' | 'founder_confirmed' | 'editor_verified';

interface VerifiableField<T> {
  value: T;
  sourceType: FieldSourceType;
  sourceUrl?: string;
  verificationStatus: VerificationStatus;
  updatedAt: string;                   // ISO 8601
  confidence?: number;                 // 仅内部参考，公开展示时可隐藏
  isPublic: boolean;                   // 是否允许对外展示
}

interface DerivedInsight {
  text: string;
  sampleSize: number;
  basedOnProjectIds: string[];
  generatedAt: string;                 // ISO 8601
}

interface Project {
  // 基础标识
  id: string;                          // UUID
  slug: string;                        // URL 友好的标识符，如 "ai-writing-tool"
  status: 'draft' | 'basic' | 'featured' | 'story';
  
  // 核心信息
  name: string;                        // 产品名
  tagline: string;                     // 一句话描述（50字以内）
  description: string;                 // 详细描述（500字以内）
  url: string;                         // 产品 URL
  screenshots: string[];               // 截图 URL 列表（第一张为主图）
  logo?: string;                       // Logo URL
  
  // 分类体系（主维度，均支持 'undetermined' 表示信息不足暂未确认）
  businessModel: BusinessModel;        // 商业模式
  buildEffort: BuildEffort;            // 构建门槛
  growthChannel: GrowthChannel;        // 增长方式
  founderType: FounderType;            // 创始人画像
  stage: ProjectStage;                 // 产品阶段
  
  // 标签体系（辅助维度）
  tags: {
    track: string[];                   // 赛道标签
    taskScenario: string[];            // 核心任务场景强标签
    tools: string[];                   // 工具标签
    techStack: string[];               // 技术栈标签
    market: string[];                  // 市场标签
    platform: string[];                // 平台标签
  };
  
  // 数据指标（可选公开）
  metrics?: {
    revenueRange?: VerifiableField<RevenueRange>; // 收入区间
    userCount?: VerifiableField<string>;          // 用户量描述
    launchedDate?: VerifiableField<string>;       // 上线日期 (ISO 8601)
    buildDuration?: VerifiableField<string>;      // 构建耗时描述
  };
  
  // Build Story（可选，创始人后续填写）
  buildStory?: {
    origin?: string;                   // 想法来源
    toolsUsed?: string;                // 工具和技术栈
    timeline?: string;                 // 时间线
    challenges?: string;               // 遇到的坑
    acquisition?: string;              // 获客策略
    currentStatus?: string;            // 当前状态和计划
  };
  
  // 衍生数据（系统自动生成）
  // TODO: derived 数据的存储策略待定——存入项目 JSON 有一致性问题（新增/删除项目时所有关联项目需更新），
  //       备选方案：1) 查询时实时计算（数据量 <1000 时性能足够）；2) 定时重算写入缓存文件，不存进项目本身。
  //       MVP 先按当前结构实现，数据量增长后评估是否需要调整。
  derived?: {
    relatedByTrack: string[];          // 同赛道项目 ID
    relatedByGrowth: string[];         // 同增长方式项目 ID
    relatedByFounder: string[];        // 同创始人画像项目 ID
    trackStats?: TrackStats;           // 赛道统计数据
    insights: DerivedInsight[];        // 事实性观察
  };
  
  // 来源信息
  source: {
    type: 'self_submit' | 'recommended' | 'curated';  // 自荐/他荐/编辑策展
    recommendedBy?: string;            // 推荐人（如为他荐）
    recommendReason?: string;          // 推荐理由
    originalSource?: string;           // 原始信息来源 URL
    claimedByFounder: boolean;         // 创始人是否已认领
    claimedAt?: string;                // 认领时间
  };
  
  // 关联
  founderId?: string;                  // 创始人 ID
  
  // 编辑信息
  editorNotes?: string;                // 编辑内部备注
  featuredInsight?: string;            // 精选时的一句话洞察
  
  // 元信息
  createdAt: string;                   // ISO 8601
  updatedAt: string;
  publishedAt?: string;                // 发布时间（basic 及以上才有）
}

// 枚举类型（全部从 config 文件读取，此处仅做类型约束）
// 所有主维度均包含 'undetermined'，用于信息不足时的自然留白
// UI 层面：undetermined 字段显示为淡色"待确认"标签或直接不展示该维度
// 筛选层面：undetermined 项目不出现在该维度的筛选结果中，但在全量浏览和搜索中正常展示

type BusinessModel = 
  | 'subscription' | 'one_time' | 'freemium' 
  | 'ad_revenue' | 'commission' | 'open_source_plus' | 'content_paid'
  | 'undetermined';

type BuildEffort = 'weekend' | 'monthly' | 'ongoing' | 'undetermined';

type GrowthChannel = 
  | 'seo' | 'community' | 'content_marketing' 
  | 'paid_ads' | 'viral' | 'mixed'
  | 'undetermined';

type FounderType = 
  | 'tech_to_product' | 'designer' | 'product_manager' 
  | 'non_tech_ai' | 'small_team'
  | 'undetermined';

type ProjectStage = 'idea' | 'building' | 'launched' | 'revenue' | 'scaling';

type RevenueRange = 
  | 'pre_revenue' | 'under_1k' | '1k_5k' | '5k_10k' 
  | '10k_50k' | '50k_plus';

interface TrackStats {
  sampleSize: number;                  // 参与统计的项目数
  totalInTrack: number;                // 同赛道项目总数
  businessModelDistribution: Record<string, number>;
  growthChannelDistribution: Record<string, number>;
  avgBuildEffort?: string;
  revenueDistribution?: Record<string, number>;
  generatedAt: string;                 // 统计生成时间
}
```

### 3.2 Founder（创始人）

```typescript
interface Founder {
  id: string;
  name: string;
  avatar?: string;
  bio?: string;                        // 一句话简介
  backgroundType: FounderType;
  
  socialLinks?: {
    website?: string;
    twitter?: string;
    jike?: string;                     // 即刻主页
    github?: string;
    xiaohongshu?: string;
    wechat?: string;                   // 微信号（不公开展示，仅内部联系用）
    email?: string;
  };
  
  projectIds: string[];                // 关联的项目 ID
  
  claimedAt?: string;                  // 认领时间
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 Submission（提交记录）

```typescript
interface Submission {
  id: string;
  type: 'self_submit' | 'recommend';
  
  // 用户输入
  url: string;
  additionalText?: string;            // 自由文本描述（备选提交方式）
  recommendReason?: string;            // 他荐理由
  
  // AI 预填结果
  aiPrefilled?: {
    name?: string;
    tagline?: string;
    description?: string;
    suggestedTags?: string[];
    suggestedCategory?: Partial<{
      businessModel: BusinessModel;
      buildEffort: BuildEffort;
      growthChannel: GrowthChannel;
      founderType: FounderType;
      stage: ProjectStage;
    }>;
    screenshot?: string;
    confidence: number;                // AI 置信度 0-1
  };
  
  // 用户确认/修改后的最终数据
  confirmedData?: Partial<Project>;
  
  // 状态
  status: 'pending_prefill' | 'pending_confirm' | 'pending_review' | 'approved' | 'rejected';
  reviewNotes?: string;                // 审核备注
  
  submittedBy?: string;                // 提交者 ID（如已登录）
  submittedAt: string;
  reviewedAt?: string;
}
```

### 3.4 Feedback（反馈）

```typescript
interface Feedback {
  id: string;
  type: 'error_report' | 'project_suggestion' | 'feature_request' | 'general';
  
  // 结构化内容（根据 type 不同）
  content: {
    projectId?: string;                // 相关项目（如有）
    description: string;
    severity?: 'low' | 'medium' | 'high';
    suggestedUrl?: string;             // 建议添加的项目 URL
  };
  
  // AI 分析结果
  aiAnalysis?: {
    category: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    actionable: boolean;
    summary: string;
  };
  
  status: 'new' | 'reviewed' | 'acted' | 'dismissed';
  submittedAt: string;
}
```

### 3.5 本地 JSON 存储结构

MVP 阶段每个实体存为独立 JSON 文件，目录结构即数据库：

```
data/
├── projects/
│   ├── _index.json              # 项目索引（ID/slug/status/分类/标签的轻量映射，用于列表查询和筛选）
│   ├── ai-writing-tool.json     # 单个项目完整数据
│   └── seo-dashboard.json
├── founders/
│   ├── _index.json
│   └── founder-id-1.json
├── submissions/
│   ├── pending/                 # 待处理的提交
│   └── archived/                # 已处理的提交
├── feedback/
│   └── feedback-id-1.json
└── pipeline/                    # 工作流数据
    ├── candidates/              # AI 扫描的候选项目
    ├── scored/                  # AI 打分后的候选
    └── drafts/                  # AI 生成的内容草稿
```

索引文件 `_index.json` 的作用是避免每次列表查询都读取所有完整文件。筛选和排序基于索引完成，只在详情页才读取完整数据。

---

## 四、核心服务层设计

### 4.1 数据访问层 (DataService)

**设计原则：** 业务代码永远通过 DataService 操作数据，不直接读写文件或数据库。DataService 内部实现可替换（JSON → Supabase → 国内 RDS），业务层零改动。

```typescript
// services/data/types.ts — 统一接口定义
interface DataService {
  // Projects
  listProjects(filters: ProjectFilters, pagination: Pagination): Promise<ProjectListResult>;
  getProject(slug: string): Promise<Project | null>;
  createProject(data: CreateProjectInput): Promise<Project>;
  updateProject(id: string, data: UpdateProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  
  // 智能关联查询
  getRelatedProjects(projectId: string, dimension: RelationDimension, limit: number): Promise<Project[]>;
  getTrackStats(track: string): Promise<TrackStats>;
  
  // Founders
  getFounder(id: string): Promise<Founder | null>;
  upsertFounder(data: UpsertFounderInput): Promise<Founder>;
  
  // Submissions
  createSubmission(data: CreateSubmissionInput): Promise<Submission>;
  listSubmissions(status: SubmissionStatus): Promise<Submission[]>;
  updateSubmissionStatus(id: string, status: SubmissionStatus, notes?: string): Promise<void>;
  
  // Feedback
  createFeedback(data: CreateFeedbackInput): Promise<Feedback>;
  listFeedback(filters?: FeedbackFilters): Promise<Feedback[]>;
  
  // 统计
  getStats(): Promise<PlatformStats>;
}

interface ProjectFilters {
  status?: ProjectStatus[];
  businessModel?: BusinessModel[];
  buildEffort?: BuildEffort[];
  growthChannel?: GrowthChannel[];
  founderType?: FounderType[];
  stage?: ProjectStage[];
  taskScenario?: string[];
  tags?: string[];
  search?: string;                     // 全文搜索
}

interface Pagination {
  page: number;
  pageSize: number;
  sortBy: 'newest' | 'oldest' | 'revenue' | 'name';
}
```

**MVP 实现 (local-json.ts)：** 读写 `data/` 目录下的 JSON 文件。索引文件做内存缓存，文件变更时失效。筛选和排序在内存中完成（数据量 < 1000 时性能足够）。

**迁移到 Supabase 时：** 新建 `supabase.ts` 实现同一接口，用 SQL 查询替代文件读取。配置文件切换 `DATA_PROVIDER=supabase`。业务代码不改。

### 4.2 文件存储层 (StorageService)

```typescript
interface StorageService {
  upload(key: string, file: Buffer, contentType: string): Promise<string>;  // 返回公开 URL
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
```

MVP 实现：写到 `public/` 目录，URL 就是 `/screenshots/xxx.png`。后期切 R2/OSS 时换实现。

### 4.3 AI 服务层 (AIService)

```typescript
interface AIService {
  // URL → 结构化数据提取
  prefillFromUrl(url: string): Promise<AIPrefillResult>;
  
  // 从自由文本提取结构化数据
  prefillFromText(text: string): Promise<AIPrefillResult>;
  
  // 项目评分
  scoreProject(rawData: RawProjectData): Promise<AIScoreResult>;
  
  // 内容草稿生成
  generateDraft(project: Project, angle: string): Promise<ContentDraftResult>;
  
  // 赛道洞察生成
  generateTrackInsights(trackProjects: Project[]): Promise<DerivedInsight[]>;
  
  // 反馈分析
  analyzeFeedback(feedback: Feedback): Promise<FeedbackAnalysis>;
}

interface AIPrefillResult {
  name?: string;
  tagline?: string;
  description?: string;
  suggestedCategories: Partial<ProjectCategories>;
  suggestedTags: string[];
  screenshot?: string;
  confidence: number;
}

interface AIScoreResult {
  overall: number;                     // 1-5
  dimensions: {
    isIndie: number;                   // 是否独立/小团队
    isLive: number;                    // 是否已上线
    infoRichness: number;              // 信息丰富度
    uniqueness: number;                // 独特性
    personaA: number;                  // 画像 A 启发价值
    personaB: number;                  // 画像 B 启发价值
    personaC: number;                  // 画像 C 启发价值
  };
  reasoning: string;                   // AI 的评分理由
}

interface ContentDraftResult {
  jikeVersion: string;                 // 即刻深度版
  xiaohongshuVersion: string;          // 小红书精华版
  cardData: Partial<Project>;          // 项目卡片结构化数据
  derivedInsights: DerivedInsight[];   // 衍生观察
}
```

**Prompt 管理：** 所有 Prompt 存为 Markdown 文件在 `prompts/` 目录下，版本化管理。评分 Prompt 包含 few-shot 示例文件（你选择/拒绝的案例），持续迭代。

**AI 调用统一走 OneAPI：** 不直接调用各模型厂商 API。OneAPI 中转做负载均衡和 fallback。代码里只需要配置 `ONEAPI_BASE_URL` 和 `ONEAPI_API_KEY`。Claude Team 的 API 用于特殊任务（如 prefill 需要强理解力时）。

### 4.4 通知服务层 (NotificationService)

```typescript
interface NotificationService {
  // 发送通知
  notify(params: NotifyParams): Promise<void>;
  
  // 订阅管理（第二阶段）
  subscribe(userId: string, topic: SubscriptionTopic): Promise<void>;
  unsubscribe(userId: string, topic: SubscriptionTopic): Promise<void>;
}

interface NotifyParams {
  userId?: string;
  email?: string;
  channel: 'email' | 'wechat' | 'in_app';
  template: NotificationTemplate;
  data: Record<string, any>;
}

type NotificationTemplate = 
  | 'project_claimed'           // 你的项目被认领了
  | 'project_featured'          // 你的项目被精选了
  | 'new_recommendation'        // 有人推荐了你的产品
  | 'weekly_digest'             // 每周精选摘要
  | 'track_update';             // 关注的赛道有新项目
```

MVP 阶段不接入通知通道，只保留接口定义。公开发布前里程碑优先接入邮件摘要；微信通道视主体条件和实际需求再接入。

### 4.5 截图服务 (ScreenshotService)

```typescript
interface ScreenshotService {
  capture(url: string, options?: ScreenshotOptions): Promise<Buffer>;
}

interface ScreenshotOptions {
  width?: number;       // 默认 1280
  height?: number;      // 默认 800
  fullPage?: boolean;   // 默认 false
  delay?: number;       // 页面加载后等待时间（ms）
}
```

MVP 实现：Playwright headless Chrome 本地截图。线上可切换为 screenshotone.com 等 API 服务。

---

## 五、核心功能实现方案

### 5.1 AI 预填提交流程

```
用户粘贴 URL
    ↓
前端调用 POST /api/submit/prefill { url }
    ↓
后端流程：
    ① URL 可达性验证（fetch HEAD 请求，检查状态码）
    ② 如不可达 → 返回错误提示
    ③ 如可达 → 并行执行：
       - Playwright 截取页面截图
       - fetch 页面 HTML
       - AI 分析 HTML 内容，提取：
         · 产品名（from title / h1 / og:title）
         · 描述（from meta description / og:description / 页面正文）
         · 分类建议（AI 判断）
         · 标签建议（AI 判断）
    ④ 返回 AIPrefillResult
    ↓
前端展示预填卡片草稿
用户确认/修改/补充必填字段
    ↓
前端调用 POST /api/submit { confirmedData }
    ↓
后端：存入 submissions/pending/，状态为 pending_review
    ↓
你定期审核 pending submissions，approve → 生成正式 Project 数据
```

**降级方案：**
- 如 Playwright 截图失败 → 使用 og:image 作为备选截图
- 如 AI 提取失败 → 返回空白表单让用户手动填写
- 如 URL 完全不可达 → 提示用户检查链接

### 5.2 智能关联导航

不需要复杂算法，基于分类体系的精确匹配即可：

```typescript
// 获取同赛道项目
const relatedByTrack = await dataService.listProjects({
  tags: currentProject.tags.track,     // 相同赛道标签
  status: ['featured', 'story'],       // 只推精选以上
}, { pageSize: 5, sortBy: 'newest' });

// 获取同增长方式项目
const relatedByGrowth = await dataService.listProjects({
  growthChannel: [currentProject.growthChannel],
  status: ['featured', 'story'],
}, { pageSize: 5, sortBy: 'newest' });

// 获取同创始人画像项目
const relatedByFounder = await dataService.listProjects({
  founderType: [currentProject.founderType],
  status: ['featured', 'story'],
}, { pageSize: 5, sortBy: 'newest' });
```

排除当前项目自身。如某维度结果不足 3 个，该区块不展示（避免内容稀疏时的尴尬体验）。

### 5.3 赛道事实观察自动生成

```typescript
async function generateTrackStats(project: Project): Promise<TrackStats> {
  const trackProjects = await dataService.listProjects({
    tags: project.tags.track,
    status: ['basic', 'featured', 'story'],
  }, { pageSize: 100, sortBy: 'newest' });

  const publicRevenueProjects = trackProjects.items.filter(
    p => p.metrics?.revenueRange?.isPublic && p.metrics.revenueRange.value
  );
  
  return {
    sampleSize: trackProjects.items.length,
    totalInTrack: trackProjects.total,
    businessModelDistribution: countBy(trackProjects.items, 'businessModel'),
    growthChannelDistribution: countBy(trackProjects.items, 'growthChannel'),
    revenueDistribution: countBy(publicRevenueProjects, p => p.metrics?.revenueRange?.value),
    generatedAt: new Date().toISOString(),
  };
}
```

结果缓存，项目库变更时失效重算。数据量小时实时计算也足够快。样本量不足时前端只展示事实描述，不展示比例型结论。

### 5.4 分享卡片图生成

使用 Next.js 的 ImageResponse（基于 Satori）或 @vercel/og 在 API Route 中动态生成 PNG。

```
GET /api/share/[projectSlug]
    ↓
读取项目数据
    ↓
渲染为 1200x630（OG 标准）或 1080x1440（小红书 3:4）的 PNG
    ↓
包含：产品名、一句话洞察、关键数据、产品截图缩略图、平台 logo
    ↓
设置 Cache-Control 长缓存
```

注意：Satori 基于 JSX → SVG → PNG，不依赖浏览器，国内迁移后同样可用。如果发现 @vercel/og 绑定 Vercel，改用独立的 satori + resvg-js 方案。

### 5.5 筛选系统

前端筛选器组件支持多维度交叉筛选。URL query params 同步筛选状态（支持分享带筛选条件的链接）。核心任务场景作为强标签参与筛选和相关推荐。

```
/browse?businessModel=subscription&growthChannel=seo&taskScenario=acquisition-playbook
```

MVP 阶段数据量小，筛选在前端完成（SSG 生成全量数据，前端 filter）。数据量大后切到后端 API 筛选 + 分页。

### 5.6 SEO 实现

**Sitemap 自动生成：**
```typescript
// app/sitemap.ts
export default async function sitemap() {
  const projects = await dataService.listProjects(
    { status: ['featured', 'story'] }, 
    { pageSize: 1000, sortBy: 'newest' }
  );
  return projects.items.map(p => ({
    url: `${SITE_URL}/project/${p.slug}`,
    lastModified: p.updatedAt,
    priority: p.status === 'story' ? 0.9 : 0.7,
  }));
}
```

**每个页面的 Meta：**
```typescript
// app/project/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const project = await dataService.getProject(params.slug);
  return {
    title: `${project.name} - ${project.tagline} | SoloProduct`,
    description: project.description,
    openGraph: {
      title: project.name,
      description: project.tagline,
      images: [`/api/og/${project.slug}`],
    },
  };
}
```

**结构化数据 (JSON-LD)：**
```typescript
// 每个项目详情页注入 SoftwareApplication schema
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": project.name,
  "description": project.description,
  "url": project.url,
  "applicationCategory": project.tags.track[0],
  "offers": { ... }
}
</script>
```

### 5.7 反馈入口

结构化表单，根据反馈类型动态展示不同字段。提交后存入 JSON，定期 AI 批量分析。

```typescript
// AI 批量分析反馈
async function analyzeFeedbackBatch() {
  const newFeedback = await dataService.listFeedback({ status: 'new' });
  for (const fb of newFeedback) {
    const analysis = await aiService.analyzeFeedback(fb);
    await dataService.updateFeedback(fb.id, { aiAnalysis: analysis, status: 'reviewed' });
  }
  // 生成汇总报告
  const summary = await aiService.summarizeFeedback(newFeedback);
  // 输出到你的内部仪表盘或 Notion
}
```

---

## 六、人机协作工作流 Pipeline 技术方案

### 6.1 架构概览

```
信息源 RSS/API ──→ scan-sources.ts ──→ candidates/*.json
                                            │
                                            ▼
                                      ai-scoring.ts ──→ scored/*.json
                                            │
                                            ▼
                                    你的选品决策（手动）
                                            │
                                            ▼
                                    generate-draft.ts ──→ drafts/*.json
                                            │
                                            ▼
                                    你的审核润色（手动）
                                            │
                                            ▼
                                      发布到平台 + 社交媒体
```

### 6.2 Step 1: 信息源扫描脚本

```typescript
// scripts/pipeline/scan-sources.ts
import { sources } from '@/config/sources';

interface SourceConfig {
  name: string;
  type: 'rss' | 'api' | 'manual';
  url: string;
  parser: (rawData: any) => CandidateProject[];
  enabled: boolean;
}

interface CandidateProject {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  description?: string;
  productUrl?: string;
  authorName?: string;
  authorProfile?: string;
  rawContent: string;
  fetchedAt: string;
}

// 主流程
async function scanAllSources() {
  const candidates: CandidateProject[] = [];
  
  for (const source of sources.filter(s => s.enabled)) {
    try {
      const rawData = await fetchSource(source);
      const parsed = source.parser(rawData);
      const deduped = deduplicateAgainstExisting(parsed);  // 去重（跟已有项目和已处理候选对比）
      candidates.push(...deduped);
    } catch (error) {
      console.error(`Source ${source.name} failed:`, error);
      // 不中断其他源的扫描
    }
  }
  
  // 写入 data/pipeline/candidates/
  await saveCandidates(candidates);
  console.log(`Scanned ${candidates.length} new candidates`);
}
```

**信息源适配器：**

```typescript
// 即刻 via RSSHub
const jikeSource: SourceConfig = {
  name: 'Jike - 独立开发',
  type: 'rss',
  url: 'https://rsshub.app/jike/topic/...',  // 具体 topic ID
  parser: parseRSSItems,
  enabled: true,
};

// Product Hunt via GraphQL API
const productHuntSource: SourceConfig = {
  name: 'Product Hunt - Daily',
  type: 'api',
  url: 'https://api.producthunt.com/v2/api/graphql',
  parser: parseProductHuntResponse,
  enabled: true,
};

// V2EX via API
const v2exSource: SourceConfig = {
  name: 'V2EX - 分享创造',
  type: 'api',
  url: 'https://www.v2ex.com/api/v2/nodes/create/topics',
  parser: parseV2exTopics,
  enabled: true,
};
```

**运行方式：** MVP 阶段用 `npx tsx scripts/pipeline/scan-sources.ts` 手动触发。后期设为 cron job 每日自动执行。

### 6.3 Step 2: AI 评分脚本

```typescript
// scripts/pipeline/ai-scoring.ts
async function scoreAllCandidates() {
  const candidates = await loadCandidates('unscored');
  
  for (const candidate of candidates) {
    const score = await aiService.scoreProject({
      title: candidate.title,
      description: candidate.description,
      url: candidate.productUrl,
      rawContent: candidate.rawContent,
    });
    
    const scored = { ...candidate, aiScore: score };
    
    if (score.overall >= 3) {
      await saveScoredCandidate(scored, 'passed');
    } else {
      await saveScoredCandidate(scored, 'filtered');
    }
  }
}
```

**评分 Prompt 结构：**

```markdown
# 项目评分标准

你是一个独立产品策展平台的 AI 助手。请对以下项目信息进行评估。

## 评分维度（每项 1-5 分）

1. 独立性：是否为个人或小团队（< 5 人）的产品？大厂或融资公司的产品给 1 分。
2. 上线状态：是否已有可访问的产品？纯概念或 coming soon 给 1 分。
3. 信息丰富度：原始信息是否包含足够的产品描述、功能、数据？
4. 独特性：是否有差异化？又一个 todo list 给 1-2 分。
5-7. 用户画像价值（分别对三个画像打分）：
   - 画像 A（想做副业的程序员）：对他有灵感/赛道判断价值吗？
   - 画像 B（非技术 Vibe Coder）：对他有路径参考价值吗？
   - 画像 C（已有产品的创始人）：对他有获客经验价值吗？

## 参考案例

### 选中的优秀案例：
{few_shot_selected}

### 被淘汰的案例：
{few_shot_rejected}

## 请评估以下项目：

标题：{title}
描述：{description}
URL：{url}
原始内容：{rawContent}

请以 JSON 格式输出评分和理由。
```

### 6.4 Step 4: 内容草稿生成脚本

```typescript
// scripts/pipeline/generate-draft.ts
// 在你选定项目并提供角度后运行

async function generateDraft(candidateId: string, angle: string) {
  const candidate = await loadScoredCandidate(candidateId);
  
  // 如果有产品 URL，先截图
  let screenshot: string | undefined;
  if (candidate.productUrl) {
    screenshot = await screenshotService.capture(candidate.productUrl);
  }
  
  // AI 生成内容
  const draft = await aiService.generateDraft(candidate, angle);
  
  // 保存草稿
  await saveDraft({
    candidateId,
    ...draft,
    screenshot,
    generatedAt: new Date().toISOString(),
  });
  
  console.log('Draft generated. Review at: data/pipeline/drafts/');
}
```

---

## 七、部署与迁移方案

### 7.1 MVP 部署（Vercel）

```
GitHub Push → Vercel 自动构建部署
域名：soloProduct.com（示意）→ Vercel DNS
SSL：Vercel 自动管理
环境变量：Vercel Dashboard 配置
```

### 7.2 国内迁移路径

```
阶段一（当前）：
  Vercel (海外) ← soloProduct.com

阶段二（备案通过后）：
  Vercel (海外) ← soloProduct.com     ← 海外用户 + SEO
  阿里云 ECS   ← soloProduct.cn      ← 国内用户

阶段三（如需完全迁移）：
  阿里云 ECS   ← soloProduct.com + .cn
  阿里云 CDN   ← 静态资源加速
  阿里云 RDS   ← PostgreSQL 数据库
  阿里云 OSS   ← 文件存储
```

**Docker 化部署：**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

**国内服务器配置：**
```nginx
# Nginx 反代配置
server {
    listen 443 ssl;
    server_name soloProduct.cn;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /_next/static/ {
        alias /app/.next/static/;
        expires 365d;
    }
}
```

### 7.3 环境变量管理

```bash
# .env.example

# 站点配置
NEXT_PUBLIC_SITE_URL=https://soloProduct.com
NEXT_PUBLIC_SITE_NAME=SoloProduct

# 数据提供者
DATA_PROVIDER=local-json  # local-json | supabase

# Supabase（第二阶段）
SUPABASE_URL=
SUPABASE_ANON_KEY=

# 文件存储
STORAGE_PROVIDER=local  # local | r2 | oss
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=

# AI 服务
ONEAPI_BASE_URL=
ONEAPI_API_KEY=
CLAUDE_API_KEY=  # Claude Team，用于 prefill 等需要强理解力的任务

# 截图服务
SCREENSHOT_PROVIDER=playwright  # playwright | api
SCREENSHOT_API_KEY=

# 邮件
RESEND_API_KEY=

# Product Hunt API
PRODUCTHUNT_API_TOKEN=

# 分析
UMAMI_WEBSITE_ID=
UMAMI_URL=

# 错误监控
SENTRY_DSN=
```

---

## 八、性能与缓存策略

### 8.1 Next.js 渲染策略

| 页面 | 渲染方式 | 理由 |
|------|----------|------|
| 首页 | ISR (revalidate: 3600) | 精选内容每小时更新一次足够 |
| 浏览/筛选页 | ISR (revalidate: 3600) | 同上 |
| 项目详情页 | ISR (revalidate: 86400) + 按需 revalidate | 项目数据不频繁变化，但编辑更新时触发重建 |
| 提交页 | SSR | 需要实时 AI 交互 |
| Radar Demo | SSG | 静态 demo 数据，构建时生成 |
| API Routes | 动态 | 实时处理请求 |

### 8.2 数据缓存

MVP 阶段数据量极小，不需要复杂缓存。注意事项：
- 索引文件 `_index.json` 读入内存后缓存，文件变更时失效
- 赛道统计数据可缓存 1 小时
- AI 预填结果不缓存（每次重新生成）

后期引入 Redis/Upstash 做热数据缓存。

### 8.3 图片优化

- 产品截图统一裁剪为标准尺寸（如 1280x800）
- 使用 Next.js Image 组件自动做格式转换（WebP/AVIF）和响应式尺寸
- 列表态使用小尺寸缩略图，详情态使用原图
- 分享卡片图生成后缓存（项目数据不变则不重新生成）

---

## 九、安全与合规

### 9.1 输入安全

- 所有用户输入经 Zod 验证（类型、长度、格式）
- URL 输入做白名单协议检查（仅 http/https）
- 文本输入做 XSS 过滤
- 文件上传（如有）做类型和大小限制

### 9.2 API 安全

- 提交类 API 做 rate limiting（IP 维度，如 10 次/分钟）
- AI 预填 API 做更严格的 rate limiting（成本控制，如 5 次/分钟/IP）
- CSRF 保护（Next.js 自带 SameSite cookie）

### 9.3 数据合规

- 只使用公开可获取的产品信息
- 提供"申请移除"入口
- 不存储用户敏感信息（MVP 阶段无用户系统）
- 反馈数据不公开展示
- 符合中国大陆数据存储要求（国内迁移后数据存国内）
- 关键数据字段保留来源、验证状态、更新时间，便于审计和纠错

### 9.4 内容合规

- AI 生成内容由你人工审核后才发布
- 不展示违法违规内容（色情、赌博、政治敏感等）
- 国内备案后遵守 ICP 备案要求

---

## 十、监控与分析

### 10.1 产品成功指标

- 北极星指标：每周深度发现会话数
- 辅助指标：首页/落地页 → 首个详情页点击率
- 辅助指标：详情页 → 关联项目二跳率
- 辅助指标：深度发现会话占比
- 辅助指标：被收录创始人的回访/补充率
- 辅助指标：每周新增推荐/自荐数量

建议埋点事件：
- `project_detail_view`
- `related_project_click`
- `browse_filter_apply`
- `task_scenario_click`
- `deep_discovery_session`
- `submission_start`
- `submission_complete`
- `founder_outreach_sent`
- `founder_reply_received`

### 10.2 访问分析

使用 Umami（自部署）或 Plausible（隐私友好，不需要 cookie 弹窗）：
- PV / UV / 页面停留时间
- 来源渠道分析（小红书/即刻/搜索引擎/直接访问）
- 热门项目排行
- 筛选维度使用分析（哪些分类被用得最多）
- 浏览者漏斗：落地页浏览 → 首个详情页 → 关联跳转 → 深度发现会话
- 创始人漏斗：被收录后触达 → 回站查看 → 补充/纠错 → 分享收录页

### 10.3 错误监控

Sentry 集成：
- 前端 JS 错误捕获
- API Route 错误捕获
- AI 服务调用失败告警

### 10.4 工作流监控

Pipeline 执行日志：
- 每次扫描的候选项目数
- AI 筛选通过率
- 内容生成成功率
- 各信息源的可用性状态

---

## 十一、测试策略

### 11.1 MVP 阶段测试

不追求高覆盖率，只测关键路径：

- 数据访问层：JSON 读写正确性、筛选逻辑正确性
- AI 预填流程：URL → 预填结果的完整链路
- 提交流程：提交 → 存储 → 状态流转
- 分类配置：分类/标签加载正确性
- 关键数据字段：来源/验证状态/更新时间渲染正确

### 11.2 手工回归清单

每次上线前你手工验证：
- [ ] 首页加载正常，精选项目显示正确
- [ ] 项目详情页所有区块渲染正常
- [ ] 筛选功能正常（各维度交叉筛选）
- [ ] 提交流程完整走通（URL → 预填 → 确认 → 进入待审核）
- [ ] 他荐推荐流程走通
- [ ] 反馈提交走通
- [ ] 移动端响应式正常（重点检查小红书/即刻内链接打开的体验）
- [ ] 分享卡片图正确生成
- [ ] 关键数据的来源、验证状态、更新时间显示正确
- [ ] SEO meta 正确（用 Google Rich Results Test 验证）

---

## 十二、开发规范

### 12.1 代码风格

- TypeScript 严格模式，不允许 `any`
- 组件：函数组件 + hooks，不用 class 组件
- 命名：组件 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE_CASE
- 文件命名：组件文件 PascalCase.tsx，其余 kebab-case.ts
- 每个组件/模块有清晰的 JSDoc 注释

### 12.2 Git 规范

- main 分支保持可部署状态
- 功能开发用 feature/xxx 分支
- Commit message 格式：`feat|fix|refactor|docs|chore: 简要描述`

### 12.3 组件设计原则

- 展示组件和容器组件分离
- 组件 props 使用 TypeScript interface 定义
- 样式自包含（TailwindCSS class 在组件内）
- 复杂状态用 custom hook 抽取
- 配置数据从 config/ 读取，不硬编码

---

## 十三、后续迭代规划

### 公开发布前里程碑（MVP 完成后，正式宣传前）

- 用户登录系统（优先服务认领/补充资料）
- 项目认领流程系统化
- 邮件订阅 / 每周精选摘要
- 收录 / 精选通知模板
- 创始人补充信息入口
- 微信推送通知（如主体条件具备则接入，否则后移）

### 第二阶段（公开发布后 1-2 个月）

- 收藏/关注功能
- 赛道/创始人订阅
- 数据库迁移到 Supabase
- 里程碑更新系统
- 自动化信息源扫描（cron job）
- Radar 真实数据版

### 第三阶段（3-6 个月）

- PWA 支持（添加到主屏幕、离线缓存）
- Featured Story 深度内容（含付费墙预研）
- Idea 聚合视图
- 高级筛选和数据导出
- API 开放（为未来 App 端预备）
- 全文搜索（Meilisearch 或 Algolia）

### 第四阶段（6-12 个月）

- iOS App（React Native 或 Swift）
- 国内完全迁移（阿里云全套）
- 付费功能上线
- 微信小程序
- 创始人社区功能（谨慎开放）

---

## 附录 A：小红书卡片图模板技术方案

使用 Satori + resvg-js 在 Node.js 端生成图片，不依赖浏览器。

模板规格：
- 尺寸：1080 x 1440 px（3:4，小红书推荐比例）
- 格式：PNG
- 内容区域：产品名（大号标题）、一句话洞察（副标题）、产品截图（居中展示）、关键数据标签（收入/用户/构建周期）、平台 logo 水印（右下角）

预设 2-3 套配色方案轮换，避免视觉疲劳。

---

## 附录 B：OG 图片动态生成技术方案

利用 Next.js API Route + Satori：

```typescript
// app/api/og/[slug]/route.tsx
import { ImageResponse } from 'next/og';

export async function GET(request: Request, { params }) {
  const project = await dataService.getProject(params.slug);
  
  return new ImageResponse(
    (
      <div style={{ /* 1200x630 OG 标准布局 */ }}>
        <h1>{project.name}</h1>
        <p>{project.tagline}</p>
        {/* 品牌化设计 */}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

注意迁移风险：`next/og` 底层是 Satori，不绑定 Vercel。但如果发现问题，可改用独立的 satori + sharp 方案。

---

## 附录 C：数据迁移脚本设计

```typescript
// scripts/utils/data-migrate.ts
// 从本地 JSON 迁移到 Supabase

async function migrateToSupabase() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // 读取所有本地项目
  const projects = await localDataService.listProjects({}, { pageSize: 10000 });
  
  // 批量插入 Supabase
  for (const batch of chunk(projects.items, 50)) {
    const { error } = await supabase.from('projects').insert(
      batch.map(projectToDbRow)
    );
    if (error) console.error('Migration error:', error);
  }
  
  // 同样迁移 founders, feedback 等
  // ...
  
  console.log('Migration complete');
}
```

---

## 附录 D：RSS 输出（让平台自身内容可被订阅）

平台提供 RSS feed，让用户可以通过 RSS 阅读器订阅精选更新：

```typescript
// app/feed.xml/route.ts
export async function GET() {
  const projects = await dataService.listProjects(
    { status: ['featured', 'story'] },
    { pageSize: 20, sortBy: 'newest' }
  );
  
  const rss = generateRSSXML(projects.items);
  return new Response(rss, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
```

这也有助于被 AI 搜索引擎收录。

---

*本文档随开发推进持续更新。与《产品策略文档 v2.0》配套使用。*

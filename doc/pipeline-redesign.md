# Solobase 数据管道重设计文档

> 类型：实施规范 + 决策记录  
> 状态：设计中（2026-04-12）  
> 前置阅读：`doc/data system design.md`（概念模型与原则）  
> 本文聚焦：从概念到落地的管道架构、人机协作模式、AI 集成设计

---

## 一、现状诊断（诚实的数字）

在做任何设计决策前，先把真实的漏斗摆出来。

### 1.1 当前数据漏斗

```
原始爬取：4,188 条（Jike 2613 + Linux.do 1164 + V2EX 411）
    ↓ 有外部链接
  1,458 条（35%）
    ↓ 分数 >= 8
  1,330 条（32%）
    ↓ 有 media 字段（图片）← 致命瓶颈
    419 条（10%，且全部来自 Jike）
    ↓ build-feed 进一步过滤（名称提取、图片可访问性验证）
    152 条（3.6%）进入网站
         └── 129 产品（全部来自 Jike）
         └──  23 帖子（Linux.do 14 + Jike 4 + V2EX 5）
```

### 1.2 关键数字

| 问题 | 量化 |
|------|------|
| 高分产品因无 media 字段被丢弃 | **911 条**（含 398 条 product_launch） |
| V2EX 贡献产品数 | **0** |
| Linux.do 贡献产品数 | **0** |
| 帖子候选池（score>=20）| 仅 **88 条**，Linux.do 占 64% |
| pipeline inferred_type=other（分类不明） | **1,324 条（32%）** |
| 飞书审核结论回写管道次数 | **0**（editorial 层从未被填充）|

### 1.3 根因分析

**不是参数问题，是架构问题。**

当前管道有五个互不对齐的评分系统、三个过滤层各自为政、零个反馈回路。具体根因：

1. **media 字段是哑管道**：V2EX/Linux.do 的图片 URL 被存入 `external_links` 而非 `media`，build-feed 要求 media 非空 → 这两个源整体失效

2. **有链接 = 产品的假设**：build-feed 的产品提取完全依赖 external_links。Jike 上截图发布产品（不带链接）的 maker 习惯被完全忽视

3. **评分层和构建层脱节**：pipeline 打了高分的 911 条内容，在 build-feed 因 media 缺失被静默丢弃，没有任何日志

4. **编辑层是死的**：`editorial_status`/`editorial_tags`/`editorial_notes` 字段存在但从未被写入，飞书 705 条审核结论与管道完全隔离

5. **time weight 吃好内容**：时效加权用了很高的绝对分值（近1月 +5），导致内容质量高但发布时间旧的经验帖被系统性压分

6. **filter-jike 误杀经验帖**：`无链接 + 无图 = 直接丢弃`（filter-jike.ts:97-98），精准杀死价值最高的纯文字经验复盘

---

## 二、设计原则（本次重设计的一阶约束）

在既有 `data system design.md` 六条原则基础上，本次重设计追加以下实施层原则：

### P1：先全量存储，后分层过滤

爬取阶段不做质量过滤（除了明确的噪声：招聘、抽奖、转发）。所有内容进入原始存储，然后在管道内分层处理。**任何被过滤的内容都要留有可查询的理由。**

### P2：LLM 理解是质量保证的核心

正则和统计指标是代理信号（proxy），LLM 是语义理解。把 LLM 放在管道中心，不是用来替代编辑判断，而是**压缩编辑判断的成本**——让编辑每次判断都有充分的上下文支撑。

### P3：编辑决策是管道的一等公民

每一条人工审核结论，必须能写回管道并影响后续构建。飞书里通过的内容，在管道里要变成 `editorial_status: approved`，下次 build 自动包含。

### P4：媒体资源不是门槛，是富化步骤

有链接的内容，异步尝试抓取 OG image 作为 fallback。图片获取失败，不影响内容进入 feed，只影响展示样式（无图则用纯文字卡片样式）。

### P5：trust_level 是所有阈值的调节器

内容质量阈值应该随 trust_level 降低：`maker_verified` 内容几乎无需过滤，`scraped` 内容才需要高阈值。不是一刀切的评分截止线。

---

## 三、目标架构

### 3.1 总览

```
┌─────────────────────────────────────────────────────┐
│                    SOURCE LAYER                      │
│  Jike · V2EX · Linux.do · PH · Twitter · sspai     │
│  (定时 Agent，每 12-24h 拉取新内容)                  │
└──────────────────────┬──────────────────────────────┘
                       ↓ 全量存储（仅过滤明确噪声）
┌─────────────────────────────────────────────────────┐
│                  RAW STORE                           │
│  data/raw/{source}/*.json                           │
│  不可变，append-only，永久保留                        │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│              LLM PROCESSING LAYER  ← 新核心          │
│  对每条未处理内容：                                   │
│  1. 分类（content_type + confidence）                │
│  2. 结构化提取（产品名/URL/maker/核心指标）            │
│  3. 生成编辑摘要（给编辑看的 2-3 句话）               │
│  4. 初步推荐（include/review/exclude + 理由）        │
│  5. 媒体富化（有 URL → 抓 OG image）                │
└──────────────────────┬──────────────────────────────┘
                       ↓ 三路分流
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
   高置信度          中置信度          低置信度
   AI 推荐收录      AI 建议审核        AI 建议排除
   → 自动进队列     → 人工 review     → 归档（可检索）
                       ↓
┌─────────────────────────────────────────────────────┐
│              EDITORIAL QUEUE  ← 人机协作核心         │
│  每天 10-15 分钟                                      │
│  每条内容显示：AI 提炼的结构化信息 + 推荐理由          │
│  操作：通过 / 拒绝 / 编辑后通过                       │
│  Editorial 决策写回 canonical store                  │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│              CANONICAL STORE                         │
│  data/store/projects.json                           │
│  data/store/posts.json                              │
│  data/store/makers.json                             │
│  data/store/content_items.json                      │
│  每个实体：source_facts[] + inferred + editorial     │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│                  BUILD LAYER                         │
│  从 canonical store 构建 data/feed.json             │
│  规则简单透明：editorial_status=approved → 包含      │
│  不再有隐式的 media/score/name 门槛                  │
└──────────────────────┬──────────────────────────────┘
                       ↓
                   Frontend
```

### 3.2 与现有架构的差异

| 维度 | 现有 | 目标 |
|------|------|------|
| 质量判断核心 | 统计指标（点赞数、链接数） | LLM 语义理解 |
| 过滤方向 | 正向过滤（打高分者进） | 负向过滤（排除噪声，其余审核） |
| 产品图片 | 必须有才能进 feed | 异步富化，缺图用文字卡片 |
| 编辑决策 | 飞书孤岛 | 写回管道，驱动构建 |
| 类型分类 | 正则规则 | LLM（置信度标注） |
| 多源产品 | 各自独立 | canonical 实体 + source_refs 合并 |
| V2EX/Linux.do 产品 | 0 | 正常提取 |

---

## 四、LLM 处理层设计

这是整套重设计的核心。有了 one-api 中转（无用量限制），LLM 调用的经济成本不再是约束。

### 4.1 模型选型策略

```
Haiku (快速/便宜)
└── 批量分类：全量 4188 条的初次处理
└── 日常新内容的快速分流（每天 ~50-200 条）

Sonnet (主力)  
└── 中等置信度内容的深度理解
└── 编辑摘要生成（需要写给人看，质量要求高）
└── 产品 landing page 分析（有 URL 时）

Opus（谨慎使用）
└── 复杂的跨源关联推断
└── 「other」类型内容的二次分类
```

### 4.2 LLM Processing 的 Prompt 设计

**第一遍：分类 + 提取（Haiku，每条 ~$0.0003）**

```
System: 你是一个中文独立开发者社区的内容分析助手。
        你的任务是分析帖子内容，提取结构化信息。
        中文独立开发者（indie maker）是指个人或小团队自主开发产品、工具或内容并尝试商业化的人。

User: 分析以下来自 {source} 平台的帖子：

---
{content}
---

作者：{author}（简介：{author_bio}）
互动：{likes} 赞 / {comments} 评论
发布时间：{published_at}
外部链接：{external_links}

请输出 JSON：
{
  "content_type": "product_launch|experience_share|build_log|revenue_report|
                   tutorial|tool_recommendation|failure_postmortem|
                   market_observation|resource_collection|discussion|noise",
  "confidence": 0.0-1.0,
  "is_indie_maker_content": true/false,
  "product": {  // 如果涉及具体产品
    "name": "...",
    "url": "...",  // 最可能的产品 URL（非社交媒体链接）
    "one_line": "一句话说清楚这是什么",
    "stage": "building|launched|revenue"
  },
  "maker_name": "...",  // 作者是否就是 maker
  "key_metrics": ["MRR $xxx", "xxx 用户"],  // 如有具体数字
  "topics": ["ai-tools", "going-global"],  // 最多 3 个
  "quality_signals": {
    "has_personal_story": true/false,
    "has_specific_numbers": true/false,
    "has_genuine_insight": true/false,
    "content_depth": "shallow|medium|deep"
  },
  "editorial_rec": "include|review|exclude",
  "rec_reason": "一句话理由"
}
```

**第二遍：编辑摘要（Sonnet，仅对 include/review 的内容，每条 ~$0.002）**

```
System: 你是 Solobase 的内容编辑助手。
        Solobase 是一个面向中文独立开发者的策展平台，重视：
        创意与审美 > 规模与热度
        个人故事与洞察 > 通用建议
        小而美的产品 > 跟风的产品

User: 基于以下内容和分析结果，生成一段编辑摘要：

内容：{content}
分析结果：{pass1_result}

请输出：
{
  "editorial_summary": "给编辑看的 2-3 句话：这是什么、亮点在哪、值不值得收录",
  "collection_angle": "如果收录，从哪个角度切入最有价值",
  "concerns": ["任何顾虑，比如：产品太普通 / 信息不完整 / 已有类似内容"]
}
```

### 4.3 批处理设计

```typescript
// scripts/pipeline/llm-process.ts

interface ProcessingConfig {
  model_classify: 'claude-haiku-4-5-20251001'
  model_summary: 'claude-sonnet-4-6'
  batch_size: 50          // 并发请求数
  retry_max: 3
  auto_include_threshold: 0.85   // confidence >= 0.85 + rec=include → 自动通过
  auto_exclude_threshold: 0.90   // confidence >= 0.90 + rec=exclude → 直接归档
  // 其余全部进人工 review
}

// 处理顺序：
// 1. 读取所有 raw items，找出 llm_processed_at 为空的
// 2. 按 source + published_at 排序（新内容优先）
// 3. 批量调用 Pass 1（分类）
// 4. 对 include/review 结果调用 Pass 2（摘要）
// 5. 对有 URL 的内容触发 media 富化（异步，不阻塞主流程）
// 6. 写入 canonical store
// 7. 输出 processing_report：自动通过 X 条 / 待审核 X 条 / 自动排除 X 条
```

### 4.4 媒体富化

```typescript
// scripts/pipeline/media-enrich.ts
// 触发条件：内容有 product.url

async function enrichMedia(url: string): Promise<MediaResult> {
  // 1. 抓取页面 OG image
  const og = await fetchOGImage(url, { timeout: 5000 })
  if (og) return { url: og, source: 'og_image', verified_at: now() }
  
  // 2. OG 失败 → 尝试 favicon + 截图服务（如 microlink.io）
  // 3. 全部失败 → media = null，前端用文字卡片样式
  
  // 关键：不阻塞主流程，异步更新
}
```

---

## 五、数据模型（落地版）

### 5.1 文件结构

```
data/
  raw/                    # 不可变，按源分目录
    jike/
    v2ex/
    linuxdo/
    producthunt/
    native/               # 未来：原生提交
    
  store/                  # canonical store（由管道写入，build 读取）
    content_items.json    # 所有内容单元（含 LLM 推断 + 编辑状态）
    projects.json         # 去重后的产品实体
    makers.json           # maker 实体
    
  feed.json               # 前台展示数据（由 build-feed 生成）
  
  pipeline/               # 中间产物（可重新生成）
    llm_processing_log.json   # 每次 LLM 处理的记录
    rejected_log.json         # 所有被过滤内容 + 原因
    media_cache.json          # OG image 缓存
```

### 5.2 ContentItem（核心实体）

```typescript
interface ContentItem {
  // ── 身份 ──
  id: string                    // stable UUID
  source: SourceType
  source_id: string
  source_url: string
  
  // ── 事实层（不可变，来自爬虫） ──
  fact: {
    body: string                // 原始内容（完整，不截断）
    author_name: string
    author_id: string
    author_bio: string
    engagement: {
      likes: number
      comments: number
      shares?: number
    }
    top_comments: Comment[]
    media_raw: string[]         // 帖子内的图片 URL（原始）
    external_links: string[]    // 帖子内的外部链接（原始）
    published_at: string
    crawled_at: string
    source_extra: Record<string, any>  // 源特有字段（不丢弃）
  }
  
  // ── 推断层（LLM 产出，可重跑） ──
  inferred: {
    content_type: ContentType
    content_type_confidence: number
    is_indie_maker_content: boolean
    
    product?: {
      name: string
      url: string
      one_line: string
      stage: ProjectStage
    }
    
    maker_name?: string
    key_metrics: string[]
    topics: Topic[]
    
    quality_signals: {
      has_personal_story: boolean
      has_specific_numbers: boolean
      has_genuine_insight: boolean
      content_depth: 'shallow' | 'medium' | 'deep'
    }
    
    editorial_rec: 'include' | 'review' | 'exclude'
    rec_reason: string
    editorial_summary?: string   // Pass 2 结果
    collection_angle?: string
    concerns: string[]
    
    media?: string               // 富化后的图片 URL
    media_source?: 'og_image' | 'post_image' | 'screenshot_service'
    
    llm_processed_at: string
    llm_model: string
    llm_version: string          // prompt 版本，便于批量重处理
  }
  
  // ── 编辑层（人工决策，append-only） ──
  editorial: {
    status: 'pending' | 'approved' | 'rejected' | 'archived' | 'withdrawn'
    trust_level: TrustLevel
    reviewed_at?: string
    reviewed_by?: string         // 'auto' | 'jiexiang' | 'wangyuxuan'
    editor_notes?: string
    editor_tags?: string[]
    override_reason?: string     // 为什么覆盖了 AI 推荐
    history: EditorialAction[]   // 所有历史操作，append-only
  }
  
  // ── 关联 ──
  project_id?: string            // 关联到 canonical project
  maker_id?: string
  
  updated_at: string
}
```

### 5.3 TrustLevel 与阈值关系

```typescript
type TrustLevel = 
  | 'scraped'           // 纯爬取，未审核
  | 'feishu_approved'   // 飞书人工审核通过  
  | 'native_submitted'  // maker 直接提交（未来）
  | 'maker_verified'    // maker 认领 + 身份验证（未来）

// 各 trust level 对应的最低质量阈值
const TRUST_THRESHOLDS = {
  scraped: { 
    require_editorial_approved: true,  // 必须人工过审
    min_content_depth: 'medium'
  },
  feishu_approved: {
    require_editorial_approved: true,  // 已是审核通过
    min_content_depth: 'shallow'       // 放宽
  },
  native_submitted: {
    require_editorial_approved: false, // 提交即上线（可配置）
    auto_approve: true
  },
  maker_verified: {
    require_editorial_approved: false,
    auto_approve: true,
    featured_eligible: true
  }
}
```

---

## 六、人机协作模型

### 6.1 工作流全图

```
每天自动（无需人工）：
  06:00  定时 Agent 拉取所有源的过去 24h 新内容
  06:30  LLM Pass 1 批量处理（分类+提取）
  07:00  高置信度内容自动进 canonical store（status=auto_approved）
         低置信度内容自动归档（status=auto_rejected，保留可检索）
         中间内容进 editorial queue
  07:00  对 include/review 内容运行 Pass 2（生成编辑摘要）
  08:00  媒体富化异步完成

你每天投入：10-15 分钟
  早上 editorial queue 里看"待审核"内容：
  每条显示：
    ┌─────────────────────────────────────┐
    │ [product_launch · 0.78 confidence] │
    │ 产品名：ColaMD                       │
    │ 一句话：极简 Markdown 编辑器，支持...  │
    │ 亮点：作者分享了0到付费用户的完整路径  │
    │ 顾虑：产品较普通，市场竞争激烈         │
    │ AI 建议：review（中等置信度）          │
    │ ─────────────────────────────────── │
    │    [✓ 通过]  [✗ 跳过]  [✎ 编辑]    │
    └─────────────────────────────────────┘
  键盘操作：j/k 翻，y 通过，n 跳过

偶尔（每周一次）：
  检查 auto_approved 内容的抽样，校正 AI 偏差
  更新 LLM 的 prompt 或 few-shot examples
```

### 6.2 Editorial Queue 的实现选择

**选项 A：增强版飞书（低成本，短期可用）**

改造双向同步脚本：
- `sync:push` — 把待审核内容推飞书，包含 AI 摘要字段
- `sync:pull` — 拉飞书的审核结果，写回 content_items 的 editorial 字段

优点：你和弟弟都已熟悉飞书，协作自然  
缺点：同步时间差，无法实时；飞书不支持键盘流操作

**选项 B：Next.js Admin 页（中期推荐）**

在现有 repo 的 `/admin` 路由下实现，共享 canonical store 数据：
- 密码保护（magic link 或环境变量密码）
- Inbox 风格列表，键盘导航
- 直接写入 canonical store，build-feed 下次运行即包含

优点：完全可控，键盘流，和 feed 数据直接联通  
成本：1-2 天实现，之后无需维护

**选项 C：Telegram Bot（移动端）**

推送待审核内容到 Telegram，通过 inline button 做通过/拒绝决策。

优点：随时随地，手机可以审核  
缺点：富信息展示受限，适合简单判断不适合复杂场景

**推荐路线**：短期用增强版飞书打通反馈回路，中期 2 天建 Admin 页替换。

### 6.3 AI 建议的可信度管理

关键原则：**你只需要纠正 AI 的边界错误，不需要重新判断 AI 高置信度的内容。**

```
追踪每周的 override rate（你推翻 AI 建议的比率）：
  override rate < 10%  → AI 阈值可以上调，减少人工负担
  override rate 10-25% → 当前阈值合理
  override rate > 25%  → AI 模型或 prompt 需要优化
  
每当你推翻 AI 建议时，填写一个 override_reason。
  这些 reason 是最宝贵的训练信号。
  每月做一次 prompt 优化，把常见 override pattern 加入 few-shot examples。
```

---

## 七、爬虫层改造规范

### 7.1 各源改造清单

**Jike（优先级：高）**
- [ ] 移除 filter-jike.ts 的"无链接+无图直接丢弃"逻辑，改为全量存储
- [ ] 保留 NOISE_PATTERNS 过滤（招聘/抽奖），其余交给 LLM 判断
- [ ] 核查 topics 配置，移除非独立开发相关圈子
- [ ] 补充搜索关键词：`复盘` `失败了` `方法论` `一年了` `PMF` `产品思考`
- [ ] 图片字段：确保 `media` 字段正确填充（不要和 external_links 混同）

**V2EX（优先级：高）**
- [ ] `standardizeV2EX()` 中识别并分离图片 URL → media 字段
- [ ] 扩展爬取节点：在 create 基础上增加 `programmer`, `indie`, `python`, `go`, `share`
- [ ] 修复图片 URL 被存入 external_links 的 bug

**Linux.do（优先级：高）**
- [ ] `standardizeLinuxdo()` 中识别并分离图片 URL → media 字段
- [ ] 移除爬取阶段的 `minLikes` 硬过滤（改为 LLM 层过滤）
- [ ] 保留 category/board 信息，用于 LLM 上下文
- [ ] 增加去重逻辑（category 和 tag 爬取间的重复）

**Product Hunt（优先级：中）**
- [ ] 加入中国 maker 识别字段（maker 姓名/Twitter handle 是否有中文背景信号）
- [ ] 移除爬取阶段的 `minVotes` 硬过滤，改为 LLM 层过滤
- [ ] 主要价值定位：交叉富化（已知中国 maker 在 PH 上的产品）而非主力来源

**新增源（优先级：中，LLM 层建好后再扩展）**
- [ ] 少数派/sspai：API 或页面抓取，目标节点"开发者"类文章
- [ ] Twitter/X：nitter 镜像或 API，目标关键词组合（#独立开发 #出海 等）
- [ ] GitHub：trending 中文仓库（需要判断是否 indie，不是大公司项目）

### 7.2 统一 Adapter 规范

所有 standardize 函数必须输出以下字段（不能为 null/undefined）：

```typescript
interface StandardizedItem {
  source: SourceType
  source_id: string
  source_url: string
  body: string            // 完整原文，不截断
  author_name: string
  author_id: string
  author_bio: string
  engagement: Engagement
  top_comments: Comment[]
  media: string[]         // 图片 URL（post 内的图片，非外链）← 关键修复
  external_links: string[] // 真实的外部产品/文章链接
  published_at: string
  crawled_at: string
  source_extra: Record<string, any>
}
```

---

## 八、Build Layer 简化

目标：build-feed.ts 的逻辑从"复杂的推断机器"变成"简单的组装器"。

### 8.1 新 build-feed 逻辑

```typescript
// 产品入选条件（简化后）
function shouldIncludeAsProject(item: ContentItem): boolean {
  // 必要条件
  if (item.editorial.status !== 'approved') return false
  if (!item.inferred.product?.name) return false
  if (!item.inferred.product?.url) return false
  
  // 放宽条件：无图可以进，前端用文字卡片
  // 放宽条件：score 阈值由 trust_level 决定，不是固定值
  
  return true
}

// 帖子入选条件（简化后）
function shouldIncludeAsPost(item: ContentItem): boolean {
  if (item.editorial.status !== 'approved') return false
  if (!WORTHY_TYPES.has(item.inferred.content_type)) return false
  return true
}
```

### 8.2 无图产品的展示处理

```typescript
// 在 feed.json 中保留 screenshot: null
// 前端根据 screenshot 是否为 null 选择卡片样式：
//   有图 → 当前 ProjectCard（带截图）
//   无图 → TextProjectCard（纯文字，显示 tagline + topics）
```

---

## 九、实施路线图

### Phase 0：止血（1-2 天，优先级最高）

修复当前最严重的流失问题，不动架构：

1. **修 V2EX/Linux.do 的 media 字段 bug**
   - `scripts/pipeline/run.ts` 中的 `standardizeV2EX()` 和 `standardizeLinuxdo()`
   - 区分图片 URL（→ media）和外链（→ external_links）
   - 重跑 pipeline，预计新增 200-400 产品候选

2. **修飞书双向同步**
   - `scripts/pipeline/sync-feishu.ts`：把飞书审核结果写回 editorial 字段
   - 下次 build-feed 时，已审核通过的内容自动包含

3. **移除 filter-jike.ts 的硬过滤**（无链接+无图直接丢弃）
   - 把被过滤的 893 条回归 pipeline，保留供 LLM 处理

### Phase 1：接入 LLM（3-5 天）

4. **写 `scripts/pipeline/llm-process.ts`**
   - Pass 1：Haiku 批量分类（全量 4188 条）
   - Pass 2：Sonnet 编辑摘要（仅 include/review）
   - 输出更新后的 content_items.json

5. **建 Editorial Queue 界面**
   - 短期：增强飞书推送（AI 摘要作为新字段）
   - 中期：Next.js `/admin` 页面

6. **媒体富化脚本**
   - `scripts/pipeline/media-enrich.ts`
   - 对有 product.url 的条目异步抓取 OG image

### Phase 2：管道自动化（1 周）

7. **建立定时 Agent**
   - Claude Code cron 或系统 crontab，每 12 小时跑完整管道
   - 入口：`npm run pipeline:daily`（crawl → llm-process → media-enrich → build-feed）

8. **canonical store 迁移**
   - 从 pipeline_output.json 迁移到 data/store/ 结构
   - 增量更新语义（不每次重跑全量）

9. **rejected_log 实现**
   - 所有被过滤内容保留原因，可查询

### Phase 3：为原生数据做准备（长期）

10. **原生提交表单**（product name + URL + story + email）
    - 写入 canonical store，trust_level=native_submitted
    - 编辑审核通过后即上线

11. **maker 认领机制**
    - 认领后 trust_level 升级
    - 爬取版本降级为 source_ref，原生版本成为主展示

12. **冷启动数据退场**
    - 18 个月无认领 + 信息过期 → 自动降级归档
    - 平台主体转向原生内容

---

## 十、原生数据过渡的关键设计决策

### 10.1 同一产品多源处理

```
当 product A 同时出现在：Jike 爬取 + PH 爬取 + 原生提交

处理规则：
  1. 以 URL 为主键做去重
  2. 建立 canonical project 实体，source_refs = [jike_item, ph_item, native_item]
  3. 展示数据来源优先级：native_submitted > feishu_approved > scraped
  4. 热度数据来自所有 source 的 engagement 加总（冷启动数据的价值）
  5. 各 source 的原始数据保留，永不删除
```

### 10.2 冷启动数据的价值贡献

不要把冷启动数据看作"以后要替换的垃圾"，它提供了：

- **时间深度**：产品2年前刚发布时的原始记录
- **社区热度**：Jike/V2EX 的互动数据是无法补录的真实社区反应
- **maker 发现**：让 maker 知道"你的产品早就被收录了"，是认领机制的入口
- **训练信号**：你的审核决策是 LLM prompt 优化的 ground truth

### 10.3 原生提交不是"填表单"，是"讲故事"

原生提交的核心价值不是"结构化数据"，是 **maker 的第一视角叙事**。

提交界面设计导向：
```
不是：「产品名 / 网址 / 描述 / 标签」（像 PH 的表单）
而是：「你做了什么？花了多久？遇到最大的坎是什么？现在到哪一步了？」
```

这个"故事"可以直接成为 Post 内容，产品 URL 从中提取，maker 档案自然建立。这才是 Solobase 和 PH 的根本差异：PH 收录产品，Solobase 收录 maker 的旅程。

---

## 附录 A：当前 47+ 个硬编码阈值一览

需要迁移到统一配置文件 `scripts/config/scoring.ts`：

| 位置 | 阈值 | 当前值 | 建议 |
|------|------|--------|------|
| filter-jike.ts:110 | likes 高分线 | 50 | 保留 |
| filter-jike.ts:258 | 拉评论最低分 | 10 | 改由 LLM 决定 |
| pipeline/run.ts | density 各维度 | 见代码 | 保留但集中配置 |
| build-feed.ts:458 | 产品最低分 | 8 | 改为 trust_level 动态 |
| build-feed.ts:536 | 帖子最低分 | 20/22 | 改为 trust_level 动态 |
| page.tsx | 编辑精选线 | 18 | 保留 |
| push-to-feishu.ts | 推飞书最低分 | 10 | 废弃（由 LLM rec 决定） |

## 附录 B：one-api 中转使用规范

- 中转地址和 model mapping 存在 `scripts/config/ai.ts`（gitignore）
- 生产环境使用 Haiku 做批量处理，Sonnet 做编辑摘要
- 日常新内容处理成本估算：~50条/天 × $0.003/条 = **¥1.1/天**
- 冷启动 4188 条全量处理：~$12 一次性成本
- 所有 LLM 响应缓存到 `data/pipeline/llm_cache.json`，避免重复计费

## 附录 C：不做什么（边界）

在 Phase 0-2 期间，明确不做：

- 不加 Twitter/sspai 等新源（LLM 层建好前扩源没意义）
- 不做前台 UI 改版（数据质量先于展示）
- 不做向量搜索/推荐系统（数据体量不够）
- 不做用户账号体系（原生提交用 email 验证即可）
- 不重写 Next.js 前端架构（当前够用）

# Solobase 数据基础设施设计

> 类型：权威设计文档（supersedes `pipeline-redesign.md`）
> 状态：设计定稿（2026-04-12）
> 前置：`doc/data system design.md`（概念模型）·`doc/pipeline-redesign.md`（现状诊断）

---

## 一、核心认知升级

### 1.1 从"管道"到"知识图谱"

这是本次重设计最根本的思维转变。

**旧思维（管道）**：数据单向流动。爬取 → 处理 → 存文件 → 构建。每次重跑，从头再来。没有记忆，没有关系，没有学习能力。

**新思维（知识图谱）**：实体持续存在，关系随时间积累。Maker、Project、Post 是有生命的节点，不是处理过的文本。每次新内容到来，是在已有知识上叠加，而不是重新计算。

| 维度 | 管道 | 知识图谱 |
|------|------|---------|
| 核心资产 | 处理后的文件 | 实体与关系 |
| 更新方式 | 重跑全量 | 增量更新 |
| 去重能力 | URL 字符串匹配 | 语义相似度 |
| 编辑品味 | 规则硬编码 | 向量化后可学习 |
| 扩展性 | 加新源需改管道 | 加 adapter 即可 |
| 未来用途 | 驱动网站 | 网站 + API + MCP |

### 1.2 数据系统的终态定位

Solobase 的数据系统不是"网站的后端"，是**中文独立开发者生态的知识基础设施**。

网站是消费入口之一。未来的消费入口还有：
- **API** — 第三方工具查询 Solobase 的结构化知识
- **MCP Server** — 任何 AI 助手都能调用 Solobase 回答关于中文独立开发者的问题
- **Newsletter/摘要** — 定期推送高密度策展内容

数据本身是资产，不依附于任何展示形式。数据的时间深度和编辑质量，是无法被竞争对手快速复制的护城河。

---

## 二、系统架构全图

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOURCE LAYER                              │
│                                                                   │
│  即刻  ·  V2EX  ·  Linux.do  ·  Product Hunt  ·  sspai  ·  ...  │
│  (定时 Agent 拉取，每 12-24h)          Native Submit (表单)       │
└────────────────────────┬────────────────────────────────────────┘
                         │ 全量存储，仅过滤明确噪声
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       RAW STORE                                  │
│  data/raw/{source}/*.json  —  不可变，append-only，永久保留       │
└────────────────────────┬────────────────────────────────────────┘
                         │ 触发：新内容到达
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ENRICHMENT AGENT  ← 核心                       │
│                                                                   │
│  ① LLM 分类提取（Haiku）                                         │
│     content_type · 产品名/URL · maker · 核心指标 · 推荐理由       │
│                                                                   │
│  ② 语义向量化（text-embedding-3-small）                          │
│     生成 1536-dim embedding，写入 sqlite-vec                      │
│                                                                   │
│  ③ 相似度检测（Dedup）                                           │
│     cos_sim > 0.92 → 标记为已知产品的新提及                       │
│                                                                   │
│  ④ 媒体富化（Microlink）                                         │
│     有 URL → 抓 OG image + title + description                    │
│                                                                   │
│  ⑤ 编辑摘要（Sonnet，仅对 include/review 内容）                   │
│     给编辑看的 2-3 句话 + 推荐理由                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
           ┌─────────────┼──────────────┐
           ▼             ▼              ▼
      高置信度        中置信度         低置信度
    (conf ≥ 0.85)   (0.5-0.85)     (conf < 0.5)
    auto_approved  → review queue  auto_archived
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EDITORIAL INTERFACE                            │
│                                                                   │
│  飞书 Interactive Card Bot（短期）                               │
│  → Next.js /admin（中期）                                        │
│                                                                   │
│  每天 10-15 分钟：看 AI 摘要，点通过/跳过                         │
│  决策实时写回 canonical store                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ editorial_status → approved
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CANONICAL STORE                                │
│                                                                   │
│  Turso (remote SQLite) + sqlite-vec                              │
│  Drizzle ORM（TypeScript 类型安全）                              │
│                                                                   │
│  tables: content_items · projects · makers                       │
│           embeddings · editorial_actions · media_cache           │
└──────────┬──────────────┬───────────────┬────────────────────────┘
           ▼              ▼               ▼
    ┌──────────┐   ┌───────────┐   ┌──────────────┐
    │  BUILD   │   │  SEARCH   │   │  MCP SERVER  │
    │ feed.json│   │(vector)   │   │(未来知识 API)│
    │ 增量更新 │   │语义发现   │   │AI 助手可调用 │
    └──────────┘   └───────────┘   └──────────────┘
         ▼
    Frontend (Next.js)
```

---

## 三、技术栈决策

### 3.1 最终选型

| 层 | 技术 | 理由 |
|----|------|------|
| **数据库** | Turso (libSQL/SQLite) | 零运维，远程可访问，免费额度充足 |
| **向量存储** | sqlite-vec（内置于 Turso） | 不引入独立向量 DB，一个依赖解决两件事 |
| **ORM** | Drizzle ORM | TypeScript 原生，类型安全，迁移简单 |
| **Embedding 模型** | `text-embedding-3-small` (OpenAI) | 通过 one-api 中转，$0.02/1M tokens |
| **分类 LLM** | Claude Haiku (via one-api) | 快速+便宜，批量处理 |
| **摘要 LLM** | Claude Sonnet (via one-api) | 质量高，仅对 review 内容调用 |
| **媒体富化** | Microlink API | OG image + metadata，一行调用 |
| **页面内容提取** | Jina Reader (r.jina.ai) | 免费，把任意 URL 转 markdown |
| **调度** | Claude Code CronCreate | 原生集成，有上下文理解能力 |
| **审核 UI（短期）** | 飞书 Interactive Card Bot | 零新工具，手机可操作 |
| **审核 UI（中期）** | Next.js /admin | 同 repo，共享 DB，键盘流 |
| **MCP Server** | @modelcontextprotocol/sdk | 官方 Node.js SDK |

### 3.2 成本估算

| 项目 | 场景 | 成本 |
|------|------|------|
| 冷启动全量处理 | 4188 条 × 分类+embedding | ~¥80 一次性 |
| 日常运营 | ~100 条新内容/天 | ~¥3/天 |
| Turso | 500MB + 1B rows/月 | 免费 |
| Microlink | 500 req/月免费，后 $29/月 | 初期免费 |
| Jina Reader | 完全免费 | 免费 |
| **合计（稳定后）** | | **~¥90/月** |

---

## 四、数据库 Schema（Drizzle）

### 4.1 完整 Schema

```typescript
// db/schema.ts
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core'

// ── Content Items ─────────────────────────────────────────────────
export const contentItems = sqliteTable('content_items', {
  id:           text('id').primaryKey(),          // UUID
  
  // 事实层（不可变）
  source:       text('source').notNull(),         // jike|v2ex|linuxdo|ph|native
  sourceId:     text('source_id').notNull(),
  sourceUrl:    text('source_url').notNull(),
  body:         text('body').notNull(),            // 完整原文，不截断
  authorName:   text('author_name').notNull(),
  authorId:     text('author_id'),
  authorBio:    text('author_bio'),
  likesCount:   integer('likes_count').default(0),
  commentsCount:integer('comments_count').default(0),
  sharesCount:  integer('shares_count').default(0),
  topComments:  text('top_comments', { mode: 'json' }).$type<Comment[]>(),
  mediaRaw:     text('media_raw', { mode: 'json' }).$type<string[]>(),
  externalLinks:text('external_links', { mode: 'json' }).$type<string[]>(),
  publishedAt:  integer('published_at', { mode: 'timestamp' }),
  crawledAt:    integer('crawled_at', { mode: 'timestamp' }).notNull(),
  sourceExtra:  text('source_extra', { mode: 'json' }),   // 源特有字段，不丢弃

  // 推断层（LLM 产出，可重跑）
  contentType:  text('content_type'),             // product_launch|experience_share|...
  confidence:   real('confidence'),               // 0.0-1.0
  isIndieMaker: integer('is_indie_maker', { mode: 'boolean' }),
  productName:  text('product_name'),
  productUrl:   text('product_url'),
  productOneLiner: text('product_one_liner'),
  productStage: text('product_stage'),            // building|launched|revenue
  makerName:    text('maker_name'),
  keyMetrics:   text('key_metrics', { mode: 'json' }).$type<string[]>(),
  topics:       text('topics', { mode: 'json' }).$type<string[]>(),
  hasPersonalStory:      integer('has_personal_story', { mode: 'boolean' }),
  hasSpecificNumbers:    integer('has_specific_numbers', { mode: 'boolean' }),
  hasGenuineInsight:     integer('has_genuine_insight', { mode: 'boolean' }),
  contentDepth: text('content_depth'),            // shallow|medium|deep
  editorialRec: text('editorial_rec'),            // include|review|exclude
  recReason:    text('rec_reason'),
  editorialSummary:  text('editorial_summary'),
  collectionAngle:   text('collection_angle'),
  concerns:     text('concerns', { mode: 'json' }).$type<string[]>(),
  media:        text('media'),                    // 富化后的图片 URL
  mediaSource:  text('media_source'),             // og_image|post_image|screenshot
  llmProcessedAt: integer('llm_processed_at', { mode: 'timestamp' }),
  llmModel:     text('llm_model'),
  llmPromptVersion: text('llm_prompt_version'),  // 便于批量重处理

  // 编辑层（人工决策）
  editorialStatus: text('editorial_status').default('pending'),
  // pending|approved|rejected|archived|withdrawn
  trustLevel:   text('trust_level').default('scraped'),
  // scraped|feishu_approved|native_submitted|maker_verified
  reviewedAt:   integer('reviewed_at', { mode: 'timestamp' }),
  reviewedBy:   text('reviewed_by'),              // auto|jiexiang|wangyuxuan
  editorNotes:  text('editor_notes'),
  editorTags:   text('editor_tags', { mode: 'json' }).$type<string[]>(),
  overrideReason: text('override_reason'),        // 为什么覆盖 AI 推荐

  // 关联
  projectId:    text('project_id').references(() => projects.id),
  makerId:      text('maker_id').references(() => makers.id),
  
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ── Projects（产品实体） ──────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id:           text('id').primaryKey(),
  slug:         text('slug').notNull().unique(),
  name:         text('name').notNull(),
  tagline:      text('tagline'),
  description:  text('description'),
  url:          text('url').notNull(),
  screenshot:   text('screenshot'),               // OG image or null
  stage:        text('stage'),                    // building|launched|revenue
  topics:       text('topics', { mode: 'json' }).$type<string[]>(),
  
  // 来源追踪
  sourceContentIds: text('source_content_ids', { mode: 'json' }).$type<string[]>(),
  primarySourceId:  text('primary_source_id'),
  trustLevel:   text('trust_level').default('scraped'),
  
  // 编辑
  editorialStatus: text('editorial_status').default('pending'),
  isEditorsPick:   integer('is_editors_pick', { mode: 'boolean' }).default(false),
  featuredInsight: text('featured_insight'),      // 编辑提炼的一句话亮点
  vibes:        text('vibes', { mode: 'json' }).$type<string[]>(),
  // 小而美|设计感|技术硬核|创意切入|出海标杆|冷门有价值
  
  // 关联
  makerId:      text('maker_id').references(() => makers.id),
  
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ── Makers（创作者实体） ─────────────────────────────────────────
export const makers = sqliteTable('makers', {
  id:           text('id').primaryKey(),
  slug:         text('slug').notNull().unique(),
  name:         text('name').notNull(),
  bio:          text('bio'),
  avatar:       text('avatar'),
  jikeHandle:   text('jike_handle'),
  twitterHandle: text('twitter_handle'),
  githubHandle: text('github_handle'),
  website:      text('website'),
  verified:     integer('verified', { mode: 'boolean' }).default(false),
  claimed:      integer('claimed', { mode: 'boolean' }).default(false),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ── Embeddings（向量表，sqlite-vec） ────────────────────────────
export const embeddings = sqliteTable('embeddings', {
  entityType:   text('entity_type').notNull(),    // content_item|project|maker
  entityId:     text('entity_id').notNull(),
  embedding:    blob('embedding').notNull(),       // Float32Array，1536 维
  model:        text('model').notNull(),           // text-embedding-3-small
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Editorial Actions（审核历史，append-only） ──────────────────
export const editorialActions = sqliteTable('editorial_actions', {
  id:           text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull(),
  action:       text('action').notNull(),         // approve|reject|archive|edit
  prevStatus:   text('prev_status'),
  newStatus:    text('new_status'),
  actor:        text('actor').notNull(),           // auto|jiexiang|wangyuxuan
  notes:        text('notes'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Media Cache ────────────────────────────────────────────────
export const mediaCache = sqliteTable('media_cache', {
  url:          text('url').primaryKey(),
  ogImage:      text('og_image'),
  ogTitle:      text('og_title'),
  ogDescription: text('og_description'),
  fetchedAt:    integer('fetched_at', { mode: 'timestamp' }).notNull(),
  valid:        integer('valid', { mode: 'boolean' }).notNull(),
})
```

---

## 五、Enrichment Agent 设计

这是整个系统最核心的组件。每当有新内容进入 Raw Store，触发此 Agent。

### 5.1 入口与触发

```typescript
// scripts/agents/enrich.ts
// 触发方式：
//   1. 定时（crawl 结束后自动调用）
//   2. 手动：npx tsx scripts/agents/enrich.ts
//   3. 单条：npx tsx scripts/agents/enrich.ts --id <source_id>
//
// 处理逻辑：从 DB 找所有 llm_processed_at = null 的条目，按队列处理
```

### 5.2 LLM 调用设计

**Pass 1：分类 + 提取（Haiku，~$0.0003/条）**

```typescript
const CLASSIFY_SYSTEM = `
你是 Solobase 的内容分析助手。
Solobase 是中文独立开发者生态的知识基础设施，收录：
- 独立 maker 的产品发布（app/工具/Chrome 扩展/SaaS/小程序）
- 高密度经验分享（开发复盘/出海经验/PMF 探索/失败反思）
- 有价值的工具推荐和市场观察

"独立 maker"指个人或 2-5 人小团队，自主产品化，有商业化尝试或开源贡献。
不包括：大公司项目、纯求职/招聘内容、无实质内容的情绪帖。
`

const CLASSIFY_SCHEMA = z.object({
  content_type: z.enum([
    'product_launch',    // 产品/工具发布或重大更新
    'build_log',         // 开发过程记录
    'revenue_report',    // 收入/用户数里程碑
    'experience_share',  // 经验复盘，信息密度高
    'failure_postmortem',// 失败反思
    'tutorial',          // 操作教程
    'tool_recommendation',// 工具推荐
    'market_observation',// 市场/趋势观察
    'resource_collection',// 资源汇总
    'discussion',        // 讨论，价值一般
    'noise',             // 噪声，直接排除
  ]),
  confidence: z.number().min(0).max(1),
  is_indie_maker_content: z.boolean(),
  product: z.object({
    name: z.string(),
    url: z.string().optional(),
    one_liner: z.string(),
    stage: z.enum(['building', 'launched', 'revenue']),
  }).optional(),
  maker_name: z.string().optional(),
  key_metrics: z.array(z.string()),   // ["MRR $3k", "2000 用户"]
  topics: z.array(z.string()).max(3), // 最多 3 个
  quality: z.object({
    has_personal_story: z.boolean(),
    has_specific_numbers: z.boolean(),
    has_genuine_insight: z.boolean(),
    depth: z.enum(['shallow', 'medium', 'deep']),
  }),
  editorial_rec: z.enum(['include', 'review', 'exclude']),
  rec_reason: z.string().max(100),
})
```

**Pass 2：编辑摘要（Sonnet，仅对 include/review，~$0.002/条）**

```typescript
const SUMMARY_SYSTEM = `
你是 Solobase 的编辑助手。为编辑生成简洁的审核摘要。

Solobase 的品味标准：
✓ 有真实个人故事和洞察的内容
✓ 小而美、有创意的产品（不要求规模）
✓ 出海实战经验，有具体数字
✓ 设计感和审美有辨识度的产品
✗ 跟风无差异化的产品
✗ 理念一般的知名产品（不需要重复收录）
✗ 没有实质内容的流量帖
`

const SUMMARY_SCHEMA = z.object({
  summary: z.string().max(150),         // 给编辑看的一句话
  collection_angle: z.string().max(100), // 从哪个角度切入有价值
  concerns: z.array(z.string()),        // 顾虑点
})
```

### 5.3 Embedding 生成

```typescript
async function generateEmbedding(text: string): Promise<Float32Array> {
  // 通过 one-api 中转调用 OpenAI text-embedding-3-small
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),   // 截断到模型上限
    dimensions: 1536,
  })
  return new Float32Array(response.data[0].embedding)
}

// 用于 embedding 的文本构造：
function buildEmbeddingText(item: ContentItem): string {
  // 组合关键信息，不只是 body
  return [
    item.productName ? `产品：${item.productName}` : '',
    item.productOneLiner ?? '',
    item.body.slice(0, 500),
    item.topics?.join(' ') ?? '',
    item.keyMetrics?.join(' ') ?? '',
  ].filter(Boolean).join('\n')
}
```

### 5.4 相似度检测（去重）

```typescript
async function findSimilarItems(
  embedding: Float32Array,
  threshold = 0.92
): Promise<ContentItem[]> {
  // sqlite-vec 的向量相似度查询
  const results = await db.all(sql`
    SELECT c.*, vec_distance_cosine(e.embedding, ${embedding}) as similarity
    FROM content_items c
    JOIN embeddings e ON e.entity_id = c.id AND e.entity_type = 'content_item'
    WHERE vec_distance_cosine(e.embedding, ${embedding}) < ${1 - threshold}
    ORDER BY similarity ASC
    LIMIT 5
  `)
  return results
}

// 处理逻辑：
// cos_sim > 0.95 + 同 URL → 确定重复，标记 duplicate，link 到已有条目
// cos_sim > 0.92 + 不同 URL → 可能是同一产品的不同帖子，标记 related
// cos_sim 0.85-0.92 → 相关内容，用于推荐
```

### 5.5 媒体富化

```typescript
async function enrichMedia(url: string): Promise<MediaResult | null> {
  // 先查缓存
  const cached = await db.query.mediaCache.findFirst({
    where: eq(mediaCache.url, url)
  })
  if (cached && cached.valid) return cached

  // Microlink API
  try {
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=false`
    )
    const data = await res.json()
    if (data.status === 'success') {
      const result = {
        url,
        ogImage: data.data.image?.url ?? null,
        ogTitle: data.data.title ?? null,
        ogDescription: data.data.description ?? null,
        fetchedAt: new Date(),
        valid: true,
      }
      await db.insert(mediaCache).values(result).onConflictDoUpdate(...)
      return result
    }
  } catch {}

  // Fallback: Jina Reader 抓页面，从 markdown 提取图片
  try {
    const res = await fetch(`https://r.jina.ai/${url}`)
    const markdown = await res.text()
    const imgMatch = markdown.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/)
    if (imgMatch) return { url, ogImage: imgMatch[1], valid: true, ... }
  } catch {}

  // 完全失败：记录但不阻塞
  await db.insert(mediaCache).values({ url, valid: false, fetchedAt: new Date() })
  return null
}
```

---

## 六、Editorial Interface 设计

### 6.1 飞书 Interactive Card Bot（短期，优先实现）

每天早上 7:00，Editorial Digest Agent 生成当天的待审核卡片批次，通过飞书 Bot 发送。

**卡片设计：**

```json
{
  "type": "card",
  "elements": [
    {
      "tag": "markdown",
      "content": "**{{product_name}}**  ·  {{content_type_label}}  ·  {{source}} {{likes}}赞\n\n{{editorial_summary}}\n\n> 💡 {{collection_angle}}\n{{#concerns}}⚠️ {{.}}{{/concerns}}"
    },
    {
      "tag": "img",
      "img_key": "{{og_image}}",
      "alt": { "tag": "plain_text", "content": "产品截图" }
    },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "✓ 收录" },
          "type": "primary",
          "value": { "action": "approve", "id": "{{item_id}}" }
        },
        {
          "tag": "button", 
          "text": { "tag": "plain_text", "content": "✗ 跳过" },
          "type": "default",
          "value": { "action": "reject", "id": "{{item_id}}" }
        },
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "→ 原帖" },
          "type": "default",
          "url": "{{source_url}}"
        }
      ]
    }
  ]
}
```

**回调处理：**
```typescript
// 飞书 Bot 的 webhook 接收按钮点击
// POST /api/feishu-webhook
export async function POST(req: Request) {
  const { action, id } = await req.json()
  
  if (action === 'approve') {
    await approveItem(id)    // 写回 DB，触发 Publisher Agent
    await sendFeishuAck(id, '已收录 ✓')
  } else if (action === 'reject') {
    await rejectItem(id)
    await sendFeishuAck(id, '已跳过')
  }
}
```

**每日 Digest 格式：**
```
Solobase 内容日报 · 4月12日

今日处理：47 条新内容
  ✓ 自动收录：12 条（置信度 ≥ 0.85）
  📋 待你审核：8 条
  ✗ 自动归档：27 条

今日 Top 3（已自动收录）：
1. ColaMD - 极简 Markdown 编辑器（product_launch · 0.91）
2. 出海第一年复盘 · $8k MRR（experience_share · 0.88）
3. 我用 Claude Code 做了个..."（build_log · 0.86）

[点击审核今日队列 →]（8 张卡片将在下方发送）
```

### 6.2 Next.js /admin 页面（中期，1-2 天实现）

路由：`/admin`，password 保护（环境变量）。

**核心交互：**
- Inbox 风格，每条是一张卡片
- 键盘快捷键：`j/k` 翻，`y` 通过，`n` 跳过，`e` 编辑
- 实时更新：通过一条后，下一条自动出现
- 过滤器：按 source / content_type / date 过滤
- Override 理由：跳过时可选填（积累训练信号）

**为什么最终要从飞书迁移到 /admin：**
- 飞书卡片对富文本展示有限制
- 批量操作（一次跳过 20 条 noise）在飞书很难做
- 键盘流操作在飞书不支持
- /admin 可以展示"今日 override rate"和 AI 偏差统计

---

## 七、Agent 调度设计

### 7.1 Agent 职责划分

```
Crawler Agents（每 12-24h，或手动触发）
├── jike-crawler       → data/raw/jike/*.json
├── v2ex-crawler       → data/raw/v2ex/*.json
├── linuxdo-crawler    → data/raw/linuxdo/*.json
└── ph-crawler         → data/raw/producthunt/*.json（每周一次）

Enrichment Agent（每次 crawl 结束后触发）
└── 处理所有 llm_processed_at = null 的条目
    → 分类 + 向量化 + 去重 + 媒体富化 + 编辑摘要

Editorial Digest Agent（每天 07:00）
└── 汇总待审核内容
    → 生成飞书 Interactive Card 批次
    → 发送日报摘要

Publisher Agent（editorial_status 变为 approved 时触发）
└── 更新 feed.json（增量，不全量重跑）
    → 触发 Next.js ISR 重新生成
    → 发送飞书确认消息

Weekly Review Agent（每周一 09:00）
└── 统计过去一周：
    - Override rate（你推翻 AI 建议的比率）
    - 漏掉的高质量内容（被自动排除但你后来找到的）
    - Prompt 优化建议
    → 飞书周报
```

### 7.2 Claude Code CronCreate 配置

```typescript
// 主调度入口：scripts/agents/scheduler.ts
// 通过 Claude Code 的 CronCreate 工具设置

// Cron 1：每日内容拉取 + 处理（UTC 22:00 = 北京 06:00）
// 0 22 * * *
// 执行：npx tsx scripts/agents/daily-pipeline.ts

// Cron 2：每日编辑摘要（UTC 23:00 = 北京 07:00）
// 0 23 * * *  
// 执行：npx tsx scripts/agents/editorial-digest.ts

// Cron 3：每周 review（UTC 01:00 每周一 = 北京周一 09:00）
// 0 1 * * 1
// 执行：npx tsx scripts/agents/weekly-review.ts
```

### 7.3 日常管道入口

```bash
# 完整日常管道（脚本化，cron 调用）
npm run pipeline:daily
# = crawl:all → enrich → digest → build:feed

# 单步调试
npm run crawl:jike
npm run crawl:v2ex
npm run enrich              # 处理未处理条目
npm run enrich -- --limit 50  # 只处理 50 条
npm run build:feed          # 增量重建 feed.json

# 冷启动迁移
npm run migrate:json-to-db  # 把现有 pipeline_output.json 导入 Turso
npm run enrich -- --reprocess-all  # 全量 LLM 处理（冷启动一次性）
```

---

## 八、MCP Server 设计

### 8.1 定位

**Solobase MCP Server** 让任何集成了 MCP 协议的 AI 工具（Claude、Cursor 等）都能查询 Solobase 的结构化知识。

使用场景：
```
用户向 Claude 提问：
  "有没有做播客工具的中国独立开发者？"
  "最近有哪些值得关注的出海 SaaS 案例？"
  "有没有类似 Notion 但更小更专注的工具？"

Claude 调用 Solobase MCP → 返回结构化结果 → 综合回答
```

### 8.2 暴露的工具（Tools）

```typescript
// src/mcp/server.ts

const tools = {
  // 搜索产品
  search_projects: {
    description: '语义搜索 Solobase 收录的独立开发者产品',
    parameters: {
      query: string,        // 自然语言查询
      topics?: string[],    // 过滤主题
      stage?: string,       // building|launched|revenue
      limit?: number,       // 默认 10
    }
  },

  // 搜索内容
  search_content: {
    description: '搜索高价值内容（经验帖/复盘/教程）',
    parameters: {
      query: string,
      content_type?: string,
      limit?: number,
    }
  },

  // 获取 maker 档案
  get_maker: {
    description: '获取独立开发者的档案和产品列表',
    parameters: { name: string }
  },

  // 相关内容
  get_related: {
    description: '获取与某产品语义相关的内容',
    parameters: { project_id: string, limit?: number }
  },

  // 趋势话题
  get_trending_topics: {
    description: '获取最近涌现的热点主题（基于内容聚类）',
    parameters: { days?: number }
  },

  // 最新收录
  get_recent: {
    description: '获取最近收录的产品和内容',
    parameters: {
      type?: 'projects' | 'posts' | 'all',
      limit?: number,
    }
  },
}
```

### 8.3 实现路径

```typescript
// 基于 @modelcontextprotocol/sdk
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

// 向量搜索实现：
async function semanticSearch(query: string, limit: number) {
  const queryEmbedding = await generateEmbedding(query)
  return db.all(sql`
    SELECT p.*, vec_distance_cosine(e.embedding, ${queryEmbedding}) as score
    FROM projects p
    JOIN embeddings e ON e.entity_id = p.id
    WHERE p.editorial_status = 'approved'
    ORDER BY score ASC
    LIMIT ${limit}
  `)
}
```

**MCP Server 的部署**：可以作为本地工具供 Claude Desktop/Claude Code 调用，也可以部署为 HTTP 服务供外部访问。初期作为本地工具即可。

---

## 九、Build Layer 简化

从"复杂的推断机器"变成"简单的组装器"。

```typescript
// scripts/build-feed.ts（重写后）

async function buildFeed() {
  const db = getDB()

  // 产品：editorial_status=approved + 有产品 URL
  const approvedProjects = await db.query.projects.findMany({
    where: and(
      eq(projects.editorialStatus, 'approved'),
      isNotNull(projects.url)
    ),
    orderBy: [desc(projects.updatedAt)],
    limit: 500,
  })

  // 帖子：editorial_status=approved + worthy content_type
  const approvedPosts = await db.query.contentItems.findMany({
    where: and(
      eq(contentItems.editorialStatus, 'approved'),
      inArray(contentItems.contentType, WORTHY_POST_TYPES),
      isNull(contentItems.projectId),  // 非产品关联帖
    ),
    orderBy: [desc(contentItems.publishedAt)],
    limit: Math.max(Math.floor(approvedProjects.length / 3), 10),
  })

  // 无图产品：使用文字卡片样式（不再因无图排除）
  const feed = {
    projects: approvedProjects.map(toFeedProject),
    posts: approvedPosts.map(toFeedPost),
    meta: { builtAt: new Date().toISOString(), version: '2.0' }
  }

  writeFileSync('data/feed.json', JSON.stringify(feed, null, 2))
  
  // 触发 Next.js ISR（如果配置了）
  await revalidatePath('/')
}

// 无图产品：feed 中 screenshot=null，前端用 TextProjectCard 组件
// 不再因为没有截图就排除产品
```

---

## 十、实施路线图

### Phase 0：止血（1-2 天）

**目标：修复当前最严重的流失，不改架构。**

- [ ] **修 V2EX/Linux.do media 字段**：`standardizeV2EX()`/`standardizeLinuxdo()` 里识别图片 URL，存入 `media` 而非 `external_links`。重跑 pipeline，预计新增 200-400 产品候选。
- [ ] **移除 filter-jike 硬过滤**（无链接+无图直接丢弃），把 893 条回归管道
- [ ] **Feishu 双向同步脚本**：`scripts/sync-feishu.ts`，把飞书已审核状态写回 `editorial_status`
- [ ] **无图产品不再排除**：build-feed 增加 TextProjectCard fallback，screenshot=null 的产品用文字卡片

**预期收益：网站产品数 129 → 350+，帖子数 23 → 80+**

### Phase 1：接入 LLM 处理层（3-5 天）

**目标：替换正则打分，建立 AI 驱动的质量判断。**

- [ ] **AI 配置文件**：`scripts/config/ai.ts`（one-api base URL + key，gitignore）
- [ ] **LLM 处理脚本**：`scripts/agents/enrich.ts`（Pass 1 分类 + Pass 2 摘要）
- [ ] **Zod schema 验证**：所有 LLM 输出用 Zod 验证，错误重试
- [ ] **冷启动全量处理**：对 4188 条运行 Haiku Pass 1（估计 2-3 小时，成本 ~¥20）
- [ ] **飞书 Bot 审核卡片**：把 AI 摘要作为卡片内容，替换原来的原始帖子展示

### Phase 2：迁移到 Turso + 向量化（1 周）

**目标：建立真正的知识库，而非文件系统。**

- [ ] **Turso 初始化**：创建 database，配置连接
- [ ] **Drizzle schema**：创建所有表（见第四章）
- [ ] **迁移脚本**：`npm run migrate:json-to-db`，把 pipeline_output.json 导入 Turso
- [ ] **Embedding 管道**：对所有 approved 内容生成向量，存入 sqlite-vec
- [ ] **相似度去重**：在 enrich.ts 中加入相似度检测逻辑
- [ ] **媒体富化**：集成 Microlink，异步补全 OG image

### Phase 3：自动化调度（3-5 天）

**目标：每天早上自动跑完，你只需要看飞书消息。**

- [ ] **Claude Code CronCreate**：配置三个 cron job（daily pipeline / editorial digest / weekly review）
- [ ] **Publisher Agent**：editorial_status 变更时触发增量 feed 更新
- [ ] **Daily pipeline 入口**：`npm run pipeline:daily`（一键跑完整流程）
- [ ] **Override rate 追踪**：weekly review agent 统计你的决策 vs AI 建议偏差

### Phase 4：Next.js /admin（1-2 天）

**目标：比飞书更好的审核体验。**

- [ ] `/admin` 路由（password 保护）
- [ ] Inbox 风格列表，键盘导航
- [ ] Override 理由输入（积累训练信号）
- [ ] 偏差统计仪表盘（override rate, AI accuracy by content type）

### Phase 5：MCP Server（3-5 天，在数据质量够好之后）

- [ ] `src/mcp/server.ts`（基于 @modelcontextprotocol/sdk）
- [ ] 向量搜索工具
- [ ] 本地 MCP 配置（Claude Desktop / Claude Code）
- [ ] 可选：部署为 HTTP 服务

### Phase 6：原生数据通道（平台上线后）

- [ ] 原生提交表单（/submit）：产品 URL + maker 故事
- [ ] trust_level=native_submitted，编辑审核即上线
- [ ] Maker 认领机制（认领已收录产品）
- [ ] 爬取数据渐进降级（被认领的产品，爬取版本降为 source_ref）

---

## 十一、各 Phase 的 KPI

| Phase | 完成标志 |
|-------|---------|
| 0 | 网站产品数 > 300，V2EX/Linux.do 有产品入选 |
| 1 | 每条待审核内容有 AI 摘要，inferred_type 准确率 > 80% |
| 2 | 所有数据在 Turso，JSON pipeline 文件可删除 |
| 3 | 你不需要手动跑任何脚本，只看飞书消息 + 点按钮 |
| 4 | 审核时间 < 10 分钟/天，override rate 稳定在 15-25% |
| 5 | Claude 能用 Solobase 数据回答中文独立开发者相关问题 |
| 6 | 第一个 maker 认领了自己的产品 |

---

## 附录 A：one-api 配置规范

```typescript
// scripts/config/ai.ts（gitignore）
export const AI_CONFIG = {
  baseUrl: process.env.ONE_API_BASE_URL!,
  apiKey: process.env.ONE_API_KEY!,

  models: {
    classify: 'claude-haiku-4-5-20251001',
    summarize: 'claude-sonnet-4-6',
    embed: 'text-embedding-3-small',   // OpenAI，通过 one-api 中转
  },

  // 并发控制
  concurrency: {
    classify: 20,     // 20 并发 Haiku 调用
    summarize: 5,     // 5 并发 Sonnet 调用
    embed: 50,        // 50 并发 embedding 调用
  },

  // 成本保护
  dailyBudget: {
    classify_max_items: 500,   // 单次最多处理 500 条分类
    summarize_max_items: 100,  // 单次最多处理 100 条摘要
  }
}
```

## 附录 B：前端无图适配（TextProjectCard）

当 `screenshot = null` 时，前端使用文字卡片：

```tsx
// 检测是否有图
if (!project.screenshot) {
  return <TextProjectCard project={project} />  // 纯文字样式
}
return <ProjectCard project={project} />  // 原有带图样式
```

这是 Phase 0 的一个重要改动——**产品不再因为没截图而无法上线**。

## 附录 C：不做什么

在 Phase 0-3 期间，明确不做：

- 不加新爬取源（先把现有数据质量提上去）
- 不做前台 UI 改版
- 不做向量搜索的前端入口（数据体量不够）
- 不做用户注册/登录（原生提交用 email 验证即可）
- 不引入 Postgres / Supabase（Turso 够用，减少运维）
- 不做 n8n 工作流（TypeScript 脚本更易维护）

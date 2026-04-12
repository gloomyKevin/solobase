# Solobase 数据基础设施设计

> 类型：权威设计文档（supersedes `pipeline-redesign.md`）
> 版本：v2（2026-04-12，修订：修复状态机、M:M schema、幂等性、推断历史、去重策略）
> 前置：`doc/data system design.md`（概念模型）·`doc/pipeline-redesign.md`（现状诊断）

---

## 一、核心认知

### 1.1 目标：可靠的 canonical store，而非"知识图谱"

第一阶段目标是建立一个**可靠的 canonical store**：稳定入库、可回写编辑决策、可发布到前台、有完整的操作追溯。

"知识图谱"是这个 store 未来演进的方向，不是当前的技术主张。在 M:M 实体关系正确、实体身份识别可靠、向量召回经过验证之前，不使用这个标签。

### 1.2 三条一阶原则

**原则一：LLM 只做排序，不做裁决**  
LLM 的置信度分数是未校准的、会随 prompt 漂移的代理信号。任何内容的最终归宿（发布/拒绝/归档）由人决定，LLM 只影响你看到内容的先后顺序。  
例外：**确定性规则**（招聘/抽奖等关键词）可以直接归档，这是规则确定性，不是 LLM 置信度。

**原则二：approved ≠ published**  
审核通过（review_status=approved）和对外发布（publish_status=published）是两个独立状态，分开管理。feed 只包含 published 内容。这给你留了"通过但暂不公开"的空间，也防止补图/修字段触发 feed 重排。

**原则三：推断历史 append-only，事实层不可变**  
`content_items` 的事实字段（原文、作者、互动数、来源 ID）写入后不可改。LLM 的每次推断输出单独存一行 `inference_runs`，当前最新摘要冗余一份在 `content_items` 里方便查询，但原始推断历史永远可回放。

### 1.3 数据系统的终态定位

Solobase 的数据系统是**中文独立开发者生态的知识基础设施**。当前阶段的网站是第一个消费入口。未来的消费入口还有 API、MCP Server、Newsletter 等。数据本身是资产，不依附于任何展示形式。

---

## 二、设计原则（实施层）

在 `data system design.md` 六条原则之上，本文档追加以下实施约束：

| # | 原则 | 含义 |
|---|------|------|
| P1 | 幂等入库 | `(source, source_id)` 唯一索引，任何重跑都不产生重复 |
| P2 | 状态三分 | review_status / publish_status / entity_status 互相独立 |
| P3 | 推断可回放 | inference_runs append-only，可重跑对比，不丢失历史 |
| P4 | 关系真实 | M:M 用 junction table，不压扁成单值外键 |
| P5 | 去重两阶段 | 先 deterministic keys，再 LLM/embedding 候选，merge 可回退 |
| P6 | 发布显式 | feed 内容由 publish_status 控制，不由 review_status 直接驱动 |
| P7 | 可观测 | 核心指标可查询，不盲飞 |

---

## 三、系统架构全图

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOURCE LAYER                              │
│  即刻 · V2EX · Linux.do · Product Hunt · sspai · Native Submit  │
└────────────────────────┬────────────────────────────────────────┘
                         │ 全量，仅过滤确定性噪声（规则）
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  RAW STORE  data/raw/{source}/*.json — 不可变，永久保留          │
└────────────────────────┬────────────────────────────────────────┘
                         │ upsert on (source, source_id)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  CANONICAL STORE  Turso (libSQL) + sqlite-vec                   │
│  content_items · projects · makers · junction tables            │
│  inference_runs · editorial_actions · media_cache               │
└──────┬────────────────────────┬───────────────────────┬─────────┘
       │                        │                        │
       ▼                        ▼                        ▼
┌─────────────┐    ┌────────────────────┐    ┌──────────────────┐
│  ENRICHMENT │    │  EDITORIAL QUEUE   │    │   BUILD LAYER    │
│  AGENT      │    │                    │    │                  │
│             │    │ 飞书 Card Bot      │    │ publish_status   │
│ LLM 分类    │    │ (短期)             │    │ = published      │
│ 向量化      │    │ → Next.js /admin   │    │ → feed.json      │
│ 媒体富化    │    │ (中期)             │    │ → ISR rebuild    │
│ 去重候选    │    │                    │    │                  │
│ 编辑摘要    │    │ 每天 10-15 分钟    │    │ 增量，不全量重跑  │
└─────────────┘    └────────────────────┘    └──────────────────┘
                                                      ▼
                                               Frontend (Next.js)
```

---

## 四、技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| **数据库** | Turso (libSQL/SQLite) | 零运维，远程可访问，免费额度充足 |
| **向量存储** | sqlite-vec（内置于 Turso） | 不引入独立向量 DB，一个依赖两件事 |
| **ORM** | Drizzle ORM | TypeScript 原生，类型安全，迁移简单 |
| **Embedding** | `text-embedding-3-small` (OpenAI via one-api) | $0.02/1M tokens，几乎免费 |
| **分类 LLM** | Claude Haiku (via one-api) | 快速便宜，批量处理 |
| **摘要 LLM** | Claude Sonnet (via one-api) | 质量高，只对 review 内容调用 |
| **媒体富化** | Microlink API | OG image + metadata，一行调用 |
| **页面内容** | Jina Reader (r.jina.ai) | 免费，任意 URL → clean markdown |
| **调度** | Claude Code CronCreate | 原生集成，有上下文理解能力 |
| **审核 UI（短期）** | 飞书 Interactive Card Bot | 零新工具，手机可操作 |
| **审核 UI（中期）** | Next.js /admin | 同 repo，共享 DB，键盘流 |
| **MCP Server** | @modelcontextprotocol/sdk | 官方 Node.js SDK |

**成本估算：**

| 项目 | 场景 | 成本 |
|------|------|------|
| 冷启动全量处理 | 4188 条分类 + embedding | ~¥80 一次性 |
| 日常运营 | ~100 条新内容/天 | ~¥3/天 |
| Turso | 500MB + 1B rows/月 | 免费 |
| Microlink | 500 req/月免费，后续 $29/月 | 初期免费 |

---

## 五、数据库 Schema

### 5.1 状态机定义

每个 content_item 有三个独立的状态维度：

```
review_status   —— 审核流转
  pending       → 尚未人工审核
  approved      → 审核通过（不等于对外发布）
  rejected      → 审核拒绝（保留记录，不展示）
  archived      → 确定性规则归档（招聘/抽奖等）

publish_status  —— 发布控制（只有 review_status=approved 才可设置）
  unpublished   → 通过但暂不公开
  published     → 对外展示（进入 feed）
  featured      → 编辑精选（在 feed 中置顶/高亮）

entity_status   —— 实体生命周期
  active        → 正常状态
  deprecated    → 内容已过期/产品已停止，降低权重
  withdrawn     → 作者要求删除，立即从前台移除
```

Project 和 Maker 实体同样有 `entity_status`（active / deprecated / withdrawn）。

### 5.2 完整 Schema

```typescript
// db/schema.ts
import {
  sqliteTable, text, integer, real, blob, index, uniqueIndex
} from 'drizzle-orm/sqlite-core'

// ── Content Items ──────────────────────────────────────────────────
// 事实层字段写入后不可修改
// 推断层字段为当前最新推断的摘要冗余（全历史在 inference_runs）
// 编辑层字段由人工操作写入

export const contentItems = sqliteTable('content_items', {
  id:           text('id').primaryKey(),   // UUID

  // ── 事实层（不可变） ──
  source:       text('source').notNull(),
  // jike | v2ex | linuxdo | producthunt | native
  sourceId:     text('source_id').notNull(),
  sourceUrl:    text('source_url').notNull(),
  body:         text('body').notNull(),    // 完整原文，不截断
  authorName:   text('author_name').notNull(),
  authorId:     text('author_id'),
  authorBio:    text('author_bio'),
  likesCount:   integer('likes_count').default(0),
  commentsCount:integer('comments_count').default(0),
  sharesCount:  integer('shares_count').default(0),
  topComments:  text('top_comments', { mode: 'json' })
                  .$type<{ author: string; content: string; likes: number }[]>(),
  mediaRaw:     text('media_raw', { mode: 'json' }).$type<string[]>(),
  externalLinks:text('external_links', { mode: 'json' }).$type<string[]>(),
  publishedAt:  integer('published_at', { mode: 'timestamp' }),
  crawledAt:    integer('crawled_at', { mode: 'timestamp' }).notNull(),
  sourceExtra:  text('source_extra', { mode: 'json' }),

  // ── 推断层（当前最新快照，全历史见 inference_runs） ──
  contentType:  text('content_type'),
  // product_launch | experience_share | build_log | revenue_report |
  // failure_postmortem | tutorial | tool_recommendation |
  // market_observation | resource_collection | discussion | noise
  confidence:   real('confidence'),
  isIndieMaker: integer('is_indie_maker', { mode: 'boolean' }),
  // 产品信息（LLM 提取，非确定）
  inferredProductName:   text('inferred_product_name'),
  inferredProductUrl:    text('inferred_product_url'),
  inferredProductOneLiner: text('inferred_product_one_liner'),
  inferredProductStage:  text('inferred_product_stage'),
  inferredMakerName:     text('inferred_maker_name'),
  keyMetrics:   text('key_metrics', { mode: 'json' }).$type<string[]>(),
  topics:       text('topics', { mode: 'json' }).$type<string[]>(),
  contentDepth: text('content_depth'),   // shallow | medium | deep
  hasPersonalStory:     integer('has_personal_story', { mode: 'boolean' }),
  hasSpecificNumbers:   integer('has_specific_numbers', { mode: 'boolean' }),
  hasGenuineInsight:    integer('has_genuine_insight', { mode: 'boolean' }),
  editorialRec: text('editorial_rec'),   // include | review | exclude
  recReason:    text('rec_reason'),
  editorialSummary: text('editorial_summary'),
  collectionAngle:  text('collection_angle'),
  concerns:     text('concerns', { mode: 'json' }).$type<string[]>(),
  // 媒体
  media:        text('media'),           // 富化后的图片 URL（null = 无图，用文字卡片）
  mediaSource:  text('media_source'),    // og_image | post_image | screenshot
  // 推断元信息
  currentInferenceRunId: text('current_inference_run_id'),
  llmProcessedAt: integer('llm_processed_at', { mode: 'timestamp' }),

  // ── 编辑层 ──
  reviewStatus:   text('review_status').default('pending').notNull(),
  publishStatus:  text('publish_status').default('unpublished').notNull(),
  entityStatus:   text('entity_status').default('active').notNull(),
  trustLevel:     text('trust_level').default('scraped').notNull(),
  // scraped | feishu_approved | native_submitted | maker_verified
  reviewedAt:     integer('reviewed_at', { mode: 'timestamp' }),
  reviewedBy:     text('reviewed_by'),   // jiexiang | wangyuxuan | auto_rule
  publishedAt_editorial: integer('published_at_editorial', { mode: 'timestamp' }),
  editorNotes:    text('editor_notes'),
  editorTags:     text('editor_tags', { mode: 'json' }).$type<string[]>(),
  overrideReason: text('override_reason'),  // 推翻 AI 建议时填写
  archiveReason:  text('archive_reason'),   // 规则归档时记录触发规则

  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  // 幂等性约束：同一来源的同一条内容只能入库一次
  uniqSourceItem: uniqueIndex('uq_source_item').on(t.source, t.sourceId),
  idxReviewStatus: index('idx_review_status').on(t.reviewStatus),
  idxPublishStatus: index('idx_publish_status').on(t.publishStatus),
  idxLlmProcessed: index('idx_llm_processed').on(t.llmProcessedAt),
  idxPublishedAt: index('idx_published_at').on(t.publishedAt),
}))

// ── Inference Runs（推断历史，append-only）─────────────────────────
// 每次 LLM 处理产生一行，永不修改，永不删除
// content_items.currentInferenceRunId 指向最新一行

export const inferenceRuns = sqliteTable('inference_runs', {
  id:              text('id').primaryKey(),
  contentItemId:   text('content_item_id').notNull()
                     .references(() => contentItems.id),
  promptVersion:   text('prompt_version').notNull(),  // e.g. "classify-v3"
  model:           text('model').notNull(),
  inputTokens:     integer('input_tokens'),
  outputTokens:    integer('output_tokens'),
  rawOutput:       text('raw_output', { mode: 'json' }), // 完整 LLM 输出
  parsedOk:        integer('parsed_ok', { mode: 'boolean' }).notNull(),
  parseError:      text('parse_error'),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  idxItem: index('idx_inf_item').on(t.contentItemId),
  idxPromptVer: index('idx_inf_prompt').on(t.promptVersion),
}))

// ── Projects（产品/工具实体）──────────────────────────────────────

export const projects = sqliteTable('projects', {
  id:           text('id').primaryKey(),
  slug:         text('slug').notNull().unique(),
  name:         text('name').notNull(),
  tagline:      text('tagline'),
  description:  text('description'),
  url:          text('url').notNull(),
  screenshot:   text('screenshot'),     // null = 无截图，前端用文字卡片
  stage:        text('stage'),          // building | launched | revenue
  topics:       text('topics', { mode: 'json' }).$type<string[]>(),
  trustLevel:   text('trust_level').default('scraped').notNull(),
  entityStatus: text('entity_status').default('active').notNull(),
  // 编辑
  reviewStatus:    text('review_status').default('pending').notNull(),
  publishStatus:   text('publish_status').default('unpublished').notNull(),
  isEditorsPick:   integer('is_editors_pick', { mode: 'boolean' }).default(false),
  featuredInsight: text('featured_insight'),
  vibes:           text('vibes', { mode: 'json' }).$type<string[]>(),
  // 小而美 | 设计感 | 技术硬核 | 创意切入 | 出海标杆 | 冷门有价值
  editorNotes:     text('editor_notes'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  idxUrl: index('idx_project_url').on(t.url),
  idxPublish: index('idx_project_publish').on(t.publishStatus),
}))

// ── Makers（创作者实体）──────────────────────────────────────────

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
  entityStatus: text('entity_status').default('active').notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ── Junction Tables（M:M 关系）────────────────────────────────────

// 帖子 ↔ 产品：一篇复盘可以提到多个产品
export const contentProjectLinks = sqliteTable('content_project_links', {
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  projectId:     text('project_id').notNull()
                   .references(() => projects.id),
  linkType:      text('link_type').notNull(),
  // primary | mentioned | compared | related
  confidence:    real('confidence'),   // LLM 提取的置信度
  isPrimary:     integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_cp').on(t.contentItemId, t.projectId),
}))

// 帖子 ↔ Maker：一篇帖子可以提到多个 maker
export const contentMakerLinks = sqliteTable('content_maker_links', {
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  makerId:       text('maker_id').notNull()
                   .references(() => makers.id),
  linkType:      text('link_type').notNull(),
  // author | mentioned | interviewed
  isPrimary:     integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_cm').on(t.contentItemId, t.makerId),
}))

// 产品 ↔ Maker：联合创始人、多 maker 协作
export const projectMakerLinks = sqliteTable('project_maker_links', {
  projectId:  text('project_id').notNull().references(() => projects.id),
  makerId:    text('maker_id').notNull().references(() => makers.id),
  role:       text('role'),   // founder | co_founder | contributor
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_pm').on(t.projectId, t.makerId),
}))

// 产品来源追踪：canonical project 聚合了哪些 source content
export const projectSources = sqliteTable('project_sources', {
  projectId:     text('project_id').notNull().references(() => projects.id),
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  sourceType:    text('source_type').notNull(),
  // primary_mention | update_post | related_post | native_submission
  addedAt:       integer('added_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_ps').on(t.projectId, t.contentItemId),
}))

// ── Embeddings（向量，sqlite-vec）────────────────────────────────
// 只负责语义召回候选，不做身份判断

export const embeddings = sqliteTable('embeddings', {
  entityType: text('entity_type').notNull(),  // content_item | project | maker
  entityId:   text('entity_id').notNull(),
  embedding:  blob('embedding').notNull(),    // Float32Array，1536 维
  model:      text('model').notNull(),
  inputText:  text('input_text'),             // 用于 embedding 的原始文本（调试用）
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_emb').on(t.entityType, t.entityId),
}))

// ── Dedup Candidates（去重候选，两阶段去重的中间产物）────────────
// Phase 1 (deterministic) 或 Phase 2 (embedding) 生成候选对
// merge/split 操作由编辑确认，可回退

export const dedupCandidates = sqliteTable('dedup_candidates', {
  id:           text('id').primaryKey(),
  itemAId:      text('item_a_id').notNull(),
  itemBId:      text('item_b_id').notNull(),
  detectionMethod: text('detection_method').notNull(),
  // url_match | name_match | embedding_similarity
  similarity:   real('similarity'),
  suggestedAction: text('suggested_action'),  // merge | link_related | dismiss
  llmReasoning: text('llm_reasoning'),
  status:       text('status').default('pending'),
  // pending | merged | dismissed | split（merge 后可回退）
  resolvedBy:   text('resolved_by'),
  resolvedAt:   integer('resolved_at', { mode: 'timestamp' }),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  uniqPair: uniqueIndex('uq_dedup_pair').on(t.itemAId, t.itemBId),
}))

// ── Editorial Actions（审核历史，append-only）────────────────────

export const editorialActions = sqliteTable('editorial_actions', {
  id:            text('id').primaryKey(),
  entityType:    text('entity_type').notNull(), // content_item | project | maker
  entityId:      text('entity_id').notNull(),
  action:        text('action').notNull(),
  // approve | reject | publish | unpublish | feature | archive |
  // edit_note | merge | split | withdraw
  prevState:     text('prev_state', { mode: 'json' }),
  newState:      text('new_state', { mode: 'json' }),
  actor:         text('actor').notNull(),       // jiexiang | wangyuxuan | auto_rule
  notes:         text('notes'),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  idxEntity: index('idx_ea_entity').on(t.entityType, t.entityId),
}))

// ── Media Cache ────────────────────────────────────────────────

export const mediaCache = sqliteTable('media_cache', {
  url:          text('url').primaryKey(),
  ogImage:      text('og_image'),
  ogTitle:      text('og_title'),
  ogDescription: text('og_description'),
  fetchedAt:    integer('fetched_at', { mode: 'timestamp' }).notNull(),
  valid:        integer('valid', { mode: 'boolean' }).notNull(),
  errorReason:  text('error_reason'),
})
```

---

## 六、Enrichment Agent 设计

### 6.1 流程与分流逻辑

```
新内容入 canonical store（review_status=pending）
  ↓
Step 1: 确定性噪声过滤（规则，不走 LLM）
  命中 NOISE_RULES（招聘/抽奖/转发等关键词） → archive_reason 记录 → review_status=archived
  ↓
Step 2: LLM Pass 1 — 分类 + 提取（Haiku）
  输出：content_type, confidence, 产品信息, 质量信号, editorial_rec, rec_reason
  写入：inference_runs（新行）+ content_items（当前快照更新）
  ↓
Step 3: LLM Pass 2 — 编辑摘要（Sonnet，仅对 rec=include/review 的内容）
  输出：editorial_summary, collection_angle, concerns
  写入：同一 inference_run 更新
  ↓
Step 4: 向量化（text-embedding-3-small）
  写入 embeddings 表
  ↓
Step 5: 去重候选检测
  Phase 1 (deterministic): 检查 inferredProductUrl 是否命中已有 project.url
    → 命中: 写 dedup_candidates (url_match, status=pending)
  Phase 2 (embedding): 查 sqlite-vec 找 cos_sim > 0.90 的候选
    → 找到: 写 dedup_candidates (embedding_similarity, status=pending)
    → 注意: 这只是候选，不自动合并
  ↓
Step 6: 媒体富化（Microlink，异步，不阻塞主流程）
  有 inferredProductUrl → 尝试抓 OG image
  写入 media_cache → 更新 content_items.media
  ↓
分流到 Editorial Queue（按 editorial_rec 排序，不做自动裁决）：
  rec=include, conf≥0.85 → 显示在队列最前（深绿标记）
  rec=include, conf<0.85  → 正常队列（浅绿标记）
  rec=review              → 正常队列（黄色标记）
  rec=exclude, conf≥0.85 → 显示在队列最后（灰色，可折叠）
  rec=exclude, conf<0.85  → 队列末尾（灰色）
  
  ⚠️ 所有 rec=exclude 的内容仍然可见，仍然可以被通过
  ⚠️ 没有任何内容因 LLM 置信度被静默归档（只有规则触发归档）
```

### 6.2 LLM 调用设计

**Pass 1：分类 + 提取（Haiku）**

```typescript
// 关键设计：工具调用模式（tool_use），强制 JSON 输出
const result = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  tools: [{
    name: 'analyze_content',
    description: '分析帖子内容，提取结构化信息',
    input_schema: {
      type: 'object',
      properties: {
        content_type: {
          type: 'string',
          enum: [
            'product_launch', 'build_log', 'revenue_report',
            'experience_share', 'failure_postmortem', 'tutorial',
            'tool_recommendation', 'market_observation',
            'resource_collection', 'discussion', 'noise'
          ]
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        is_indie_maker_content: { type: 'boolean' },
        product: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            one_liner: { type: 'string' },
            stage: { type: 'string', enum: ['building', 'launched', 'revenue'] }
          }
        },
        maker_name: { type: 'string' },
        key_metrics: { type: 'array', items: { type: 'string' } },
        topics: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        quality: {
          type: 'object',
          properties: {
            has_personal_story: { type: 'boolean' },
            has_specific_numbers: { type: 'boolean' },
            has_genuine_insight: { type: 'boolean' },
            depth: { type: 'string', enum: ['shallow', 'medium', 'deep'] }
          },
          required: ['has_personal_story', 'has_specific_numbers',
                     'has_genuine_insight', 'depth']
        },
        editorial_rec: {
          type: 'string',
          enum: ['include', 'review', 'exclude']
        },
        rec_reason: { type: 'string', maxLength: 100 }
      },
      required: ['content_type', 'confidence', 'is_indie_maker_content',
                 'quality', 'editorial_rec', 'rec_reason']
    }
  }],
  tool_choice: { type: 'tool', name: 'analyze_content' },
  messages: [{ role: 'user', content: buildClassifyPrompt(item) }],
  system: CLASSIFY_SYSTEM,
})
```

**Pass 2：编辑摘要（Sonnet，仅对 include/review）**

```typescript
const SUMMARY_SCHEMA = z.object({
  summary: z.string().max(150),          // 给编辑看的一句话
  collection_angle: z.string().max(100), // 从哪个角度收录最有价值
  concerns: z.array(z.string()),         // 顾虑点（0-3 条）
})
```

### 6.3 去重两阶段设计

**Phase 1：Deterministic Blocking（精确匹配）**

```typescript
async function deterministicDedup(item: ContentItem): Promise<void> {
  const url = item.inferredProductUrl
  if (!url) return

  // 归一化 URL（去掉 trailing slash, query params, UTM 等）
  const normalizedUrl = normalizeUrl(url)

  // 查找是否已有 project 用同一 URL
  const existing = await db.query.projects.findFirst({
    where: eq(projects.url, normalizedUrl)
  })

  if (existing) {
    // 同 URL = 同产品，写候选对（高置信度，人工确认）
    await db.insert(dedupCandidates).values({
      id: uuid(),
      itemAId: item.id,
      itemBId: existing.id,
      detectionMethod: 'url_match',
      similarity: 1.0,
      suggestedAction: 'merge',
      status: 'pending',
      createdAt: new Date(),
    }).onConflictDoNothing()
  }
}
```

**Phase 2：Embedding Candidates（语义候选，不直接合并）**

```typescript
async function embeddingDedup(
  itemId: string,
  embedding: Float32Array
): Promise<void> {
  // sqlite-vec 查询，threshold = 0.90（召回候选，不是判断边界）
  const candidates = await db.all(sql`
    SELECT e.entity_id, vec_distance_cosine(e.embedding, ${embedding}) as dist
    FROM embeddings e
    WHERE e.entity_type = 'content_item'
      AND e.entity_id != ${itemId}
      AND vec_distance_cosine(e.embedding, ${embedding}) < 0.10
    ORDER BY dist ASC
    LIMIT 5
  `)

  for (const candidate of candidates) {
    // 写入候选对，不做任何自动合并
    // LLM 可以后续判断这对候选是否真的是同一实体
    await db.insert(dedupCandidates).values({
      id: uuid(),
      itemAId: itemId,
      itemBId: candidate.entity_id,
      detectionMethod: 'embedding_similarity',
      similarity: 1 - candidate.dist,
      suggestedAction: null,  // 等 LLM 二次判断后再填
      status: 'pending',
      createdAt: new Date(),
    }).onConflictDoNothing()
  }
}

// 注意：embedding 候选只是"可能相关"，需要额外的 LLM 判断
// 才能确定是否是同一产品（同赛道的不同产品相似度也可能 >0.90）
// merge 操作一律需要编辑确认，且可回退
```

---

## 七、Editorial Interface

### 7.1 队列展示逻辑

Editorial Queue 不是"待审核列表"，是**按 AI 推荐排序的优先级队列**：

```
队列顺序：
  1. [深绿] include + conf≥0.85  → AI 强烈建议收录，你大概率直接通过
  2. [浅绿] include + conf<0.85  → AI 建议收录但不确定，需要你判断
  3. [黄色] review               → AI 不确定，需要你判断
  4. [灰色] exclude + conf<0.85  → AI 建议不收录但不确定
  5. [深灰] exclude + conf≥0.85  → AI 强烈建议不收录（可折叠，但不消失）

重要：第 4、5 类内容你必须能看到，不会被自动隐藏或归档
你可以随时通过任何一条，包括 AI 强烈建议排除的内容
```

### 7.2 飞书 Interactive Card Bot

每天早上 7:00 发送日报 + 卡片批次：

```
Solobase 内容日报 · 4月12日

今日处理：47 条新内容
  📋 进入审核队列：40 条（需你处理：约 15 分钟）
  🗂 规则归档：7 条（招聘/抽奖等确定性噪声）

AI 强烈建议收录（深绿，建议快速过一遍）：12 条 ↓
AI 建议审核（黄色）：19 条 ↓
AI 建议排除（灰色，可跳过）：9 条 ↓

[今日新增的去重候选：3 对，需你确认合并]
```

**卡片格式：**

```
┌────────────────────────────────────────────┐
│ 🟢 product_launch · 即刻 · conf 0.91       │
│                                            │
│ ColaMD - 极简 Markdown 编辑器              │
│                                            │
│ AI：作者3周独立开发，分享了从0到付费用户的  │
│ 完整决策路径。设计感强，定位清晰。          │
│ 收录角度：产品发布 + 设计叙事               │
│                                            │
│ 89赞 · 12评论 · 原帖链接                  │
├────────────────────────────────────────────┤
│  [✓ 收录+发布]  [✓ 收录不发布]  [✗ 跳过] │
└────────────────────────────────────────────┘
```

注意：卡片有两个通过按钮：**收录+发布**（review=approved, publish=published）和**收录不发布**（review=approved, publish=unpublished）。这实现了 approved ≠ published 的状态分离。

### 7.3 Next.js /admin（中期，1-2 天实现）

- 路由：`/admin`，环境变量密码保护
- Inbox 风格，键盘快捷键（j/k 翻，y 收录发布，u 收录不发布，n 跳过，e 编辑）
- 过滤器：按 source / content_type / editorial_rec / date
- 去重候选单独区域（不混进主队列）
- Override reason 输入框（积累训练信号）
- 可观测面板（见第九章）

---

## 八、Build Layer

### 8.1 Feed 构建条件

```typescript
// scripts/build-feed.ts

// 产品入选：publish_status=published（不是 review_status=approved）
const publishedProjects = await db.query.projects.findMany({
  where: and(
    eq(projects.publishStatus, 'published'),
    eq(projects.entityStatus, 'active'),
  ),
  // 排序用显式 published_at_editorial，不用 updated_at
  // 防止补图/修字段触发 feed 重排
  orderBy: [desc(projects.publishedAt_editorial)],
  limit: 500,
})

// 帖子入选：publish_status=published + worthy content_type
const WORTHY_POST_TYPES = new Set([
  'experience_share', 'build_log', 'revenue_report',
  'failure_postmortem', 'tutorial', 'tool_recommendation',
  'market_observation', 'resource_collection'
])

const publishedPosts = await db.query.contentItems.findMany({
  where: and(
    eq(contentItems.publishStatus, 'published'),
    eq(contentItems.entityStatus, 'active'),
    inArray(contentItems.contentType, [...WORTHY_POST_TYPES]),
  ),
  orderBy: [desc(contentItems.publishedAt_editorial)],
  limit: Math.max(Math.floor(publishedProjects.length / 3), 10),
})
```

### 8.2 无图产品的展示处理

screenshot 为 null 不影响产品进入 feed，前端用 TextProjectCard 组件：

```tsx
// src/components/ProjectCard.tsx
export function ProjectCard({ project }: { project: FeedProject }) {
  if (!project.screenshot) {
    return <TextProjectCard project={project} />
  }
  return <ImageProjectCard project={project} />
}
```

### 8.3 Publisher Agent 触发时机

Build 不再是定时全量重跑，而是事件触发的增量更新：

```
editorial_status 变更为 published → 触发 Publisher Agent
  → 增量更新 feed.json（只更新变化的部分）
  → 调用 Next.js revalidatePath('/')
  → 发飞书确认消息："ColaMD 已发布 ✓"
```

---

## 九、可观测指标

**系统不能盲飞。以下指标必须可查询，推荐做成 weekly digest 的一部分。**

### 9.1 必须追踪的核心指标

```typescript
// scripts/agents/metrics.ts

interface WeeklyMetrics {
  // 入库质量
  ingested_total: number           // 各源入库数
  ingested_by_source: Record<string, number>
  dedup_caught: number             // 幂等去重拦截数（验证系统正常）

  // 过滤漏斗
  archived_by_rule: number         // 规则归档数
  archived_by_rule_breakdown: Record<string, number>  // 按触发规则
  queue_total: number              // 进入审核队列总数
  queue_backlog: number            // 当前积压未审核数

  // 编辑效率
  reviewed_count: number           // 本周审核条数
  approved_rate: number            // 通过率
  published_rate: number           // 通过后直接发布率
  avg_review_time_minutes: number  // 平均审核时间（需前端记录）

  // AI 准确性（最重要的调优信号）
  override_rate: number            // AI 推荐 exclude，你通过的比率（越低越好）
  false_positive_rate: number      // AI 推荐 include，你拒绝的比率
  override_by_content_type: Record<string, number>  // 哪类内容 AI 最不准

  // 去重健康度
  dedup_candidates_pending: number // 待确认的去重候选数
  dedup_merged_this_week: number   // 本周合并数
  dedup_split_this_week: number    // 本周回退合并数（越高说明误合并多）

  // Feed 健康度
  feed_project_count: number       // 当前 feed 中产品数
  feed_post_count: number          // 当前 feed 中帖子数
  feed_changes_this_week: number   // 本周 feed 变更次数（排版稳定性）
  sources_coverage: Record<string, number>  // 各源贡献百分比
}
```

### 9.2 AI 准确性校准

**override_rate** 是最重要的信号：你推翻 AI 建议的比率反映了 prompt 的准确性。

```
override_rate < 10%   → AI 阈值可以上调，减少人工负担
override_rate 10-20%  → 当前状态合理
override_rate > 25%   → prompt 需要优化，本周的 override_reason 要仔细看

每月做一次 prompt 优化：
  取出所有 override_reason，找最常见的错误模式
  加入 Pass 1 system prompt 的 few-shot examples
  重跑上个月的边界案例验证改进效果
```

---

## 十、爬虫层改造规范

### 10.1 统一 Adapter 输出格式（修复 media 字段）

所有 standardize 函数**必须**区分 media 和 external_links：

```typescript
interface StandardizedItem {
  source: SourceType
  source_id: string
  source_url: string
  body: string              // 完整原文，不截断
  author_name: string
  author_id: string
  author_bio: string
  engagement: { likes: number; comments: number; shares?: number }
  top_comments: Comment[]
  media: string[]           // ← 仅图片 URL（帖子内的图片）
  external_links: string[]  // ← 仅真实外链（产品/文章 URL）
  published_at: string
  crawled_at: string
  source_extra: Record<string, any>
}

// V2EX 和 Linux.do 的修复重点：
// body 中的 ![...](url) 或 <img src="url"> → media
// body 中的 [text](url) 或 <a href="url"> → external_links（如果是真实外链）
// okjike.com / v2ex.com / linux.do 本身的链接不算 external_links
```

### 10.2 入库语义（幂等 upsert）

```typescript
// 所有来源统一使用 upsert 语义入库
await db.insert(contentItems)
  .values(item)
  .onConflictDoUpdate({
    target: [contentItems.source, contentItems.sourceId],
    set: {
      // 只更新可能变化的字段（互动数等），不覆盖事实内容
      likesCount: item.likesCount,
      commentsCount: item.commentsCount,
      topComments: item.topComments,
      updatedAt: new Date(),
    }
  })
```

### 10.3 各源改造清单

**V2EX（优先级：高）**
- [ ] 修 media 字段：markdown 图片 → media，外链 → external_links
- [ ] 扩展节点：`create` + `programmer` + `indie` + `share`
- [ ] 移除 minReplies 爬取阶段过滤

**Linux.do（优先级：高）**
- [ ] 修 media 字段：HTML img → media，a href → external_links  
- [ ] 移除 minLikes 爬取阶段过滤
- [ ] 保留 category/board 信息（source_extra 字段）

**Jike（优先级：中）**
- [ ] 移除 filter-jike.ts 的"无链接+无图直接丢弃"硬过滤
- [ ] 核查 config.json topics 配置，移除非独立开发相关圈子
- [ ] 补充搜索关键词：`复盘` `失败了` `方法论` `PMF` `一年了` `产品思考`

**Product Hunt（优先级：低）**
- [ ] 移除 minVotes 爬取阶段过滤
- [ ] 加中国 maker 识别标记（source_extra.is_chinese_maker_signal）

---

## 十一、Agent 调度

### 11.1 Agent 职责

```
Crawler Agents（每 12-24h）
├── jike-crawler, v2ex-crawler, linuxdo-crawler
└── ph-crawler（每周一次）

Enrichment Agent（crawl 结束后自动触发）
└── 处理 llm_processed_at=null 的条目
    → Step 1-6（见第六章）

Editorial Digest Agent（每天 07:00，北京时间）
└── 汇总待审核内容 → 生成飞书卡片批次 + 日报摘要

Publisher Agent（review/publish status 变更时触发）
└── 增量更新 feed.json → ISR 重建 → 飞书确认

Dedup Review Agent（每天 07:00，随日报发出）
└── 汇总 dedup_candidates(status=pending) → 发飞书卡片

Weekly Review Agent（每周一 09:00）
└── 计算 WeeklyMetrics → 发飞书周报
    → 如 override_rate > 25%，附带 prompt 优化建议
```

### 11.2 Claude Code CronCreate 配置

```
# 每日管道（UTC 22:00 = 北京 06:00）
0 22 * * *  →  npm run pipeline:daily

# 编辑摘要（UTC 23:00 = 北京 07:00）
0 23 * * *  →  npm run agents:editorial-digest

# 每周复盘（UTC 01:00 周一 = 北京周一 09:00）
0 1 * * 1   →  npm run agents:weekly-review
```

### 11.3 命令行入口

```bash
# 日常管道（cron 调用）
npm run pipeline:daily       # crawl:all → enrich → build:feed

# 调试单步
npm run crawl:jike
npm run crawl:v2ex
npm run enrich               # 处理所有未处理条目
npm run enrich -- --limit 50
npm run enrich -- --item-id <source_id>
npm run build:feed           # 增量重建 feed.json

# 冷启动迁移（一次性）
npm run migrate:json-to-db   # pipeline_output.json → Turso
npm run enrich -- --reprocess-all  # 全量 LLM 处理

# 可观测
npm run metrics:today        # 今日漏斗数据
npm run metrics:week         # 本周摘要
npm run dedup:pending        # 查看待确认的去重候选
```

---

## 十二、MCP Server

数据质量稳定后实现。让任何集成 MCP 的 AI 工具都能查询 Solobase 的结构化知识。

```typescript
// 暴露的工具
const tools = {
  search_projects: '语义搜索独立开发者产品（向量 + 关键词混合）',
  search_content:  '搜索高价值内容（经验帖/复盘/教程）',
  get_maker:       '获取 maker 档案和产品列表',
  get_related:     '获取与某产品语义相关的内容',
  get_trending:    '最近涌现的热点主题（基于内容聚类）',
  get_recent:      '最近收录的产品和内容',
}
```

---

## 十三、实施路线图

### Phase 0：止血（1-2 天）

修复最严重的流失，不改架构。

- [ ] 修 V2EX/Linux.do media 字段（图片 URL 分离）
- [ ] 修 build-feed：无图产品用 TextProjectCard，不再因无图排除
- [ ] Feishu 双向同步：飞书已审核状态 → editorial 字段写回 DB

**预期：网站产品数 129 → 350+，V2EX/Linux.do 开始贡献产品**

### Phase 1：数据库迁移（3-5 天）

- [ ] Turso 初始化 + Drizzle schema（含幂等约束、junction tables、inference_runs）
- [ ] 迁移脚本：pipeline_output.json → Turso（upsert 语义）
- [ ] 新增 `source + source_id` 唯一索引
- [ ] 更新 build-feed.ts：从 DB 读，用 publish_status 过滤

### Phase 2：LLM 处理层（3-5 天）

- [ ] `scripts/config/ai.ts`（one-api 配置）
- [ ] `scripts/agents/enrich.ts`（Pass 1 + Pass 2，tool_use 模式，Zod 验证）
- [ ] 冷启动全量处理（4188 条，~2-3 小时，成本 ~¥80）
- [ ] 确定性噪声过滤规则（替换原来的关键词硬过滤）
- [ ] 基础去重检测（url_match + embedding 候选，写 dedup_candidates）

### Phase 3：Editorial Workflow（3-5 天）

- [ ] 飞书 Interactive Card Bot（含收录/收录不发布/跳过三个按钮）
- [ ] Publisher Agent（状态变更触发增量 build）
- [ ] Editorial Digest Agent（每日摘要 + 去重候选推送）
- [ ] override_reason 字段（飞书卡片点击跳过时弹出选项）

### Phase 4：可观测 + 自动化（1 周）

- [ ] WeeklyMetrics 实现（见第九章）
- [ ] Weekly Review Agent（每周 AI 准确性报告 + prompt 优化建议）
- [ ] Claude Code CronCreate 配置三个 cron job
- [ ] Next.js /admin（键盘流审核 + 指标仪表盘）

### Phase 5：向量富化（数据量稳定后）

- [ ] 全量 embedding 生成（approved 内容）
- [ ] 语义去重候选检测上线
- [ ] LLM 二次实体判断（embedding 候选 → merge/split 建议）

### Phase 6：MCP Server（内容质量够好后）

### Phase 7：原生数据通道（平台上线后）

- [ ] 原生提交表单（/submit）
- [ ] trust_level=native_submitted
- [ ] Maker 认领机制
- [ ] 爬取数据渐进降级

---

## 附录 A：各 Phase KPI

| Phase | 完成标志 |
|-------|---------|
| 0 | 网站产品数 > 300，V2EX/Linux.do 有产品入选 |
| 1 | 所有数据在 Turso，(source, source_id) 唯一约束验证通过 |
| 2 | inferred_type 覆盖率 100%，override_rate 可计算 |
| 3 | 飞书卡片驱动日常审核，editorial 决策写回 DB 正常 |
| 4 | override_rate 稳定在 10-25%，每周收到 metrics 报告 |
| 5 | 去重误合并率 < 5%（由 split 操作数量衡量） |
| 6 | Claude 能用 Solobase 数据回答中文独立开发者相关问题 |
| 7 | 第一个 maker 认领了自己的产品 |

## 附录 B：明确不做的事

Phase 0-4 期间：

- 不加新爬取源（先把现有数据质量提上去）
- 不做前台 UI 改版
- 不做向量搜索的前台入口（等 Phase 5）
- 不做用户注册/登录
- 不引入 Postgres / Supabase（Turso 够用）
- 不做 n8n 工作流（TypeScript 脚本更易维护）
- 不用 LLM 置信度做自动归档（只用确定性规则归档）

# Solobase 数据基础设施设计

> 类型：权威设计文档（supersedes `pipeline-redesign.md`）
> 版本：v3（2026-04-12，新增：原生输入层、认领流、AI Intake 引擎）
> 前置：`doc/data system design.md`（概念模型）·`doc/pipeline-redesign.md`（现状诊断）

---

## 一、核心认知

### 1.1 系统的两条管道，一个 canonical store

Solobase 的数据系统有两条截然不同的数据流入路径，最终汇入同一个 canonical store：

```
爬取路径：公开平台 → 批量抓取 → AI 理解 → 编辑审核 → 发布
原生路径：Maker 主动提交 / 认领 → AI 结构化 → 轻审核 → 发布
```

两条路径产生的内容通过 `trust_level` 区分权重，在同一个实体模型下共存。

**冷启动阶段**：爬取路径主导，原生路径占少数。  
**平台成熟阶段**：原生路径逐步主导，爬取路径退为发现和补充机制。  
**终态**：爬取数据成为历史记录，平台主体是 maker 直接贡献的内容。

### 1.2 原生输入的核心设计哲学

AI 解决了长期以来"真实性 vs 结构化"的张力：

- **旧模式**：填表单 → 结构化但失真，maker 的真实声音被表单格式过滤掉
- **AI 模式**：maker 自由写 → AI 在旁边提取结构 → 两者都保留

Maker 只需要说真实的话。Solobase 的数据模型对他们透明不可见。

### 1.3 认领是冷启动和原生数据的桥梁

平台早期，编辑通过社交平台主动触达 maker（即刻/Twitter → 微信），引导他们认领已爬取的产品。认领完成后：

- 爬取数据降级为历史参考（source_ref）
- Maker 提供的版本成为主展示
- Trust level 升级为 `maker_verified`
- Maker 获得对产品页的直接编辑权

**认领不是技术问题，是社区建设动作。** 技术只需要提供足够好的认领体验，让 maker 觉得"这件事值得花 5 分钟做"。

### 1.4 数据系统的终态定位

Solobase 的数据是**中文独立开发者生态的知识基础设施**。网站是第一个消费入口，未来还有 API、MCP Server、Newsletter。数据资产不依附于任何展示形式。

---

## 二、设计原则

**概念层原则**（见 `data system design.md`，不重复）

**实施层原则（本文档约束）：**

| # | 原则 | 含义 |
|---|------|------|
| P1 | 幂等入库 | `(source, source_id)` 唯一索引，任何重跑都不产生重复记录 |
| P2 | 状态三分 | review_status / publish_status / entity_status 独立管理 |
| P3 | 推断可回放 | inference_runs append-only，可对比，不丢失历史 |
| P4 | 关系真实 | M:M 用 junction table，不压扁成单值外键 |
| P5 | 去重两阶段 | 先 deterministic keys，再 LLM/embedding 候选，merge 可回退 |
| P6 | 发布显式 | feed 由 publish_status 控制，不由 review_status 直接驱动 |
| P7 | LLM 只做排序 | 置信度影响队列优先级，不做自动裁决；只有确定性规则可以归档 |
| P8 | 原始声音不可篡改 | Maker 提交的原始文字永久保留，AI 只在旁边加结构标注 |
| P9 | trust_level 决定审核门槛 | 越高的 trust_level，越低的审核负担 |
| P10 | 可观测 | 核心指标可查询，不盲飞 |

---

## 三、系统架构全图

```
╔═══════════════════════════════════════════════════════════════════╗
║                         INPUT LAYER                               ║
╠═══════════════════════════╦═══════════════════════════════════════╣
║    爬取路径               ║    原生路径                           ║
║                           ║                                       ║
║  即刻 · V2EX · Linux.do   ║  产品提交（URL + 故事）               ║
║  Product Hunt · sspai     ║  经验帖（自由写作）                   ║
║  (定时 Agent 拉取)        ║  快速更新（里程碑）                   ║
║                           ║  认领（编辑触达 → 微信 → 链接）       ║
╚═══════════════════════════╩═══════════════════════════════════════╝
             │                              │
             │ 全量，仅过滤确定性噪声         │ Maker 原始输入
             ▼                              ▼
    ┌─────────────────┐           ┌──────────────────────┐
    │   RAW STORE     │           │   SUBMISSIONS        │
    │ data/raw/       │           │   (暂存草稿)          │
    │ 不可变，永久保留  │           │   AI Intake 处理中    │
    └────────┬────────┘           └──────────┬───────────┘
             │ upsert on                     │ maker 确认后
             │ (source, source_id)           │ 写入 canonical
             ▼                              ▼
╔═══════════════════════════════════════════════════════════════════╗
║                     CANONICAL STORE                               ║
║           Turso (libSQL/SQLite) + sqlite-vec                      ║
║                                                                   ║
║  content_items · projects · makers · product_updates             ║
║  submissions · maker_auth                                         ║
║  junction tables · inference_runs · editorial_actions            ║
║  embeddings · dedup_candidates · media_cache                     ║
╚══════════╤════════════════════════════╤═════════════════╤═════════╝
           │                            │                 │
           ▼                            ▼                 ▼
  ┌─────────────────┐        ┌──────────────────┐  ┌────────────┐
  │  ENRICHMENT     │        │  EDITORIAL       │  │  AI INTAKE │
  │  AGENT          │        │  QUEUE           │  │  ENGINE    │
  │                 │        │                  │  │            │
  │ LLM 分类提取    │        │ 飞书 Card Bot    │  │ URL 分析   │
  │ 向量化          │        │ → /admin 页面    │  │ 故事结构化  │
  │ 去重候选        │        │ 每天 10-15 分钟   │  │ 字段预填充  │
  │ 媒体富化        │        │                  │  │ Maker 确认  │
  └─────────────────┘        └──────────────────┘  └────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │   BUILD LAYER    │
                            │ publish_status   │
                            │  = published     │
                            │  → feed.json     │
                            └────────┬─────────┘
                                     ▼
                               Frontend (Next.js)
                                     +
                               MCP Server (未来)
```

---

## 四、技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| **数据库** | Turso (libSQL/SQLite) | 零运维，远程访问，免费额度充足 |
| **向量存储** | sqlite-vec（Turso 内置）| 不引入独立向量 DB |
| **ORM** | Drizzle ORM | TypeScript 原生，类型安全 |
| **Embedding** | `text-embedding-3-small`（OpenAI via one-api）| $0.02/1M tokens |
| **分类 LLM** | Claude Haiku（via one-api）| 批量处理 |
| **摘要/Intake LLM** | Claude Sonnet（via one-api）| 给人看的内容用更好的模型 |
| **媒体富化** | Microlink API | OG image + metadata |
| **页面内容提取** | Jina Reader（r.jina.ai）| 免费，URL → clean markdown |
| **调度** | Claude Code CronCreate | 原生集成，有上下文理解 |
| **审核 UI（短期）** | 飞书 Interactive Card Bot | 手机可操作 |
| **审核 UI（中期）** | Next.js /admin | 同 repo，共享 DB，键盘流 |
| **认领链接** | Next.js /claim/[slug] | token 参数，无需独立服务 |
| **Maker Auth** | Magic Link（邮件）| 最轻量，无密码 |
| **MCP Server** | @modelcontextprotocol/sdk | 未来知识 API |

**成本估算：**

| 项目 | 场景 | 成本 |
|------|------|------|
| 冷启动全量 LLM 处理 | 4188 条 | ~¥80 一次性 |
| 日常爬取处理 | ~100 条/天 | ~¥3/天 |
| 原生提交 Intake | ~10 条/天（早期）| ~¥0.5/天 |
| Turso | 500MB + 1B rows/月 | 免费 |
| Microlink | 500 req/月免费 | 初期免费 |

---

## 五、数据库 Schema

### 5.1 状态机定义

**content_items / projects 通用：**

```
review_status
  pending     → 未人工审核
  approved    → 审核通过（≠ 对外发布）
  rejected    → 审核拒绝（保留记录）
  archived    → 确定性规则触发（招聘/抽奖等），记录触发规则

publish_status（仅 review_status=approved 后可设置）
  unpublished → 通过但暂不公开
  published   → 对外展示，进入 feed
  featured    → 编辑精选，feed 中置顶/高亮

entity_status
  active      → 正常
  deprecated  → 内容/产品已过期，降低权重
  withdrawn   → 作者要求删除，立即从前台移除
```

**submissions 专用：**

```
draft              → Maker 未完成填写
submitted          → 提交，AI 处理中
awaiting_confirm   → AI 处理完，等 Maker 确认
confirmed          → Maker 确认，等轻审核
published          → 已发布进 canonical store
rejected           → 不符合平台标准
```

### 5.2 完整 Schema

```typescript
// db/schema.ts

// ── Content Items ────────────────────────────────────────────────

export const contentItems = sqliteTable('content_items', {
  id:           text('id').primaryKey(),

  // 事实层（不可变）
  source:       text('source').notNull(),
  // jike | v2ex | linuxdo | producthunt | native | claim
  sourceId:     text('source_id').notNull(),
  sourceUrl:    text('source_url').notNull(),
  body:         text('body').notNull(),
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

  // 推断层快照（全历史见 inference_runs）
  contentType:  text('content_type'),
  confidence:   real('confidence'),
  isIndieMaker: integer('is_indie_maker', { mode: 'boolean' }),
  inferredProductName:    text('inferred_product_name'),
  inferredProductUrl:     text('inferred_product_url'),
  inferredProductOneLiner:text('inferred_product_one_liner'),
  inferredProductStage:   text('inferred_product_stage'),
  inferredMakerName:      text('inferred_maker_name'),
  keyMetrics:   text('key_metrics', { mode: 'json' }).$type<string[]>(),
  topics:       text('topics', { mode: 'json' }).$type<string[]>(),
  contentDepth: text('content_depth'),
  hasPersonalStory:    integer('has_personal_story', { mode: 'boolean' }),
  hasSpecificNumbers:  integer('has_specific_numbers', { mode: 'boolean' }),
  hasGenuineInsight:   integer('has_genuine_insight', { mode: 'boolean' }),
  editorialRec: text('editorial_rec'),
  recReason:    text('rec_reason'),
  editorialSummary:   text('editorial_summary'),
  collectionAngle:    text('collection_angle'),
  concerns:     text('concerns', { mode: 'json' }).$type<string[]>(),
  media:        text('media'),
  mediaSource:  text('media_source'),
  currentInferenceRunId: text('current_inference_run_id'),
  llmProcessedAt: integer('llm_processed_at', { mode: 'timestamp' }),

  // 编辑层
  reviewStatus:  text('review_status').default('pending').notNull(),
  publishStatus: text('publish_status').default('unpublished').notNull(),
  entityStatus:  text('entity_status').default('active').notNull(),
  trustLevel:    text('trust_level').default('scraped').notNull(),
  reviewedAt:    integer('reviewed_at', { mode: 'timestamp' }),
  reviewedBy:    text('reviewed_by'),
  publishedAtEditorial: integer('published_at_editorial', { mode: 'timestamp' }),
  editorNotes:   text('editor_notes'),
  editorTags:    text('editor_tags', { mode: 'json' }).$type<string[]>(),
  overrideReason:text('override_reason'),
  archiveReason: text('archive_reason'),

  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  uniqSource:     uniqueIndex('uq_ci_source').on(t.source, t.sourceId),
  idxReview:      index('idx_ci_review').on(t.reviewStatus),
  idxPublish:     index('idx_ci_publish').on(t.publishStatus),
  idxLlm:         index('idx_ci_llm').on(t.llmProcessedAt),
  idxPublishedAt: index('idx_ci_pub_at').on(t.publishedAt),
}))

// ── Inference Runs（推断历史，append-only）────────────────────────

export const inferenceRuns = sqliteTable('inference_runs', {
  id:            text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  promptVersion: text('prompt_version').notNull(),
  model:         text('model').notNull(),
  inputTokens:   integer('input_tokens'),
  outputTokens:  integer('output_tokens'),
  rawOutput:     text('raw_output', { mode: 'json' }),
  parsedOk:      integer('parsed_ok', { mode: 'boolean' }).notNull(),
  parseError:    text('parse_error'),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  idxItem: index('idx_ir_item').on(t.contentItemId),
}))

// ── Projects ────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id:           text('id').primaryKey(),
  slug:         text('slug').notNull().unique(),
  name:         text('name').notNull(),
  tagline:      text('tagline'),
  description:  text('description'),
  url:          text('url').notNull(),
  screenshot:   text('screenshot'),
  stage:        text('stage'),
  topics:       text('topics', { mode: 'json' }).$type<string[]>(),
  trustLevel:   text('trust_level').default('scraped').notNull(),
  entityStatus: text('entity_status').default('active').notNull(),
  reviewStatus: text('review_status').default('pending').notNull(),
  publishStatus:text('publish_status').default('unpublished').notNull(),
  publishedAtEditorial: integer('published_at_editorial', { mode: 'timestamp' }),
  isEditorsPick:   integer('is_editors_pick', { mode: 'boolean' }).default(false),
  featuredInsight: text('featured_insight'),
  vibes:           text('vibes', { mode: 'json' }).$type<string[]>(),
  editorNotes:     text('editor_notes'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  idxUrl:     index('idx_proj_url').on(t.url),
  idxPublish: index('idx_proj_publish').on(t.publishStatus),
}))

// ── Makers ──────────────────────────────────────────────────────

export const makers = sqliteTable('makers', {
  id:           text('id').primaryKey(),
  slug:         text('slug').notNull().unique(),
  name:         text('name').notNull(),
  bio:          text('bio'),
  avatar:       text('avatar'),
  jikeHandle:   text('jike_handle'),
  twitterHandle:text('twitter_handle'),
  githubHandle: text('github_handle'),
  wechatVerified: integer('wechat_verified', { mode: 'boolean' }).default(false),
  // 微信核实身份（通过微信沟通后标记）
  website:      text('website'),
  verified:     integer('verified', { mode: 'boolean' }).default(false),
  claimed:      integer('claimed', { mode: 'boolean' }).default(false),
  entityStatus: text('entity_status').default('active').notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ── Junction Tables ─────────────────────────────────────────────

export const contentProjectLinks = sqliteTable('content_project_links', {
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  projectId:     text('project_id').notNull()
                   .references(() => projects.id),
  linkType:      text('link_type').notNull(),
  // primary | mentioned | compared | related
  confidence:    real('confidence'),
  isPrimary:     integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_cp').on(t.contentItemId, t.projectId),
}))

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

export const projectMakerLinks = sqliteTable('project_maker_links', {
  projectId:  text('project_id').notNull().references(() => projects.id),
  makerId:    text('maker_id').notNull().references(() => makers.id),
  role:       text('role'),
  // founder | co_founder | contributor
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_pm').on(t.projectId, t.makerId),
}))

export const projectSources = sqliteTable('project_sources', {
  projectId:     text('project_id').notNull().references(() => projects.id),
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  sourceType:    text('source_type').notNull(),
  // primary_mention | update_post | related_post | native_submission | claim
  addedAt:       integer('added_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_ps').on(t.projectId, t.contentItemId),
}))

// ── Product Updates（产品时间线）────────────────────────────────

export const productUpdates = sqliteTable('product_updates', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id),
  makerId:     text('maker_id').references(() => makers.id),
  updateType:  text('update_type').notNull(),
  // revenue_milestone | user_milestone | feature_launch
  // | pivot | pause | acquired | shutdown
  body:        text('body').notNull(),     // maker 的原话，不改动
  metrics:     text('metrics', { mode: 'json' })
                 .$type<{ mrr?: string; users?: string; label?: string }>(),
  publishStatus: text('publish_status').default('published').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Submissions（原生提交暂存）──────────────────────────────────

export const submissions = sqliteTable('submissions', {
  id:           text('id').primaryKey(),
  type:         text('type').notNull(),
  // product_submit | post_write | quick_update | claim_request

  // 提交者（可能还没有完整 maker 账号）
  submitterEmail: text('submitter_email'),
  submitterName:  text('submitter_name'),
  makerId:        text('maker_id').references(() => makers.id),

  // 原始输入（maker 的原始声音，永远保留）
  rawInput:     text('raw_input', { mode: 'json' })
                  .$type<{ type: 'url' | 'text'; content: string }>(),

  // AI 处理结果（草稿）
  aiExtracted:  text('ai_extracted', { mode: 'json' }),
  // 预填充的所有结构化字段

  // Maker 确认/修改后的版本（override AI 的部分）
  makerOverrides: text('maker_overrides', { mode: 'json' }),

  // 关联（认领 / 更新已有内容）
  targetProjectId: text('target_project_id').references(() => projects.id),
  targetContentId: text('target_content_id').references(() => contentItems.id),

  // 状态
  status:       text('status').default('draft').notNull(),
  // draft | submitted | awaiting_confirm | confirmed | published | rejected
  rejectReason: text('reject_reason'),

  // 认领相关 — Path A（编辑邀请）
  claimInviteToken:  text('claim_invite_token'),
  // 编辑生成的邀请 token
  claimInviteExpiry: integer('claim_invite_expiry', { mode: 'timestamp' }),
  claimVerifiedAt:   integer('claim_verified_at', { mode: 'timestamp' }),
  claimVerifiedNote: text('claim_verified_note'),
  // 编辑备注：通过微信核实了身份

  // 认领相关 — Path B（自助申请）
  verifyMethod:     text('verify_method'),
  // domain_txt | github_file | jike_bio | email
  verifyToken:      text('verify_token'),
  // 系统生成，maker 填入 DNS TXT / 仓库文件 / 即刻 bio
  verifyCheckedAt:  integer('verify_checked_at', { mode: 'timestamp' }),
  verifyPassed:     integer('verify_passed', { mode: 'boolean' }),

  // 轻审核
  autoCheckPassed: integer('auto_check_passed', { mode: 'boolean' }),
  autoCheckNotes:  text('auto_check_notes', { mode: 'json' }),

  submittedAt:  integer('submitted_at', { mode: 'timestamp' }),
  publishedAt:  integer('published_at', { mode: 'timestamp' }),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  idxStatus:      index('idx_sub_status').on(t.status),
  idxMaker:       index('idx_sub_maker').on(t.makerId),
  idxToken:       index('idx_sub_token').on(t.claimInviteToken),
  idxVerifyToken: index('idx_sub_verify').on(t.verifyToken),
}))

// ── Maker Auth（轻量身份，magic link）──────────────────────────

export const makerAuth = sqliteTable('maker_auth', {
  id:            text('id').primaryKey(),
  makerId:       text('maker_id').notNull().references(() => makers.id),
  email:         text('email').notNull().unique(),
  magicLinkToken:  text('magic_link_token'),
  magicLinkExpiry: integer('magic_link_expiry', { mode: 'timestamp' }),
  lastLoginAt:   integer('last_login_at', { mode: 'timestamp' }),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Embeddings ──────────────────────────────────────────────────

export const embeddings = sqliteTable('embeddings', {
  entityType: text('entity_type').notNull(),
  // content_item | project | maker
  entityId:   text('entity_id').notNull(),
  embedding:  blob('embedding').notNull(),   // Float32Array，1536 维
  model:      text('model').notNull(),
  inputText:  text('input_text'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('pk_emb').on(t.entityType, t.entityId),
}))

// ── Dedup Candidates ────────────────────────────────────────────

export const dedupCandidates = sqliteTable('dedup_candidates', {
  id:              text('id').primaryKey(),
  itemAId:         text('item_a_id').notNull(),
  itemBId:         text('item_b_id').notNull(),
  detectionMethod: text('detection_method').notNull(),
  // url_match | name_match | embedding_similarity
  similarity:      real('similarity'),
  suggestedAction: text('suggested_action'),
  // merge | link_related | dismiss
  llmReasoning:    text('llm_reasoning'),
  status:          text('status').default('pending'),
  // pending | merged | dismissed | split
  resolvedBy:      text('resolved_by'),
  resolvedAt:      integer('resolved_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  uniqPair: uniqueIndex('uq_dd_pair').on(t.itemAId, t.itemBId),
}))

// ── Editorial Actions（append-only）────────────────────────────

export const editorialActions = sqliteTable('editorial_actions', {
  id:         text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId:   text('entity_id').notNull(),
  action:     text('action').notNull(),
  // approve | reject | publish | unpublish | feature | archive
  // edit_note | merge | split | withdraw | claim_approve | invite_sent
  prevState:  text('prev_state', { mode: 'json' }),
  newState:   text('new_state', { mode: 'json' }),
  actor:      text('actor').notNull(),
  notes:      text('notes'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Media Cache ─────────────────────────────────────────────────

export const mediaCache = sqliteTable('media_cache', {
  url:          text('url').primaryKey(),
  ogImage:      text('og_image'),
  ogTitle:      text('og_title'),
  ogDescription:text('og_description'),
  fetchedAt:    integer('fetched_at', { mode: 'timestamp' }).notNull(),
  valid:        integer('valid', { mode: 'boolean' }).notNull(),
  errorReason:  text('error_reason'),
})
```

---

## 六、爬取路径：Enrichment Agent

### 6.1 流程

```
新内容入 content_items（review_status=pending）
  ↓
Step 1：确定性噪声过滤（规则，不走 LLM）
  NOISE_RULES 命中（招聘/抽奖/转发等）
  → review_status=archived，archiveReason 记录触发规则
  ↓
Step 2：LLM Pass 1 — 分类 + 提取（Haiku，tool_use 模式）
  → inference_runs 新行 + content_items 快照更新
  ↓
Step 3：LLM Pass 2 — 编辑摘要（Sonnet，仅 rec=include/review）
  ↓
Step 4：向量化（text-embedding-3-small）
  → embeddings 表
  ↓
Step 5：去重候选检测
  Phase 1（deterministic）：inferredProductUrl → 查 projects.url
  Phase 2（embedding）：cos_sim > 0.90 → dedup_candidates（候选，不自动合并）
  ↓
Step 6：媒体富化（Microlink，异步，不阻塞）
  ↓
进入 Editorial Queue（按 editorial_rec 排序）：
  rec=include conf≥0.85  → 队列最前，深绿标记
  rec=include conf<0.85  → 正常位置，浅绿标记
  rec=review             → 正常位置，黄色标记
  rec=exclude            → 队列末尾，灰色，可折叠

⚠️ 所有内容编辑可见，include/exclude 只影响排序
⚠️ 只有确定性规则触发 archived，LLM 不做自动归档
```

### 6.2 LLM 调用（tool_use 强制 JSON 输出）

Pass 1 使用 Claude Haiku + tool_use 模式，完全避免 JSON 解析错误。Zod 验证所有输出字段。详见 `scripts/agents/enrich.ts`。

### 6.3 去重两阶段

**Phase 1（Deterministic blocking）**：URL 精确匹配 → 高置信候选，写 `dedup_candidates`。

**Phase 2（Embedding candidates）**：`cos_sim > 0.90` → 候选对写入，**不自动合并**。同赛道不同产品的相似度可能同样很高，必须由编辑确认后才执行 merge，且 merge 操作可回退（split action）。

---

## 七、原生路径：AI Intake 引擎

### 7.1 三种输入场景

**场景 A：提交产品**

```
Step 1：Maker 粘贴产品 URL
  AI 做：
    ① Jina Reader 抓取 landing page 内容
    ② Microlink 获取 OG image / title / description
    ③ URL 去重检查（命中 → 引导认领流，见第八章）
    ④ 预填充：名称、tagline、截图、topics、stage

Step 2：Maker 写一段话（唯一真正的必填项）
  提示语不是"产品描述"，而是：
  「你为什么做这个？花了多久？现在到了哪一步？」
  100-500 字，自由写，没有格式要求
  
  AI 做：
    ① 从故事里提取：stage、key_metrics、topics、vibes
    ② 生成 featured_insight（编辑精选候选）
    ③ 原文完整保留为 content_item（source=native）

Step 3：Maker 确认 AI 提取的结构化字段
  可以修改任何字段
  每处修改记录在 makerOverrides（训练信号）

写入：
  submissions（status=confirmed）
  → 轻审核通过
  → projects（trust_level=native_submitted）+ content_items（source=native）
```

**场景 B：写经验帖**

```
入口：「你想分享什么？」（不是"发布文章"按钮）

Maker 自由输入（文字或粘贴已写好的内容）：
  AI 实时提示：
    ① 识别内容类型
    ② 询问补充关键信息：
       「你提到了 200 个用户，是付费用户吗？」
    ③ 自动生成标题候选（3 个，可选）
    ④ 提取并高亮关键指标（可选择是否公开）
    ⑤ 关联到已有产品（「这是关于 ColaMD 的帖子吗？」）
    ⑥ 推荐 topics

Maker 看到预览，确认后提交
写入：submissions → content_items（source=native，trust_level=native_submitted）
原文绝对不改动，AI 结构化信息存在推断层
```

**场景 C：产品快速更新**

```
入口：产品详情页的「发布更新」按钮（仅 maker_verified 可见）

Maker 选择更新类型 + 写几句话：
  收入里程碑 → 「刚突破 $3k MRR，主要来自...」
  用户里程碑 → 「500 付费用户了，感谢早鸟们」
  功能上线   → 「新增了 XXX 功能，终于解决了...」

AI 自动：
  ① 更新 project.stage（如 launched → revenue）
  ② 更新 project metrics（如有具体数字）
  ③ 生成 product_updates 记录，关联到产品时间线

产品页显示完整的时间线，冷启动爬取数据和后续原生更新都在其中
```

### 7.2 Intake Agent 实现

```typescript
// src/api/intake/route.ts（Next.js API Route）

export async function POST(req: Request) {
  const { type, rawInput, submissionId } = await req.json()

  switch (type) {
    case 'analyze_url': {
      // Step 1：URL 分析
      const [pageContent, ogData, dedupResult] = await Promise.all([
        fetchWithJina(rawInput.url),
        fetchWithMicrolink(rawInput.url),
        checkUrlDedup(rawInput.url),
      ])

      if (dedupResult.found) {
        // 命中已有产品 → 返回认领引导
        return Response.json({
          action: 'redirect_to_claim',
          projectSlug: dedupResult.project.slug,
          existingData: dedupResult.project,
        })
      }

      const extracted = await llmExtractFromPage({
        url: rawInput.url,
        pageContent,
        ogData,
        model: 'claude-sonnet-4-6',  // Intake 用 Sonnet，给 maker 看的内容质量要高
      })

      return Response.json({ action: 'prefill', extracted })
    }

    case 'analyze_story': {
      // Step 2：故事分析
      const analysis = await llmAnalyzeStory({
        story: rawInput.text,
        existingData: rawInput.prefilled,
        model: 'claude-sonnet-4-6',
      })
      return Response.json({ analysis })
    }

    case 'confirm_submission': {
      // Step 3：Maker 确认，写入 submissions
      await db.insert(submissions).values({
        id: uuid(),
        type: 'product_submit',
        rawInput,
        aiExtracted: rawInput.prefilled,
        makerOverrides: rawInput.overrides,
        status: 'confirmed',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })

      // 触发轻审核（异步）
      triggerLightReview(submissionId)

      return Response.json({ success: true })
    }
  }
}
```

### 7.3 Trust Level 与审核门槛对应

```
trust_level=scraped
  → 完整审核流（Enrichment Agent + 编辑手动 approve + 编辑手动 publish）
  → 双重门槛

trust_level=native_submitted（Maker 主动提交）
  → 轻审核（AI 自动质量检查：URL 可访问、内容非空、非垃圾）
  → 通过 → 自动 review_status=approved + publish_status=published
  → 问题 → 进编辑 review queue（优先级高于爬取内容）
  → 在 feed 中有「Maker 直接提交」标记

trust_level=maker_verified（完成认领）
  → 零审核，直接发布
  → 产品快速更新（场景 C）也是零审核，实时更新
  → 可以直接修改产品页所有字段
  → 在 feed 中有「已认领」标记

轻审核的自动检查项：
  ① URL 可以正常访问（HTTP 200）
  ② body 长度 > 50 字符
  ③ 不含明确垃圾信号（同确定性规则）
  ④ LLM 快速判断：is_indie_maker_content = true
```

---

## 八、认领流

认领有两条路径，互为补充：

- **Path A（主路径）** — 编辑主动识别 → 即刻/Twitter DM → 微信 → 发邀请链接 → Maker 完成。信任度最高，但需编辑投入沟通时间。适合重点高价值产品。
- **Path B（长尾路径）** — Maker 自己发现产品已被收录 → 自助申请认领 → 技术验证（DNS / GitHub / 即刻 bio）→ 编辑 10 秒轻审批。可规模化，覆盖编辑来不及主动触达的长尾。

> **国内平台约束**：即刻、V2EX、Linux.do 均不暴露用户邮箱，WeChat 是唯一可靠的人工沟通渠道。所以 Path B 的"验证"走技术手段，而非邮件——邮箱只作为 maker 自愿提供的兜底选项。

### 8.1 Path A：编辑主动触达（全流程）

认领不是技术自助流程，是编辑主导的社区建设动作。

```
Phase A：编辑识别目标 Maker（在 /admin）

编辑浏览 feed 里的爬取产品，发现一个有价值的产品，
想把 maker 引入平台。

/admin 产品详情页有「发送认领邀请」按钮：
  → 生成一个认领链接：
    https://solobase.co/claim/[project-slug]?invite=[token]
  → token：7天有效，单次使用，存入 submissions.claimInviteToken
  → 同时在 editorial_actions 记录：action=invite_sent，
    notes="通过即刻/微信发送给 [maker 名]"
  → 编辑复制这个链接


Phase B：编辑主动触达（即刻/Twitter → 微信）

编辑在即刻或 Twitter 上给 maker 发私信：
  「你好，我是 Solobase 的编辑，我们收录了你的 [产品名]，
   想邀请你来认领并完善产品信息，也方便之后直接在平台发更新。
   [认领链接]」

对话进微信后，可以更自然地介绍平台，解答疑问，
发送链接时 maker 已经有足够上下文，不会觉得是陌生链接。


Phase C：Maker 点击认领链接

访问：https://solobase.co/claim/[project-slug]?invite=[token]

页面展示：
  ┌─────────────────────────────────────────────────────┐
  │  你好！我们在即刻发现了你的产品                      │
  │                                                     │
  │  [产品截图]  ColaMD - 极简 Markdown 编辑器          │
  │  来源：@你的即刻账号 · 2026年3月 · 89赞             │
  │                                                     │
  │  我们收录了以下信息（来自即刻帖子）：               │
  │  • 极简 Markdown 编辑器，支持实时预览               │
  │  • 作者：你                                         │
  │  • 阶段：已上线                                     │
  │                                                     │
  │  这些信息准确吗？认领后你可以：                     │
  │  • 直接编辑和更新产品信息                           │
  │  • 发布里程碑更新（用户数/MRR/新功能）              │
  │  • 与社区分享你的开发故事                           │
  │                                                     │
  │  [开始认领 →]                                       │
  └─────────────────────────────────────────────────────┘


Phase D：Maker 完成认领（3步）

Step 1：输入邮箱（发 magic link，不需要密码）
Step 2：填写/修正产品信息
  • 确认或修改 AI 提取的字段
  • 可以补充：真实截图、完整描述、产品 URL（如有变化）
  • 最重要：「写一段你做这个产品的故事」（可选但强烈建议）
Step 3：完成

完成后：
  submissions.status = confirmed
  submissions.claimVerifiedAt = now()
  submissions.claimVerifiedNote = "编辑通过即刻/微信核实身份"（编辑手动填写）
  → projects.trustLevel = maker_verified
  → makers.claimed = true
  → makers.wechatVerified = true（编辑手动标记）
  → 原 scraped content_items 降级为 source_ref（project_sources.sourceType = claim）
  → Maker 收到 magic link 邮件，可以后续登录管理

编辑收到飞书通知："[产品名] 认领完成 ✓，maker: [姓名]"
编辑在 /admin 标记 claim 已完成并填写核实备注
```

### 8.2 认领链接的实现

```typescript
// src/app/claim/[slug]/page.tsx

export default async function ClaimPage({
  params, searchParams
}: {
  params: { slug: string }
  searchParams: { invite?: string }
}) {
  const { slug } = params
  const token = searchParams.invite

  // 验证 token
  if (!token) return redirect('/404')
  const submission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.claimInviteToken, token),
      gt(submissions.claimInviteExpiry, new Date()),
    )
  })
  if (!submission) return <TokenExpiredPage />

  // 加载产品现有数据（来自爬取）
  const project = await db.query.projects.findFirst({
    where: eq(projects.slug, slug)
  })

  return <ClaimFlow project={project} token={token} />
}
```

```typescript
// src/app/api/claim/complete/route.ts

export async function POST(req: Request) {
  const { token, email, overrides } = await req.json()

  // 验证 token
  const sub = await validateToken(token)
  if (!sub) return Response.json({ error: 'invalid_token' }, { status: 400 })

  // 发送 magic link
  await sendMagicLink(email, sub.targetProjectId)

  // 更新 submission
  await db.update(submissions)
    .set({
      submitterEmail: email,
      makerOverrides: overrides,
      status: 'confirmed',
      claimVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(submissions.claimInviteToken, token))

  // 创建/关联 maker 账号
  const maker = await upsertMaker({
    name: overrides.makerName,
    email,
    projectId: sub.targetProjectId,
  })

  // 升级 trust level
  await db.update(projects)
    .set({
      trustLevel: 'maker_verified',
      updatedAt: new Date(),
    })
    .where(eq(projects.id, sub.targetProjectId!))

  // 记录 editorial action
  await db.insert(editorialActions).values({
    id: uuid(),
    entityType: 'project',
    entityId: sub.targetProjectId!,
    action: 'claim_approve',
    actor: 'system',
    notes: `maker ${email} completed claim via invite token`,
    createdAt: new Date(),
  })

  // 通知编辑（飞书）
  await notifyFeishu(`✅ 认领完成：${sub.targetProjectId}，maker: ${email}`)

  return Response.json({ success: true })
}
```

### 8.3 /admin 的认领管理

```
/admin/claims

列表：所有认领请求（Path A 邀请 + Path B 自助申请）+ 状态
  [产品名]  [类型]    [时间]  [状态]          [操作]
  ColaMD    Path A    3天前   ✅ 已完成        查看详情
  TypeNo    Path A    1天前   ⏳ 待响应        复制链接 / 作废
  比比怪    Path A    7天前   ⏳ 待响应        复制链接 / 作废 / 重新发送
  Inkflow   Path B    2天前   🔍 待轻审批      审批 / 拒绝
  Pomotodo  Path B    1天前   ⏳ 验证中(DNS)   查看进度

操作：
  Path A「发送新邀请」→ 输入 project slug → 生成链接
  Path A「标记核实」 → 编辑手动填写微信核实备注 → makers.wechatVerified = true
  Path B「轻审批」   → 确认 maker 身份和产品匹配 → trust_level 升级 maker_verified
```

### 8.4 Path B：Maker 自助申请认领

```
Maker 在产品详情页点击「这是我的作品，我要认领」

Step 1：填写申请信息
  • 选填：即刻 / Twitter / GitHub 用户名（和已收录作者信息对照）
  • 选择验证方式（按可信度排序，完成任意一种即可）：

  ① 域名 TXT 验证            可信度：⭐⭐⭐  操作难度：中
     适用：产品有自有域名
     操作：在域名 DNS 添加一条 TXT 记录
           solobase-verify=<token>
     校验：系统每 10 分钟自动查询，通过后实时更新状态
     说明：最可靠，独立开发者大多有自己的域名

  ② GitHub 仓库验证          可信度：⭐⭐⭐  操作难度：低
     适用：产品有 GitHub 仓库（开源或公开主页）
     操作：在仓库根目录添加 .solobase-verify 文件，内容为 token
     校验：系统请求 raw.githubusercontent.com/<user>/<repo>/... 验证

  ③ 即刻 bio 验证            可信度：⭐⭐    操作难度：低
     适用：没有域名也没有 GitHub 的早期产品
     操作：临时在即刻 bio 末尾添加 [sv:<token>]，保留 24 小时
     校验：系统抓取即刻公开 profile 页（无需 API key）验证
     说明：即刻 profile 是公开 HTML，可抓取

  ④ 邮箱验证（兜底）          可信度：⭐     操作难度：最低
     Maker 自填邮箱，收到 magic link 点击确认
     适用：前三种都不可行，或 maker 不熟悉技术操作

Step 2：验证通过后
  submissions.verifyPassed = true
  submissions.status = confirmed
  trust_level = native_submitted（不是 maker_verified，还需编辑轻审批）
  → 进入 /admin/claims 「待轻审批」队列
  → 编辑收到飞书提醒

Step 3：编辑轻审批（~1 分钟）
  看到：产品名 + 申请人的 Jike/GitHub profile + 验证方式 ✓
  核实：这个人的公开 profile 确实和产品匹配
  → 点击「确认认领」
  → trust_level 升级为 maker_verified（同 Path A 最终结果）
  → Maker 收到邮件通知，可登录管理产品
```

**Path B 的设计原则：**

- 验证方式选域名/GitHub 时，系统可以**自动轮询**，不需要 maker 等人工回复
- 验证 ≠ 信任升级。系统只负责技术层面的「确实控制这个域名/仓库/账号」，maker 身份和产品的匹配关系仍由编辑确认
- 即使编辑没时间做轻审批，`native_submitted` 级别的 trust 已允许 maker 补充产品信息，不会卡住他们

**后端验证逻辑草图：**

```typescript
// scripts/agents/verify-claim.ts
// 定时任务，每 10 分钟运行，检查所有 verifyPassed=false 的 claim_request

async function checkPendingVerifications() {
  const pending = await db.query.submissions.findMany({
    where: and(
      eq(submissions.type, 'claim_request'),
      eq(submissions.verifyPassed, false),
      isNotNull(submissions.verifyToken),
    )
  })

  for (const sub of pending) {
    let passed = false

    switch (sub.verifyMethod) {
      case 'domain_txt': {
        const records = await resolveTxt(getDomain(sub.targetProjectId!))
        passed = records.flat().includes(`solobase-verify=${sub.verifyToken}`)
        break
      }
      case 'github_file': {
        const url = `https://raw.githubusercontent.com/${sub.githubRepo}/main/.solobase-verify`
        const text = await fetchText(url).catch(() => '')
        passed = text.trim() === sub.verifyToken
        break
      }
      case 'jike_bio': {
        const profile = await fetchJikeProfile(sub.jikeHandle!)
        passed = profile.bio?.includes(`[sv:${sub.verifyToken}]`) ?? false
        break
      }
    }

    if (passed) {
      await db.update(submissions).set({
        verifyPassed: true,
        verifyCheckedAt: new Date(),
        status: 'confirmed',
        updatedAt: new Date(),
      }).where(eq(submissions.id, sub.id))

      // 更新 trust_level + 通知编辑
      await db.update(projects).set({ trustLevel: 'native_submitted' })
        .where(eq(projects.id, sub.targetProjectId!))
      await notifyFeishu(`🔍 待审批认领：${sub.targetProjectId}，验证方式：${sub.verifyMethod} ✓`)
    }
  }
}
```

---

## 九、Editorial Interface

### 9.1 队列优先级排序

```
Editorial Queue 排序（从上到下）：

① [深绿] native_submitted / maker_verified 内容（最高优先级）
   Trust level 高，审核门槛低，优先处理

② [深绿] rec=include + conf≥0.85（爬取，AI 强推）
③ [浅绿] rec=include + conf<0.85
④ [黄色] rec=review
⑤ [灰色] rec=exclude（可折叠，但始终可见）

⚠️ 没有内容因置信度被静默归档
⚠️ 第⑤类可以被通过，override_reason 字段记录原因
```

### 9.2 飞书 Interactive Card Bot

每日 07:00 发送日报 + 卡片批次：

```
Solobase 内容日报 · 4月12日

今日处理
  爬取新内容：47 条  规则归档：7 条  进审核队列：40 条
  原生提交：2 条（优先处理）
  新增认领完成：1 个（ColaMD · maker: 某某）

待你处理（约 15 分钟）：
  原生提交 [2] → AI 推荐 include [12] → 待判断 [19] → 排除候选 [9]
  去重候选待确认：3 对

[展开今日卡片批次]
```

**卡片格式（原生提交卡片有特殊样式）：**

```
爬取内容卡片：
┌────────────────────────────────────────────┐
│ 🟢 product_launch · 即刻 · conf 0.91       │
│ ColaMD - 极简 Markdown 编辑器              │
│ AI：作者3周独立开发，强调设计感和极简…      │
│ 89赞 · 原帖链接                           │
├────────────────────────────────────────────┤
│  [✓ 收录发布]  [✓ 收录不发布]  [✗ 跳过]  │
└────────────────────────────────────────────┘

原生提交卡片（有「Maker 直接提交」标记）：
┌────────────────────────────────────────────┐
│ ⭐ 原生提交 · native_submitted             │
│ ColaMD - 极简 Markdown 编辑器              │
│ Maker 写道：「用了 3 周做的，主要是觉得    │
│ 现有 Markdown 编辑器都太重了…」            │
│ 产品链接：colamd.com · 截图已获取          │
├────────────────────────────────────────────┤
│  [✓ 自动通过发布]  [✗ 拒绝]  [→ 详情]    │
└────────────────────────────────────────────┘
```

### 9.3 Next.js /admin（中期，1-2 天）

- 路由：`/admin`，环境变量密码保护
- 主界面：Inbox 风格 + 键盘流（j/k y u n e）
- 认领管理：`/admin/claims`（见第八章）
- 去重确认：`/admin/dedup`（dedup_candidates 列表，merge/dismiss 操作）
- 可观测面板：本周 metrics 摘要

---

## 十、Build Layer

```typescript
// 产品入 feed 条件
const publishedProjects = await db.query.projects.findMany({
  where: and(
    eq(projects.publishStatus, 'published'),
    eq(projects.entityStatus, 'active'),
  ),
  // 排序用 publishedAtEditorial，不用 updatedAt
  // 防止补图/修字段触发 feed 重排
  orderBy: [desc(projects.publishedAtEditorial)],
})

// 帖子入 feed 条件
const publishedPosts = await db.query.contentItems.findMany({
  where: and(
    eq(contentItems.publishStatus, 'published'),
    eq(contentItems.entityStatus, 'active'),
    inArray(contentItems.contentType, [...WORTHY_POST_TYPES]),
  ),
  orderBy: [desc(contentItems.publishedAtEditorial)],
  limit: Math.max(Math.floor(publishedProjects.length / 3), 10),
})
```

**无图产品**：screenshot=null 不影响发布，前端用 TextProjectCard。

**Publisher Agent**：editorial/publish status 变更时事件触发，增量更新 feed.json，不全量重跑。

---

## 十一、Agent 调度

```
Crawler Agents（每 12-24h）
  → jike · v2ex · linuxdo（ph 每周一次）

Enrichment Agent（crawl 结束后触发）
  → 确定性噪声过滤 → LLM 分类 → 向量化 → 去重 → 媒体富化

Editorial Digest Agent（每天 07:00 北京时间）
  → 爬取内容日报 + 卡片批次
  → 原生提交提醒（如有）
  → 认领完成通知（如有）
  → 去重候选汇总

Publisher Agent（status 变更时触发）
  → 增量 build feed.json → ISR 重建 → 飞书确认

Weekly Review Agent（每周一 09:00）
  → WeeklyMetrics 计算 → 飞书周报
  → override_rate > 25% 时附带 prompt 优化建议
```

**Claude Code CronCreate 配置：**

```
0 22 * * *    npm run pipeline:daily        # 爬取 + 处理
0 23 * * *    npm run agents:digest         # 编辑日报
0  1 * * 1    npm run agents:weekly-review  # 周报
```

---

## 十二、可观测指标

```typescript
interface WeeklyMetrics {
  // 入库
  ingested_total: number
  ingested_by_source: Record<string, number>
  native_submissions: number          // 原生提交数
  claims_completed: number            // 认领完成数
  claims_pending: number              // 发出邀请但未响应

  // 过滤漏斗
  archived_by_rule: number
  archive_rule_breakdown: Record<string, number>
  queue_total: number
  queue_backlog: number

  // 编辑效率
  reviewed_count: number
  approved_rate: number
  avg_time_to_review_hours: number    // 从入队到审核完成的平均时长

  // AI 准确性（prompt 优化核心信号）
  override_rate: number               // AI 推 exclude，你通过的比率
  false_positive_rate: number         // AI 推 include，你拒绝的比率
  override_by_type: Record<string, number>

  // 去重健康
  dedup_pending: number
  dedup_merged: number
  dedup_split: number                 // 越高说明误合并越多

  // Feed 健康
  feed_projects: number
  feed_posts: number
  feed_by_source: Record<string, number>
  feed_trust_level_dist: Record<string, number>  // scraped vs verified 占比
  feed_changes: number                // 本周 feed 变更次数（稳定性指标）
}
```

---

## 十三、MCP Server（数据质量稳定后）

让任何集成 MCP 的 AI 工具都能查询 Solobase 的结构化知识。

```typescript
const tools = {
  search_projects:  '语义搜索独立开发者产品',
  search_content:   '搜索高价值内容（经验帖/复盘/教程）',
  get_maker:        '获取 maker 档案和产品列表',
  get_related:      '获取与某产品相关的内容',
  get_trending:     '最近涌现的热点主题',
  get_recent:       '最近收录的产品和内容',
}
// 基于 @modelcontextprotocol/sdk
// 向量搜索：sqlite-vec cosine similarity
// 初期作为本地工具供 Claude Desktop/Claude Code 调用
```

---

## 十四、实施路线图

### Phase 0：止血（1-2 天）

- [ ] 修 V2EX/Linux.do media 字段（图片 URL 分离）
- [ ] 修 build-feed：无图产品用 TextProjectCard
- [ ] 飞书双向同步：审核状态写回 editorial 字段

**预期：网站产品数 129 → 350+**

### Phase 1：数据库迁移（3-5 天）

- [ ] Turso 初始化 + Drizzle schema（含幂等约束、junction tables、inference_runs）
- [ ] 迁移脚本：pipeline_output.json → Turso（upsert 语义）
- [ ] build-feed.ts 从 DB 读，用 publish_status 过滤

### Phase 2：LLM 处理层（3-5 天）

- [ ] `scripts/config/ai.ts`（one-api 配置）
- [ ] `scripts/agents/enrich.ts`（Pass 1 + Pass 2，tool_use + Zod）
- [ ] 冷启动全量处理（4188 条，~¥80）
- [ ] 基础去重检测（url_match + embedding 候选）

### Phase 3：Editorial Workflow（3-5 天）

- [ ] 飞书 Interactive Card Bot（三态按钮：收录发布/收录不发布/跳过）
- [ ] Publisher Agent（状态变更触发增量 build）
- [ ] Editorial Digest Agent

### Phase 4：原生输入层（1 周）

- [ ] `/submit` 路由：产品提交流（URL + 故事，AI 预填充）
- [ ] `/submit/post` 路由：经验帖写作（AI 协作写作体验）
- [ ] AI Intake Engine（`src/api/intake/route.ts`）
- [ ] 轻审核逻辑（native_submitted 自动发布）
- [ ] Submissions + MakerAuth schema 上线

### Phase 5：认领流（3-5 天）

Path A（编辑邀请）：
- [ ] `/admin/claims`：编辑认领管理界面（生成链接、状态追踪）
- [ ] `/claim/[slug]?invite=[token]` 路由：编辑邀请认领页面
- [ ] Magic link 邮件发送
- [ ] `wechatVerified` 手动标记功能
- [ ] 认领完成后 trust_level 升级至 `maker_verified`

Path B（自助申请，可与 Path A 并行开发）：
- [ ] `/claim/[slug]`（无 invite token）：展示自助申请表单
- [ ] 域名 TXT / GitHub 文件 / 即刻 bio 三种验证实现
- [ ] `scripts/agents/verify-claim.ts`：定时轮询未通过验证的 claim
- [ ] /admin/claims 增加「待轻审批」列：展示 Path B 自助认领
- [ ] 编辑轻审批：一键升级 `native_submitted → maker_verified`

### Phase 6：可观测 + 自动化（1 周）

- [ ] WeeklyMetrics 实现
- [ ] Weekly Review Agent
- [ ] Claude Code CronCreate 三个 cron job
- [ ] Next.js /admin（键盘流 + 指标面板 + 认领管理 + 去重确认）

### Phase 7：产品快速更新（Phase 5 后）

- [ ] 产品详情页「发布更新」入口（maker_verified 可见）
- [ ] ProductUpdates 时间线展示
- [ ] 快速更新自动更新 project.stage 和 metrics

### Phase 8：向量富化（数据量稳定后）

- [ ] 全量 embedding 生成
- [ ] LLM 实体判断（embedding 候选 → merge/split 建议）
- [ ] 基于编辑精选向量的 AI 推荐排序

### Phase 9：MCP Server

### Phase 10：原生数据主导（长期）

爬取数据降级为发现机制，主体内容转向 maker 直接贡献。

---

## 附录 A：各 Phase KPI

| Phase | 完成标志 |
|-------|---------|
| 0 | 网站产品数 > 300，V2EX/Linux.do 有产品入选 |
| 1 | 所有数据在 Turso，`(source, source_id)` 唯一约束验证通过 |
| 2 | inferred_type 覆盖率 100%，override_rate 可计算 |
| 3 | 飞书卡片驱动日常审核，editorial 决策写回 DB |
| 4 | 第一个 maker 通过 /submit 提交产品并成功发布 |
| 5 | 第一个认领完成，trust_level=maker_verified |
| 6 | override_rate 稳定 10-25%，每周收到 metrics 报告 |
| 7 | 有 maker 发布了产品快速更新 |
| 8 | 去重误合并率 < 5% |
| 9 | Claude 能用 Solobase 数据回答中文独立开发者相关问题 |

## 附录 B：明确不做的事（Phase 0-6 期间）

- 不加新爬取源（先把质量提上去）
- 不做前台 UI 大改版
- 不做用户注册/登录（只做 maker magic link）
- 不做评论/社区功能
- 不做向量搜索的前台入口
- 不引入 Postgres（Turso 够用）
- 不做 n8n 工作流
- 不用 LLM 置信度做自动归档（只用确定性规则）
- 认领不做技术自助验证（邮件/Twitter OAuth），坚持编辑人工触达 + 微信核实

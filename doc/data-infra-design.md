# Solobase 数据基础设施设计

> 类型：权威设计文档（supersedes `pipeline-redesign.md`）
> 版本：v4（2026-04-13，新增：独立作品收录口径、媒体富化三级策略、URL 生命周期健康检测）
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

### 1.5 收录范围：独立「作品」而非独立「产品」

平台早期设想以"能独立运行的产品"为核心，实践中发现独立开发者的产出形态远比这丰富：VS Code 插件、Figma 插件、Raycast 扩展、Obsidian 插件、主题包、CLI 工具、npm 库、字体……这些同样是创造力的体现，有真实用户价值，且大量优秀的中文独立开发者正在这些生态中活跃。

**收录口径更新为：任何由独立创作者制作、对使用者有真实价值的数字作品。**

不同类型的作品在数据层用 `content_type` 区分，展示层根据类型渲染不同的关键信息：

| 作品类型 | 关键展示字段 | 用户决策核心 |
|---------|------------|------------|
| 独立 SaaS / Web App | 定价、核心功能、用户规模 | 能解决我的问题吗 |
| 移动 App | App Store 评分/下载量、平台 | iOS / Android？ |
| 插件 / 扩展 | 宿主平台（VS Code / Figma / Raycast）、安装量 | 我在用这个平台吗 |
| 开源工具 / CLI | GitHub Stars、维护状态 | 项目还活着吗 |
| 模板 / 主题 | 预览图、适用框架/平台 | 好看吗？适合我吗 |
| 字体 / 设计资源 | 授权协议、预览字形 | 商业可用吗 |

Schema 层 `inferred_product_stage` 已覆盖全生命周期，`topics` 已支持 `plugin / cli / open-source / design-resource` 等标签，无需额外迁移。

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
| **向量存储** | sqlite-vec（Phase 8 再决定）| Phase 1-7 不需要；届时验证 Turso 对 sqlite-vec 的支持状态 |
| **ORM** | Drizzle ORM | TypeScript 原生，类型安全 |
| **Embedding** | `text-embedding-3-small`（OpenAI via one-api）| $0.02/1M tokens |
| **分类 LLM** | Claude Haiku（via one-api）| 批量处理 |
| **摘要/Intake LLM** | Claude Sonnet（via one-api）| 给人看的内容用更好的模型 |
| **媒体富化** | Microlink API | OG image + metadata，免费 500 req/月 |
| **页面内容提取** | Jina Reader（r.jina.ai）| 免费，URL → clean markdown；中文页面/需登录页面成功率有限 |
| **本地调度** | macOS launchd（plist）| 替代 crontab，Mac 上更稳定，开机自动启动 |
| **云端调度** | Vercel Cron Jobs | Next.js 原生支持，用于定时触发 API route |
| **审核 UI（短期）** | 飞书 Interactive Card Bot | 手机可操作；Bot callback 需要 Vercel 已部署的公开 HTTPS 端点 |
| **审核 UI（中期）** | Next.js /admin | 同 repo，共享 DB，键盘流 |
| **认领链接** | Next.js /claim/[slug] | token 参数，无需独立服务 |
| **Maker Auth** | Magic Link（邮件）| 最轻量，无密码 |
| **MCP Server** | @modelcontextprotocol/sdk | 未来知识 API |

> **Turso 写入策略**：pipeline 在本地 Mac 批量运行，**不逐行实时写 Turso**（网络延迟不可接受）。正确模式：pipeline 写本地 SQLite → 批处理完成后一次性同步到 Turso（`turso db sync` 或迁移脚本）。网站从 Turso 读。原始 JSON 文件（`data/raw/`）永久保留作灾难恢复基线。

**成本估算（推导过程）：**

冷启动全量（4188 条）：
- Pass 1 Haiku：4188 × (800 in + 200 out) tokens → ~3.4M in ($0.85) + ~0.84M out ($1.05) ≈ **¥14**
- Pass 2 Sonnet（约 30% 入选 rec=include，~1256 条）：× (1500 in + 400 out) tokens → ~1.9M in ($5.65) + ~0.5M out ($7.55) ≈ **¥96**
- Embedding：4188 × 300 tokens → 1.26M tokens × $0.02/1M ≈ **¥0.2**
- **冷启动合计：~¥110（含 one-api 中转溢价，按实际价格可能 ¥80-130）**

| 项目 | 场景 | 成本 |
|------|------|------|
| 冷启动全量 LLM 处理 | 4188 条（推导见上）| ~¥110 一次性 |
| 日常爬取处理 | ~100 条/天 | ~¥3-5/天 |
| 原生提交 Intake | ~10 条/天（早期）| ~¥0.5/天 |
| Turso | 500MB + 1B rows/月 | 免费（Embedding 占大头：1536 floats×4B×10万条≈600MB，逼近限额） |
| Microlink | 500 req/月免费 | 初期免费；超出后 $9/月 |

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
  unreachable → URL 健康检测连续失败（≥3 次），前台降级展示，不下架
  deprecated  → 内容/产品已过期，降低权重
  withdrawn   → 作者要求删除，立即从前台移除
```

> **`unreachable` 不等于下架**：独立产品生命周期短，URL 失效是常态而非异常。失效产品仍有历史价值（曾经的创造、技术选择、maker 故事）。前台显示「暂时无法访问 · 最后活跃于 xx」，不从 feed 移除。只有 maker 主动要求（`withdrawn`）或编辑明确判断已无参考价值（`deprecated`）才影响展示权重。

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
  urlNormalized:text('url_normalized'),  // normalizeUrl(url)，用于 deterministic 去重
  urlStatus:    text('url_status').default('unknown'),
  // unknown | live | unreachable | dead
  // live：最近一次 HEAD 请求返回 2xx/3xx
  // unreachable：连续 ≥3 次失败（rate limit / timeout / 4xx/5xx），不一定永久死亡
  // dead：≥30天 unreachable 且 Wayback Machine 也无近期存档
  urlLastChecked: integer('url_last_checked', { mode: 'timestamp' }),
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
  idxUrlNorm: index('idx_proj_url_norm').on(t.urlNormalized),
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
  claimPath:    text('claim_path'),
  // null（非认领）| 'editor_invite'（Path A）| 'self_service'（Path B）
  // 不依赖"是否有 claimInviteToken"来区分路径，显式字段更安全

  // 提交者（可能还没有完整 maker 账号）
  submitterEmail: text('submitter_email'),
  submitterName:  text('submitter_name'),
  makerId:        text('maker_id').references(() => makers.id),

  // 原始输入（maker 的原始声音，永远保留）
  // claim_request 类型额外携带 verificationData，避免 verify-claim.ts 用 as any 读取
  rawInput:     text('raw_input', { mode: 'json' })
                  .$type<
                    | { type: 'url';  content: string }
                    | { type: 'text'; content: string }
                    | { type: 'claim_request'; content: string; verificationData: {
                        githubRepo?: string   // "owner/repo"，用于 github_file 验证
                        jikeHandle?: string   // 即刻用户 ID，用于 jike_bio 验证
                      }}
                  >(),

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
Step 6：媒体富化（异步，不阻塞主流程）
  策略：三级优先级，逐级降级，不需要每条都成功
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

### 6.3 媒体富化策略

**冷启动阶段前台必须有可用的展示图**，但没有稳定的第一手图片来源——这是所有内容聚合平台的共同困境。Solobase 采用三级优先级策略，确保绝大多数内容有图可展示：

```
优先级 1：帖子原图（media_raw）  ← 已有，质量最高
  ↓ 来源：爬取时保留的社媒帖子图片列表
  ↓ 特点：maker 精心挑选，往往是产品最佳截图
  ↓ 处理：取 media_raw[0]（第一张图），存入 content_items.media
  ↓ 覆盖率：即刻帖子 ~60%、Linux.do ~40%、V2EX ~20% 有配图

优先级 2：OG Image 抓取  ← 最轻量，一个 HTTP 请求
  ↓ 来源：产品官网/GitHub/App Store 的 og:image meta 标签
  ↓ 特点：产品方自己设计的宣传图，质量有保障
  ↓ 处理：HEAD + fetch，提取 <meta property="og:image"> 内容
  ↓ 存储：media_cache 表（url + ogImage + ogTitle + ogDescription）
  ↓ 覆盖率：有网站的产品 ~80% 有 OG image
  ↓ 成本：零（普通 HTTP 请求，不需要第三方服务）

优先级 3：截图服务（Microlink / Playwright）  ← 最后兜底
  ↓ 来源：对产品 URL 做完整页面渲染截图
  ↓ 使用条件：前两级均无结果
  ↓ 成本：Microlink 免费额度 500 req/月，超出后 $9/月
  ↓ 冷却：同一 URL 失败后 7 天不重试（media_cache.errorReason）

无图兜底：TextCard
  ↓ 展示：产品名 + tagline + topics 标签，文字排版风格
  ↓ 不影响发布资格（screenshot=null 不是 blockers）
```

**媒体富化脚本**（独立于 Enrichment Agent，可单独重跑）：

```typescript
// scripts/agents/enrich-media.ts
// 对所有 media IS NULL 且 llmProcessedAt IS NOT NULL 的记录补图
// 运行：npx tsx scripts/agents/enrich-media.ts

async function enrichMedia(item: ContentItem) {
  // Step 1：帖子原图
  const rawMedia: string[] = JSON.parse(item.mediaRaw ?? '[]')
  if (rawMedia.length > 0) {
    await db.update(contentItems)
      .set({ media: rawMedia[0], mediaSource: 'post_image' })
      .where(eq(contentItems.id, item.id))
    return
  }

  // Step 2：OG Image
  const url = item.inferredProductUrl
  if (url) {
    const cached = await db.query.mediaCache.findFirst({
      where: eq(mediaCache.url, url)
    })
    const ogData = cached ?? await fetchOgImage(url)  // fetch + parse <meta>
    if (ogData?.ogImage) {
      await db.update(contentItems)
        .set({ media: ogData.ogImage, mediaSource: 'og_image' })
        .where(eq(contentItems.id, item.id))
      return
    }
  }

  // Step 3：截图服务（仅 editorial_rec=include 的内容值得花配额）
  if (item.editorialRec === 'include' && url) {
    const screenshot = await fetchMicrolinkScreenshot(url)
    if (screenshot) {
      await db.update(contentItems)
        .set({ media: screenshot, mediaSource: 'screenshot' })
        .where(eq(contentItems.id, item.id))
    }
  }
  // 否则保持 media=null，前端 TextCard 降级
}
```

### 6.4 容错与降级策略

LLM 调用失败不是边缘情况，是运行时常态。每一步都需要明确的失败处理：

```
LLM Pass 1 失败（rate limit / timeout / Zod 校验失败）：
  → 指数退避重试 3 次（1s → 2s → 4s）
  → 第 3 次仍失败：content_items.llmProcessedAt 置 null，记录 inference_runs.parsedOk=false
  → 不阻塞后续条目；该条目进入"待重处理"队列，下次 Enrichment Agent 运行时优先处理
  → 永远不丢弃：失败的条目仍在 review_status=pending，编辑可见

LLM Pass 2 失败（Sonnet，编辑摘要）：
  → 降级：跳过 Pass 2，用 Pass 1 输出的 recReason 代替
  → editorialSummary 置 null，卡片显示"AI 摘要不可用"
  → 不影响 editorial_rec 和队列排序

Microlink 媒体富化失败（超出 500 req/月免费额度）：
  → screenshot 置 null，前端用 TextProjectCard 降级渲染
  → 记录 mediaCache.errorReason，不反复请求同一 URL（设 7 天冷却期）

Jina Reader 失败（中文页面 / 需登录 / 超时）：
  → 降级：跳过 URL 内容提取，Pass 1 仅用 body + title 文本
  → Intake Engine 中：Jina 失败时 prefill 字段部分留空，让 maker 自己填写
  → 不向 maker 暴露技术错误，用"暂无法自动提取，请手动填写"提示

所有失败都写入 inference_runs：parsedOk=false，parseError 记录原因。
WeeklyMetrics 中 llm_error_rate 可追踪失败趋势。
```

### 6.4 去重两阶段

**Phase 1（Deterministic blocking）**：URL 规范化后精确匹配 → 高置信候选，写 `dedup_candidates`。

URL 比较前必须先规范化，否则 `http://colamd.com`、`https://www.colamd.com/` 和 `https://colamd.com` 会被识别为三条不同记录：

```typescript
// scripts/utils/normalize-url.ts
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()  // 去尾部斜杠
    return `${host}${path}`
  } catch {
    return raw.toLowerCase().trim()
  }
}
// "https://www.Colamd.com/app/" → "colamd.com/app"
// "http://colamd.com"          → "colamd.com"
```

去重流程：
1. 新 project 写入时计算 `normalizeUrl(project.url)` 存为 `url_normalized`（可加索引列，或查询时动态计算）
2. Enrichment Agent Step 5 对 `inferredProductUrl` 做同样规范化后查 `projects.url_normalized`
3. 命中 → 写 `dedup_candidates`（detectionMethod='url_normalized'，不自动 merge）

> **字段补充**：`projects` 表需增加 `urlNormalized text` 列（Phase 1 迁移时随 schema 一并建好），加 `idxUrlNorm index('idx_proj_url_norm').on(t.urlNormalized)` 索引。

**Phase 2（Embedding candidates）**：`cos_sim > 0.90` → 候选对写入，**不自动合并**。同赛道不同产品的相似度可能同样很高，必须由编辑确认后才执行 merge，且 merge 操作可回退（split action）。

> **Embedding 在 Phase 8 才启用**。Phase 1-7 期间只做 Phase 1（URL 规范化匹配）。

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

### 7.4 trust_level → 字段写权限映射

`trust_level` 有两层含义需要显式分开：**数据来源可信度** 和 **字段写入权限**。混用会在 claim 完成、maker 覆盖字段后产生语义模糊。

下表规定每个 trust 级别对产品字段的写权限：

| 字段类别 | scraped | native_submitted | maker_verified | editor |
|---------|---------|-----------------|----------------|--------|
| name · tagline · url | 系统写入，不可自改 | patch（进 submissions，等轻审核） | 直接写 | 直接写 |
| description · stage · topics | 系统写入，不可自改 | patch（进 submissions，等轻审核） | 直接写 | 直接写 |
| screenshot | 系统写入（Microlink） | patch | 直接写 | 直接写 |
| featuredInsight · vibes | ❌ | ❌ | ❌ | 直接写 |
| is_editors_pick · editorNotes | ❌ | ❌ | ❌ | 直接写 |
| trustLevel · publishStatus | ❌ | ❌ | ❌ | 直接写 |
| product_updates（时间线） | ❌ | ❌ | 直接写（零审核） | 直接写 |

**关键规则：**

- `native_submitted` 提交的是 **patch 请求**（写入 `submissions.makerOverrides`），不直接覆写 `projects` 表字段。patch 通过轻审核后才 merge 进 canonical。
- `maker_verified` 直接写 `projects` 表，但 **编辑专属字段**（featuredInsight、editorNotes、is_editors_pick）即使是 maker_verified 也无法修改，避免 maker 覆盖编辑的策划表达。
- 验证通过（domain_txt/github_file/jike_bio）≠ 信任升级。验证只证明"控制了这个资产"，写权限升级发生在编辑轻审批之后。

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
      eq(submissions.claimPath, 'self_service'),
      eq(submissions.verifyPassed, false),
      isNotNull(submissions.verifyToken),
    )
  })

  for (const sub of pending) {
    // 检查是否已有其他 confirmed 认领（竞争条件防护）
    const existingClaim = await db.query.submissions.findFirst({
      where: and(
        eq(submissions.targetProjectId, sub.targetProjectId!),
        eq(submissions.type, 'claim_request'),
        eq(submissions.status, 'confirmed'),
        ne(submissions.id, sub.id),
      )
    })
    if (existingClaim) {
      // 已有其他认领在处理中，跳过并通知
      await notifyFeishu(`⚠️ 重复认领：${sub.targetProjectId} 已有待审批认领，新申请 ${sub.id} 暂停`)
      continue
    }

    // 从 DB 拿项目 URL 用于域名提取（targetProjectId 是 UUID，不是域名）
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, sub.targetProjectId!),
      columns: { url: true, id: true },
    })
    if (!project?.url) continue
    const projectDomain = new URL(project.url).hostname.replace('www.', '')

    let passed = false

    switch (sub.verifyMethod) {
      case 'domain_txt': {
        // dns.promises.resolveTxt 返回 string[][]
        const { resolveTxt } = await import('node:dns/promises')
        const records = await resolveTxt(projectDomain).catch(() => [] as string[][])
        passed = records.flat().includes(`solobase-verify=${sub.verifyToken}`)
        break
      }
      case 'github_file': {
        // rawInput 类型为 claim_request，verificationData.githubRepo 有类型保障
        if (sub.rawInput?.type !== 'claim_request') break
        const githubRepo = sub.rawInput.verificationData?.githubRepo
        if (!githubRepo) break
        const url = `https://raw.githubusercontent.com/${githubRepo}/main/.solobase-verify`
        const text = await fetch(url).then(r => r.ok ? r.text() : '').catch(() => '')
        passed = text.trim() === sub.verifyToken
        break
      }
      case 'jike_bio': {
        if (sub.rawInput?.type !== 'claim_request') break
        const jikeHandle = sub.rawInput.verificationData?.jikeHandle
        if (!jikeHandle) break
        // 即刻 profile 是公开 HTML，抓取 bio 字段
        const html = await fetch(`https://web.okjike.com/u/${jikeHandle}`)
          .then(r => r.text()).catch(() => '')
        passed = html.includes(`[sv:${sub.verifyToken}]`)
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

      // trust_level 升到 native_submitted（不是 maker_verified，等编辑轻审批）
      await db.update(projects)
        .set({ trustLevel: 'native_submitted', updatedAt: new Date() })
        .where(eq(projects.id, sub.targetProjectId!))

      await notifyFeishu(`🔍 待审批认领：${project.id}，验证方式：${sub.verifyMethod} ✓，请在 /admin/claims 确认`)
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

**Publisher Agent**：每次编辑操作（飞书按钮点击 / /admin 操作）完成后**同步调用**（非事件队列），增量更新 feed.json，不全量重跑。Turso/SQLite 无原生 DB-level trigger 机制，"事件触发"的实现是：editorial action API route 在写完 DB 后直接 `await runPublisher()`。

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

URL Health Check Agent（每周一次，周日凌晨）
  → 对所有 projects WHERE entity_status IN ('active', 'unreachable') 做 HEAD 请求
  → 2xx/3xx → url_status=live，entity_status 保持/恢复 active
  → 失败（timeout/4xx/5xx）→ 失败计数 +1；连续 ≥3 次 → url_status=unreachable，entity_status=unreachable
  → unreachable 持续 ≥30 天 → 检查 Wayback Machine 近期存档；无存档 → url_status=dead（编辑手动决定是否 deprecated）
  → 每周汇总：新增失联 N 个，恢复 M 个 → 飞书周报附带

Weekly Review Agent（每周一 09:00）
  → WeeklyMetrics 计算 → 飞书周报
  → override_rate > 25% 时附带 prompt 优化建议
```

**调度配置：macOS launchd（本地）+ Vercel Cron（云端）**

本地 Mac（pipeline 批处理）用 launchd plist：
```xml
<!-- ~/Library/LaunchAgents/co.solobase.pipeline.plist -->
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key><integer>22</integer>
  <key>Minute</key><integer>0</integer>
</dict>
<key>ProgramArguments</key>
<array>
  <string>/usr/local/bin/npm</string>
  <string>run</string>
  <string>pipeline:daily</string>
</array>
```
加载：`launchctl load ~/Library/LaunchAgents/co.solobase.pipeline.plist`

Vercel 云端（Digest / Weekly Review 发飞书）用 `vercel.json`：
```json
{
  "crons": [
    { "path": "/api/cron/digest",        "schedule": "0 23 * * *"   },
    { "path": "/api/cron/weekly-review", "schedule": "0 1 * * MON" }
  ]
}
```

> **不使用 Claude Code CronCreate**：CronCreate 依赖活跃的交互式 Claude Code 会话，无法在后台独立持续运行，不适合生产调度。

---

## 十二、可观测指标

```typescript
interface WeeklyMetrics {
  // 入库
  ingested_total: number
  ingested_by_source: Record<string, number>  // 含 v2ex / linuxdo 分项
  native_submissions: number          // 原生提交数
  claims_completed: number            // 认领完成数（Path A + B 合计）
  claims_pending: number              // 发出邀请但未响应
  // 认领路径拆分
  claims_path_a_invited: number       // 本周编辑发出邀请数
  claims_path_b_started: number       // 本周自助申请发起数
  claims_path_b_verify_method: Record<'domain_txt'|'github_file'|'jike_bio'|'email', number>
  claims_path_b_verify_pass_rate: number   // 验证通过率（核心：哪种方式可用）
  // LLM 健康
  llm_error_rate: number              // Pass 1 失败率（prompt 质量信号）
  llm_parse_fail_by_model: Record<string, number>

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

  // URL 健康
  url_live_count: number              // urlStatus=live 的产品数
  url_unreachable_new: number         // 本周新增失联
  url_recovered: number               // 本周恢复访问
  url_dead_total: number              // 累计确认死亡

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

### Phase 0：止血 ✅ 已完成

- [x] 修 V2EX/Linux.do media 字段（`<img src>` / Markdown 图片提取）
- [x] 修 build-feed：无图产品用 TextProjectCard（移除 `images.length===0` 硬门槛）
- [x] filter-jike：纯文字长帖保留（< 100 字才丢弃）
- [ ] 飞书双向同步：审核状态写回 editorial 字段（待 Phase 3 实现）

**实际效果：重新跑 pipeline 后观察产品数变化（预期 129 → 300+）**

### Phase 1：数据库迁移（3-5 天）

- [ ] Turso 初始化（确认 Turso 版本 + libSQL driver 版本）
- [ ] Drizzle schema 全量建表（**包含 submissions + makerAuth**，一次迁移完，避免后续 schema 分裂）
  - content_items · projects · makers · junction tables · inference_runs · editorial_actions
  - submissions · makerAuth · productUpdates（不要等 Phase 4）
  - media_cache · dedup_candidates · embeddings（建表，Phase 8 前不写数据）
- [ ] 幂等约束验证：`UNIQUE ON (source, source_id)` 重复运行不产生重复记录
- [ ] 迁移脚本：`pipeline_output.json` → Turso（批量 upsert，非逐行写入）
- [ ] build-feed.ts 切换：从 DB 的 `publish_status=published` 过滤，而非 JSON 文件
- [ ] launchd plist 配置，替代手动触发 pipeline

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

> 前置：Phase 1 已完成（submissions / makerAuth 表已存在）

- [ ] `/submit` 路由：产品提交流（URL + 故事，AI 预填充）
- [ ] `/submit/post` 路由：经验帖写作（AI 协作写作体验）
- [ ] AI Intake Engine（`src/api/intake/route.ts`）：Jina + Microlink + LLM 提取
- [ ] 轻审核逻辑（native_submitted 自动发布）
- [ ] Vercel Cron 配置：digest + weekly-review 触发

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

- [ ] WeeklyMetrics 实现（含认领路径拆分、LLM 错误率、V2EX/Linux.do 分源分布）
- [ ] Weekly Review Agent（override_rate > 25% 时触发 prompt 优化建议）
- [ ] Next.js /admin（键盘流 + 指标面板 + 认领管理 + 去重确认）
- [ ] validateImageSync 改为异步 fetch（当前 execSync curl 会阻塞线程）

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

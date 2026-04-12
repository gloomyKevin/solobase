import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

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
}, (t) => [
  uniqueIndex('uq_ci_source').on(t.source, t.sourceId),
  index('idx_ci_review').on(t.reviewStatus),
  index('idx_ci_publish').on(t.publishStatus),
  index('idx_ci_llm').on(t.llmProcessedAt),
  index('idx_ci_pub_at').on(t.publishedAt),
])

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
}, (t) => [
  index('idx_ir_item').on(t.contentItemId),
])

// ── Projects ────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id:           text('id').primaryKey(),
  slug:         text('slug').notNull().unique(),
  name:         text('name').notNull(),
  tagline:      text('tagline'),
  description:  text('description'),
  url:          text('url').notNull(),
  urlNormalized:text('url_normalized'), // normalizeUrl(url)，用于 deterministic 去重
  urlStatus:    text('url_status').default('unknown'),
  // unknown | live | unreachable | dead
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
}, (t) => [
  index('idx_proj_url').on(t.url),
  index('idx_proj_url_norm').on(t.urlNormalized),
  index('idx_proj_publish').on(t.publishStatus),
])

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
}, (t) => [
  uniqueIndex('pk_cp').on(t.contentItemId, t.projectId),
])

export const contentMakerLinks = sqliteTable('content_maker_links', {
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  makerId:       text('maker_id').notNull()
                   .references(() => makers.id),
  linkType:      text('link_type').notNull(),
  // author | mentioned | interviewed
  isPrimary:     integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('pk_cm').on(t.contentItemId, t.makerId),
])

export const projectMakerLinks = sqliteTable('project_maker_links', {
  projectId:  text('project_id').notNull().references(() => projects.id),
  makerId:    text('maker_id').notNull().references(() => makers.id),
  role:       text('role'),
  // founder | co_founder | contributor
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('pk_pm').on(t.projectId, t.makerId),
])

export const projectSources = sqliteTable('project_sources', {
  projectId:     text('project_id').notNull().references(() => projects.id),
  contentItemId: text('content_item_id').notNull()
                   .references(() => contentItems.id),
  sourceType:    text('source_type').notNull(),
  // primary_mention | update_post | related_post | native_submission | claim
  addedAt:       integer('added_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('pk_ps').on(t.projectId, t.contentItemId),
])

// ── Product Updates（产品时间线）────────────────────────────────

export const productUpdates = sqliteTable('product_updates', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id),
  makerId:     text('maker_id').references(() => makers.id),
  updateType:  text('update_type').notNull(),
  // revenue_milestone | user_milestone | feature_launch
  // | pivot | pause | acquired | shutdown
  body:        text('body').notNull(), // maker 的原话，不改动
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

  // 提交者
  submitterEmail: text('submitter_email'),
  submitterName:  text('submitter_name'),
  makerId:        text('maker_id').references(() => makers.id),

  // 原始输入（maker 的原始声音，永远保留）
  // claim_request 类型额外携带 verificationData，避免 as any 读取
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

  // Maker 确认/修改后的版本（patch 请求，不直接写 projects 表）
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
  claimInviteExpiry: integer('claim_invite_expiry', { mode: 'timestamp' }),
  claimVerifiedAt:   integer('claim_verified_at', { mode: 'timestamp' }),
  claimVerifiedNote: text('claim_verified_note'),

  // 认领相关 — Path B（自助申请）
  verifyMethod:     text('verify_method'),
  // domain_txt | github_file | jike_bio | email
  verifyToken:      text('verify_token'),
  verifyCheckedAt:  integer('verify_checked_at', { mode: 'timestamp' }),
  verifyPassed:     integer('verify_passed', { mode: 'boolean' }),

  // 轻审核
  autoCheckPassed: integer('auto_check_passed', { mode: 'boolean' }),
  autoCheckNotes:  text('auto_check_notes', { mode: 'json' }),

  submittedAt:  integer('submitted_at', { mode: 'timestamp' }),
  publishedAt:  integer('published_at', { mode: 'timestamp' }),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('idx_sub_status').on(t.status),
  index('idx_sub_maker').on(t.makerId),
  index('idx_sub_token').on(t.claimInviteToken),
  index('idx_sub_verify').on(t.verifyToken),
])

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
  embedding:  blob('embedding').notNull(), // Float32Array，1536 维（Phase 8 启用）
  model:      text('model').notNull(),
  inputText:  text('input_text'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('pk_emb').on(t.entityType, t.entityId),
])

// ── Dedup Candidates ────────────────────────────────────────────

export const dedupCandidates = sqliteTable('dedup_candidates', {
  id:              text('id').primaryKey(),
  itemAId:         text('item_a_id').notNull(),
  itemBId:         text('item_b_id').notNull(),
  detectionMethod: text('detection_method').notNull(),
  // url_normalized | name_match | embedding_similarity
  similarity:      real('similarity'),
  suggestedAction: text('suggested_action'),
  // merge | link_related | dismiss
  llmReasoning:    text('llm_reasoning'),
  status:          text('status').default('pending'),
  // pending | merged | dismissed | split
  resolvedBy:      text('resolved_by'),
  resolvedAt:      integer('resolved_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('uq_dd_pair').on(t.itemAId, t.itemBId),
])

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

// ── Relations（供 Drizzle relational queries 使用）────────────────

export const projectsRelations = relations(projects, ({ many }) => ({
  sources: many(projectSources),
  makers:  many(projectMakerLinks),
}))

export const projectSourcesRelations = relations(projectSources, ({ one }) => ({
  project:     one(projects,      { fields: [projectSources.projectId],     references: [projects.id] }),
  contentItem: one(contentItems,  { fields: [projectSources.contentItemId], references: [contentItems.id] }),
}))

export const contentItemsRelations = relations(contentItems, ({ many }) => ({
  projectLinks: many(contentProjectLinks),
  makerLinks:   many(contentMakerLinks),
  sources:      many(projectSources),
}))

export const contentProjectLinksRelations = relations(contentProjectLinks, ({ one }) => ({
  contentItem: one(contentItems, { fields: [contentProjectLinks.contentItemId], references: [contentItems.id] }),
  project:     one(projects,     { fields: [contentProjectLinks.projectId],     references: [projects.id] }),
}))

export const contentMakerLinksRelations = relations(contentMakerLinks, ({ one }) => ({
  contentItem: one(contentItems, { fields: [contentMakerLinks.contentItemId], references: [contentItems.id] }),
  maker:       one(makers,       { fields: [contentMakerLinks.makerId],        references: [makers.id] }),
}))

export const projectMakerLinksRelations = relations(projectMakerLinks, ({ one }) => ({
  project: one(projects, { fields: [projectMakerLinks.projectId], references: [projects.id] }),
  maker:   one(makers,   { fields: [projectMakerLinks.makerId],   references: [makers.id] }),
}))

export const makersRelations = relations(makers, ({ many }) => ({
  projectLinks: many(projectMakerLinks),
  contentLinks: many(contentMakerLinks),
}))

export const submissionsRelations = relations(submissions, ({ one }) => ({
  maker:         one(makers,        { fields: [submissions.makerId],         references: [makers.id] }),
  targetProject: one(projects,      { fields: [submissions.targetProjectId], references: [projects.id] }),
  targetContent: one(contentItems,  { fields: [submissions.targetContentId], references: [contentItems.id] }),
}))

export const makerAuthRelations = relations(makerAuth, ({ one }) => ({
  maker: one(makers, { fields: [makerAuth.makerId], references: [makers.id] }),
}))

export const productUpdatesRelations = relations(productUpdates, ({ one }) => ({
  project: one(projects, { fields: [productUpdates.projectId], references: [projects.id] }),
  maker:   one(makers,   { fields: [productUpdates.makerId],   references: [makers.id] }),
}))

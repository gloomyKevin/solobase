/**
 * Editorial Action API
 *
 * 统一处理所有编辑操作，供飞书卡片回调和 /admin 界面调用。
 * 每次操作完成后自动重建 feed。
 *
 * POST /api/editorial/action
 * Body: { entityType, entityId, action, actor?, notes? }
 *
 * action 枚举：
 *   approve_publish   → review_status=approved + publish_status=published
 *   approve_hold      → review_status=approved + publish_status=unpublished
 *   reject            → review_status=rejected
 *   feature           → publish_status=featured
 *   unfeature         → publish_status=published
 *   unpublish         → publish_status=unpublished
 *   archive           → review_status=archived（编辑主动归档）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../../../../../db/schema'
import { runPublisher } from '../../../../../scripts/agents/publisher'
import { normalizeUrl } from '../../../../../scripts/utils/normalize-url'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

type Action =
  | 'approve_publish'
  | 'approve_hold'
  | 'reject'
  | 'feature'
  | 'unfeature'
  | 'unpublish'
  | 'archive'

interface ActionBody {
  entityType: 'content_item' | 'project'
  entityId: string
  action: Action
  actor?: string
  notes?: string
  skipProject?: boolean   // 覆盖：AI 识别了产品但编辑认为不应创建 project
  forceProject?: boolean  // 覆盖：AI 没识别产品但编辑认为应该创建 project
}

// ── 状态更新映射 ──────────────────────────────────────────────────

function resolveStateChanges(action: Action): Partial<typeof schema.contentItems.$inferInsert> {
  const now = new Date()
  switch (action) {
    case 'approve_publish':
      return { reviewStatus: 'approved', publishStatus: 'published', publishedAtEditorial: now, reviewedAt: now }
    case 'approve_hold':
      return { reviewStatus: 'approved', publishStatus: 'unpublished', reviewedAt: now }
    case 'reject':
      return { reviewStatus: 'rejected', reviewedAt: now }
    case 'feature':
      return { publishStatus: 'featured', publishedAtEditorial: now }
    case 'unfeature':
      return { publishStatus: 'published' }
    case 'unpublish':
      return { publishStatus: 'unpublished', publishedAtEditorial: null }
    case 'archive':
      return { reviewStatus: 'archived', publishStatus: 'unpublished', reviewedAt: now }
  }
}

// ── 处理函数 ──────────────────────────────────────────────────────

async function applyAction(body: ActionBody): Promise<{ ok: boolean; message: string }> {
  const { entityType, entityId, action, actor = 'editor', notes } = body

  const changes = resolveStateChanges(action)
  const now = new Date()

  if (entityType === 'content_item') {
    // 读取当前状态（用于 editorial_actions 记录）
    const current = await db.query.contentItems.findFirst({
      where: eq(schema.contentItems.id, entityId),
      columns: { reviewStatus: true, publishStatus: true, entityStatus: true },
    })
    if (!current) return { ok: false, message: `content_item ${entityId} not found` }

    // 更新状态
    await db.update(schema.contentItems)
      .set({ ...changes, updatedAt: now })
      .where(eq(schema.contentItems.id, entityId))

    // 记录操作历史
    await db.insert(schema.editorialActions).values({
      id: `ea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      entityType: 'content_item',
      entityId,
      action,
      prevState: current,
      newState: { ...current, ...changes },
      actor,
      notes: notes ?? null,
      createdAt: now,
    })

  } else if (entityType === 'project') {
    const current = await db.query.projects.findFirst({
      where: eq(schema.projects.id, entityId),
      columns: { reviewStatus: true, publishStatus: true, entityStatus: true },
    })
    if (!current) return { ok: false, message: `project ${entityId} not found` }

    await db.update(schema.projects)
      .set({ ...changes, updatedAt: now })
      .where(eq(schema.projects.id, entityId))

    await db.insert(schema.editorialActions).values({
      id: `ea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      entityType: 'project',
      entityId,
      action,
      prevState: current,
      newState: { ...current, ...changes },
      actor,
      notes: notes ?? null,
      createdAt: now,
    })
  }

  // approve_publish 时自动提炼 project（支持编辑覆盖）
  if (action === 'approve_publish' && entityType === 'content_item' && !body.skipProject) {
    await promoteContentToProject(entityId, now, body.forceProject)
  }

  // 任何可能影响 feed 内容的操作都触发重建
  const feedTriggerActions: Action[] = ['approve_publish', 'feature', 'unfeature', 'unpublish', 'reject', 'archive']
  if (feedTriggerActions.includes(action)) {
    await runPublisher()
  }

  return { ok: true, message: `${action} applied to ${entityId}` }
}

// ── 帖子 → 产品提炼 ──────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

async function promoteContentToProject(contentItemId: string, now: Date, force = false): Promise<void> {
  const item = await db.query.contentItems.findFirst({
    where: eq(schema.contentItems.id, contentItemId),
  })
  if (!item) return
  // 无产品名且不是强制 → 只作为 post
  if (!item.inferredProductName?.trim() && !force) return

  const productName = item.inferredProductName?.trim() || item.body.split('\n').find(l => l.trim().length > 3)?.trim().slice(0, 50) || 'Untitled'
  const productUrl = item.inferredProductUrl?.trim() ?? ''

  // 查找已有 project：先 URL 匹配，再名字匹配
  let existingProject: typeof schema.projects.$inferSelect | undefined

  if (productUrl) {
    const normalized = normalizeUrl(productUrl)
    const byUrl = await client.execute({
      sql: `SELECT * FROM projects WHERE url_normalized = ? LIMIT 1`,
      args: [normalized],
    })
    if (byUrl.rows.length > 0) {
      existingProject = await db.query.projects.findFirst({
        where: eq(schema.projects.id, byUrl.rows[0].id as string),
      })
    }
  }

  if (!existingProject) {
    const byName = await client.execute({
      sql: `SELECT id FROM projects WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      args: [productName],
    })
    if (byName.rows.length > 0) {
      existingProject = await db.query.projects.findFirst({
        where: eq(schema.projects.id, byName.rows[0].id as string),
      })
    }
  }

  if (existingProject) {
    // ── 更新已有 project ──
    const updates: Partial<typeof schema.projects.$inferInsert> = {
      publishStatus: 'published',
      reviewStatus: 'approved',
      updatedAt: now,
    }
    if (!existingProject.publishedAtEditorial) updates.publishedAtEditorial = now
    if (!existingProject.tagline && item.inferredProductOneLiner) updates.tagline = item.inferredProductOneLiner
    if (!existingProject.screenshot && item.media) updates.screenshot = item.media
    if (!existingProject.featuredInsight && item.editorialSummary) updates.featuredInsight = item.editorialSummary
    if (item.inferredProductStage) updates.stage = item.inferredProductStage
    if (!existingProject.topics && item.topics) updates.topics = item.topics

    await db.update(schema.projects).set(updates).where(eq(schema.projects.id, existingProject.id))

    // 关联
    await client.execute({
      sql: `INSERT INTO content_project_links (content_item_id, project_id, link_type, is_primary, created_at)
            VALUES (?, ?, 'primary', 1, ?)
            ON CONFLICT(content_item_id, project_id) DO NOTHING`,
      args: [contentItemId, existingProject.id, Math.floor(now.getTime() / 1000)],
    })

  } else {
    // ── 创建新 project ──
    let slug = slugify(productName)

    // 确保 slug 唯一
    const existing = await client.execute({ sql: `SELECT id FROM projects WHERE slug = ?`, args: [slug] })
    if (existing.rows.length > 0) {
      slug = slug + '-' + Math.random().toString(36).slice(2, 6)
    }

    const projectId = `proj_${slug}`

    await db.insert(schema.projects).values({
      id: projectId,
      slug,
      name: productName,
      tagline: item.inferredProductOneLiner ?? null,
      description: item.editorialSummary ?? null,
      url: productUrl || `https://solobase.co/project/${slug}`,
      urlNormalized: productUrl ? normalizeUrl(productUrl) : null,
      screenshot: item.media ?? null,
      stage: item.inferredProductStage ?? 'launched',
      topics: item.topics ?? null,
      trustLevel: 'scraped',
      entityStatus: 'active',
      reviewStatus: 'approved',
      publishStatus: 'published',
      publishedAtEditorial: now,
      featuredInsight: item.editorialSummary ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // 关联
    await client.execute({
      sql: `INSERT INTO content_project_links (content_item_id, project_id, link_type, is_primary, created_at)
            VALUES (?, ?, 'primary', 1, ?)
            ON CONFLICT(content_item_id, project_id) DO NOTHING`,
      args: [contentItemId, projectId, Math.floor(now.getTime() / 1000)],
    })
  }
}

// ── Route Handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 简单鉴权：仅 /admin 内部调用，用环境变量 secret
  const authHeader = req.headers.get('x-editorial-secret')
  const expectedSecret = process.env.EDITORIAL_SECRET
  if (expectedSecret && authHeader !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: ActionBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.entityType || !body.entityId || !body.action) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 })
  }

  try {
    const result = await applyAction(body)
    return NextResponse.json(result, { status: result.ok ? 200 : 404 })
  } catch (err) {
    console.error('[editorial/action]', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

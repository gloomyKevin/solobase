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
      return { publishStatus: 'featured' }
    case 'unfeature':
      return { publishStatus: 'published' }
    case 'unpublish':
      return { publishStatus: 'unpublished' }
    case 'archive':
      return { reviewStatus: 'archived', reviewedAt: now }
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

  // 发布类操作触发 feed 重建
  const feedTriggerActions: Action[] = ['approve_publish', 'feature', 'unfeature', 'unpublish']
  if (feedTriggerActions.includes(action)) {
    await runPublisher()
  }

  return { ok: true, message: `${action} applied to ${entityId}` }
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

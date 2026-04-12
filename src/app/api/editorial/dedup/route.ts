/**
 * POST /api/editorial/dedup
 * Body: { candidateId, action: 'merge' | 'dismiss' }
 *
 * merge:   标记 dedup_candidate resolved，content_item 归档（已被 project 吸收）
 * dismiss: 标记 dedup_candidate dismissed（确认是不同产品）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../../../../../db/schema'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

export async function POST(req: NextRequest) {
  let body: { candidateId: string; action: 'merge' | 'dismiss' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { candidateId, action } = body
  if (!candidateId || !action) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const candidate = await db.query.dedupCandidates.findFirst({
    where: eq(schema.dedupCandidates.id, candidateId),
  })
  if (!candidate) {
    return NextResponse.json({ error: 'candidate not found' }, { status: 404 })
  }

  const now = new Date()

  if (action === 'merge') {
    // 将 content_item 标记为已合并归档（内容被 project 吸收，不再单独展示）
    await db.update(schema.contentItems)
      .set({ reviewStatus: 'archived', reviewedAt: now, updatedAt: now })
      .where(eq(schema.contentItems.id, candidate.itemAId))

    // 写 editorial_actions 记录
    await db.insert(schema.editorialActions).values({
      id: `ea_dedup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      entityType: 'content_item',
      entityId: candidate.itemAId,
      action: 'archive',
      prevState: { reviewStatus: 'pending' },
      newState: { reviewStatus: 'archived', mergedInto: candidate.itemBId },
      actor: 'dedup',
      notes: `merged into project ${candidate.itemBId}`,
      createdAt: now,
    })

    // 标记去重候选为已解决
    await client.execute({
      sql: `UPDATE dedup_candidates SET status='resolved', resolved_by='editor', resolved_at=? WHERE id=?`,
      args: [Math.floor(now.getTime() / 1000), candidateId],
    })

  } else {
    // dismiss：不同产品，忽略这对候选
    await client.execute({
      sql: `UPDATE dedup_candidates SET status='dismissed', resolved_by='editor', resolved_at=? WHERE id=?`,
      args: [Math.floor(now.getTime() / 1000), candidateId],
    })
  }

  return NextResponse.json({ ok: true })
}

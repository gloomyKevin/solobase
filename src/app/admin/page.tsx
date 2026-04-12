/**
 * /admin — 编辑主界面（Inbox 风格，键盘流）
 *
 * 快捷键：
 *   j/k      上下导航
 *   y        收录并发布
 *   u        收录不发布（存草稿）
 *   n        跳过（reject）
 *   f        精选/取消精选
 *   e        打开编辑备注
 *   Escape   关闭备注
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq, and, ne, isNotNull } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { AdminClient } from './AdminClient'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

export const dynamic = 'force-dynamic'

export interface QueueItem {
  id: string
  source: string
  authorName: string
  authorBio: string | null
  body: string
  editorialRec: string | null
  confidence: number | null
  recReason: string | null
  editorialSummary: string | null
  collectionAngle: string | null
  concerns: string[] | null
  likesCount: number | null
  commentsCount: number | null
  publishedAt: string | null
  contentType: string | null
  inferredProductName: string | null
  inferredProductUrl: string | null
  inferredProductOneLiner: string | null
  inferredProductStage: string | null
  keyMetrics: string[] | null
  topics: string[] | null
  media: string | null
  trustLevel: string
  reviewStatus: string
  priorityLevel: number
}

async function getQueue(): Promise<QueueItem[]> {
  const items = await db.query.contentItems.findMany({
    where: and(
      eq(schema.contentItems.reviewStatus, 'pending'),
      isNotNull(schema.contentItems.llmProcessedAt),
    ),
    orderBy: (ci, { desc, asc }) => [
      desc(ci.confidence),
    ],
    limit: 100,
  })

  return items.map(item => {
    let priorityLevel = 4
    if (item.trustLevel === 'native_submitted' || item.trustLevel === 'maker_verified') {
      priorityLevel = 1
    } else if (item.editorialRec === 'include' && (item.confidence ?? 0) >= 0.85) {
      priorityLevel = 2
    } else if (item.editorialRec === 'include') {
      priorityLevel = 3
    } else if (item.editorialRec === 'review') {
      priorityLevel = 4
    } else {
      priorityLevel = 5
    }

    return {
      id: item.id,
      source: item.source,
      authorName: item.authorName,
      authorBio: item.authorBio ?? null,
      body: item.body,
      editorialRec: item.editorialRec ?? null,
      confidence: item.confidence ?? null,
      recReason: item.recReason ?? null,
      editorialSummary: item.editorialSummary ?? null,
      collectionAngle: item.collectionAngle ?? null,
      concerns: item.concerns as string[] | null,
      likesCount: item.likesCount ?? null,
      commentsCount: item.commentsCount ?? null,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      contentType: item.contentType ?? null,
      inferredProductName: item.inferredProductName ?? null,
      inferredProductUrl: item.inferredProductUrl ?? null,
      inferredProductOneLiner: item.inferredProductOneLiner ?? null,
      inferredProductStage: item.inferredProductStage ?? null,
      keyMetrics: item.keyMetrics as string[] | null,
      topics: item.topics as string[] | null,
      media: item.media ?? null,
      trustLevel: item.trustLevel,
      reviewStatus: item.reviewStatus,
      priorityLevel,
    }
  }).sort((a, b) => a.priorityLevel - b.priorityLevel)
}

async function getStats() {
  const [pending, published, archived, dedup] = await Promise.all([
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'pending' AND llm_processed_at IS NOT NULL`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE publish_status = 'published'`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'archived'`),
    client.execute(`SELECT COUNT(*) as n FROM dedup_candidates WHERE status = 'pending'`),
  ])

  return {
    pending: Number(pending.rows[0].n),
    published: Number(published.rows[0].n),
    archived: Number(archived.rows[0].n),
    dedupPending: Number(dedup.rows[0].n),
  }
}

export default async function AdminPage() {
  const [queue, stats] = await Promise.all([getQueue(), getStats()])

  return <AdminClient queue={queue} stats={stats} />
}

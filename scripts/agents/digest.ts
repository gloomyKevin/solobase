/**
 * Editorial Digest Agent
 *
 * 生成每日编辑日报，按优先级排序内容队列。
 * 可发送到飞书（配置好 FEISHU_* 后自动启用），也可本地打印预览。
 *
 * 运行：node --env-file=.env.local ./node_modules/.bin/tsx scripts/agents/digest.ts
 *       node --env-file=.env.local ./node_modules/.bin/tsx scripts/agents/digest.ts --dry-run
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq, and, isNull, desc, ne, gte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { fileURLToPath } from 'url'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// ── 飞书 API ──────────────────────────────────────────────────────

async function sendFeishu(text: string): Promise<void> {
  const webhook = process.env.FEISHU_WEBHOOK_URL
  if (!webhook) {
    console.log('[digest] FEISHU_WEBHOOK_URL 未配置，跳过发送')
    return
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text } }),
  })
  if (!res.ok) console.error('[digest] 飞书发送失败:', await res.text())
}

// ── 优先级队列查询 ────────────────────────────────────────────────

interface QueueItem {
  id: string
  source: string
  authorName: string
  body: string
  editorialRec: string | null
  confidence: number | null
  recReason: string | null
  editorialSummary: string | null
  likesCount: number | null
  trustLevel: string
  inferredProductName: string | null
  priority: number
  priorityLabel: string
}

async function buildQueue(): Promise<QueueItem[]> {
  // 查询所有待审核内容（review_status = pending，已经 LLM 处理）
  const items = await db.query.contentItems.findMany({
    where: and(
      eq(schema.contentItems.reviewStatus, 'pending'),
      ne(schema.contentItems.reviewStatus, 'archived'),
    ),
    orderBy: [
      desc(schema.contentItems.trustLevel),
      desc(schema.contentItems.confidence),
    ],
    limit: 50,  // 日报最多展示 50 条
  })

  return items.map(item => {
    // 优先级计算（1=最高）
    let priority = 5
    let priorityLabel = '⬜ exclude 候选'

    if (item.trustLevel === 'native_submitted' || item.trustLevel === 'maker_verified') {
      priority = 1
      priorityLabel = '⭐ 原生提交'
    } else if (item.editorialRec === 'include' && (item.confidence ?? 0) >= 0.85) {
      priority = 2
      priorityLabel = '🟢 强推收录'
    } else if (item.editorialRec === 'include') {
      priority = 3
      priorityLabel = '🟡 建议收录'
    } else if (item.editorialRec === 'review') {
      priority = 4
      priorityLabel = '🔵 待判断'
    }

    return {
      id: item.id,
      source: item.source,
      authorName: item.authorName,
      body: item.body,
      editorialRec: item.editorialRec ?? null,
      confidence: item.confidence ?? null,
      recReason: item.recReason ?? null,
      editorialSummary: item.editorialSummary ?? null,
      likesCount: item.likesCount ?? 0,
      trustLevel: item.trustLevel,
      inferredProductName: item.inferredProductName ?? null,
      priority,
      priorityLabel,
    }
  }).sort((a, b) => a.priority - b.priority)
}

// ── 日报文本生成 ──────────────────────────────────────────────────

function formatDigest(queue: QueueItem[], stats: DigestStats): string {
  const today = new Date().toLocaleDateString('zh-CN', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  const lines: string[] = [
    `Solobase 内容日报 · ${today}`,
    '',
    '📊 今日概况',
    `  待审核: ${stats.pending} 条  |  昨日新增: ${stats.newToday} 条`,
    `  已归档(噪声): ${stats.archived} 条  |  已发布: ${stats.published} 条`,
    '',
    `📋 待处理队列 (前 ${Math.min(queue.length, 15)} 条)`,
    '─'.repeat(40),
  ]

  const displayItems = queue.slice(0, 15)
  for (const item of displayItems) {
    const conf = item.confidence ? `${Math.round(item.confidence * 100)}%` : '?%'
    const product = item.inferredProductName ? `[${item.inferredProductName}] ` : ''
    const body = item.body.slice(0, 80).replace(/\n/g, ' ')

    lines.push(
      `${item.priorityLabel}  ${product}@${item.authorName} (${item.source})`,
      `  置信: ${conf}  ${item.recReason?.slice(0, 60) ?? ''}`,
      `  「${body}…」`,
      '',
    )
  }

  if (queue.length > 15) {
    lines.push(`  ... 还有 ${queue.length - 15} 条，前往 /admin 查看全部`)
    lines.push('')
  }

  if (stats.dedupPending > 0) {
    lines.push(`⚠️  去重候选待确认: ${stats.dedupPending} 对 → /admin/dedup`)
    lines.push('')
  }

  lines.push('🔗 /admin  |  enrich:all 断点续跑可随时重启')

  return lines.join('\n')
}

interface DigestStats {
  pending: number
  newToday: number
  archived: number
  published: number
  dedupPending: number
}

async function getStats(): Promise<DigestStats> {
  const yesterday = new Date(Date.now() - 86400_000)

  const [pending, archived, published, dedupPending, newToday] = await Promise.all([
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'pending'`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'archived'`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE publish_status = 'published'`),
    client.execute(`SELECT COUNT(*) as n FROM dedup_candidates WHERE status = 'pending'`),
    client.execute({
      sql: `SELECT COUNT(*) as n FROM content_items WHERE crawled_at >= ?`,
      args: [Math.floor(yesterday.getTime() / 1000)],
    }),
  ])

  return {
    pending: Number(pending.rows[0].n),
    archived: Number(archived.rows[0].n),
    published: Number(published.rows[0].n),
    dedupPending: Number(dedupPending.rows[0].n),
    newToday: Number(newToday.rows[0].n),
  }
}

// ── 主函数 ────────────────────────────────────────────────────────

export async function runDigest(dryRun = false): Promise<string> {
  const [queue, stats] = await Promise.all([buildQueue(), getStats()])
  const text = formatDigest(queue, stats)

  console.log('\n' + text)

  if (!dryRun) {
    await sendFeishu(text)
  }

  return text
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run')
  runDigest(dryRun)
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1) })
}

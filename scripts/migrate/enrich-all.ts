/**
 * 冷启动全量 LLM 处理
 *
 * 对所有 llmProcessedAt IS NULL 的 content_items 跑 Enrichment Agent
 * 支持断点续跑：中途 Ctrl+C 后重跑会自动跳过已处理的
 *
 * 运行：npx tsx scripts/migrate/enrich-all.ts
 * 预估成本：~¥80-130（4188 条）
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { isNull, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { enrichItem } from '../agents/enrich'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// 并发控制：同时处理 N 条，用 Promise pool
async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

async function main() {
  // 查询所有待处理记录
  const pending = await db.query.contentItems.findMany({
    where: isNull(schema.contentItems.llmProcessedAt),
    columns: { id: true, source: true, body: true },
    orderBy: (ci, { asc }) => [asc(ci.crawledAt)],
  })

  const total = pending.length
  console.log(`=== Enrichment Agent 冷启动 ===`)
  console.log(`待处理: ${total} 条`)
  console.log(`并发: ${3} 条同时`)
  console.log(`预估成本: ¥${(total * 0.025).toFixed(0)}-${(total * 0.035).toFixed(0)}\n`)

  if (total === 0) {
    console.log('没有待处理记录，退出。')
    process.exit(0)
  }

  const stats = { archived: 0, pass1_fail: 0, pass2_skip: 0, done: 0, total: 0 }
  const startTime = Date.now()

  // 需要完整的 item，不只是 id，重新查（or 查 id 后再 findFirst）
  const fullItems = await db.query.contentItems.findMany({
    where: isNull(schema.contentItems.llmProcessedAt),
    orderBy: (ci, { asc }) => [asc(ci.crawledAt)],
  })

  await runPool(fullItems, 3, async (item) => {
    try {
      const result = await enrichItem(item)
      stats[result]++
    } catch (err) {
      stats.pass1_fail++
    }
    stats.total++

    // 进度打印（每 10 条一次）
    if (stats.total % 10 === 0 || stats.total === total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      const rate = (stats.total / ((Date.now() - startTime) / 1000)).toFixed(1)
      const eta = ((total - stats.total) / parseFloat(rate)).toFixed(0)
      process.stdout.write(
        `\r进度 ${stats.total}/${total} | ` +
        `归档 ${stats.archived} | 成功 ${stats.done} | 失败 ${stats.pass1_fail} | ` +
        `${rate}条/s | 剩余 ~${eta}s    `
      )
    }
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n\n=== 完成 ===')
  console.log(`总耗时: ${elapsed}s`)
  console.log(`归档（噪声）: ${stats.archived}`)
  console.log(`成功（done）: ${stats.done}`)
  console.log(`Pass 2 跳过: ${stats.pass2_skip}`)
  console.log(`失败（重跑会重试）: ${stats.pass1_fail}`)

  // 统计推荐分布
  const dist = await client.execute(
    `SELECT editorial_rec, COUNT(*) as n FROM content_items
     WHERE llm_processed_at IS NOT NULL AND review_status != 'archived'
     GROUP BY editorial_rec ORDER BY n DESC`
  )
  console.log('\n推荐分布:')
  for (const row of dist.rows) {
    console.log(`  ${row.editorial_rec ?? 'null'}: ${row.n}`)
  }

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })

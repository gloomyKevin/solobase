/**
 * 媒体富化 Agent
 *
 * 对所有 media IS NULL 的 content_items 补充展示图，三级优先级：
 *   1. media_raw[0]    帖子原图（maker 精选，质量最高）
 *   2. OG Image 抓取   产品官网 og:image（免费，一个 HTTP 请求）
 *   3. Microlink 截图  仅 editorial_rec=include（节省配额）
 *
 * 运行：npx tsx scripts/agents/enrich-media.ts
 *       npx tsx scripts/agents/enrich-media.ts --limit=50   预览
 *       npx tsx scripts/agents/enrich-media.ts --dry-run    只统计不写入
 */

import { readFileSync } from 'fs'
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#\s][^=]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
} catch {}

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { isNull, isNotNull, eq, and } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { fileURLToPath } from 'url'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// ── OG Image 抓取 ──────────────────────────────────────────────────

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Solobase/1.0; +https://solobase.co)' },
    })
    clearTimeout(timer)
    if (!res.ok) return null

    const html = await res.text()
    // 匹配 og:image 或 twitter:image
    const match = html.match(
      /<meta[^>]+(?:property=["']og:image["']|name=["']twitter:image["'])[^>]+content=["']([^"']+)["']/i
    ) ?? html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property=["']og:image["']|name=["']twitter:image["'])/i
    )
    return match?.[1] ?? null
  } catch {
    return null
  }
}

// ── Microlink 截图（仅 include 记录用，节省配额）─────────────────

async function fetchMicrolinkScreenshot(url: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const data = await res.json() as { data?: { screenshot?: { url?: string } } }
    return data?.data?.screenshot?.url ?? null
  } catch {
    return null
  }
}

// ── 写 media_cache ──────────────────────────────────────────────────

async function upsertMediaCache(url: string, ogImage: string | null, error?: string) {
  await client.execute({
    sql: `INSERT INTO media_cache (url, og_image, fetched_at, valid, error_reason)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(url) DO UPDATE SET
            og_image = excluded.og_image,
            fetched_at = excluded.fetched_at,
            valid = excluded.valid,
            error_reason = excluded.error_reason`,
    args: [url, ogImage, Math.floor(Date.now() / 1000), ogImage ? 1 : 0, error ?? null],
  })
}

// ── 主流程 ──────────────────────────────────────────────────────────

async function enrichMediaForItem(
  item: typeof schema.contentItems.$inferSelect,
  dryRun: boolean
): Promise<'post_image' | 'og_image' | 'screenshot' | 'no_image'> {

  // 优先级 1：帖子原图
  const rawMedia: string[] = JSON.parse((item.mediaRaw as unknown as string) ?? '[]')
  if (rawMedia.length > 0) {
    if (!dryRun) {
      await db.update(schema.contentItems)
        .set({ media: rawMedia[0], mediaSource: 'post_image' })
        .where(eq(schema.contentItems.id, item.id))
    }
    return 'post_image'
  }

  // 优先级 2：OG Image
  const productUrl = item.inferredProductUrl
  if (productUrl) {
    // 先查 media_cache，避免重复请求
    const cached = await client.execute({
      sql: `SELECT og_image, valid FROM media_cache WHERE url = ?`,
      args: [productUrl],
    })

    let ogImage: string | null = null
    if (cached.rows.length > 0) {
      ogImage = cached.rows[0].og_image as string | null
    } else {
      ogImage = await fetchOgImage(productUrl)
      if (!dryRun) await upsertMediaCache(productUrl, ogImage, ogImage ? undefined : 'no_og_image')
    }

    if (ogImage) {
      if (!dryRun) {
        await db.update(schema.contentItems)
          .set({ media: ogImage, mediaSource: 'og_image' })
          .where(eq(schema.contentItems.id, item.id))
      }
      return 'og_image'
    }

    // 优先级 3：Microlink 截图（仅 include 记录值得花配额）
    if (item.editorialRec === 'include') {
      const screenshot = await fetchMicrolinkScreenshot(productUrl)
      if (screenshot) {
        if (!dryRun) {
          await db.update(schema.contentItems)
            .set({ media: screenshot, mediaSource: 'screenshot' })
            .where(eq(schema.contentItems.id, item.id))
          await upsertMediaCache(productUrl, screenshot)
        }
        return 'screenshot'
      }
    }
  }

  return 'no_image'
}

async function main() {
  const limitArg = process.argv.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) console.log('⚠️  Dry-run 模式：只统计，不写入')

  // 查询所有 media IS NULL 且已 LLM 处理的记录
  const items = await db.query.contentItems.findMany({
    where: and(
      isNull(schema.contentItems.media),
      isNotNull(schema.contentItems.llmProcessedAt),
    ),
    orderBy: (ci, { desc }) => [desc(ci.confidence)],  // 高置信度优先
    ...(limit ? { limit } : {}),
  })

  const total = items.length
  console.log(`\n=== 媒体富化 ===`)
  console.log(`待处理: ${total} 条${limit ? `（限制 ${limit} 条）` : ''}`)

  const stats = { post_image: 0, og_image: 0, screenshot: 0, no_image: 0 }
  let done = 0

  for (const item of items) {
    const result = await enrichMediaForItem(item, dryRun)
    stats[result]++
    done++

    if (done % 10 === 0 || done === total) {
      const pct = ((done / total) * 100).toFixed(0)
      process.stdout.write(
        `\r进度 ${done}/${total} (${pct}%) | ` +
        `帖子图 ${stats.post_image} | OG ${stats.og_image} | 截图 ${stats.screenshot} | 无图 ${stats.no_image}   `
      )
    }
  }

  console.log('\n\n=== 完成 ===')
  console.log(`帖子原图 (post_image): ${stats.post_image}  (${((stats.post_image/total)*100).toFixed(1)}%)`)
  console.log(`OG Image (og_image):   ${stats.og_image}  (${((stats.og_image/total)*100).toFixed(1)}%)`)
  console.log(`截图服务 (screenshot): ${stats.screenshot}  (${((stats.screenshot/total)*100).toFixed(1)}%)`)
  console.log(`无图 (TextCard 降级):   ${stats.no_image}  (${((stats.no_image/total)*100).toFixed(1)}%)`)
  console.log(`\n有图覆盖率: ${(((total - stats.no_image) / total) * 100).toFixed(1)}%`)

  process.exit(0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1) })
}

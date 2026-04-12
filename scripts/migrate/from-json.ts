/**
 * 迁移脚本：pipeline_output.json + feed.json → Turso (local.db)
 *
 * 运行：npx tsx scripts/migrate/from-json.ts
 *
 * 两阶段：
 *  1. 从 pipeline_output.json 导入 content_items（全量，4188 条）
 *  2. 从 feed.json 导入已发布的 projects（129 条）+ 建立 project_sources 关联
 *
 * 幂等：重复运行安全，所有写操作使用 onConflictDoNothing()
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql, count } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { normalizeUrl } from '../utils/normalize-url'

// ── DB 连接 ─────────────────────────────────────────────────────

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? 'file:./local.db',
})
const db = drizzle(client, { schema })

// ── 路径 ─────────────────────────────────────────────────────────

const PIPELINE_OUTPUT = path.join(process.cwd(), 'data/pipeline/pipeline_output.json')
const FEED_JSON       = path.join(process.cwd(), 'data/feed.json')

// ── 工具 ─────────────────────────────────────────────────────────

function parseTs(s: string | null | undefined): Date | null {
  if (!s) return null
  const ms = Date.parse(s)
  return isNaN(ms) ? null : new Date(ms)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── Phase 1：content_items ────────────────────────────────────────

async function migrateContentItems() {
  const raw = JSON.parse(fs.readFileSync(PIPELINE_OUTPUT, 'utf-8'))
  const items: any[] = Array.isArray(raw) ? raw : Object.values(raw)[0] as any[]

  console.log(`\n[Phase 1] content_items — 共 ${items.length} 条`)

  const BATCH = 200
  let inserted = 0
  let skipped  = 0

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)

    const rows = batch.map((item: any) => ({
      id:           item.id as string,
      source:       item.source as string,
      sourceId:     item.source_id as string,
      sourceUrl:    item.source_url as string,
      body:         (item.body ?? '') as string,
      authorName:   (item.author_name ?? '') as string,
      authorId:     item.author_id as string | null,
      authorBio:    item.author_bio as string | null,
      likesCount:   (item.engagement?.likes ?? 0) as number,
      commentsCount:(item.engagement?.comments ?? 0) as number,
      sharesCount:  (item.engagement?.shares ?? 0) as number,
      topComments:  (item.top_comments ?? []) as { author: string; content: string; likes: number }[],
      mediaRaw:     (item.media ?? []) as string[],
      externalLinks:(item.external_links ?? []) as string[],
      publishedAt:  parseTs(item.published_at),
      crawledAt:    parseTs(item.crawled_at) ?? new Date(),
      sourceExtra:  item.source_extra ?? null,

      // 推断层（来自旧 pipeline，等 Enrichment Agent 覆写）
      contentType:  item.inferred_type as string | null,
      inferredProductName: item.inferred_projects?.[0]?.name as string | null,
      inferredProductUrl:  item.inferred_projects?.[0]?.url  as string | null,
      inferredMakerName:   item.inferred_maker?.name         as string | null,

      reviewStatus:  'pending'    as const,
      publishStatus: 'unpublished' as const,
      entityStatus:  'active'     as const,
      trustLevel:    'scraped'    as const,
      updatedAt:     new Date(),
    }))

    const result = await db
      .insert(schema.contentItems)
      .values(rows)
      .onConflictDoNothing()

    // onConflictDoNothing 不返回跳过数，通过 rowsAffected 推算
    const affected = (result as any).rowsAffected ?? rows.length
    inserted += affected
    skipped  += rows.length - affected

    if ((i / BATCH) % 5 === 0 || i + BATCH >= items.length) {
      process.stdout.write(`  进度 ${Math.min(i + BATCH, items.length)}/${items.length} — 新增 ${inserted}，跳过 ${skipped}\r`)
    }
  }

  console.log(`\n[Phase 1] 完成：新增 ${inserted}，跳过（已存在）${skipped}`)
  return items
}

// ── Phase 2：projects from feed.json ─────────────────────────────

async function migrateProjects(contentItems: any[]) {
  const feed = JSON.parse(fs.readFileSync(FEED_JSON, 'utf-8'))
  const feedProjects: any[] = feed.projects ?? []

  console.log(`\n[Phase 2] projects — 共 ${feedProjects.length} 条（来自 feed.json 已发布状态）`)

  // 建立 sourceUrl → contentItem.id 的索引（用于 project_sources 关联）
  const urlToContentId = new Map<string, string>()
  for (const item of contentItems) {
    if (item.source_url) urlToContentId.set(item.source_url, item.id)
  }

  let projInserted = 0
  let projSkipped  = 0
  let linkInserted = 0

  for (const fp of feedProjects) {
    const now = new Date()
    const slug = fp.slug as string

    // 确保 slug 唯一
    const projectId = `proj_${slug}`

    const projectRow = {
      id:           projectId,
      slug,
      name:         (fp.name ?? '') as string,
      tagline:      fp.tagline as string | null,
      description:  fp.description as string | null,
      url:          (fp.url ?? '') as string,
      urlNormalized:fp.url ? normalizeUrl(fp.url) : null,
      screenshot:   fp.screenshot as string | null,
      stage:        fp.stage as string | null,
      topics:       (fp.topics ?? []) as string[],
      trustLevel:   'scraped'     as const,
      entityStatus: 'active'      as const,
      reviewStatus: 'approved'    as const, // feed.json 里的都已经审核过
      publishStatus:'published'   as const,
      publishedAtEditorial: parseTs(fp.publishedAt) ?? now,
      createdAt:    now,
      updatedAt:    now,
    }

    const pr = await db
      .insert(schema.projects)
      .values(projectRow)
      .onConflictDoNothing()

    const affected = (pr as any).rowsAffected ?? 0
    if (affected > 0) projInserted++
    else projSkipped++

    // 建立 project_sources 关联（通过 sourceUrl 匹配 content_item）
    const contentItemId = urlToContentId.get(fp.sourceUrl)
    if (contentItemId) {
      await db
        .insert(schema.projectSources)
        .values({
          projectId,
          contentItemId,
          sourceType: 'primary_mention',
          addedAt: now,
        })
        .onConflictDoNothing()
      linkInserted++
    }
  }

  console.log(`[Phase 2] projects: 新增 ${projInserted}，跳过 ${projSkipped}`)
  console.log(`[Phase 2] project_sources 关联: 建立 ${linkInserted} 条`)
}

// ── 验证 ─────────────────────────────────────────────────────────

async function verify() {
  const [{ value: ciCount }] = await db.select({ value: count() }).from(schema.contentItems)
  const [{ value: prCount }] = await db.select({ value: count() }).from(schema.projects)
  const [{ value: psCount }] = await db.select({ value: count() }).from(schema.projectSources)

  console.log('\n[验证]')
  console.log(`  content_items:   ${ciCount}`)
  console.log(`  projects:        ${prCount}`)
  console.log(`  project_sources: ${psCount}`)

  // 按 source 分布（直接用 client 跑 raw SQL）
  const dist = await client.execute(
    'SELECT source, COUNT(*) as n FROM content_items GROUP BY source'
  )
  console.log('  source 分布:')
  for (const row of dist.rows) {
    console.log(`    ${row.source}: ${row.n}`)
  }
}

// ── 入口 ─────────────────────────────────────────────────────────

async function main() {
  console.log('=== Solobase 数据迁移 ===')
  console.log(`目标库: ${process.env.DATABASE_URL_LOCAL ?? 'file:./local.db'}`)

  const items = await migrateContentItems()
  await migrateProjects(items)
  await verify()

  console.log('\n✓ 迁移完成')
  process.exit(0)
}

main().catch(err => {
  console.error('迁移失败:', err)
  process.exit(1)
})

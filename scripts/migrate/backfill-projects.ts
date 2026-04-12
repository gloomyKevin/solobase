/**
 * 一次性脚本：为已 published 的 content_items 追溯创建 project 记录
 * 运行：node --env-file=.env.local ./node_modules/.bin/tsx scripts/migrate/backfill-projects.ts
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq, and } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { normalizeUrl } from '../utils/normalize-url'
import { runPublisher } from '../agents/publisher'

const client = createClient({ url: process.env.DATABASE_URL_LOCAL ?? 'file:./local.db' })
const db = drizzle(client, { schema })

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

async function main() {
  const items = await db.query.contentItems.findMany({
    where: and(eq(schema.contentItems.publishStatus, 'published'), eq(schema.contentItems.entityStatus, 'active')),
  })

  let created = 0, updated = 0, skipped = 0
  const now = new Date()
  const ts = Math.floor(now.getTime() / 1000)

  for (const item of items) {
    if (!item.inferredProductName?.trim()) { skipped++; continue }

    // 已有 link?
    const existing = await client.execute({
      sql: 'SELECT project_id FROM content_project_links WHERE content_item_id = ?', args: [item.id],
    })
    if (existing.rows.length > 0) { skipped++; continue }

    const name = item.inferredProductName.trim()
    const url = item.inferredProductUrl?.trim() ?? ''

    // 查找已有 project
    let projId: string | null = null
    if (url) {
      const norm = normalizeUrl(url)
      const r = await client.execute({ sql: 'SELECT id FROM projects WHERE url_normalized = ? LIMIT 1', args: [norm] })
      if (r.rows.length > 0) projId = r.rows[0].id as string
    }
    if (!projId) {
      const r = await client.execute({ sql: 'SELECT id FROM projects WHERE LOWER(name) = LOWER(?) LIMIT 1', args: [name] })
      if (r.rows.length > 0) projId = r.rows[0].id as string
    }

    if (projId) {
      await client.execute({
        sql: `UPDATE projects SET publish_status='published', review_status='approved',
              published_at_editorial=COALESCE(published_at_editorial, ?),
              tagline=COALESCE(tagline, ?), screenshot=COALESCE(screenshot, ?),
              featured_insight=COALESCE(featured_insight, ?),
              stage=COALESCE(?, stage), updated_at=? WHERE id=?`,
        args: [ts, item.inferredProductOneLiner, item.media, item.editorialSummary, item.inferredProductStage, ts, projId],
      })
      updated++
    } else {
      let slug = slugify(name)
      const dup = await client.execute({ sql: 'SELECT id FROM projects WHERE slug = ?', args: [slug] })
      if (dup.rows.length > 0) slug = slug + '-' + Math.random().toString(36).slice(2, 6)
      projId = 'proj_' + slug

      await client.execute({
        sql: `INSERT INTO projects (id, slug, name, tagline, description, url, url_normalized, screenshot, stage, topics,
              trust_level, entity_status, review_status, publish_status, published_at_editorial, featured_insight, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [projId, slug, name, item.inferredProductOneLiner, item.editorialSummary,
          url || `https://solobase.co/project/${slug}`, url ? normalizeUrl(url) : null,
          item.media, item.inferredProductStage ?? 'launched', JSON.stringify(item.topics ?? []),
          'scraped', 'active', 'approved', 'published', ts, item.editorialSummary, ts, ts],
      })
      created++
    }

    // 关联
    await client.execute({
      sql: `INSERT INTO content_project_links (content_item_id, project_id, link_type, is_primary, created_at)
            VALUES (?, ?, 'primary', 1, ?) ON CONFLICT DO NOTHING`,
      args: [item.id, projId, ts],
    })
    console.log(`  ${created + updated}. ${name} → ${projId}`)
  }

  console.log(`\n完成: created=${created}, updated=${updated}, skipped=${skipped}`)

  const r = await runPublisher()
  console.log(`feed 重建: ${r.projects} projects, ${r.posts} posts`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

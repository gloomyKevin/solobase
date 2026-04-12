/**
 * Publisher Agent
 *
 * 每次编辑操作完成后调用，重建 data/feed.json。
 * 输出格式严格对齐 feed-data.ts 和 Feed.tsx 的期望。
 *
 * 运行：node --env-file=.env.local ./node_modules/.bin/tsx scripts/agents/publisher.ts
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq, and, desc, inArray } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// ── stage → color 映射 ──────────────────────────────────────────

const STAGE_COLOR: Record<string, string> = {
  idea: '#F59E0B',
  building: '#3B82F6',
  launched: '#10B981',
  revenue: '#8B5CF6',
  scaling: '#EC4899',
  paused: '#9CA3AF',
  shutdown: '#EF4444',
}

// ── Feed 类型（对齐前端 Feed.tsx + feed-data.ts）────────────────

interface FeedProject {
  slug: string
  name: string
  tagline: string | null
  description: string | null
  url: string
  screenshot: string | null
  stage: string
  stageColor: string
  topics: string[]
  score: number
  author: string
  trustLevel: string
  featuredInsight: string | null
  isEditorsPick: boolean
  publishedAt: string | null
  source: string | null
  urlStatus: string
}

interface FeedPost {
  id: string
  slug: string
  type: string
  title: string
  body: string
  author: string
  authorBio: string | null
  score: number
  engagement: { likes: number; comments: number }
  topics: string[]
  publishedAt: string | null
  readingTime: number
  editorialSummary: string | null
  collectionAngle: string | null
  media: string | null
  source: string
}

interface Feed {
  projects: FeedProject[]
  posts: FeedPost[]
  buildAt: string
  version: number
}

// ── 工具函数 ────────────────────────────────────────────────────

function makePostSlug(id: string): string {
  if (id.startsWith('jike:')) return 'jike-' + id.slice(5, 17)
  if (id.startsWith('linuxdo:')) return 'ld-' + id.slice(8, 20)
  if (id.startsWith('v2ex:')) return 'v2ex-' + id.slice(5, 16)
  return id.replace(/[^a-z0-9-]/gi, '-').slice(0, 20)
}

function deriveTitle(item: { editorialSummary: string | null; body: string; inferredProductName: string | null }): string {
  // 优先用编辑摘要第一句
  if (item.editorialSummary) {
    const first = item.editorialSummary.split(/[。！？\n]/)[0]?.trim()
    if (first && first.length <= 80) return first
  }
  // 有产品名就用产品名
  if (item.inferredProductName) return item.inferredProductName
  // 兜底取正文第一行
  const firstLine = item.body.split('\n').find(l => l.trim().length > 5)
  return (firstLine || item.body).trim().slice(0, 80)
}

// ── 构建函数 ────────────────────────────────────────────────────

export async function buildFeed(): Promise<Feed> {
  // 已发布的 projects
  const projects = await db.query.projects.findMany({
    where: and(
      inArray(schema.projects.publishStatus, ['published', 'featured']),
      eq(schema.projects.entityStatus, 'active'),
    ),
    orderBy: [desc(schema.projects.publishedAtEditorial)],
  })

  // 查每个 project 的第一个关联作者
  const projectAuthors: Record<string, string> = {}
  if (projects.length > 0) {
    const links = await client.execute(`
      SELECT cpl.project_id, ci.author_name
      FROM content_project_links cpl
      JOIN content_items ci ON ci.id = cpl.content_item_id
      WHERE cpl.project_id IN (${projects.map(() => '?').join(',')})
      GROUP BY cpl.project_id
    `, projects.map(p => p.id))
    for (const row of links.rows) {
      projectAuthors[row.project_id as string] = row.author_name as string
    }
  }

  // 已发布的 posts（content_items）
  const posts = await db.query.contentItems.findMany({
    where: and(
      eq(schema.contentItems.publishStatus, 'published'),
      eq(schema.contentItems.entityStatus, 'active'),
    ),
    orderBy: [desc(schema.contentItems.publishedAtEditorial)],
    limit: 200,
  })

  const feedProjects: FeedProject[] = projects.map(p => ({
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? null,
    description: p.description ?? null,
    url: p.url,
    screenshot: p.screenshot ?? null,
    stage: p.stage ?? 'launched',
    stageColor: STAGE_COLOR[p.stage ?? 'launched'] ?? '#9CA3AF',
    topics: (p.topics as string[] | null) ?? [],
    score: p.isEditorsPick ? 18 : 12,
    author: projectAuthors[p.id] ?? '',
    trustLevel: p.trustLevel,
    featuredInsight: p.featuredInsight ?? null,
    isEditorsPick: p.isEditorsPick ?? false,
    publishedAt: p.publishedAtEditorial?.toISOString() ?? null,
    source: null,
    urlStatus: p.urlStatus ?? 'unknown',
  }))

  const feedPosts: FeedPost[] = posts.map(p => ({
    id: p.id,
    slug: makePostSlug(p.id),
    type: p.contentType ?? 'other',
    title: deriveTitle({ editorialSummary: p.editorialSummary, body: p.body, inferredProductName: p.inferredProductName }),
    body: p.body,
    author: p.authorName,
    authorBio: p.authorBio ?? null,
    score: Math.round((p.confidence ?? 0.5) * 20),
    engagement: { likes: p.likesCount ?? 0, comments: p.commentsCount ?? 0 },
    topics: (p.topics as string[] | null) ?? [],
    publishedAt: p.publishedAtEditorial?.toISOString() ?? p.publishedAt?.toISOString() ?? null,
    readingTime: Math.ceil(p.body.length / 500),
    editorialSummary: p.editorialSummary ?? null,
    collectionAngle: p.collectionAngle ?? null,
    media: p.media ?? null,
    source: p.source,
  }))

  let version = 1
  if (existsSync('data/feed.json')) {
    try {
      const existing = JSON.parse(readFileSync('data/feed.json', 'utf8'))
      version = ((existing.version ?? existing.meta?.version) ?? 0) + 1
    } catch {}
  }

  return { projects: feedProjects, posts: feedPosts, buildAt: new Date().toISOString(), version }
}

export async function runPublisher(): Promise<{ projects: number; posts: number; version: number }> {
  const feed = await buildFeed()
  writeFileSync('data/feed.json', JSON.stringify(feed, null, 2))
  console.log(`[publisher] feed: ${feed.projects.length} projects, ${feed.posts.length} posts, v${feed.version}`)
  return { projects: feed.projects.length, posts: feed.posts.length, version: feed.version }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPublisher()
    .then(r => { console.log(`完成：${r.projects} 产品，${r.posts} 帖子，v${r.version}`); process.exit(0) })
    .catch(err => { console.error(err); process.exit(1) })
}

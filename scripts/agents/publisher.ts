/**
 * Publisher Agent
 *
 * 每次编辑操作完成后调用，增量更新 data/feed.json。
 * 可被 API route（飞书回调 / /admin）直接 await，也可独立运行。
 *
 * 运行：node --env-file=.env.local ./node_modules/.bin/tsx scripts/agents/publisher.ts
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// ── 类型（与前端 feed.json 保持兼容）───────────────────────────

interface FeedProject {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  url: string
  screenshot: string | null
  stage: string | null
  topics: string[]
  trustLevel: string
  featuredInsight: string | null
  vibes: string[]
  isEditorsPick: boolean
  publishedAt: string | null
  source: string | null       // 来源平台（即刻/linuxdo/...）
  urlStatus: string
}

interface FeedPost {
  id: string
  source: string
  authorName: string
  body: string
  likesCount: number
  commentsCount: number
  publishedAt: string | null
  contentType: string | null
  editorialSummary: string | null
  collectionAngle: string | null
  topics: string[]
  media: string | null
  confidence: number | null
}

interface Feed {
  projects: FeedProject[]
  posts: FeedPost[]
  buildAt: string
  version: number
}

// ── 构建函数 ─────────────────────────────────────────────────────

export async function buildFeed(): Promise<Feed> {
  // 已发布产品
  const projects = await db.query.projects.findMany({
    where: and(
      eq(schema.projects.publishStatus, 'published'),
      eq(schema.projects.entityStatus, 'active'),
    ),
    orderBy: [desc(schema.projects.publishedAtEditorial)],
  })

  // 已发布帖子（内容帖，非产品本身）
  const posts = await db.query.contentItems.findMany({
    where: and(
      eq(schema.contentItems.publishStatus, 'published'),
      eq(schema.contentItems.entityStatus, 'active'),
    ),
    orderBy: [desc(schema.contentItems.publishedAtEditorial)],
    limit: Math.max(Math.floor(projects.length / 3), 10),
  })

  const feedProjects: FeedProject[] = projects.map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? null,
    description: p.description ?? null,
    url: p.url,
    screenshot: p.screenshot ?? null,
    stage: p.stage ?? null,
    topics: (p.topics as string[] | null) ?? [],
    trustLevel: p.trustLevel,
    featuredInsight: p.featuredInsight ?? null,
    vibes: (p.vibes as string[] | null) ?? [],
    isEditorsPick: p.isEditorsPick ?? false,
    publishedAt: p.publishedAtEditorial?.toISOString() ?? null,
    source: null,   // 从 project_sources 聚合来，暂不填
    urlStatus: p.urlStatus ?? 'unknown',
  }))

  const feedPosts: FeedPost[] = posts.map(p => ({
    id: p.id,
    source: p.source,
    authorName: p.authorName,
    body: p.body,
    likesCount: p.likesCount ?? 0,
    commentsCount: p.commentsCount ?? 0,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    contentType: p.contentType ?? null,
    editorialSummary: p.editorialSummary ?? null,
    collectionAngle: p.collectionAngle ?? null,
    topics: (p.topics as string[] | null) ?? [],
    media: p.media ?? null,
    confidence: p.confidence ?? null,
  }))

  // 读现有 feed 获取版本号（增量递增）
  let version = 1
  if (existsSync('data/feed.json')) {
    try {
      const existing: Feed = JSON.parse(readFileSync('data/feed.json', 'utf8'))
      version = (existing.version ?? 0) + 1
    } catch {}
  }

  return {
    projects: feedProjects,
    posts: feedPosts,
    buildAt: new Date().toISOString(),
    version,
  }
}

export async function runPublisher(): Promise<{ projects: number; posts: number; version: number }> {
  const feed = await buildFeed()

  writeFileSync('data/feed.json', JSON.stringify(feed, null, 2))

  console.log(
    `[publisher] feed built: ${feed.projects.length} projects, ${feed.posts.length} posts, v${feed.version}`
  )

  return { projects: feed.projects.length, posts: feed.posts.length, version: feed.version }
}

// ── 独立运行 ─────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPublisher()
    .then(r => {
      console.log(`完成：${r.projects} 产品，${r.posts} 帖子，v${r.version}`)
      process.exit(0)
    })
    .catch(err => { console.error(err); process.exit(1) })
}

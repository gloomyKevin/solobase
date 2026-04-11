/**
 * Linux.do 抓取 adapter (Discourse API)
 *
 * 使用:
 *   npx tsx scripts/crawl/linuxdo.ts --probe
 *   npx tsx scripts/crawl/linuxdo.ts
 *
 * 无需 API key，Discourse 标准 API
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'linuxdo')
const BASE_URL = 'https://linux.do'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

interface LinuxdoConfig {
  // 要抓取的分类 ID 列表
  categories: { id: number; name: string }[]
  // 要抓取的 tag 列表（可选，按 tag 抓）
  tags: string[]
  maxPagesPerCategory: number
  maxPagesPerTag: number
  delayMs: number
  // 拉帖子详情的最低 like 数
  minLikes: number
}

function loadConfig(): LinuxdoConfig {
  const configPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return config.linuxdo
}

// ─── API ────────────────────────────────────────────────────────

function fetchJSON(urlPath: string): any {
  // 用 curl 绕过 Cloudflare TLS 指纹检测
  const result = execSync(
    `curl -s "${BASE_URL}${urlPath}" -H "User-Agent: ${UA}" -H "Accept: application/json"`,
    { encoding: 'utf-8', timeout: 15000 }
  )
  return JSON.parse(result)
}

// ─── 列表页 — 按分类或 tag ────────────────────────────────────

interface TopicBrief {
  id: number
  title: string
  views: number
  replies: number
  likes: number
  created_at: string
  tags: string[]
  category_id: number
}

function fetchCategoryPage(categoryId: number, page: number): Promise<{ topics: TopicBrief[]; more: boolean }> {
  const data = fetchJSON(`/latest.json?category=${categoryId}&page=${page}`)
  const topics: TopicBrief[] = (data.topic_list?.topics || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    views: t.views || 0,
    replies: (t.posts_count || 1) - 1,
    likes: t.like_count || 0,
    created_at: t.created_at,
    tags: t.tags || [],
    category_id: t.category_id,
  }))
  const more = !!data.topic_list?.more_topics_url
  return { topics, more }
}

function fetchTagPage(tag: string, page: number): Promise<{ topics: TopicBrief[]; more: boolean }> {
  const data = fetchJSON(`/tag/${tag}.json?page=${page}`)
  const topics: TopicBrief[] = (data.topic_list?.topics || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    views: t.views || 0,
    replies: (t.posts_count || 1) - 1,
    likes: t.like_count || 0,
    created_at: t.created_at,
    tags: t.tags || [],
    category_id: t.category_id,
  }))
  const more = !!data.topic_list?.more_topics_url
  return { topics, more }
}

// ─── 帖子详情 ──────────────────────────────────────────────────

function fetchTopicDetail(topicId: number): Promise<any> {
  try {
    const data = fetchJSON(`/t/topic/${topicId}.json`)
    const post = data.post_stream?.posts?.[0]
    return {
      id: data.id,
      title: data.title,
      views: data.views,
      like_count: data.like_count,
      posts_count: data.posts_count,
      tags: data.tags,
      category_id: data.category_id,
      created_at: data.created_at,
      author: post?.username,
      author_name: post?.name || post?.username,
      body: post?.cooked?.replace(/<[^>]+>/g, '') || '', // strip HTML
      body_html: post?.cooked || '',
      // 前几条高赞回复
      top_replies: (data.post_stream?.posts || [])
        .slice(1, 11) // 跳过主帖，取前 10 条回复
        .filter((p: any) => (p.cooked || '').length > 20)
        .map((p: any) => ({
          author: p.username,
          content: (p.cooked || '').replace(/<[^>]+>/g, '').slice(0, 300),
          likes: p.like_count || 0,
        })),
    }
  } catch {
    return null
  }
}

// ─── Probe ──────────────────────────────────────────────────────

function probe(config: LinuxdoConfig): Promise<boolean> {
  console.log('验证 Linux.do...')
  try {
    const { topics } = fetchCategoryPage(4, 0) // 开发调优
    console.log(`  列表 API: ${topics.length} 帖子`)
    if (topics[0]) {
      console.log(`  示例: ${topics[0].title} (${topics[0].views} views, ${topics[0].likes} likes)`)
    }
    return true
  } catch (err) {
    console.error('连接失败:', (err as Error).message)
    return false
  }
}

// ─── 抓取 ───────────────────────────────────────────────────────

function crawlSource(
  label: string,
  fetchPage: (page: number) => Promise<{ topics: TopicBrief[]; more: boolean }>,
  maxPages: number,
  config: LinuxdoConfig
): Promise<any[]> {
  console.log(`\n[${label}]`)
  const seenIds = new Set<number>()
  const allTopics: TopicBrief[] = []

  for (let p = 0; p < maxPages; p++) {
    try {
      const { topics, more } = fetchPage(p)
      if (topics.length === 0) break

      let newCount = 0
      for (const t of topics) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id)
          allTopics.push(t)
          newCount++
        }
      }
      if (newCount === 0) break
      process.stdout.write(`  page ${p}: +${newCount} (${allTopics.length})\r`)
      if (!more) break
      execSync(`sleep ${config.delayMs / 1000}`)
    } catch (err) {
      console.error(`  page ${p} error:`, (err as Error).message)
      break
    }
  }
  console.log(`  列表完成: ${allTopics.length} 帖子`)

  // 拉详情（只拉 likes >= minLikes 的）
  const worthDetail = allTopics.filter(t => t.likes >= config.minLikes)
  console.log(`  拉详情: ${worthDetail.length} 帖子 (likes >= ${config.minLikes})`)

  const detailed: any[] = []
  for (let i = 0; i < worthDetail.length; i++) {
    const detail = fetchTopicDetail(worthDetail[i].id)
    if (detail) detailed.push(detail)
    if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${worthDetail.length}\r`)
    execSync(`sleep ${config.delayMs / 1000}`)
  }
  console.log(`  详情完成: ${detailed.length} 帖子`)
  return detailed
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const config = loadConfig()
  const args = process.argv.slice(2)

  if (args.includes('--probe')) {
    probe(config)
    return
  }

  const ok = probe(config)
  if (!ok) process.exit(1)

  fs.mkdirSync(RAW_DIR, { recursive: true })

  const allData: any[] = []

  // 按分类抓
  for (const cat of config.categories) {
    const data = crawlSource(
      cat.name,
      (p) => fetchCategoryPage(cat.id, p),
      config.maxPagesPerCategory,
      config
    )
    allData.push(...data)
  }

  // 按 tag 抓
  for (const tag of config.tags) {
    const data = crawlSource(
      `tag:${tag}`,
      (p) => fetchTagPage(tag, p),
      config.maxPagesPerTag,
      config
    )
    allData.push(...data)
  }

  // 去重
  const seen = new Set<number>()
  const unique = allData.filter(t => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })

  // 保存
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filepath = path.join(RAW_DIR, `linuxdo_${date}.json`)
  fs.writeFileSync(filepath, JSON.stringify(unique, null, 2), 'utf-8')

  console.log(`\n=== 完成 ===`)
  console.log(`  总计: ${unique.length} 帖子 (去重后)`)
  console.log(`  保存 → ${path.relative(process.cwd(), filepath)}`)
}

try {
  main()
} catch (err) {
  console.error('Fatal:', err)
  process.exit(1)
}

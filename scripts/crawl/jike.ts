/**
 * 即刻数据抓取脚本 — 支持圈子抓取 + 关键词搜索两种模式
 *
 * 使用:
 *   npx tsx scripts/crawl/jike.ts                  # 抓取全部（圈子 + 搜索）
 *   npx tsx scripts/crawl/jike.ts --probe          # 验证 API
 *   npx tsx scripts/crawl/jike.ts --search-only    # 只跑搜索
 *   npx tsx scripts/crawl/jike.ts --topic-only     # 只跑圈子
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Types ───────────────────────────────────────────────────────

interface Config {
  jike: {
    apiBase: string
    accessToken: string
    topics: { id: string; name: string }[]
    searchKeywords: string[]
    maxPagesPerTopic: number
    maxPagesPerKeyword: number
    delayMs: number
  }
}

interface CrawlStats {
  source: string
  mode: 'topic' | 'search'
  label: string
  totalPosts: number
  crawledAt: string
  pages: number
}

// ─── Config ──────────────────────────────────────────────────────

function loadConfig(): Config {
  const configPath = path.join(__dirname, 'config.json')
  if (!fs.existsSync(configPath)) {
    console.error(
      '找不到 config.json\n' +
      '   复制 config.example.json → config.json 并填入你的 token'
    )
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

// ─── API helpers ─────────────────────────────────────────────────

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    'x-jike-access-token': token,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  }
}

async function apiFetch(url: string, token: string, body: Record<string, any>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<any>
}

// ─── Topic feed ──────────────────────────────────────────────────

async function fetchTopicFeed(
  config: Config['jike'],
  topicId: string,
  loadMoreKey?: Record<string, string>
) {
  const body: Record<string, any> = { topicId, limit: 20 }
  if (loadMoreKey) body.loadMoreKey = loadMoreKey
  return apiFetch(`${config.apiBase}/1.0/topicFeed/list`, config.accessToken, body)
}

// ─── Search ──────────────────────────────────────────────────────

async function fetchSearch(
  config: Config['jike'],
  keywords: string,
  skip: number = 0
) {
  const body: Record<string, any> = { keywords, limit: 20 }
  if (skip > 0) body.loadMoreKey = { skip: String(skip) }
  return apiFetch(`${config.apiBase}/1.0/search/integrate`, config.accessToken, body)
}

// ─── Probe ───────────────────────────────────────────────────────

async function probe(config: Config['jike']): Promise<boolean> {
  console.log('验证 API 连接...')
  console.log(`   Base: ${config.apiBase}`)
  console.log(`   Token: ${config.accessToken.slice(0, 8)}...`)

  try {
    // test topic feed
    if (config.topics.length > 0) {
      const result = await fetchTopicFeed(config, config.topics[0].id)
      console.log(`   Topic API: ${result.data?.length ?? 0} posts`)
    }
    // test search
    const searchResult = await fetchSearch(config, '独立开发')
    const posts = (searchResult.data || []).filter((i: any) => i.type === 'ORIGINAL_POST')
    console.log(`   Search API: ${posts.length} posts`)
    console.log('API 正常')
    return true
  } catch (err) {
    console.error('API 连接失败:', (err as Error).message)
    return false
  }
}

// ─── Storage ─────────────────────────────────────────────────────

const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'jike')

function savePosts(label: string, posts: any[]): string {
  fs.mkdirSync(RAW_DIR, { recursive: true })
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName = label.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_')
  const filename = `${safeName}_${date}.json`
  const filepath = path.join(RAW_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(posts, null, 2), 'utf-8')
  return filepath
}

function saveStats(allStats: CrawlStats[]) {
  fs.mkdirSync(RAW_DIR, { recursive: true })
  const filepath = path.join(RAW_DIR, '_crawl_log.json')
  let existing: CrawlStats[] = []
  if (fs.existsSync(filepath)) {
    existing = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  }
  existing.push(...allStats)
  fs.writeFileSync(filepath, JSON.stringify(existing, null, 2), 'utf-8')
}

// ─── Crawl: Topic ────────────────────────────────────────────────

async function crawlTopic(
  config: Config['jike'],
  topic: { id: string; name: string }
): Promise<CrawlStats> {
  console.log(`\n[Topic] ${topic.name}`)

  const allPosts: any[] = []
  let loadMoreKey: Record<string, string> | undefined
  let page = 0

  while (page < config.maxPagesPerTopic) {
    try {
      const result = await fetchTopicFeed(config, topic.id, loadMoreKey)
      const posts: any[] = result.data || []
      if (posts.length === 0) break

      allPosts.push(...posts)
      page++
      process.stdout.write(`   ${page}: +${posts.length} (${allPosts.length})\r`)

      loadMoreKey = result.loadMoreKey
      if (!loadMoreKey) break
      await new Promise(r => setTimeout(r, config.delayMs))
    } catch (err) {
      console.error(`   page ${page + 1} error:`, (err as Error).message)
      break
    }
  }

  if (allPosts.length > 0) {
    const fp = savePosts(`topic_${topic.name}`, allPosts)
    console.log(`   ${allPosts.length} posts saved → ${path.relative(process.cwd(), fp)}`)
  }

  return { source: 'jike', mode: 'topic', label: topic.name, totalPosts: allPosts.length, crawledAt: new Date().toISOString(), pages: page }
}

// ─── Crawl: Search ───────────────────────────────────────────────

async function crawlSearch(
  config: Config['jike'],
  keyword: string
): Promise<CrawlStats> {
  console.log(`\n[Search] "${keyword}"`)

  const allPosts: any[] = []
  let skip = 0
  let page = 0

  while (page < config.maxPagesPerKeyword) {
    try {
      const result = await fetchSearch(config, keyword, skip)
      // 搜索结果是混合的，只取帖子
      const posts = (result.data || []).filter((i: any) => i.type === 'ORIGINAL_POST')
      if (posts.length === 0) break

      allPosts.push(...posts)
      page++
      process.stdout.write(`   ${page}: +${posts.length} (${allPosts.length})\r`)

      // 分页: skip 值从 loadMoreKey 中取
      const nextKey = result.loadMoreKey
      if (!nextKey?.skip) break
      skip = parseInt(nextKey.skip, 10)
      if (isNaN(skip)) break

      await new Promise(r => setTimeout(r, config.delayMs))
    } catch (err) {
      console.error(`   page ${page + 1} error:`, (err as Error).message)
      break
    }
  }

  if (allPosts.length > 0) {
    const fp = savePosts(`search_${keyword}`, allPosts)
    console.log(`   ${allPosts.length} posts saved → ${path.relative(process.cwd(), fp)}`)
  }

  return { source: 'jike', mode: 'search', label: keyword, totalPosts: allPosts.length, crawledAt: new Date().toISOString(), pages: page }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig()
  const jike = config.jike
  const args = process.argv.slice(2)

  const probeOnly = args.includes('--probe')
  const searchOnly = args.includes('--search-only')
  const topicOnly = args.includes('--topic-only')

  const ok = await probe(jike)
  if (!ok) process.exit(1)
  if (probeOnly) return

  const allStats: CrawlStats[] = []

  // Topic crawl
  if (!searchOnly && jike.topics.length > 0) {
    console.log(`\n--- Topic 抓取: ${jike.topics.length} 个圈子 ---`)
    for (const topic of jike.topics) {
      allStats.push(await crawlTopic(jike, topic))
    }
  }

  // Search crawl
  if (!topicOnly && jike.searchKeywords.length > 0) {
    console.log(`\n--- Search 抓取: ${jike.searchKeywords.length} 个关键词 ---`)
    for (const kw of jike.searchKeywords) {
      allStats.push(await crawlSearch(jike, kw))
    }
  }

  saveStats(allStats)

  // 汇总
  console.log('\n' + '='.repeat(50))
  let total = 0
  for (const s of allStats) {
    console.log(`   [${s.mode}] ${s.label}: ${s.totalPosts} posts (${s.pages} pages)`)
    total += s.totalPosts
  }
  console.log(`   Total: ${total} posts`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

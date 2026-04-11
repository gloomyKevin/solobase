/**
 * V2EX「分享创造」节点抓取 adapter
 *
 * 使用:
 *   npx tsx scripts/crawl/v2ex.ts              # 抓取
 *   npx tsx scripts/crawl/v2ex.ts --probe      # 验证
 *
 * 无需 API key，直接抓取网页 + 用 v1 API 补全帖子详情
 */

import fs from 'node:fs'
import path from 'node:path'

const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'v2ex')
const BASE_URL = 'https://www.v2ex.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

interface V2EXConfig {
  maxPages: number
  delayMs: number
  fetchReplies: boolean
  minReplies: number // 只拉回复数 >= 此值的帖子的回复
}

function loadConfig(): V2EXConfig {
  const configPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return config.v2ex || { maxPages: 50, delayMs: 2000, fetchReplies: true, minReplies: 3 }
}

// ─── 列表页抓取 ─────────────────────────────────────────────────

interface TopicBrief {
  id: string
  title: string
  author: string
  replies: number
}

async function fetchTopicList(page: number): Promise<TopicBrief[]> {
  const res = await fetch(`${BASE_URL}/go/create?p=${page}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`page ${page}: ${res.status}`)
  const html = await res.text()

  const topics: TopicBrief[] = []
  // 匹配: <a href="/t/ID#replyN" class="topic-link" ...>TITLE</a>
  // 后面跟着 <a href="/member/USERNAME">
  const pattern = /<a[^>]*href="\/t\/(\d+)#[^"]*"[^>]*class="topic-link"[^>]*>([^<]+)<\/a>[\s\S]*?<a href="\/member\/([^"]+)">/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(html)) !== null) {
    topics.push({ id: m[1], title: m[2].trim(), author: m[3], replies: 0 })
  }

  // 补充回复数: <a href="/t/ID#replyN" class="count_livid">N</a>
  const replyPattern = /<a href="\/t\/(\d+)#[^"]*" class="count_(?:livid|orange)">(\d+)<\/a>/g
  while ((m = replyPattern.exec(html)) !== null) {
    const topic = topics.find(t => t.id === m![1])
    if (topic) topic.replies = parseInt(m[2], 10)
  }

  return topics
}

// ─── 帖子详情（v1 API） ────────────────────────────────────────

async function fetchTopicDetail(topicId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/topics/show.json?id=${topicId}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) return null
  const data = await res.json() as any[]
  return data?.[0] || null
}

// ─── 回复（v1 API） ────────────────────────────────────────────

async function fetchReplies(topicId: string): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/api/replies/show.json?topic_id=${topicId}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) return []
  return (await res.json()) as any[]
}

// ─── Probe ──────────────────────────────────────────────────────

async function probe(): Promise<boolean> {
  console.log('验证 V2EX...')
  try {
    const topics = await fetchTopicList(1)
    console.log(`  列表页: ${topics.length} 个帖子`)
    if (topics[0]) {
      const detail = await fetchTopicDetail(topics[0].id)
      console.log(`  详情 API: ${detail ? 'OK' : 'FAIL'}`)
      console.log(`  示例: ${topics[0].title} (by ${topics[0].author}, ${topics[0].replies} replies)`)
    }
    return true
  } catch (err) {
    console.error('V2EX 连接失败:', (err as Error).message)
    return false
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const config = loadConfig()
  const args = process.argv.slice(2)

  if (args.includes('--probe')) {
    await probe()
    return
  }

  const ok = await probe()
  if (!ok) process.exit(1)

  fs.mkdirSync(RAW_DIR, { recursive: true })

  // Step 1: 抓列表页，收集所有 topic ID
  console.log(`\n抓取列表页 (最多 ${config.maxPages} 页)`)
  const allTopics: TopicBrief[] = []
  const seenIds = new Set<string>()

  for (let p = 1; p <= config.maxPages; p++) {
    try {
      const topics = await fetchTopicList(p)
      if (topics.length === 0) { console.log(`  page ${p}: 空页，停止`); break }

      let newCount = 0
      for (const t of topics) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id)
          allTopics.push(t)
          newCount++
        }
      }

      if (newCount === 0) { console.log(`  page ${p}: 无新帖子，停止`); break }
      process.stdout.write(`  page ${p}: +${newCount} (${allTopics.length})\r`)
      await new Promise(r => setTimeout(r, config.delayMs))
    } catch (err) {
      console.error(`  page ${p} error:`, (err as Error).message)
      break
    }
  }
  console.log(`\n列表抓取完成: ${allTopics.length} 个帖子`)

  // Step 2: 逐个拉详情
  console.log(`\n拉取详情...`)
  const fullTopics: any[] = []

  for (let i = 0; i < allTopics.length; i++) {
    const brief = allTopics[i]
    try {
      const detail = await fetchTopicDetail(brief.id)
      if (!detail) continue

      // 拉回复（只拉有一定回复量的）
      let replies: any[] = []
      if (config.fetchReplies && brief.replies >= config.minReplies) {
        replies = await fetchReplies(brief.id)
        await new Promise(r => setTimeout(r, 500))
      }

      fullTopics.push({ ...detail, replies_data: replies })
      if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${allTopics.length}\r`)
      await new Promise(r => setTimeout(r, config.delayMs))
    } catch (err) {
      console.error(`  topic ${brief.id} error:`, (err as Error).message)
    }
  }

  console.log(`详情抓取完成: ${fullTopics.length} 个帖子`)

  // 保存
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filepath = path.join(RAW_DIR, `create_${date}.json`)
  fs.writeFileSync(filepath, JSON.stringify(fullTopics, null, 2), 'utf-8')
  console.log(`\n保存 → ${path.relative(process.cwd(), filepath)}`)

  // 统计
  const withReplies = fullTopics.filter(t => (t.replies_data?.length || 0) > 0).length
  console.log(`\n统计:`)
  console.log(`  帖子总数: ${fullTopics.length}`)
  console.log(`  有回复: ${withReplies}`)
  console.log(`  平均回复数: ${(fullTopics.reduce((s, t) => s + (t.replies || 0), 0) / fullTopics.length).toFixed(1)}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

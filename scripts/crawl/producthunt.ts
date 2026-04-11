/**
 * Product Hunt 数据抓取脚本
 *
 * 使用:
 *   npx tsx scripts/crawl/producthunt.ts --probe       # 验证 API
 *   npx tsx scripts/crawl/producthunt.ts               # 全量抓取
 *   npx tsx scripts/crawl/producthunt.ts --filter-only  # 只跑过滤（不抓取）
 *
 * 需要在 config.json 中配置 producthunt.accessToken
 * 获取: https://www.producthunt.com/v2/oauth/applications → CREATE TOKEN
 */

import fs from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'producthunt')

// ─── Config ──────────────────────────────────────────────────────

interface PHConfig {
  accessToken: string
  // 抓取多少天的数据
  daysBack: number
  // 最低 upvotes 数（抓取时就过滤，节省 API quota）
  minVotes: number
  delayMs: number
}

function loadConfig(): PHConfig {
  const configPath = path.join(__dirname, 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return config.producthunt
}

// ─── GraphQL ─────────────────────────────────────────────────────

const POSTS_QUERY = `
query GetPosts($cursor: String, $postedAfter: DateTime, $postedBefore: DateTime) {
  posts(
    first: 20
    after: $cursor
    postedAfter: $postedAfter
    postedBefore: $postedBefore
    order: VOTES
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        name
        tagline
        description
        slug
        url
        website
        votesCount
        commentsCount
        reviewsCount
        reviewsRating
        featuredAt
        createdAt
        productLinks {
          type
          url
        }
        thumbnail {
          url
        }
        topics {
          edges {
            node {
              name
              slug
            }
          }
        }
        makers {
          id
          name
          headline
          twitterUsername
          websiteUrl
        }
      }
    }
  }
}
`

async function graphql(token: string, query: string, variables: Record<string, any> = {}) {
  const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 429) {
    // 限频：从 header 或 body 拿 reset 时间，等待后重试
    const body = await res.json().catch(() => ({})) as any
    const resetIn = body?.errors?.[0]?.details?.reset_in || 900
    console.log(`\n  限频! 等待 ${resetIn}s ...`)
    await new Promise(r => setTimeout(r, (resetIn + 5) * 1000))
    return graphql(token, query, variables) // 重试
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PH API ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json() as any
  if (data.errors?.length) {
    if (data.errors[0].error === 'rate_limit_reached') {
      const resetIn = data.errors[0].details?.reset_in || 900
      console.log(`\n  限频! 等待 ${resetIn}s ...`)
      await new Promise(r => setTimeout(r, (resetIn + 5) * 1000))
      return graphql(token, query, variables)
    }
    throw new Error(`GraphQL error: ${data.errors[0].message}`)
  }

  return data
}

// ─── Probe ───────────────────────────────────────────────────────

async function probe(config: PHConfig): Promise<boolean> {
  console.log('验证 PH API...')
  try {
    const result = await graphql(config.accessToken, POSTS_QUERY, {
      postedAfter: new Date(Date.now() - 7 * 86400000).toISOString(),
    })
    const posts = result.data?.posts?.edges || []
    console.log(`API 正常，最近 7 天 top posts: ${posts.length} 条`)
    if (posts[0]) {
      const p = posts[0].node
      console.log(`  示例: ${p.name} — ${p.tagline} (${p.votesCount} votes)`)
    }
    return true
  } catch (err) {
    console.error('API 失败:', (err as Error).message)
    return false
  }
}

// ─── Crawl ───────────────────────────────────────────────────────

interface RawProduct {
  id: string
  name: string
  tagline: string
  description: string
  slug: string
  phUrl: string
  website: string
  productLinks: { type: string; url: string }[]
  votesCount: number
  commentsCount: number
  reviewsCount: number
  reviewsRating: number
  featuredAt: string | null
  createdAt: string
  thumbnailUrl: string
  topics: string[]
  makers: { name: string; headline: string; twitter: string; website: string }[]
}

function normalizePost(node: any): RawProduct {
  return {
    id: node.id,
    name: node.name,
    tagline: node.tagline,
    description: node.description || '',
    slug: node.slug,
    phUrl: `https://www.producthunt.com/posts/${node.slug}`,
    website: node.website || '',
    productLinks: (node.productLinks || []).map((l: any) => ({ type: l.type, url: l.url })),
    votesCount: node.votesCount || 0,
    commentsCount: node.commentsCount || 0,
    reviewsCount: node.reviewsCount || 0,
    reviewsRating: node.reviewsRating || 0,
    featuredAt: node.featuredAt,
    createdAt: node.createdAt,
    thumbnailUrl: node.thumbnail?.url || '',
    topics: (node.topics?.edges || []).map((e: any) => e.node.name),
    makers: (node.makers || []).map((m: any) => ({
      name: m.name,
      headline: m.headline || '',
      twitter: m.twitterUsername || '',
      website: m.websiteUrl || '',
    })),
  }
}

async function crawlPeriod(
  config: PHConfig,
  after: Date,
  before: Date
): Promise<RawProduct[]> {
  const label = `${after.toISOString().slice(0, 10)} ~ ${before.toISOString().slice(0, 10)}`
  const allProducts: RawProduct[] = []
  let cursor: string | null = null
  let page = 0
  let emptyPages = 0

  while (true) {
    const variables: Record<string, any> = {
      postedAfter: after.toISOString(),
      postedBefore: before.toISOString(),
    }
    if (cursor) variables.cursor = cursor

    const result = await graphql(config.accessToken, POSTS_QUERY, variables)
    const edges = result.data?.posts?.edges || []

    if (edges.length === 0) break

    const prevCount = allProducts.length
    for (const edge of edges) {
      const product = normalizePost(edge.node)
      if (product.votesCount >= config.minVotes) {
        allProducts.push(product)
      }
    }

    page++
    const added = allProducts.length - prevCount
    process.stdout.write(`  [${label}] page ${page}: ${allProducts.length} products\r`)

    // 如果连续整页都低于 minVotes，说明剩下的都不够分了，停止
    if (added === 0) {
      emptyPages++
      if (emptyPages >= 2) break
    } else {
      emptyPages = 0
    }

    const pageInfo = result.data?.posts?.pageInfo
    if (!pageInfo?.hasNextPage) break
    cursor = pageInfo.endCursor

    await new Promise(r => setTimeout(r, config.delayMs))
  }

  console.log(`  [${label}] 完成: ${allProducts.length} products (${page} pages)`)
  return allProducts
}

async function crawl(config: PHConfig): Promise<RawProduct[]> {
  fs.mkdirSync(RAW_DIR, { recursive: true })

  const allProducts: RawProduct[] = []
  const now = new Date()

  // 按月分段抓取，避免单次请求数据量过大
  for (let i = 0; i < config.daysBack; i += 30) {
    const before = new Date(now.getTime() - i * 86400000)
    const after = new Date(now.getTime() - Math.min(i + 30, config.daysBack) * 86400000)

    const products = await crawlPeriod(config, after, before)
    allProducts.push(...products)

    // 每段及时保存，防止中断丢数据
    const tmpPath = path.join(RAW_DIR, '_progress.json')
    fs.writeFileSync(tmpPath, JSON.stringify(allProducts, null, 2), 'utf-8')
  }

  // 去重
  const seen = new Set<string>()
  const unique = allProducts.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  // 保存原始数据
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filepath = path.join(RAW_DIR, `ph_${date}.json`)
  fs.writeFileSync(filepath, JSON.stringify(unique, null, 2), 'utf-8')
  console.log(`\n保存 ${unique.length} 个产品 → ${path.relative(process.cwd(), filepath)}`)

  return unique
}

// ─── Filter: 适合 Solobase 的产品 ────────────────────────────────

interface ScoredProduct {
  score: number
  signals: string[]
  name: string
  tagline: string
  description: string
  website: string
  phUrl: string
  thumbnailUrl: string
  votesCount: number
  commentsCount: number
  reviewsRating: number
  topics: string[]
  makers: { name: string; headline: string; twitter: string; website: string }[]
  createdAt: string
}

// Solobase 定位：独立开发者/小团队做的产品，不是大厂产品
const INDIE_SIGNALS = [
  'developer tools', 'productivity', 'saas', 'open source',
  'chrome extensions', 'design tools', 'marketing',
  'artificial intelligence', 'no-code', 'writing',
  'task management', 'analytics', 'email', 'social media',
  'web app', 'mac', 'ios', 'android',
]

// 大厂/非独立产品过滤
const BIG_CORP_NAMES = [
  'google', 'microsoft', 'apple', 'amazon', 'meta', 'facebook',
  'openai', 'anthropic', 'netflix', 'uber', 'spotify',
  'salesforce', 'adobe', 'notion', 'figma', 'vercel',
]

function scoreProduct(p: RawProduct): ScoredProduct | null {
  // 硬过滤：大厂产品
  const lowerName = p.name.toLowerCase()
  const makerNames = p.makers.map(m => m.name.toLowerCase()).join(' ')
  for (const corp of BIG_CORP_NAMES) {
    if (makerNames.includes(corp)) return null
  }

  let score = 0
  const signals: string[] = []

  // 1. 投票数（核心信号）
  if (p.votesCount >= 500) { score += 6; signals.push(`${p.votesCount} votes`) }
  else if (p.votesCount >= 200) { score += 4; signals.push(`${p.votesCount} votes`) }
  else if (p.votesCount >= 100) { score += 3; signals.push(`${p.votesCount} votes`) }
  else if (p.votesCount >= 50) { score += 2 }

  // 2. 有评论/评价
  if (p.commentsCount >= 20) { score += 3; signals.push(`${p.commentsCount} comments`) }
  else if (p.commentsCount >= 5) { score += 1 }

  if (p.reviewsRating >= 4.5 && p.reviewsCount >= 3) {
    score += 2; signals.push(`${p.reviewsRating} rating`)
  }

  // 3. 被 PH 官方精选
  if (p.featuredAt) {
    score += 3; signals.push('featured')
  }

  // 4. 有网站（基本条件）
  if (p.website) score += 1

  // 5. Topic 匹配
  const topicLower = p.topics.map(t => t.toLowerCase())
  for (const sig of INDIE_SIGNALS) {
    if (topicLower.some(t => t.includes(sig))) {
      score += 1
      signals.push(`topic:${sig}`)
      break
    }
  }

  // 6. 独立开发者信号：小团队 (1-3 makers)
  if (p.makers.length >= 1 && p.makers.length <= 3) {
    score += 2
    signals.push(`${p.makers.length} makers`)
  }

  // 7. 时间加权
  if (p.createdAt) {
    const daysAgo = (Date.now() - new Date(p.createdAt).getTime()) / 86400000
    if (daysAgo <= 30) { score += 4; signals.push('近1月') }
    else if (daysAgo <= 90) { score += 2; signals.push('近3月') }
    else if (daysAgo <= 180) { score += 1 }
  }

  // 8. 有缩略图
  if (p.thumbnailUrl) score += 1

  return {
    score,
    signals,
    name: p.name,
    tagline: p.tagline,
    description: p.description.slice(0, 300),
    website: p.website,
    phUrl: p.phUrl,
    thumbnailUrl: p.thumbnailUrl,
    votesCount: p.votesCount,
    commentsCount: p.commentsCount,
    reviewsRating: p.reviewsRating,
    topics: p.topics,
    makers: p.makers,
    createdAt: p.createdAt,
  }
}

function filterProducts(products: RawProduct[]) {
  const scored: ScoredProduct[] = []
  let filtered = 0

  for (const p of products) {
    const result = scoreProduct(p)
    if (result) scored.push(result)
    else filtered++
  }

  scored.sort((a, b) => b.score - a.score)

  console.log(`\n过滤: ${filtered} 条大厂/低质丢弃`)
  console.log(`有效产品: ${scored.length} 条`)

  // 分数分布
  const dist = { '15+': 0, '10-14': 0, '5-9': 0, '<5': 0 }
  for (const p of scored) {
    if (p.score >= 15) dist['15+']++
    else if (p.score >= 10) dist['10-14']++
    else if (p.score >= 5) dist['5-9']++
    else dist['<5']++
  }
  console.log('分数分布:', dist)

  // 保存
  const outPath = path.join(RAW_DIR, '_filtered.json')
  fs.writeFileSync(outPath, JSON.stringify(scored, null, 2), 'utf-8')
  console.log(`已保存 → ${path.relative(process.cwd(), outPath)}`)

  // Top 10
  console.log('\n── Top 10 ──')
  for (const p of scored.slice(0, 10)) {
    const makers = p.makers.map(m => m.name).join(', ')
    console.log(`[${p.score}] ${p.name} — ${p.tagline}`)
    console.log(`     ${p.website || p.phUrl}`)
    console.log(`     ${p.votesCount} votes | ${makers} | ${p.topics.slice(0, 3).join(', ')}`)
  }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig()
  const args = process.argv.slice(2)

  if (args.includes('--probe')) {
    await probe(config)
    return
  }

  if (args.includes('--filter-only')) {
    // 只跑过滤，从已有文件读
    const files = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('ph_') && f.endsWith('.json'))
    if (files.length === 0) {
      console.error('没有原始数据，先运行抓取')
      process.exit(1)
    }
    let all: RawProduct[] = []
    for (const f of files) {
      all.push(...JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf-8')))
    }
    filterProducts(all)
    return
  }

  const ok = await probe(config)
  if (!ok) process.exit(1)

  console.log(`\n抓取最近 ${config.daysBack} 天，最低 ${config.minVotes} votes`)
  const products = await crawl(config)
  filterProducts(products)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

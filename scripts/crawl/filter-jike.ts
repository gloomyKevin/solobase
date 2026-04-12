/**
 * 即刻帖子过滤脚本 — 从原始数据中筛出有产品价值的帖子
 *
 * 使用:
 *   npx tsx scripts/crawl/filter-jike.ts                    # 过滤 + 拉评论
 *   npx tsx scripts/crawl/filter-jike.ts --no-comments      # 只过滤，不拉评论
 */

import fs from 'node:fs'
import path from 'node:path'

const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'jike')

// ─── 判断是否为外部链接（排除即刻站内链接） ──────────────────────

const JIKE_LINK_PATTERNS = [
  'jike://',
  'okjike.com',
  'm.okjike.com',
  'web.okjike.com',
]

function isExternalLink(url: string): boolean {
  return !JIKE_LINK_PATTERNS.some(p => url.includes(p))
}

// ─── 噪声检测：直接丢弃的内容 ──────────────────────────────────

const NOISE_PATTERNS = [
  // 招聘
  '招聘', '招人', '求职', '内推', '急招', 'JD', '岗位',
  // 营销水帖
  '转发抽奖', '抽奖', '福利放送',
  // 纯情绪/八卦
  '猝死', '离职', '裁员', '加班猝',
]

function isNoise(content: string): boolean {
  const lower = content.toLowerCase()
  // 如果噪声关键词出现在前 50 个字符内（标题位置），大概率是噪声帖
  const head = lower.slice(0, 50)
  return NOISE_PATTERNS.some(p => head.includes(p))
}

// ─── 产品关键词（命中加分） ──────────────────────────────────────

const PRODUCT_KEYWORDS = [
  '上线', '发布', '做了', '做了个', '开源', 'launch', 'ship',
  '产品', '工具', '应用', 'app', 'saas', '小程序',
  '独立开发', '副业', 'side project', 'indie',
  '收入', '营收', 'mrr', 'arr', '付费', '用户数',
  '官网', '落地页', 'landing page',
  'product hunt', 'producthunt',
  '出海', 'chrome扩展', 'chrome extension',
]

// ─── 打分 ────────────────────────────────────────────────────────

interface ScoredPost {
  score: number
  signals: string[]
  id: string
  content: string
  author: string
  authorBio: string
  likeCount: number
  commentCount: number
  repostCount: number
  createdAt: string
  url: string
  links: string[]
  pictures: string[]
  topComments?: { author: string; content: string; likeCount: number }[]
}

function extractExternalLinks(post: any): string[] {
  const links: string[] = []
  if (post.linkInfo?.linkUrl && isExternalLink(post.linkInfo.linkUrl)) {
    links.push(post.linkInfo.linkUrl)
  }
  if (post.urlsInText) {
    for (const u of post.urlsInText) {
      if (u.url && isExternalLink(u.url)) links.push(u.url)
    }
  }
  return [...new Set(links)]
}

function scorePost(post: any): ScoredPost | null {
  const content = post.content || ''
  const lower = content.toLowerCase()
  const links = extractExternalLinks(post)

  // ── 硬过滤：直接丢弃 ──
  if (isNoise(content)) return null
  if (post.type === 'REPOST') return null
  // 极短且无链接无图 = 无信息量，丢弃（保留纯文字的长帖，如独立开发复盘）
  if (links.length === 0 && (!post.pictures || post.pictures.length === 0) && content.length < 100) return null

  let score = 0
  const signals: string[] = []

  // 1. 外部链接（核心信号）
  if (links.length > 0) {
    score += 4
    signals.push(`${links.length} links`)
  }

  // 2. 互动数据
  if (post.likeCount >= 50) { score += 5; signals.push(`${post.likeCount} likes`) }
  else if (post.likeCount >= 20) { score += 3; signals.push(`${post.likeCount} likes`) }
  else if (post.likeCount >= 5) { score += 1 }

  if (post.commentCount >= 20) { score += 4; signals.push(`${post.commentCount} comments`) }
  else if (post.commentCount >= 5) { score += 2 }

  // 3. 图片
  if (post.pictures?.length > 0) {
    score += 1
    signals.push(`${post.pictures.length} pics`)
  }

  // 4. 精选
  if (post.isFeatured) {
    score += 2
    signals.push('featured')
  }

  // 5. 产品关键词
  for (const kw of PRODUCT_KEYWORDS) {
    if (lower.includes(kw)) {
      score += 2
      signals.push(`kw:${kw}`)
      break
    }
  }

  // 6. 内容长度
  if (content.length > 100) score += 1

  // 7. 时间加权
  if (post.createdAt) {
    const daysAgo = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysAgo <= 30) { score += 5; signals.push('近1月') }
    else if (daysAgo <= 90) { score += 3; signals.push('近3月') }
    else if (daysAgo <= 180) { score += 2; signals.push('近半年') }
    else if (daysAgo <= 365) { score += 1; signals.push('近1年') }
  }

  return {
    score,
    signals,
    id: post.id,
    content: content.slice(0, 300),
    author: post.user?.screenName || 'unknown',
    authorBio: (post.user?.bio || '').slice(0, 100),
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    repostCount: post.repostCount || 0,
    createdAt: post.createdAt,
    url: `https://web.okjike.com/originalPost/${post.id}`,
    links,
    pictures: (post.pictures || []).map((p: any) => p.middlePicUrl || p.picUrl).filter(Boolean),
  }
}

// ─── 评论拉取 ────────────────────────────────────────────────────

async function fetchTopComments(
  postId: string,
  token: string,
  apiBase: string
): Promise<{ author: string; content: string; likeCount: number }[]> {
  try {
    const res = await fetch(`${apiBase}/1.0/comments/listPrimary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jike-access-token': token,
      },
      body: JSON.stringify({
        targetId: postId,
        targetType: 'ORIGINAL_POST',
        limit: 10,
      }),
    })
    if (!res.ok) return []
    const data = await res.json() as any
    const comments = (data.data || [])
      .filter((c: any) => c.likeCount >= 1 || (c.content || '').length > 30)
      .sort((a: any, b: any) => (b.likeCount || 0) - (a.likeCount || 0))
      .slice(0, 5)
      .map((c: any) => ({
        author: c.user?.screenName || 'unknown',
        content: (c.content || '').slice(0, 200),
        likeCount: c.likeCount || 0,
      }))
    return comments
  } catch {
    return []
  }
}

// ─── 从 config 读 token ─────────────────────────────────────────

function loadToken(): { token: string; apiBase: string } | null {
  const configPath = path.join(process.cwd(), 'scripts', 'crawl', 'config.json')
  if (!fs.existsSync(configPath)) return null
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return { token: config.jike.accessToken, apiBase: config.jike.apiBase }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const noComments = args.includes('--no-comments')

  if (!fs.existsSync(RAW_DIR)) {
    console.error('没有找到原始数据，先运行 jike.ts 抓取')
    process.exit(1)
  }

  // 读取所有原始 JSON
  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  let allPosts: any[] = []
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf-8'))
    allPosts.push(...(Array.isArray(data) ? data : []))
  }
  console.log(`加载 ${allPosts.length} 条原始帖子 (${files.length} 文件)`)

  // 去重
  const seen = new Set<string>()
  allPosts = allPosts.filter(p => {
    if (!p.id || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  console.log(`去重后: ${allPosts.length} 条`)

  // 打分 + 过滤
  const scored: ScoredPost[] = []
  let filtered = 0
  for (const post of allPosts) {
    const result = scorePost(post)
    if (result) scored.push(result)
    else filtered++
  }
  scored.sort((a, b) => b.score - a.score)
  console.log(`噪声过滤: ${filtered} 条丢弃`)
  console.log(`有效帖子: ${scored.length} 条\n`)

  // 拉评论（只对 10+ 分且有评论的帖子拉）
  if (!noComments) {
    const auth = loadToken()
    if (auth) {
      const needComments = scored.filter(p => p.score >= 10 && p.commentCount >= 3)
      if (needComments.length > 0) {
        console.log(`拉取 ${needComments.length} 条高分帖子的评论...`)
        let done = 0
        for (const post of needComments) {
          const comments = await fetchTopComments(post.id, auth.token, auth.apiBase)
          if (comments.length > 0) post.topComments = comments
          done++
          if (done % 10 === 0) process.stdout.write(`  ${done}/${needComments.length}\r`)
          await new Promise(r => setTimeout(r, 500))
        }
        const withComments = needComments.filter(p => p.topComments?.length).length
        console.log(`评论拉取完成: ${withComments}/${needComments.length} 条有优质评论\n`)
      }
    } else {
      console.log('(跳过评论拉取 — 未找到 config.json)\n')
    }
  }

  // 分数分布
  const dist = { '10+': 0, '5-9': 0, '1-4': 0, '0-': 0 }
  for (const p of scored) {
    if (p.score >= 10) dist['10+']++
    else if (p.score >= 5) dist['5-9']++
    else if (p.score >= 1) dist['1-4']++
    else dist['0-']++
  }
  console.log('分数分布:')
  for (const [k, v] of Object.entries(dist)) {
    if (v > 0) console.log(`  ${k}: ${v} 条`)
  }

  // 保存
  const outPath = path.join(RAW_DIR, '_filtered.json')
  fs.writeFileSync(outPath, JSON.stringify(scored, null, 2), 'utf-8')
  console.log(`\n已保存 → ${path.relative(process.cwd(), outPath)}`)

  // 打印 top 10 预览
  console.log('\n── Top 10 ──')
  for (const p of scored.slice(0, 10)) {
    console.log(`[${p.score}] ${p.author} | ${p.content.slice(0, 60)}...`)
    if (p.links.length) console.log(`     ${p.links[0]}`)
    if (p.topComments?.length) {
      console.log(`     热评: "${p.topComments[0].content.slice(0, 50)}" (${p.topComments[0].likeCount} likes)`)
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

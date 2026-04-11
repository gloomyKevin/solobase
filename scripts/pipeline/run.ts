/**
 * 数据处理管道 — 最小可用版本
 *
 * 链路: 原始数据 → 标准化 → 实体提取 → 多维评分 → 硬过滤 → 输出
 * 使用: npx tsx scripts/pipeline/run.ts
 */

import fs from 'node:fs'
import path from 'node:path'

// ═══════════════════════════════════════════════════════════════════
// 1. StandardItem — 源无关的统一格式
// ═══════════════════════════════════════════════════════════════════

interface StandardItem {
  // ── 事实层 (source, 不可变) ──
  id: string
  source: string
  source_id: string
  source_url: string
  body: string
  title: string
  media: string[]
  external_links: string[]
  author_name: string
  author_id: string
  author_bio: string
  engagement: { likes: number; comments: number; shares: number }
  top_comments: { author: string; content: string; likes: number }[]
  published_at: string
  crawled_at: string
  source_extra: Record<string, any>

  // ── 推断层 (inferred, 可更新) ──
  inferred_type: string
  inferred_projects: { name: string; url: string }[]
  inferred_maker: { name: string; bio: string; source_id: string } | null
  density_score: { density: number; heat: number; timeliness: number; association: number; total: number }
  density_signals: string[]

  // ── 编辑层 (editorial, 待人工填充) ──
  editorial_status: string
  editorial_tags: string[]
  editorial_notes: string
}

// ═══════════════════════════════════════════════════════════════════
// 2. 标准化 — Jike adapter 把原始数据转为 StandardItem
// ═══════════════════════════════════════════════════════════════════

const JIKE_INTERNAL = ['jike://', 'okjike.com', 'm.okjike.com', 'web.okjike.com']

function isExternalLink(url: string): boolean {
  return !JIKE_INTERNAL.some(p => url.includes(p))
}

function standardizeJike(raw: any): StandardItem {
  const links: string[] = []
  if (raw.linkInfo?.linkUrl && isExternalLink(raw.linkInfo.linkUrl)) {
    links.push(raw.linkInfo.linkUrl)
  }
  if (raw.urlsInText) {
    for (const u of raw.urlsInText) {
      if (u.url && isExternalLink(u.url)) links.push(u.url)
    }
  }

  const media = (raw.pictures || [])
    .map((p: any) => p.middlePicUrl || p.picUrl)
    .filter(Boolean)

  return {
    id: `jike:${raw.id}`,
    source: 'jike',
    source_id: raw.id,
    source_url: `https://web.okjike.com/originalPost/${raw.id}`,
    body: raw.content || '',
    title: '',
    media,
    external_links: [...new Set(links)],
    author_name: raw.user?.screenName || '',
    author_id: raw.user?.username || raw.user?.id || '',
    author_bio: raw.user?.bio || '',
    engagement: {
      likes: raw.likeCount || 0,
      comments: raw.commentCount || 0,
      shares: raw.shareCount || raw.repostCount || 0,
    },
    top_comments: [],  // 原始数据里没有，评论在 filter 阶段拉取的
    published_at: raw.createdAt || '',
    crawled_at: new Date().toISOString(),
    source_extra: {
      type: raw.type,
      topic: raw.topic?.content,
      isFeatured: raw.isFeatured,
    },

    // 推断层 — 后续步骤填充
    inferred_type: '',
    inferred_projects: [],
    inferred_maker: null,
    density_score: { density: 0, heat: 0, timeliness: 0, association: 0, total: 0 },
    density_signals: [],

    // 编辑层 — 待人工
    editorial_status: '',
    editorial_tags: [],
    editorial_notes: '',
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2b. 标准化 — PH adapter
// ═══════════════════════════════════════════════════════════════════

// 大厂名单 — adapter 用来标记，管道核心不知道这个列表存在
const KNOWN_CORPS = new Set([
  'google', 'microsoft', 'apple', 'amazon', 'meta', 'facebook', 'openai', 'anthropic',
  'netflix', 'uber', 'spotify', 'salesforce', 'adobe', 'notion', 'figma', 'vercel',
  'stripe', 'slack', 'zoom', 'dropbox', 'cloudflare', 'github', 'gitlab', 'atlassian',
  'clickup', 'linear', 'supabase', 'mongodb', 'bytedance', 'tencent', 'alibaba', 'baidu',
])

function standardizePH(raw: any): StandardItem {
  const links: string[] = []
  if (raw.website) links.push(raw.website)
  for (const l of (raw.productLinks || [])) {
    if (l.url && !links.includes(l.url)) links.push(l.url)
  }

  const makers = raw.makers || []
  const teamSize = makers.length

  // adapter 负责判断是否大厂，写入通用标记
  const allText = ((raw.name || '') + ' ' + makers.map((m: any) => (m.name || '') + ' ' + (m.headline || '')).join(' ')).toLowerCase()
  const isCorporate = [...KNOWN_CORPS].some(c => allText.includes(c))

  return {
    id: `ph:${raw.id}`,
    source: 'producthunt',
    source_id: raw.id,
    source_url: raw.phUrl || `https://www.producthunt.com/posts/${raw.slug}`,
    body: `${raw.name} — ${raw.tagline}\n\n${raw.description || ''}`,
    title: raw.name || '',
    media: raw.thumbnailUrl ? [raw.thumbnailUrl] : [],
    external_links: [...new Set(links)],
    author_name: makers[0]?.name || '',
    author_id: makers[0]?.id || '',
    author_bio: makers[0]?.headline || '',
    engagement: {
      likes: raw.votesCount || 0,
      comments: raw.commentsCount || 0,
      shares: 0,
    },
    top_comments: [],
    published_at: raw.createdAt || '',
    crawled_at: new Date().toISOString(),
    source_extra: {
      topics: raw.topics || [],
      makers,
      reviewsRating: raw.reviewsRating,
      reviewsCount: raw.reviewsCount,
      featuredAt: raw.featuredAt,
      slug: raw.slug,
      // ── 通用标记：任何 adapter 都可以设置，管道核心读这些 ──
      team_size: teamSize,
      is_corporate: isCorporate,
    },
    inferred_type: 'product_launch',
    inferred_projects: [],
    inferred_maker: null,
    density_score: { density: 0, heat: 0, timeliness: 0, association: 0, total: 0 },
    density_signals: [],
    editorial_status: '',
    editorial_tags: [],
    editorial_notes: '',
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2c. 标准化 — V2EX adapter
// ═══════════════════════════════════════════════════════════════════

function standardizeV2EX(raw: any): StandardItem {
  const links: string[] = []
  // 从 content 中提取 URL
  const urlPattern = /https?:\/\/[^\s<\])"']+/g
  const bodyUrls = (raw.content || '').match(urlPattern) || []
  for (const url of bodyUrls) {
    if (!url.includes('v2ex.com') && !url.includes('imgur.com/a/')) links.push(url)
  }

  // 回复提取高赞/有价值的
  const topComments = (raw.replies_data || [])
    .filter((r: any) => (r.content || '').length > 20)
    .slice(0, 10)
    .map((r: any) => ({
      author: r.member?.username || '',
      content: (r.content || '').slice(0, 300),
      likes: 0, // V2EX 回复没有点赞数
    }))

  return {
    id: `v2ex:${raw.id}`,
    source: 'v2ex',
    source_id: String(raw.id),
    source_url: raw.url || `https://www.v2ex.com/t/${raw.id}`,
    body: `${raw.title || ''}\n\n${raw.content || ''}`,
    title: raw.title || '',
    media: [], // V2EX 帖子图片嵌在 content HTML 里，暂不提取
    external_links: [...new Set(links)],
    author_name: raw.member?.username || '',
    author_id: raw.member?.username || '',
    author_bio: raw.member?.bio || '',
    engagement: {
      likes: 0, // V2EX 没有点赞
      comments: raw.replies || 0,
      shares: 0,
    },
    top_comments: topComments,
    published_at: raw.created ? new Date(raw.created * 1000).toISOString() : '',
    crawled_at: new Date().toISOString(),
    source_extra: {
      node: raw.node?.name,
      node_title: raw.node?.title,
      last_reply_by: raw.last_reply_by,
      replies_data: raw.replies_data,
    },
    inferred_type: '',
    inferred_projects: [],
    inferred_maker: null,
    density_score: { density: 0, heat: 0, timeliness: 0, association: 0, total: 0 },
    density_signals: [],
    editorial_status: '',
    editorial_tags: [],
    editorial_notes: '',
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2d. 标准化 — Linux.do adapter
// ═══════════════════════════════════════════════════════════════════

function standardizeLinuxdo(raw: any): StandardItem {
  const links: string[] = []
  const urlPattern = /https?:\/\/[^\s<\])"']+/g
  const bodyUrls = (raw.body || '').match(urlPattern) || []
  for (const url of bodyUrls) {
    if (!url.includes('linux.do')) links.push(url)
  }

  const topComments = (raw.top_replies || []).map((r: any) => ({
    author: r.author || '',
    content: (r.content || '').slice(0, 300),
    likes: r.likes || 0,
  }))

  return {
    id: `linuxdo:${raw.id}`,
    source: 'linuxdo',
    source_id: String(raw.id),
    source_url: `https://linux.do/t/topic/${raw.id}`,
    body: `${raw.title || ''}\n\n${raw.body || ''}`,
    title: raw.title || '',
    media: [],
    external_links: [...new Set(links)],
    author_name: raw.author_name || raw.author || '',
    author_id: raw.author || '',
    author_bio: '',
    engagement: {
      likes: raw.like_count || 0,
      comments: (raw.posts_count || 1) - 1,
      shares: 0,
    },
    top_comments: topComments,
    published_at: raw.created_at || '',
    crawled_at: new Date().toISOString(),
    source_extra: {
      views: raw.views,
      tags: raw.tags,
      category_id: raw.category_id,
    },
    inferred_type: '',
    inferred_projects: [],
    inferred_maker: null,
    density_score: { density: 0, heat: 0, timeliness: 0, association: 0, total: 0 },
    density_signals: [],
    editorial_status: '',
    editorial_tags: [],
    editorial_notes: '',
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. 实体提取 — 从内容中识别 project 和 maker
// ═══════════════════════════════════════════════════════════════════

function extractEntities(item: StandardItem): StandardItem {
  // 提取 project: 外部链接 = 潜在的 project
  const projects: { name: string; url: string }[] = []
  for (const url of item.external_links) {
    // 从 URL 提取产品名 (简化: 用域名)
    try {
      const hostname = new URL(url).hostname.replace('www.', '')
      projects.push({ name: hostname, url })
    } catch { /* ignore bad urls */ }
  }
  item.inferred_projects = projects

  // 提取 maker: 作者即潜在 maker
  if (item.author_name) {
    item.inferred_maker = {
      name: item.author_name,
      bio: item.author_bio,
      source_id: item.author_id,
    }
  }

  // 推断内容类型
  item.inferred_type = inferContentType(item.body)

  return item
}

const TYPE_RULES: [string, RegExp][] = [
  ['revenue_report', /(?:MRR|ARR|月入|收入|营收|付费用户|revenue)\s*[\d$¥]/i],
  ['product_launch', /(?:上线|发布|做了个|做了一个|launch|ship|开源了|正式版)/i],
  ['build_log', /(?:复盘|总结|从\s*0\s*到|开发过程|踩坑|个月)/i],
  ['tutorial', /(?:教程|指南|手把手|step\s*by\s*step|从零|入门)/i],
  ['tool_recommendation', /(?:推荐|安利|分享.*工具|分享.*资源|宝藏)/i],
  ['strategy_insight', /(?:经验|方法|策略|定价|获客|增长|冷启动|出海)/i],
  ['failure_postmortem', /(?:失败|没做起来|放弃|教训|踩坑)/i],
  ['market_observation', /(?:趋势|赛道|行业|市场|观察|变化)/i],
  ['user_feedback', /(?:体验|使用.*感受|评测|对比|试了)/i],
  ['resource_collection', /(?:整理|合集|清单|汇总|列表)/i],
]

function inferContentType(body: string): string {
  for (const [type, regex] of TYPE_RULES) {
    if (regex.test(body)) return type
  }
  return 'other'
}

// ═══════════════════════════════════════════════════════════════════
// 4. 多维评分 — density / heat / timeliness / association
// ═══════════════════════════════════════════════════════════════════

function score(item: StandardItem): StandardItem {
  const signals: string[] = []

  // ── density: 内容本身的信息含量 ──
  let density = 0
  const body = item.body

  // 具体数字
  if (/[\d$¥]\d*[kKwW万千]?\s*(?:MRR|ARR|收入|用户|下载|star)/i.test(body)) {
    density += 3; signals.push('含具体数字')
  }
  // 内容长度
  if (body.length > 500) { density += 3; signals.push('长文>500字') }
  else if (body.length > 200) { density += 2; signals.push('中文>200字') }
  else if (body.length > 100) { density += 1 }
  // 外部链接
  if (item.external_links.length >= 2) { density += 3; signals.push(`${item.external_links.length}个外链`) }
  else if (item.external_links.length === 1) { density += 2; signals.push('1个外链') }
  // 图片
  if (item.media.length > 0) { density += 1; signals.push(`${item.media.length}张图`) }
  // 结构化内容 (列表、步骤)
  if (/(?:\d[.、)）]|[①②③]|^\s*[-•]\s)/m.test(body)) {
    density += 2; signals.push('结构化内容')
  }

  // ── heat: 社区验证 ──
  let heat = 0
  const { likes, comments } = item.engagement
  if (likes >= 100) { heat += 5; signals.push(`${likes}赞`) }
  else if (likes >= 50) { heat += 4; signals.push(`${likes}赞`) }
  else if (likes >= 20) { heat += 3; signals.push(`${likes}赞`) }
  else if (likes >= 5) { heat += 1 }

  if (comments >= 20) { heat += 3; signals.push(`${comments}评论`) }
  else if (comments >= 5) { heat += 1 }

  if (item.source_extra.isFeatured) { heat += 2; signals.push('featured') }

  // ── timeliness: 时效性 ──
  let timeliness = 0
  if (item.published_at) {
    const days = (Date.now() - new Date(item.published_at).getTime()) / 86400000
    if (days <= 30) { timeliness = 5; signals.push('近1月') }
    else if (days <= 90) { timeliness = 3; signals.push('近3月') }
    else if (days <= 180) { timeliness = 2 }
    else if (days <= 365) { timeliness = 1 }
  }

  // ── association: 实体关联丰富度 ──
  let association = 0
  if (item.inferred_projects.length >= 2) { association += 3; signals.push(`关联${item.inferred_projects.length}项目`) }
  else if (item.inferred_projects.length === 1) { association += 2 }
  if (item.inferred_maker) association += 1

  const total = density + heat + timeliness + association

  item.density_score = { density, heat, timeliness, association, total }
  item.density_signals = signals
  return item
}

// ═══════════════════════════════════════════════════════════════════
// 5. 硬过滤 — 只丢弃明确的垃圾
// ═══════════════════════════════════════════════════════════════════

const NOISE_HEAD = ['招聘', '招人', '求职', '内推', '急招', '转发抽奖', '抽奖']

function isHardFilter(item: StandardItem): boolean {
  const body = item.body

  // 极短 + 无链接 + 无图
  if (body.length < 50 && item.external_links.length === 0 && item.media.length === 0) return true
  // 噪声关键词在开头
  const head = body.slice(0, 50)
  if (NOISE_HEAD.some(kw => head.includes(kw))) return true

  // ── 通用标记（任何 adapter 都可以设置这些） ──
  if (item.source_extra.is_corporate) return true
  if ((item.source_extra.team_size ?? 0) > 5) return true

  return false
}

// ═══════════════════════════════════════════════════════════════════
// 6. 跨源富化 — PH 作为参考索引，不进内容池
//    设计原则：合并是链接关系而非覆盖，宁可漏匹配不误匹配
// ═══════════════════════════════════════════════════════════════════

// 常见英文短词，这些在中文正文中频繁出现但不是产品引用
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'all', 'one', 'new', 'app', 'pro', 'max',
  'get', 'use', 'can', 'run', 'top', 'now', 'day', 'way', 'how', 'map', 'set',
  'hub', 'lab', 'flow', 'loop', 'next', 'open', 'chat', 'code', 'data', 'auto',
  'fast', 'snap', 'link', 'note', 'sync', 'mind', 'base', 'live', 'dash', 'flex',
  'core', 'vibe', 'mark', 'play', 'fire', 'hive', 'meta', 'like', 'just', 'deep',
  'edge', 'move', 'home', 'work', 'side', 'wave', 'bolt', 'beam', 'form', 'grid',
  'true', 'pure', 'wise', 'ever', 'idea', 'made', 'done', 'hero', 'solo', 'zero',
  'nest', 'seed', 'step', 'path', 'task', 'plan', 'view', 'mode', 'dock', 'pick',
  'craft', 'spark', 'shift', 'pulse', 'blend', 'trace', 'orbit', 'pilot', 'drift',
  'flask', 'ember', 'atlas', 'scout', 'relay', 'pixel', 'prism', 'cache', 'slate',
  'surge', 'realm', 'bloom', 'swift', 'stone', 'space', 'stack', 'shell', 'cloud',
  'alpha', 'delta', 'gamma', 'omega', 'sigma', 'super', 'ultra', 'magic', 'smart',
  'agent', 'skill', 'focus', 'doing', 'build', 'start', 'check', 'write', 'think',
  'share', 'watch', 'local', 'micro', 'daily', 'queue', 'sleep', 'image', 'video',
  'color', 'light', 'table', 'field', 'block', 'frame', 'scope', 'store', 'track',
  'route', 'proxy', 'guard', 'tower', 'forge', 'haven', 'lodge', 'creek', 'crest',
  'mango', 'peach', 'lemon', 'olive', 'berry', 'maple', 'coral', 'ivory', 'amber',
  'director', 'inspector', 'journey', 'origin', 'struct', 'expect', 'monday',
])

function isGoodNameMatch(name: string): boolean {
  if (name.length < 6) return false
  if (COMMON_WORDS.has(name)) return false
  // 全小写的纯英文短词更可能是误匹配
  if (name.length < 8 && /^[a-z]+$/.test(name)) return false
  return true
}

// 参考索引条目 — 任何源都可以贡献参考数据
interface RefEntry {
  source: string
  name: string
  slug: string
  url: string
  summary: Record<string, any> // 源特有的摘要信息
}

function buildRefIndex(items: StandardItem[]): { bySlug: Map<string, RefEntry>; byName: Map<string, RefEntry> } {
  const bySlug = new Map<string, RefEntry>()
  const byName = new Map<string, RefEntry>()

  for (const item of items) {
    const entry: RefEntry = {
      source: item.source,
      name: item.title,
      slug: item.source_extra.slug || '',
      url: item.source_url,
      summary: {
        votes: item.engagement.likes,
        topics: item.source_extra.topics,
        makers: (item.source_extra.makers || []).slice(0, 3).map((m: any) => ({ name: m.name, headline: m.headline })),
        tagline: item.body.split('\n')[0]?.slice(0, 80),
        featuredAt: item.source_extra.featuredAt,
      },
    }

    if (entry.slug) bySlug.set(entry.slug.toLowerCase(), entry)
    if (entry.name && isGoodNameMatch(entry.name.toLowerCase())) {
      byName.set(entry.name.toLowerCase(), entry)
    }
  }

  return { bySlug, byName }
}

function crossEnrich(contentItems: StandardItem[], refItems: StandardItem[]): number {
  const { bySlug, byName } = buildRefIndex(refItems)
  console.log(`  参考索引: ${bySlug.size} slug, ${byName.size} 名称`)

  let matchCount = 0

  for (const item of contentItems) {
    const matches: any[] = []
    const matchedNames = new Set<string>()

    // ── 方法 1: URL 中包含参考项的 slug（高置信度） ──
    const allText = item.body + ' ' + item.external_links.join(' ')
    for (const [slug, ref] of bySlug) {
      if (slug.length < 4) continue
      // 检查帖子文本/链接中是否包含 slug（在路径上下文中）
      if (allText.includes(`/${slug}`) && !matchedNames.has(ref.name.toLowerCase())) {
        matches.push({ ...ref.summary, name: ref.name, source: ref.source, url: ref.url, confidence: 'url_slug' })
        matchedNames.add(ref.name.toLowerCase())
      }
    }

    // ── 方法 2: 名称匹配（中置信度，严格边界） ──
    const bodyLower = item.body.toLowerCase()
    for (const [name, ref] of byName) {
      if (matchedNames.has(name)) continue
      if (ref.source === item.source) continue // 不和同源匹配
      const idx = bodyLower.indexOf(name)
      if (idx === -1) continue
      const before = idx > 0 ? bodyLower[idx - 1] : ' '
      const after = idx + name.length < bodyLower.length ? bodyLower[idx + name.length] : ' '
      if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) {
        matches.push({ ...ref.summary, name: ref.name, source: ref.source, url: ref.url, confidence: 'name_match' })
        matchedNames.add(name)
      }
    }

    if (matches.length > 0) {
      if (!item.source_extra.cross_refs) item.source_extra.cross_refs = []
      item.source_extra.cross_refs.push(...matches)
      const bonus = matches.some(m => m.confidence === 'url_slug') ? 3 : 1
      item.density_score.association += bonus
      item.density_score.total += bonus
      for (const m of matches) {
        item.density_signals.push(`${m.source}:${m.name}(${m.votes}票,${m.confidence})`)
      }
      matchCount++
    }
  }

  return matchCount
}

// ═══════════════════════════════════════════════════════════════════
// 7. Main — 跑完整链路（多源）
// ═══════════════════════════════════════════════════════════════════

function loadRawFiles(dir: string): any[] {
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  let all: any[] = []
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    all.push(...(Array.isArray(data) ? data : []))
  }
  return all
}

function main() {
  const OUT_DIR = path.join(process.cwd(), 'data', 'pipeline')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // ── Step 1: 加载各源原始数据 ──
  console.log('=== 加载原始数据 ===')

  // 即刻
  let jikeRaw = loadRawFiles(path.join(process.cwd(), 'data', 'raw', 'jike'))
  const jikeSeen = new Set<string>()
  jikeRaw = jikeRaw.filter(p => {
    if (!p.id || jikeSeen.has(p.id)) return false
    jikeSeen.add(p.id)
    return true
  })
  console.log(`  即刻: ${jikeRaw.length} 条`)

  // PH（从 _progress.json 加载）
  const phPath = path.join(process.cwd(), 'data', 'raw', 'producthunt', '_progress.json')
  const phRaw: any[] = fs.existsSync(phPath)
    ? JSON.parse(fs.readFileSync(phPath, 'utf-8'))
    : []
  console.log(`  PH: ${phRaw.length} 条`)

  // V2EX
  let v2exRaw = loadRawFiles(path.join(process.cwd(), 'data', 'raw', 'v2ex'))
  const v2exSeen = new Set<string>()
  v2exRaw = v2exRaw.filter(p => {
    const id = String(p.id)
    if (!id || v2exSeen.has(id)) return false
    v2exSeen.add(id)
    return true
  })
  console.log(`  V2EX: ${v2exRaw.length} 条`)

  // Linux.do
  let linuxdoRaw = loadRawFiles(path.join(process.cwd(), 'data', 'raw', 'linuxdo'))
  const linuxdoSeen = new Set<string>()
  linuxdoRaw = linuxdoRaw.filter(p => {
    const id = String(p.id)
    if (!id || linuxdoSeen.has(id)) return false
    linuxdoSeen.add(id)
    return true
  })
  console.log(`  Linux.do: ${linuxdoRaw.length} 条`)

  // ── Step 2: 标准化 ──
  // ── Step 2: 标准化（所有源统一进内容池） ──
  console.log('\n=== 标准化 ===')
  const jikeItems = jikeRaw.map(standardizeJike)
  // PH 暂不进内容池 — 英文数据与平台定位不匹配，仅作为跨源富化参考索引
  // const phItems = phRaw.map(standardizePH)
  const v2exItems = v2exRaw.map(standardizeV2EX)
  const linuxdoItems = linuxdoRaw.map(standardizeLinuxdo)
  const items = [...jikeItems, ...v2exItems, ...linuxdoItems]
  console.log(`  即刻 → ${jikeItems.length}`)
  console.log(`  PH → ${phRaw.length} (仅参考索引，不进内容池)`)
  console.log(`  V2EX → ${v2exItems.length}`)
  console.log(`  Linux.do → ${linuxdoItems.length}`)
  console.log(`  合计 → ${items.length}`)

  // ── Step 3: 实体提取 ──
  console.log('\n=== 实体提取 ===')
  const extracted = items.map(extractEntities)
  const typeDist: Record<string, number> = {}
  for (const item of extracted) {
    typeDist[item.inferred_type] = (typeDist[item.inferred_type] || 0) + 1
  }
  console.log(`  类型分布:`, Object.entries(typeDist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' | '))

  // ── Step 3b: 跨源富化（所有源之间双向匹配） ──
  console.log('\n=== 跨源富化 ===')
  // 每个源的内容都可以和其他源交叉匹配
  // 逻辑：对于每条内容，在所有「其他源」的条目中寻找匹配
  const sources = [...new Set(extracted.map(i => i.source))]
  let totalMatches = 0
  for (const src of sources) {
    const contentFromSrc = extracted.filter(i => i.source === src)
    const refsFromOtherSrcs = extracted.filter(i => i.source !== src)
    if (refsFromOtherSrcs.length === 0) continue
    const matches = crossEnrich(contentFromSrc, refsFromOtherSrcs)
    if (matches > 0) {
      console.log(`  ${src} ↔ 其他源: ${matches} 条匹配`)
      totalMatches += matches
    }
  }
  console.log(`  总计: ${totalMatches} 条跨源匹配`)

  // ── Step 4: 多维评分 ──
  const scored = extracted.map(score)

  // ── Step 5: 硬过滤 ──
  const filtered = scored.filter(item => !isHardFilter(item))
  const removed = scored.length - filtered.length
  console.log(`\n=== 硬过滤 ===`)
  console.log(`  丢弃 ${removed} 条，保留 ${filtered.length} 条`)

  // 排序
  filtered.sort((a, b) => b.density_score.total - a.density_score.total)

  // ── 输出统计 ──
  console.log('\n=== 分数分布 ===')
  for (const src of ['all', 'jike', 'producthunt']) {
    const pool = src === 'all' ? filtered : filtered.filter(i => i.source === src)
    const s20 = pool.filter(i => i.density_score.total >= 20).length
    const s15 = pool.filter(i => i.density_score.total >= 15 && i.density_score.total < 20).length
    const s10 = pool.filter(i => i.density_score.total >= 10 && i.density_score.total < 15).length
    const s5 = pool.filter(i => i.density_score.total >= 5 && i.density_score.total < 10).length
    const sLow = pool.filter(i => i.density_score.total < 5).length
    console.log(`  [${src}] S:${s20} A:${s15} B:${s10} C:${s5} D:${sLow} (共${pool.length})`)
  }

  // 跨源匹配展示
  const crossMatched = filtered.filter(i => i.source_extra.cross_refs?.length > 0)
  console.log(`\n=== 跨源匹配: ${crossMatched.length} 条 ===`)
  for (const item of crossMatched.slice(0, 15)) {
    const refs = item.source_extra.cross_refs.map((m: any) => `${m.source}:${m.name}(${m.votes}票)`).join(' + ')
    console.log(`  [${item.source}] ${item.author_name}: ${item.body.slice(0, 50)}…  ↔ ${refs}`)
  }

  // Top 5 per source
  for (const src of sources) {
    const srcItems = filtered.filter(i => i.source === src)
    console.log(`\n=== Top 5 [${src}] ===`)
    for (const item of srcItems.slice(0, 5)) {
      const s = item.density_score
      const xref = item.source_extra.cross_refs?.length ? ` [×${item.source_extra.cross_refs.length}]` : ''
      console.log(`  [总${s.total}] 密${s.density}|热${s.heat}|时${s.timeliness}|关${s.association}${xref} | ${item.inferred_type}`)
      console.log(`    ${item.title || item.author_name}: ${item.body.slice(0, 70)}…`)
    }
  }

  // ── 保存：按源拆分 ──
  const allPath = path.join(OUT_DIR, 'pipeline_output.json')
  fs.writeFileSync(allPath, JSON.stringify(filtered, null, 2), 'utf-8')
  for (const src of sources) {
    const srcItems = filtered.filter(i => i.source === src)
    const srcPath = path.join(OUT_DIR, `${src}.json`)
    fs.writeFileSync(srcPath, JSON.stringify(srcItems, null, 2), 'utf-8')
    console.log(`  [${src}] ${srcItems.length} 条 → ${path.relative(process.cwd(), srcPath)}`)
  }
  if (crossMatched.length > 0) {
    const crossPath = path.join(OUT_DIR, 'cross_matches.json')
    fs.writeFileSync(crossPath, JSON.stringify(crossMatched, null, 2), 'utf-8')
    console.log(`  [跨源] ${crossMatched.length} 条 → ${path.relative(process.cwd(), crossPath)}`)
  }
  console.log(`  [合集] ${filtered.length} 条 → ${path.relative(process.cwd(), allPath)}`)
}

main()

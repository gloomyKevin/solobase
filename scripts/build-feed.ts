/**
 * Feed 构建脚本 — 从管道输出生成展示层缓存
 *
 * 输入: data/pipeline/{jike,v2ex,linuxdo}.json
 * 输出: data/feed.json（页面唯一数据源）
 *
 * 使用: npx tsx scripts/build-feed.ts
 * 策略: 手动或定时执行，页面不做任何数据处理
 */

import fs from 'node:fs'
import path from 'node:path'

const PIPELINE_DIR = path.join(process.cwd(), 'data', 'pipeline')
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'feed.json')

// ═══════════════════════════════════════════════════════════════
// Types — feed.json 的完整 schema
// ═══════════════════════════════════════════════════════════════

interface FeedProject {
  slug: string
  name: string
  tagline: string
  description: string
  url: string               // 产品外部链接
  screenshot: string        // 主图
  stage: string
  stageColor: string
  score: number
  topics: string[]

  // 详情页需要的字段
  author: string
  authorBio: string
  source: string            // jike / v2ex / linuxdo
  sourceUrl: string         // 原帖链接
  engagement: { likes: number; comments: number }
  topComments: { author: string; content: string; likes: number }[]
  publishedAt: string
}

interface FeedPost {
  id: string                 // 内部 pipeline id（不对外暴露）
  slug: string               // URL 标识：{source_prefix}-{short_id}
  type: string               // build_log / strategy_insight / ...
  title: string
  body: string               // 全文，最多 5000 字，已清洗
  author: string
  authorBio: string
  score: number
  engagement: { likes: number; comments: number }
  topics: string[]
  publishedAt: string
  readingTime: number        // 估算分钟
}

interface FeedCache {
  projects: FeedProject[]
  posts: FeedPost[]
  meta: {
    generatedAt: string
    projectCount: number
    postCount: number
    sources: Record<string, number>
  }
}

// ═══════════════════════════════════════════════════════════════
// URL 判断
// ═══════════════════════════════════════════════════════════════

const REJECT_HOSTS = new Set([
  // 社交/社区
  'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'bilibili.com',
  'reddit.com', 'news.ycombinator.com', 'weibo.com', 'douban.com',
  'web.okjike.com', 'm.okjike.com', 'okjike.com', 'jike.city',
  'linux.do', 'v2ex.com', 'coolapk.com', 'xiaoyuzhoufm.com',
  'xiaohongshu.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'taou.cn',  // 脉脉
  // 内容/媒体/博客
  'wired.com', 'sspai.com', 'zhihu.com', 'juejin.cn',
  'medium.com', 'substack.com', 'arxiv.org', 'infoq.cn',
  'mp.weixin.qq.com', 'weixin.qq.com', 'blog.google',
  'searchengineland.com', 'xiaobot.net', 'zhubai.love',
  'bearblog.dev', 'barretlee.com', 'cnfeat.github.io',
  'ezindie.com', 'lennysproductpass.com',
  'bestblogs.dev', 'karpathy.bearblog.dev',
  // 大平台（不是独立产品）
  'apple.com', 'google.com', 'microsoft.com', 'baidu.com',
  'pan.baidu.com', 'docs.cursor.com', 'sdk.vercel.ai',
  'schema.org', 'testflight.apple.com',
  'job.toutiao.com', 'bytedance.com', 'larkoffice.com',
  'applink.feishu.cn', 'miracleplus.feishu.cn',
  'openai.com', 'anthropic.com', 'skillhub.tencent.com',
  'magecdn.com', 'opensource.guide',
  'workflowy.com', 'promptbase.com', 'quickposes.com',
  // 开发平台（别人的产品）
  'vercel.com', 'netlify.app', 'huggingface.co',
  'coze.cn', 'coze.com', 'poe.com', 'chat.openai.com',
  'producthunt.com', 'starterstory.com', 'indiehackers.com',
  'lobehub.com', 'monica.im', 'gitee.com',
  'element-plus.org', 'opentiny.design', 'heroui.com',
  'dora.run', 'gitpod.io', 'trello.com', 'youmind.com',
  'nodejs.org', 'vitejs.cn', 'vitejs.dev',
  'wordpress.com',  // 博客平台
  'glitch.me',      // demo 平台
  'zhipuai.cn',     // 智谱 AI
  'stephenwolfram.com', 'lovable.app',
  'bysocket.com',   // 个人博客
  // 资源/下载
  'greasyfork.org', 'packagecontrol.io', 'npmjs.com',
  // 短链/中转/占位
  'url.cn', 'b23.tv', 't.cn', 'dwz.cn', 'xurl.run',
  'your-n8n-instance.com',
  // App 下载直链
  'android-release.jellow.site',
  // 表单
  'mikecrm.com',
  // CDN / 云服务子域
  'image-qiniu.jellow.site', 'aliyun-esa.net',
])

// GitHub 大厂/知名组织 — 他们的仓库不是独立开发者的产品（全小写比较）
const GITHUB_ORG_BLACKLIST = new Set([
  'ant-design', 'microsoft', 'google', 'facebook', 'meta',
  'anthropics', 'openai', 'deepseek-ai', 'huggingface',
  'paddlepaddle', 'langchain-ai', 'mui-org', 'immich-app',
  'chromiumos', 'chromedevtools', 'nicegui',
  'vercel', 'supabase', 'puppeteer', 'nodejs', 'nicegoodvibe',
  'datawhalechina', 'github', 'roboflow',
  'thu-sigs-aiid',
])

function isProductUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '').toLowerCase()
    if ([...REJECT_HOSTS].some(r => host.includes(r))) return false
    // 拒绝纯 IP 或 localhost
    if (/^\d+\.\d+\.\d+\.\d+/.test(host) || host === 'localhost') return false
    // GitHub 大厂仓库 + GitHub Pages 个人站
    if (host === 'github.com') {
      const org = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
      if (org && GITHUB_ORG_BLACKLIST.has(org)) return false
    }
    if (host.endsWith('.github.io')) return false
    // 拒绝 .apk / .zip / .pdf 直接下载链接
    if (/\.(apk|zip|pdf|exe|dmg)$/i.test(u.pathname)) return false
    return true
  } catch { return false }
}

// ═══════════════════════════════════════════════════════════════
// 产品名提取
// ═══════════════════════════════════════════════════════════════

// 知名平台/工具名 — 不是独立开发者的产品
const NAME_BLACKLIST = new Set([
  // 大模型/AI 平台
  'chatgpt', 'claude', 'deepseek', 'openai', 'anthropic', 'stability',
  'huggingface', 'gemini', 'copilot', 'poe', 'coze', 'monica', 'midjourney',
  // 知名工具/平台
  'notion', 'vercel', 'github', 'gitlab', 'bitbucket', 'stackoverflow',
  'figma', 'sketch', 'photoshop', 'canva', 'slack', 'discord', 'telegram',
  'cursor', 'vscode', 'vim', 'emacs', 'jetbrains', 'xcode',
  'wordpress', 'shopify', 'webflow', 'framer', 'workflowy',
  'supabase', 'firebase', 'mongodb', 'postgres', 'redis', 'mysql',
  'stripe', 'paypal', 'wechat', 'weixin', 'alipay',
  'feishu', 'dingtalk', 'lark', 'n8n',
  // 大厂
  'google', 'apple', 'microsoft', 'facebook', 'meta', 'amazon',
  'oracle', 'ibm', 'bytedance', 'tencent', 'alibaba', 'baidu',
  'aws', 'azure', 'gcp', 'cloudflare', 'heroku', 'railway',
  // 编程语言/框架
  'flutter', 'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
  'tailwindcss', 'typescript', 'javascript', 'python', 'golang', 'rust',
  'kubernetes', 'docker', 'nginx', 'linux', 'windows', 'macos', 'ios',
  'chrome', 'android', 'safari',
  // 太通用的英文词（不是产品名）
  'mcp', 'sdk', 'api', 'cli', 'app', 'web', 'blog', 'docs', 'forum',
  'chat', 'page', 'pages', 'home', 'site', 'tool', 'tools', 'code',
  'data', 'file', 'test', 'demo', 'main', 'info', 'help', 'play',
  'work', 'list', 'news', 'book', 'link', 'open', 'space', 'logo',
  'job', 'jobs', 'pan', 'url', 'bash', 'https', 'http', 'name',
  'support', 'platform', 'developer', 'learning', 'schema', 'remove',
  'agents', 'agent', 'tokens', 'mirrors', 'archive', 'skills', 'skill',
  'project', 'saas', 'svg', 'bot', 'mac', 'easy', 'vibe', 'curl',
  'craft', 'reflect', 'translator', 'step1', 'fragments',
  'nodejs', 'vitejs', 'puppeteer', 'trello', 'gitpod', 'dora',
])

function isNameBlacklisted(name: string): boolean {
  return NAME_BLACKLIST.has(name.toLowerCase().trim())
}

// 名字质量检查
function isNameQualityOk(name: string): boolean {
  // 太短
  if (name.length < 3) return false
  // 纯数字或以数字开头的随机串
  if (/^\d/.test(name) && !/\d{4}/.test(name)) return false
  // 看起来像随机字符串（辅音密度过高，无元音）
  const lower = name.toLowerCase()
  const vowelRatio = (lower.match(/[aeiouy]/g) || []).length / lower.length
  if (lower.length >= 4 && vowelRatio < 0.15 && !/[\u4e00-\u9fff]/.test(name)) return false
  // URL 片段残留
  if (/^(id\d+|chromewebstore|testflight|searchengineland|chatgpt\d)$/i.test(name)) return false
  // 包含 UUID/hash 片段
  if (/[0-9a-f]{8,}/i.test(name) && name.length > 15) return false
  // 看起来像域名后缀组合 (D1v, B23, 0v0, etc.)
  if (/^[A-Z0-9][a-z0-9]{1,2}$/i.test(name)) return false
  // 人名（个人博客/主页，不是产品）— 名字+姓氏模式
  if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(name) && name.length > 12) return false
  // GitHub 风格的长连字符名超过 4 段通常是描述性的，不是产品名
  if (name.split('-').length > 4) return false
  // awesome-* 列表不是产品
  if (/^awesome-/i.test(name)) return false
  // chinese-independent-developer 等资源汇总
  if (/^chinese-/i.test(name) && name.length > 20) return false
  // SKILL-* 通常是 Claude skill，不是独立产品
  if (/^SKILL-/i.test(name)) return false
  return true
}

function extractName(url: string, body: string): string | null {
  // 先从正文提取（优先级最高：maker 自己说的名字最准）
  const textPatterns = [
    /(?:做了|发布了?|上线了?|开源了?|推出了?)\s*(?:一个|一款)?\s*[「【《]([^」】》\n]{2,20})[」】》]/,
    /(?:做了|发布了?|上线了?|开源了?|推出了?)\s*(?:一个|一款)?\s*([A-Za-z][\w.-]{2,25})/,
    /^([A-Za-z][\w.-]{3,25})\s*[，,—\-:：|]/m,
  ]
  for (const p of textPatterns) {
    const m = body.match(p)
    if (m?.[1] && m[1].trim().length >= 2) {
      const candidate = m[1].trim()
      if (!isNameBlacklisted(candidate) && isNameQualityOk(candidate)) return candidate
    }
  }

  // 再从 URL 提取
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '').toLowerCase()

    // GitHub 仓库
    if (host === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length >= 2 && parts[1].length >= 3) {
        const repoName = parts[1]
        // GitHub 仓库名如果含太多连字符（看起来像描述），取第一段
        const segments = repoName.split('-')
        const candidate = segments.length <= 3 ? repoName : segments.slice(0, 2).join('-')
        if (!isNameBlacklisted(candidate) && isNameQualityOk(candidate)) return candidate
      }
      return null
    }

    // App Store
    if (host.includes('apps.apple.com')) {
      const m = u.pathname.match(/\/app\/([^/]+)/)
      if (m?.[1]) {
        const decoded = decodeURIComponent(m[1]).replace(/-/g, ' ')
        if (decoded.length >= 2 && decoded.length <= 25) return decoded
      }
    }

    // Chrome Web Store
    if (host.includes('chromewebstore.google.com')) {
      // 无法从 URL 提取有意义的名字
      return null
    }

    // 自有域名
    const domain = host.split('.')[0]
    if (domain.length >= 3 && domain.length <= 20) {
      const candidate = domain.charAt(0).toUpperCase() + domain.slice(1)
      if (!isNameBlacklisted(candidate) && isNameQualityOk(candidate)) return candidate
    }
  } catch { /* ignore */ }

  return null
}

// ═══════════════════════════════════════════════════════════════
// 推断字段
// ═══════════════════════════════════════════════════════════════

const stageColorMap: Record<string, string> = {
  idea: '#9CA3AF', building: '#F59E0B', launched: '#DB6B25',
  revenue: '#3B9B8B', scaling: '#6C4FD6',
}

function inferStage(body: string): string {
  if (/mrr|收入|营收|月入|付费用户/i.test(body)) return 'revenue'
  if (/上线|发布|launch|ship|正式版/i.test(body)) return 'launched'
  if (/开发中|building|beta|内测/i.test(body)) return 'building'
  return 'launched'
}

function inferTopics(body: string): string[] {
  const b = body.toLowerCase()
  const t: string[] = []
  // 增长 / 冷启动（优先于 AI，独立开发者最关心的维度）
  if (/冷启动|cold.?start|first.?user|第一批用户|种子用户/.test(b)) t.push('冷启动')
  if (/seo|搜索优化|自然流量|关键词排名/.test(b)) t.push('SEO')
  if (/增长|growth|获客|拉新|dau|mau|留存|转化率/.test(b)) t.push('增长')
  // 变现
  if (/mrr|月收入|月入|营收|付费用户|revenue|盈利|赚钱|订阅收入/.test(b)) t.push('变现')
  // 产品思维 / 方法论
  if (/产品思维|从0到1|方法论|prd|用户调研|需求验证|product.?market.?fit/.test(b)) t.push('产品思维')
  // 出海
  if (/出海|global|海外|海外市场|international|overseas/.test(b)) t.push('出海')
  // AI 工具（后置，避免污染所有帖子）
  if (/\bai\b|人工智能|大模型|gpt|claude|llm|agent/.test(b)) t.push('AI')
  // 开发工具
  if (/开发者工具|devtool|cursor|vscode|开发效率/.test(b)) t.push('开发工具')
  // 效率
  if (/效率|productivity|workflow|自动化|automation/.test(b)) t.push('效率')
  // 设计（\bui\b 加词边界避免 "build"/"guide" 误匹配）
  if (/设计|design|\bui\b|\bux\b|交互设计|视觉设计/.test(b)) t.push('设计')
  // App / 移动
  if (/ios|android|app store|移动端|小程序/.test(b)) t.push('App')
  // 开源
  if (/开源|open.?source/.test(b)) t.push('开源')
  // SaaS
  if (/\bsaas\b|订阅制|subscription/.test(b)) t.push('SaaS')

  // 去重后最多取 3 个，优先保留前面的（更独立开发者相关）
  return [...new Set(t)].slice(0, 3)
}

// Post 专用：清洗正文（去平台词、@提及、HTML 实体、多余换行）
function cleanPostBody(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/@[\w\u4e00-\u9fff]+/g, '')
    .replace(/即友们?|佬友们?|佬们|LDC|龙虾币/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim()
}

// 估算阅读时间（分钟）：中文 300 字/分钟，上限 20 分钟
function estimateReadingTime(text: string): number {
  return Math.min(20, Math.max(1, Math.round(text.length / 300)))
}

// 从 pipeline id 生成 URL-friendly slug
// jike:abc123def456  →  jike-abc123de
// linuxdo:12345      →  ld-12345
function makePostSlug(id: string): string {
  if (id.startsWith('jike:')) {
    return 'jike-' + id.slice(5, 13)
  }
  if (id.startsWith('linuxdo:')) {
    return 'ld-' + id.slice(8, 20)
  }
  if (id.startsWith('v2ex:')) {
    return 'v2ex-' + id.slice(5, 16)
  }
  return id.replace(/[^a-z0-9-]/gi, '-').slice(0, 20)
}

function extractTagline(body: string): string {
  const lines = body.split(/\n/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 120)
  for (const line of lines.slice(0, 5)) {
    if (/^[#\-·•\d]/.test(line)) continue
    return line.slice(0, 80)
  }
  return body.replace(/\n/g, ' ').slice(0, 80)
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

// ═══════════════════════════════════════════════════════════════
// 图片验证（同步 HEAD 请求）
// ═══════════════════════════════════════════════════════════════

function validateImageSync(url: string): boolean {
  if (!url || !url.startsWith('https://')) return false
  try {
    // 用 curl 做 HEAD 请求，3 秒超时
    const { execSync } = require('child_process')
    const status = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 3 -I "${url}"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim()
    return status === '200'
  } catch {
    return false
  }
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

function main() {
  console.log('=== 构建 feed.json ===\n')

  // 加载管道数据
  const sources = ['jike.json', 'v2ex.json', 'linuxdo.json']
  let allItems: any[] = []
  const sourceCounts: Record<string, number> = {}

  for (const src of sources) {
    const p = path.join(PIPELINE_DIR, src)
    if (!fs.existsSync(p)) continue
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    allItems.push(...data)
    sourceCounts[src.replace('.json', '')] = data.length
    console.log(`  ${src}: ${data.length} 条`)
  }
  console.log(`  合计: ${allItems.length} 条\n`)

  // ── 合并评论数据（_filtered.json 中有，raw 中没有）──
  const commentSources = [
    path.join(process.cwd(), 'data', 'raw', 'jike', '_filtered.json'),
  ]
  const commentMap = new Map<string, any[]>()
  for (const csPath of commentSources) {
    if (!fs.existsSync(csPath)) continue
    const filtered = JSON.parse(fs.readFileSync(csPath, 'utf-8'))
    for (const item of filtered) {
      if (item.topComments?.length > 0 && item.id) {
        commentMap.set(item.id, item.topComments)
      }
    }
  }
  console.log(`  评论数据: ${commentMap.size} 条帖子有评论\n`)

  // 把评论合并到管道数据
  for (const item of allItems) {
    // 用 source_id 匹配（pipeline 的 id 是 "jike:xxx"，_filtered 的 id 就是 jike post id）
    const sourceId = item.source_id || item.id?.replace(/^jike:/, '')
    const comments = commentMap.get(sourceId) || commentMap.get(item.id)
    if (comments && (!item.top_comments || item.top_comments.length === 0)) {
      item.top_comments = comments
    }
  }

  // 按分数降序
  allItems.sort((a, b) => (b.density_score?.total ?? 0) - (a.density_score?.total ?? 0))

  // ── 提取 Project ──
  console.log('提取 Project...')
  const projects: FeedProject[] = []
  const seenSlugs = new Set<string>()
  const seenUrls = new Set<string>()
  let imgChecked = 0
  let imgFailed = 0

  for (const item of allItems) {
    if ((item.density_score?.total ?? 0) < 8) continue

    // 找产品 URL
    const productLinks = (item.external_links || []).filter(isProductUrl)
    if (productLinks.length === 0) continue

    const primaryUrl = productLinks[0]
    if (seenUrls.has(primaryUrl)) continue

    // 提取名字
    const name = extractName(primaryUrl, item.body || '')
    if (!name || name.length < 2) continue

    const slug = slugify(name)
    if (!slug || seenSlugs.has(slug)) continue

    // 图片验证（无截图的项目允许通过，显示为文字卡片）
    const images = (item.media || []).filter((u: string) => u?.startsWith('https://'))
    const firstImage = images[0] || ''

    // 有图片时才做可用性校验
    let imgValid = true
    if (firstImage) {
      if (imgChecked < 50 || imgChecked % 5 === 0) {
        imgValid = validateImageSync(firstImage)
        if (!imgValid) imgFailed++
      }
      imgChecked++
      if (!imgValid) continue
    }

    seenSlugs.add(slug)
    seenUrls.add(primaryUrl)

    const stage = inferStage(item.body || '')
    const body = item.body || ''

    projects.push({
      slug,
      name,
      tagline: extractTagline(body),
      description: body.slice(0, 1000),
      url: primaryUrl,
      screenshot: firstImage,
      stage,
      stageColor: stageColorMap[stage] || '#9CA3AF',
      score: item.density_score?.total ?? 0,
      topics: inferTopics(body),
      author: item.author_name || '',
      authorBio: (item.author_bio || '').slice(0, 100),
      source: item.source || '',
      sourceUrl: item.source_url || '',
      engagement: item.engagement || { likes: 0, comments: 0 },
      topComments: (item.top_comments || []).slice(0, 5).map((c: any) => ({
        author: c.author || '',
        content: (c.content || '').slice(0, 200),
        likes: c.likes || 0,
      })),
      publishedAt: item.published_at || '',
    })

    // 进度
    if (projects.length % 20 === 0) {
      process.stdout.write(`  ${projects.length} 个...\r`)
    }
  }

  console.log(`  提取: ${projects.length} 个 (图片检查: ${imgChecked}, 失败: ${imgFailed})`)

  // ── 精选 Post ──
  console.log('\n精选 Post...')

  // 扩展类型集：tutorial / tool_recommendation / market_observation / resource_collection 都有价值
  // other 类用更高分数线（22+）才纳入，避免低质量杂项污染
  const WORTHY_TYPES = new Set([
    'build_log', 'revenue_report', 'strategy_insight', 'failure_postmortem',
    'experience_share', 'tutorial', 'tool_recommendation',
    'market_observation', 'resource_collection',
  ])
  const SCORE_THRESHOLD_DEFAULT = 20
  const SCORE_THRESHOLD_OTHER = 22   // other 类要求更高

  // 同 topic 最多保留 N 条，防止某个话题刷屏
  // AI 因为太宽泛给多一些；具体细分 topic 严格限制
  const MAX_PER_TOPIC: Record<string, number> = {}
  const DEFAULT_MAX = 4
  const getTopicMax = (topic: string) => MAX_PER_TOPIC[topic] ?? DEFAULT_MAX
  const topicCount: Record<string, number> = {}

  const posts: FeedPost[] = []
  const seenPostSlugs = new Set<string>()

  for (const item of allItems) {
    const type = item.inferred_type
    const score = item.density_score?.total ?? 0

    // 过滤：product_launch 走 Project 通道，不进 Post
    if (type === 'product_launch') continue

    // 分数线
    const threshold = type === 'other' ? SCORE_THRESHOLD_OTHER : SCORE_THRESHOLD_DEFAULT
    if (score < threshold) continue

    // 类型过滤
    if (!WORTHY_TYPES.has(type) && type !== 'other') continue

    // 正文太短（< 150 字）没有阅读价值
    const rawBody = item.body || ''
    if (rawBody.length < 150) continue

    // 无标题的 other 类内容质量不稳定，要求更高分数
    if (type === 'other' && !item.title && rawBody.length < 400) continue

    // 非独立开发相关内容过滤（运营商教程、金融理财等）
    if (/德国|O2|SIM|手机卡|保号|开卡|KYC|基金|涨跌幅|盯盘|炒股/.test(rawBody)) continue

    const slug = makePostSlug(item.id)
    if (seenPostSlugs.has(slug)) continue

    // topic 去重：同主题不超过 MAX_PER_TOPIC 条
    const topics = inferTopics(rawBody)
    const primaryTopic = topics[0] || 'other'
    if ((topicCount[primaryTopic] || 0) >= getTopicMax(primaryTopic)) continue

    topicCount[primaryTopic] = (topicCount[primaryTopic] || 0) + 1
    seenPostSlugs.add(slug)

    const cleanedBody = cleanPostBody(rawBody)

    posts.push({
      id: item.id,
      slug,
      type,
      title: (item.title || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
      body: cleanedBody.slice(0, 5000),
      author: item.author_name || '',
      authorBio: (item.author_bio || '').slice(0, 100),
      score,
      engagement: item.engagement || { likes: 0, comments: 0 },
      topics,
      publishedAt: item.published_at || '',
      readingTime: estimateReadingTime(cleanedBody),
    })
  }

  // 按分数降序，最多取 project 数的 1/3（保证 Product 主导）
  posts.sort((a, b) => b.score - a.score)
  const maxPosts = Math.max(Math.floor(projects.length / 3), 10)
  const finalPosts = posts.slice(0, maxPosts)

  console.log(`  候选: ${posts.length} 条 → 精选: ${finalPosts.length} 条 (上限: ${maxPosts})`)

  // ── 输出 ──
  const cache: FeedCache = {
    projects,
    posts: finalPosts,
    meta: {
      generatedAt: new Date().toISOString(),
      projectCount: projects.length,
      postCount: finalPosts.length,
      sources: sourceCounts,
    },
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 2), 'utf-8')
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1)

  console.log(`\n=== 完成 ===`)
  console.log(`  data/feed.json: ${sizeMB}MB`)
  console.log(`  Project: ${projects.length}`)
  console.log(`  Post: ${finalPosts.length}`)
  console.log(`  生成时间: ${cache.meta.generatedAt}`)
}

// ═══════════════════════════════════════════════════════════════
// DB 模式（Phase 1+）：从 Turso 读取 publish_status=published 的记录
// 运行：npx tsx scripts/build-feed.ts --from-db
// ═══════════════════════════════════════════════════════════════

const STAGE_COLOR: Record<string, string> = {
  idea:       '#9B8AFB',
  building:   '#60A5FA',
  launched:   '#34D399',
  revenue:    '#FBBF24',
  paused:     '#9CA3AF',
  shutdown:   '#F87171',
}

async function buildFromDB() {
  console.log('=== 构建 feed.json（DB 模式）===\n')

  const { createClient } = await import('@libsql/client')
  const { drizzle }      = await import('drizzle-orm/libsql')
  const { eq, and }      = await import('drizzle-orm')
  const schema           = await import('../db/schema')

  const client = createClient({
    url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  const db = drizzle(client, { schema })

  // ── 查询已发布的 projects ──
  const dbProjects = await db.query.projects.findMany({
    where: and(
      eq(schema.projects.publishStatus, 'published'),
      eq(schema.projects.entityStatus,  'active'),
    ),
    orderBy: (p, { desc }) => [desc(p.publishedAtEditorial)],
    with: {
      // 通过 project_sources 关联到 content_item，获取 source/engagement 信息
      sources: {
        where: (ps: any, { eq }: any) => eq(ps.sourceType, 'primary_mention'),
        limit: 1,
        with: { contentItem: true },
      },
    },
  })

  console.log(`  DB projects (published): ${dbProjects.length}`)

  const projects: FeedProject[] = dbProjects.map(p => {
    const ci = (p as any).sources?.[0]?.contentItem

    return {
      slug:        p.slug,
      name:        p.name,
      tagline:     p.tagline ?? (ci?.body?.replace(/\n/g, ' ').slice(0, 80) ?? ''),
      description: p.description ?? ci?.body ?? '',
      url:         p.url,
      screenshot:  p.screenshot ?? null,
      stage:       p.stage ?? 'launched',
      stageColor:  STAGE_COLOR[p.stage ?? 'launched'] ?? STAGE_COLOR.launched,
      score:       0, // Enrichment Agent 运行后补充
      topics:      (p.topics ?? []) as string[],
      author:      ci?.authorName ?? '',
      authorBio:   ci?.authorBio ?? '',
      source:      ci?.source ?? 'unknown',
      sourceUrl:   ci?.sourceUrl ?? '',
      engagement:  { likes: ci?.likesCount ?? 0, comments: ci?.commentsCount ?? 0 },
      topComments: (ci?.topComments ?? []) as { author: string; content: string; likes: number }[],
      publishedAt: p.publishedAtEditorial?.toISOString() ?? new Date().toISOString(),
    } as FeedProject
  })

  // ── 查询已发布的 posts（content_items）──
  const dbPosts = await db.query.contentItems.findMany({
    where: and(
      eq(schema.contentItems.publishStatus, 'published'),
      eq(schema.contentItems.entityStatus,  'active'),
    ),
    orderBy: (ci: any, { desc }: any) => [desc(ci.publishedAtEditorial)],
  })

  console.log(`  DB posts (published):    ${dbPosts.length}`)

  const posts: FeedPost[] = dbPosts.map(ci => ({
    id:          ci.id,
    slug:        makePostSlug(ci.id),
    type:        ci.contentType ?? 'other',
    title:       ci.inferredProductName ?? '',
    body:        ci.body.slice(0, 5000),
    author:      ci.authorName,
    authorBio:   ci.authorBio ?? '',
    score:       0,
    engagement:  { likes: ci.likesCount ?? 0, comments: ci.commentsCount ?? 0 },
    topics:      (ci.topics ?? []) as string[],
    publishedAt: ci.publishedAt?.toISOString() ?? '',
    readingTime: estimateReadingTime(ci.body),
  }))

  // ── 降级：DB 为空时回退到 JSON ──
  if (projects.length === 0) {
    console.log('\n  DB 中无已发布 projects，回退到 JSON 模式...\n')
    return main()
  }

  // ── 输出 ──
  const sourceCounts: Record<string, number> = {}
  for (const p of projects) sourceCounts[p.source] = (sourceCounts[p.source] ?? 0) + 1

  const cache: FeedCache = {
    projects,
    posts,
    meta: {
      generatedAt:  new Date().toISOString(),
      projectCount: projects.length,
      postCount:    posts.length,
      sources:      sourceCounts,
    },
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 2), 'utf-8')
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1)

  console.log(`\n=== 完成（DB 模式）===`)
  console.log(`  data/feed.json: ${sizeMB}MB`)
  console.log(`  Project: ${projects.length}`)
  console.log(`  Post:    ${posts.length}`)
}

// ── 入口选择 ──
if (process.argv.includes('--from-db')) {
  buildFromDB().catch(err => { console.error(err); process.exit(1) })
} else {
  main()
}

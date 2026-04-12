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
  id: string
  type: string              // build_log / strategy_insight / ...
  title: string
  body: string
  author: string
  source: string
  sourceUrl: string
  score: number
  engagement: { likes: number; comments: number }
  topics: string[]
  publishedAt: string
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
  if (/\bai\b|人工智能|gpt|claude|模型/.test(b)) t.push('AI')
  if (/出海|global|海外/.test(b)) t.push('出海')
  if (/开发者|devtool|github|开源/.test(b)) t.push('开发工具')
  if (/效率|productivity|workflow/.test(b)) t.push('效率')
  if (/chrome|扩展|extension|插件/.test(b)) t.push('扩展')
  if (/ios|app store|移动/.test(b)) t.push('App')
  if (/开源|open.?source/.test(b)) t.push('开源')
  if (/saas|订阅/.test(b)) t.push('SaaS')
  if (/设计|design/.test(b)) t.push('设计')
  return t.length > 0 ? t.slice(0, 3) : []
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

    // 图片验证
    const images = (item.media || []).filter((u: string) => u?.startsWith('https://'))
    if (images.length === 0) continue

    // 抽样验证图片（前 50 个全验，之后每 5 个验 1 个节省时间）
    let imgValid = true
    if (imgChecked < 50 || imgChecked % 5 === 0) {
      imgValid = validateImageSync(images[0])
      if (!imgValid) imgFailed++
    }
    imgChecked++

    if (!imgValid) continue

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
      screenshot: images[0],
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
  const WORTHY_TYPES = new Set(['build_log', 'revenue_report', 'strategy_insight', 'experience_share', 'failure_postmortem'])
  const maxPosts = Math.max(Math.floor(projects.length / 4), 5)
  const posts: FeedPost[] = []

  for (const item of allItems) {
    if (posts.length >= maxPosts) break
    if (item.inferred_type === 'product_launch') continue
    if (!WORTHY_TYPES.has(item.inferred_type)) continue
    if ((item.density_score?.total ?? 0) < 18) continue

    posts.push({
      id: item.id,
      type: item.inferred_type,
      title: item.title || '',
      body: (item.body || '').slice(0, 500),
      author: item.author_name || '',
      source: item.source || '',
      sourceUrl: item.source_url || '',
      score: item.density_score?.total ?? 0,
      engagement: item.engagement || { likes: 0, comments: 0 },
      topics: inferTopics(item.body || ''),
      publishedAt: item.published_at || '',
    })
  }

  console.log(`  精选: ${posts.length} 条 (上限: ${maxPosts})`)

  // ── 输出 ──
  const cache: FeedCache = {
    projects,
    posts,
    meta: {
      generatedAt: new Date().toISOString(),
      projectCount: projects.length,
      postCount: posts.length,
      sources: sourceCounts,
    },
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 2), 'utf-8')
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1)

  console.log(`\n=== 完成 ===`)
  console.log(`  data/feed.json: ${sizeMB}MB`)
  console.log(`  Project: ${projects.length}`)
  console.log(`  Post: ${posts.length}`)
  console.log(`  生成时间: ${cache.meta.generatedAt}`)
}

main()

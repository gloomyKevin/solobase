/**
 * 从管道数据自动提取 Project — 全自动，不依赖硬编码列表
 *
 * 提取条件（全部满足）：
 * 1. 有产品级 URL（自有域名/App Store/Chrome Store/GitHub 仓库）
 * 2. 有图片（feed 卡片必须有视觉）
 * 3. 质量分 >= 阈值
 * 4. 有自创信号（排除推荐/讨论别人的产品）
 *
 * 没有图的高质量内容标记为 draft，保留但不进 feed
 *
 * 使用: npx tsx scripts/pipeline/seed-projects.ts
 */

import fs from 'node:fs'
import path from 'node:path'

const PIPELINE_DIR = path.join(process.cwd(), 'data', 'pipeline')
const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects')

const stageColorMap: Record<string, string> = {
  idea: '#9CA3AF', building: '#F59E0B', launched: '#DB6B25',
  revenue: '#3B9B8B', scaling: '#6C4FD6',
}

// ═══════════════════════════════════════════════════════════════
// 1. 产品 URL 识别 — 区分"产品链接"和"内容链接"
// ═══════════════════════════════════════════════════════════════

// 非产品平台 — 这些 URL 上的内容是文章/帖子/视频，不是产品本身
const CONTENT_PLATFORMS = new Set([
  'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'bilibili.com',
  'mp.weixin.qq.com', 'weixin.qq.com', 'xiaoyuzhoufm.com',
  'linux.do', 'v2ex.com', 'okjike.com', 'm.okjike.com',
  'web.okjike.com', 'jike.city',
  'wired.com', 'sspai.com', 'zhihu.com', 'juejin.cn',
  'medium.com', 'substack.com', 'feishu.cn', 'my.feishu.cn',
  'image-qiniu.jellow.site', 'testflight.apple.com',
  'arxiv.org', 'reddit.com', 'hackernoon.com',
])

// 产品分发平台 — 这些 URL 说明有真实产品
const PRODUCT_STORES = [
  'apps.apple.com',
  'play.google.com',
  'chromewebstore.google.com',
  'chrome.google.com/webstore',
  'addons.mozilla.org',
]

interface ProductUrl {
  url: string
  type: 'own_domain' | 'github_repo' | 'app_store' | 'chrome_store' | 'other_store'
  name: string  // 从 URL 提取的产品名
}

function identifyProductUrl(url: string): ProductUrl | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '').toLowerCase()

    // 跳过内容平台
    if ([...CONTENT_PLATFORMS].some(p => host.includes(p))) return null

    // App Store
    if (host.includes('apps.apple.com')) {
      const nameMatch = u.pathname.match(/\/app\/([^/]+)/)
      return { url, type: 'app_store', name: nameMatch?.[1]?.replace(/-/g, ' ') ?? 'App' }
    }

    // Chrome Web Store
    if (host.includes('chromewebstore.google.com') || host.includes('chrome.google.com')) {
      return { url, type: 'chrome_store', name: 'Chrome Extension' }
    }

    // GitHub 仓库（不是 github.com 首页或 profile）
    if (host === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        return { url, type: 'github_repo', name: parts[1] }
      }
      return null
    }

    // 自有域名
    const domain = host.split('.').slice(-2).join('.')
    const name = host.split('.')[0]
    if (name.length >= 2 && name.length <= 25) {
      return { url, type: 'own_domain', name: name.charAt(0).toUpperCase() + name.slice(1) }
    }

    return null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. 自创信号 — 区分"我做的"和"推荐别人的"
// ═══════════════════════════════════════════════════════════════

function hasSelfCreationSignal(body: string): boolean {
  // 强信号：明确的第一人称创作
  if (/(?:我|我们)(?:做了|开发了|发布了|上线了|开源了|推出了|构建了|写了)/.test(body)) return true
  if (/做了\s*(?:一个|一款)/.test(body)) return true
  if (/正式.*(?:发布|上线|开源)/.test(body)) return true
  if (/v?\d+\.\d+.*(?:发布|更新|上线)/.test(body)) return true
  if (/内测.*招募/.test(body)) return true
  // 弱但常见
  if (/(?:终于|历时|花了.*时间).*(?:上线|发布|完成)/.test(body)) return true
  return false
}

// ═══════════════════════════════════════════════════════════════
// 3. 产品名提取 — 从 body 中精确提取
// ═══════════════════════════════════════════════════════════════

// 不是产品名的常见词
const BAD_NAMES = new Set([
  'chrome', 'android', 'ios', 'web', 'app', 'api', 'blog', 'docs', 'cdn',
  'schema', 'project', 'release', 'update', 'version', 'beta', 'alpha',
  'http', 'https', 'www', 'url', 'link', 'page', 'site', 'demo',
  'easy', 'fast', 'pro', 'plus', 'new', 'old', 'test', 'dev', 'raw',
  'fragments', 'status', 'db', 'yb', 'lxx', 'cnfeat',
  'chatgpt', 'gpt', 'claude', 'gemini', 'openai', 'deepseek', 'llama',
  'copilot', 'cursor', 'anthropic', 'google', 'microsoft', 'apple',
  'amazon', 'meta', 'facebook', 'twitter', 'notion', 'figma',
  'android-release', 'image-qiniu',
  'producthunt', 'coagents', 'ant-design', 'vibe',
  'johnedchristensen', 'side-by-side', 'vho90ww6',
  'pp', '2025app', 'drawppt', 'happinessnetlify',
  'monica', 'nexty', 'insigh', 'network-memo',
])

function isValidName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 30) return false
  if (BAD_NAMES.has(name.toLowerCase())) return false
  // URL 编码的名字
  if (name.includes('%')) return false
  // 纯数字或单字母
  if (/^\d+$/.test(name) || /^[a-z]$/i.test(name)) return false
  return true
}

// 排除"别人发布的产品"的新闻帖
function isOthersProduct(body: string): boolean {
  // 大厂/机构发布的产品新闻
  if (/(?:百度|谷歌|Google|OpenAI|Anthropic|Meta|微软|字节|腾讯|阿里|Apple|清华|北大|智谱|Ant Design)(?:.*(?:发布|开源|推出|上线))/.test(body)) return true
  // 明确是推荐别人的（推特用户@xxx做了）
  if (/(?:推特|Twitter).*(?:用户|@).*做了/.test(body)) return true
  // PH/HN 日报
  if (/Product Hunt.*每日|Hacker News.*早报/i.test(body)) return true
  return false
}

function extractNameFromBody(body: string): string | null {
  const patterns = [
    /(?:做了|发布了?|上线了?|开源了?|推出了?)\s*(?:一个|一款)?\s*([A-Za-z][\w.-]{2,25})/,
    /(?:做了|发布了?|上线了?|开源了?|推出了?)\s*(?:一个|一款)?\s*[「【《]([^」】》\n]{2,20})[」】》]/,
    /^([A-Za-z][\w.-]{3,25})\s*[，,—\-:：|]/m,
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m?.[1] && isValidName(m[1].trim())) return m[1].trim()
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// 4. 构建 Project
// ═══════════════════════════════════════════════════════════════

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
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
  if (/\bai\b|人工智能|gpt|claude|模型/.test(b)) t.push('ai')
  if (/出海|global|海外/.test(b)) t.push('going-global')
  if (/开发者|devtool|github|开源/.test(b)) t.push('devtools')
  if (/效率|productivity|workflow/.test(b)) t.push('productivity')
  if (/设计|design|figma/.test(b)) t.push('design')
  if (/chrome|扩展|extension|插件/.test(b)) t.push('chrome-extension')
  if (/ios|app store|移动/.test(b)) t.push('mobile-app')
  if (/开源|open.?source/.test(b)) t.push('open-source')
  if (/saas|订阅/.test(b)) t.push('saas')
  return t.length > 0 ? t.slice(0, 3) : ['side-project']
}

function extractTagline(body: string): string {
  const lines = body.split(/\n/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 120)
  for (const line of lines.slice(0, 5)) {
    if (/^[#\-·•]/.test(line)) continue
    return line.replace(/^[-·•\d.、)\s]+/, '').slice(0, 80)
  }
  return body.replace(/\n/g, ' ').slice(0, 80)
}

// ═══════════════════════════════════════════════════════════════
// 5. Main
// ═══════════════════════════════════════════════════════════════

function main() {
  const sources = ['jike.json', 'v2ex.json', 'linuxdo.json']
  let items: any[] = []
  for (const src of sources) {
    const p = path.join(PIPELINE_DIR, src)
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      items.push(...data)
    }
  }
  console.log(`管道数据: ${items.length} 条\n`)

  // 按分数降序
  items.sort((a: any, b: any) => (b.density_score?.total ?? 0) - (a.density_score?.total ?? 0))

  const projects: any[] = []
  const drafts: any[] = []
  const seenSlugs = new Set<string>()
  const seenProductUrls = new Set<string>()

  for (const item of items) {
    const score = item.density_score?.total ?? 0
    if (score < 10) continue

    // 找产品 URL
    const productUrls = (item.external_links || [])
      .map(identifyProductUrl)
      .filter(Boolean) as ProductUrl[]

    if (productUrls.length === 0) continue

    // 自创信号 + 排除别人的产品新闻
    if (!hasSelfCreationSignal(item.body || '')) continue
    if (isOthersProduct(item.body || '')) continue

    // 去重：同一个产品 URL 只取分数最高的
    const primaryUrl = productUrls[0]
    if (seenProductUrls.has(primaryUrl.url)) continue
    seenProductUrls.add(primaryUrl.url)

    // 产品名：body 提取 > URL 提取，必须通过有效性检查
    const nameFromBody = extractNameFromBody(item.body || '')
    const urlName = isValidName(primaryUrl.name) ? primaryUrl.name : null
    const name = nameFromBody || urlName
    if (!name) continue

    const slug = slugify(name)
    if (!slug || seenSlugs.has(slug)) continue
    seenSlugs.add(slug)

    const hasImages = (item.media?.length ?? 0) > 0
    const stage = inferStage(item.body || '')

    const project = {
      id: `proj_${slug}`,
      slug,
      status: hasImages ? (score >= 18 ? 'featured' : 'basic') : 'draft',
      name,
      tagline: extractTagline(item.body || ''),
      description: (item.body || '').slice(0, 800),
      url: primaryUrl.url,
      screenshots: (item.media || []).slice(0, 3),
      businessModel: 'undetermined',
      buildEffort: 'undetermined',
      growthChannel: 'undetermined',
      founderType: 'undetermined',
      stage,
      tags: { track: inferTopics(item.body || ''), taskScenario: [], tools: [], techStack: [], market: [], platform: [] },
      metrics: {},
      buildStory: {},
      source: { type: 'curated', originalSource: item.source, originalUrl: item.source_url, claimedByFounder: false },
      featuredInsight: item.top_comments?.[0]?.content?.slice(0, 80) || undefined,
      isEditorsPick: score >= 20,
      stageColor: stageColorMap[stage] || '#9CA3AF',
      createdAt: item.published_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: item.published_at || new Date().toISOString(),
      _pipeline: {
        source: item.source, sourceUrl: item.source_url,
        author: item.author_name, authorBio: item.author_bio,
        engagement: item.engagement, densityScore: item.density_score,
        crossRefs: item.source_extra?.cross_refs, topComments: item.top_comments,
        productUrlType: primaryUrl.type,
      },
    }

    if (hasImages) {
      projects.push(project)
    } else {
      drafts.push(project)
    }
  }

  console.log(`提取结果:`)
  console.log(`  有图 Project (进 feed): ${projects.length}`)
  console.log(`  无图 Draft (暂存不展示): ${drafts.length}\n`)

  // 清理旧数据
  const oldFiles = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'))
  for (const f of oldFiles) fs.unlinkSync(path.join(PROJECTS_DIR, f))

  // 写入
  const allProjects = [...projects, ...drafts]
  const indexEntries: any[] = []

  for (const proj of allProjects) {
    fs.writeFileSync(path.join(PROJECTS_DIR, `${proj.slug}.json`), JSON.stringify(proj, null, 2), 'utf-8')
    indexEntries.push({
      slug: proj.slug, name: proj.name, status: proj.status,
      businessModel: proj.businessModel, buildEffort: proj.buildEffort,
      growthChannel: proj.growthChannel, founderType: proj.founderType,
      stage: proj.stage, tags: proj.tags.track,
      isEditorsPick: proj.isEditorsPick, publishedAt: proj.publishedAt,
    })
  }

  fs.writeFileSync(path.join(PROJECTS_DIR, '_index.json'), JSON.stringify(indexEntries, null, 2), 'utf-8')

  // 展示有图的
  console.log(`=== 有图 Project (进 feed) ===`)
  for (const p of projects) {
    const s = p._pipeline.densityScore?.total ?? 0
    const urlType = p._pipeline.productUrlType
    console.log(`  [${s}] ${p.name} — ${p.tagline.slice(0, 40)}... [${urlType}] ${p.status === 'featured' ? '⭐' : ''}`)
  }
  if (drafts.length > 0) {
    console.log(`\n=== 无图 Draft (暂不展示) ===`)
    for (const p of drafts.slice(0, 10)) {
      console.log(`  [${p._pipeline.densityScore?.total}] ${p.name} — ${p.url.slice(0, 40)}`)
    }
    if (drafts.length > 10) console.log(`  ... 还有 ${drafts.length - 10} 个`)
  }
}

main()

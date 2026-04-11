/**
 * 从管道数据 + 飞书审核结果生成真实 Project JSON
 *
 * 策略：以审核确认的真实产品为基础，从管道数据中提取完整信息
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

// ─── 已确认的真实产品列表（来自飞书审核 + 管道交叉验证） ─────────
// 每个条目：在管道数据中的匹配关键词 → 正确的产品信息

const KNOWN_PRODUCTS: {
  match: string           // 在 body 中搜索的关键词
  name: string
  tagline: string
  stage: string
  topics: string[]
  founderType: string
  vibes?: string[]
}[] = [
  {
    match: 'TypeNo',
    name: 'TypeNo',
    tagline: '面向 macOS 的极简语音输入法，永远免费，永远开源',
    stage: 'launched',
    topics: ['open-source', 'productivity'],
    founderType: 'tech_to_product',
    vibes: ['极简', '开源'],
  },
  {
    match: 'FateTell',
    name: 'FateTell',
    tagline: '玄学出海 AI 产品，用东方智慧做自我探索',
    stage: 'revenue',
    topics: ['ai-tools', 'going-global', 'mobile-app'],
    founderType: 'tech_to_product',
    vibes: ['出海标杆', '创意切入'],
  },
  {
    match: 'ColaMD',
    name: 'ColaMD',
    tagline: 'Agent 友好的 Markdown 编辑器，文件改了自动刷新',
    stage: 'launched',
    topics: ['devtools', 'open-source', 'vibe-coding'],
    founderType: 'tech_to_product',
  },
  {
    match: 'OpenMAIC',
    name: 'OpenMAIC',
    tagline: '清华团队开源的 AI 课堂，给话题就能生成完整互动课',
    stage: 'launched',
    topics: ['ai-tools', 'open-source'],
    founderType: 'small_team',
  },
  {
    match: 'agentboard',
    name: 'Agentboard',
    tagline: 'Coding 的微信运动排行榜，看你写了多少代码',
    stage: 'launched',
    topics: ['devtools', 'vibe-coding'],
    founderType: 'tech_to_product',
    vibes: ['创意切入'],
  },
  {
    match: 'OtterLife',
    name: 'OtterLife',
    tagline: '游戏化健康管理 App，用水獭养成来记录喝水和运动',
    stage: 'revenue',
    topics: ['mobile-app'],
    founderType: 'tech_to_product',
    vibes: ['设计感', '小而美'],
  },
  {
    match: 'nuwa-skill',
    name: '女娲.skill',
    tagline: '把同事蒸馏成 AI Skill，一键生成专属技能包',
    stage: 'launched',
    topics: ['ai-tools', 'open-source', 'vibe-coding'],
    founderType: 'tech_to_product',
  },
  {
    match: 'ai-daily-digest',
    name: 'AI Daily Digest',
    tagline: '开源的 AI 资讯自动摘要工具，每天帮你追最新动态',
    stage: 'launched',
    topics: ['ai-tools', 'open-source'],
    founderType: 'tech_to_product',
  },
  {
    match: 'WeClaw',
    name: 'WeClaw',
    tagline: '让微信接入任意 AI Agent 的开源桥接工具',
    stage: 'launched',
    topics: ['ai-tools', 'open-source', 'devtools'],
    founderType: 'tech_to_product',
  },
  {
    match: 'YouMind',
    name: 'YouMind',
    tagline: '为知识学习者和内容创作者打造的 AI Creation Studio',
    stage: 'launched',
    topics: ['ai-tools', 'productivity'],
    founderType: 'tech_to_product',
  },
  {
    match: '拾刻',
    name: '拾刻',
    tagline: '中学文学时钟 Chrome 插件，用课文里的时间描写当时钟',
    stage: 'launched',
    topics: ['chrome-extension'],
    founderType: 'tech_to_product',
    vibes: ['创意切入', '小而美'],
  },
  {
    match: 'AnimCard',
    name: 'AnimCard',
    tagline: '用动态卡片宣传你的产品，比枯燥文本更有传播力',
    stage: 'launched',
    topics: ['design', 'productivity'],
    founderType: 'tech_to_product',
  },
  {
    match: '好事发生',
    name: '好事发生',
    tagline: '一个专门记录好消息的 App，留住生活中的每个好事',
    stage: 'launched',
    topics: ['mobile-app'],
    founderType: 'tech_to_product',
    vibes: ['小而美', '有温度'],
  },
  {
    match: 'profitsearcher',
    name: 'ProfitSearcher',
    tagline: '每天自动追踪海外高增长软件产品，帮你判断哪些值得做',
    stage: 'building',
    topics: ['saas', 'going-global'],
    founderType: 'tech_to_product',
  },
  {
    match: 'Eimi',
    name: 'Eimi',
    tagline: '不要求学习和坚持，只把关心的事拆成每天的小卡片',
    stage: 'launched',
    topics: ['mobile-app', 'ai-tools'],
    founderType: 'tech_to_product',
    vibes: ['小而美', '设计感'],
  },
  {
    match: 'agent-form',
    name: 'AgentForm',
    tagline: '专为出海开发者打造的外链申请表 Agent Chrome 扩展',
    stage: 'launched',
    topics: ['chrome-extension', 'going-global'],
    founderType: 'tech_to_product',
  },
  {
    match: '比比怪',
    name: '比比怪',
    tagline: '截图识别店名，跳转美团/京东比价，帮你省外卖钱',
    stage: 'launched',
    topics: ['mobile-app'],
    founderType: 'tech_to_product',
    vibes: ['小而美', '创意切入'],
  },
  {
    match: 'myvibe.so',
    name: '你的中国色',
    tagline: '8 道直觉题测出你的专属中国传统色 + 穿搭配色方案',
    stage: 'launched',
    topics: ['design'],
    founderType: 'tech_to_product',
    vibes: ['创意切入', '小而美'],
  },
  {
    match: 'claude-code-now',
    name: 'claude-code-now',
    tagline: '不会写代码的产品经理做的第一个 Mac App',
    stage: 'launched',
    topics: ['vibe-coding', 'productivity'],
    founderType: 'non_tech_ai',
  },
  {
    match: 'MkDollar',
    name: 'MkDollar',
    tagline: '独立开发者收入追踪和项目展示平台',
    stage: 'launched',
    topics: ['saas', 'side-project'],
    founderType: 'tech_to_product',
  },
]

// ─── 从管道数据中匹配并构建 Project ─────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

function main() {
  // 加载管道数据
  const sources = ['jike.json', 'v2ex.json', 'linuxdo.json']
  let items: any[] = []
  for (const src of sources) {
    const p = path.join(PIPELINE_DIR, src)
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      items.push(...data)
    }
  }
  console.log(`加载管道数据: ${items.length} 条\n`)

  // 清理旧数据
  const oldFiles = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'))
  for (const f of oldFiles) fs.unlinkSync(path.join(PROJECTS_DIR, f))
  console.log(`清理旧文件: ${oldFiles.length} 个\n`)

  const indexEntries: any[] = []
  let matched = 0

  for (const known of KNOWN_PRODUCTS) {
    // 在管道数据中找匹配的条目（取分数最高的）
    const candidates = items
      .filter(item => item.body.includes(known.match))
      .sort((a, b) => (b.density_score?.total || 0) - (a.density_score?.total || 0))

    const item = candidates[0]
    if (!item) {
      console.log(`  ✗ ${known.name} — 管道中未找到`)
      continue
    }

    matched++
    const slug = slugify(known.name)
    const url = item.external_links?.[0] || item.source_url

    const project = {
      id: `proj_${slug}`,
      slug,
      status: (item.density_score?.total || 0) >= 20 ? 'featured' : 'basic',
      name: known.name,
      tagline: known.tagline,
      description: item.body.slice(0, 800),
      url,
      screenshots: (item.media || []).slice(0, 3),
      businessModel: 'undetermined',
      buildEffort: 'undetermined',
      growthChannel: 'undetermined',
      founderType: known.founderType,
      stage: known.stage,
      tags: {
        track: known.topics,
        taskScenario: [],
        tools: [],
        techStack: [],
        market: [],
        platform: [],
      },
      metrics: {},
      buildStory: {},
      source: {
        type: 'curated',
        originalSource: item.source,
        originalUrl: item.source_url,
        claimedByFounder: false,
      },
      featuredInsight: item.top_comments?.[0]?.content?.slice(0, 80) || undefined,
      isEditorsPick: (item.density_score?.total || 0) >= 20,
      stageColor: stageColorMap[known.stage] || '#9CA3AF',
      vibes: known.vibes || [],
      createdAt: item.published_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: item.published_at || new Date().toISOString(),
      _pipeline: {
        source: item.source,
        sourceUrl: item.source_url,
        author: item.author_name,
        authorBio: item.author_bio,
        engagement: item.engagement,
        densityScore: item.density_score,
        crossRefs: item.source_extra?.cross_refs,
        topComments: item.top_comments,
      },
    }

    fs.writeFileSync(
      path.join(PROJECTS_DIR, `${slug}.json`),
      JSON.stringify(project, null, 2),
      'utf-8'
    )

    indexEntries.push({
      slug, name: known.name, status: project.status,
      businessModel: project.businessModel, buildEffort: project.buildEffort,
      growthChannel: project.growthChannel, founderType: project.founderType,
      stage: project.stage, tags: known.topics,
      isEditorsPick: project.isEditorsPick, publishedAt: project.publishedAt,
    })

    const score = item.density_score?.total || 0
    const pick = project.isEditorsPick ? ' ⭐' : ''
    console.log(`  ✓ ${known.name} — ${known.tagline.slice(0, 35)}... [${item.source}] (${score}分${pick})`)
  }

  fs.writeFileSync(
    path.join(PROJECTS_DIR, '_index.json'),
    JSON.stringify(indexEntries, null, 2),
    'utf-8'
  )

  console.log(`\n匹配 ${matched}/${KNOWN_PRODUCTS.length} 个产品 → data/projects/`)
}

main()

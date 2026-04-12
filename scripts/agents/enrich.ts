/**
 * Enrichment Agent
 *
 * 对 content_items 做三件事：
 *  1. 确定性噪声过滤（规则，不花 LLM）
 *  2. LLM Pass 1：Haiku + tool_use → 分类、提取、编辑推荐
 *  3. LLM Pass 2：Sonnet → 编辑摘要（仅 rec=include/review）
 *  4. 去重候选检测（URL normalized 精确匹配）
 *
 * 所有推断历史写 inference_runs（append-only）
 * content_items 快照字段随时更新
 *
 * 运行：npx tsx scripts/agents/enrich.ts [itemId]
 *   不传 id → 处理所有 llmProcessedAt IS NULL 的记录
 *   传 id  → 只处理该条（调试用）
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { isNull, eq, and } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { normalizeUrl } from '../utils/normalize-url'
import { AI_CONFIG } from '../config/ai'

// ── DB ───────────────────────────────────────────────────────────

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// ── Anthropic 客户端 ──────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey:  AI_CONFIG.apiKey,
  baseURL: AI_CONFIG.baseURL,
})

// ── 确定性噪声规则 ────────────────────────────────────────────────

const NOISE_RULES: { name: string; test: (body: string) => boolean }[] = [
  { name: 'recruitment',  test: b => /招聘|求职|内推|HC开放|社招|校招|JD[:：]|工作机会|求offer/.test(b) },
  { name: 'lottery',      test: b => /抽奖|转发.*送|送出.*名额|中奖|福利活动|参与抽|随机抽取/.test(b) },
  { name: 'repost_only',  test: b => /^(转[：:：]|分享一篇|推荐一篇|转一条)/.test(b.trim()) && b.length < 200 },
  { name: 'pure_ad',      test: b => /广告|sponsore|付费推广/.test(b) && !/独立开发|自己做|自己开发/.test(b) },
  { name: 'too_short',    test: b => b.trim().length < 80 },
]

function checkNoise(body: string): string | null {
  for (const rule of NOISE_RULES) {
    if (rule.test(body)) return rule.name
  }
  return null
}

// ── Pass 1 Schema (Zod) ───────────────────────────────────────────

const Pass1Schema = z.object({
  contentType: z.enum([
    'product_launch',    // 作者本人发布 / 介绍自己做的产品
    'build_log',         // 开发过程、复盘、进度更新
    'revenue_share',     // 收入/用户数里程碑分享
    'strategy_insight',  // 运营、定价、增长策略经验
    'tech_tutorial',     // 技术教程（不是产品介绍）
    'tool_share',        // 分享别人的工具/产品
    'community_discuss', // 话题讨论，无产品
    'other',
  ]),

  // 这条内容是否与"中文独立开发者生态"直接相关
  isIndieMakerContent: z.boolean(),

  // 作者是否就是产品的 maker（vs 只是在分享别人的东西）
  isAuthorTheMaker: z.boolean(),

  // 内容质量信号
  hasPersonalStory:    z.boolean(), // 有具体的个人经历/心路历程
  hasSpecificNumbers:  z.boolean(), // 有具体数字（用户数/收入/时间）
  hasGenuineInsight:   z.boolean(), // 有真实洞察，不是泛泛而谈

  // 推断出的产品信息（如果有）
  inferredProductName:    z.string().nullable(),
  inferredProductUrl:     z.string().nullable(), // 最可能是产品的 URL
  inferredProductOneLiner:z.string().nullable(), // 一句话描述产品是什么
  inferredProductStage:   z.enum(['idea', 'building', 'launched', 'revenue', 'paused', 'shutdown']).nullable(),
  inferredMakerName:      z.string().nullable(),

  keyMetrics:   z.array(z.string()), // 提到的具体指标（"200付费用户"、"$3k MRR"）
  topics:       z.array(z.string()), // 相关 topic（productivity / dev-tools / ai / saas / ...）

  // 编辑推荐
  editorialRec: z.enum(['include', 'review', 'exclude']),
  confidence:   z.number().min(0).max(1),
  recReason:    z.string(), // 一句话说明推荐/排除原因
  concerns:     z.array(z.string()), // 顾虑点（如：产品链接无法访问、内容过于技术化）
})

type Pass1Result = z.infer<typeof Pass1Schema>

// ── Pass 1 Prompt ─────────────────────────────────────────────────

const PASS1_SYSTEM = `你是 Solobase 的内容审核助手。Solobase 是一个专注于中文独立开发者（indie maker）生态的产品发现平台。

你的任务是判断一条从社区（即刻/V2EX/Linux.do）抓取的帖子，是否适合在 Solobase 上展示。

Solobase 的收录标准：
✓ 独立开发者介绍/发布自己做的产品
✓ Maker 分享真实的开发经历、复盘、收入里程碑
✓ 有具体数字和个人故事的经验分享
✓ 小而美的产品，体现创造力和真实的用户价值

不收录：
✗ 招聘、抽奖、纯广告
✗ 转发/推荐别人的产品（作者不是 maker）
✗ 泛泛的 AI 焦虑文章、科普文、新闻转载
✗ 大厂产品、知名开源项目（不是独立开发者）
✗ 纯技术教程（没有产品/maker 背景）
✗ 社区吐槽、闲聊、无实质内容

对于产品 URL，请优先选择产品的官网/GitHub/App Store，不要返回社交平台或内容分发平台的链接。`

async function runPass1(item: typeof schema.contentItems.$inferSelect): Promise<Pass1Result | null> {
  const prompt = `以下是一条来自「${item.source}」的帖子，请分析并填写 extract_content_info 工具。

作者：${item.authorName}${item.authorBio ? `（${item.authorBio.slice(0, 100)}）` : ''}
发布时间：${item.publishedAt?.toISOString().slice(0, 10) ?? '未知'}
互动：点赞 ${item.likesCount}，评论 ${item.commentsCount}
外部链接：${(item.externalLinks ?? []).slice(0, 5).join('、') || '无'}

正文：
${item.body.slice(0, 3000)}`

  for (let attempt = 1; attempt <= AI_CONFIG.retry.maxAttempts; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model:      AI_CONFIG.models.haiku,
        max_tokens: 1024,
        system:     PASS1_SYSTEM,
        tools: [{
          name:        'extract_content_info',
          description: '提取内容分类和产品信息',
          input_schema: {
            type: 'object' as const,
            properties: {
              contentType:             { type: 'string', enum: ['product_launch','build_log','revenue_share','strategy_insight','tech_tutorial','tool_share','community_discuss','other'] },
              isIndieMakerContent:     { type: 'boolean' },
              isAuthorTheMaker:        { type: 'boolean' },
              hasPersonalStory:        { type: 'boolean' },
              hasSpecificNumbers:      { type: 'boolean' },
              hasGenuineInsight:       { type: 'boolean' },
              inferredProductName:     { type: ['string', 'null'] },
              inferredProductUrl:      { type: ['string', 'null'] },
              inferredProductOneLiner: { type: ['string', 'null'] },
              inferredProductStage:    { type: ['string', 'null'], enum: ['idea','building','launched','revenue','paused','shutdown', null] },
              inferredMakerName:       { type: ['string', 'null'] },
              keyMetrics:              { type: 'array', items: { type: 'string' } },
              topics:                  { type: 'array', items: { type: 'string' } },
              editorialRec:            { type: 'string', enum: ['include','review','exclude'] },
              confidence:              { type: 'number', minimum: 0, maximum: 1 },
              recReason:               { type: 'string' },
              concerns:                { type: 'array', items: { type: 'string' } },
            },
            required: ['contentType','isIndieMakerContent','isAuthorTheMaker','hasPersonalStory','hasSpecificNumbers','hasGenuineInsight','inferredProductName','inferredProductUrl','inferredProductOneLiner','inferredProductStage','inferredMakerName','keyMetrics','topics','editorialRec','confidence','recReason','concerns'],
          },
        }],
        tool_choice: { type: 'tool', name: 'extract_content_info' },
      })

      const toolUse = response.content.find(b => b.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') throw new Error('no tool_use block')

      return Pass1Schema.parse(toolUse.input)

    } catch (err) {
      if (attempt === AI_CONFIG.retry.maxAttempts) return null
      await new Promise(r => setTimeout(r, AI_CONFIG.retry.baseDelayMs * Math.pow(2, attempt - 1)))
    }
  }
  return null
}

// ── Pass 2 Prompt ─────────────────────────────────────────────────

async function runPass2(item: typeof schema.contentItems.$inferSelect, pass1: Pass1Result): Promise<{ editorialSummary: string; collectionAngle: string } | null> {
  const prompt = `你是 Solobase 的内容编辑。请为以下帖子写一段编辑摘要，用于辅助编辑判断是否收录。

产品：${pass1.inferredProductName ?? '未识别'} ${pass1.inferredProductOneLiner ? `— ${pass1.inferredProductOneLiner}` : ''}
阶段：${pass1.inferredProductStage ?? '未知'}
作者：${item.authorName}
AI 推荐：${pass1.editorialRec}（置信度 ${(pass1.confidence * 100).toFixed(0)}%）
推荐原因：${pass1.recReason}
关键指标：${pass1.keyMetrics.join('、') || '无'}

正文（前 1500 字）：
${item.body.slice(0, 1500)}

请输出 JSON：
{
  "editorialSummary": "2-3 句话，说明这条内容的核心价值和 Solobase 收录它的理由。语气像编辑给编辑的内部备注，直接、准确。",
  "collectionAngle": "一句话，如果要在 Solobase 上精选这个产品，你会从什么角度切入？（e.g. '三个月独自做出来的极简 Markdown 编辑器，背后有很扎实的工程思考'）"
}`

  for (let attempt = 1; attempt <= AI_CONFIG.retry.maxAttempts; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model:      AI_CONFIG.models.sonnet,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('no JSON in response')

      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.editorialSummary || !parsed.collectionAngle) throw new Error('missing fields')

      return { editorialSummary: parsed.editorialSummary, collectionAngle: parsed.collectionAngle }

    } catch (err) {
      if (attempt === AI_CONFIG.retry.maxAttempts) return null
      await new Promise(r => setTimeout(r, AI_CONFIG.retry.baseDelayMs * Math.pow(2, attempt - 1)))
    }
  }
  return null
}

// ── 去重候选检测 ──────────────────────────────────────────────────

async function checkDedup(item: typeof schema.contentItems.$inferSelect, pass1: Pass1Result) {
  if (!pass1.inferredProductUrl) return

  const normalized = normalizeUrl(pass1.inferredProductUrl)
  if (!normalized) return

  const existing = await db.query.projects.findFirst({
    where: eq(schema.projects.urlNormalized, normalized),
    columns: { id: true, name: true },
  })

  if (existing) {
    await db
      .insert(schema.dedupCandidates)
      .values({
        id:              `dedup_${item.id}_${existing.id}`,
        itemAId:         item.id,
        itemBId:         existing.id,
        detectionMethod: 'url_normalized',
        suggestedAction: 'merge',
        status:          'pending',
        createdAt:       new Date(),
      })
      .onConflictDoNothing()
  }
}

// ── 单条处理主函数 ────────────────────────────────────────────────

export async function enrichItem(item: typeof schema.contentItems.$inferSelect): Promise<'archived' | 'pass1_fail' | 'pass2_skip' | 'done'> {
  const now = new Date()

  // ① 确定性噪声过滤
  const noiseRule = checkNoise(item.body)
  if (noiseRule) {
    await db.update(schema.contentItems)
      .set({ reviewStatus: 'archived', archiveReason: `noise:${noiseRule}`, updatedAt: now })
      .where(eq(schema.contentItems.id, item.id))
    return 'archived'
  }

  // ② Pass 1
  const pass1 = await runPass1(item)

  // 写 inference_runs（不管成功还是失败）
  await db.insert(schema.inferenceRuns).values({
    id:            `ir1_${item.id}_${Date.now()}`,
    contentItemId: item.id,
    promptVersion: 'v1.0',
    model:         AI_CONFIG.models.haiku,
    parsedOk:      pass1 !== null,
    parseError:    pass1 === null ? 'pass1 returned null' : null,
    rawOutput:     pass1 ?? null,
    createdAt:     now,
  })

  if (!pass1) {
    await db.update(schema.contentItems)
      .set({ llmProcessedAt: now, updatedAt: now })
      .where(eq(schema.contentItems.id, item.id))
    return 'pass1_fail'
  }

  // 更新 content_items 快照（Pass 1 结果）
  await db.update(schema.contentItems)
    .set({
      contentType:             pass1.contentType,
      confidence:              pass1.confidence,
      isIndieMaker:            pass1.isIndieMakerContent,
      inferredProductName:     pass1.inferredProductName,
      inferredProductUrl:      pass1.inferredProductUrl,
      inferredProductOneLiner: pass1.inferredProductOneLiner,
      inferredProductStage:    pass1.inferredProductStage,
      inferredMakerName:       pass1.inferredMakerName,
      keyMetrics:              pass1.keyMetrics,
      topics:                  pass1.topics,
      hasPersonalStory:        pass1.hasPersonalStory,
      hasSpecificNumbers:      pass1.hasSpecificNumbers,
      hasGenuineInsight:       pass1.hasGenuineInsight,
      editorialRec:            pass1.editorialRec,
      recReason:               pass1.recReason,
      concerns:                pass1.concerns,
      llmProcessedAt:          now,
      updatedAt:               now,
    })
    .where(eq(schema.contentItems.id, item.id))

  // ③ 去重检测
  await checkDedup(item, pass1)

  // ④ Pass 2（仅 include/review）
  if (pass1.editorialRec === 'include' || pass1.editorialRec === 'review') {
    const pass2 = await runPass2(item, pass1)

    if (pass2) {
      await db.insert(schema.inferenceRuns).values({
        id:            `ir2_${item.id}_${Date.now()}`,
        contentItemId: item.id,
        promptVersion: 'v1.0-pass2',
        model:         AI_CONFIG.models.sonnet,
        parsedOk:      true,
        rawOutput:     pass2,
        createdAt:     now,
      })

      await db.update(schema.contentItems)
        .set({
          editorialSummary: pass2.editorialSummary,
          collectionAngle:  pass2.collectionAngle,
          updatedAt:        now,
        })
        .where(eq(schema.contentItems.id, item.id))
    }
    // Pass 2 失败不阻塞，editorialSummary 留 null，前端降级显示 recReason
  }

  return 'done'
}

// ── CLI 入口 ─────────────────────────────────────────────────────

async function main() {
  const targetId = process.argv[2]

  if (targetId) {
    // 单条调试模式
    const item = await db.query.contentItems.findFirst({
      where: eq(schema.contentItems.id, targetId),
    })
    if (!item) { console.error(`未找到 id=${targetId}`); process.exit(1) }

    console.log(`处理单条: ${item.id} (${item.source})`)
    console.log(`正文预览: ${item.body.slice(0, 100)}...`)

    const result = await enrichItem(item)
    console.log(`结果: ${result}`)

    // 打印更新后的状态
    const updated = await db.query.contentItems.findFirst({
      where: eq(schema.contentItems.id, targetId),
      columns: { editorialRec: true, confidence: true, recReason: true, editorialSummary: true, contentType: true, inferredProductName: true },
    })
    console.log('更新后:', JSON.stringify(updated, null, 2))

  } else {
    // 只处理第一条未处理记录（用于测试，全量处理用 enrich-all.ts）
    const item = await db.query.contentItems.findFirst({
      where: isNull(schema.contentItems.llmProcessedAt),
    })
    if (!item) { console.log('没有待处理记录'); process.exit(0) }

    console.log(`测试单条: ${item.id}`)
    const result = await enrichItem(item)
    console.log(`结果: ${result}`)
  }

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })

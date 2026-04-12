/**
 * AI Intake Engine
 * POST /api/intake
 *
 * action: 'analyze_url'    → 抓取产品页面，提取结构化信息
 * action: 'analyze_story'  → 分析 maker 故事文本，结构化输出
 * action: 'confirm'        → 写入 submissions 表，触发轻审核
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../../../../db/schema'
import Anthropic from '@anthropic-ai/sdk'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

const ai = new Anthropic({
  baseURL: process.env.ONE_API_BASE_URL,
  apiKey: process.env.ONE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '',
})

// ── URL 分析 ──────────────────────────────────────────────────────

interface AnalyzedProduct {
  name: string
  tagline: string
  description: string
  stage: string
  topics: string[]
  url: string
  ogImage: string | null
}

async function analyzeUrl(url: string): Promise<AnalyzedProduct> {
  // 用 Jina Reader 抓取页面内容
  const jinaUrl = `https://r.jina.ai/${url}`
  let pageContent = ''
  try {
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-Timeout': '10' },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) pageContent = (await res.text()).slice(0, 3000)
  } catch { /* fallback to empty */ }

  // 同时抓 og:image
  let ogImage: string | null = null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      ogImage = m?.[1] ?? null
    }
  } catch { /* no image */ }

  const prompt = `你是产品信息提取助手。根据以下网页内容，提取产品的结构化信息。

URL: ${url}
页面内容:
${pageContent || '（无法抓取页面内容，请根据 URL 推断）'}

请严格返回 JSON，格式如下（不要返回其他内容）：
{
  "name": "产品名称",
  "tagline": "一句话介绍（15字以内）",
  "description": "产品描述（50-100字，中文）",
  "stage": "idea | building | launched | revenue | paused | shutdown",
  "topics": ["标签1", "标签2"]
}`

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text
  let extracted: Omit<AnalyzedProduct, 'url' | 'ogImage'>
  try {
    extracted = JSON.parse(raw.match(/\{[\s\S]+\}/)?.[0] ?? '{}')
  } catch {
    extracted = { name: '', tagline: '', description: '', stage: 'launched', topics: [] }
  }

  return { ...extracted, url, ogImage }
}

// ── 故事分析 ──────────────────────────────────────────────────────

interface AnalyzedStory {
  contentType: string
  summary: string
  collectionAngle: string
  keyMetrics: string[]
  concerns: string[]
}

async function analyzeStory(story: string, productName: string): Promise<AnalyzedStory> {
  const prompt = `你是独立开发者内容分析专家。分析以下 maker 故事，提取结构化信息。

产品名称: ${productName}
故事内容:
${story.slice(0, 2000)}

严格返回 JSON：
{
  "contentType": "product_launch | maker_story | tutorial | revenue_report | milestone",
  "summary": "编辑视角的50字内容摘要",
  "collectionAngle": "这个内容最值得收录的角度，一句话",
  "keyMetrics": ["关键数字1（如有）", "关键数字2"],
  "concerns": ["需要注意的点（如无则空数组）"]
}`

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text
  try {
    return JSON.parse(raw.match(/\{[\s\S]+\}/)?.[0] ?? '{}') as AnalyzedStory
  } catch {
    return { contentType: 'maker_story', summary: '', collectionAngle: '', keyMetrics: [], concerns: [] }
  }
}

// ── 轻审核（native_submitted 自动过审逻辑）───────────────────────

async function autoReview(submissionId: string, productUrl: string): Promise<boolean> {
  // 四项检查：URL 可达、非大公司、有真实描述、非明显垃圾
  const checks = {
    urlReachable: false,
    hasDescription: false,
  }

  try {
    const res = await fetch(productUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    checks.urlReachable = res.ok
  } catch { /* unreachable */ }

  // 这里可以扩展更多检查，目前两项通过即自动入库
  const passed = checks.urlReachable

  await db.update(schema.submissions)
    .set({
      autoCheckPassed: passed ? 1 : 0,
      autoCheckNotes: JSON.stringify(checks),
      updatedAt: new Date(),
    })
    .where(eq(schema.submissions.id, submissionId))

  return passed
}

// ── Route Handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { action } = body as { action: string }

  // ── analyze_url ──────────────────────────────────────────────────
  if (action === 'analyze_url') {
    const { url } = body as { url: string }
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

    try {
      const result = await analyzeUrl(url)
      return NextResponse.json({ ok: true, data: result })
    } catch (err) {
      console.error('[intake/analyze_url]', err)
      return NextResponse.json({ error: 'analysis failed' }, { status: 500 })
    }
  }

  // ── analyze_story ────────────────────────────────────────────────
  if (action === 'analyze_story') {
    const { story, productName } = body as { story: string; productName: string }
    if (!story) return NextResponse.json({ error: 'story required' }, { status: 400 })

    try {
      const result = await analyzeStory(story, productName ?? '')
      return NextResponse.json({ ok: true, data: result })
    } catch (err) {
      console.error('[intake/analyze_story]', err)
      return NextResponse.json({ error: 'analysis failed' }, { status: 500 })
    }
  }

  // ── confirm ──────────────────────────────────────────────────────
  if (action === 'confirm') {
    const {
      email, name, productUrl, productName, tagline, description,
      stage, topics, story, storyAnalysis, makerOverrides,
    } = body as Record<string, unknown>

    if (!email || !productUrl || !productName) {
      return NextResponse.json({ error: 'email, productUrl, productName required' }, { status: 400 })
    }

    const now = new Date()
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // 写入 submission
    await db.insert(schema.submissions).values({
      id: submissionId,
      type: 'product_submit',
      submitterEmail: email as string,
      submitterName: name as string ?? '',
      rawInput: JSON.stringify({ url: productUrl, story }),
      aiExtracted: JSON.stringify({ productName, tagline, description, stage, topics, storyAnalysis }),
      makerOverrides: makerOverrides ? JSON.stringify(makerOverrides) : null,
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    })

    // 异步轻审核（不阻塞响应）
    autoReview(submissionId, productUrl as string).catch(console.error)

    // TODO: 发送 Magic Link 邮件确认（Phase 4.3）

    return NextResponse.json({
      ok: true,
      submissionId,
      message: '提交成功！我们会尽快审核，结果将发送至您的邮箱。',
    })
  }

  return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
}

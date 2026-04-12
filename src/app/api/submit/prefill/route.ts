import { NextResponse } from 'next/server'
import { PrefillRequestSchema } from '@/lib/validations/submission'
import Anthropic from '@anthropic-ai/sdk'

const ai = new Anthropic({
  baseURL: process.env.ONE_API_BASE_URL,
  apiKey: process.env.ONE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '',
})

async function fetchPageContent(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-Timeout': '10' },
      signal: AbortSignal.timeout(12000),
    })
    if (res.ok) return (await res.text()).slice(0, 3000)
  } catch { /* fallback */ }
  return ''
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '无效的请求格式' }, { status: 400 })
  }

  const parsed = PrefillRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { url, text } = parsed.data

  // 并行抓取页面内容和 og:image
  const [pageContent, ogImage] = await Promise.all([
    url ? fetchPageContent(url) : Promise.resolve(''),
    url ? fetchOgImage(url) : Promise.resolve(null),
  ])

  const contextBlock = url
    ? `产品 URL: ${url}\n页面内容:\n${pageContent || '（无法抓取）'}`
    : `用户描述:\n${text}`

  const prompt = `你是产品信息提取助手，专注于中国独立开发者生态。根据以下信息提取产品结构化信息。

${contextBlock}

请严格返回 JSON（不要返回其他内容）：
{
  "name": "产品名称（中英文均可）",
  "tagline": "一句话介绍（15字以内，中文）",
  "description": "产品描述（50-100字，中文，面向用户）",
  "suggestedTags": ["标签1", "标签2", "标签3"]
}`

  try {
    const msg = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (msg.content[0] as { type: string; text: string }).text
    const extracted = JSON.parse(raw.match(/\{[\s\S]+\}/)?.[0] ?? '{}')

    return NextResponse.json({
      name: extracted.name ?? '',
      tagline: extracted.tagline ?? '',
      description: extracted.description ?? '',
      suggestedTags: extracted.suggestedTags ?? [],
      ogImage,
      confidence: 0.85,
    })
  } catch (err) {
    console.error('[submit/prefill]', err)
    // 降级：只返回基本信息
    const fallbackName = url
      ? (() => { try { const d = new URL(url).hostname.replace('www.', ''); return d.split('.')[0]!.charAt(0).toUpperCase() + d.split('.')[0]!.slice(1) } catch { return '' } })()
      : (text?.split(/[。.！!？?\n]/)[0]?.trim().slice(0, 30) ?? '')
    return NextResponse.json({ name: fallbackName, tagline: '', description: '', suggestedTags: [], ogImage, confidence: 0.2 })
  }
}

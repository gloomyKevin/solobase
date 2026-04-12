import { NextResponse } from 'next/server'
import { SubmitRequestSchema } from '@/lib/validations/submission'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../../../../db/schema'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

// 轻审核：URL 可达性检查（异步，不阻塞提交）
async function autoCheck(submissionId: string, url: string) {
  let urlReachable = false
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    urlReachable = res.ok || res.status < 400
  } catch { /* unreachable */ }

  await db.update(schema.submissions)
    .set({
      autoCheckPassed: urlReachable ? 1 : 0,
      autoCheckNotes: JSON.stringify({ urlReachable }),
      updatedAt: new Date(),
    })
    .where(eq(schema.submissions.id, submissionId))
    .catch(console.error)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '无效的请求格式' }, { status: 400 })
  }

  const parsed = SubmitRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { url, additionalText, confirmedData } = parsed.data
  const now = new Date()
  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  try {
    await client.execute({
      sql: `INSERT INTO submissions (id, type, raw_input, ai_extracted, status, submitted_at, updated_at)
            VALUES (?, 'product_submit', ?, ?, 'submitted', ?, ?)`,
      args: [
        submissionId,
        JSON.stringify({ url, additionalText }),
        JSON.stringify(confirmedData),
        Math.floor(now.getTime() / 1000),
        Math.floor(now.getTime() / 1000),
      ],
    })

    if (url) autoCheck(submissionId, url).catch(console.error)

    return NextResponse.json({ id: submissionId, success: true })
  } catch (err) {
    console.error('[submit]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

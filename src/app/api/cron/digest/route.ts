/**
 * Vercel Cron：每日 07:00 北京时间发送编辑日报
 * 在 vercel.json 配置：{ "path": "/api/cron/digest", "schedule": "0 23 * * *" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { runDigest } from '../../../../../scripts/agents/digest'

export async function GET(req: NextRequest) {
  // 验证来自 Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    await runDigest()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cron/digest]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

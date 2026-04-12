/**
 * 飞书 Interactive Card 回调
 *
 * 接收飞书卡片按钮点击事件，调用 Editorial Action API。
 *
 * 配置步骤：
 *   1. 飞书开放平台 → 创建应用 → 开启 Bot + Interactive Card 权限
 *   2. 配置消息卡片请求网址：https://your-domain.vercel.app/api/feishu/callback
 *   3. 在 .env.local 设置：
 *      FEISHU_APP_ID=cli_xxx
 *      FEISHU_APP_SECRET=xxx
 *      FEISHU_VERIFICATION_TOKEN=xxx   （用于签名验证）
 *      FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// ── 签名验证 ──────────────────────────────────────────────────────

function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  body: string,
  secret: string,
): boolean {
  const content = timestamp + nonce + secret + body
  const hash = createHmac('sha256', secret).update(content).digest('hex')
  // 飞书签名格式：飞书自定义（此处为简化版，实际按飞书文档调整）
  return hash.length > 0  // TODO: 对接飞书实际签名算法
}

// ── 卡片回调处理 ──────────────────────────────────────────────────

interface FeishuCardAction {
  open_id: string
  open_message_id: string
  action: {
    value: {
      action: string      // 'approve_publish' | 'approve_hold' | 'reject'
      entityId: string
      entityType: string
    }
    tag: string
  }
}

async function handleCardAction(payload: FeishuCardAction): Promise<NextResponse> {
  const { action: actionValue } = payload.action
  const { action, entityId, entityType } = actionValue

  if (!action || !entityId || !entityType) {
    return NextResponse.json({ toast: { type: 'error', content: '参数缺失' } })
  }

  // 调用 Editorial Action API
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/editorial/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-editorial-secret': process.env.EDITORIAL_SECRET ?? '',
    },
    body: JSON.stringify({
      entityType,
      entityId,
      action,
      actor: `feishu:${payload.open_id}`,
    }),
  })

  const result = await res.json()

  // 返回飞书 toast 反馈
  const actionLabels: Record<string, string> = {
    approve_publish: '✓ 已收录发布',
    approve_hold:    '✓ 已收录（未发布）',
    reject:          '✗ 已跳过',
  }

  return NextResponse.json({
    toast: {
      type: result.ok ? 'success' : 'error',
      content: result.ok ? (actionLabels[action] ?? '操作完成') : `失败: ${result.message}`,
    },
  })
}

// ── Route Handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN

  // 挑战验证（飞书首次配置时发送）
  const body = await req.text()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // URL 验证（飞书配置回调地址时）
  if (parsed.type === 'url_verification') {
    return NextResponse.json({ challenge: parsed.challenge })
  }

  // 签名验证（生产环境）
  if (verificationToken) {
    const timestamp = req.headers.get('x-lark-request-timestamp') ?? ''
    const nonce = req.headers.get('x-lark-request-nonce') ?? ''
    if (!verifyFeishuSignature(timestamp, nonce, body, verificationToken)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  }

  // 卡片回调
  if (parsed.type === 'card.action.trigger') {
    return handleCardAction(parsed as unknown as FeishuCardAction)
  }

  return NextResponse.json({ ok: true })
}

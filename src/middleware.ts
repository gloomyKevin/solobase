import { NextRequest, NextResponse } from 'next/server'

/**
 * 保护所有管理相关路由：
 *   /admin/*           — 管理后台 UI
 *   /api/admin/*       — 管理后台数据接口
 *   /api/editorial/*   — 编辑操作接口
 *   /api/cron/*        — 定时任务（用 CRON_SECRET 独立校验，这里也拦一层）
 *
 * 认证方式：HTTP Basic Auth
 * 环境变量：ADMIN_PASSWORD（未配置则本地开发放行）
 */

const PROTECTED_PREFIXES = ['/admin', '/api/admin/', '/api/editorial/']

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
}

export function middleware(req: NextRequest) {
  if (!isProtected(req.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return NextResponse.next() // 本地开发无密码直接放行

  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ')
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      const [, password] = decoded.split(':')
      if (password === adminPassword) return NextResponse.next()
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Solobase Admin"' },
  })
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/editorial/:path*'],
}

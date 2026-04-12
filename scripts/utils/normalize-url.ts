/**
 * URL 规范化 — 用于去重 deterministic 匹配
 *
 * 保证以下情况被识别为同一产品：
 *   https://www.Colamd.com/app/  →  colamd.com/app
 *   http://colamd.com            →  colamd.com
 *   https://colamd.com/          →  colamd.com
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    const path = u.pathname.replace(/\/+$/, '').toLowerCase() // 去尾部斜杠
    // 忽略 query string 和 hash（产品 URL 通常不依赖这些）
    return `${host}${path}`
  } catch {
    return raw.toLowerCase().trim()
  }
}

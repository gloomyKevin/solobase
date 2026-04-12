/**
 * AI 模型配置 — one-api 中转
 *
 * 环境变量：
 *   ONE_API_BASE_URL  中转服务地址（e.g. https://api.your-one-api.com）
 *   ONE_API_KEY       API Key
 */

export const AI_CONFIG = {
  baseURL: process.env.ONE_API_BASE_URL ?? 'https://api.anthropic.com',
  apiKey:  process.env.ONE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '',

  models: {
    // Pass 1：批量分类，便宜快
    haiku:  'claude-haiku-4-5-20251001',
    // Pass 2：给人看的摘要，质量优先
    sonnet: 'claude-sonnet-4-6',
  },

  // 并发控制：本地 Mac 跑，不要把 rate limit 打满
  concurrency: {
    pass1: 5,  // 同时处理 5 条
    pass2: 3,
  },

  // 指数退避重试
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
  },
} as const

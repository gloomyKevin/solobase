/**
 * Feed 排序算法 — 纯函数，零依赖，完全解耦
 *
 * 核心思路：加权随机
 *   feed_score = quality × (0.7 + random × 0.6)
 *   质量高的大概率靠前，但不绝对，每次刷新都不一样
 *
 * 多样性：排序后做一轮去连续，避免相邻内容太像
 */

export interface FeedItem {
  id: string
  score: number         // 质量分（density_score.total）
  topic?: string        // 主标签（用于多样性）
  source?: string       // 来源（jike / v2ex / ...）
  kind?: string         // 类型（project / post）
  [key: string]: unknown
}

export interface FeedConfig {
  /** 每页数量 */
  pageSize?: number
  /** 质量权重 vs 随机权重的比例，0-1 之间。1=纯质量排序，0=纯随机 */
  qualityBias?: number
  /** 同 topic 最多连续出现几次 */
  maxConsecutiveTopic?: number
  /** 同 kind 最多连续出现几次 */
  maxConsecutiveKind?: number
}

const defaults: Required<FeedConfig> = {
  pageSize: 12,
  qualityBias: 0.7,
  maxConsecutiveTopic: 2,
  maxConsecutiveKind: 3,
}

/**
 * 生成 feed 排序
 * 纯函数，不修改输入数组
 */
export function rankFeed<T extends FeedItem>(
  items: readonly T[],
  config?: FeedConfig
): T[] {
  const cfg = { ...defaults, ...config }
  if (items.length === 0) return []

  // ── Step 1: 加权随机打分 ──
  // quality × qualityBias + random × (1 - qualityBias)
  // 归一化 quality 到 0-1 范围
  const maxScore = Math.max(...items.map(i => i.score), 1)

  const scored = items.map(item => ({
    item,
    feedScore:
      (item.score / maxScore) * cfg.qualityBias +
      Math.random() * (1 - cfg.qualityBias),
  }))

  scored.sort((a, b) => b.feedScore - a.feedScore)

  const result = scored.map(s => s.item)

  // ── Step 2: 去连续 ──
  dedup(result, 'topic', cfg.maxConsecutiveTopic)
  dedup(result, 'kind', cfg.maxConsecutiveKind)

  return result
}

/**
 * 分页取数据
 */
export function paginateFeed<T extends FeedItem>(
  ranked: readonly T[],
  page: number,
  pageSize?: number
): T[] {
  const size = pageSize ?? defaults.pageSize
  return ranked.slice(page * size, (page + 1) * size)
}

/**
 * 去连续：如果同一个属性值连续超过 max 次，把多余的往后挪
 * 原地修改数组，O(n) 复杂度
 */
function dedup<T extends FeedItem>(
  arr: T[],
  key: keyof FeedItem,
  max: number
): void {
  let streak = 1
  for (let i = 1; i < arr.length; i++) {
    if (arr[i][key] && arr[i][key] === arr[i - 1][key]) {
      streak++
      if (streak > max) {
        // 找下一个不同的，交换过来
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j][key] !== arr[i][key]) {
            [arr[i], arr[j]] = [arr[j], arr[i]]
            streak = 1
            break
          }
        }
      }
    } else {
      streak = 1
    }
  }
}

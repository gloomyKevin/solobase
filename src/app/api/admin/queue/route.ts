/**
 * GET /api/admin/queue?view=pending|published|rejected|archived
 * 返回对应视图的内容列表 + 全局统计
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

function parseJson(val: unknown): string[] | null {
  if (!val) return null
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : null } catch { return null }
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  const editorialRec = r.editorial_rec ?? null
  const confidence = r.confidence != null ? Number(r.confidence) : null
  const trustLevel = r.trust_level as string
  let priorityLevel = 5
  if (trustLevel === 'native_submitted' || trustLevel === 'maker_verified') priorityLevel = 1
  else if (editorialRec === 'include' && (confidence ?? 0) >= 0.85) priorityLevel = 2
  else if (editorialRec === 'include') priorityLevel = 3
  else if (editorialRec === 'review') priorityLevel = 4

  return {
    id: r.id, source: r.source, authorName: r.author_name, body: r.body,
    editorialRec, confidence, recReason: r.rec_reason ?? null,
    editorialSummary: r.editorial_summary ?? null,
    collectionAngle: r.collection_angle ?? null,
    concerns: parseJson(r.concerns),
    likesCount: r.likes_count != null ? Number(r.likes_count) : null,
    inferredProductName: r.inferred_product_name ?? null,
    inferredProductUrl: r.inferred_product_url ?? null,
    inferredProductOneLiner: r.inferred_product_one_liner ?? null,
    inferredProductStage: r.inferred_product_stage ?? null,
    keyMetrics: parseJson(r.key_metrics),
    topics: parseJson(r.topics),
    media: r.media ?? null,
    trustLevel, reviewStatus: r.review_status,
    publishStatus: r.publish_status ?? null,
    reviewedAt: r.reviewed_at ? new Date(Number(r.reviewed_at) * 1000).toISOString() : null,
    priorityLevel,
  }
}

const VIEW_QUERIES: Record<string, string> = {
  pending: `SELECT * FROM content_items
    WHERE review_status = 'pending' AND llm_processed_at IS NOT NULL
    ORDER BY CASE editorial_rec WHEN 'include' THEN 1 WHEN 'review' THEN 2 WHEN 'exclude' THEN 3 ELSE 4 END, confidence DESC
    LIMIT 600`,
  published: `SELECT * FROM content_items
    WHERE publish_status IN ('published', 'featured')
    ORDER BY published_at_editorial DESC
    LIMIT 200`,
  rejected: `SELECT * FROM content_items
    WHERE review_status = 'rejected'
    ORDER BY reviewed_at DESC
    LIMIT 200`,
  archived: `SELECT * FROM content_items
    WHERE review_status = 'archived'
    ORDER BY updated_at DESC
    LIMIT 200`,
}

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get('view') ?? 'pending'

  // 去重视图特殊处理
  if (view === 'dedup') {
    const [pairsResult, ...statsResults] = await Promise.all([
      client.execute(`
        SELECT dc.id as candidate_id, dc.detection_method, dc.suggested_action,
          a.id as a_id, a.source as a_source, a.author_name as a_author, a.body as a_body,
          a.inferred_product_name as a_product, a.inferred_product_url as a_url,
          a.inferred_product_one_liner as a_liner, a.confidence as a_conf, a.editorial_rec as a_rec,
          b.id as b_id, b.name as b_name, b.tagline as b_tagline, b.url as b_url, b.stage as b_stage, b.trust_level as b_trust
        FROM dedup_candidates dc
        JOIN content_items a ON a.id = dc.item_a_id
        JOIN projects b ON b.id = dc.item_b_id
        WHERE dc.status = 'pending'
        ORDER BY dc.created_at DESC
        LIMIT 50
      `),
      client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'pending' AND llm_processed_at IS NOT NULL`),
      client.execute(`SELECT COUNT(*) as n FROM content_items WHERE publish_status IN ('published', 'featured')`),
      client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'rejected'`),
      client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'archived'`),
      client.execute(`SELECT COUNT(*) as n FROM dedup_candidates WHERE status = 'pending'`),
      client.execute(`SELECT editorial_rec, COUNT(*) as n FROM content_items WHERE review_status = 'pending' AND llm_processed_at IS NOT NULL GROUP BY editorial_rec`),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pairs = pairsResult.rows.map((r: any) => ({
      candidateId: r.candidate_id,
      detectionMethod: r.detection_method,
      itemA: { id: r.a_id, source: r.a_source, authorName: r.a_author, body: r.a_body, productName: r.a_product, productUrl: r.a_url, oneLiner: r.a_liner, confidence: r.a_conf != null ? Number(r.a_conf) : null, editorialRec: r.a_rec },
      itemB: { id: r.b_id, name: r.b_name, tagline: r.b_tagline, url: r.b_url, stage: r.b_stage, trustLevel: r.b_trust },
    }))

    const [pending, published, rejected, archived, dedup, tiers] = statsResults
    const tierMap: Record<string, number> = {}
    for (const row of tiers.rows) tierMap[(row.editorial_rec as string) ?? 'noise'] = Number(row.n)

    return NextResponse.json({
      pairs,
      stats: {
        pending: Number(pending.rows[0].n), published: Number(published.rows[0].n),
        rejected: Number(rejected.rows[0].n), archived: Number(archived.rows[0].n),
        dedupPending: Number(dedup.rows[0].n),
        include: tierMap['include'] ?? 0, review: tierMap['review'] ?? 0, exclude: tierMap['exclude'] ?? 0,
      },
    })
  }

  const sql = VIEW_QUERIES[view] ?? VIEW_QUERIES.pending

  const [itemsResult, ...statsResults] = await Promise.all([
    client.execute(sql),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'pending' AND llm_processed_at IS NOT NULL`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE publish_status IN ('published', 'featured')`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'rejected'`),
    client.execute(`SELECT COUNT(*) as n FROM content_items WHERE review_status = 'archived'`),
    client.execute(`SELECT COUNT(*) as n FROM dedup_candidates WHERE status = 'pending'`),
    client.execute(`SELECT editorial_rec, COUNT(*) as n FROM content_items WHERE review_status = 'pending' AND llm_processed_at IS NOT NULL GROUP BY editorial_rec`),
  ])

  const items = itemsResult.rows.map(mapRow)
  if (view === 'pending') items.sort((a, b) => a.priorityLevel - b.priorityLevel)

  const [pending, published, rejected, archived, dedup, tiers] = statsResults
  const tierMap: Record<string, number> = {}
  for (const row of tiers.rows) tierMap[(row.editorial_rec as string) ?? 'noise'] = Number(row.n)

  return NextResponse.json({
    items,
    stats: {
      pending: Number(pending.rows[0].n),
      published: Number(published.rows[0].n),
      rejected: Number(rejected.rows[0].n),
      archived: Number(archived.rows[0].n),
      dedupPending: Number(dedup.rows[0].n),
      include: tierMap['include'] ?? 0,
      review: tierMap['review'] ?? 0,
      exclude: tierMap['exclude'] ?? 0,
    },
  })
}

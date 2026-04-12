import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../../../../db/schema'
import { DedupClient } from './DedupClient'

const client = createClient({
  url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? 'file:./local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

export const dynamic = 'force-dynamic'

export interface DedupPair {
  candidateId: string
  detectionMethod: string
  suggestedAction: string | null
  // content_item (item_a)
  itemA: {
    id: string
    source: string
    authorName: string
    body: string
    inferredProductName: string | null
    inferredProductUrl: string | null
    inferredProductOneLiner: string | null
    confidence: number | null
    editorialRec: string | null
    likesCount: number | null
  }
  // project (item_b)
  itemB: {
    id: string
    name: string
    tagline: string | null
    url: string
    stage: string | null
    trustLevel: string
  }
}

async function getDedupPairs(): Promise<DedupPair[]> {
  const candidates = await db.query.dedupCandidates.findMany({
    where: eq(schema.dedupCandidates.status, 'pending'),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 50,
  })

  const pairs: DedupPair[] = []

  for (const c of candidates) {
    const [itemA, itemB] = await Promise.all([
      db.query.contentItems.findFirst({
        where: eq(schema.contentItems.id, c.itemAId),
        columns: {
          id: true, source: true, authorName: true, body: true,
          inferredProductName: true, inferredProductUrl: true,
          inferredProductOneLiner: true, confidence: true,
          editorialRec: true, likesCount: true,
        },
      }),
      db.query.projects.findFirst({
        where: eq(schema.projects.id, c.itemBId),
        columns: { id: true, name: true, tagline: true, url: true, stage: true, trustLevel: true },
      }),
    ])

    if (!itemA || !itemB) continue

    pairs.push({
      candidateId: c.id,
      detectionMethod: c.detectionMethod,
      suggestedAction: c.suggestedAction ?? null,
      itemA: {
        id: itemA.id,
        source: itemA.source,
        authorName: itemA.authorName,
        body: itemA.body,
        inferredProductName: itemA.inferredProductName ?? null,
        inferredProductUrl: itemA.inferredProductUrl ?? null,
        inferredProductOneLiner: itemA.inferredProductOneLiner ?? null,
        confidence: itemA.confidence ?? null,
        editorialRec: itemA.editorialRec ?? null,
        likesCount: itemA.likesCount ?? null,
      },
      itemB: {
        id: itemB.id,
        name: itemB.name,
        tagline: itemB.tagline ?? null,
        url: itemB.url,
        stage: itemB.stage ?? null,
        trustLevel: itemB.trustLevel,
      },
    })
  }

  return pairs
}

export default async function DedupPage() {
  const pairs = await getDedupPairs()

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</a>
          <span className="font-semibold text-gray-900">去重确认</span>
          <span className="text-sm text-gray-500">待处理 <strong>{pairs.length}</strong> 对</span>
        </div>
        <div className="text-xs text-gray-400 space-x-3">
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">j/k</kbd> 导航
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">m</kbd> 合并
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">d</kbd> 不同产品
        </div>
      </div>
      <DedupClient pairs={pairs} />
    </div>
  )
}

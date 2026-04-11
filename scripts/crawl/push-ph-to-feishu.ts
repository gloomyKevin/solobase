/**
 * 推送 PH 数据到飞书多维表格
 * 使用: npx tsx scripts/crawl/push-ph-to-feishu.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE_TOKEN = 'KXYpb5pTUa5gnPsFe18cNaoVnzh'
const TABLE_ID = 'tblsGENTHRRZmJ5S'
const BATCH_SIZE = 100

function main() {
  const dataPath = path.join(process.cwd(), 'data', 'raw', 'producthunt', '_progress.json')
  const products = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

  // 按 votes 降序
  products.sort((a: any, b: any) => b.votesCount - a.votesCount)
  console.log(`共 ${products.length} 个产品\n`)

  const fields = [
    'Votes', '产品名', 'Tagline', '产品链接', 'PH链接', '缩略图',
    'Topics', 'Makers', '评论数', '评分', '发布日期', 'Description',
  ]

  let pushed = 0
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)

    const rows = batch.map((p: any) => {
      const makers = (p.makers || [])
        .map((m: any) => {
          let s = m.name
          if (m.headline) s += ` — ${m.headline}`
          if (m.twitter) s += ` @${m.twitter}`
          return s
        })
        .join('\n')

      const dateMs = p.createdAt ? new Date(p.createdAt).getTime() : null

      return [
        p.votesCount || 0,
        p.name || '',
        p.tagline || '',
        p.website || '',
        p.phUrl || '',
        p.thumbnailUrl || '',
        (p.topics || []).join(', '),
        makers,
        p.commentsCount || 0,
        p.reviewsRating || 0,
        dateMs,
        (p.description || '').slice(0, 500),
      ]
    })

    const payload = JSON.stringify({ fields, rows })
    fs.writeFileSync('_batch_tmp.json', payload, 'utf-8')

    try {
      const result = execSync(
        `lark-cli base +record-batch-create --base-token "${BASE_TOKEN}" --table-id "${TABLE_ID}" --json @_batch_tmp.json --as user`,
        { encoding: 'utf-8', timeout: 30000 }
      )
      const res = JSON.parse(result)
      if (res.ok) {
        pushed += batch.length
        console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: +${batch.length} (${pushed}/${products.length})`)
      } else {
        console.error(`  batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, res.error?.message)
      }
    } catch (err: any) {
      console.error(`  batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, err.stderr?.slice(0, 200) || err.message?.slice(0, 200))
    }
  }

  if (fs.existsSync('_batch_tmp.json')) fs.unlinkSync('_batch_tmp.json')
  console.log(`\n推送完成: ${pushed}/${products.length}`)
  console.log(`飞书: https://jcns0lts1p2k.feishu.cn/base/${BASE_TOKEN}`)
}

main()

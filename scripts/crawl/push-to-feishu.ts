/**
 * 将过滤后的即刻数据推送到飞书多维表格
 *
 * 使用: npx tsx scripts/crawl/push-to-feishu.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE_TOKEN = 'KXYpb5pTUa5gnPsFe18cNaoVnzh'
const TABLE_ID = 'tbliADTEBjpJx4Pj'
const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'jike')
const BATCH_SIZE = 100 // 飞书 API 单次最多 500，保守用 100

function main() {
  const filteredPath = path.join(RAW_DIR, '_filtered.json')
  const posts = JSON.parse(fs.readFileSync(filteredPath, 'utf-8'))

  // 只推 10+ 分的
  const quality = posts.filter((p: any) => p.score >= 10)
  console.log(`共 ${quality.length} 条待推送 (score >= 10)\n`)

  // 字段顺序与新表「审核表」一致
  const fields = [
    '分数', '作者', '产品链接', '原帖链接', '图片',
    '点赞', '评论数', '发布日期', '内容摘要',
    '热门评论', '作者简介',
  ]

  // 分批推送
  let pushed = 0
  for (let i = 0; i < quality.length; i += BATCH_SIZE) {
    const batch = quality.slice(i, i + BATCH_SIZE)

    const rows = batch.map((p: any) => {
      const topComment = p.topComments?.length
        ? p.topComments
            .map((c: any) => `${c.author}: ${c.content} (${c.likeCount} likes)`)
            .join('\n---\n')
        : ''

      const dateMs = p.createdAt ? new Date(p.createdAt).getTime() : null

      return [
        p.score,
        p.author || '',
        p.links?.[0] || '',
        p.url || '',
        p.pictures?.[0] || '',
        p.likeCount || 0,
        p.commentCount || 0,
        dateMs,
        p.content || '',
        topComment,
        p.authorBio || '',
      ]
    })

    const payload = JSON.stringify({ fields, rows })

    // 写到 cwd 相对路径的临时文件（lark-cli 要求相对路径）
    const tmpFile = '_batch_tmp.json'
    fs.writeFileSync(tmpFile, payload, 'utf-8')

    try {
      const result = execSync(
        `lark-cli base +record-batch-create --base-token "${BASE_TOKEN}" --table-id "${TABLE_ID}" --json @${tmpFile} --as user`,
        { encoding: 'utf-8', timeout: 30000 }
      )
      const res = JSON.parse(result)
      if (res.ok) {
        pushed += batch.length
        console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: +${batch.length} (${pushed}/${quality.length})`)
      } else {
        console.error(`  batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, res.error?.message || result)
      }
    } catch (err: any) {
      console.error(`  batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, err.message?.slice(0, 200))
      // 尝试打印 stderr
      if (err.stderr) console.error('  stderr:', err.stderr.slice(0, 300))
    }
  }

  // 清理临时文件
  if (fs.existsSync('_batch_tmp.json')) fs.unlinkSync('_batch_tmp.json')

  console.log(`\n推送完成: ${pushed}/${quality.length}`)
  console.log(`\n飞书多维表格: https://jcns0lts1p2k.feishu.cn/base/${BASE_TOKEN}`)
}

main()

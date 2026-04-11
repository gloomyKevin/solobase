/**
 * 导出过滤后的即刻数据为 CSV，用于导入飞书多维表格协作审核
 *
 * 使用: npx tsx scripts/crawl/export-csv.ts
 * 输出: data/raw/jike/review.csv
 */

import fs from 'node:fs'
import path from 'node:path'

const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'jike')

function escapeCsv(str: string): string {
  if (!str) return ''
  // 如果包含逗号、引号、换行，需要用引号包裹并转义内部引号
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function main() {
  const filteredPath = path.join(RAW_DIR, '_filtered.json')
  if (!fs.existsSync(filteredPath)) {
    console.error('未找到 _filtered.json，先运行 filter-jike.ts')
    process.exit(1)
  }

  const posts = JSON.parse(fs.readFileSync(filteredPath, 'utf-8'))

  // 只导出 10+ 分的
  const quality = posts.filter((p: any) => p.score >= 10)

  const headers = [
    '分数',
    '作者',
    '作者简介',
    '内容摘要',
    '产品链接',
    '原帖链接',
    '图片',
    '点赞',
    '评论数',
    '发布日期',
    '热门评论',
    '审核状态',
    '备注',
  ]

  const rows = quality.map((p: any) => {
    const topComment = p.topComments?.[0]
      ? `${p.topComments[0].author}: ${p.topComments[0].content} (${p.topComments[0].likeCount} likes)`
      : ''

    return [
      p.score,
      p.author,
      p.authorBio || '',
      p.content,
      p.links?.[0] || '',
      p.url,
      p.pictures?.[0] || '',
      p.likeCount,
      p.commentCount,
      p.createdAt?.slice(0, 10) || '',
      topComment,
      '', // 审核状态 — 留空
      '', // 备注 — 留空
    ].map(v => escapeCsv(String(v)))
  })

  // BOM + UTF-8 确保飞书/Excel 正确识别中文
  const bom = '\uFEFF'
  const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

  const outPath = path.join(RAW_DIR, 'review.csv')
  fs.writeFileSync(outPath, csv, 'utf-8')

  console.log(`已导出 ${quality.length} 条 (score >= 10)`)
  console.log(`→ ${path.relative(process.cwd(), outPath)}`)
  console.log('\n导入飞书多维表格:')
  console.log('  1. 打开飞书 → 新建多维表格')
  console.log('  2. 导入 → 选择 CSV → 上传 review.csv')
  console.log('  3. 「审核状态」列改成单选字段: 通过 / 跳过 / 待定')
}

main()

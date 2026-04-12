'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DedupPair } from './page'

const SOURCE_LABEL: Record<string, string> = {
  jike: '即刻', linuxdo: 'Linux.do', v2ex: 'V2EX', producthunt: 'PH',
}

export function DedupClient({ pairs: initialPairs }: { pairs: DedupPair[] }) {
  const [pairs, setPairs] = useState(initialPairs)
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const current = pairs[cursor]

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2000)
  }

  const applyAction = useCallback(async (action: 'merge' | 'dismiss') => {
    if (!current || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/editorial/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: current.candidateId, action }),
      })
      const data = await res.json()
      if (data.ok) {
        setPairs(p => p.filter(x => x.candidateId !== current.candidateId))
        showToast(action === 'merge' ? '✓ 已合并' : '✓ 已忽略', true)
      } else {
        showToast('操作失败', false)
      }
    } catch {
      showToast('请求失败', false)
    } finally {
      setLoading(false)
    }
  }, [current, loading])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault()
          setCursor(c => Math.min(c + 1, pairs.length - 1))
          break
        case 'k': case 'ArrowUp':
          e.preventDefault()
          setCursor(c => Math.max(c - 1, 0))
          break
        case 'm':
          e.preventDefault()
          applyAction('merge')
          break
        case 'd':
          e.preventDefault()
          applyAction('dismiss')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pairs, applyAction])

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-3">
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {pairs.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">✓</div>
          <div className="text-lg">去重队列已清空</div>
          <a href="/admin" className="text-sm text-blue-500 mt-2 block">← 返回 Admin</a>
        </div>
      )}

      {pairs.map((pair, idx) => {
        const isCurrent = idx === cursor
        return (
          <div
            key={pair.candidateId}
            onClick={() => setCursor(idx)}
            className={`bg-white rounded-xl border border-gray-100 p-4 cursor-pointer transition-all
              ${isCurrent ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow-sm'}`}
          >
            {/* 标题行 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                URL 匹配
              </span>
              {pair.suggestedAction === 'merge' && (
                <span className="text-xs text-gray-400">建议合并</span>
              )}
            </div>

            {/* 两列对比 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 左：content_item（帖子） */}
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-blue-500 font-medium mb-1">
                  📝 爬取帖子 · {SOURCE_LABEL[pair.itemA.source] ?? pair.itemA.source}
                </div>
                <div className="font-semibold text-gray-900 text-sm">
                  {pair.itemA.inferredProductName ?? '未识别产品名'}
                </div>
                {pair.itemA.inferredProductOneLiner && (
                  <div className="text-xs text-gray-500 mt-0.5">{pair.itemA.inferredProductOneLiner}</div>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  @{pair.itemA.authorName}
                  {pair.itemA.confidence != null && (
                    <span className="ml-2 font-medium text-green-600">
                      {Math.round(pair.itemA.confidence * 100)}% {pair.itemA.editorialRec}
                    </span>
                  )}
                </div>
                {pair.itemA.inferredProductUrl && (
                  <a
                    href={pair.itemA.inferredProductUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blue-400 hover:underline block mt-1 truncate"
                  >
                    {pair.itemA.inferredProductUrl}
                  </a>
                )}
                {isCurrent && (
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed border-t border-blue-100 pt-2">
                    {pair.itemA.body.slice(0, 200)}…
                  </p>
                )}
              </div>

              {/* 右：project */}
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-green-600 font-medium mb-1">
                  📦 已有产品 · {pair.itemB.trustLevel}
                </div>
                <div className="font-semibold text-gray-900 text-sm">{pair.itemB.name}</div>
                {pair.itemB.tagline && (
                  <div className="text-xs text-gray-500 mt-0.5">{pair.itemB.tagline}</div>
                )}
                {pair.itemB.stage && (
                  <div className="text-xs text-gray-400 mt-1">{pair.itemB.stage}</div>
                )}
                <a
                  href={pair.itemB.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-green-500 hover:underline block mt-1 truncate"
                >
                  {pair.itemB.url}
                </a>
              </div>
            </div>

            {/* 操作按钮（仅当前选中项展示） */}
            {isCurrent && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={e => { e.stopPropagation(); applyAction('merge') }}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  [m] 同一产品，合并
                </button>
                <button
                  onClick={e => { e.stopPropagation(); applyAction('dismiss') }}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  [d] 不同产品，忽略
                </button>
                <span className="ml-auto text-xs text-gray-300">{idx + 1} / {pairs.length}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

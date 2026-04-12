'use client'

import { useState, useEffect, useCallback } from 'react'
import type { QueueItem } from './page'

const SOURCE_LABEL: Record<string, string> = {
  jike: '即刻', linuxdo: 'Linux.do', v2ex: 'V2EX', producthunt: 'PH', native: '直投',
}

const STAGE_LABEL: Record<string, string> = {
  idea: '💡 想法', building: '🔨 开发中', launched: '🚀 已上线',
  revenue: '💰 有收入', paused: '⏸ 暂停', shutdown: '🔴 关闭',
}

const PRIORITY_STYLE: Record<number, { border: string; badge: string; label: string }> = {
  1: { border: 'border-l-purple-400', badge: 'bg-purple-100 text-purple-700', label: '⭐ 原生提交' },
  2: { border: 'border-l-green-500', badge: 'bg-green-100 text-green-700', label: '🟢 强推' },
  3: { border: 'border-l-green-300', badge: 'bg-green-50 text-green-600', label: '🟡 建议' },
  4: { border: 'border-l-blue-300', badge: 'bg-blue-50 text-blue-600', label: '🔵 待判断' },
  5: { border: 'border-l-gray-200', badge: 'bg-gray-100 text-gray-500', label: '⬜ 排除候选' },
}

type ActionType = 'approve_publish' | 'approve_hold' | 'reject'

interface Stats {
  pending: number
  published: number
  archived: number
  dedupPending: number
}

export function AdminClient({ queue: initialQueue, stats }: { queue: QueueItem[]; stats: Stats }) {
  const [queue, setQueue] = useState(initialQueue)
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const current = queue[cursor]

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  const applyAction = useCallback(async (action: ActionType, notes?: string) => {
    if (!current || loading) return
    setLoading(current.id)

    try {
      const res = await fetch('/api/editorial/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'content_item',
          entityId: current.id,
          action,
          actor: 'editor',
          notes,
        }),
      })
      const data = await res.json()

      if (data.ok) {
        // 移除已处理项，保持 cursor
        setQueue(q => q.filter(item => item.id !== current.id))
        const actionLabel = { approve_publish: '✓ 已发布', approve_hold: '✓ 已存草稿', reject: '✗ 已跳过' }
        showToast(actionLabel[action], true)
      } else {
        showToast(`失败: ${data.message}`, false)
      }
    } catch {
      showToast('请求失败，请重试', false)
    } finally {
      setLoading(null)
      setNote('')
      setNoteMode(false)
    }
  }, [current, loading])

  // 键盘快捷键
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (noteMode) {
        if (e.key === 'Escape') setNoteMode(false)
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault()
          setCursor(c => Math.min(c + 1, queue.length - 1))
          break
        case 'k': case 'ArrowUp':
          e.preventDefault()
          setCursor(c => Math.max(c - 1, 0))
          break
        case 'y':
          e.preventDefault()
          applyAction('approve_publish')
          break
        case 'u':
          e.preventDefault()
          applyAction('approve_hold')
          break
        case 'n':
          e.preventDefault()
          applyAction('reject')
          break
        case 'e':
          e.preventDefault()
          setNoteMode(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [queue, cursor, noteMode, applyAction])

  return (
    <div className="min-h-screen bg-[#f5f4f0] font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-gray-900">Solobase Admin</span>
          <span className="text-sm text-gray-500">
            待审 <strong>{stats.pending}</strong> ·
            已发布 <strong>{stats.published}</strong> ·
            噪声归档 <strong>{stats.archived}</strong>
            {stats.dedupPending > 0 && (
              <span className="ml-2 text-amber-600">去重待确认 {stats.dedupPending} 对</span>
            )}
          </span>
        </div>
        <div className="text-xs text-gray-400 space-x-3">
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">j/k</kbd> 导航
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">y</kbd> 发布
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">u</kbd> 草稿
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">n</kbd> 跳过
          <kbd className="bg-gray-100 px-1.5 py-0.5 rounded">e</kbd> 备注
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto py-6 px-4 space-y-3">
        {queue.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-3">✓</div>
            <div className="text-lg">队列已清空</div>
            <div className="text-sm mt-1">所有内容已处理完毕</div>
          </div>
        )}

        {queue.map((item, idx) => {
          const isCurrent = idx === cursor
          const style = PRIORITY_STYLE[item.priorityLevel] ?? PRIORITY_STYLE[5]

          return (
            <div
              key={item.id}
              onClick={() => setCursor(idx)}
              className={`bg-white rounded-xl border-l-4 ${style.border} border border-gray-100
                p-4 cursor-pointer transition-all
                ${isCurrent ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow-sm'}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
                    {style.label}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  {item.confidence != null && (
                    <span className={`text-xs font-bold ${
                      item.confidence >= 0.9 ? 'text-green-600' :
                      item.confidence >= 0.7 ? 'text-yellow-600' : 'text-gray-400'
                    }`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                  {item.inferredProductStage && (
                    <span className="text-xs text-gray-400">
                      {STAGE_LABEL[item.inferredProductStage] ?? item.inferredProductStage}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap">
                  @{item.authorName} · 👍{item.likesCount ?? 0}
                </div>
              </div>

              {/* Product */}
              {item.inferredProductName && (
                <div className="mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-900">{item.inferredProductName}</span>
                    {item.inferredProductUrl && (
                      <a
                        href={item.inferredProductUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        {new URL(item.inferredProductUrl).hostname.replace('www.', '')} ↗
                      </a>
                    )}
                  </div>
                  {item.inferredProductOneLiner && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.inferredProductOneLiner}</p>
                  )}
                </div>
              )}

              {/* Summary / Reason */}
              {item.editorialSummary ? (
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
                  {item.editorialSummary}
                </p>
              ) : item.recReason ? (
                <p className="text-sm text-gray-500 italic mb-2">{item.recReason.slice(0, 120)}</p>
              ) : null}

              {/* Body preview */}
              {isCurrent && (
                <p className="text-sm text-gray-600 leading-relaxed mb-3 whitespace-pre-line border-t border-gray-100 pt-3 mt-1">
                  {item.body.slice(0, 600)}{item.body.length > 600 ? '…' : ''}
                </p>
              )}

              {/* Metrics + Topics */}
              {((item.keyMetrics?.length ?? 0) > 0 || (item.topics?.length ?? 0) > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {item.keyMetrics?.slice(0, 3).map((m, i) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">📊 {m}</span>
                  ))}
                  {item.topics?.slice(0, 4).map((t, i) => (
                    <span key={i} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">#{t}</span>
                  ))}
                </div>
              )}

              {/* Concerns */}
              {item.concerns && item.concerns.length > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
                  ⚠️ {item.concerns.join(' · ')}
                </p>
              )}

              {/* Action buttons (only when focused) */}
              {isCurrent && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={e => { e.stopPropagation(); applyAction('approve_publish') }}
                    disabled={!!loading}
                    className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    [y] 收录发布
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); applyAction('approve_hold') }}
                    disabled={!!loading}
                    className="px-3 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                  >
                    [u] 收录草稿
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); applyAction('reject') }}
                    disabled={!!loading}
                    className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-red-500 disabled:opacity-50"
                  >
                    [n] 跳过
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setNoteMode(true) }}
                    className="ml-auto px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600"
                  >
                    [e] 备注
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Note modal */}
      {noteMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold mb-3">编辑备注</h3>
            <textarea
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="备注内容（可选）…"
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => applyAction('approve_publish', note)}
                className="flex-1 py-2 bg-green-600 text-white text-sm rounded-lg font-medium"
              >
                收录发布
              </button>
              <button
                onClick={() => applyAction('approve_hold', note)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg"
              >
                收录草稿
              </button>
              <button
                onClick={() => applyAction('reject', note)}
                className="flex-1 py-2 text-gray-400 text-sm"
              >
                跳过
              </button>
            </div>
            <button onClick={() => setNoteMode(false)} className="mt-2 w-full text-sm text-gray-400 hover:text-gray-600">
              取消 (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

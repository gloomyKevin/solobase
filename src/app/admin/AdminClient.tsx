'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

// ── 类型 ──────────────────────────────────────────────────────────

interface Item {
  id: string; source: string; authorName: string; body: string
  editorialRec: string | null; confidence: number | null
  recReason: string | null; editorialSummary: string | null
  concerns: string[] | null; likesCount: number | null
  inferredProductName: string | null; inferredProductUrl: string | null
  inferredProductOneLiner: string | null; inferredProductStage: string | null
  keyMetrics: string[] | null; topics: string[] | null
  trustLevel: string; reviewStatus: string; publishStatus: string | null
  reviewedAt: string | null; priorityLevel: number
}

interface Stats {
  pending: number; published: number; rejected: number; archived: number
  dedupPending: number; include: number; review: number; exclude: number
}

type View = 'pending' | 'published' | 'rejected' | 'archived' | 'dedup'

interface DedupPair {
  candidateId: string; detectionMethod: string
  itemA: { id: string; source: string; authorName: string; body: string; productName: string | null; productUrl: string | null; oneLiner: string | null; confidence: number | null; editorialRec: string | null }
  itemB: { id: string; name: string; tagline: string | null; url: string; stage: string | null; trustLevel: string }
}
type SubTab = 'include' | 'review' | 'exclude' | 'all'
type ActionType = 'approve_publish' | 'approve_hold' | 'reject' | 'unpublish' | 'archive'

const SRC: Record<string, string> = { jike: '即刻', linuxdo: 'Linux.do', v2ex: 'V2EX', producthunt: 'PH' }
const SRC_CLR: Record<string, string> = {
  jike: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  linuxdo: 'bg-sky-50 text-sky-700 border-sky-200',
  v2ex: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

// ── 组件 ──────────────────────────────────────────────────────────

export function AdminClient() {
  const [items, setItems] = useState<Item[]>([])
  const [dedupPairs, setDedupPairs] = useState<DedupPair[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [view, setView] = useState<View>('pending')
  const [subTab, setSubTab] = useState<SubTab>('include')
  const [srcFilter, setSrcFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // ── 数据加载 ──────────────────────────────────────────────────
  const fetchView = useCallback(async (v: View) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/queue?view=${v}`)
      const data = await res.json()
      if (v === 'dedup') {
        setDedupPairs(data.pairs ?? [])
        setItems([])
      } else {
        setItems(data.items ?? [])
        setDedupPairs([])
      }
      setStats(data.stats)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchView(view) }, [view, fetchView])

  // 切换 view 时重置子状态
  const switchView = (v: View) => {
    setView(v); setCursor(0); setExpandedId(null); setSrcFilter('all')
    if (v !== 'pending') setSubTab('all')
  }

  // ── 子过滤（仅 pending 视图） ────────────────────────────────
  const filtered = useMemo(() => {
    let list = items
    if (view === 'pending' && subTab !== 'all') {
      list = list.filter(i => subTab === 'include'
        ? (i.editorialRec === 'include' || i.trustLevel === 'native_submitted')
        : i.editorialRec === subTab)
    }
    if (srcFilter !== 'all') list = list.filter(i => i.source === srcFilter)
    return list
  }, [items, view, subTab, srcFilter])

  const current = filtered[cursor]
  useEffect(() => { setCursor(0); setExpandedId(null) }, [subTab, srcFilter])
  useEffect(() => { cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [cursor])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 2500)
  }

  // ── 操作 ──────────────────────────────────────────────────────
  const applyAction = useCallback(async (action: ActionType, override?: { skipProject?: boolean; forceProject?: boolean }) => {
    if (!current || acting) return
    setActing(current.id)
    try {
      const res = await fetch('/api/editorial/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'content_item', entityId: current.id, action, actor: 'editor', ...override }),
      })
      const data = await res.json()
      if (data.ok) {
        setItems(q => q.filter(i => i.id !== current.id))
        setExpandedId(null)
        const labels: Record<string, string> = {
          approve_publish: '已收录并发布', approve_hold: '已收藏到草稿',
          reject: '已跳过', unpublish: '已下架', archive: '已归档',
        }
        showToast(labels[action] ?? '操作成功', true)
        fetchView(view) // 刷新统计
      } else { showToast(`失败: ${data.message}`, false) }
    } catch { showToast('请求失败', false) }
    finally { setActing(null) }
  }, [current, acting, view, fetchView])

  // ── 去重操作 ──────────────────────────────────────────────────
  const applyDedup = useCallback(async (candidateId: string, action: 'merge' | 'dismiss') => {
    setActing(candidateId)
    try {
      const res = await fetch('/api/editorial/dedup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, action }),
      })
      const data = await res.json()
      if (data.ok) {
        setDedupPairs(p => p.filter(x => x.candidateId !== candidateId))
        showToast(action === 'merge' ? '已合并' : '已忽略', true)
        fetchView('dedup')
      } else { showToast('操作失败', false) }
    } catch { showToast('请求失败', false) }
    finally { setActing(null) }
  }, [fetchView])

  // ── 键盘 ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'j': case 'ArrowDown': e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); break
        case 'k': case 'ArrowUp': e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); break
        case 'Enter': case ' ':
          e.preventDefault(); if (current) setExpandedId(id => id === current.id ? null : current.id); break
        case 'y': if (view === 'pending') { e.preventDefault(); applyAction('approve_publish') } break
        case 'n': if (view === 'pending') { e.preventDefault(); applyAction('reject') } break
        case 'm': if (view === 'dedup' && dedupPairs[cursor]) { e.preventDefault(); applyDedup(dedupPairs[cursor].candidateId, 'merge') } break
        case 'd': if (view === 'dedup' && dedupPairs[cursor]) { e.preventDefault(); applyDedup(dedupPairs[cursor].candidateId, 'dismiss') } break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cursor, current, view, applyAction, applyDedup, dedupPairs])

  // ── 来源计数 ──────────────────────────────────────────────────
  const srcCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of filtered) c[i.source] = (c[i.source] ?? 0) + 1
    return c
  }, [filtered])

  if (loading && !stats) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400 text-sm">加载中…</div></div>
  }
  const s = stats!

  // ── VIEW 配置 ─────────────────────────────────────────────────
  const views: { key: View; label: string; count: number; color: string; activeColor: string }[] = [
    { key: 'pending', label: '待审核', count: s.pending, color: 'text-gray-900', activeColor: 'border-blue-500 bg-blue-50' },
    { key: 'published', label: '已发布', count: s.published, color: 'text-green-600', activeColor: 'border-green-500 bg-green-50' },
    { key: 'rejected', label: '已跳过', count: s.rejected, color: 'text-gray-500', activeColor: 'border-gray-400 bg-gray-50' },
    { key: 'archived', label: '噪声归档', count: s.archived, color: 'text-gray-400', activeColor: 'border-gray-300 bg-gray-50' },
    { key: 'dedup', label: '去重确认', count: s.dedupPending, color: s.dedupPending > 0 ? 'text-amber-600' : 'text-gray-400', activeColor: 'border-amber-400 bg-amber-50' },
  ]

  const viewHint: Record<View, string> = {
    pending: '', published: '这些内容正在首页 feed 中展示', rejected: '编辑审核后跳过的内容', archived: 'AI 自动判定的低质量/非相关内容',
    dedup: '同一产品被不同来源提到。「合并」将帖子归档到已有产品下，「不同产品」表示两者无关。',
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {toast && <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${toast.ok ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}>{toast.msg}</div>}

      {/* 顶部 */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="font-bold text-lg tracking-tight">Solobase</span>
            <span className="text-sm text-gray-400">内容管理</span>
          </div>
          <div className="text-xs text-gray-400">
            <kbd className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">j</kbd><kbd className="bg-gray-100 px-1 py-0.5 rounded text-[10px] ml-0.5">k</kbd> 上下
            {view === 'pending' && <> · <kbd className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">y</kbd> 发布 · <kbd className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">n</kbd> 跳过</>}
            {view === 'dedup' && <> · <kbd className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">m</kbd> 合并 · <kbd className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">d</kbd> 不同</>}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* ── 主导航：统计卡片 ─────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {views.map(v => (
            <button
              key={v.key}
              onClick={() => switchView(v.key)}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                view === v.key ? v.activeColor : 'bg-white border-transparent hover:border-gray-200'
              }`}
            >
              <div className="text-xs text-gray-400 mb-1">{v.label}</div>
              <div className={`text-xl font-semibold ${view === v.key ? v.color : 'text-gray-300'}`}>{v.count}</div>
            </button>
          ))}
        </div>

        {/* 视图说明 */}
        {viewHint[view] && (
          <div className="mb-4 px-4 py-2 bg-gray-100 rounded-lg text-sm text-gray-500">{viewHint[view]}</div>
        )}

        {/* ── 子筛选（仅 pending） ──────────────────────────────── */}
        {view === 'pending' && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
              {([
                { key: 'include' as SubTab, label: '值得收录', count: s.include, dot: 'bg-green-400' },
                { key: 'review' as SubTab, label: '需要判断', count: s.review, dot: 'bg-amber-400' },
                { key: 'exclude' as SubTab, label: '低质量', count: s.exclude, dot: 'bg-gray-300' },
                { key: 'all' as SubTab, label: '全部', count: s.pending, dot: '' },
              ]).map(t => (
                <button key={t.key} onClick={() => setSubTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${subTab === t.key ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
                  {t.dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
                  {t.label}
                  <span className={`text-[11px] ${subTab === t.key ? 'text-gray-300' : 'text-gray-400'}`}>{t.count}</span>
                </button>
              ))}
            </div>
            {Object.keys(srcCounts).length > 1 && (
              <div className="flex gap-1">
                <button onClick={() => setSrcFilter('all')} className={`px-2.5 py-1 text-xs rounded-md ${srcFilter === 'all' ? 'bg-gray-200 font-medium' : 'text-gray-400'}`}>全部</button>
                {Object.entries(srcCounts).map(([src, n]) => (
                  <button key={src} onClick={() => setSrcFilter(src)} className={`px-2.5 py-1 text-xs rounded-md ${srcFilter === src ? 'bg-gray-200 font-medium' : 'text-gray-400'}`}>
                    {SRC[src] ?? src} {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 加载中 ────────────────────────────────────────────── */}
        {loading && <div className="text-center py-10 text-gray-400 text-sm">加载中…</div>}

        {/* ── 空状态 ────────────────────────────────────────────── */}
        {!loading && view !== 'dedup' && filtered.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="text-4xl mb-3">{view === 'pending' ? '🎉' : view === 'published' ? '📭' : '✓'}</div>
            <div className="text-lg text-gray-500">
              {view === 'pending' ? (subTab !== 'all' ? '当前分类已审完' : '审核队列已清空') :
               view === 'published' ? '还没有已发布的内容' :
               view === 'rejected' ? '没有跳过的内容' : '没有归档内容'}
            </div>
          </div>
        )}

        {/* ── 去重视图 ──────────────────────────────────────────── */}
        {!loading && view === 'dedup' && (
          <div className="space-y-2">
            {dedupPairs.length === 0 && (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                <div className="text-4xl mb-3">✓</div>
                <div className="text-lg text-gray-500">去重队列已清空</div>
              </div>
            )}
            {dedupPairs.map((pair, idx) => {
              const isCur = idx === cursor
              return (
                <div key={pair.candidateId} ref={isCur ? cardRef : undefined}
                  onClick={() => setCursor(idx)}
                  className={`bg-white rounded-xl border cursor-pointer transition-all ${isCur ? 'border-amber-300 shadow-sm ring-1 ring-amber-200' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">URL 匹配</span>
                      <span className="text-xs text-gray-400">建议合并</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* 左：爬取帖子 */}
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-xs text-blue-500 font-medium mb-1">📝 爬取帖子 · {SRC[pair.itemA.source] ?? pair.itemA.source}</div>
                        <div className="font-semibold text-gray-900 text-sm">{pair.itemA.productName ?? '未识别'}</div>
                        {pair.itemA.oneLiner && <div className="text-xs text-gray-500 mt-0.5">{pair.itemA.oneLiner}</div>}
                        <div className="text-xs text-gray-400 mt-1">@{pair.itemA.authorName}
                          {pair.itemA.confidence != null && <span className="ml-2 font-medium text-green-600">{Math.round(pair.itemA.confidence * 100)}%</span>}
                        </div>
                        {pair.itemA.productUrl && <a href={pair.itemA.productUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-400 hover:underline block mt-1 truncate">{pair.itemA.productUrl}</a>}
                        {isCur && <p className="text-xs text-gray-500 mt-2 leading-relaxed border-t border-blue-100 pt-2">{pair.itemA.body.slice(0, 200)}…</p>}
                      </div>
                      {/* 右：已有产品 */}
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-xs text-green-600 font-medium mb-1">📦 已有产品</div>
                        <div className="font-semibold text-gray-900 text-sm">{pair.itemB.name}</div>
                        {pair.itemB.tagline && <div className="text-xs text-gray-500 mt-0.5">{pair.itemB.tagline}</div>}
                        <a href={pair.itemB.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-green-500 hover:underline block mt-1 truncate">{pair.itemB.url}</a>
                      </div>
                    </div>
                  </div>
                  {isCur && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); applyDedup(pair.candidateId, 'merge') }} disabled={!!acting}
                        className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50 transition-all">
                        {acting === pair.candidateId ? '处理中…' : '同一产品，合并'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); applyDedup(pair.candidateId, 'dismiss') }} disabled={!!acting}
                        className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all">
                        不同产品
                      </button>
                      <span className="ml-auto text-[11px] text-gray-300 tabular-nums">{idx + 1}/{dedupPairs.length}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── 内容列表 ──────────────────────────────────────────── */}
        {!loading && view !== 'dedup' && (
          <div className="space-y-2">
            {filtered.map((item, idx) => {
              const isCur = idx === cursor
              const isExp = expandedId === item.id
              return (
                <div key={item.id} ref={isCur ? cardRef : undefined}
                  onClick={() => { setCursor(idx); if (idx === cursor) setExpandedId(id => id === item.id ? null : item.id) }}
                  className={`bg-white rounded-xl border cursor-pointer transition-all ${isCur ? 'border-blue-300 shadow-sm ring-1 ring-blue-200' : 'border-gray-100 hover:border-gray-200'}`}>

                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900">{item.inferredProductName ?? '未识别产品'}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${SRC_CLR[item.source] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                            {SRC[item.source] ?? item.source}
                          </span>
                          {/* 已发布/已跳过标记 */}
                          {view === 'published' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">已发布</span>}
                          {view === 'rejected' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">已跳过</span>}
                        </div>
                        {item.inferredProductOneLiner && <p className="text-sm text-gray-600 mb-1">{item.inferredProductOneLiner}</p>}
                        {item.editorialSummary ? <p className="text-sm text-gray-500">{item.editorialSummary}</p>
                          : item.recReason ? <p className="text-xs text-gray-400">{item.recReason.slice(0, 140)}</p> : null}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {item.confidence != null && (
                          <span className={`text-xs font-bold tabular-nums ${item.confidence >= 0.9 ? 'text-green-500' : item.confidence >= 0.7 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {Math.round(item.confidence * 100)}%
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">@{item.authorName}</span>
                      </div>
                    </div>

                    {item.inferredProductUrl && isCur && (
                      <a href={item.inferredProductUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-block text-xs text-blue-500 hover:underline mt-2">
                        {item.inferredProductUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)} ↗
                      </a>
                    )}
                  </div>

                  {isExp && (
                    <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{item.body.slice(0, 800)}{item.body.length > 800 ? '…' : ''}</p>
                    </div>
                  )}

                  {/* ── 操作栏 ── */}
                  {isCur && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
                      {/* pending 视图：审核操作 */}
                      {view === 'pending' && (<>
                        <button onClick={e => { e.stopPropagation(); applyAction('approve_publish') }} disabled={!!acting}
                          className="px-5 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 active:scale-[0.97] disabled:opacity-50 transition-all">
                          {acting === item.id ? '处理中…' : '收录并发布'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); applyAction('approve_hold') }} disabled={!!acting}
                          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all">
                          先收藏
                        </button>
                        <button onClick={e => { e.stopPropagation(); applyAction('reject') }} disabled={!!acting}
                          className="px-3 py-2 text-sm text-gray-400 hover:text-red-500 disabled:opacity-50 transition-all">
                          不收录
                        </button>
                        {/* AI 分类覆盖 */}
                        {item.inferredProductName ? (
                          <button onClick={e => { e.stopPropagation(); applyAction('approve_publish', { skipProject: true }) }} disabled={!!acting}
                            className="px-2 py-1 text-[11px] text-gray-400 hover:text-amber-600 disabled:opacity-50 border border-transparent hover:border-amber-200 rounded transition-all">
                            仅帖子
                          </button>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); applyAction('approve_publish', { forceProject: true }) }} disabled={!!acting}
                            className="px-2 py-1 text-[11px] text-gray-400 hover:text-blue-600 disabled:opacity-50 border border-transparent hover:border-blue-200 rounded transition-all">
                            标记为产品
                          </button>
                        )}
                      </>)}

                      {/* published 视图：下架 */}
                      {view === 'published' && (
                        <button onClick={e => { e.stopPropagation(); applyAction('unpublish') }} disabled={!!acting}
                          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all">
                          下架
                        </button>
                      )}

                      {/* rejected 视图：重新审核 */}
                      {view === 'rejected' && (<>
                        <button onClick={e => { e.stopPropagation(); applyAction('approve_publish') }} disabled={!!acting}
                          className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all">
                          重新收录并发布
                        </button>
                        <button onClick={e => { e.stopPropagation(); applyAction('archive') }} disabled={!!acting}
                          className="px-3 py-2 text-sm text-gray-400 hover:text-red-500 disabled:opacity-50 transition-all">
                          归档
                        </button>
                      </>)}

                      {/* archived 视图：恢复 */}
                      {view === 'archived' && (
                        <button onClick={e => { e.stopPropagation(); applyAction('approve_publish') }} disabled={!!acting}
                          className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all">
                          恢复并发布
                        </button>
                      )}

                      <div className="ml-auto flex items-center gap-3">
                        <button onClick={e => { e.stopPropagation(); setExpandedId(id => id === item.id ? null : item.id) }} className="text-xs text-blue-500 hover:text-blue-700">
                          {isExp ? '收起 ↑' : '查看原文 ↓'}
                        </button>
                        <span className="text-[11px] text-gray-300 tabular-nums">{idx + 1}/{filtered.length}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

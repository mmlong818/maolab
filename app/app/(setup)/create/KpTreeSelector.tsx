'use client'

import { useEffect, useMemo, useState } from 'react'

export type KpMark = 'new' | 'review' | 'preview'

export interface KpSelection {
  kpId: string
  mark: KpMark
}

interface KpNode {
  kpId: string
  canonicalName: string
  subject: string
}

interface LeafNode {
  leafId: string
  leafTitle: string
  kps: KpNode[]
}

interface ChapterNode {
  chapterId: string
  chapterTitle: string
  leaves: LeafNode[]
}

export interface KpTreeResponse {
  treeId: string
  treeName: string
  chapters: ChapterNode[]
}

const MARK_LABEL: Record<KpMark, string> = {
  new: '新讲',
  review: '复习',
  preview: '预习',
}

const MARK_COLOR: Record<KpMark, { bg: string; fg: string; border: string }> = {
  new: { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  review: { bg: '#ede9fe', fg: '#6d28d9', border: '#c4b5fd' },
  preview: { bg: '#ffedd5', fg: '#c2410c', border: '#fdba74' },
}

// TODO(agent-A2): /api/v2/textbook-kps/{treeId} 接口完成后移除此 fixture
const FIXTURE_KPS: KpTreeResponse = {
  treeId: 'fixture',
  treeName: '示例教材（占位 fixture）',
  chapters: [
    {
      chapterId: 'c1',
      chapterTitle: '第一单元·识字',
      leaves: [
        {
          leafId: 'l1',
          leafTitle: '1 天地人',
          kps: [
            { kpId: 'kp-demo-1', canonicalName: '认读"天地人"三字', subject: '语文' },
            { kpId: 'kp-demo-2', canonicalName: '用"你我他"指代不同对象', subject: '语文' },
          ],
        },
        {
          leafId: 'l2',
          leafTitle: '2 金木水火土',
          kps: [
            { kpId: 'kp-demo-3', canonicalName: '认读"金木水火土"五字', subject: '语文' },
          ],
        },
      ],
    },
    {
      chapterId: 'c2',
      chapterTitle: '第二单元·汉语拼音',
      leaves: [
        {
          leafId: 'l3',
          leafTitle: '1 a o e',
          kps: [
            { kpId: 'kp-demo-4', canonicalName: '正确发音 a o e', subject: '语文' },
            { kpId: 'kp-demo-5', canonicalName: '掌握 a o e 的四声', subject: '语文' },
          ],
        },
      ],
    },
  ],
}

interface KpTreeSelectorProps {
  treeId: string
  selections: Map<string, KpMark>
  onChange: (next: Map<string, KpMark>) => void
}

export function KpTreeSelector({ treeId, selections, onChange }: KpTreeSelectorProps) {
  const [data, setData] = useState<KpTreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingFixture, setUsingFixture] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setUsingFixture(false)
    fetch(`/api/v2/textbook-kps/${treeId}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<KpTreeResponse>
      })
      .then(j => {
        if (cancelled) return
        setData(j)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // 接口未上线时退化到 fixture, 让 UI 可以跑通
        setUsingFixture(true)
        setData(FIXTURE_KPS)
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [treeId])

  function toggleKp(kpId: string) {
    const next = new Map(selections)
    if (next.has(kpId)) next.delete(kpId)
    else next.set(kpId, 'new')
    onChange(next)
  }

  function setMark(kpId: string, mark: KpMark) {
    const next = new Map(selections)
    next.set(kpId, mark)
    onChange(next)
  }

  if (loading) return <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>加载知识点列表中…</div>
  if (!data) return <div style={{ padding: 16, color: '#dc2626', fontSize: 13 }}>知识点加载失败: {error}</div>

  const totalKps = data.chapters.reduce(
    (sum, c) => sum + c.leaves.reduce((s, l) => s + l.kps.length, 0),
    0,
  )

  return (
    <div>
      {usingFixture && (
        <div style={{ marginBottom: 12, padding: 10, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          ⚠️ 接口 /api/v2/textbook-kps/{treeId} 未就绪，显示的是占位 fixture 数据。Agent A2 完成后会切回真实数据。
        </div>
      )}
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
        {data.treeName} · 共 {totalKps} 个知识点
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
        {data.chapters.map(ch => (
          <div key={ch.chapterId}>
            <div style={{
              padding: '10px 14px', fontSize: 13, fontWeight: 700,
              background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#111827',
              position: 'sticky', top: 0, zIndex: 1,
            }}>
              {ch.chapterTitle}
            </div>
            {ch.leaves.map(leaf => (
              <div key={leaf.leafId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ padding: '8px 14px 4px 22px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  {leaf.leafTitle}
                </div>
                {leaf.kps.length === 0 && (
                  <div style={{ padding: '4px 14px 8px 32px', fontSize: 12, color: '#9ca3af' }}>(暂无知识点)</div>
                )}
                {leaf.kps.map(kp => {
                  const mark = selections.get(kp.kpId)
                  const selected = mark !== undefined
                  return (
                    <div key={kp.kpId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px 8px 32px',
                      background: selected ? '#f0f9ff' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleKp(kp.kpId)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                        aria-label={`选择知识点 ${kp.canonicalName}`}
                      />
                      <span style={{ flex: 1, fontSize: 13, color: '#1f2937' }}>{kp.canonicalName}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['new', 'review', 'preview'] as KpMark[]).map(m => {
                          const active = selected && mark === m
                          const c = MARK_COLOR[m]
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={!selected}
                              onClick={() => setMark(kp.kpId, m)}
                              style={{
                                padding: '3px 10px', fontSize: 12,
                                background: active ? c.bg : '#fff',
                                color: active ? c.fg : (selected ? '#6b7280' : '#d1d5db'),
                                border: `1px solid ${active ? c.border : '#e5e7eb'}`,
                                borderRadius: 12,
                                cursor: selected ? 'pointer' : 'not-allowed',
                                fontWeight: active ? 700 : 500,
                              }}
                            >
                              {MARK_LABEL[m]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function summarizeSelections(selections: Map<string, KpMark>): {
  total: number
  newCount: number
  reviewCount: number
  previewCount: number
} {
  let n = 0, r = 0, p = 0
  for (const m of selections.values()) {
    if (m === 'new') n++
    else if (m === 'review') r++
    else p++
  }
  return { total: selections.size, newCount: n, reviewCount: r, previewCount: p }
}

interface SelectionCartProps {
  selections: Map<string, KpMark>
  nameLookup: Map<string, string>
  onRemove: (kpId: string) => void
  onSubmit: () => void
  submitting: boolean
}

export function SelectionCart({ selections, nameLookup, onRemove, onSubmit, submitting }: SelectionCartProps) {
  const s = summarizeSelections(selections)
  const canSubmit = s.total > 0 && !submitting
  const items = useMemo(
    () => Array.from(selections.entries()).map(([kpId, mark]) => ({
      kpId,
      mark,
      name: nameLookup.get(kpId) ?? kpId,
    })),
    [selections, nameLookup],
  )

  return (
    <div style={{
      position: 'sticky', bottom: 0,
      marginTop: 16, padding: 14,
      background: '#fff',
      border: '1px solid #e5e7eb', borderRadius: 12,
      boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: items.length > 0 ? 10 : 0 }}>
        <div style={{ fontSize: 14, color: '#374151' }}>
          已选 <strong>{s.total}</strong> 个知识点
          {s.total > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
              （
              <span style={{ color: MARK_COLOR.new.fg }}>新讲 {s.newCount}</span>
              <span> · </span>
              <span style={{ color: MARK_COLOR.review.fg }}>复习 {s.reviewCount}</span>
              <span> · </span>
              <span style={{ color: MARK_COLOR.preview.fg }}>预习 {s.previewCount}</span>
              ）
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            padding: '10px 22px',
            background: canSubmit ? '#2563eb' : '#9ca3af',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? '生成中…' : '用这些知识点生成新课 →'}
        </button>
      </div>
      {items.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          maxHeight: 96, overflowY: 'auto',
          paddingTop: 8, borderTop: '1px dashed #e5e7eb',
        }}>
          {items.map(it => {
            const c = MARK_COLOR[it.mark]
            return (
              <span key={it.kpId} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', fontSize: 12,
                background: c.bg, color: c.fg,
                border: `1px solid ${c.border}`, borderRadius: 14,
              }}>
                <span>{MARK_LABEL[it.mark]}</span>
                <span style={{ color: '#374151' }}>{it.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(it.kpId)}
                  aria-label={`取消选择 ${it.name}`}
                  style={{
                    background: 'transparent', border: 'none',
                    color: c.fg, cursor: 'pointer',
                    padding: 0, marginLeft: 2, fontSize: 14, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 把 tree 数据扁平成 kpId → name 的 map, 方便购物车显示
export function buildKpNameLookup(data: KpTreeResponse | null): Map<string, string> {
  const m = new Map<string, string>()
  if (!data) return m
  for (const ch of data.chapters) {
    for (const leaf of ch.leaves) {
      for (const kp of leaf.kps) {
        m.set(kp.kpId, kp.canonicalName)
      }
    }
  }
  return m
}

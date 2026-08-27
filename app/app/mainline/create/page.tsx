'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TextbookPicker, type TextbookPick } from '../../(setup)/create/TextbookPicker.js'
import {
  compatibleSeasons,
  defaultSeasonDraft,
  type SeasonSummary,
} from './season-selection.js'
import {
  KpTreeSelector,
  SelectionCart,
  buildKpNameLookup,
  type KpMark,
  type KpTreeResponse,
} from '../../(setup)/create/KpTreeSelector.js'

export default function MainlineCreatePage() {
  const router = useRouter()
  const [pick, setPick] = useState<TextbookPick | null>(null)
  const [kpSelections, setKpSelections] = useState<Map<string, KpMark>>(new Map())
  const [kpTreeData, setKpTreeData] = useState<KpTreeResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seasons, setSeasons] = useState<SeasonSummary[]>([])
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [creatingSeason, setCreatingSeason] = useState(false)
  // 方向三·学习时期:同一知识点的新授/复习/考前课表现姿态不同(表现路由 PHASE_FACTORS)
  const [lessonPhase, setLessonPhase] = useState<'new' | 'review' | 'exam-prep'>('new')

  useEffect(() => {
    setKpSelections(new Map())
    setKpTreeData(null)
  }, [pick?.textbookId])

  async function loadSeasons() {
    setSeasonLoading(true)
    try {
      const res = await fetch('/api/v2/mainline/seasons', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json() as { seasons: SeasonSummary[] }
      setSeasons(j.seasons)
    } catch {
      setSeasons([])
    } finally {
      setSeasonLoading(false)
    }
  }

  useEffect(() => {
    void loadSeasons()
  }, [])

  const seasonOptions = useMemo(() => compatibleSeasons(seasons, pick), [seasons, pick])

  useEffect(() => {
    if (!selectedSeasonId) return
    if (!seasonOptions.some(season => season.id === selectedSeasonId)) setSelectedSeasonId('')
  }, [seasonOptions, selectedSeasonId])

  useEffect(() => {
    if (!pick?.textbookId) return
    let cancelled = false
    fetch(`/api/v2/textbook-kps/${pick.textbookId}`)
      .then(async r => { if (!r.ok) throw new Error('not ready'); return r.json() as Promise<KpTreeResponse> })
      .then(j => { if (!cancelled) setKpTreeData(j) })
      .catch(() => { /* selector 自己回退 fixture */ })
    return () => { cancelled = true }
  }, [pick?.textbookId])

  const nameLookup = useMemo(() => buildKpNameLookup(kpTreeData), [kpTreeData])

  function removeKp(kpId: string) {
    const next = new Map(kpSelections)
    next.delete(kpId)
    setKpSelections(next)
  }

  async function onSubmit() {
    if (kpSelections.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const kpIds = Array.from(kpSelections.keys())
      const res = await fetch('/api/v2/mainline/from-kps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpIds,
          ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
          ...(lessonPhase !== 'new' ? { lessonPhase } : {}),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const j = (await res.json()) as { courseId: string; presetMatched: string }
      // 做课完成先进入备课修正，不把未经教师确认的内容直接带进课堂。
      const url = `/mainline/${j.courseId}/prep`
      router.push(url)
      window.setTimeout(() => {
        if (window.location.pathname !== url) window.location.assign(url)
      }, 300)
    } catch (err) {
      setError(String(err))
      setSubmitting(false)
    }
  }

  async function createSeasonForPick() {
    if (!pick) return
    setCreatingSeason(true)
    setError(null)
    try {
      const draft = defaultSeasonDraft(pick)
      const res = await fetch('/api/v2/mainline/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await res.json().catch(() => ({})) as { seasonId?: string; error?: string }
      if (!res.ok || !j.seasonId) throw new Error(j.error || `HTTP ${res.status}`)
      await loadSeasons()
      setSelectedSeasonId(j.seasonId)
    } catch (err) {
      setError(String(err))
    } finally {
      setCreatingSeason(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#fafaf7', boxSizing: 'border-box' }}>
      <header style={{ padding: '20px 48px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ fontSize: 15, color: '#6b7280', textDecoration: 'none' }}>← 返回</Link>
        <div style={{ fontSize: 13, color: '#9ca3af', letterSpacing: '0.06em' }}>MAINLINE · 新主线</div>
      </header>

      <section style={{ maxWidth: 880, margin: '32px auto', padding: '0 24px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>从知识点做课</h1>
        <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 15, lineHeight: 1.7 }}>
          选教材、勾知识点,系统按每个知识点的认知类型即时编译出低交互空骨架课程(幕数随知识点伸缩,精美立绘 + 教师讲画面显)。
          <br />
          <span style={{ color: '#9ca3af', fontSize: 13 }}>
            当前是骨架层(不烧 LLM),课程内容为占位文本;下一步 fill-scenes 会用 LLM 填成真实教学讲稿。
          </span>
        </p>

        <TextbookPicker value={pick} onChange={setPick} />
        {pick?.textbookId && (
          <div style={{ marginTop: 22 }}>
            <SeasonSelector
              seasons={seasonOptions}
              loading={seasonLoading}
              selectedSeasonId={selectedSeasonId}
              creating={creatingSeason}
              onChange={setSelectedSeasonId}
              onCreate={createSeasonForPick}
            />
            <LessonPhaseSelector value={lessonPhase} onChange={setLessonPhase} />
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, fontWeight: 600 }}>
              勾选要进这节课的知识点(mark 三态先收集,fill-scenes 时再用):
            </div>
            <KpTreeSelector treeId={pick.textbookId} selections={kpSelections} onChange={setKpSelections} />
            <SelectionCart
              selections={kpSelections}
              nameLookup={nameLookup}
              onRemove={removeKp}
              onSubmit={onSubmit}
              submitting={submitting}
            />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}
      </section>
    </main>
  )
}

const LESSON_PHASES: ReadonlyArray<{ id: 'new' | 'review' | 'exam-prep'; label: string; hint: string }> = [
  { id: 'new', label: '新授', hint: '完整叙事节奏' },
  { id: 'review', label: '复习', hint: '高密度检核形态' },
  { id: 'exam-prep', label: '考前', hint: '冲刺收敛姿态' },
]

/** 学习时期选择:改变首个学习动作与生成约束，同时调整表现密度；幕数仍由内容决定。 */
function LessonPhaseSelector({ value, onChange }: { value: 'new' | 'review' | 'exam-prep'; onChange: (v: 'new' | 'review' | 'exam-prep') => void }) {
  return (
    <section style={{ marginBottom: 22, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
      <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>学习时期</div>
      <div style={{ marginTop: 4, marginBottom: 12, fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
        同一批知识点，新授先预测取证，复习先闭卷提取，考前先限时诊断；页面密度也会随之调整。
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {LESSON_PHASES.map(phase => (
          <button
            key={phase.id}
            type="button"
            onClick={() => onChange(phase.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: value === phase.id ? '1.5px solid #374151' : '1px solid #d1d5db',
              background: value === phase.id ? '#374151' : '#fff',
              color: value === phase.id ? '#fff' : '#374151',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {phase.label}
            <span style={{ marginLeft: 6, fontSize: 11, color: value === phase.id ? '#d1d5db' : '#9ca3af' }}>{phase.hint}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function SeasonSelector({
  seasons,
  loading,
  selectedSeasonId,
  creating,
  onChange,
  onCreate,
}: {
  seasons: SeasonSummary[]
  loading: boolean
  selectedSeasonId: string
  creating: boolean
  onChange: (id: string) => void
  onCreate: () => void
}) {
  return (
    <section style={{ marginBottom: 22, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>课程季</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
            选择后,这节课会成为该季下一集,填内容时自动承接上一集钩子。
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: creating ? '#f3f4f6' : '#111827',
            color: creating ? '#6b7280' : '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: creating ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {creating ? '创建中…' : '新建课程季'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange('')}
          style={seasonButtonStyle(selectedSeasonId === '')}
        >
          单课
        </button>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>读取课程季中…</span>}
        {!loading && seasons.length === 0 && (
          <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>暂无同学科同学段课程季</span>
        )}
        {seasons.map(season => (
          <button
            key={season.id}
            type="button"
            onClick={() => onChange(season.id)}
            style={seasonButtonStyle(selectedSeasonId === season.id)}
            title={season.seasonTheme}
          >
            {season.title} · E{String(season.nextEpisodeNo).padStart(2, '0')}
          </button>
        ))}
      </div>
    </section>
  )
}

function seasonButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
    background: active ? '#eff6ff' : '#fff',
    color: active ? '#1d4ed8' : '#374151',
    fontSize: 13,
    fontWeight: active ? 800 : 600,
    cursor: 'pointer',
  }
}

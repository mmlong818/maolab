'use client'

import { useEffect, useMemo, useState } from 'react'

export interface TextbookPick {
  textbookId: string
  textbookTitle: string
  stage: '小学' | '初中' | '高中'
  subject: string
  version: string
  grade: string
  volume: string
}

interface FacetsResp {
  facets: {
    stages: string[]
    subjects: Record<string, string[]>
    versions: Record<string, string[]>
    grades: Record<string, string[]>
    volumes: Record<string, string[]>
  }
  total: number
}

interface TextbookItem {
  id: string
  title: string
  stage: '小学' | '初中' | '高中'
  subject: string
  version: string
  grade: string
  volume: string
}

const STAGES: Array<'小学' | '初中' | '高中'> = ['小学', '初中', '高中']

const GRADE_ORDER = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

function gradeRank(g: string): number {
  for (let i = GRADE_ORDER.length - 1; i >= 0; i--) {
    if (g.startsWith(GRADE_ORDER[i]!)) return i
  }
  return 999
}

function sortGrades(grades: readonly string[]): string[] {
  return [...grades].sort((a, b) => gradeRank(a) - gradeRank(b))
}

/**
 * 同名教材区分: 带 "新教材-" 前缀的视为最新版, 不带的视为旧版.
 * 仅当两本教材标题在去掉前缀后相同时才标注, 避免误标.
 */
function annotateBooks(books: TextbookItem[]): Array<TextbookItem & { badge?: 'latest' | 'legacy' }> {
  const normalized = books.map(b => ({ b, key: b.title.replace(/^新教材-/, '') }))
  const counts = new Map<string, number>()
  for (const { key } of normalized) counts.set(key, (counts.get(key) ?? 0) + 1)
  return normalized.map(({ b, key }) => {
    if ((counts.get(key) ?? 0) < 2) return b
    const isLatest = b.title.startsWith('新教材-')
    return { ...b, badge: isLatest ? 'latest' as const : 'legacy' as const }
  })
}

export function TextbookPicker({ onChange, value }: {
  onChange: (pick: TextbookPick | null) => void
  value: TextbookPick | null
}) {
  const [facets, setFacets] = useState<FacetsResp['facets'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<string>(value?.stage ?? '')
  const [subject, setSubject] = useState<string>(value?.subject ?? '')
  const [version, setVersion] = useState<string>(value?.version ?? '')
  const [grade, setGrade] = useState<string>(value?.grade ?? '')
  const [volume, setVolume] = useState<string>(value?.volume ?? '')
  const [books, setBooks] = useState<TextbookItem[]>([])
  const [pickedId, setPickedId] = useState<string>(value?.textbookId ?? '')

  useEffect(() => {
    fetch('/api/v2/textbooks?facets=1')
      .then(r => r.json())
      .then((j: FacetsResp) => setFacets(j.facets))
      .finally(() => setLoading(false))
  }, [])

  const subjectOptions = useMemo(
    () => (stage && facets?.subjects[stage]) || [],
    [stage, facets],
  )
  const versionOptions = useMemo(
    () => (stage && subject && facets?.versions[`${stage}|${subject}`]) || [],
    [stage, subject, facets],
  )
  const gradeOptions = useMemo(
    () => {
      const raw = (stage && subject && version && facets?.grades[`${stage}|${subject}|${version}`]) || []
      return sortGrades(raw)
    },
    [stage, subject, version, facets],
  )
  const volumeOptions = useMemo(
    () => (stage && subject && version && grade && facets?.volumes[`${stage}|${subject}|${version}|${grade}`]) || [],
    [stage, subject, version, grade, facets],
  )

  useEffect(() => {
    if (!stage || !subject || !version || !grade || !volume) {
      setBooks([])
      setPickedId('')
      onChange(null)
      return
    }
    const sp = new URLSearchParams({ stage, subject, version, grade, volume })
    fetch(`/api/v2/textbooks?${sp}`)
      .then(r => r.json())
      .then((j: { items: TextbookItem[] }) => {
        setBooks(j.items)
        if (j.items.length === 1) {
          handlePick(j.items[0]!)
        } else {
          setPickedId('')
          onChange(null)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, subject, version, grade, volume])

  function handlePick(b: TextbookItem) {
    setPickedId(b.id)
    onChange({
      textbookId: b.id,
      textbookTitle: b.title,
      stage: b.stage,
      subject: b.subject,
      version: b.version,
      grade: b.grade,
      volume: b.volume,
    })
  }

  if (loading) return <div style={{ padding: 16, color: '#9ca3af' }}>加载教材目录中…</div>
  if (!facets) return <div style={{ padding: 16, color: '#dc2626' }}>教材目录加载失败</div>

  return (
    <div>
      <ChipsRow label="学段" options={STAGES.filter(s => facets.stages.includes(s))}
        value={stage}
        onChange={v => { setStage(v); setSubject(''); setVersion(''); setGrade(''); setVolume('') }} />
      <ChipsRow label="学科" options={subjectOptions}
        value={subject} disabled={!stage}
        onChange={v => { setSubject(v); setVersion(''); setGrade(''); setVolume('') }} />
      <ChipsRow label="版本" options={versionOptions}
        value={version} disabled={!subject}
        onChange={v => { setVersion(v); setGrade(''); setVolume('') }} />
      <ChipsRow label="年级" options={gradeOptions}
        value={grade} disabled={!version}
        onChange={v => { setGrade(v); setVolume('') }} />
      <ChipsRow label="册"   options={volumeOptions}
        value={volume} disabled={!grade}
        onChange={setVolume} />

      {books.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>教材 ({books.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {annotateBooks(books).map(b => (
              <button key={b.id} type="button" onClick={() => handlePick(b)}
                style={{
                  textAlign: 'left', padding: '10px 14px', fontSize: 13,
                  background: pickedId === b.id ? '#eef2ff' : '#fff',
                  border: `1px solid ${pickedId === b.id ? '#2563eb' : '#e5e7eb'}`,
                  borderRadius: 8, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                {b.badge === 'latest' && (
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    background: '#dbeafe', color: '#1d4ed8', fontWeight: 600,
                  }}>推荐 · 最新</span>
                )}
                {b.badge === 'legacy' && (
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    background: '#f3f4f6', color: '#6b7280', fontWeight: 500,
                  }}>旧版</span>
                )}
                <span>{b.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

function ChipsRow({ label, options, value, onChange, disabled }: {
  label: string
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div style={{ marginBottom: 14, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.length === 0 && <span style={{ fontSize: 12, color: '#d1d5db' }}>(请先选上一项)</span>}
        {options.map(o => {
          const active = value === o
          return (
            <button key={o} type="button" disabled={disabled} onClick={() => onChange(active ? '' : o)}
              style={{
                padding: '6px 12px', fontSize: 13,
                background: active ? '#2563eb' : '#fff',
                color: active ? '#fff' : '#374151',
                border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
                borderRadius: 16, cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: active ? 600 : 500,
              }}>
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

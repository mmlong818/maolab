'use client'

// 选知识点（S3）：k12-knowledge-points 数据集没有教材章节树，按学段、学科与关键词检索（/api/prep/knowledge/*）。
// 已选的知识点跨多次检索保留，最多 6 个（kp-selection）。换学段时学科清空；迟到的检索结果按请求序号丢弃。
import { useEffect, useRef, useState } from 'react'
import { prepApi, type PrepKnowledgeFacets, type PrepKnowledgePoint } from '../lib/api'
import { choiceOf, DEFAULT_BAND, searchQueryOf, subjectsOf } from '../lib/kp-search'
import { toggleKp, type KpChoice } from '../lib/kp-selection'
import { errorText } from '../errors'
import styles from '../prep.module.css'

export default function KpPicker({ onConfirm, busy = false }: { onConfirm(kps: KpChoice[]): void; busy?: boolean }) {
  const [facets, setFacets] = useState<PrepKnowledgeFacets | null>(null)
  const [band, setBand] = useState(DEFAULT_BAND)
  const [subject, setSubject] = useState('')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PrepKnowledgePoint[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<KpChoice[]>([])
  const [warning, setWarning] = useState<string | undefined>()
  const [error, setError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    let active = true
    prepApi.knowledgeFacets().then((f) => { if (active) setFacets(f) }).catch((e: unknown) => { if (active) setError(errorText(e, '知识点目录加载失败，请重试。')) })
    return () => { active = false }
  }, [])

  async function search() {
    const query = searchQueryOf({ q, band, subject })
    if (!query) { setError('请输入关键词，或先选学科。'); return }
    const mine = ++seq.current
    setSearching(true); setError('')
    try {
      const r = await prepApi.searchKnowledge({ ...query, limit: 50 })
      if (mine === seq.current) setResults(r.items)
    } catch (e) {
      if (mine === seq.current) setError(errorText(e, '检索失败，请重试。'))
    } finally {
      if (mine === seq.current) setSearching(false)
    }
  }
  const toggle = (kp: KpChoice) => { const next = toggleKp(selected, kp); setSelected(next.selected); setWarning(next.warning) }

  return (
    <div className={styles.section}>
      <form className={styles.row} onSubmit={(e) => { e.preventDefault(); void search() }}>
        <select aria-label="学段" value={band} onChange={(e) => { setBand(e.target.value); setSubject('') }}>
          {(facets?.gradeBands ?? [{ gradeBand: DEFAULT_BAND, subjects: [] }]).map((b) => <option key={b.gradeBand}>{b.gradeBand}</option>)}
        </select>
        <select aria-label="学科" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">全部学科</option>
          {subjectsOf(facets, band).map((s) => <option key={s}>{s}</option>)}
        </select>
        <input aria-label="关键词" value={q} maxLength={80} placeholder="知识点关键词，如：二力平衡" onChange={(e) => setQ(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? '检索中…' : '检索'}</button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {selected.length > 0 ? (
        <div className={styles.status}>
          已选：
          {selected.map((kp) => (
            <label key={kp.kpId} className={styles.row}>
              <input type="checkbox" checked onChange={() => toggle(kp)} />
              {kp.canonicalName}（{kp.subject}）
            </label>
          ))}
        </div>
      ) : null}
      {results && results.length === 0 ? <p className={styles.hint}>没有找到匹配的知识点，换个关键词或学科试试。</p> : null}
      {results?.map((point) => (
        <label key={point.id} className={styles.row} title={point.summary || undefined}>
          <input type="checkbox" checked={selected.some((s) => s.kpId === point.id)} onChange={() => toggle(choiceOf(point))} />
          {point.name}<span className={styles.status}>{point.gradeBand} · {point.subject}</span>
        </label>
      ))}
      {warning ? <p className={styles.hint}>{warning}</p> : null}
      <button type="button" disabled={busy || selected.length === 0} onClick={() => onConfirm(selected)}>{busy ? '正在建课…' : `用选中的 ${selected.length} 个知识点建课`}</button>
    </div>
  )
}

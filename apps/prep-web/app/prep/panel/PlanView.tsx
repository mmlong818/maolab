'use client'

// 计划逐页：学习动作与新信息可改；确认计划；图像页在图像不可用时提示并给"改为讲解页"。
// 只有计划状态为 planning 时可写（planEditable，与 saveDraftPlan / approveDraftPlan / editDraftPlanStructure 同一判据）。
// "改为讲解页"分两步（插入讲解页、删原页，见 replaceWithExplanation）：删除失败时如实说明，下次只删不再插；结构操作不清掉其他页未保存的修改。
// 终审修复：是否"已插入、只差删原页"从计划数据推断（explanationInsertedAfter，切标签、换课、刷新后仍然对，T12 M2）；
// 两个输入框各占一行、带标签（T15 走查第 1 条：横向重叠）。
import React, { useRef, useState } from 'react'
import { prepApi } from '../lib/api'
import type { PrepWorkbench } from '../lib/panel-model'
import { errorText } from '../errors'
import { PLAN_STATUS_LABEL, explanationInsertedAfter, labelOf, planEditable, purposeLabel, replaceWithExplanation } from './view-model'
import styles from '../prep.module.css'

interface PlanPage { id: string; order: number; purpose: string; learningAction: string; newInformation: string; visualSpec?: { required?: boolean; form?: string } }
type Edit = { learningAction: string; newInformation: string }

export default function PlanView({ courseId, workbench, imagesAvailable, onChanged }: { courseId: string; workbench: PrepWorkbench; imagesAvailable: boolean; onChanged(): void }) {
  const planning = (workbench.course.planning ?? null) as { status: string; pages: PlanPage[] } | null
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  // 已插入讲解页、原图像页还没删掉的页
  const [inserted, setInserted] = useState<Record<string, true>>({})
  if (!planning) return <p className={styles.section}>这门课还没有计划。</p>
  const editable = planEditable(planning.status)
  const updates = () => Object.entries(edits).map(([pageId, e]) => ({ pageId, ...e }))

  async function guarded(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    try { await action() } finally { busyRef.current = false; setBusy(false) }
  }

  const submit = (action: 'save' | 'approve', done: string) => guarded(async () => {
    try {
      await prepApi.updatePlan(courseId, { action, updates: updates() })
      setEdits({})
      setMessage({ ok: true, text: done })
      onChanged()
    } catch (e) { setMessage({ ok: false, text: errorText(e, '没有完成，请稍后重试。') }) }
  })

  // 组件内的 inserted 只管"插入成功、课程还没重读"的那一小段；之后以计划数据为准
  const alreadyInserted = (pageId: string) => Boolean(inserted[pageId]) || explanationInsertedAfter(planning.pages, pageId)
  const toExplanation = (p: PlanPage, e: Edit) => guarded(async () => {
    const result = await replaceWithExplanation(prepApi.updatePlan, courseId, { ...p, ...e }, alreadyInserted(p.id))
    setInserted((m) => { const next = { ...m }; if (result.inserted && !result.done) next[p.id] = true; else delete next[p.id]; return next })
    // 只去掉被删掉的那一页的未保存修改，其他页的保留
    if (result.done) setEdits((m) => { const next = { ...m }; delete next[p.id]; return next })
    setMessage({ ok: result.done, text: result.message })
    if (result.inserted) onChanged()
  })

  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <strong>计划（{planning.pages.length} 页 · {labelOf(PLAN_STATUS_LABEL, planning.status)}）</strong>
        {editable ? <button type="button" disabled={busy} onClick={() => void submit('save', '已保存。')}>保存修改</button> : null}
        {editable ? <button type="button" disabled={busy} onClick={() => void submit('approve', '计划已确认，可以在对话里让备课助理逐页生成。')}>确认计划</button> : null}
      </div>
      {message ? <p className={message.ok ? styles.hint : styles.error}>{message.text}</p> : null}
      <ol className={styles.planList}>
        {planning.pages.map((p) => {
          const needsImage = Boolean(p.visualSpec?.required && p.visualSpec.form === 'instructional-image')
          const e = edits[p.id] ?? { learningAction: p.learningAction, newInformation: p.newInformation }
          return (
            <li key={p.id}>
              <div className={styles.status}>{purposeLabel(p.purpose)}</div>
              {editable ? (
                <div className={styles.planFields}>
                  <label htmlFor={`${p.id}-action`}>学习动作</label>
                  <input id={`${p.id}-action`} aria-label="学习动作" maxLength={240} value={e.learningAction} onChange={(ev) => { const value = ev.target.value; setEdits((m) => ({ ...m, [p.id]: { ...e, learningAction: value } })) }} />
                  <label htmlFor={`${p.id}-info`}>新信息</label>
                  <input id={`${p.id}-info`} aria-label="新信息" maxLength={360} value={e.newInformation} onChange={(ev) => { const value = ev.target.value; setEdits((m) => ({ ...m, [p.id]: { ...e, newInformation: value } })) }} />
                </div>
              ) : <div>{p.learningAction} — {p.newInformation}</div>}
              {editable && needsImage && !imagesAvailable ? (
                <div className={styles.hint}>
                  这一页需要教学图像，但图像生成目前没有开启，确认计划时会被拦下。
                  <button type="button" disabled={busy} onClick={() => void toExplanation(p, e)}>{alreadyInserted(p.id) ? '删除原图像页' : '改为讲解页'}</button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

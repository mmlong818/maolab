'use client'

// 质量（页优先课程）：逐页状态与截图证据（summary.pages，与 read_course 同一份）、整课 AI 教学审查结论、整课审查被拦时的建议。
// "送截图"调 render 接口（含被拦后需要重新排队的页）。审查被拦时的 advice 是写给模型的，面板改用 teacherAuditAdvice 给老师看；
// 只有未核实或待核查页时也显示（review M6），各列表都空时什么也不多显示（Note for T12）。
// 终审修复（T15 走查第 3、4 条）：表格固定列宽，长的截图问题与诊断收起、可展开；"最近诊断"只给当前仍被拦下的页（currentDiagnostic）。
import React, { useState } from 'react'
import { prepApi, newRequestId, type PrepPageRow } from '../lib/api'
import { teachingAuditNote, type PrepWorkbench } from '../lib/panel-model'
import { errorText } from '../errors'
import { AUDIT_STATUS_LABEL, PAGE_STATUS_LABEL, clipText, currentDiagnostic, labelOf, purposeLabel, renderNoteText, sessionStatusOf, teacherAuditAdvice } from './view-model'
import styles from '../prep.module.css'

/** 长文字：前一段直接显示，其余点"展开"再看 */
export function Clip({ text }: { text: string }) {
  const { short, full } = clipText(text)
  return full ? <details className={styles.clip}><summary>{short}</summary>{full}</details> : <>{text}</>
}

export default function QualityView({ courseId, workbench, onChanged }: { courseId: string; workbench: PrepWorkbench; onChanged(): void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const pages = (Array.isArray(workbench.summary.pages) ? workbench.summary.pages : []) as PrepPageRow[]
  const pageLabel = (pageId: string) => { const p = pages.find((row) => row.pageId === pageId); return p ? `第 ${p.order} 页` : pageId }
  const kpCount = new Set(((workbench.course.sourceMaterial ?? []) as Array<{ kpId?: string }>).map((m) => m.kpId).filter(Boolean)).size
  const note = teachingAuditNote(workbench, kpCount)
  const blocked = workbench.auditBlocked ? teacherAuditAdvice(workbench.auditBlocked, pageLabel) : null
  const sessionStatus = sessionStatusOf(workbench)
  const generating = Boolean((workbench.course as { generationSession?: unknown }).generationSession)

  async function render() {
    if (busy) return
    setMessage(null)
    setBusy(true)
    try {
      const r = await prepApi.render(courseId, newRequestId())
      setMessage({ ok: true, text: r.jobs.length > 0 ? `已送 ${r.jobs.length} 页去截图${r.skipped.length ? `，${r.skipped.length} 页已在排队` : ''}。` : renderNoteText(r.note, sessionStatus) })
      onChanged()
    } catch (e) { setMessage({ ok: false, text: errorText(e, '没有完成，请稍后重试。') }) } finally { setBusy(false) }
  }

  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <strong>逐页状态</strong>
        {generating ? <button type="button" disabled={busy} onClick={() => void render()}>送截图（含被拦后需要重新排队的页）</button> : null}
      </div>
      {!generating ? <p className={styles.status}>计划确认后才开始逐页生成与截图。</p> : null}
      {message ? <p className={message.ok ? styles.hint : styles.error}>{message.text}</p> : null}
      {note ? <p className={styles.hint}>{note}</p> : null}
      {workbench.teachingAudit ? (
        <p>AI 教学审查：{labelOf(AUDIT_STATUS_LABEL, workbench.teachingAudit.status)}{workbench.teachingAudit.state === 'stale' ? '（与当前版本不一致，需要重新审查）' : ''}</p>
      ) : generating ? <p className={styles.status}>还没有整课审查。截图全部通过后，在对话里让备课助理做整课审查。</p> : null}
      {blocked?.show ? (
        <div>
          <strong>整课审查没有通过</strong>
          {blocked.lines.map((line, n) => <p key={n}>{line}</p>)}
          {blocked.auditError ? <p className={styles.status}>审查输出没通过校验：{blocked.auditError}</p> : null}
          {blocked.items.length > 0 ? <ul>{blocked.items.map((i, n) => <li key={n}>{i.text} —— {i.action}</li>)}</ul> : null}
        </div>
      ) : null}
      {pages.length > 0 ? (
        <table className={styles.qualityTable}>
          <thead><tr><th>页</th><th>用途</th><th>状态</th><th>截图</th><th>最近诊断</th><th>验收</th></tr></thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.pageId}>
                <td>{p.order}</td><td>{purposeLabel(p.purpose)}</td><td>{labelOf(PAGE_STATUS_LABEL, p.status)}</td>
                <td>{p.render ? (p.render.blocking ? <Clip text={`被拦：${p.render.issues.join('；')}`} /> : '通过') : '—'}</td>
                <td>{currentDiagnostic(p) ? <Clip text={currentDiagnostic(p)!} /> : ''}</td>
                <td>{p.accepted ? '已验收' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className={styles.status}>这门课还没有计划页。</p>}
    </div>
  )
}

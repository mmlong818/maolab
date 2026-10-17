'use client'

// 教师验收（页优先课程）：逐页验收 unacceptedPageIds，全部验收后整课验收。
// 草稿课程（计划未确认、没有生成会话）不显示验收按钮（canAccept；api 在那里回 404/422）。
// 整课验收按钮只在会话待验收时出现，逐页都验完才可点（canAcceptCourse，review M5）；万一仍回 422，用 acceptErrorText 转成老师能看懂的话。
import React, { useState } from 'react'
import { prepApi, type PrepPageRow } from '../lib/api'
import { canAccept, unverifiedSourcesText, type PrepWorkbench } from '../lib/panel-model'
import { errorText } from '../errors'
import { acceptErrorText, canAcceptCourse, nextStepText, purposeLabel, sessionStatusOf } from './view-model'
import styles from '../prep.module.css'

export default function AcceptanceView({ courseId, workbench, onChanged }: { courseId: string; workbench: PrepWorkbench; onChanged(): void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = workbench.unacceptedPageIds
  const acceptance = workbench.summary.acceptance as { finalSignature: string | null } | null
  const accepted = Boolean(acceptance?.finalSignature)
  const sessionStatus = sessionStatusOf(workbench)
  const awaiting = sessionStatus === 'awaiting-teacher-acceptance'
  const pages = (Array.isArray(workbench.summary.pages) ? workbench.summary.pages : []) as PrepPageRow[]
  const unverified = unverifiedSourcesText(workbench)
  const label = (pageId: string) => { const p = pages.find((row) => row.pageId === pageId); return p ? `第 ${p.order} 页 · ${purposeLabel(p.purpose)}` : pageId }

  async function act(fn: () => Promise<unknown>, done: string, describe: (e: unknown) => string) {
    if (busy) return
    setMessage(null)
    setBusy(true)
    try { await fn(); setMessage({ ok: true, text: done }); onChanged() } catch (e) { setMessage({ ok: false, text: describe(e) }) } finally { setBusy(false) }
  }

  if (!canAccept(workbench)) {
    return (
      <div className={styles.section}>
        <strong>教师验收</strong>
        <p className={styles.status}>计划确认、页面生成并通过整课审查之后，才能在这里逐页验收。</p>
      </div>
    )
  }
  return (
    <div className={styles.section}>
      <strong>教师验收</strong>
      {unverified ? <p className={styles.hint} role="note">{unverified}</p> : null}
      {accepted ? <p>整课已验收。</p> : null}
      {message ? <p className={message.ok ? styles.hint : styles.error}>{message.text}</p> : null}
      {pending.length > 0 ? (
        <ul>{pending.map((pageId) => <li key={pageId}>{label(pageId)} <button type="button" disabled={busy} onClick={() => void act(() => prepApi.acceptPage(courseId, pageId), `${label(pageId)} 已验收。`, (e) => errorText(e, '没有完成，请稍后重试。'))}>验收这一页</button></li>)}</ul>
      ) : null}
      {!accepted && !awaiting ? <p className={styles.status}>{nextStepText(sessionStatus) || '整课审查通过后，这里会列出待逐页验收的页。'}</p> : null}
      {!accepted && awaiting ? <button type="button" disabled={busy || !canAcceptCourse(workbench)} onClick={() => void act(() => prepApi.acceptCourse(courseId), '整课已验收。', (e) => acceptErrorText(e, sessionStatus))}>整课验收</button> : null}
    </div>
  )
}

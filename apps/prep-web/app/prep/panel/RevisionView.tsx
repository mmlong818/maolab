'use client'

// 建修订版：整课验收过的课要改内容（包括只改标题），老师确认整课重新生成的代价后建修订版，建好后切到修订版。
// 换课后迟到的响应一律丢弃；busyRef 挡住同一帧里的连点。
import { useEffect, useRef, useState } from 'react'
import { canRevise, prepApi, REVISE_CONFIRM } from '../lib/api'
import type { PrepWorkbench } from '../lib/panel-model'
import { errorText } from '../errors'
import styles from '../prep.module.css'

export default function RevisionView({ courseId, workbench, onSelectCourse }: { courseId: string; workbench: PrepWorkbench; onSelectCourse(id: string, notice?: string): void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const courseRef = useRef(courseId)
  const busyRef = useRef(false)
  useEffect(() => { courseRef.current = courseId; setMessage(null) }, [courseId])

  if (!canRevise(workbench.course)) return null

  async function revise() {
    if (busyRef.current || !window.confirm(REVISE_CONFIRM)) return
    busyRef.current = true; setBusy(true); setMessage(null)
    const forCourse = courseId
    try {
      const { revision } = await prepApi.revise(forCourse)
      if (courseRef.current !== forCourse) return
      const text = revision.existing ? '这门课已经有更新的版本，已切换过去。' : '修订版已建好，已切换过去：从确认计划开始重新做一遍。'
      setMessage({ ok: true, text })
      // 本视图按课程 key 挂载，切课后会卸载：提示随切换一起交给面板显示
      onSelectCourse(revision.courseId, text)
    } catch (e) {
      if (courseRef.current === forCourse) setMessage({ ok: false, text: errorText(e, '没有建成修订版，请稍后重试。') })
    } finally { busyRef.current = false; setBusy(false) }
  }

  return (
    <div className={styles.section}>
      <strong>修改已验收的课</strong>
      <p className={styles.status}>这节课已经整课验收。要改内容（包括只改标题），建一个修订版：正文、截图、整课审查和验收都要重新做。</p>
      <button type="button" disabled={busy} onClick={() => void revise()}>建修订版</button>
      {message ? <p className={message.ok ? styles.hint : styles.error} role={message.ok ? 'status' : 'alert'}>{message.text}</p> : null}
    </div>
  )
}

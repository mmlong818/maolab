'use client'

// 统一壳：左栏备课对话，右栏备课面板。状态 403 时按 code 说明原因。
// 课程与会话的选择保存在本页状态里；对话里出现的 tool/done 帧让面板重读课程（refreshKey）。
// 能不能用以 /api/prep/status 为准：没开放（PREP_NOT_ENABLED）等 403 只显示说明、不显示面板；
// 没有云一凭证（hasCredential=false）时对话停用并说明原因，面板照常（api 的面板接口不要求凭证）。
import { useCallback, useEffect, useState } from 'react'
import { prepApi, PrepApiError } from './lib/api'
import PrepChat from './chat/PrepChat'
import PrepPanel from './panel/PrepPanel'
import styles from './prep.module.css'

type Gate = { status: 'loading' } | { status: 'ready'; hasCredential: boolean; imagesAvailable: boolean } | { status: 'denied'; message: string; retry: boolean }

export default function PrepWorkspace() {
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const [courseId, setCourseId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setGate({ status: 'loading' })
    prepApi.status()
      .then((s) => { if (active) setGate({ status: 'ready', hasCredential: s.hasCredential, imagesAvailable: s.imagesAvailable }) })
      .catch((e: unknown) => {
        if (!active) return
        const message = e instanceof PrepApiError ? e.message : '备课服务暂时不可用，请稍后刷新重试。'
        // 403 等是 api 的明确拒绝；断网或 5xx 才给"重试"
        setGate({ status: 'denied', message, retry: !(e instanceof PrepApiError) || e.status >= 500 })
      })
    return () => { active = false }
  }, [attempt])

  const onCourseTouched = useCallback((id: string | null) => {
    if (id) setCourseId(id)
    setRefreshKey((k) => k + 1)
  }, [])

  if (gate.status === 'loading') return <main className={styles.notice} role="status">正在打开备课室…</main>
  if (gate.status === 'denied') {
    return (
      <main className={styles.notice} role="alert">
        <div>
          <p>{gate.message}</p>
          {gate.retry ? <button type="button" onClick={() => setAttempt((n) => n + 1)}>重试</button> : null}
        </div>
      </main>
    )
  }
  return (
    <div className={styles.shell}>
      <section className={styles.chatColumn} aria-label="备课对话">
        <PrepChat courseId={courseId} hasCredential={gate.hasCredential} onCourseTouched={onCourseTouched} />
      </section>
      <section className={styles.panelColumn} aria-label="备课面板">
        <PrepPanel courseId={courseId} onSelectCourse={setCourseId} refreshKey={refreshKey} imagesAvailable={gate.imagesAvailable} />
      </section>
    </div>
  )
}

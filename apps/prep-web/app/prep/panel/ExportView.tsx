'use client'

// 导出 PPTX（页优先课程）：导出判定来自 workbench.exportReady（服务端 planProjectionExport）；最近一次导出任务给下载链接、进度或失败原因。
// 下载只走按 owner 校验的产物地址，带 name 与 token（downloadHref）；不是产物前缀的地址不给链接、不带 token（终审 M6）。有可下载的文件时每 30 秒按时钟重判是否过期（review M7）。
import { useEffect, useState } from 'react'
import { withAuthToken } from '@/lib/auth/client'
import { prepApi, newRequestId } from '../lib/api'
import { downloadHref, isArtifactUrl } from '../lib/artifact-url'
import { latestExport, type PrepJob, type PrepWorkbench } from '../lib/panel-model'
import { errorText } from '../errors'
import { downloadState } from './view-model'
import styles from '../prep.module.css'

export default function ExportView({ courseId, workbench, jobs, onChanged }: { courseId: string; workbench: PrepWorkbench; jobs: PrepJob[]; onChanged(): void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = latestExport(jobs)
  const pending = latest !== null && 'pending' in latest
  const [now, setNow] = useState(() => Date.now())
  const expiresAt = latest && 'href' in latest ? latest.expiresAt : null
  useEffect(() => {
    if (expiresAt === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [expiresAt])

  async function start() {
    if (busy) return
    setMessage(null)
    setBusy(true)
    try { await prepApi.exportPptx(courseId, newRequestId()); setMessage({ ok: true, text: '已开始导出，通常需要几十秒。' }); onChanged() } catch (e) { setMessage({ ok: false, text: errorText(e, '没有完成，请稍后重试。') }) } finally { setBusy(false) }
  }

  return (
    <div className={styles.section}>
      <strong>导出 PPTX</strong>
      {workbench.exportReady.ok ? <p className={styles.status}>共 {workbench.exportReady.pageCount} 页，文件名 {workbench.exportReady.filename}</p> : <p className={styles.status}>{workbench.exportReady.message || '这门课还不能导出。'}</p>}
      <button type="button" disabled={busy || !workbench.exportReady.ok || pending} onClick={() => void start()}>导出</button>
      {message ? <p className={message.ok ? styles.hint : styles.error}>{message.text}</p> : null}
      {latest && 'href' in latest ? (downloadState(latest, now) === 'expired'
        ? <p className={styles.status}>上次导出的文件已过期，请重新导出。</p>
        : isArtifactUrl(latest.href.split('?')[0]!)
          ? <a href={downloadHref(latest.href.split('?')[0]!, latest.filename, withAuthToken)} download={latest.filename}>下载 {latest.filename}</a>
          : <p className={styles.error}>导出结果的下载地址不对，请重新导出。</p>) : null}
      {pending ? <p className={styles.status}>导出中…</p> : null}
      {latest && 'failed' in latest ? <p className={styles.error}>上次导出没有完成：{latest.failed}</p> : null}
    </div>
  )
}

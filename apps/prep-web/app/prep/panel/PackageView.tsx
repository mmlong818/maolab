'use client'

// S4：课程包（给云一自习室）。导出 = 投 export-package 任务；当前验收版本已导出过时接口答 unchanged，不投任务。
// 版本与撤回单从 /api/prep/packages 读（新的在前）；导出任务完成（jobs 变化）后重读。下载只走产物地址（downloadHref 带 name 与 token）。
// 撤回只在备课室生效：生成撤回单，由老师交给自习室运营执行。
import { useEffect, useState } from 'react'
import { withAuthToken } from '@/lib/auth/client'
import { newRequestId, prepApi, type PrepPackage } from '../lib/api'
import { downloadHref, isArtifactUrl } from '../lib/artifact-url'
import { latestPackageJob, packageDownloadName, packageExportLabel, RECALL_CONFIRM, type PrepJob } from '../lib/panel-model'
import { errorText } from '../errors'
import styles from '../prep.module.css'

export default function PackageView({ courseId, title, ready, jobs, onChanged }: { courseId: string; title: string; ready: boolean; jobs: PrepJob[]; onChanged(): void }) {
  const [packages, setPackages] = useState<PrepPackage[]>([])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const job = latestPackageJob(jobs)
  const pending = job !== null && 'pending' in job
  const jobKey = jobs.filter((j) => j.kind === 'export-package').map((j) => `${j.jobId}:${j.status}`).join(',')

  useEffect(() => {
    let current = true
    prepApi.packages(courseId)
      .then((out) => { if (current) setPackages(out.packages) })
      .catch((e) => { if (current) setMessage({ ok: false, text: errorText(e, '课程包列表读取失败。') }) })
    return () => { current = false }
  }, [courseId, jobKey])

  async function start() {
    if (busy) return
    setMessage(null)
    setBusy(true)
    try {
      const out = await prepApi.exportPackage(courseId, newRequestId())
      if ('unchanged' in out) setMessage({ ok: true, text: `已是最新版本（第 ${out.version.version} 版），不需要重新导出。` })
      else { setMessage({ ok: true, text: '已开始导出课程包，通常需要几十秒。' }); onChanged() }
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, '没有完成，请稍后重试。') })
    } finally {
      setBusy(false)
    }
  }

  async function recall(packageId: string) {
    if (busy || !window.confirm(RECALL_CONFIRM)) return
    setMessage(null)
    setBusy(true)
    try {
      const out = await prepApi.recallPackage(packageId, newRequestId(), reason.trim() || undefined)
      setPackages((list) => list.map((p) => (p.packageId === packageId ? { ...out.package, versions: p.versions } : p)))
      setReason('')
      setMessage({ ok: true, text: '已撤回。请下载撤回单交给云一自习室的运营。' })
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, '没有撤回，请稍后重试。') })
    } finally {
      setBusy(false)
    }
  }

  const link = (url: string, name: string, label: string) =>
    isArtifactUrl(url) ? <a href={downloadHref(url, name, withAuthToken)} download={name}>{label}</a> : null

  return (
    <div className={styles.section}>
      <strong>课程包（给云一自习室）</strong>
      <p className={styles.status}>课程包是页面图和文字，交给自习室运营导入后，孩子可以按知识点找到这节课。撤回只在备课室生效，需把撤回单交给自习室运营执行。</p>
      <button className={styles.primary} type="button" disabled={busy || !ready || pending} onClick={() => void start()}>{packageExportLabel(packages)}</button>
      {pending ? <p className={styles.status}>课程包导出中…</p> : null}
      {job && 'failed' in job ? <p className={styles.error}>上次课程包导出没有完成：{job.failed}</p> : null}
      {message ? <p className={message.ok ? styles.hint : styles.error}>{message.text}</p> : null}
      {packages.map((p) => (
        <div key={p.packageId}>
          <p className={styles.status}>课程包 {p.packageId}{p.status === 'recalled' ? '（已撤回）' : ''}</p>
          <ul>
            {[...p.versions].reverse().map((v) => (
              <li key={v.version}>第 {v.version} 版 · {v.pageCount} 页 · {new Date(v.createdAt).toLocaleString()} · {link(v.url, packageDownloadName(title, v.version), '下载')}</li>
            ))}
          </ul>
          {p.status === 'active' && p.versions.length > 0 ? (
            <div>
              <input type="text" maxLength={300} placeholder="撤回原因（只给运营看，可不填）" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" disabled={busy} onClick={() => void recall(p.packageId)}>撤回</button>
            </div>
          ) : null}
          {p.status === 'recalled' && p.recallUrl ? link(p.recallUrl, `${title.trim() || '课程包'}.recall.json`, '下载撤回单') : null}
        </div>
      ))}
    </div>
  )
}

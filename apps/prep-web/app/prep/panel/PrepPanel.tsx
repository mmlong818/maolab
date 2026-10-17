'use client'

// 备课面板：课程（列表、选知识点建课）/ 计划 / 预览 / 简报 / 质量 / 验收与导出（4a 起含发布到公共库）。数据只经 /api/prep/*；产物地址统一加 token 给 <img> 用。
// 任务未结束时每 3 秒重读一次课程；对话里的 tool/done 帧经 refreshKey 触发重读。
import { useEffect, useState } from 'react'
import { withAuthToken } from '@/lib/auth/client'
import { PrepBriefView } from '@/components/mainline/workbench/PrepBriefView'
import type { PrepBrief } from '@/lib/mainline/prep-brief'
import { prepApi } from '../lib/api'
import { errorText } from '../errors'
import { viewFor } from './view-model'
import { withArtifactTokens } from '../lib/artifact-url'
import { needsPolling, type PrepJob, type PrepWorkbench } from '../lib/panel-model'
import CourseList from './CourseList'
import PlanView from './PlanView'
import PagePreview from './PagePreview'
import QualityView from './QualityView'
import AcceptanceView from './AcceptanceView'
import ExportView from './ExportView'
import RevisionView from './RevisionView'
import styles from '../prep.module.css'

type Tab = 'courses' | 'plan' | 'preview' | 'brief' | 'quality' | 'accept'
const TABS: Array<[Tab, string]> = [['courses', '课程'], ['plan', '计划'], ['preview', '预览'], ['brief', '简报'], ['quality', '质量'], ['accept', '验收与导出']]

export default function PrepPanel({ courseId, onSelectCourse, refreshKey, imagesAvailable }: { courseId: string | null; onSelectCourse(id: string): void; refreshKey: number; imagesAvailable: boolean }) {
  const [tab, setTab] = useState<Tab>('courses')
  const [data, setData] = useState<{ courseId: string; workbench: PrepWorkbench; jobs: PrepJob[] } | null>(null)
  const [brief, setBrief] = useState<{ courseId: string; brief: unknown } | null>(null)
  const [error, setError] = useState('')
  // 建修订版后切到修订版，提示跟着新课显示（RevisionView 按课程 key 挂载，切课即卸载）
  const [notice, setNotice] = useState<{ courseId: string; text: string } | null>(null)
  const [tick, setTick] = useState(0)
  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    if (!courseId) { setData(null); return }
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    prepApi.course(courseId)
      .then((r) => {
        if (!active) return
        setData({ courseId, workbench: withArtifactTokens(r.workbench, withAuthToken), jobs: withArtifactTokens(r.jobs, withAuthToken) })
        setError('')
        if (needsPolling(r.jobs)) timer = setTimeout(reload, 3000)
      })
      .catch((e: unknown) => { if (active) setError(errorText(e, '课程读取失败，请稍后重试。')) })
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [courseId, refreshKey, tick])

  useEffect(() => {
    if (tab !== 'brief' || !courseId) return
    let active = true
    prepApi.brief(courseId).then((r) => { if (active) setBrief({ courseId, brief: r.brief }) }).catch(() => { if (active) setBrief(null) })
    return () => { active = false }
  }, [tab, courseId, refreshKey])

  // 换课：清掉上一门课的数据与简报，各视图随之卸载、编辑中的状态不带到新课上
  useEffect(() => { setData(null); setError(''); setBrief(null); if (courseId && tab === 'courses') setTab('plan') }, [courseId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 换课当次渲染（effect 清空 data 之前）不用旧课程的数据（review M1）
  const view = viewFor(data, courseId)
  const briefView = viewFor(brief, courseId)

  return (
    <>
      <nav className={styles.tabs} aria-label="面板">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`} disabled={id !== 'courses' && !courseId} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice && notice.courseId === courseId ? <p className={`${styles.section} ${styles.hint}`} role="status">{notice.text}</p> : null}
      {courseId && !view && !error && tab !== 'courses' && tab !== 'brief' ? <p className={`${styles.section} ${styles.status}`} role="status">正在读取课程…</p> : null}
      {tab === 'courses' ? <CourseList onSelect={(id) => { onSelectCourse(id); setTab('plan') }} /> : null}
      {tab === 'plan' && view ? <PlanView courseId={courseId!} workbench={view.workbench} imagesAvailable={imagesAvailable} onChanged={reload} /> : null}
      {tab === 'preview' && view ? <PagePreview workbench={view.workbench} /> : null}
      {tab === 'brief' ? (briefView?.brief ? <div className={styles.section}><PrepBriefView brief={briefView.brief as PrepBrief} onSelectScene={() => setTab('preview')} /></div> : <p className={`${styles.section} ${styles.status}`}>正在读取简报…（一直没有出现时请稍后再试）</p>) : null}
      {tab === 'quality' && view ? <QualityView courseId={courseId!} workbench={view.workbench} onChanged={reload} /> : null}
      {tab === 'accept' && view ? (
        <>
          <AcceptanceView courseId={courseId!} workbench={view.workbench} onChanged={reload} />
          <ExportView courseId={courseId!} workbench={view.workbench} jobs={view.jobs} onChanged={reload} />
          <RevisionView key={courseId!} courseId={courseId!} workbench={view.workbench} onSelectCourse={(id, text) => { setNotice(text ? { courseId: id, text } : null); onSelectCourse(id); setTab('plan') }} />
        </>
      ) : null}
    </>
  )
}

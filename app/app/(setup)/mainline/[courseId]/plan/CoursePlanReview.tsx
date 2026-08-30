'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, LoaderCircle, Save } from 'lucide-react'
import type { CoursePlanningState, LessonPagePlan, PageContentSpec } from '@/lib/mainline'
import styles from './plan.module.css'

interface CoursePlanReviewProps {
  courseId: string
  topic: string
  subject: string
  gradeBand: string
  revisionNo: number
  planning: CoursePlanningState
}

interface EditablePage {
  pageId: string
  learningAction: string
  newInformation: string
}

interface ApiFailure {
  error?: unknown
  reasons?: unknown
}

export function CoursePlanReview({
  courseId,
  topic,
  subject,
  gradeBand,
  revisionNo,
  planning,
}: CoursePlanReviewProps) {
  const router = useRouter()
  const [pages, setPages] = useState<EditablePage[]>(() => planning.pages.map(page => ({
    pageId: page.id,
    learningAction: page.learningAction,
    newInformation: page.newInformation,
  })))
  const [planStatus, setPlanStatus] = useState(planning.status)
  const [busy, setBusy] = useState<'save' | 'generate' | null>(planning.status === 'generating' ? 'generate' : null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<{ message: string; reasons: string[] } | null>(null)
  const editable = planStatus === 'planning' && busy === null
  const planById = useMemo(() => new Map(planning.pages.map(page => [page.id, page])), [planning.pages])

  useEffect(() => {
    if (planStatus !== 'generating') return
    const timer = window.setInterval(() => router.refresh(), 2500)
    return () => window.clearInterval(timer)
  }, [planStatus, router])

  useEffect(() => {
    setPlanStatus(planning.status)
    if (planning.status !== 'generating') setBusy(null)
  }, [planning.status])

  function updatePage(pageId: string, field: 'learningAction' | 'newInformation', value: string) {
    setPages(current => current.map(page => page.pageId === pageId ? { ...page, [field]: value } : page))
    setSaved(false)
  }

  async function savePlan(action: 'save' | 'approve'): Promise<boolean> {
    const response = await fetch(`/api/v2/mainline/plan/${courseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, updates: pages }),
    })
    const payload = await response.json().catch(() => ({})) as ApiFailure & { planStatus?: CoursePlanningState['status'] }
    if (!response.ok) {
      setError({ message: typeof payload.error === 'string' ? payload.error : `保存失败（HTTP ${response.status}）`, reasons: [] })
      return false
    }
    if (payload.planStatus) setPlanStatus(payload.planStatus)
    setSaved(true)
    return true
  }

  async function handleSave() {
    setBusy('save')
    setError(null)
    await savePlan('save')
    setBusy(null)
  }

  async function handleGenerate() {
    setBusy('generate')
    setError(null)
    const approved = planStatus === 'plan-approved' || await savePlan('approve')
    if (!approved) {
      setBusy(null)
      return
    }

    setPlanStatus('generating')
    const response = await fetch(`/api/v2/mainline/page-content/${courseId}`, { method: 'POST' })
    const payload = await response.json().catch(() => ({})) as ApiFailure
    if (!response.ok) {
      setError({
        message: typeof payload.error === 'string' ? payload.error : `生成失败（HTTP ${response.status}）`,
        reasons: Array.isArray(payload.reasons)
          ? payload.reasons.filter((reason): reason is string => typeof reason === 'string')
          : [],
      })
      setPlanStatus('plan-approved')
      setBusy(null)
      return
    }
    router.push(`/mainline/${courseId}/prep`)
    router.refresh()
  }

  return (
    <main className={styles.root}>
      <header className={styles.topbar}>
        <Link href="/mainline" className={styles.backLink}><ArrowLeft size={17} />课程库</Link>
        <span>{subjectLabel(subject)} · {gradeBandLabel(gradeBand)} · 第 {revisionNo} 版</span>
      </header>

      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>课程结构确认</p>
          <h1>{topic}</h1>
          <p className={styles.lead}>共 {planning.pages.length} 张投影片。请按上课顺序检查，确认后生成过程不会增页、删页或交换顺序。</p>
        </div>
        <div className={styles.actions}>
          {planStatus === 'planning' && (
            <button type="button" className={styles.secondaryButton} onClick={handleSave} disabled={busy !== null}>
              {busy === 'save' ? <LoaderCircle size={17} className={styles.spinner} /> : <Save size={17} />}
              {busy === 'save' ? '保存中' : saved ? '已保存' : '保存修改'}
            </button>
          )}
          <button type="button" className={styles.primaryButton} onClick={handleGenerate} disabled={busy !== null || planStatus === 'generating'}>
            {busy === 'generate' ? <LoaderCircle size={17} className={styles.spinner} /> : <Check size={17} />}
            {busy === 'generate' ? '正在逐页生成' : planStatus === 'plan-approved' ? '继续生成投影片' : '确认并生成投影片'}
          </button>
        </div>
      </section>

      {error && (
        <section className={styles.error} role="alert">
          <strong>{error.message}</strong>
          {error.reasons.length > 0 && <ul>{error.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        </section>
      )}

      <section className={styles.sequence} aria-label="投影片顺序">
        {pages.map(editPage => {
          const page = planById.get(editPage.pageId)
          if (!page) return null
          return (
            <article key={page.id} className={styles.pageRow}>
              <div className={styles.pageNumber}>{String(page.order).padStart(2, '0')}</div>
              <div className={styles.pageBody}>
                <div className={styles.pageHeading}>
                  <div>
                    <span className={styles.purpose}>{purposeLabel(page.purpose)}</span>
                    <h2>{pageTitle(page)}</h2>
                  </div>
                  <span className={styles.visual}>{visualLabel(page)}</span>
                </div>

                <div className={styles.fields}>
                  <label>
                    <span>学生要做什么</span>
                    <textarea
                      value={editPage.learningAction}
                      onChange={event => updatePage(page.id, 'learningAction', event.target.value)}
                      disabled={!editable}
                      rows={2}
                    />
                  </label>
                  <label>
                    <span>这一页新增什么</span>
                    <textarea
                      value={editPage.newInformation}
                      onChange={event => updatePage(page.id, 'newInformation', event.target.value)}
                      disabled={!editable}
                      rows={2}
                    />
                  </label>
                </div>

                <dl className={styles.teacherInfo}>
                  {page.evidenceExpected && <><dt>完成标志</dt><dd>{page.evidenceExpected}</dd></>}
                  <dt>讲课重点</dt><dd>{page.teacherCompanion.teachingMove}</dd>
                </dl>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}

function pageTitle(page: LessonPagePlan): string {
  const spec: PageContentSpec = page.contentSpec
  switch (spec.kind) {
    case 'course-orientation': return spec.topic
    case 'course-structure': return spec.items.map(item => item.title).join(' · ')
    case 'source-material': return '完整学习材料'
    case 'observation':
    case 'explanation':
    case 'worked-step': return spec.focus
    case 'question': return spec.promptGoal
    case 'practice':
    case 'transfer': return spec.taskGoal
    case 'answer': return '核对判断、证据与修正'
    case 'feedback': return page.purpose === 'feedback' ? '核对答案并完成修正' : page.newInformation
    case 'recap': return '本课概念、证据与方法'
  }
}

function purposeLabel(purpose: LessonPagePlan['purpose']): string {
  const labels: Record<LessonPagePlan['purpose'], string> = {
    orient: '学习问题', structure: '课程结构', source: '学习材料', observe: '观察取证',
    explain: '概念讲解', question: '先行判断', answer: '核对依据', 'worked-step': '例题步骤',
    practice: '独立练习', feedback: '练习反馈', recap: '课堂总结', transfer: '迁移任务',
  }
  return labels[purpose]
}

function visualLabel(page: LessonPagePlan): string {
  if (!page.visualSpec.required) return '文字页面'
  const labels: Record<LessonPagePlan['visualSpec']['form'], string> = {
    none: '文字页面', 'source-text': '原文页面', 'instructional-image': '教学配图', diagram: '关系图',
    comparison: '对照页面', 'worked-example': '步骤演示', 'practice-space': '练习页面', summary: '总结页面',
  }
  return labels[page.visualSpec.form]
}

function subjectLabel(value: string): string {
  return ({ chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学', biology: '生物', history: '历史', politics: '道德与法治', geography: '地理', science: '科学', general: '通识' } as Record<string, string>)[value] ?? value
}

function gradeBandLabel(value: string): string {
  return ({ 'lower-primary': '小学低段', 'upper-primary': '小学高段', 'middle-school': '初中', 'high-school': '高中' } as Record<string, string>)[value] ?? value
}

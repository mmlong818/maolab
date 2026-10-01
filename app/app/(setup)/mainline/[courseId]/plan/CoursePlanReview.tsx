'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, Circle, LoaderCircle, MonitorCheck, Play, Plus, RotateCcw, Save, Split, Trash2, X } from 'lucide-react'
import type { CoursePlanningState, LessonPagePlan, PageContentSpec } from '@/lib/mainline'
import type { GenerationSession } from '@/lib/mainline/generation-session'
import styles from './plan.module.css'

interface CoursePlanReviewProps {
  courseId: string
  topic: string
  subject: string
  gradeBand: string
  revisionNo: number
  planning: CoursePlanningState
  generationSession?: GenerationSession
}

interface EditablePage {
  pageId: string
  learningAction: string
  newInformation: string
  visualReason: string
  teachingMove: string
}

interface ApiFailure {
  error?: unknown
  reasons?: unknown
}

type StructureDraft = { mode: 'insert' | 'split'; pageId: string; firstAction: string; firstInfo: string; secondAction: string; secondInfo: string }
type StructureOperation =
  | { type: 'move'; pageId: string; direction: 'up' | 'down' }
  | { type: 'delete'; pageId: string }
  | { type: 'insert-explanation'; afterPageId: string; learningAction: string; newInformation: string }
  | { type: 'split-explanation'; pageId: string; firstLearningAction: string; firstNewInformation: string; secondLearningAction: string; secondNewInformation: string }

export function CoursePlanReview({
  courseId,
  topic,
  subject,
  gradeBand,
  revisionNo,
  planning,
  generationSession: initialGenerationSession,
}: CoursePlanReviewProps) {
  const router = useRouter()
  const [pages, setPages] = useState<EditablePage[]>(() => planning.pages.map(page => ({
    pageId: page.id,
    learningAction: page.learningAction,
    newInformation: page.newInformation,
    visualReason: page.visualSpec.reason,
    teachingMove: page.teacherCompanion.teachingMove,
  })))
  const [planStatus, setPlanStatus] = useState(planning.status)
  const [busy, setBusy] = useState<'save' | 'approve' | 'structure' | 'generate' | 'render' | null>(null)
  const [generationSession, setGenerationSession] = useState(initialGenerationSession)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<{ message: string; reasons: string[] } | null>(null)
  const [structureDraft, setStructureDraft] = useState<StructureDraft | null>(null)
  const editable = planStatus === 'planning' && busy === null
  const planById = useMemo(() => new Map(planning.pages.map(page => [page.id, page])), [planning.pages])

  useEffect(() => {
    setPlanStatus(planning.status)
    setPages(planning.pages.map(page => ({
      pageId: page.id,
      learningAction: page.learningAction,
      newInformation: page.newInformation,
      visualReason: page.visualSpec.reason,
      teachingMove: page.teacherCompanion.teachingMove,
    })))
    setBusy(null)
    setGenerationSession(initialGenerationSession)
  }, [planning, initialGenerationSession])

  function updatePage(pageId: string, field: keyof Omit<EditablePage, 'pageId'>, value: string) {
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

  async function handleApprove() {
    setBusy('approve')
    setError(null)
    const approved = await savePlan('approve')
    if (!approved) {
      setBusy(null)
      return
    }
    router.refresh()
    setBusy(null)
  }

  async function generateNextPage(retryPageId?: string) {
    setBusy('generate')
    setError(null)
    try {
      if (retryPageId && generationSession) {
        const resume = await fetch(`/api/v2/mainline/generation-session/${courseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume-page', expectedUpdatedAt: generationSession.updatedAt, pageId: retryPageId }),
        })
        const resumed = await resume.json().catch(() => ({})) as ApiFailure & { session?: GenerationSession }
        if (!resume.ok || !resumed.session) throw new Error(typeof resumed.error === 'string' ? resumed.error : '无法恢复当前页面。')
        setGenerationSession(resumed.session)
      }
      const response = await fetch(`/api/v2/mainline/generation-session/${courseId}/next`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as ApiFailure & { session?: GenerationSession }
      if (!response.ok || !payload.session) throw new Error(typeof payload.error === 'string' ? payload.error : `生成失败（HTTP ${response.status}）`)
      setGenerationSession(payload.session)
      router.refresh()
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : String(cause), reasons: [] })
      const latest = await fetch(`/api/v2/mainline/generation-session/${courseId}`).then(response => response.ok ? response.json() : null).catch(() => null) as { session?: GenerationSession } | null
      if (latest?.session) setGenerationSession(latest.session)
    } finally {
      setBusy(null)
    }
  }

  async function renderNextPage() {
    setBusy('render')
    setError(null)
    try {
      const response = await fetch(`/api/v2/mainline/generation-session/${courseId}/render-next`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as ApiFailure & { session?: GenerationSession }
      if (!response.ok || !payload.session) throw new Error(typeof payload.error === 'string' ? payload.error : `画面检查失败（HTTP ${response.status}）`)
      setGenerationSession(payload.session)
      router.refresh()
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : String(cause), reasons: [] })
      const latest = await fetch(`/api/v2/mainline/generation-session/${courseId}`).then(response => response.ok ? response.json() : null).catch(() => null) as { session?: GenerationSession } | null
      if (latest?.session) setGenerationSession(latest.session)
    } finally {
      setBusy(null)
    }
  }

  async function changeStructure(operation: StructureOperation) {
    if (operation.type === 'delete' && !window.confirm('确定删除这张投影片吗？如果它属于提问与回应组合，两张会一起删除。')) return
    setBusy('structure')
    setError(null)
    if (!await savePlan('save')) {
      setBusy(null)
      return
    }
    const response = await fetch(`/api/v2/mainline/plan/${courseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'structure', operation }),
    })
    const payload = await response.json().catch(() => ({})) as ApiFailure
    if (!response.ok) {
      setError({ message: typeof payload.error === 'string' ? payload.error : `调整失败（HTTP ${response.status}）`, reasons: [] })
      setBusy(null)
      return
    }
    router.refresh()
    setStructureDraft(null)
    setBusy(null)
  }

  function openStructureDraft(mode: StructureDraft['mode'], page: LessonPagePlan) {
    setStructureDraft({
      mode, pageId: page.id,
      firstAction: mode === 'split' ? page.learningAction : '',
      firstInfo: mode === 'split' ? page.newInformation : '',
      secondAction: '', secondInfo: '',
    })
  }

  function submitStructureDraft() {
    if (!structureDraft) return
    if (structureDraft.mode === 'insert') {
      void changeStructure({ type: 'insert-explanation', afterPageId: structureDraft.pageId, learningAction: structureDraft.secondAction, newInformation: structureDraft.secondInfo })
      return
    }
    void changeStructure({
      type: 'split-explanation', pageId: structureDraft.pageId,
      firstLearningAction: structureDraft.firstAction, firstNewInformation: structureDraft.firstInfo,
      secondLearningAction: structureDraft.secondAction, secondNewInformation: structureDraft.secondInfo,
    })
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
          <p className={styles.lead}>共 {pages.length} 张投影片。请按上课顺序检查，确认后生成过程不会增页、删页或交换顺序。</p>
        </div>
        <div className={styles.actions}>
          {planStatus === 'planning' && (
            <button type="button" className={styles.secondaryButton} onClick={handleSave} disabled={busy !== null}>
              {busy === 'save' ? <LoaderCircle size={17} className={styles.spinner} /> : <Save size={17} />}
              {busy === 'save' ? '保存中' : saved ? '已保存' : '保存修改'}
            </button>
          )}
          {planStatus === 'planning' ? (
            <button type="button" className={styles.primaryButton} onClick={handleApprove} disabled={busy !== null}>
              {busy === 'approve' ? <LoaderCircle size={17} className={styles.spinner} /> : <Check size={17} />}
              {busy === 'approve' ? '确认中' : '确认课程结构'}
            </button>
          ) : <GenerationAction session={generationSession} busy={busy === 'generate' || busy === 'render'} rendering={busy === 'render'} onGenerate={generateNextPage} onRender={renderNextPage} />}
        </div>
      </section>

      {error && (
        <section className={styles.error} role="alert">
          <strong>{error.message}</strong>
          {error.reasons.length > 0 && <ul>{error.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        </section>
      )}

      {structureDraft && (
        <section className={styles.structureEditor} aria-label={structureDraft.mode === 'split' ? '拆分讲解页' : '新增讲解页'}>
          <div className={styles.structureEditorTitle}>
            <strong>{structureDraft.mode === 'split' ? '拆成两张讲解页' : '在后面新增讲解页'}</strong>
            <button type="button" aria-label="关闭" onClick={() => setStructureDraft(null)}><X size={17} /></button>
          </div>
          {structureDraft.mode === 'split' && <PlanPartFields label="第一页" action={structureDraft.firstAction} info={structureDraft.firstInfo} onAction={value => setStructureDraft({ ...structureDraft, firstAction: value })} onInfo={value => setStructureDraft({ ...structureDraft, firstInfo: value })} />}
          <PlanPartFields label={structureDraft.mode === 'split' ? '第二页' : '新页面'} action={structureDraft.secondAction} info={structureDraft.secondInfo} onAction={value => setStructureDraft({ ...structureDraft, secondAction: value })} onInfo={value => setStructureDraft({ ...structureDraft, secondInfo: value })} />
          <button type="button" className={styles.primaryButton} disabled={busy !== null || !structureDraft.secondAction.trim() || !structureDraft.secondInfo.trim()} onClick={submitStructureDraft}>{busy === 'structure' ? '保存中' : '保存结构调整'}</button>
        </section>
      )}

      <section className={styles.sequence} aria-label="投影片顺序">
        {pages.map(editPage => {
          const page = planById.get(editPage.pageId)
          const job = generationSession?.jobs.find(candidate => candidate.pageId === editPage.pageId)
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
                  <div className={styles.pageTools}>
                    {job && <PageJobStatus status={job.status} />}
                    <span className={styles.visual}>{visualLabel(page)}</span>
                    {editable && (
                      <>
                        <button type="button" title="向前移动" aria-label={`向前移动第 ${page.order} 页`} onClick={() => changeStructure({ type: 'move', pageId: page.id, direction: 'up' })} disabled={busy !== null || page.order === 1}><ArrowUp size={16} /></button>
                        <button type="button" title="向后移动" aria-label={`向后移动第 ${page.order} 页`} onClick={() => changeStructure({ type: 'move', pageId: page.id, direction: 'down' })} disabled={busy !== null || page.order === planning.pages.length}><ArrowDown size={16} /></button>
                        <button type="button" className={styles.deleteButton} title="删除此页；成对页面将一起删除" aria-label={`删除第 ${page.order} 页`} onClick={() => changeStructure({ type: 'delete', pageId: page.id })} disabled={busy !== null}><Trash2 size={16} /></button>
                        <button type="button" title="在后面新增讲解页" aria-label={`在第 ${page.order} 页后新增讲解页`} onClick={() => openStructureDraft('insert', page)} disabled={busy !== null}><Plus size={16} /></button>
                        {page.purpose === 'explain' && !page.pairId && <button type="button" title="拆成两张讲解页" aria-label={`拆分第 ${page.order} 页`} onClick={() => openStructureDraft('split', page)} disabled={busy !== null}><Split size={16} /></button>}
                      </>
                    )}
                  </div>
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
                  {page.visualSpec.required && (
                    <label>
                      <span>图像为什么存在</span>
                      <textarea
                        value={editPage.visualReason}
                        onChange={event => updatePage(page.id, 'visualReason', event.target.value)}
                        disabled={!editable}
                        rows={2}
                      />
                    </label>
                  )}
                  <label>
                    <span>老师如何推进这一页</span>
                    <textarea
                      value={editPage.teachingMove}
                      onChange={event => updatePage(page.id, 'teachingMove', event.target.value)}
                      disabled={!editable}
                      rows={2}
                    />
                  </label>
                </div>

                <dl className={styles.teacherInfo}>
                  {page.evidenceExpected && <><dt>完成标志</dt><dd>{page.evidenceExpected}</dd></>}
                  <dt>页面关系</dt><dd>{page.pairRole === 'prompt' ? '学生先作答，答案在下一张投影片出现' : page.pairRole === 'response' ? '承接上一张投影片，在学生作答后核对' : '独立投影片'}</dd>
                </dl>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}

function GenerationAction({ session, busy, rendering, onGenerate, onRender }: { session: GenerationSession | undefined; busy: boolean; rendering: boolean; onGenerate: (retryPageId?: string) => void; onRender: () => void }) {
  if (!session) return <span className={styles.approved}><AlertCircle size={17} />生成会话尚未创建</span>
  const blocked = session.jobs.find(job => job.status === 'blocked')
  if (blocked) return <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => onGenerate(blocked.pageId)}>{busy ? <LoaderCircle size={17} className={styles.spinner} /> : <RotateCcw size={17} />}重试第 {blocked.order} 页</button>
  const queued = session.jobs.find(job => job.status === 'queued')
  if (queued) return <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => onGenerate()}>{busy ? <LoaderCircle size={17} className={styles.spinner} /> : <Play size={17} />}{busy ? `正在生成第 ${queued.order} 页` : `生成第 ${queued.order} 页`}</button>
  const renderJob = session.jobs.find(job => job.status === 'content-ready')
  if (renderJob) return <button type="button" className={styles.primaryButton} disabled={busy} onClick={onRender}>{rendering ? <LoaderCircle size={17} className={styles.spinner} /> : <MonitorCheck size={17} />}{rendering ? `正在检查第 ${renderJob.order} 页` : `检查第 ${renderJob.order} 页画面`}</button>
  return <span className={styles.approved}><Check size={17} />全部投影片画面已通过</span>
}

function PageJobStatus({ status }: { status: GenerationSession['jobs'][number]['status'] }) {
  const contentReady = status === 'content-ready'
  const passed = status === 'passed'
  const blocked = status === 'blocked'
  return <span className={`${styles.jobStatus} ${passed || contentReady ? styles.jobPassed : blocked ? styles.jobBlocked : ''}`}>
    {passed ? <MonitorCheck size={14} /> : contentReady ? <Check size={14} /> : blocked ? <AlertCircle size={14} /> : status === 'running' ? <LoaderCircle size={14} className={styles.spinner} /> : <Circle size={14} />}
    {passed ? '画面检查已通过' : contentReady ? '内容通过，待检查画面' : blocked ? '需要修正' : status === 'running' ? '生成中' : '待生成'}
  </span>
}

function PlanPartFields({ label, action, info, onAction, onInfo }: { label: string; action: string; info: string; onAction: (value: string) => void; onInfo: (value: string) => void }) {
  return <div className={styles.structureFields}>
    <strong>{label}</strong>
    <label><span>学生要做什么</span><input value={action} onChange={event => onAction(event.target.value)} /></label>
    <label><span>这一页新增什么</span><input value={info} onChange={event => onInfo(event.target.value)} /></label>
  </div>
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

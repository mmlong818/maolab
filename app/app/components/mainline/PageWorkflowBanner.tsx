'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LoaderCircle, PenLine, RefreshCw, RotateCcw } from 'lucide-react'
import type { CourseRevisionStatus, GenerationSessionStatus, TeachingQualityAuditRecord } from '@/lib/mainline/client'

interface PageWorkflowBannerProps {
  courseId: string
  status: CourseRevisionStatus
  revisionNo: number
  pageCount: number
  selectedPageId?: string
  selectedPageHasImage?: boolean
  generationStatus: GenerationSessionStatus
  generationUpdatedAt: string
  acceptedPageIds: string[]
  currentPlanRevisionId: string
  currentContentRevisionId: string
  currentTeachingQualityInputHash: string
  generationCourseAuditId?: string
  teachingQualityAudit?: TeachingQualityAuditRecord
}

export function PageWorkflowBanner({
  courseId, status, revisionNo, pageCount, selectedPageId, selectedPageHasImage,
  generationStatus, generationUpdatedAt, acceptedPageIds, currentPlanRevisionId, currentContentRevisionId, currentTeachingQualityInputHash, generationCourseAuditId, teachingQualityAudit,
}: PageWorkflowBannerProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<'audit' | 'accept' | 'publish' | 'replan' | 'page' | 'image' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function callApi(endpoint: string, action: 'audit' | 'accept' | 'publish' | 'replan', body?: unknown) {
    setBusy(action)
    setError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      })
      const payload = await response.json().catch(() => ({})) as { courseId?: unknown; error?: unknown }
      if (!response.ok) {
        setError(typeof payload.error === 'string' ? payload.error : `请求失败（HTTP ${response.status}）`)
        // 阻断结果也会安全落库；刷新后让教师直接查看对应审查报告。
        router.refresh()
        setBusy(null)
        return
      }
      if (action === 'replan' && typeof payload.courseId === 'string') {
        router.push(`/mainline/${payload.courseId}/plan`)
        return
      }
      router.refresh()
      window.setTimeout(() => window.location.reload(), 250)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败，请稍后重试。')
      setBusy(null)
    }
  }

  async function regenerateCurrentPage() {
    if (!selectedPageId) return
    setBusy('page')
    setError(null)
    try {
      const response = await fetch(`/api/v2/mainline/page-content/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selectedPageId }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: unknown }
      if (!response.ok) {
        setError(typeof payload.error === 'string' ? payload.error : `请求失败（HTTP ${response.status}）`)
        setBusy(null)
        return
      }
      router.refresh()
      window.setTimeout(() => window.location.reload(), 250)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败，请稍后重试。')
      setBusy(null)
    }
  }

  async function redrawCurrentImage() {
    if (!selectedPageId || !window.confirm('重绘会替换当前投影片图片，并让本页重新进行画面检查。确定继续吗？')) return
    setBusy('image')
    setError(null)
    try {
      const response = await fetch(`/api/v2/mainline/image/${courseId}/${selectedPageId}/redraw`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as { error?: unknown }
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `请求失败（HTTP ${response.status}）`)
      router.refresh()
      window.setTimeout(() => window.location.reload(), 250)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片重绘失败，请稍后重试。')
      setBusy(null)
    }
  }

  const isReady = status === 'ready'
  const selectedAccepted = Boolean(selectedPageId && acceptedPageIds.includes(selectedPageId))
  const allAccepted = acceptedPageIds.length === pageCount
  const canEditPage = generationStatus === 'rendering' || generationStatus === 'course-audit' || generationStatus === 'awaiting-teacher-acceptance'
  const teachingAuditState = teachingAuditPresentation(teachingQualityAudit, {
    planRevisionId: currentPlanRevisionId,
    contentRevisionId: currentContentRevisionId,
    inputHash: currentTeachingQualityInputHash,
    ...(generationCourseAuditId ? { generationCourseAuditId } : {}),
    generationStatus,
  })
  const teachingSummary = teachingAuditSummary(teachingQualityAudit, teachingAuditState)
  return (
    <section style={{
      minHeight: 54,
      padding: '10px 22px',
      borderBottom: '1px solid #d9d4ca',
      background: isReady ? '#f1f7f3' : '#fbf6e9',
      color: '#25282d',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      boxSizing: 'border-box',
      fontSize: 14,
    }}>
      <span style={{ flex: 1, minWidth: 260, lineHeight: 1.5 }}>
        <strong>第 {revisionNo} 版 · {pageCount} 张投影片</strong>
        {' '}{workflowMessage(generationStatus, acceptedPageIds.length, pageCount, teachingAuditState)}
      </span>
      {teachingQualityAudit ? (
        <>
          {teachingSummary ? <div role="status">{teachingSummary}</div> : null}
          <details style={{ width: '100%', borderTop: '1px solid #d9d4ca', paddingTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
            {teachingAuditState === 'stale' ? 'AI 教学审查：过期或需重审' : teachingQualityAudit.status === 'passed' ? 'AI 审查通过（不等同教师验收）' : teachingQualityAudit.status === 'blocked' ? 'AI 教学审查发现问题' : 'AI 教学审查：依据不足'}
          </summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
            <div>标准索引（待核对）：{teachingQualityAudit.standards.map(item => item.id).join('、')}</div>
            {teachingQualityAudit.findings.length === 0 ? <div>本次审查未发现问题；该结果只代表自动审查，不替代教师逐页验收。</div> : teachingQualityAudit.findings.map(finding => (
              <article key={finding.id} style={{ borderLeft: `3px solid ${finding.severity === 'blocking' ? '#8f2f24' : finding.severity === 'warning' ? '#9a6b11' : '#54616f'}`, paddingLeft: 9 }}>
                <strong>{finding.severity} · {finding.standardId} · {finding.pageId}</strong>
                {finding.evidence ? <div>页面证据：“{finding.evidence}”</div> : null}
                <div>教学影响：{finding.impact}</div>
                <div>建议：{finding.fix}</div>
              </article>
            ))}
          </div>
          </details>
        </>
      ) : null}
      {!isReady && canEditPage && (
        selectedPageId && (
          <button type="button" onClick={regenerateCurrentPage} disabled={busy !== null} style={buttonStyle('secondary')} title="只重新生成当前投影片正文与讲稿">
            {busy === 'page' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <RefreshCw size={16} />}
            {busy === 'page' ? '正在重生成' : '重生成当前页'}
          </button>
        )
      )}
      {!isReady && canEditPage && selectedPageId && selectedPageHasImage ? (
        <>
          <button type="button" onClick={() => void redrawCurrentImage()} disabled={busy !== null} style={buttonStyle('secondary')} title="保留本页文字与讲稿，重新生成配图">
            {busy === 'image' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <RefreshCw size={16} />}
            {busy === 'image' ? '正在重绘' : '重绘图片'}
          </button>
          <button type="button" onClick={() => router.push(`/mainline/${courseId}/cowart/${selectedPageId}`)} disabled={busy !== null} style={buttonStyle('secondary')} title="标注当前投影片图片并生成修改版">
            <PenLine size={16} />
            Cowart 修改
          </button>
        </>
      ) : null}
      {generationStatus === 'course-audit' ? (
        <button type="button" onClick={() => callApi(`/api/v2/mainline/generation-session/${courseId}/audit`, 'audit')} disabled={busy !== null} style={buttonStyle('primary')}>
          {busy === 'audit' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <Check size={16} />}
          {busy === 'audit' ? '正在整课核查' : '运行整课核查'}
        </button>
      ) : null}
      {generationStatus === 'awaiting-teacher-acceptance' && selectedPageId ? (
        <button
          type="button"
          onClick={() => callApi(`/api/v2/mainline/generation-session/${courseId}/acceptance`, 'accept', { action: 'accept-page', pageId: selectedPageId, expectedUpdatedAt: generationUpdatedAt })}
          disabled={busy !== null || selectedAccepted}
          style={buttonStyle(selectedAccepted ? 'secondary' : 'primary')}
        >
          {busy === 'accept' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <Check size={16} />}
          {selectedAccepted ? '本页已验收' : busy === 'accept' ? '正在验收' : '验收当前页'}
        </button>
      ) : null}
      {generationStatus === 'awaiting-teacher-acceptance' ? (
        <button
          type="button"
          onClick={() => callApi(`/api/v2/mainline/generation-session/${courseId}/acceptance`, 'publish', { action: 'publish', expectedUpdatedAt: generationUpdatedAt })}
          disabled={busy !== null || !allAccepted}
          style={buttonStyle('primary')}
          title={allAccepted ? '发布为当前课堂版本' : '全部投影片逐页验收后才能发布'}
        >
          {busy === 'publish' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <Check size={16} />}
          {busy === 'publish' ? '正在发布' : `发布课堂版本（${acceptedPageIds.length}/${pageCount}）`}
        </button>
      ) : null}
      <button type="button" onClick={() => callApi(`/api/v2/mainline/revisions/${courseId}`, 'replan')} disabled={busy !== null} style={buttonStyle('secondary')}>
        {busy === 'replan' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <RotateCcw size={16} />}
        {busy === 'replan' ? '正在创建新版本' : '退回规划'}
      </button>
      {error && <div role="alert" style={{ width: '100%', color: '#8f2f24', fontSize: 13 }}>{error}</div>}
      <style jsx>{`
        :global(.page-workflow-spinner) { animation: page-workflow-spin .9s linear infinite; }
        @keyframes page-workflow-spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  )
}

export type TeachingAuditState = 'none' | 'current' | 'stale'

function workflowMessage(status: GenerationSessionStatus, accepted: number, total: number, teachingAuditState: TeachingAuditState): string {
  if (teachingAuditState === 'stale') return '自动教学审查记录已过期或无法与当前版本核对；不得按通过结论继续。'
  if (status === 'ready') return '已通过机器门禁和教师验收，现为课堂版本。'
  if (status === 'course-audit') return '全部投影片画面已通过，请运行整课事实与一致性核查。'
  if (status === 'awaiting-teacher-acceptance') return `整课机器核查已通过，请逐页验收（${accepted}/${total}）。`
  if (status === 'rendering') return '正文已通过，请逐页检查真实课堂画面。'
  if (status === 'generating') return '正在按确认结构逐页生成正文。'
  return '当前版本尚未完成，请根据页面状态处理。'
}

export function teachingAuditPresentation(
  audit: TeachingQualityAuditRecord | undefined,
  current: { planRevisionId: string; contentRevisionId: string; inputHash: string; generationCourseAuditId?: string; generationStatus: GenerationSessionStatus },
): TeachingAuditState {
  if (!audit) return 'none'
  const matchesCurrentAudit = Boolean(current.generationCourseAuditId)
    && audit.planRevisionId === current.planRevisionId
    && audit.contentRevisionId === current.contentRevisionId
    && audit.generationCourseAuditId === current.generationCourseAuditId
    && Boolean(audit.inputHash)
    && audit.inputHash === current.inputHash
    && (current.generationStatus === 'awaiting-teacher-acceptance' || current.generationStatus === 'ready' || audit.status !== 'passed')
  return matchesCurrentAudit ? 'current' : 'stale'
}

function teachingAuditSummary(audit: TeachingQualityAuditRecord | undefined, state: TeachingAuditState): string | undefined {
  if (!audit || (state === 'current' && audit.status === 'passed')) return undefined
  if (state === 'stale') {
    const slide = audit.findings[0]?.pageId
    return `自动教学审查：过期或需重审。原因：审查记录未能与当前计划、正文和整课审计版本精确匹配。${slide ? ` 受影响投影片：${slide}。` : ''}`
  }
  const blocking = audit.findings.filter(finding => finding.severity === 'blocking').length
  const insufficient = audit.findings.filter(finding => finding.severity === 'insufficient-evidence').length
  const warning = audit.findings.filter(finding => finding.severity === 'warning').length
  const first = audit.findings[0]
  return `自动教学审查未通过：阻断 ${blocking} 项，依据不足 ${insufficient} 项${warning ? `，警告 ${warning} 项` : ''}。原因：${first?.impact ?? '审查未返回可显示的原因。'}${first ? ` 受影响投影片：${first.pageId}。` : ''}`
}

function buttonStyle(kind: 'primary' | 'secondary'): React.CSSProperties {
  const primary = kind === 'primary'
  return {
    minHeight: 36,
    padding: '0 13px',
    borderRadius: 7,
    border: primary ? '1px solid #1f4d37' : '1px solid #b8b1a4',
    background: primary ? '#1f4d37' : '#fff',
    color: primary ? '#fff' : '#4d5158',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
    fontWeight: 750,
    cursor: 'pointer',
  }
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import type { CourseRevisionStatus } from '@/lib/mainline'

interface PageWorkflowBannerProps {
  courseId: string
  status: CourseRevisionStatus
  revisionNo: number
  pageCount: number
  selectedPageId?: string
}

export function PageWorkflowBanner({ courseId, status, revisionNo, pageCount, selectedPageId }: PageWorkflowBannerProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<'ready' | 'replan' | 'page' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function callApi(endpoint: string, action: 'ready' | 'replan') {
    setBusy(action)
    setError(null)
    try {
      const response = await fetch(endpoint, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as { courseId?: unknown; error?: unknown }
      if (!response.ok) {
        setError(typeof payload.error === 'string' ? payload.error : `请求失败（HTTP ${response.status}）`)
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

  const isReady = status === 'ready'
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
        {' '}{isReady ? '已设为当前课堂版本。' : '已按确认结构生成，请逐页检查画面和讲稿。'}
      </span>
      {!isReady && (
        selectedPageId && (
          <button type="button" onClick={regenerateCurrentPage} disabled={busy !== null} style={buttonStyle('secondary')} title="只重新生成当前投影片正文与讲稿">
            {busy === 'page' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <RefreshCw size={16} />}
            {busy === 'page' ? '正在重生成' : '重生成当前页'}
          </button>
        )
      )}
      {!isReady && (
        <button type="button" onClick={() => callApi(`/api/v2/mainline/page-content/${courseId}/ready`, 'ready')} disabled={busy !== null} style={buttonStyle('primary')}>
          {busy === 'ready' ? <LoaderCircle size={16} className="page-workflow-spinner" /> : <Check size={16} />}
          {busy === 'ready' ? '确认中' : '设为课堂版本'}
        </button>
      )}
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

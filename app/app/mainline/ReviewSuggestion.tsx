'use client'

/**
 * v4 M3 复习建议卡:课程库顶部展示薄弱 KP(掌握度低于阈值),
 * 一键用它们生成复习课——生成时 from-kps 会按学情自动加固骨架(幕数加权)。
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CalendarClock, RotateCcw } from 'lucide-react'
import type { MasteryEvidenceStatus } from '@/lib/mainline/mastery'

export interface WeakKpItem {
  kpId: string
  canonicalName: string
  score: number
  reviewIntervalDays: number
  reviewDueAt: number
  reviewDue: boolean
  daysUntilReview: number
  overdueDays: number
  evidenceStatus: MasteryEvidenceStatus
}

export function ReviewSuggestion({ weakKps }: { weakKps: WeakKpItem[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (weakKps.length === 0) return null
  const actionable = weakKps.filter(item => isActionableEvidence(item.evidenceStatus))
  const excluded = weakKps.filter(item => !isActionableEvidence(item.evidenceStatus))
  const due = actionable.filter(item => item.reviewDue)
  const upcoming = actionable.filter(item => !item.reviewDue)
  const picked = due.slice(0, 4)
  const visible = (due.length > 0 ? due : upcoming.length > 0 ? upcoming : excluded).slice(0, 4)

  async function launch() {
    if (picked.length === 0) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/v2/mainline/from-kps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpIds: picked.map(k => k.kpId), lessonPhase: 'review' }),
      })
      const data = await res.json()
      if (!res.ok || !data.courseId) throw new Error(data.error ?? String(res.status))
      router.push(`/mainline/${data.courseId}/prep`)
    } catch (err) {
      setError(`生成失败:${String(err)}`)
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 20, padding: '18px 22px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
            <CalendarClock size={17} aria-hidden="true" />
            {due.length > 0
              ? `到期复习 · ${due.length} 个知识点`
              : upcoming.length > 0
                ? `复习安排 · ${upcoming.length} 个知识点待巩固`
                : `学情来源待确认 · ${excluded.length} 个知识点`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {visible.map(k => (
              <span key={k.kpId} style={{ fontSize: 13, padding: '4px 10px', background: '#fef3c7', color: '#78350f', borderRadius: 999 }}>
                {k.canonicalName} · {masteryValueLabel(k)}
                {isActionableEvidence(k.evidenceStatus) ? ` · ${reviewTimingLabel(k)}` : ''}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.5, color: '#9a5b12' }}>
            {due.length > 0
              ? '先闭卷提取，再核对纠错；不会把刚做错的内容立刻原样重复。'
              : upcoming.length > 0
                ? '现在先间隔一下，避免短时记忆造成“已经掌握”的错觉。'
                : '演示种子和来源不明的历史分数只作披露，不会自动生成复习课或改变正式课程结构。'}
          </div>
        </div>
        <button
          type="button"
          onClick={launch}
          disabled={busy || picked.length === 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: busy || picked.length === 0 ? '#d1d5db' : '#b45309', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: busy || picked.length === 0 ? 'default' : 'pointer' }}
        >
          <RotateCcw size={16} aria-hidden="true" />
          {busy ? '生成中…' : actionable.length === 0 ? '无可用学情' : picked.length === 0 ? '尚未到期' : '生成到期复习课'}
        </button>
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 13, color: '#b91c1c' }}>{error}</div>}
    </div>
  )
}

function isActionableEvidence(status: MasteryEvidenceStatus): boolean {
  return status === 'verified' || status === 'provisional-self-assessment'
}

function masteryValueLabel(item: WeakKpItem): string {
  const percent = `${Math.round(item.score * 100)}%`
  if (item.evidenceStatus === 'verified') return `已验证掌握度 ${percent}`
  if (item.evidenceStatus === 'provisional-self-assessment') return `暂定自评 ${percent}`
  if (item.evidenceStatus === 'seeded-demo') return `演示种子 ${percent} · 非学生作答`
  return `历史分数 ${percent} · 来源未确认`
}

function reviewTimingLabel(item: WeakKpItem): string {
  if (!item.reviewDue) return `${item.daysUntilReview} 天后复习`
  if (item.overdueDays > 0) return `已到期 ${item.overdueDays} 天`
  return '今天到期'
}

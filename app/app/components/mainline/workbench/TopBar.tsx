'use client'

/** TopBar · 备课修正节点顶栏:课程状态、排练、导出与开始上课。 */
import Link from 'next/link'
import { useState } from 'react'
import { Clapperboard, LoaderCircle, Play } from 'lucide-react'
import { courseDisplayTitle, courseReleaseReason, type CourseReleaseReadiness, type MainlineCourse } from '@/lib/mainline'

interface TopBarProps {
  course: MainlineCourse
  readiness: CourseReleaseReadiness
}

export function TopBar({ course, readiness }: TopBarProps) {
  const reason = courseReleaseReason(readiness)
  // 截图型导出逐页渲染真实课件,一门课约 40-90 秒——没有进行中反馈教师会以为
  // 点击失败。fetch 到 blob 再触发保存,期间按钮禁用并显示进度文案。
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | undefined>(undefined)

  async function exportPptx() {
    if (!readiness.ready || exporting) return
    setExporting(true)
    setExportError(undefined)
    try {
      const res = await fetch(`/api/v2/mainline/export/${course.id}`)
      if (!res.ok) {
        const body = await res.json().catch(() => undefined) as { error?: string; reason?: string } | undefined
        throw new Error(body?.reason ?? body?.error ?? `导出失败(${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${courseDisplayTitle(course).replace(/[\\/:*?"<>|]/g, '')}.pptx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : '导出失败,请重试')
    } finally {
      setExporting(false)
    }
  }

  return (
    <header
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px',
        borderBottom: '1px solid #e5e7eb', background: '#fff',
      }}
    >
      <Link href="/mainline" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none', flex: 'none' }}>
        ← 课程库
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#8a4b2a', whiteSpace: 'nowrap' }}>
          备课修正
        </span>
        <span aria-hidden="true" style={{ width: 1, height: 18, background: '#e5e7eb' }} />
        <span style={{ minWidth: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>
          {courseDisplayTitle(course)}
        </span>
        <StatusBadge readiness={readiness} />
      </div>
      {readiness.ready ? (
        <Link href={'/mainline/' + course.id + '/rehearse'} style={pillStyle(true)}>
          <Clapperboard size={15} aria-hidden />
          排练
        </Link>
      ) : (
        <span title={reason} style={pillStyle(false)}>
          <Clapperboard size={15} aria-hidden />
          排练
        </span>
      )}
      <button
        type="button"
        disabled={!readiness.ready || exporting}
        title={!readiness.ready ? reason : exportError ?? (exporting ? '正在逐页渲染课件画面,一门课约一分钟' : undefined)}
        style={{ ...pillStyle(readiness.ready && !exporting), border: 'none', cursor: readiness.ready && !exporting ? 'pointer' : 'not-allowed' }}
        onClick={() => void exportPptx()}
      >
        {exporting && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {exporting ? '正在导出…' : exportError ? '导出失败,点此重试' : '导出 PPTX'}
      </button>
      {readiness.ready ? (
        <Link href={`/mainline/${course.id}`} style={primaryPillStyle(true)}>
          <Play size={15} fill="currentColor" aria-hidden />
          开始上课
        </Link>
      ) : (
        <span title={reason} style={primaryPillStyle(false)}>
          <Play size={15} aria-hidden />
          开始上课
        </span>
      )}
    </header>
  )
}

function StatusBadge({ readiness }: { readiness: CourseReleaseReadiness }) {
  const [label, bg, fg] = readiness.status === 'blocked'
    ? [readiness.stalePassed ? `需复检 · ${readiness.blockingCount} 阻断` : `阻断 · ${readiness.blockingCount}`, '#fef2f2', '#991b1b']
    : readiness.status === 'draft'
      ? ['骨架 · 待填内容', '#fff7ed', '#9a3412']
      : readiness.warningCount > 0
        ? [`就绪 · ${readiness.warningCount} 警告`, '#fef9c3', '#854d0e']
        : ['就绪', '#ecfdf5', '#065f46']
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap', flex: 'none' }}>
      {label}
    </span>
  )
}

function pillStyle(enabled: boolean) {
  return {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db',
    background: enabled ? '#fff' : '#f9fafb', color: enabled ? '#374151' : '#9ca3af',
    fontSize: 13, fontWeight: 600, textDecoration: 'none', flex: 'none' as const,
    display: 'flex', alignItems: 'center', gap: 7,
    cursor: enabled ? 'pointer' : 'not-allowed',
  }
}

function primaryPillStyle(enabled: boolean) {
  return {
    padding: '8px 18px', borderRadius: 8, border: '1px solid #111827',
    background: enabled ? '#111827' : '#e5e7eb', color: enabled ? '#fff' : '#9ca3af',
    fontSize: 13, fontWeight: 700, textDecoration: 'none', flex: 'none' as const,
    display: 'flex', alignItems: 'center', gap: 7,
    cursor: enabled ? 'pointer' : 'not-allowed',
  }
}

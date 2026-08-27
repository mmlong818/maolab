'use client'

/**
 * TryoutPanel · AI 试学(票4,DeepTutor TutorBench 借鉴):LLM 扮演本学段学生把整课
 * 上一遍,报告卡壳点(看不懂/题目歧义/讲稿跳跃/衔接断层/信息缺失)。
 * 报告是备课排查线索,不评分、不改变质量闸门结果;每条可点击跳到对应投影片。
 */
import { GraduationCap, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { lessonPresentationPages, type MainlineCourse } from '@/lib/mainline'
import type { TryoutReport } from '@/lib/mainline/tryout'

const KIND_COLORS: Record<string, string> = {
  '看不懂': '#b42318',
  '题目歧义': '#b54708',
  '讲稿跳跃': '#b54708',
  '衔接断层': '#175cd3',
  '信息缺失': '#b42318',
}

export function TryoutPanel({ course, onSelectScene }: {
  course: MainlineCourse
  onSelectScene: (sceneId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<TryoutReport | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  async function run() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch(`/api/v2/mainline/tryout/${course.id}`, { method: 'POST' })
      const data = await res.json() as { report?: TryoutReport; error?: string }
      if (!res.ok || !data.report) throw new Error(data.error ?? `试学失败(${res.status})`)
      setReport(data.report)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '试学失败,请重试')
    } finally {
      setBusy(false)
    }
  }

  function jumpTo(pageNo: number) {
    const page = lessonPresentationPages(course)[pageNo - 1]
    if (page) onSelectScene(page.id)
  }

  return (
    <div style={{ margin: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #d0d5dd', background: '#f8fafc', fontSize: 13, color: '#344054' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <GraduationCap size={15} aria-hidden />
          AI 试学
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          style={{ border: '1px solid #d0d5dd', borderRadius: 6, background: '#fff', padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          {busy && <LoaderCircle size={13} className="animate-spin" aria-hidden />}
          {busy ? '学生试学中…' : report ? '再试一遍' : '让 AI 学生上一遍'}
        </button>
      </div>
      <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 12 }}>
        AI 扮演本学段学生把整课上一遍,报告卡壳点。只是排查线索,不影响质量闸门。
      </p>
      {error && <p style={{ margin: '8px 0 0', color: '#b42318' }}>{error}</p>}
      {report && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{report.overall}</p>
          <p style={{ margin: '6px 0 0', color: '#067647', fontSize: 12 }}>
            学生觉得最清楚的一页:第 {report.clearestPageNo} 页
          </p>
          {report.issues.length === 0
            ? <p style={{ margin: '8px 0 0', color: '#067647' }}>全程无卡壳点。</p>
            : report.issues.map((issue, index) => (
              <button
                key={`${issue.pageNo}-${index}`}
                type="button"
                onClick={() => jumpTo(issue.pageNo)}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12.5, lineHeight: 1.55 }}
              >
                <span style={{ fontWeight: 700, color: KIND_COLORS[issue.kind] ?? '#344054' }}>
                  第 {issue.pageNo} 页 · {issue.kind}
                </span>
                <span style={{ display: 'block', color: '#475467', marginTop: 2 }}>{issue.detail}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

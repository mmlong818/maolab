import Link from 'next/link'
import { ClipboardPenLine, Download, FileCheck2, Play } from 'lucide-react'
import { listMainlineCourses } from '../lib/mainline/store.js'
import { listWeakKps } from '../lib/mainline/mastery-store.js'
import { auditCourseReleaseReadiness, courseDisplayTitle } from '../lib/mainline/index.js'
import { courseHasCompleteTeachingVisuals } from '../lib/mainline/presentation/visual-readiness.js'
import { ReviewSuggestion } from './ReviewSuggestion.js'

export const dynamic = 'force-dynamic'

export default async function MainlineCoursesPage() {
  const listed = await listMainlineCourses()
  const weakKps = await listWeakKps()

  // 课程库首先服务于进入和备课，不把内部审计状态当作课程价值排序。
  const enriched = listed.filter(({ course }) => !course.revision?.supersededByCourseId).map(({ course: c, createdAt }) => {
    const readiness = auditCourseReleaseReadiness(c)
    const hasTeachingVisuals = courseHasCompleteTeachingVisuals(c)
    return { c, readiness, hasTeachingVisuals, createdAt }
  })
  enriched.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

  return (
    <main style={{ minHeight: '100vh', background: '#fafaf7', boxSizing: 'border-box' }}>
      <header style={{ padding: '20px 48px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ fontSize: 15, color: '#6b7280', textDecoration: 'none' }}>← 首页</Link>
        <div style={{ fontSize: 13, color: '#9ca3af', letterSpacing: '0.06em' }}>MAINLINE · 课程库</div>
      </header>

      <section style={{ maxWidth: 960, margin: '32px auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>课程库</h1>
            <p style={{ color: '#6b7280', fontSize: 15 }}>共 {enriched.length} 门，选择课程后可进入备课检查</p>
          </div>
          <Link
            href="/mainline/create"
            style={{ padding: '10px 20px', background: '#111827', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
          >
            + 做新课
          </Link>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 22, color: '#6b7280', fontSize: 13 }}>
          <WorkflowStep index="1" label="选择内容" />
          <span aria-hidden="true" style={{ color: '#c6c2b9' }}>→</span>
          <WorkflowStep index="2" label="确认结构" active />
          <span aria-hidden="true" style={{ color: '#c6c2b9' }}>→</span>
          <WorkflowStep index="3" label="备课检查" />
          <span aria-hidden="true" style={{ color: '#c6c2b9' }}>→</span>
          <WorkflowStep index="4" label="开始上课" />
        </div>

        <ReviewSuggestion weakKps={weakKps} />

        {enriched.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', border: '1px dashed #d1d5db', borderRadius: 12, color: '#6b7280' }}>
            还没有课程,点右上角<b>做新课</b>开始。
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {enriched.map(({ c, readiness, hasTeachingVisuals, createdAt }) => {
              const planPending = c.planning && ['planning', 'plan-approved', 'generating'].includes(c.planning.status)
              const primaryHref = planPending ? `/mainline/${c.id}/plan` : `/mainline/${c.id}/prep`
              return (
              <div
                key={c.id}
                style={{
                  position: 'relative',
                  padding: '20px 22px',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  transition: 'border-color .15s, box-shadow .15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8, alignItems: 'flex-start' }}>
                  <Link href={primaryHref} style={{ minWidth: 0, color: '#111827', textDecoration: 'none' }}>
                    <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>
                      {c.season && (
                        <span style={{ marginRight: 8, fontSize: 12, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: '#3730a3', verticalAlign: '2px', letterSpacing: '0.04em' }}>
                          E{String(c.season.episodeNo).padStart(2, '0')}
                        </span>
                      )}
                      {courseDisplayTitle(c)}
                      {c.revision && <span style={{ marginLeft: 8, color: '#8a8176', fontSize: 12, fontWeight: 650 }}>第 {c.revision.revisionNo} 版</span>}
                    </div>
                  </Link>
                  <StatusBadge readiness={readiness} hasTeachingVisuals={hasTeachingVisuals} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#6b7280', flexWrap: 'wrap' }}>
                    <span>{gradeBandLabel(c.gradeBand)} · {subjectLabel(c.subject)}</span>
                    <span>·</span>
                    <span>{c.planning ? `${c.planning.pages.length} 张投影片` : `${c.scenes.length} 幕 / ${c.beats.length} 节拍`}</span>
                    {createdAt && (
                      <>
                        <span>·</span>
                        <span>{formatCreatedAt(createdAt)}</span>
                      </>
                    )}
                    {readiness.status === 'blocked' && <span style={{ color: '#9a6b21' }}>· 备课检查待完成</span>}
                    {readiness.status === 'passed' && readiness.warningCount > 0 && <span>· 有备课建议</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0eee9' }}>
                  {planPending ? (
                    <Link href={primaryHref} style={courseActionStyle('prep')}>
                      <FileCheck2 size={15} aria-hidden="true" />
                      {c.planning?.status === 'planning' ? '确认结构' : c.planning?.status === 'generating' ? '查看生成状态' : '继续生成'}
                    </Link>
                  ) : (
                    <Link href={primaryHref} style={courseActionStyle('prep')}>
                      <ClipboardPenLine size={15} aria-hidden="true" />
                      备课检查
                    </Link>
                  )}
                  {readiness.ready ? (
                    <Link href={`/mainline/${c.id}`} style={courseActionStyle('classroom')}>
                      <Play size={15} fill="currentColor" aria-hidden="true" />
                      开始上课
                    </Link>
                  ) : (
                    <span title="请先在备课中解决阻断问题" style={courseActionStyle('disabled')}>
                      <Play size={15} aria-hidden="true" />
                      开始上课
                    </span>
                  )}
                  {readiness.ready && (
                    <a href={`/api/v2/mainline/export/${c.id}`} style={courseActionStyle('export')}>
                      <Download size={15} aria-hidden="true" />
                      导出
                    </a>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function WorkflowStep({ index, label, active = false }: { index: string; label: string; active?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: active ? '#7a3f24' : '#6b7280', fontWeight: active ? 800 : 600 }}>
      <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: active ? '#8a4b2a' : '#ebe8e1', color: active ? '#fff' : '#5f636b', fontSize: 11 }}>
        {index}
      </span>
      {label}
    </span>
  )
}

function courseActionStyle(kind: 'prep' | 'classroom' | 'disabled' | 'export'): React.CSSProperties {
  const isDisabled = kind === 'disabled'
  const isClassroom = kind === 'classroom'
  const isPrep = kind === 'prep'
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    minHeight: 36, padding: '0 13px', borderRadius: 7,
    border: isClassroom ? '1px solid #17191d' : isPrep ? '1px solid #b8a99c' : '1px solid #e1ded7',
    background: isClassroom ? '#17191d' : isDisabled ? '#f3f2ef' : '#fff',
    color: isClassroom ? '#fff' : isDisabled ? '#a1a1a1' : isPrep ? '#6f3b24' : '#60646c',
    fontSize: 13, fontWeight: 700, textDecoration: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
  }
}

function StatusBadge({
  readiness, hasTeachingVisuals,
}: { readiness: ReturnType<typeof auditCourseReleaseReadiness>; hasTeachingVisuals: boolean }) {
  const workflowLabel = readiness.workflowStatus === 'planning'
    ? '待确认结构'
    : readiness.workflowStatus === 'plan-approved'
      ? '待生成投影片'
      : readiness.workflowStatus === 'generating'
        ? '正在生成'
        : readiness.workflowStatus === 'review'
          ? '待备课检查'
          : undefined
  const [label, bg, fg] = workflowLabel
    ? [workflowLabel, '#eef2ff', '#3730a3']
    : readiness.status === 'blocked'
    ? ['待备课检查', '#fff7ed', '#9a3412']
    : readiness.status === 'draft'
      ? ['骨架 · 待填内容', '#fff7ed', '#9a3412']
      : readiness.workflowStatus === 'ready' || hasTeachingVisuals
        ? ['就绪 · 画面完整', '#ecfdf5', '#065f46']
        : ['就绪 · 缺少画面', '#fef9c3', '#854d0e']
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function formatCreatedAt(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} 生成`
}

function gradeBandLabel(g: string): string {
  if (g === 'lower-primary') return '小学低段'
  if (g === 'upper-primary') return '小学高段'
  if (g === 'middle-school') return '初中'
  if (g === 'high-school') return '高中'
  return g
}

function subjectLabel(s: string): string {
  const map: Record<string, string> = {
    chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学',
    biology: '生物', history: '历史', politics: '道德与法治', geography: '地理', science: '科学', general: '通识',
  }
  return map[s] ?? s
}

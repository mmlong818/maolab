'use client'

/** StructureTree · 左栏课程结构树(v5 M1 WP2):片段分组,幕为行,点击联动中右栏。 */
import { useMemo } from 'react'
import { BookOpenText } from 'lucide-react'
import { courseDisplayScene, lessonPresentationPages, presentationScene, sceneDisplayTitle, type MainlineCourse, type QualityIssue } from '@/lib/mainline'

interface StructureTreeProps {
  course: MainlineCourse
  issues: QualityIssue[]
  fragmentLabels: Record<string, string>
  selectedPageId: string | undefined
  onSelectOverview: () => void
  onSelectPage: (pageId: string) => void
}

export function StructureTree({ course, issues, fragmentLabels, selectedPageId, onSelectOverview, onSelectPage }: StructureTreeProps) {
  const presentationPages = lessonPresentationPages(course)
  const imageCount = presentationPages.filter(page => presentationScene(page).imageUrl).length
  const pageNumberById = useMemo(
    () => new Map(presentationPages.map((page, index) => [page.id, index + 1])),
    [presentationPages],
  )
  const sceneStatus = useMemo(() => {
    const map = new Map<string, { blocking: number; warning: number }>()
    for (const issue of issues) {
      if (issue.targetType !== 'scene') continue
      const entry = map.get(issue.targetId) ?? { blocking: 0, warning: 0 }
      if (issue.severity === 'blocking') entry.blocking += 1
      else if (issue.severity === 'warning') entry.warning += 1
      map.set(issue.targetId, entry)
    }
    return map
  }, [issues])

  const scenesById = useMemo(() => new Map(course.scenes.map(s => [s.id, s])), [course.scenes])

  return (
    <nav
      style={{
        width: 260, flex: 'none', overflowY: 'auto', background: '#fff',
        borderRight: '1px solid #e5e7eb', padding: '16px 12px',
      }}
      aria-label="课程结构树"
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#9ca3af', padding: '0 8px 10px' }}>
        课程结构
      </div>
      <button
        type="button"
        onClick={onSelectOverview}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          padding: '9px 10px', marginBottom: 12, borderRadius: 8, border: 'none',
          background: selectedPageId === undefined ? '#111827' : '#f3f4f6',
          color: selectedPageId === undefined ? '#fff' : '#374151', cursor: 'pointer',
          fontSize: 13.5, fontWeight: 700,
        }}
      >
        <BookOpenText size={16} aria-hidden="true" />
        <span>全课内容</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.72 }}>{presentationPages.length} 页 · {imageCount} 图</span>
      </button>
      {course.learningFragments.map(fragment => {
        const label = fragmentLabels[fragment.id] ?? '课级片段'
        const fragmentPages = presentationPages.filter(page => fragment.sceneIds.includes(page.sourceSceneId))
        return (
          <div key={fragment.id} style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '6px 8px',
                textTransform: 'none',
              }}
            >
              {label}
            </div>
            {fragmentPages.map(page => {
              const scene = scenesById.get(page.sourceSceneId)
              if (!scene) return null
              const status = sceneStatus.get(page.sourceSceneId)
              const selected = page.id === selectedPageId
              const displayScene = courseDisplayScene(course, presentationScene(page))
              const title = sceneDisplayTitle(course, displayScene)
              const stageLabel = page.stageLabel === title ? undefined : page.stageLabel
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => onSelectPage(page.id)}
                  title={`第 ${pageNumberById.get(page.id)} 页 · ${title}${stageLabel ? ` · ${stageLabel}` : ''}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: selected ? '#111827' : 'transparent',
                    color: selected ? '#fff' : '#374151',
                    cursor: 'pointer', fontSize: 13, marginBottom: 2,
                  }}
                >
                  <Dot blocking={status?.blocking ?? 0} warning={status?.warning ?? 0} selected={selected} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {String(pageNumberById.get(page.id)).padStart(2, '0')} · {title}
                    </span>
                    {stageLabel ? (
                      <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, opacity: 0.7 }}>
                        {stageLabel}
                      </span>
                    ) : null}
                  </span>
                  {!page.derived && scene.editedByTeacher && (
                    <span
                      title="老师已手改本幕内容"
                      style={{ fontSize: 11, color: selected ? '#f0c978' : '#b45309', flex: 'none' }}
                    >
                      ✎
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
      {course.learningFragments.length === 0 && (
        <div style={{ padding: 12, fontSize: 13, color: '#9ca3af' }}>这门课还没有任何学习片段。</div>
      )}
    </nav>
  )
}

function Dot({ blocking, warning, selected }: { blocking: number; warning: number; selected: boolean }) {
  const color = blocking > 0 ? '#dc2626' : warning > 0 ? '#d97706' : selected ? '#4b5563' : '#d1d5db'
  return (
    <span
      style={{
        width: 8, height: 8, borderRadius: '50%', background: color, flex: 'none',
      }}
      aria-hidden
    />
  )
}

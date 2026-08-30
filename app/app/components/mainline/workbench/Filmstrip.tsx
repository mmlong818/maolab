'use client'

/**
 * Filmstrip · 中栏底部幕缩略时间轴(v5 M1 WP2,设计规格「B 导演分镜台」嫁接项)
 *
 * 不是装饰:承担跨幕导航(点击跳幕)+ 版式轮换一览(有配图的幕显示缩略图,
 * 没配图的幕显示 sceneType 色块)——一眼看出这节课的画面节奏是否单一。
 */
import { useMemo } from 'react'
import { courseDisplayScene, lessonPresentationPages, presentationScene, sceneDisplayTitle, type MainlineCourse, type QualityIssue } from '@/lib/mainline'
import { PreviewStage } from './PreviewStage'

interface FilmstripProps {
  course: MainlineCourse
  issues: QualityIssue[]
  selectedPageId: string | undefined
  onSelect: (pageId: string) => void
}

export function Filmstrip({ course, issues, selectedPageId, onSelect }: FilmstripProps) {
  const pages = lessonPresentationPages(course)
  const blockedSceneIds = useMemo(
    () => new Set(issues.filter(i => i.targetType === 'scene' && i.severity === 'blocking').map(i => i.targetId)),
    [issues],
  )

  return (
    <div
      style={{
        flex: 'none', display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 4px',
        borderTop: '1px solid #e5e7eb',
      }}
      aria-label="投影片缩略时间轴"
    >
      {pages.map((page, index) => {
        const scene = courseDisplayScene(course, presentationScene(page))
        const title = sceneDisplayTitle(course, scene)
        const selected = page.id === selectedPageId
        const blocked = blockedSceneIds.has(page.sourceSceneId)
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelect(page.id)}
            title={`${index + 1}. ${title}${page.stageLabel && page.stageLabel !== title ? ` · ${page.stageLabel}` : ''}`}
            style={{
              flex: 'none', width: 112, height: 64, borderRadius: 8, cursor: 'pointer',
              border: selected ? '2px solid #111827' : blocked ? '2px solid #fca5a5' : '1px solid #e5e7eb',
              padding: 0, overflow: 'hidden', position: 'relative', background: '#f3f4f6',
            }}
          >
            <PreviewStage
              course={course}
              scene={scene}
              pageNumber={index + 1}
              showAnnotations={false}
              forceFeedbackRevealed={page.feedbackRevealed}
            />
            <span
              style={{
                position: 'absolute', left: 4, top: 3, fontSize: 10, fontWeight: 700,
                color: '#111827', background: 'rgba(255,255,255,0.8)', borderRadius: 4, padding: '0 4px',
              }}
            >
              {index + 1}
            </span>
          </button>
        )
      })}
    </div>
  )
}

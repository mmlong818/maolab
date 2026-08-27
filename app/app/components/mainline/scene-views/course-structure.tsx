'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { COURSE_STRUCTURE_START_SLOT, COURSE_STRUCTURE_SUMMARY_SLOT, courseStructureItemsFromScene } from '@/lib/mainline'
import { fitType, projectionFontSize, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { toRgba } from '@/lib/mainline/presentation/color'
import { subjectLabel } from '../workbench/labels'

export function CourseStructureSlideView({
  course,
  scene,
  pres,
  sceneNumber,
}: {
  course: MainlineCourse
  scene: LessonScene
  pres: ScenePresentation
  sceneNumber: number
}) {
  const items = courseStructureItemsFromScene(scene)
  const summary = scene.contentSlots[COURSE_STRUCTURE_SUMMARY_SLOT]?.trim()
  const startIndex = Number.parseInt(scene.contentSlots[COURSE_STRUCTURE_START_SLOT] ?? '0', 10) || 0
  const theme = pres.palette

  return (
    <section
      data-layout-rule="course-structure"
      className="relative flex h-full w-full flex-col overflow-hidden px-[6%] pb-[6%] pt-[5.5%]"
      style={{ background: theme.backdrop[0], color: theme.ink }}
    >
      <header className="flex items-center justify-between border-b pb-4" style={{ borderColor: toRgba(theme.ink, 0.16) }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{subjectLabel(course.subject)}</span>
        <span className="tabular-nums" style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.48) }}>
          {String(sceneNumber).padStart(2, '0')}
        </span>
      </header>

      <div className="mt-[4%] flex items-end justify-between gap-10">
        <h1 style={fitType('display', scene.visualFocus.length)}>{scene.visualFocus}</h1>
        {summary ? (
          <p className="max-w-[58%] text-right" style={{ ...fitType('body', summary.length), color: toRgba(theme.ink, 0.72) }}>
            {summary}
          </p>
        ) : null}
      </div>

      <div
        className="mt-[5%] grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => (
          <article
            key={`${item.title}-${index}`}
            className="relative flex min-w-0 flex-col border-l px-6 first:border-l-0 first:pl-0 last:pr-0"
            style={{ borderColor: toRgba(theme.ink, 0.16) }}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full tabular-nums"
                style={{ fontSize: projectionFontSize('auxiliary', 22), fontWeight: 800, background: theme.accent, color: theme.paper }}
              >
                {String(startIndex + index + 1).padStart(2, '0')}
              </span>
              <span className="h-[3px] flex-1" style={{ background: index === items.length - 1 ? toRgba(theme.accent, 0.3) : theme.accent }} />
            </div>
            <h2 className="mt-8" style={fitType('heading', item.title.length)}>{item.title}</h2>
            <p className="mt-5 max-w-[94%]" style={{ ...fitType('body', item.detail.length), color: toRgba(theme.ink, 0.7) }}>
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

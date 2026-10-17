'use client'

// 页预览：页目录选页 + 迁入的 PreviewStage（与 3b 渲染页同一套舞台组件）+ 胶片条。页优先课程的展示页来自 lessonPresentationPages（含 pageContent）。
// 终审修复（T15 走查第 2 条）：舞台放进 16:9 的框里，按面板宽度等比缩放，不再超出面板；胶片条在主区内横向滚动；
// 页目录改用备课自己的 pageGroups（连续同片段成组，组名带知识点与页码范围），迁入的 StructureTree 不改、这里不再用。
import { useMemo, useState } from 'react'
import { PreviewStage } from '@/components/mainline/workbench/PreviewStage'
import { Filmstrip } from '@/components/mainline/workbench/Filmstrip'
import { CourseContentOverview } from '@/components/mainline/workbench/CourseContentOverview'
import { lessonPresentationPages, presentationScene } from '@/lib/mainline/presentation/presentation-pages'
import type { MainlineCourse } from '@/lib/mainline/domain'
import type { PrepWorkbench } from '../lib/panel-model'
import { pageGroups } from './preview-model'
import styles from '../prep.module.css'
import '../render/prep-render.css'

export default function PagePreview({ workbench }: { workbench: PrepWorkbench }) {
  const course = workbench.course as unknown as MainlineCourse
  const pages = useMemo(() => lessonPresentationPages(course), [course])
  const groups = useMemo(() => pageGroups(course), [course])
  const [selected, setSelected] = useState<string | undefined>(pages[0]?.id)
  const page = pages.find((p) => p.id === selected)
  if (pages.length === 0) return <p className={styles.section}>还没有生成的页面。计划确认后在对话里让备课助理逐页生成。</p>
  return (
    <div className={`${styles.section} ${styles.previewLayout}`}>
      <nav className={styles.previewTree} aria-label="课程页目录">
        <div className={styles.pageTree}>
          <button type="button" className={selected === undefined ? styles.pageTreeActive : undefined} onClick={() => setSelected(undefined)}>全课内容（{pages.length} 页）</button>
          {groups.map((g) => (
            <div key={g.key} className={styles.pageTreeGroup}>
              <div className={styles.status}>{g.label}</div>
              {g.pages.map((p) => (
                <button key={p.id} type="button" className={p.id === selected ? styles.pageTreeActive : undefined} title={`第 ${p.number} 页 · ${p.title}${p.stageLabel ? ` · ${p.stageLabel}` : ''}`} onClick={() => setSelected(p.id)}>
                  {String(p.number).padStart(2, '0')} · {p.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className={styles.previewMain}>
        {page
          ? <div className={styles.stageFrame}><PreviewStage course={course} scene={presentationScene(page)} pageNumber={pages.indexOf(page) + 1} /></div>
          : <CourseContentOverview course={course} onSelectPage={setSelected} />}
        <div className={styles.filmstripFrame}><Filmstrip course={course} issues={[]} selectedPageId={selected} onSelect={setSelected} /></div>
      </div>
    </div>
  )
}

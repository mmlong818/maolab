'use client'

/** CourseContentOverview · 备课时按实际投影片与讲稿连续阅读。 */
import { FilePenLine } from 'lucide-react'
import type { ReactNode } from 'react'
import MathText from '../../MathOrText'
import { courseDisplayScene, courseDisplayTitle, lessonPresentationPages, presentationScene, sceneDisplayTitle, voicePaceLabel, type LessonPresentationPage, type LessonScene, type MainlineCourse } from '@/lib/mainline'
import { PreviewStage } from './PreviewStage'
import styles from './PrepWorkbench.module.css'

interface CourseContentOverviewProps {
  course: MainlineCourse
  onSelectPage: (pageId: string) => void
}

export function CourseContentOverview({ course, onSelectPage }: CourseContentOverviewProps) {
  const pages = lessonPresentationPages(course)
  return (
    <div className={styles.overview}>
      <header className={styles.overviewHeader}>
        <div>
          <div className={styles.overviewEyebrow}>全课备课</div>
          <h2><MathText>{courseDisplayTitle(course)}</MathText></h2>
          <p>共 {pages.length} 页，按实际上课顺序查看每张投影片与讲稿。</p>
        </div>
      </header>

      {pages.map((page, index) => (
        <SceneSection
          key={page.id}
          course={course}
          page={page}
          index={index}
          onSelect={() => onSelectPage(page.id)}
        />
      ))}
    </div>
  )
}

function SceneSection({ course, page, index, onSelect }: { course: MainlineCourse; page: LessonPresentationPage; index: number; onSelect: () => void }) {
  const displayScene = courseDisplayScene(course, presentationScene(page))
  const displayTitle = sceneDisplayTitle(course, displayScene)
  const stageLabel = page.stageLabel === displayTitle ? undefined : page.stageLabel
  return (
    <section className={styles.overviewScene}>
      <div className={styles.overviewSceneHeader}>
        <div className={styles.overviewSceneNumber}>{String(index + 1).padStart(2, '0')}</div>
        <div className={styles.overviewSceneTitle}>
          <h3><MathText>{displayTitle}</MathText></h3>
          {stageLabel ? <p>{stageLabel}</p> : null}
        </div>
        {!page.derived ? (
          <button type="button" onClick={onSelect} className={styles.overviewEditButton}>
            <FilePenLine size={15} aria-hidden="true" />
            查看并修正
          </button>
        ) : null}
      </div>

      <div className={styles.overviewContent}>
        <div className={styles.overviewStageSequence}>
          <PagePreview label={`第 ${index + 1} 页${page.stageLabel ? ` · ${page.stageLabel}` : ''}`} course={course} scene={displayScene} pageNumber={index + 1} forceFeedbackRevealed={page.feedbackRevealed} />
        </div>

        <ContentBlock title="老师讲稿" wide>
          {/* 用拆页后的讲稿:先答页显示 promptScript(读题引导+分层),揭晓页显示讲解稿。
              此前误用 page.scene.teacherScript,先答/揭晓两页显示同一份幕级讲稿
              (2026-08-25 用户「题目的两页目前讲稿是一致的」即源于此)。 */}
          <p><MathText>{displayScene.teacherScript}</MathText></p>
        </ContentBlock>

        <ContentBlock title="讲解重点">
          <p><MathText>{displayScene.narrationAnchor}</MathText></p>
        </ContentBlock>

        <ContentBlock title="学生任务">
          <p><MathText>{displayScene.studentAction}</MathText></p>
        </ContentBlock>

        <ContentBlock title="授课节奏">
          <p>{voicePaceLabel(displayScene.voiceCue.pace)}；{displayScene.voiceCue.pauseRule}</p>
        </ContentBlock>

      </div>
    </section>
  )
}

function PagePreview({ label, course, scene, pageNumber, forceFeedbackRevealed = false }: {
  label: string
  course: MainlineCourse
  scene: LessonScene
  pageNumber: number
  forceFeedbackRevealed?: boolean
}) {
  return (
    <div className={styles.overviewStageFrame}>
      <div className={styles.overviewStageLabel}>{label}</div>
      <div className={styles.overviewStage}>
        <PreviewStage course={course} scene={scene} pageNumber={pageNumber} showAnnotations={false} forceFeedbackRevealed={forceFeedbackRevealed} />
      </div>
    </div>
  )
}

function ContentBlock({ title, wide = false, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? styles.overviewBlockWide : styles.overviewBlock}>
      <h4>{title}</h4>
      {children}
    </div>
  )
}

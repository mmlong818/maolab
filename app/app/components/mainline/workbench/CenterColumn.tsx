'use client'

/** CenterColumn · 中栏:预览 + 幕/片段操作条 + 行内编辑表单 + 底部 filmstrip(v5 M1 WP2)。 */
import { useEffect, useState } from 'react'
import type { KnowledgeType } from '@maolab/shared-types'
import { lessonPresentationPages, presentationScene, type Executor, type MainlineCourse, type QualityIssue, type SceneType } from '@/lib/mainline'
import type { ScenePatchInput, WorkbenchBusy } from './useWorkbenchActions'
import { PreviewStage } from './PreviewStage'
import { ActionBar } from './ActionBar'
import { SceneEditForm } from './SceneEditForm'
import { Filmstrip } from './Filmstrip'
import { CourseContentOverview } from './CourseContentOverview'
import styles from './PrepWorkbench.module.css'

interface CenterColumnProps {
  course: MainlineCourse
  issues: QualityIssue[]
  selectedPageId: string | undefined
  misconceptionOptions: readonly string[]
  requestedMisconception?: string
  busy: WorkbenchBusy
  onSelectPage: (pageId: string) => void
  onPatchScene: (sceneId: string, patch: ScenePatchInput) => Promise<boolean>
  onAuditSceneFacts: (sceneId: string) => void
  onRegenScene: (sceneId: string) => void
  onRedrawSceneImage: (sceneId: string) => void
  onOpenCowart: (sceneId: string) => void
  onDeleteScene: (sceneId: string) => void
  onReskeletonFragment: (fragmentId: string, knowledgeType: KnowledgeType) => void
  onInsertScene: (afterSceneId: string, sceneType: SceneType) => void
}

export function CenterColumn({
  course, issues, selectedPageId, misconceptionOptions, requestedMisconception, busy,
  onSelectPage, onPatchScene, onAuditSceneFacts, onRegenScene, onRedrawSceneImage, onOpenCowart, onDeleteScene, onReskeletonFragment, onInsertScene,
}: CenterColumnProps) {
  const [editing, setEditing] = useState(Boolean(requestedMisconception))
  const pages = lessonPresentationPages(course)
  const previewPage = pages.find(page => page.id === selectedPageId)
  const scene = course.scenes.find(item => item.id === previewPage?.sourceSceneId)
  const previewPageNumber = previewPage
    ? pages.findIndex(page => page.id === previewPage.id) + 1
    : undefined
  const fragment = scene ? course.learningFragments.find(f => f.sceneIds.includes(scene.id)) : undefined

  useEffect(() => {
    setEditing(Boolean(requestedMisconception))
  }, [requestedMisconception, selectedPageId])

  if (course.scenes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 15 }}>
        这门课还没有任何幕,暂时无法预览。
      </div>
    )
  }

  if (!previewPage && selectedPageId === undefined) {
    return (
      <div className={styles.centerColumn} style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
        <CourseContentOverview course={course} onSelectPage={onSelectPage} />
      </div>
    )
  }

  if (!scene || !previewPage) return null

  return (
    <div
      className={styles.centerColumn}
      style={{
        flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: '16px 20px', overflowY: editing ? 'auto' : 'hidden',
      }}
    >
      {!editing && (
        <div className={styles.previewFrame} data-layout-rule="stage-16x9">
          <PreviewStage
            course={course}
            scene={previewPage ? presentationScene(previewPage) : scene}
            {...(previewPageNumber ? { pageNumber: previewPageNumber } : {})}
            forceFeedbackRevealed={previewPage?.feedbackRevealed ?? true}
          />
        </div>
      )}

      {!previewPage.derived ? (
        <ActionBar
          scene={scene}
          fragment={fragment}
          editing={editing}
          busy={busy}
          factAuditPending={Boolean(course.factAudit?.pendingSceneIds?.includes(scene.id))}
          onToggleEdit={() => setEditing(v => !v)}
          onRegen={() => onRegenScene(scene.id)}
          onAuditFacts={() => onAuditSceneFacts(scene.id)}
          onRedrawImage={() => onRedrawSceneImage(scene.id)}
          onOpenCowart={() => onOpenCowart(scene.id)}
          onDelete={() => onDeleteScene(scene.id)}
          onReskeleton={kt => fragment && onReskeletonFragment(fragment.id, kt)}
          onChangeExecutor={executor => void onPatchScene(scene.id, { executor })}
          onInsertScene={sceneType => onInsertScene(scene.id, sceneType)}
        />
      ) : null}

      {editing && !previewPage.derived ? (
        <SceneEditForm
          key={scene.id}
          scene={scene}
          misconceptionOptions={misconceptionOptions}
          {...(requestedMisconception ? { requestedMisconception } : {})}
          saving={busy?.kind === 'patch' && busy.sceneId === scene.id}
          onSave={patch => onPatchScene(scene.id, patch)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Filmstrip course={course} issues={issues} selectedPageId={selectedPageId} onSelect={onSelectPage} />
      )}
    </div>
  )
}

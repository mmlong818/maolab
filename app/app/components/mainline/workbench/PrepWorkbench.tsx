'use client'

/**
 * PrepWorkbench · 备课工作台三栏外壳(v5 M1 WP2,docs/v5-master-plan-2026-07-20.md §4 方向一)
 *
 * 顶栏 + 左结构树 + 中预览/操作条/filmstrip + 右检查/简报 tab,状态全部提升到这里
 * (useWorkbenchActions),子组件只管渲染与上抛事件——保持单文件职责单一,
 * 拆分成 workbench/ 目录下的注册式组件(TopBar/StructureTree/CenterColumn/RightPanel)。
 */
import { useMemo, useState } from 'react'
import type { KnowledgeType } from '@maolab/shared-types'
import { IMAGE_SCENE_TYPES, courseReleaseReadinessFromIssues, lessonPresentationPages, type MainlineCourse, type QualityIssue, type QualitySummary, type SceneType } from '@/lib/mainline'
import type { PrepBrief } from '@/lib/mainline/prep-brief'
import { FillBanner } from '../FillBanner'
import { TopBar } from './TopBar'
import { StructureTree } from './StructureTree'
import { CenterColumn } from './CenterColumn'
import { RightPanel } from './RightPanel'
import { useWorkbenchActions } from './useWorkbenchActions'
import styles from './PrepWorkbench.module.css'

interface PrepWorkbenchProps {
  course: MainlineCourse
  issues: QualityIssue[]
  summary: QualitySummary
  factAuditFatalCount: number
  factAuditWarningCount: number
  factAuditInfoCount: number
  prepBrief: PrepBrief | undefined
  prepBriefError: boolean
  fragmentLabels: Record<string, string>
  initialSelectedSceneId?: string
  initialRequestedMisconception?: string
}

export function PrepWorkbench({
  course: initialCourse, issues: initialIssues, summary: initialSummary,
  factAuditFatalCount, factAuditWarningCount, factAuditInfoCount, prepBrief: initialPrepBrief, prepBriefError, fragmentLabels,
  initialSelectedSceneId, initialRequestedMisconception,
}: PrepWorkbenchProps) {
  const {
    course, issues, summary, prepBrief, busy, error, clearError,
    patchScene, auditSceneFacts, regenerateScene, redrawSceneImage, deleteScene, reskeletonFragment, insertScene, setStylePack,
    refreshCast, refreshRuntimeContracts, refreshSourceGroundings, refreshKpGoals, refreshMisconceptionClaims, refreshLearningActivities, refreshProblemPractices,
  } = useWorkbenchActions({
    courseId: initialCourse.id,
    initialCourse,
    initialIssues,
    initialSummary,
    ...(initialPrepBrief ? { initialPrepBrief } : {}),
  })

  const presentationPages = useMemo(() => lessonPresentationPages(course), [course])
  const firstPageId = initialSelectedSceneId
    ? presentationPages.find(page => page.sourceSceneId === initialSelectedSceneId)?.id
    : undefined
  const [selectedPageId, setSelectedPageId] = useState<string | undefined>(firstPageId)
  const selectedPage = presentationPages.find(page => page.id === selectedPageId)
  const selectedSceneId = selectedPage?.derived ? undefined : selectedPage?.sourceSceneId
  const selectedScene = course.scenes.find(scene => scene.id === selectedSceneId)
  const misconceptionOptions = selectedScene?.kpId
    ? prepBrief?.kps.find(entry => entry.kpId === selectedScene.kpId)?.misconceptions.map(item => item.text) ?? []
    : []
  const activeRequestedMisconception = selectedPageId === firstPageId
    ? initialRequestedMisconception
    : undefined

  const hasImages = useMemo(() => {
    const targets = course.scenes.filter(s => IMAGE_SCENE_TYPES.includes(s.sceneType))
    return targets.length > 0 && targets.every(s => s.imageUrl)
  }, [course.scenes])
  const pendingFactAuditCount = course.factAudit?.pendingSceneIds?.length ?? 0
  const readiness = courseReleaseReadinessFromIssues(course, issues)
  const liveFactCounts = course.factAudit
    ? {
        fatal: course.factAudit.issues.filter(issue => issue.severity === 'blocking').length,
        warning: course.factAudit.issues.filter(issue => issue.severity === 'warning').length,
        info: course.factAudit.issues.filter(issue => issue.severity === 'info').length,
      }
    : { fatal: factAuditFatalCount, warning: factAuditWarningCount, info: factAuditInfoCount }

  function selectScene(sceneId: string) {
    setSelectedPageId(presentationPages.find(page => page.sourceSceneId === sceneId)?.id)
  }

  return (
    <div className={styles.root} style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fafaf7' }}>
      <FillBanner
        courseId={course.id}
        qualityStatus={course.qualityStatus}
        hasBlockingIssues={summary.blocking > 0}
        hasImages={hasImages}
        factAuditPendingCount={pendingFactAuditCount}
        surface="prep"
      />

      <TopBar course={course} readiness={readiness} />

      {error && (
        <div style={{ padding: '8px 24px', background: '#fef2f2', color: '#991b1b', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={clearError} style={{ border: 'none', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 13 }}>
            关闭
          </button>
        </div>
      )}

      <div className={styles.workspace} style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <StructureTree
          course={course}
          issues={issues}
          fragmentLabels={fragmentLabels}
          selectedPageId={selectedPageId}
          onSelectOverview={() => setSelectedPageId(undefined)}
          onSelectPage={setSelectedPageId}
        />

        <CenterColumn
          course={course}
          issues={issues}
          selectedPageId={selectedPageId}
          misconceptionOptions={misconceptionOptions}
          {...(activeRequestedMisconception ? { requestedMisconception: activeRequestedMisconception } : {})}
          busy={busy}
          onSelectPage={setSelectedPageId}
          onPatchScene={patchScene}
          onAuditSceneFacts={sceneId => void auditSceneFacts(sceneId)}
          onRegenScene={sceneId => void regenerateScene(sceneId)}
          onRedrawSceneImage={sceneId => void redrawSceneImage(sceneId)}
          onOpenCowart={sceneId => { window.location.href = `/mainline/${course.id}/cowart/${sceneId}` }}
          onDeleteScene={sceneId => void deleteScene(sceneId)}
          onReskeletonFragment={(fragmentId, kt: KnowledgeType) => void reskeletonFragment(fragmentId, kt)}
          onInsertScene={(afterSceneId, sceneType: SceneType) => void insertScene(afterSceneId, sceneType)}
        />

        <RightPanel
          course={course}
          issues={issues}
          summary={summary}
          factAuditFatalCount={liveFactCounts.fatal}
          factAuditWarningCount={liveFactCounts.warning}
          factAuditInfoCount={liveFactCounts.info}
          prepBrief={prepBrief}
          prepBriefError={prepBriefError}
          selectedSceneId={selectedSceneId}
          onSelectScene={selectScene}
          styleBusy={busy?.kind === 'style'}
          onSetStylePack={id => void setStylePack(id)}
          castRefreshBusy={busy?.kind === 'cast-refresh'}
          onRefreshCast={() => void refreshCast()}
          runtimeContractRefreshBusy={busy?.kind === 'runtime-contract-refresh'}
          onRefreshRuntimeContracts={() => void refreshRuntimeContracts()}
          sourceGroundingRefreshBusy={busy?.kind === 'source-grounding-refresh'}
          onRefreshSourceGrounding={() => void refreshSourceGroundings()}
          kpGoalRefreshBusy={busy?.kind === 'kp-goal-refresh'}
          onRefreshKpGoals={() => void refreshKpGoals()}
          misconceptionRefreshBusy={busy?.kind === 'misconception-refresh'}
          onRefreshMisconceptionClaims={() => void refreshMisconceptionClaims()}
          learningActivityRefreshBusy={busy?.kind === 'learning-activity-refresh'}
          onRefreshLearningActivities={() => void refreshLearningActivities()}
          practiceRefreshBusy={busy?.kind === 'practice-refresh'}
          onRefreshProblemPractices={() => void refreshProblemPractices()}
        />
      </div>
    </div>
  )
}

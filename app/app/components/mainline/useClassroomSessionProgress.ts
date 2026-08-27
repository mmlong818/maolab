'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  classroomLessonCanComplete,
  classroomSessionStorageKey,
  openingAttemptIsComplete,
  openingAttemptStateKey,
  parseClassroomSessionProgress,
  practiceFeedbackForSavedScenes,
  lessonPresentationPages,
  presentationNavigationBlocker,
  serializeClassroomSessionProgress,
  stagedLearningStateKey,
  type ClassroomSessionProgress,
  type LessonOpeningAttempt,
  type MainlineCourse,
  type PracticeFeedbackDisplay,
  type RecapTransferAttempt,
  type StagedLearningAttempt,
  type StagedPostRevealRecord,
} from '@/lib/mainline'

export function useClassroomSessionProgress(
  course: MainlineCourse | undefined,
  sceneIndex: number,
  setSceneIndex: Dispatch<SetStateAction<number>>,
  opts?: {
    /**
     * PPTX 导出截图态传 false:同一无头标签页连续打开 26 个 ?page=N,
     * 会话恢复会把 sceneIndex 拉回快照页覆盖 page 参数;导出也不该留下快照。
     */
    enabled?: boolean
  },
) {
  const enabled = opts?.enabled ?? true
  const [revealedLearningFeedback, setRevealedLearningFeedback] = useState<Record<string, boolean>>({})
  const [stagedAttempts, setStagedAttempts] = useState<Record<string, StagedLearningAttempt | undefined>>({})
  const [postRevealRecords, setPostRevealRecords] = useState<Record<string, StagedPostRevealRecord | undefined>>({})
  const [practiceEvidenceSaved, setPracticeEvidenceSaved] = useState<Record<string, boolean>>({})
  const [practiceFeedbackByScene, setPracticeFeedbackByScene] = useState<Record<string, PracticeFeedbackDisplay | undefined>>({})
  const [openingAttempts, setOpeningAttempts] = useState<Record<string, LessonOpeningAttempt>>({})
  const [recapTransferAttempts, setRecapTransferAttempts] = useState<Record<string, RecapTransferAttempt | undefined>>({})
  const [lessonCompleted, setLessonCompleted] = useState(false)
  const [classroomSessionId, setClassroomSessionId] = useState<string | null>(null)
  const [hydratedCourseId, setHydratedCourseId] = useState<string | null>(null)

  useEffect(() => {
    if (!course || !enabled) return
    const activeCourse = course
    let cancelled = false
    setHydratedCourseId(null)

    async function restore() {
      const restored = readStoredProgress(activeCourse)
      const activeSessionId = restored?.sessionId ?? globalThis.crypto.randomUUID()
      const savedPracticeSceneIds = await fetchSavedPracticeSceneIds(activeCourse, activeSessionId)
      if (cancelled) return

      const restoredOpening = restored?.openingAttempts ?? {}
      const restoredAttempts = restored?.stagedAttempts ?? {}
      const restoredPostReveal = restored?.postRevealRecords ?? {}
      const restoredRecapTransfer = restored?.recapTransferAttempts ?? {}
      const { revealed, saved } = restoredPracticeState(activeCourse, savedPracticeSceneIds, restored)
      const restoredPracticeFeedback = practiceFeedbackForSavedScenes(
        activeCourse,
        savedPracticeSceneIds,
        restored?.practiceFeedbackByScene ?? {},
      )
      const restoredLessonCompleted = restored?.lessonCompleted === true && classroomLessonCanComplete(
        activeCourse,
        restoredOpening,
        revealed,
        restoredPostReveal,
        saved,
        restoredRecapTransfer,
      )

      setOpeningAttempts(current => replaceCourseEntries(current, activeCourse.id, restoredOpening))
      setRecapTransferAttempts(current => replaceCourseEntries(current, activeCourse.id, restoredRecapTransfer))
      setStagedAttempts(current => replaceCourseEntries(current, activeCourse.id, restoredAttempts))
      setRevealedLearningFeedback(current => replaceCourseEntries(current, activeCourse.id, revealed))
      setPostRevealRecords(current => replaceCourseEntries(current, activeCourse.id, restoredPostReveal))
      setPracticeEvidenceSaved(current => replaceCourseEntries(current, activeCourse.id, saved))
      setPracticeFeedbackByScene(current => replaceCourseEntries(current, activeCourse.id, restoredPracticeFeedback))
      setLessonCompleted(restoredLessonCompleted)
      setClassroomSessionId(activeSessionId)
      setSceneIndex(restoredPageIndex(activeCourse, restored, restoredOpening, revealed, restoredPostReveal, saved))
      setHydratedCourseId(activeCourse.id)
    }

    void restore()
    return () => { cancelled = true }
  }, [course, setSceneIndex])

  useEffect(() => {
    if (!course || !enabled || !classroomSessionId || hydratedCourseId !== course.id) return
    const pages = lessonPresentationPages(course)
    const currentPage = pages[Math.min(sceneIndex, Math.max(0, pages.length - 1))]
    const currentSceneId = currentPage?.sourceSceneId
    try {
      window.sessionStorage.setItem(
        classroomSessionStorageKey(course.id),
        serializeClassroomSessionProgress(course, {
          sessionId: classroomSessionId,
          ...(currentSceneId ? { sceneId: currentSceneId } : {}),
          ...(currentPage ? { presentationPageId: currentPage.id } : {}),
          ...(lessonCompleted ? { lessonCompleted: true as const } : {}),
          openingAttempts,
          stagedAttempts,
          revealedLearningFeedback,
          postRevealRecords,
          recapTransferAttempts,
          practiceFeedbackByScene,
        }),
      )
    } catch {
      // 会话存储不可用不影响当前页面内的课堂流程。
    }
  }, [course, enabled, classroomSessionId, sceneIndex, hydratedCourseId, lessonCompleted, openingAttempts, recapTransferAttempts, stagedAttempts, revealedLearningFeedback, postRevealRecords, practiceFeedbackByScene])

  return {
    classroomSessionId,
    lessonCompleted,
    setLessonCompleted,
    openingAttempts,
    setOpeningAttempts,
    recapTransferAttempts,
    setRecapTransferAttempts,
    stagedAttempts,
    setStagedAttempts,
    revealedLearningFeedback,
    setRevealedLearningFeedback,
    postRevealRecords,
    setPostRevealRecords,
    practiceEvidenceSaved,
    setPracticeEvidenceSaved,
    practiceFeedbackByScene,
    setPracticeFeedbackByScene,
  }
}

function readStoredProgress(course: MainlineCourse): ClassroomSessionProgress | null {
  try {
    return parseClassroomSessionProgress(
      window.sessionStorage.getItem(classroomSessionStorageKey(course.id)),
      course,
    )
  } catch {
    return null
  }
}

async function fetchSavedPracticeSceneIds(course: MainlineCourse, sessionId: string): Promise<string[]> {
  try {
    const response = await fetch(`/api/v2/mainline/response?courseId=${encodeURIComponent(course.id)}&sessionId=${encodeURIComponent(sessionId)}`)
    if (!response.ok) return []
    const payload = await response.json() as { savedSceneIds?: unknown }
    if (!Array.isArray(payload.savedSceneIds)) return []
    const validIds = new Set(course.scenes
      .filter(scene => scene.sceneType === 'practice' && scene.kpId)
      .map(scene => scene.id))
    return payload.savedSceneIds
      .filter((sceneId): sceneId is string => typeof sceneId === 'string' && validIds.has(sceneId))
  } catch {
    // 服务不可用时不能把客户端状态冒充正式练习证据。
    return []
  }
}

function restoredPracticeState(
  course: MainlineCourse,
  savedSceneIds: readonly string[],
  restored: ClassroomSessionProgress | null,
): { revealed: Record<string, boolean>; saved: Record<string, boolean> } {
  const revealed: Record<string, boolean> = { ...(restored?.revealedLearningFeedback ?? {}) }
  const saved: Record<string, boolean> = {}
  for (const sceneId of savedSceneIds) {
    const key = stagedLearningStateKey(course.id, sceneId)
    revealed[key] = true
    saved[key] = true
  }
  return { revealed, saved }
}

function restoredPageIndex(
  course: MainlineCourse,
  restored: ClassroomSessionProgress | null,
  openingAttempts: Readonly<Record<string, LessonOpeningAttempt | undefined>>,
  revealed: Readonly<Record<string, boolean | undefined>>,
  postRevealRecords: Readonly<Record<string, StagedPostRevealRecord | undefined>>,
  practiceEvidenceSaved: Readonly<Record<string, boolean | undefined>>,
): number {
  const pages = lessonPresentationPages(course)
  const requestedIndex = restored?.presentationPageId
    ? pages.findIndex(page => page.id === restored.presentationPageId)
    : restored?.sceneId
      ? pages.findIndex(page => page.sourceSceneId === restored.sceneId)
    : 0
  const openingIndex = pages.findIndex(page => page.scene.sceneType === 'source-reading')
  const openingScene = openingIndex >= 0
    ? course.scenes.find(scene => scene.id === pages[openingIndex]?.sourceSceneId)
    : undefined
  const openingKey = openingScene ? openingAttemptStateKey(course.id, openingScene.id) : ''
  const openingReady = !openingScene || openingAttemptIsComplete(openingAttempts[openingKey])
  let targetIndex = Math.max(0, requestedIndex)
  if (!openingReady && openingIndex >= 0 && targetIndex > openingIndex) targetIndex = openingIndex
  const blocker = presentationNavigationBlocker(
    course.id,
    pages,
    targetIndex,
    revealed,
    postRevealRecords,
    practiceEvidenceSaved,
  )
  return blocker ? Math.min(targetIndex, blocker.pageIndex) : targetIndex
}

function replaceCourseEntries<T>(
  current: Readonly<Record<string, T>>,
  courseId: string,
  restored: Readonly<Record<string, T>>,
): Record<string, T> {
  const prefix = `${courseId}:`
  return Object.fromEntries([
    ...Object.entries(current).filter(([key]) => !key.startsWith(prefix)),
    ...Object.entries(restored).filter(([, value]) => value !== undefined),
  ])
}

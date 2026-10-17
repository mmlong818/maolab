import {
  openingAttemptIsComplete,
  openingAttemptReviewIsComplete,
  openingAttemptStateKey,
  normalizeOpeningAttemptText,
  type LessonOpeningAttempt,
  type OpeningConfidence,
} from './lesson-phase.js'
import {
  normalizeStagedAttemptText,
  stagedAttemptIsComplete,
  stagedLearningConfig,
  stagedLearningStateKey,
  stagedPostRevealRecordIsComplete,
  type StagedLearningAttempt,
  type StagedPostRevealRecord,
} from './staged-learning.js'
import {
  lessonPresentationPages,
  presentationNavigationBlocker,
  presentationPageStateKey,
} from './presentation/presentation-pages.js'
import {
  normalizeRecapTransferResponse,
  normalizeRecapTransferReview,
  recapTransferAttemptIsComplete,
  recapTransferStateKey,
  recapTransferTaskProblems,
  type RecapTransferAttempt,
  type RecapTransferConfidence,
  type RecapTransferReviewDecision,
} from './recap-template.js'
import type { MainlineCourse } from './domain.js'

const CLASSROOM_SESSION_VERSION = 4
const CLASSROOM_SESSION_TTL_MS = 12 * 60 * 60 * 1_000
const STORAGE_PREFIX = 'maolab-mainline-classroom:'

export interface ClassroomSessionProgressInput {
  sessionId: string
  sceneId?: string
  presentationPageId?: string
  lessonCompleted?: true
  openingAttempts: Readonly<Record<string, LessonOpeningAttempt | undefined>>
  stagedAttempts: Readonly<Record<string, StagedLearningAttempt | undefined>>
  revealedLearningFeedback: Readonly<Record<string, boolean | undefined>>
  postRevealRecords: Readonly<Record<string, StagedPostRevealRecord | undefined>>
  recapTransferAttempts?: Readonly<Record<string, RecapTransferAttempt | undefined>>
  practiceFeedbackByScene?: Readonly<Record<string, PracticeFeedbackDisplay | undefined>>
}

export interface PracticeFeedbackDisplay {
  outcome: 'correct' | 'incorrect'
  label: string
  message: string
}

export interface ClassroomSessionProgress {
  sessionId: string
  sceneId?: string
  presentationPageId?: string
  lessonCompleted?: true
  openingAttempts: Record<string, LessonOpeningAttempt>
  stagedAttempts: Record<string, StagedLearningAttempt>
  revealedLearningFeedback: Record<string, true>
  postRevealRecords: Record<string, StagedPostRevealRecord>
  recapTransferAttempts: Record<string, RecapTransferAttempt>
  practiceFeedbackByScene: Record<string, PracticeFeedbackDisplay>
}

interface StoredClassroomSession extends ClassroomSessionProgress {
  version: typeof CLASSROOM_SESSION_VERSION
  courseFingerprint: string
  savedAt: number
}

export function classroomSessionStorageKey(courseId: string): string {
  return `${STORAGE_PREFIX}${courseId}`
}

/**
 * 只保存会话级教学动作。正式练习的原答、订正、揭晓和完成状态不会进入浏览器快照；
 * 只保留不参与判分或解锁的专属反馈展示，恢复时还必须由服务端证明对应练习仍有效。
 * 指纹只覆盖会改变教学证据含义的内容，换配色或立绘不会让正在进行的课堂失效。
 */
export function serializeClassroomSessionProgress(
  course: MainlineCourse,
  progress: ClassroomSessionProgressInput,
  now = Date.now(),
): string {
  if (!isClassroomSessionId(progress.sessionId)) {
    throw new Error('classroom session progress requires a valid session id')
  }
  const sanitized = sanitizeProgress(progress, course)
  const stored: StoredClassroomSession = {
    version: CLASSROOM_SESSION_VERSION,
    courseFingerprint: classroomEvidenceFingerprint(course),
    savedAt: now,
    ...sanitized,
  }
  return JSON.stringify(stored)
}

export function parseClassroomSessionProgress(
  raw: string | null | undefined,
  course: MainlineCourse,
  now = Date.now(),
): ClassroomSessionProgress | null {
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) }
  catch { return null }
  const record = asRecord(parsed)
  if (!record) return null
  if (record.version !== CLASSROOM_SESSION_VERSION) return null
  if (record.courseFingerprint !== classroomEvidenceFingerprint(course)) return null
  if (!isClassroomSessionId(record.sessionId)) return null
  if (typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt)) return null
  if (record.savedAt > now || now - record.savedAt > CLASSROOM_SESSION_TTL_MS) return null
  return sanitizeProgress(record, course)
}

function sanitizeProgress(input: unknown, course: MainlineCourse): ClassroomSessionProgress {
  const record = asRecord(input) ?? {}
  const openingInput = asRecord(record.openingAttempts) ?? {}
  const stagedInput = asRecord(record.stagedAttempts) ?? {}
  const revealedInput = asRecord(record.revealedLearningFeedback) ?? {}
  const postRevealInput = asRecord(record.postRevealRecords) ?? {}
  const recapTransferInput = asRecord(record.recapTransferAttempts) ?? {}
  const practiceFeedbackInput = asRecord(record.practiceFeedbackByScene) ?? {}
  const openingAttempts: Record<string, LessonOpeningAttempt> = {}
  const stagedAttempts: Record<string, StagedLearningAttempt> = {}
  const revealedLearningFeedback: Record<string, true> = {}
  const postRevealRecords: Record<string, StagedPostRevealRecord> = {}
  const recapTransferAttempts: Record<string, RecapTransferAttempt> = {}
  const practiceFeedbackByScene: Record<string, PracticeFeedbackDisplay> = {}

  const openingScene = course.scenes.find(scene => scene.sceneType === 'source-reading')
  if (openingScene) {
    const key = openingAttemptStateKey(course.id, openingScene.id)
    const attempt = normalizeOpeningAttempt(openingInput[key])
    if (attempt) openingAttempts[key] = attempt
  }

  const presentationPages = lessonPresentationPages(course)
  for (const page of presentationPages) {
    if (page.feedbackRevealed) continue
    const scene = page.scene
    const config = stagedLearningConfig(scene)
    if (!config) continue
    const key = presentationPageStateKey(course.id, page)
    if (config.recordsMastery) {
      const feedback = normalizePracticeFeedbackDisplay(practiceFeedbackInput[key])
      if (feedback) practiceFeedbackByScene[key] = feedback
      // 正式练习只能从服务端恢复，浏览器快照不得自行证明已经看过反馈或完成学情写入。
      continue
    }
    const attempt = normalizeStagedAttempt(stagedInput[key], config.promptItems.length)
    if (!attempt || !stagedAttemptIsComplete(config, attempt)) continue
    stagedAttempts[key] = attempt
    if (revealedInput[key] !== true) continue
    revealedLearningFeedback[key] = true
    const postReveal = normalizeStagedPostRevealRecord(postRevealInput[key], config.promptItems.length)
    if (postReveal && stagedPostRevealRecordIsComplete(scene, postReveal)) {
      postRevealRecords[key] = postReveal
    }
  }

  const finalScene = course.scenes.at(-1)
  if (finalScene?.sceneType === 'recap' && recapTransferTaskProblems(finalScene.contentSlots.transferTask).length === 0) {
    const key = recapTransferStateKey(course.id, finalScene.id)
    const attempt = normalizeRecapTransferAttempt(recapTransferInput[key])
    if (attempt) recapTransferAttempts[key] = attempt
  }

  const sceneId = typeof record.sceneId === 'string' && course.scenes.some(scene => scene.id === record.sceneId)
    ? record.sceneId
    : undefined
  const presentationPageId = typeof record.presentationPageId === 'string'
    && presentationPages.some(page => page.id === record.presentationPageId)
    ? record.presentationPageId
    : undefined
  return {
    sessionId: record.sessionId as string,
    ...(sceneId ? { sceneId } : {}),
    ...(presentationPageId ? { presentationPageId } : {}),
    ...(record.lessonCompleted === true ? { lessonCompleted: true as const } : {}),
    openingAttempts,
    stagedAttempts,
    revealedLearningFeedback,
    postRevealRecords,
    recapTransferAttempts,
    practiceFeedbackByScene,
  }
}

/**
 * 专属反馈可以作为当前标签页的阅读状态恢复，但只能保留服务端已确认仍有效的练习幕。
 * 这段文字不参与导航、课程完成或掌握度计算。
 */
export function practiceFeedbackForSavedScenes(
  course: MainlineCourse,
  savedSceneIds: readonly string[],
  storedFeedback: Readonly<Record<string, PracticeFeedbackDisplay | undefined>>,
): Record<string, PracticeFeedbackDisplay> {
  const feedback: Record<string, PracticeFeedbackDisplay> = {}
  const saved = new Set(savedSceneIds)
  for (const scene of course.scenes) {
    const config = stagedLearningConfig(scene)
    if (!config?.recordsMastery || !saved.has(scene.id)) continue
    const key = stagedLearningStateKey(course.id, scene.id)
    const display = normalizePracticeFeedbackDisplay(storedFeedback[key])
    if (display) feedback[key] = display
  }
  return feedback
}

/**
 * “结束本课”只确认当前课堂已经走完证据闭环，不代表教师判分或学生已经掌握。
 * 会话快照中的 lessonCompleted 只是待复核确认；恢复时仍须用本函数和服务端练习证据重算。
 */
export function classroomLessonCanComplete(
  course: MainlineCourse,
  openingAttempts: Readonly<Record<string, LessonOpeningAttempt | undefined>>,
  revealedLearningFeedback: Readonly<Record<string, boolean | undefined>>,
  postRevealRecords: Readonly<Record<string, StagedPostRevealRecord | undefined>>,
  practiceEvidenceSaved: Readonly<Record<string, boolean | undefined>> = {},
  recapTransferAttempts: Readonly<Record<string, RecapTransferAttempt | undefined>> = {},
  practicePaperComplete: Readonly<Record<string, boolean | undefined>> = {},
): boolean {
  const finalScene = course.scenes.at(-1)
  if (!finalScene || finalScene.sceneType !== 'recap') return false
  if (recapTransferTaskProblems(finalScene.contentSlots.transferTask).length === 0) {
    const transferKey = recapTransferStateKey(course.id, finalScene.id)
    if (!recapTransferAttemptIsComplete(recapTransferAttempts[transferKey])) return false
  }

  const openingScene = course.scenes.find(scene => scene.sceneType === 'source-reading')
  if (openingScene) {
    const openingKey = openingAttemptStateKey(course.id, openingScene.id)
    if (!openingAttemptReviewIsComplete(openingAttempts[openingKey])) return false
  }

  const pages = lessonPresentationPages(course)
  return presentationNavigationBlocker(
    course.id,
    pages,
    pages.length,
    revealedLearningFeedback,
    postRevealRecords,
    practiceEvidenceSaved,
    practicePaperComplete,
  ) === null
}

function normalizeRecapTransferAttempt(value: unknown): RecapTransferAttempt | undefined {
  const record = asRecord(value)
  if (!record || !isRecapTransferConfidence(record.confidence)) return undefined
  if (record.mode === 'paper-or-oral') {
    return record.paperOrOralComplete === true && record.paperReviewComplete === true
      ? {
          mode: 'paper-or-oral',
          confidence: record.confidence,
          paperOrOralComplete: true,
          paperReviewComplete: true,
        }
      : undefined
  }
  if (
    record.mode !== 'typed'
    || typeof record.response !== 'string'
    || !isRecapTransferReviewDecision(record.reviewDecision)
    || typeof record.reviewNote !== 'string'
  ) return undefined
  const response = normalizeRecapTransferResponse(record.response)
  const reviewNote = normalizeRecapTransferReview(record.reviewNote)
  if (!response || !reviewNote) return undefined
  const attempt: RecapTransferAttempt = {
    mode: 'typed',
    confidence: record.confidence,
    response,
    reviewDecision: record.reviewDecision,
    reviewNote,
  }
  return recapTransferAttemptIsComplete(attempt) ? attempt : undefined
}

function normalizeOpeningAttempt(value: unknown): LessonOpeningAttempt | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  if (record.responseMode !== 'typed' && record.responseMode !== 'paper-or-oral') return undefined
  if (!isOpeningConfidence(record.confidence)) return undefined
  const attempt: LessonOpeningAttempt = {
    responseMode: record.responseMode,
    confidence: record.confidence,
    ...(record.responseMode === 'typed' && typeof record.response === 'string'
      ? { response: normalizeOpeningAttemptText(record.response) }
      : {}),
    ...(typeof record.revision === 'string'
      ? { revision: normalizeOpeningAttemptText(record.revision) }
      : {}),
    ...(record.paperReviewComplete === true ? { paperReviewComplete: true as const } : {}),
  }
  return openingAttemptIsComplete(attempt) ? attempt : undefined
}

function normalizeStagedAttempt(
  value: unknown,
  responseCount: number,
): StagedLearningAttempt | undefined {
  const record = asRecord(value)
  if (!record || !isStagedConfidence(record.confidence)) return undefined
  if (record.mode === 'paper-or-oral') {
    return record.paperOrOralComplete === true
      ? { mode: 'paper-or-oral', confidence: record.confidence, paperOrOralComplete: true }
      : undefined
  }
  if (record.mode !== 'typed' || !Array.isArray(record.responses) || record.responses.length !== responseCount) {
    return undefined
  }
  const responses = record.responses.map(normalizeStagedAttemptText)
  return responses.every((response): response is string => Boolean(response))
    ? { mode: 'typed', confidence: record.confidence, responses }
    : undefined
}

function normalizeStagedPostRevealRecord(
  value: unknown,
  responseCount: number,
): StagedPostRevealRecord | undefined {
  const record = asRecord(value)
  if (!record || !isStagedComparison(record.comparison)) return undefined
  if (record.mode === 'paper-or-oral') {
    return record.paperOrOralComplete === true
      ? { mode: 'paper-or-oral', comparison: record.comparison, paperOrOralComplete: true }
      : undefined
  }
  if (record.mode !== 'typed' || !Array.isArray(record.responses) || record.responses.length !== responseCount) {
    return undefined
  }
  const responses = record.responses.map(normalizeStagedAttemptText)
  return responses.every((response): response is string => Boolean(response))
    ? { mode: 'typed', comparison: record.comparison, responses }
    : undefined
}

function normalizePracticeFeedbackDisplay(value: unknown): PracticeFeedbackDisplay | undefined {
  const record = asRecord(value)
  if (!record || (record.outcome !== 'correct' && record.outcome !== 'incorrect')) return undefined
  if (typeof record.label !== 'string' || typeof record.message !== 'string') return undefined
  const label = record.label.trim()
  const message = record.message.trim()
  if (!label || label.length > 160 || !message || message.length > 1_200) return undefined
  return { outcome: record.outcome, label, message }
}

function classroomEvidenceFingerprint(course: MainlineCourse): string {
  const evidenceContract = JSON.stringify({
    id: course.id,
    topic: course.topic,
    lessonPhase: course.lessonPhase ?? 'new',
    goals: course.goals.map(goal => ({
      id: goal.id,
      kpId: goal.kpId,
      successSignal: goal.successSignal,
    })),
    scenes: course.scenes.map(scene => ({
      id: scene.id,
      sceneType: scene.sceneType,
      kpId: scene.kpId,
      contentSlots: scene.contentSlots,
      studentAction: scene.studentAction,
    })),
  })
  let hash = 0x811c9dc5
  for (let index = 0; index < evidenceContract.length; index += 1) {
    hash ^= evidenceContract.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isOpeningConfidence(value: unknown): value is OpeningConfidence {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isStagedConfidence(value: unknown): value is StagedLearningAttempt['confidence'] {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isStagedComparison(value: unknown): value is StagedPostRevealRecord['comparison'] {
  return value === 'matched' || value === 'revised'
}

function isRecapTransferConfidence(value: unknown): value is RecapTransferConfidence {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isRecapTransferReviewDecision(value: unknown): value is RecapTransferReviewDecision {
  return value === 'kept' || value === 'revised'
}

function isClassroomSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
}

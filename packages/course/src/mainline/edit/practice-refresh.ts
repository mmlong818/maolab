import type { MainlineCourse } from '../domain.js'
import type { FillLLMCall } from '../generation/fill-scenes.js'
import { buildBeats, buildPracticeScene } from '../generation/compile-lesson.js'
import {
  auditMainlineCourse,
  MISSING_PRACTICE_ISSUE_MESSAGE,
  PRACTICE_REGEN_ISSUE_MESSAGES,
  type QualityIssue,
} from '../quality-gates.js'
import type { SeasonInjection } from '../season.js'
import { regenerateScene, type RegenSceneOutcome } from './scene-regen.js'

export interface RefreshProblemPracticesResult {
  course: MainlineCourse
  regeneratedSceneIds: string[]
  insertedSceneIds: string[]
  issues: QualityIssue[]
}

export interface PracticeRepairPlan {
  sceneIds: string[]
  missingFragmentIds: string[]
  total: number
}

export type PracticeSceneRegenerator = (
  course: MainlineCourse,
  sceneId: string,
  opts?: { llm?: FillLLMCall; season?: SeasonInjection },
) => Promise<RegenSceneOutcome>

export interface RefreshProblemPracticesOptions {
  llm?: FillLLMCall
  season?: SeasonInjection
  regenerate?: PracticeSceneRegenerator
}

export class PracticeRefreshIncompleteError extends Error {
  readonly code = 'PRACTICE_REFRESH_INCOMPLETE'

  constructor(readonly sceneIds: readonly string[]) {
    super(`目标检核修复后仍有 ${sceneIds.length} 项未通过质量检查：${sceneIds.join('、')}`)
    this.name = 'PracticeRefreshIncompleteError'
  }
}

export class PracticeRefreshStructureError extends Error {
  readonly code = 'PRACTICE_REFRESH_STRUCTURE_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'PracticeRefreshStructureError'
  }
}

const INSERTED_PRACTICE_DURATION_SEC = 50

export function problemPracticeSceneIds(course: MainlineCourse): string[] {
  const practiceSceneIds = new Set(
    course.scenes.filter(scene => scene.sceneType === 'practice').map(scene => scene.id),
  )
  return [...new Set(auditMainlineCourse(course)
    .filter(issue => (
      issue.severity === 'blocking'
      && issue.targetType === 'scene'
      && practiceSceneIds.has(issue.targetId)
      && PRACTICE_REGEN_ISSUE_MESSAGES.has(issue.message)
    ))
    .map(issue => issue.targetId))]
}

export function missingPracticeFragmentIds(course: MainlineCourse): string[] {
  return [...new Set(auditMainlineCourse(course)
    .filter(issue => (
      issue.severity === 'blocking'
      && issue.targetType === 'fragment'
      && issue.message === MISSING_PRACTICE_ISSUE_MESSAGE
    ))
    .map(issue => issue.targetId))]
}

export function practiceRepairPlan(course: MainlineCourse): PracticeRepairPlan {
  const sceneIds = problemPracticeSceneIds(course)
  const missingFragmentIds = missingPracticeFragmentIds(course)
  return { sceneIds, missingFragmentIds, total: sceneIds.length + missingFragmentIds.length }
}

function insertedPracticeId(course: MainlineCourse, fragmentId: string): string {
  const stem = `repair-${fragmentId.replace(/[^a-zA-Z0-9_-]/g, '-')}-practice`
  const used = new Set(course.scenes.map(scene => scene.id))
  if (!used.has(stem)) return stem
  let suffix = 2
  while (used.has(`${stem}-${suffix}`)) suffix += 1
  return `${stem}-${suffix}`
}

/**
 * 给一个已经有逐知识点目标、但完全缺少独立练习的片段补一张标准练习骨架。
 * 只做结构插入，不调用模型也不落库；调用方必须紧接着重生成这张占位页。
 */
export function insertMissingPracticeForFragment(
  course: MainlineCourse,
  fragmentId: string,
): { course: MainlineCourse; sceneId: string } {
  const fragmentIndex = course.learningFragments.findIndex(fragment => fragment.id === fragmentId)
  if (fragmentIndex === -1) throw new PracticeRefreshStructureError(`找不到学习片段：${fragmentId}`)
  const fragment = course.learningFragments[fragmentIndex]!
  if (!fragment.kpId) throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 没有知识点映射，不能自动补练习。`)
  if (!Number.isFinite(fragment.durationTargetSec) || fragment.durationTargetSec <= 0) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 的时长无效，不能安全插入练习。`)
  }

  const fragmentScenes = fragment.sceneIds.map(sceneId => course.scenes.find(scene => scene.id === sceneId))
  if (fragmentScenes.some(scene => !scene) || fragmentScenes.length === 0) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 的页面引用不完整，不能安全插入练习。`)
  }
  if (fragmentScenes.some(scene => scene?.sceneType === 'practice')) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 已有独立练习，不应重复插入。`)
  }

  const goal = course.goals.find(candidate => candidate.id === fragment.goalId)
  if (!goal?.kpId || goal.kpId !== fragment.kpId) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 尚未绑定同知识点目标，不能自动补练习。`)
  }
  const source = course.sourceMaterial.find(item => item.kpId === fragment.kpId)
  if (!source?.title.trim()) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 缺少知识点标题，不能生成目标对齐练习。`)
  }

  const indices = fragment.sceneIds.map(sceneId => course.scenes.findIndex(scene => scene.id === sceneId))
  if (indices.some(index => index < 0)) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 的页面顺序无法确认，不能安全插入练习。`)
  }
  if (indices.some((index, position) => position > 0 && index <= indices[position - 1]!)) {
    throw new PracticeRefreshStructureError(`学习片段 ${fragmentId} 的页面顺序与整课不一致，不能安全插入练习。`)
  }
  const insertAt = Math.max(...indices) + 1
  const sceneId = insertedPracticeId(course, fragmentId)
  const scene = {
    ...buildPracticeScene({
      id: sceneId,
      kpId: fragment.kpId,
      focus: source.title.trim(),
      topic: course.topic,
      kpTextBlock: course.sourceMaterial.map(item => item.title).filter(Boolean).join('、'),
      teacherCastId: course.selectedTeacher,
      studentCastId: course.peerRoleProfile.peerId,
      subject: course.subject,
    }, true),
    executor: 'ai' as const,
    durationTargetSec: INSERTED_PRACTICE_DURATION_SEC,
  }
  const scenes = [...course.scenes.slice(0, insertAt), scene, ...course.scenes.slice(insertAt)]
  const learningFragments = course.learningFragments.map((candidate, index) => index === fragmentIndex
    ? {
        ...candidate,
        sceneIds: [...candidate.sceneIds, sceneId],
        durationTargetSec: candidate.durationTargetSec + INSERTED_PRACTICE_DURATION_SEC,
      }
    : candidate)

  return {
    sceneId,
    course: {
      ...course,
      scenes,
      learningFragments,
      beats: buildBeats(scenes),
      qualityStatus: 'blocked',
    },
  }
}

/**
 * 重生成当前课程中无法独立作答、提前泄题、反馈无效或目标错位的练习页。
 * 本函数不落库；调用方必须等全部页面通过后再一次性保存，避免留下半修课程。
 */
export async function refreshProblemPractices(
  course: MainlineCourse,
  opts: RefreshProblemPracticesOptions = {},
): Promise<RefreshProblemPracticesResult> {
  const plan = practiceRepairPlan(course)
  if (plan.total === 0) {
    return { course, regeneratedSceneIds: [], insertedSceneIds: [], issues: auditMainlineCourse(course) }
  }

  const regenerator = opts.regenerate ?? regenerateScene
  const regenerationOptions = {
    ...(opts.llm ? { llm: opts.llm } : {}),
    ...(opts.season ? { season: opts.season } : {}),
  }
  let current = course
  const insertedSceneIds: string[] = []

  for (const fragmentId of plan.missingFragmentIds) {
    const inserted = insertMissingPracticeForFragment(current, fragmentId)
    insertedSceneIds.push(inserted.sceneId)
    const outcome = await regenerator(inserted.course, inserted.sceneId, regenerationOptions)
    if ('error' in outcome) throw new Error(outcome.error)
    current = outcome.course
  }

  for (const sceneId of plan.sceneIds) {
    const outcome = await regenerator(current, sceneId, regenerationOptions)
    if ('error' in outcome) throw new Error(outcome.error)
    current = outcome.course
  }

  const remaining = practiceRepairPlan(current)
  const targetSceneIds = new Set([...plan.sceneIds, ...insertedSceneIds])
  const targetFragmentIds = new Set(plan.missingFragmentIds)
  const unresolvedTargetIds = [
    ...remaining.sceneIds.filter(sceneId => targetSceneIds.has(sceneId)),
    ...remaining.missingFragmentIds.filter(fragmentId => targetFragmentIds.has(fragmentId)),
  ]
  if (unresolvedTargetIds.length > 0) throw new PracticeRefreshIncompleteError(unresolvedTargetIds)

  return {
    course: current,
    regeneratedSceneIds: [...insertedSceneIds, ...plan.sceneIds],
    insertedSceneIds,
    issues: auditMainlineCourse(current),
  }
}

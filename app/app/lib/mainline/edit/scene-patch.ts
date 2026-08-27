/**
 * scene-patch · v5 M1 单页改讲稿(备课工作台逐页编辑的最小单元)
 *
 * 修复"看得见、改不动"断点的核心动作:允许教师直接改写一个 scene 的内容字段,
 * 不必整课 fill?force=1 重填。保存时只跑确定性质量闸门；若事实承载字段真的变化，
 * 旧核查结论立即失效并进入 pendingSceneIds，教师可在同页点击“核查本页”。
 */

import { auditMainlineCourse, blockingQualityIssues, type QualityIssue } from '../quality-gates.js'
import { AI_VERIFY_OVERLAP_THRESHOLD, aiVerifyTextOverlapRatio } from '../ai-verify.js'
import { misconceptionSourcesOf, type Executor, type LessonScene, type MainlineCourse } from '../domain.js'
import { hasPendingFactAudit, invalidateSceneFactAudit } from './fact-audit-utils.js'

/**
 * 与 domain.ts EDITABLE_SCENE_FIELDS 一一对应的可选 patch 形状。
 * 字段类型显式带 `| undefined`——匹配 zod `.optional()` 在
 * `exactOptionalPropertyTypes: true` 下的推断形状(路由层直接把
 * `ScenePatchSchema` 解析结果传进来,两边类型必须结构一致)。
 */
export interface ScenePatch {
  contentSlots?: Record<string, string> | undefined
  visualFocus?: string | undefined
  narrationAnchor?: string | undefined
  boardText?: string[] | undefined
  teacherScript?: string | undefined
  studentAction?: string | undefined
  evidenceOnScreen?: string[] | undefined
  /** contrast / ai-verify 页明确处理的教材误区原文；必须由服务端按当前教材元数据校验。 */
  misconceptionSources?: string[] | undefined
  voiceCue?: {
    castId?: string | undefined
    emotion: string
    pace: 'slow' | 'medium' | 'fast'
    pauseRule: string
  } | undefined
  /** v5 M2:教师调整本幕人机分工(不属于 AI 填槽内容,但同走逐页 PATCH 白名单)。 */
  executor?: Executor | undefined
}

export interface ApplyScenePatchResult {
  course: MainlineCourse
  issues: QualityIssue[]
}

export type ApplyScenePatchOutcome = ApplyScenePatchResult | {
  error: string
  code: 'not_found' | 'invalid_patch'
}

export interface ScenePatchConstraints {
  /** 当前 KP 教材元数据中的误区原文。只有修改 misconceptionSources 时必须提供。 */
  allowedMisconceptions?: readonly string[]
}

export function applyScenePatch(
  course: MainlineCourse,
  sceneId: string,
  patch: ScenePatch,
  constraints: ScenePatchConstraints = {},
): ApplyScenePatchOutcome {
  const index = course.scenes.findIndex(s => s.id === sceneId)
  if (index === -1) return { error: `scene not found: ${sceneId}`, code: 'not_found' }

  const scenes = [...course.scenes]
  // 逐字段条件展开(而非 `...patch` 整体展开):patch 字段是"可能不存在"的可选值,
  // 整体展开在 exactOptionalPropertyTypes 下无法向 LessonScene 的必填字段赋值。
  const base = scenes[index]!
  const misconceptionValidation = validateMisconceptionPatch(base, patch, constraints.allowedMisconceptions)
  if (misconceptionValidation.error) return { error: misconceptionValidation.error, code: 'invalid_patch' }
  const misconceptionSources = misconceptionValidation.sources

  if (patch.contentSlots !== undefined) {
    const allowAiVerifyPairResize = base.sceneType === 'ai-verify' && misconceptionSources !== undefined
    const expected = new Set(allowAiVerifyPairResize
      ? expectedAiVerifySlotKeys(base.contentSlots, misconceptionSources.length)
      : Object.keys(base.contentSlots))
    const actual = new Set(Object.keys(patch.contentSlots))
    const missing = [...expected].filter(key => !actual.has(key))
    const extra = [...actual].filter(key => !expected.has(key))
    if (missing.length > 0 || extra.length > 0) {
      const details = [
        ...(missing.length > 0 ? [`缺少 ${missing.join('、')}`] : []),
        ...(extra.length > 0 ? [`新增 ${extra.join('、')}`] : []),
      ].join('；')
      return {
        error: `contentSlots 只能修改现有槽位的文字，不能改变槽位结构（${details}）。`,
        code: 'invalid_patch',
      }
    }
  }
  const patchedScene: LessonScene = {
    ...base,
    ...(patch.contentSlots !== undefined ? { contentSlots: patch.contentSlots } : {}),
    ...(patch.visualFocus !== undefined ? { visualFocus: patch.visualFocus } : {}),
    ...(patch.narrationAnchor !== undefined ? { narrationAnchor: patch.narrationAnchor } : {}),
    ...(patch.boardText !== undefined ? { boardText: patch.boardText } : {}),
    ...(patch.teacherScript !== undefined ? { teacherScript: patch.teacherScript } : {}),
    ...(patch.studentAction !== undefined ? { studentAction: patch.studentAction } : {}),
    ...(patch.evidenceOnScreen !== undefined ? { evidenceOnScreen: patch.evidenceOnScreen } : {}),
    ...(misconceptionSources !== undefined ? {
      misconceptionSource: misconceptionSources[0]!,
      misconceptionSources,
    } : {}),
    ...(patch.voiceCue !== undefined ? {
      voiceCue: {
        emotion: patch.voiceCue.emotion,
        pace: patch.voiceCue.pace,
        pauseRule: patch.voiceCue.pauseRule,
        ...(patch.voiceCue.castId ? { castId: patch.voiceCue.castId } : {}),
      },
    } : {}),
    ...(patch.executor !== undefined ? { executor: patch.executor } : {}),
    editedByTeacher: true,
  }
  scenes[index] = patchedScene

  const factualContentChanged = hasFactualContentChanged(base, patchedScene)
  const factAudit = factualContentChanged
    ? invalidateSceneFactAudit(course.factAudit, sceneId)
    : course.factAudit
  const draftCourse: MainlineCourse = { ...course, scenes, ...(factAudit ? { factAudit } : {}) }

  const issues = auditMainlineCourse(draftCourse)
  const blocking = blockingQualityIssues(issues)
  const fatalStillOpen = (factAudit?.fatalCount ?? 0) > 0
  const finalCourse: MainlineCourse = {
    ...draftCourse,
    qualityStatus: blocking.length === 0 && !fatalStillOpen && !hasPendingFactAudit(factAudit) ? 'passed' : 'blocked',
  }
  return { course: finalCourse, issues }
}

function hasFactualContentChanged(before: LessonScene, after: LessonScene): boolean {
  return !sameRecord(before.contentSlots, after.contentSlots)
    || before.visualFocus !== after.visualFocus
    || before.narrationAnchor !== after.narrationAnchor
    || !sameArray(before.boardText, after.boardText)
    || before.teacherScript !== after.teacherScript
    || before.studentAction !== after.studentAction
    || !sameArray(before.evidenceOnScreen, after.evidenceOnScreen)
    || !sameArray(misconceptionSourcesOf(before), misconceptionSourcesOf(after))
}

function validateMisconceptionPatch(
  scene: LessonScene,
  patch: ScenePatch,
  allowedMisconceptions: readonly string[] | undefined,
): { sources?: string[]; error?: string } {
  if (patch.misconceptionSources === undefined) return {}
  if (scene.sceneType !== 'contrast' && scene.sceneType !== 'ai-verify') {
    return { error: '只有辨析页或 AI 核查页可以声明所处理的教材误区。' }
  }
  if (!scene.kpId) return { error: '本页没有关联知识点，无法绑定教材误区。' }
  if (!patch.contentSlots) return { error: '修改教材误区归属时必须同时提交本页核心内容。' }

  const sources = patch.misconceptionSources.map(source => source.trim()).filter(Boolean)
  if (sources.length === 0) return { error: '至少选择一条本页明确处理的教材误区。' }
  if (new Set(sources).size !== sources.length) return { error: '同一条教材误区不能重复选择。' }
  if (!allowedMisconceptions) return { error: '缺少当前教材误区元数据，已拒绝修改以避免写入无依据内容。' }
  const unknown = sources.filter(source => !allowedMisconceptions.includes(source))
  if (unknown.length > 0) {
    return { error: `以下内容不是当前教材登记的误区原文：${unknown.join('；')}` }
  }

  if (scene.sceneType === 'contrast') {
    if (sources.length !== 1) return { error: '一张辨析页一次只处理一条教材误区。' }
    if (patch.contentSlots.misconception?.trim() !== sources[0]) {
      return { error: '辨析页的“错误想法”必须与所选教材误区原文一致。' }
    }
    if (!patch.contentSlots.correction?.trim()) {
      return { error: '选定教材误区后，必须填写对应的修正结论。' }
    }
    return { sources }
  }

  const multi = sources.length > 1
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!
    const claimKey = multi ? `aiClaim${index + 1}` : 'aiClaim'
    const revealKey = multi ? `reveal${index + 1}` : 'reveal'
    const claim = patch.contentSlots[claimKey]?.trim() ?? ''
    if (aiVerifyTextOverlapRatio(source, claim) < AI_VERIFY_OVERLAP_THRESHOLD) {
      return { error: `第 ${index + 1} 条 AI 错误说法没有紧扣所选教材误区，请先修正“${claimKey}”。` }
    }
    if (!patch.contentSlots[revealKey]?.trim()) {
      return { error: `第 ${index + 1} 条教材误区缺少对应核查结论，请填写“${revealKey}”。` }
    }
  }
  if (multi) {
    const mergedClaim = patch.contentSlots.aiClaim?.trim() ?? ''
    if (!sources.every(source => aiVerifyTextOverlapRatio(source, mergedClaim) >= AI_VERIFY_OVERLAP_THRESHOLD)) {
      return { error: 'AI 核查页的合并错误说法必须覆盖全部所选教材误区。' }
    }
    if (!patch.contentSlots.reveal?.trim()) {
      return { error: 'AI 核查页的合并核查结论不能为空。' }
    }
  }
  return { sources }
}

const AI_VERIFY_PAIR_SLOT = /^(?:aiClaim|reveal)\d+$/

function expectedAiVerifySlotKeys(contentSlots: Record<string, string>, sourceCount: number): string[] {
  const stable = Object.keys(contentSlots).filter(key => !AI_VERIFY_PAIR_SLOT.test(key))
  if (sourceCount <= 1) return stable
  return [
    ...stable,
    ...Array.from({ length: sourceCount }, (_, index) => [`aiClaim${index + 1}`, `reveal${index + 1}`]).flat(),
  ]
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every(key => left[key] === right[key])
}

import type { FactRepairTrace, MainlineCourse } from '../domain.js'
import type { QualityIssue } from '../quality-gates.js'
import { fillSceneInContext, type FillLLMCall } from './fill-scenes.js'
import { factAuditCourse, type FactAuditResult } from './fact-audit.js'

const DEFAULT_MAX_ATTEMPTS = 2
const HARD_MAX_ATTEMPTS = 3

type RepairSeverity = Extract<QualityIssue['severity'], 'blocking' | 'warning'>

export interface FactRepairOptions {
  llm?: FillLLMCall
  protectTeacherEdits?: boolean
  severities?: readonly RepairSeverity[]
}

export interface FactRepairResult {
  course: MainlineCourse
  attemptedSceneIds: string[]
  repairedSceneIds: string[]
  skipped: Array<{
    sceneId: string
    reason: 'teacher-edit-protected' | 'scene-missing'
  }>
  failed: Array<{ sceneId: string; error: string }>
}

export interface FactRepairLoopResult {
  course: MainlineCourse
  fact: FactAuditResult
  trace: FactRepairTrace
}

export type FactAuditCall = typeof factAuditCourse
export type FactRepairCall = (
  course: MainlineCourse,
  issues: readonly QualityIssue[],
  opts?: FactRepairOptions,
) => Promise<FactRepairResult>

export interface FactRepairLoopOptions {
  maxAttempts?: number
  llm?: FillLLMCall
  protectTeacherEdits?: boolean
  audit?: FactAuditCall
  repair?: FactRepairCall
}

function actionableInstructionsByScene(
  issues: readonly QualityIssue[],
  severities: readonly RepairSeverity[],
): Map<string, string[]> {
  const allowed = new Set(severities)
  const grouped = new Map<string, string[]>()
  for (const issue of issues) {
    if (issue.targetType !== 'scene' || !allowed.has(issue.severity as RepairSeverity)) continue
    // 跨幕冲突没有权威依据证明应改哪一侧，禁止自动重写某一页把另一页的错误扩散过去。
    if (issue.id.includes(':consistency-')) continue
    const instructions = grouped.get(issue.targetId) ?? []
    instructions.push(`${issue.message}。依据:${issue.impact}。修正:${issue.fix}`)
    grouped.set(issue.targetId, instructions)
  }
  return grouped
}

/**
 * 把事实核查的 blocking/warning 反馈给原场景做一次定向重写。
 * 默认不覆盖教师手改页；单页失败时保留原内容，避免一次回修让整课生成丢失。
 */
export async function repairFactIssues(
  course: MainlineCourse,
  issues: readonly QualityIssue[],
  opts?: FactRepairOptions,
): Promise<FactRepairResult> {
  const severities = opts?.severities ?? ['blocking', 'warning']
  const instructionsByScene = actionableInstructionsByScene(issues, severities)
  const attemptedSceneIds: string[] = []
  const repairedSceneIds: string[] = []
  const skipped: FactRepairResult['skipped'] = []
  const failed: FactRepairResult['failed'] = []
  let nextCourse = course

  for (const [sceneId, instructions] of instructionsByScene) {
    const scene = nextCourse.scenes.find(item => item.id === sceneId)
    if (!scene) {
      skipped.push({ sceneId, reason: 'scene-missing' })
      continue
    }
    if ((opts?.protectTeacherEdits ?? true) && scene.editedByTeacher) {
      skipped.push({ sceneId, reason: 'teacher-edit-protected' })
      continue
    }
    attemptedSceneIds.push(sceneId)
    try {
      const result = await fillSceneInContext(nextCourse, sceneId, {
        ...(opts?.llm ? { llm: opts.llm } : {}),
        repairInstructions: instructions,
      })
      nextCourse = {
        ...nextCourse,
        scenes: nextCourse.scenes.map(item => item.id === sceneId ? result.scene : item),
      }
      repairedSceneIds.push(sceneId)
    } catch (error) {
      failed.push({ sceneId, error: String(error).slice(0, 500) })
    }
  }

  return { course: nextCourse, attemptedSceneIds, repairedSceneIds, skipped, failed }
}

/** 用定向复核结果替换旧场景问题，其余幕沿用首轮核查，避免整课重复烧模型。 */
export function mergeFactAuditAfterRepair(
  original: FactAuditResult,
  rechecked: FactAuditResult,
  repairedSceneIds: readonly string[],
): FactAuditResult {
  const repaired = new Set(repairedSceneIds)
  const factVerified = new Set(rechecked.auditedSceneIds)
  const consistencyVerified = new Set(rechecked.consistencyAuditedSceneIds)
  const touchesVerifiedConsistencyScene = (issue: QualityIssue) => (
    consistencyVerified.has(issue.targetId)
    || issue.relatedTargetIds?.some(sceneId => consistencyVerified.has(sceneId)) === true
  )
  const combinedIssues = [
    // 核查服务异常时 rechecked 会给出「未验证」info，但不会写 auditedSceneIds。
    // 此时必须保留原 blocking/warning，不能因“重写过”就把严重问题静默清掉。
    ...original.issues.filter(issue => issue.id.includes(':consistency-')
      ? !touchesVerifiedConsistencyScene(issue)
      : !factVerified.has(issue.targetId)),
    ...rechecked.issues,
  ]
  const seenIssues = new Set<string>()
  const issues = combinedIssues.filter(issue => {
    const key = `${issue.id}|${issue.severity}|${issue.targetId}|${issue.message}`
    if (seenIssues.has(key)) return false
    seenIssues.add(key)
    return true
  })
  const auditedSceneIds = [...new Set([
    ...original.auditedSceneIds.filter(sceneId => !repaired.has(sceneId)),
    ...rechecked.auditedSceneIds,
  ])]
  const consistencyAuditedSceneIds = [...new Set([
    ...original.consistencyAuditedSceneIds.filter(sceneId => !repaired.has(sceneId)),
    ...rechecked.consistencyAuditedSceneIds,
  ])]
  const requiredSceneIds = [...new Set([
    ...original.requiredSceneIds.filter(sceneId => !repaired.has(sceneId)),
    ...rechecked.requiredSceneIds,
  ])]
  const unverifiedSceneIds = [...new Set([
    ...original.unverifiedSceneIds.filter(sceneId => !repaired.has(sceneId)),
    ...rechecked.unverifiedSceneIds,
  ])]
  return {
    issues,
    fatalCount: issues.filter(issue => issue.severity === 'blocking').length,
    auditedSceneCount: auditedSceneIds.length,
    auditedSceneIds,
    requiredSceneIds,
    unverifiedSceneIds,
    consistencyAuditedSceneIds,
    consistencyConflictCount: issues.filter(issue => issue.id.includes(':consistency-') && issue.severity !== 'info').length,
  }
}

/**
 * 读取可配置重试次数，并强制限制在 0..3。0 可用于临时关闭自动修正；默认 2。
 * 上限是成本保险丝，避免错误配置把生成请求变成无限 LLM 循环。
 */
export function configuredFactRepairMaxAttempts(
  raw = process.env.MAOLAB_FACT_REPAIR_MAX_ATTEMPTS,
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_ATTEMPTS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ATTEMPTS
  return clampAttemptCount(parsed)
}

function clampAttemptCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_ATTEMPTS
  return Math.min(HARD_MAX_ATTEMPTS, Math.max(0, Math.trunc(value)))
}

function countIssues(fact: FactAuditResult, severity: RepairSeverity): number {
  return fact.issues.filter(issue => issue.severity === severity).length
}

/**
 * fill 后的有界事实修正循环。
 *
 * 首轮维持既有行为：blocking 与 warning 一并定向修正。若仍有 blocking，后续轮次
 * 只追阻断问题，避免为措辞提醒反复烧模型。每次只复核实际重写成功的幕；核查失败
 * 保留旧阻断，达到上限或无法继续推进时停止并留下完整轨迹。
 */
export async function repairFactIssuesUntilStable(
  course: MainlineCourse,
  initialFact: FactAuditResult,
  opts?: FactRepairLoopOptions,
): Promise<FactRepairLoopResult> {
  const maxAttempts = opts?.maxAttempts === undefined
    ? configuredFactRepairMaxAttempts()
    : clampAttemptCount(opts.maxAttempts)
  const audit = opts?.audit ?? factAuditCourse
  const repair = opts?.repair ?? repairFactIssues
  const attempts: FactRepairTrace['attempts'] = []
  let nextCourse = course
  let fact = initialFact

  const initialUnverified = new Set(fact.unverifiedSceneIds)
  const hasActionableIssue = fact.issues.some(
    issue => !initialUnverified.has(issue.targetId)
      && (issue.severity === 'blocking' || issue.severity === 'warning'),
  )
  if (!hasActionableIssue) {
    return {
      course: nextCourse,
      fact,
      trace: { maxAttempts, attempts, stoppedReason: 'no-actionable-issues' },
    }
  }

  let stoppedReason: FactRepairTrace['stoppedReason'] = 'max-attempts'
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const scope: FactRepairTrace['attempts'][number]['scope'] = attempt === 1
      ? 'blocking-and-warning'
      : 'blocking-only'
    const severities: readonly RepairSeverity[] = attempt === 1
      ? ['blocking', 'warning']
      : ['blocking']
    const unverified = new Set(fact.unverifiedSceneIds)
    const scopedIssues = fact.issues.filter(
      issue => !unverified.has(issue.targetId)
        && (issue.severity === 'blocking' || (attempt === 1 && issue.severity === 'warning')),
    )
    if (scopedIssues.length === 0) {
      stoppedReason = 'no-blocking-issues'
      break
    }

    const result = await repair(nextCourse, scopedIssues, {
      ...(opts?.llm ? { llm: opts.llm } : {}),
      protectTeacherEdits: opts?.protectTeacherEdits ?? true,
      severities,
    })
    nextCourse = result.course
    if (result.repairedSceneIds.length > 0) {
      const rechecked = await audit(nextCourse, { sceneIds: result.repairedSceneIds })
      fact = mergeFactAuditAfterRepair(fact, rechecked, result.repairedSceneIds)
    }

    attempts.push({
      attempt,
      scope,
      attemptedSceneIds: result.attemptedSceneIds,
      repairedSceneIds: result.repairedSceneIds,
      skipped: result.skipped,
      failed: result.failed,
      remainingBlockingCount: countIssues(fact, 'blocking'),
      remainingWarningCount: countIssues(fact, 'warning'),
    })

    if (countIssues(fact, 'blocking') === 0) {
      stoppedReason = 'no-blocking-issues'
      break
    }
    if (result.repairedSceneIds.length === 0) {
      stoppedReason = 'no-progress'
      break
    }
    if (attempt === maxAttempts) stoppedReason = 'max-attempts'
  }

  return {
    course: nextCourse,
    fact,
    trace: { maxAttempts, attempts, stoppedReason },
  }
}

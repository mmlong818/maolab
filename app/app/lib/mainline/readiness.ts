/**
 * 课程发布就绪判定。
 *
 * qualityStatus 是上次填充或编辑时落库的结果；质量规则会继续演进，因此它不能单独
 * 作为上课、排练和导出的放行依据。这里在每个发布边界重新运行确定性闸门，并合并
 * 已落库的事实核查阻断与教师修改后的待核查页。判定只允许把旧 passed 降级为 blocked，
 * 不会在读取时把 draft/blocked 静默升级，也不会写数据库。
 */
import type { MainlineCourse, QualityGateId } from './domain.js'
import {
  auditMainlineCourse,
  type QualityIssue,
  type QualitySummary,
  summarizeQuality,
} from './quality-gates.js'

export type CourseReleaseStatus = MainlineCourse['qualityStatus']
export type CourseReleaseBlockerSource = 'quality-gate' | 'fact-audit' | 'fact-audit-unverified' | 'fact-audit-pending' | 'persisted-status'

export interface CourseReleaseBlocker {
  source: CourseReleaseBlockerSource
  gate: QualityGateId | 'fact-audit' | 'status'
  targetId: string
  message: string
  /** 一条汇总记录可能代表旧数据里未展开的多个事实阻断。 */
  count: number
}

export interface CourseReleaseReadiness {
  storedStatus: CourseReleaseStatus
  status: CourseReleaseStatus
  ready: boolean
  /** 上次落库为 passed，但按当前规则已不能发布。 */
  stalePassed: boolean
  blockingCount: number
  warningCount: number
  deterministicSummary: QualitySummary
  deterministicIssues: QualityIssue[]
  blockers: CourseReleaseBlocker[]
}

function unique(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])]
}

const MISLEADING_FACT_PATTERN = /^断言核查\s+MISLEADING:/i
const UNVERIFIED_FACT_PATTERN = /事实核查未完成.*未经验证/

function isReleaseBlockingFactIssue(issue: NonNullable<MainlineCourse['factAudit']>['issues'][number]): boolean {
  return issue.severity === 'blocking' || MISLEADING_FACT_PATTERN.test(issue.message)
}

export function courseReleaseReadinessFromIssues(
  course: MainlineCourse,
  deterministicIssues: readonly QualityIssue[],
): CourseReleaseReadiness {
  const issues = [...deterministicIssues]
  const deterministicSummary = summarizeQuality(issues)
  const blockers: CourseReleaseBlocker[] = issues
    .filter(issue => issue.severity === 'blocking')
    .map(issue => ({
      source: 'quality-gate',
      gate: issue.gate,
      targetId: issue.targetId,
      message: issue.message,
      count: 1,
    }))

  // 存量课中的 MISLEADING 仍保存为 warning。发布边界按当前语义重判，不能要求批量
  // 改写数据库后才生效；这与确定性质量规则对旧 passed 的实时降级一致。
  const factBlocking = (course.factAudit?.issues ?? []).filter(isReleaseBlockingFactIssue)
  blockers.push(...factBlocking.map(issue => ({
    source: 'fact-audit' as const,
    gate: 'fact-audit' as const,
    targetId: issue.targetId,
    message: issue.message,
    count: 1,
  })))

  const recordedFactBlocking = Math.max(course.factAudit?.fatalCount ?? 0, factBlocking.length)
  const unexpandedFactBlocking = recordedFactBlocking - factBlocking.length
  if (unexpandedFactBlocking > 0) {
    blockers.push({
      source: 'fact-audit',
      gate: 'fact-audit',
      targetId: course.id,
      message: `事实核查仍记录 ${unexpandedFactBlocking} 个未展开的阻断项，请重新核查后再发布。`,
      count: unexpandedFactBlocking,
    })
  }

  const legacyUnverifiedSceneIds = (course.factAudit?.issues ?? [])
    .filter(issue => UNVERIFIED_FACT_PATTERN.test(issue.message))
    .map(issue => issue.targetId)
  const unverifiedSceneIds = unique([
    ...(course.factAudit?.unverifiedSceneIds ?? []),
    ...legacyUnverifiedSceneIds,
  ])
  const unverified = new Set(unverifiedSceneIds)
  for (const sceneId of unverifiedSceneIds) {
    blockers.push({
      source: 'fact-audit-unverified',
      gate: 'fact-audit',
      targetId: sceneId,
      message: `页面「${sceneId}」需要事实核查，但核查服务失败，当前内容尚未验证。`,
      count: 1,
    })
  }

  for (const sceneId of unique(course.factAudit?.pendingSceneIds).filter(id => !unverified.has(id))) {
    blockers.push({
      source: 'fact-audit-pending',
      gate: 'fact-audit',
      targetId: sceneId,
      message: `页面「${sceneId}」由教师修改后尚未重新进行事实核查。`,
      count: 1,
    })
  }

  const currentBlockingCount = blockers.reduce((sum, blocker) => sum + blocker.count, 0)
  const ready = course.qualityStatus === 'passed' && currentBlockingCount === 0
  const stalePassed = course.qualityStatus === 'passed' && !ready
  const status: CourseReleaseStatus = course.qualityStatus === 'draft'
    ? 'draft'
    : ready
      ? 'passed'
      : 'blocked'

  // 读取时绝不把旧 blocked 洗白。若其旧阻断明细已经缺失，保留一条可见的发布阻断，
  // 避免界面出现“阻断 · 0”或直接重新放行。
  if (course.qualityStatus === 'blocked' && currentBlockingCount === 0) {
    blockers.push({
      source: 'persisted-status',
      gate: 'status',
      targetId: course.id,
      message: '课程上次质量检查仍为阻断状态，请在备课中重新确认并保存检查结果。',
      count: 1,
    })
  }

  return {
    storedStatus: course.qualityStatus,
    status,
    ready,
    stalePassed,
    blockingCount: blockers.reduce((sum, blocker) => sum + blocker.count, 0),
    warningCount: deterministicSummary.warning + (course.factAudit?.issues ?? []).filter(issue => issue.severity === 'warning').length,
    deterministicSummary,
    deterministicIssues: issues,
    blockers,
  }
}

export function auditCourseReleaseReadiness(course: MainlineCourse): CourseReleaseReadiness {
  return courseReleaseReadinessFromIssues(course, auditMainlineCourse(course))
}

export function courseReleaseReason(readiness: CourseReleaseReadiness): string | undefined {
  if (readiness.ready) return undefined
  if (readiness.status === 'draft') return '课程还是骨架草稿，需先完成内容填充才能进行此操作。'
  if (readiness.stalePassed) {
    return `课程上次记录为已通过，但当前质量规则发现 ${readiness.blockingCount} 个阻断项，请先在备课中修正。`
  }
  return `课程未通过当前质量检查（${readiness.blockingCount} 个阻断项），请先在备课中修正。`
}

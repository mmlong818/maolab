/**
 * 存量多知识点课程的目标追溯迁移。
 *
 * 只使用当前知识点索引中已有的可观察学习目标；保留原整课目标，并把每个
 * 知识点片段改绑到新增的逐知识点目标。索引缺失、标题不一致、目标不可检核
 * 或片段映射有歧义时整批失败，不猜测也不留下半迁移课程。
 */

import type { LessonGoal, MainlineCourse } from '../domain.js'
import { selectObservableObjective, successSignalFromObjective } from '../learning-goal-contract.js'
import { auditCourseReleaseReadiness } from '../readiness.js'
import type { QualityIssue } from '../quality-gates.js'
import type { KpGoalMetadata } from './kp-goal-loader.js'

export class KpGoalRefreshError extends Error {
  readonly code = 'KP_GOAL_REFRESH_UNSAFE'
  constructor(
    message: string,
    readonly reasons: readonly string[],
  ) {
    super(message)
    this.name = 'KpGoalRefreshError'
  }
}

export interface RefreshKpGoalsResult {
  course: MainlineCourse
  issues: QualityIssue[]
  createdGoals: LessonGoal[]
  reboundFragmentIds: string[]
}

export function courseNeedsKpGoalRefresh(course: MainlineCourse): boolean {
  const sourceKpIds = uniqueSourceKps(course).map(source => source.kpId)
  return sourceKpIds.length > 1 && !course.goals.some(goal => Boolean(goal.kpId?.trim()))
}

export function refreshCourseKpGoals(
  course: MainlineCourse,
  metadataByKp: Readonly<Record<string, KpGoalMetadata>>,
): RefreshKpGoalsResult {
  if (!courseNeedsKpGoalRefresh(course)) {
    throw new KpGoalRefreshError(
      '当前课程不属于可自动重建的旧版整课目标结构。',
      ['只处理“多个教材知识点且尚无任何逐知识点目标”的存量课程。'],
    )
  }

  const sources = uniqueSourceKps(course)
  const reasons: string[] = []
  const objectives = new Map<string, string>()
  for (const source of sources) {
    const metadata = metadataByKp[source.kpId]
    if (!metadata) {
      reasons.push(`知识点「${source.title}」在当前索引中不存在。`)
      continue
    }
    if (normalizedTitle(metadata.canonicalName) !== normalizedTitle(source.title)) {
      reasons.push(`知识点 ${source.kpId} 的课程标题与当前索引标题不一致。`)
      continue
    }
    const objective = selectObservableObjective(metadata.learningObjectives)
    if (!objective) {
      reasons.push(`知识点「${source.title}」没有可观察、可检核的索引目标。`)
      continue
    }
    objectives.set(source.kpId, objective)

    const fragments = course.learningFragments.filter(fragment => fragment.kpId === source.kpId)
    if (fragments.length !== 1) {
      reasons.push(`知识点「${source.title}」应恰好对应一个学习片段，当前为 ${fragments.length} 个。`)
    }
  }

  const sourceKpIds = new Set(sources.map(source => source.kpId))
  const unknownFragments = course.learningFragments.filter(fragment => fragment.kpId && !sourceKpIds.has(fragment.kpId))
  if (unknownFragments.length > 0) {
    reasons.push(`存在 ${unknownFragments.length} 个无法追溯到本课教材知识点的学习片段。`)
  }
  if (reasons.length > 0) {
    throw new KpGoalRefreshError('知识点目标重建条件不完整，课程未修改。', reasons)
  }

  const usedGoalIds = new Set(course.goals.map(goal => goal.id))
  const createdGoals = sources.map((source, index): LessonGoal => {
    const objective = objectives.get(source.kpId)!
    return {
      id: uniqueGoalId(`goal-kp-${String(index + 1).padStart(2, '0')}`, usedGoalIds),
      kpId: source.kpId,
      statement: objective,
      successSignal: successSignalFromObjective(objective),
    }
  })
  const goalIdByKp = new Map(createdGoals.map(goal => [goal.kpId!, goal.id]))
  const reboundFragmentIds: string[] = []
  const learningFragments = course.learningFragments.map(fragment => {
    if (!fragment.kpId) return fragment
    reboundFragmentIds.push(fragment.id)
    return { ...fragment, goalId: goalIdByKp.get(fragment.kpId)! }
  })

  const candidate: MainlineCourse = {
    ...course,
    goals: [...course.goals, ...createdGoals],
    learningFragments,
  }
  const readiness = auditCourseReleaseReadiness(candidate)
  return {
    course: {
      ...candidate,
      qualityStatus: course.qualityStatus === 'draft'
        ? 'draft'
        : readiness.ready ? 'passed' : 'blocked',
    },
    issues: readiness.deterministicIssues,
    createdGoals,
    reboundFragmentIds,
  }
}

function uniqueSourceKps(course: MainlineCourse): Array<{ kpId: string; title: string }> {
  const seen = new Set<string>()
  const sources: Array<{ kpId: string; title: string }> = []
  for (const source of course.sourceMaterial) {
    const kpId = source.kpId?.trim()
    if (!kpId || seen.has(kpId)) continue
    seen.add(kpId)
    sources.push({ kpId, title: source.title })
  }
  return sources
}

function normalizedTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ')
}

function uniqueGoalId(base: string, used: Set<string>): string {
  let candidate = base
  let suffix = 1
  while (used.has(candidate)) candidate = `${base}-refreshed-${suffix++}`
  used.add(candidate)
  return candidate
}

/** 单页事实复核：不重写教师内容，只核查当前页并更新课程放行状态。 */
import type { MainlineCourse } from '../domain.js'
import { factAuditCourse } from '../generation/fact-audit.js'
import type { FillLLMCall } from '../generation/fill-scenes.js'
import { auditMainlineCourse, blockingQualityIssues, type QualityIssue } from '../quality-gates.js'
import { hasPendingFactAudit, mergeSceneIntoFactAudit } from './fact-audit-utils.js'

export interface AuditSceneFactsResult {
  course: MainlineCourse
  issues: QualityIssue[]
}

export type AuditSceneFactsOutcome = AuditSceneFactsResult | { error: string }

export async function auditSceneFacts(
  course: MainlineCourse,
  sceneId: string,
  opts?: { llm?: FillLLMCall },
): Promise<AuditSceneFactsOutcome> {
  if (!course.scenes.some(scene => scene.id === sceneId)) {
    return { error: `scene not found: ${sceneId}` }
  }

  const deterministicIssues = auditMainlineCourse(course)
  const fact = await factAuditCourse(course, {
    sceneIds: [sceneId],
    ...(opts?.llm ? { llm: opts.llm } : {}),
  })
  const factAudit = mergeSceneIntoFactAudit(
    course.factAudit,
    sceneId,
    fact.issues,
    fact.auditedSceneIds.includes(sceneId),
    course.scenes.length,
    fact.consistencyAuditedSceneIds.includes(sceneId),
  )
  const blocking = blockingQualityIssues(deterministicIssues)
  const finalCourse: MainlineCourse = {
    ...course,
    factAudit,
    qualityStatus: blocking.length === 0 && factAudit.fatalCount === 0 && !hasPendingFactAudit(factAudit)
      ? 'passed'
      : 'blocked',
  }
  return { course: finalCourse, issues: [...deterministicIssues, ...fact.issues] }
}

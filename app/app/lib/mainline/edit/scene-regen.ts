/**
 * scene-regen · v5 M1 单页重生成
 *
 * 只对一个 scene 重新走 fill(generation/fill-scenes.ts 的 fillSceneInContext),
 * 而不是整课 fill——这是"看得见、改不动"断点的另一半修复(改讲稿是教师手改,
 * 重生成是重新交给 AI)。
 *
 * 跨幕一致性对策(v5 方案 §10 风险表第一行):fillSceneInContext 内部已经把
 * 前面幕和紧邻后一幕的已有内容都注入 prompt 上下文,本文件只负责编排
 * "生成 → 全课确定性闸门 → 本幕 fact-audit → 落库前的 course 快照",不重复实现
 * 一致性注入逻辑。
 *
 * fact-audit 语义保持:FATAL 或 MISLEADING 都阻断正式授课,重生成也不能绕过
 * (否则会变成逃避事实核查的后门)。核查只针对被重生成的这一幕,不为整课重新烧 LLM。
 */

import { auditMainlineCourse, blockingQualityIssues, type QualityIssue } from '../quality-gates.js'
import type { MainlineCourse } from '../domain.js'
import { factAuditCourse } from '../generation/fact-audit.js'
import { fillSceneInContext, type FillLLMCall } from '../generation/fill-scenes.js'
import type { SeasonInjection } from '../season.js'
import { hasPendingFactAudit, mergeSceneIntoFactAudit } from './fact-audit-utils.js'

export interface RegenSceneResult {
  /** course.factAudit 已更新为合并本幕最新核查结论后的记录,调用方直接读它即可。 */
  course: MainlineCourse
  issues: QualityIssue[]
}

export type RegenSceneOutcome = RegenSceneResult | { error: string }

export async function regenerateScene(
  course: MainlineCourse,
  sceneId: string,
  opts?: { llm?: FillLLMCall; season?: SeasonInjection; repairInstructions?: readonly string[] },
): Promise<RegenSceneOutcome> {
  if (!course.scenes.some(s => s.id === sceneId)) return { error: `scene not found: ${sceneId}` }

  const { scene: regeneratedScene } = await fillSceneInContext(course, sceneId, opts)
  const scenes = course.scenes.map(s => (s.id === sceneId ? regeneratedScene : s))
  const draftCourse: MainlineCourse = { ...course, scenes }

  const issues = auditMainlineCourse(draftCourse)
  const blocking = blockingQualityIssues(issues)

  const fact = await factAuditCourse(draftCourse, { sceneIds: [sceneId], ...(opts?.llm ? { llm: opts.llm } : {}) })
  const factAudit = mergeSceneIntoFactAudit(
    course.factAudit,
    sceneId,
    fact.issues,
    fact.auditedSceneIds.includes(sceneId),
    scenes.length,
    fact.consistencyAuditedSceneIds.includes(sceneId),
  )

  const finalCourse: MainlineCourse = {
    ...draftCourse,
    factAudit,
    qualityStatus: blocking.length === 0 && factAudit.fatalCount === 0 && !hasPendingFactAudit(factAudit) ? 'passed' : 'blocked',
  }
  return { course: finalCourse, issues: [...issues, ...fact.issues] }
}

/**
 * 存量课程学习活动深化。
 *
 * 新生成课程已经具备开场预测、例题自解释和收束迁移；这里仅为旧课提供教师
 * 显式触发的确定性迁移。教师手改页不自动覆盖，学科内容、页面结构、板书、
 * 图片、角色、声线和事实核查保持不变。
 */
import type { LessonScene, MainlineCourse } from '../domain.js'
import {
  ensureStudentActionEvidence,
  ensureWorkedExampleSelfExplanation,
  WORKED_EXAMPLE_SELF_EXPLANATION_CUE,
} from '../learning-action.js'
import { lessonOpeningCopy } from '../lesson-phase.js'
import {
  auditMainlineCourse,
  EXAM_PREP_OPENING_PROGRESSION_ISSUE_MESSAGE,
  OPENING_PROGRESSION_ISSUE_MESSAGE,
  RECAP_REREAD_ISSUE_MESSAGE,
  REVIEW_OPENING_PROGRESSION_ISSUE_MESSAGE,
  STUDENT_ACTION_EVIDENCE_ISSUE_MESSAGE,
  WORKED_EXAMPLE_SELF_EXPLANATION_ISSUE_MESSAGE,
  type QualityIssue,
} from '../quality-gates.js'
import { auditCourseReleaseReadiness } from '../readiness.js'
import { recapTemplateForScene } from '../recap-template.js'
import { TEACHER_SCRIPT_HARD_MAX } from '../voice-playback.js'

export interface LearningActivityRepairPlan {
  sceneIds: string[]
  teacherEditedSceneIds: string[]
  total: number
}

export interface RefreshLearningActivitiesResult {
  course: MainlineCourse
  refreshedSceneIds: string[]
  issues: QualityIssue[]
}

export class LearningActivityRefreshIncompleteError extends Error {
  readonly code = 'LEARNING_ACTIVITY_REFRESH_INCOMPLETE'

  constructor(readonly sceneIds: readonly string[]) {
    super(`深化学习活动后仍有 ${sceneIds.length} 页未通过检查：${sceneIds.join('、')}`)
    this.name = 'LearningActivityRefreshIncompleteError'
  }
}

export const LEARNING_ACTIVITY_ISSUE_MESSAGES = new Set([
  EXAM_PREP_OPENING_PROGRESSION_ISSUE_MESSAGE,
  OPENING_PROGRESSION_ISSUE_MESSAGE,
  RECAP_REREAD_ISSUE_MESSAGE,
  REVIEW_OPENING_PROGRESSION_ISSUE_MESSAGE,
  STUDENT_ACTION_EVIDENCE_ISSUE_MESSAGE,
  WORKED_EXAMPLE_SELF_EXPLANATION_ISSUE_MESSAGE,
])

function targetedSceneIds(course: MainlineCourse): string[] {
  return [...new Set(auditMainlineCourse(course)
    .filter(issue => (
      issue.gate === 'pedagogy'
      && issue.severity === 'warning'
      && issue.targetType === 'scene'
      && LEARNING_ACTIVITY_ISSUE_MESSAGES.has(issue.message)
    ))
    .map(issue => issue.targetId))]
}

export function learningActivityRepairPlan(course: MainlineCourse): LearningActivityRepairPlan {
  const targetIds = targetedSceneIds(course)
  const teacherEdited = new Set(course.scenes.filter(scene => scene.editedByTeacher).map(scene => scene.id))
  const sceneIds = targetIds.filter(sceneId => !teacherEdited.has(sceneId))
  const teacherEditedSceneIds = targetIds.filter(sceneId => teacherEdited.has(sceneId))
  return { sceneIds, teacherEditedSceneIds, total: sceneIds.length }
}

function appendScriptCue(script: string, cue: string): string {
  if (script.includes(cue)) return script
  const candidate = `${script.trim().replace(/[。；;！!？?]+$/g, '')}。${cue}`
  return candidate.length <= TEACHER_SCRIPT_HARD_MAX ? candidate : script
}

function recapStudentAction(scene: LessonScene): string {
  const template = recapTemplateForScene(scene)
  switch (template?.id) {
    case 'belief-revision':
      return '指出一处想法变化，引用本课证据说明修正理由。'
    case 'concept-network':
      return '解释三个分支与中心主题的联系，再迁移到一个新情境。'
    case 'claim-evidence':
      return '用至少两条依据解释总论断，再举一个新例子并回看开场预测。'
    case 'learning-ladder':
      return '解释迁移阶梯中的关键一步，再把方法用于新情境。'
    default:
      return '用一个新例子解释本页结论，再回看开场预测写下一处修正。'
  }
}

function refreshOpeningScene(course: MainlineCourse, scene: LessonScene): LessonScene {
  const topic = course.topic.trim() || '本课主题'
  const kpTitles = course.sourceMaterial.map(source => source.title.trim()).filter(Boolean)
  const opening = lessonOpeningCopy({
    topic,
    kpTitles,
    ...(course.lessonPhase ? { phase: course.lessonPhase } : {}),
  })
  return {
    ...scene,
    contentSlots: {
      topic,
      learningPath: opening.learningPath,
      openingQuestion: opening.openingQuestion,
    },
    visualFocus: topic,
    narrationAnchor: topic.slice(0, 28),
    teacherScript: opening.teacherScript,
    studentAction: opening.studentAction,
    evidenceOnScreen: [topic, ...kpTitles.slice(0, 4), opening.evidenceLabel],
  }
}

function refreshTargetScene(course: MainlineCourse, scene: LessonScene): LessonScene {
  if (scene.sceneType === 'source-reading') return refreshOpeningScene(course, scene)
  if (scene.sceneType === 'recap') {
    const cue = '屏幕结论只是线索，请解释一处关系，再用新例子检验并回看开场预测。'
    return {
      ...scene,
      teacherScript: appendScriptCue(scene.teacherScript, cue),
      studentAction: recapStudentAction(scene),
    }
  }
  if (scene.sceneType === 'worked-example') {
    const cue = `步骤展开后，${WORKED_EXAMPLE_SELF_EXPLANATION_CUE}。`
    return {
      ...scene,
      teacherScript: appendScriptCue(scene.teacherScript, cue),
      studentAction: ensureWorkedExampleSelfExplanation(scene.studentAction),
    }
  }
  return { ...scene, studentAction: ensureStudentActionEvidence(scene.sceneType, scene.studentAction) }
}

export function refreshCourseLearningActivities(course: MainlineCourse): RefreshLearningActivitiesResult {
  const plan = learningActivityRepairPlan(course)
  if (plan.total === 0) {
    return { course, refreshedSceneIds: [], issues: auditMainlineCourse(course) }
  }

  const targetIds = new Set(plan.sceneIds)
  const scenes = course.scenes.map(scene => targetIds.has(scene.id) ? refreshTargetScene(course, scene) : scene)
  const candidate: MainlineCourse = {
    ...course,
    scenes,
    qualityStatus: course.qualityStatus === 'draft' ? 'draft' : 'passed',
  }
  const readiness = auditCourseReleaseReadiness(candidate)
  const refreshed: MainlineCourse = {
    ...candidate,
    qualityStatus: course.qualityStatus === 'draft'
      ? 'draft'
      : readiness.ready ? 'passed' : 'blocked',
  }
  const remaining = learningActivityRepairPlan(refreshed).sceneIds.filter(sceneId => targetIds.has(sceneId))
  if (remaining.length > 0) throw new LearningActivityRefreshIncompleteError(remaining)

  return {
    course: refreshed,
    refreshedSceneIds: plan.sceneIds,
    issues: readiness.deterministicIssues,
  }
}

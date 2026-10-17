import type { MainlineCourse, MainlineCourseRevision } from '../domain.js'
import { generationInputHash } from '../generation-session.js'
import { teachingQualityInputHash } from '../teaching-quality-audit.js'
import { assertValidCoursePageContentState } from './page-content-audit.js'
import { assertValidCoursePlanningState } from './page-audit.js'

export interface PlanPageUpdate {
  pageId: string
  learningAction: string
  newInformation: string
  visualReason?: string | undefined
  teachingMove?: string | undefined
}

export function saveDraftPlan(
  course: MainlineCourse,
  updates: readonly PlanPageUpdate[],
): MainlineCourse {
  const planning = requirePlanning(course)
  if (planning.status !== 'planning') {
    throw new Error('已确认的课程结构不能原地修改，请先退回规划并创建新版本。')
  }

  const updateById = new Map(updates.map(update => [update.pageId, update]))
  if (updateById.size !== updates.length) throw new Error('课程结构包含重复的页面修改。')
  for (const pageId of updateById.keys()) {
    if (!planning.pages.some(page => page.id === pageId)) throw new Error(`课程结构中不存在页面 ${pageId}。`)
  }

  const nextPlanning = {
    ...planning,
    pages: planning.pages.map(page => {
      const update = updateById.get(page.id)
      if (!update) return page
      const learningAction = update.learningAction.trim()
      const newInformation = update.newInformation.trim()
      if (!learningAction || !newInformation) throw new Error(`第 ${page.order} 页的学习任务和新增内容不能为空。`)
      const visualReason = update.visualReason?.trim()
      const teachingMove = update.teachingMove?.trim()
      if (page.visualSpec.required && update.visualReason !== undefined && !visualReason) {
        throw new Error(`第 ${page.order} 页需要图像，必须说明图像的教学作用。`)
      }
      if (update.teachingMove !== undefined && !teachingMove) {
        throw new Error(`第 ${page.order} 页的讲课重点不能为空。`)
      }
      return {
        ...page,
        learningAction,
        newInformation,
        visualSpec: update.visualReason === undefined ? page.visualSpec : { ...page.visualSpec, reason: visualReason ?? '' },
        teacherCompanion: update.teachingMove === undefined
          ? page.teacherCompanion
          : { ...page.teacherCompanion, teachingMove: teachingMove ?? '' },
      }
    }),
  }
  assertValidCoursePlanningState(nextPlanning)
  return { ...course, planning: nextPlanning }
}

export function approveDraftPlan(course: MainlineCourse): MainlineCourse {
  const planning = requirePlanning(course)
  if (planning.status !== 'planning') {
    throw new Error(`只有待确认的课程结构可以确认，当前状态为 ${planning.status}。`)
  }
  const nextPlanning = { ...planning, status: 'plan-approved' as const }
  assertValidCoursePlanningState(nextPlanning)
  const nextCourse: MainlineCourse = { ...course, planning: nextPlanning, qualityStatus: 'draft' }
  delete nextCourse.pageContent
  return nextCourse
}

export function markPageGenerationStarted(course: MainlineCourse): MainlineCourse {
  const planning = requirePlanning(course)
  if (planning.status !== 'plan-approved') {
    throw new Error(`只有已确认的课程结构可以生成投影片，当前状态为 ${planning.status}。`)
  }
  return { ...course, planning: { ...planning, status: 'generating' } }
}

export function restoreApprovedPlanAfterGenerationFailure(course: MainlineCourse): MainlineCourse {
  const planning = requirePlanning(course)
  if (planning.status !== 'generating') return course
  return { ...course, planning: { ...planning, status: 'plan-approved' } }
}

export function markPageContentReady(course: MainlineCourse): MainlineCourse {
  const planning = requirePlanning(course)
  if (planning.status !== 'review') {
    throw new Error(`只有完成生成并处于备课检查状态的课程可以设为课堂版本，当前状态为 ${planning.status}。`)
  }
  if (!course.pageContent) throw new Error('课程缺少已生成的投影片正文。')
  if (course.generationSession?.status !== 'ready') {
    throw new Error('投影片尚未完成整课机器审计和教师验收。')
  }
  const audit = course.generationCourseAudit
  const teachingQualityAudit = course.teachingQualityAudit
  const acceptance = course.teacherAcceptance
  if (
    !audit
    || audit.courseId !== course.id
    || audit.planRevisionId !== planning.planRevisionId
    || audit.contentRevisionId !== course.pageContent.contentRevisionId
  ) {
    throw new Error('当前版本缺少匹配的整课机器审计签名。')
  }
  if (
    !teachingQualityAudit
    || teachingQualityAudit.status !== 'passed'
    || teachingQualityAudit.courseId !== course.id
    || teachingQualityAudit.planRevisionId !== audit.planRevisionId
    || teachingQualityAudit.contentRevisionId !== audit.contentRevisionId
    || teachingQualityAudit.generationCourseAuditId !== audit.id
    || !teachingQualityAudit.inputHash
    || teachingQualityAudit.inputHash !== teachingQualityInputHash(course)
  ) {
    throw new Error('当前版本缺少与整课机器审计匹配的 AI 教学审查通过记录。')
  }
  if (
    !acceptance?.finalSignature
    || !acceptance.acceptedAt
    || acceptance.courseId !== course.id
    || acceptance.planRevisionId !== audit.planRevisionId
    || acceptance.courseAuditId !== audit.id
    || !hasCurrentAcceptedPages(course)
    || acceptance.finalSignature !== generationInputHash({
      courseId: course.id,
      planRevisionId: planning.planRevisionId,
      courseAuditId: audit.id,
      pages: acceptance.pages.map(item => ({
        pageId: item.pageId,
        contentRevisionId: item.contentRevisionId,
        renderEvidenceId: item.renderEvidenceId,
      })),
    })
  ) {
    throw new Error('当前版本缺少教师最终验收签名。')
  }
  assertValidCoursePageContentState(planning, course.pageContent, course.sourceMaterial)
  const nextCourse: MainlineCourse = {
    ...course,
    planning: { ...planning, status: 'ready' },
    qualityStatus: 'passed',
  }
  return nextCourse
}

function hasCurrentAcceptedPages(course: MainlineCourse): boolean {
  const jobs = course.generationSession?.jobs ?? []
  const accepted = new Map(course.teacherAcceptance?.pages.map(page => [page.pageId, page]) ?? [])
  return accepted.size === jobs.length && jobs.every(job => {
    const checkpoint = job.checkpoint
    const page = accepted.get(job.pageId)
    return Boolean(
      checkpoint
      && page
      && page.contentRevisionId === checkpoint.contentRevisionId
      && page.renderEvidenceId === checkpoint.renderEvidenceId,
    )
  })
}

export function forkCourseForReplanning(course: MainlineCourse, newCourseId: string): MainlineCourse {
  const planning = requirePlanning(course)
  if (planning.status === 'generating') throw new Error('投影片正在生成，暂时不能退回规划。')
  if (planning.status === 'archived') throw new Error('归档版本不能再次退回规划。')
  if (!newCourseId.trim() || newCourseId === course.id) throw new Error('新课程版本必须使用新的课程 ID。')

  const previousRevision = revisionOf(course)
  const revisionNo = previousRevision.revisionNo + 1
  const planRevisionId = `${newCourseId}:plan:${revisionNo}`
  const nextPlanning = {
    ...planning,
    courseId: newCourseId,
    planRevisionId,
    status: 'planning' as const,
    basedOnPlanRevisionId: planning.planRevisionId,
    arc: {
      ...planning.arc,
      id: `${planRevisionId}:arc`,
      courseId: newCourseId,
    },
    pages: planning.pages.map(page => ({ ...page })),
  }
  assertValidCoursePlanningState(nextPlanning)

  const nextCourse: MainlineCourse = {
    ...course,
    id: newCourseId,
    revision: {
      familyId: previousRevision.familyId,
      revisionNo,
      basedOnCourseId: course.id,
    },
    planning: nextPlanning,
    qualityStatus: 'draft',
  }
  delete nextCourse.pageContent
  delete nextCourse.factAudit
  delete nextCourse.generationSession
  delete nextCourse.pageRenderEvidence
  delete nextCourse.generationCourseAudit
  delete nextCourse.teachingQualityAudit
  delete nextCourse.teacherAcceptance
  return nextCourse
}

export function markCourseSuperseded(course: MainlineCourse, replacementCourseId: string): MainlineCourse {
  if (!replacementCourseId.trim() || replacementCourseId === course.id) {
    throw new Error('替代版本必须是另一门课程记录。')
  }
  return {
    ...course,
    revision: {
      ...revisionOf(course),
      supersededByCourseId: replacementCourseId,
    },
  }
}

export function revisionOf(course: Pick<MainlineCourse, 'id' | 'revision'>): MainlineCourseRevision {
  return course.revision ?? { familyId: course.id, revisionNo: 1 }
}

function requirePlanning(course: MainlineCourse): NonNullable<MainlineCourse['planning']> {
  if (!course.planning) throw new Error('课程缺少页面规划，不能使用新版规划流程。')
  return course.planning
}

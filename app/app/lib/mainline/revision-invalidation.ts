import type { MainlineCourse } from './domain.js'
import type { GenerationSession, PageContentCheckpoint, PageGenerationJob } from './generation-session.js'

/**
 * A changed course input makes every downstream proof invalid. Keep the
 * generated pages, but make them pass fresh fact, render, course-audit, AI
 * teaching-quality, and teacher-acceptance gates before they can be released.
 */
export function invalidateCourseReviewArtifacts(
  course: MainlineCourse,
  now = new Date().toISOString(),
): MainlineCourse {
  const next: MainlineCourse = {
    ...course,
    qualityStatus: 'draft',
    ...(course.planning?.status === 'ready'
      ? { planning: { ...course.planning, status: 'review' as const } }
      : {}),
  }

  delete next.factAudit
  delete next.pageRenderEvidence
  delete next.generationCourseAudit
  delete next.teachingQualityAudit
  delete next.teacherAcceptance

  if (course.generationSession) {
    next.generationSession = resetSessionForFreshRendering(course, now)
  }
  return next
}

function resetSessionForFreshRendering(course: MainlineCourse, now: string): GenerationSession {
  const session = course.generationSession!
  const jobs = session.jobs.map(job => resetJobForFreshRendering(job, now))
  const hasCurrentPageContent = Boolean(
    course.planning
    && course.pageContent
    && course.planning.planRevisionId === session.planRevisionId
    && course.pageContent.planRevisionId === session.planRevisionId
    && course.pageContent.pages.length === jobs.length
  )
  const canRenderExistingPages = hasCurrentPageContent
    && jobs.length > 0
    && jobs.every(job => job.status === 'content-ready' && job.contentCheckpoint)
  const { currentPageId: _currentPageId, ...withoutCurrentPage } = session

  return {
    ...withoutCurrentPage,
    jobs,
    // A complete page-first course can immediately regenerate screenshots in
    // the new visual state. Partial or inconsistent sessions restart safely.
    status: canRenderExistingPages ? 'rendering' : 'generating',
    updatedAt: now,
  }
}

function resetJobForFreshRendering(job: PageGenerationJob, now: string): PageGenerationJob {
  const contentCheckpoint = job.contentCheckpoint ?? contentCheckpointFromRenderCheckpoint(job)
  const { checkpoint: _checkpoint, ...withoutRenderCheckpoint } = job
  if (contentCheckpoint) {
    return {
      ...withoutRenderCheckpoint,
      status: 'content-ready',
      contentCheckpoint,
      updatedAt: now,
    }
  }
  return {
    ...withoutRenderCheckpoint,
    status: 'queued',
    updatedAt: now,
  }
}

function contentCheckpointFromRenderCheckpoint(job: PageGenerationJob): PageContentCheckpoint | undefined {
  const checkpoint = job.checkpoint
  if (!checkpoint) return undefined
  return {
    pageId: checkpoint.pageId,
    planRevisionId: checkpoint.planRevisionId,
    inputHash: checkpoint.inputHash,
    contentRevisionId: checkpoint.contentRevisionId,
    factAuditRevisionId: checkpoint.factAuditRevisionId,
    createdAt: checkpoint.createdAt,
  }
}

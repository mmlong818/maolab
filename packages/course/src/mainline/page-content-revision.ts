import type { MainlineCourse } from './domain.js'
import { attachGenerationSession, generationInputHash, revisePageContent } from './generation-session.js'
import type { GeneratedLessonPage } from './planning/page-content-contract.js'

export interface PageContentRevisionAudit {
  audit(course: MainlineCourse, page: GeneratedLessonPage): Promise<{ revisionId: string }>
}

export async function applyGeneratedPageContentRevision(
  course: MainlineCourse,
  pageId: string,
  auditor: PageContentRevisionAudit,
  now = new Date().toISOString(),
): Promise<MainlineCourse> {
  const session = course.generationSession
  const pageContent = course.pageContent
  const page = pageContent?.pages.find(candidate => candidate.pageId === pageId)
  const job = session?.jobs.find(candidate => candidate.pageId === pageId)
  const previous = job?.contentCheckpoint ?? job?.checkpoint
  if (!session || !pageContent || !page || !job || !previous) {
    throw new Error('当前投影片不属于可修订的新课程生成会话。')
  }
  if (page.planRevisionId !== session.planRevisionId || pageContent.planRevisionId !== session.planRevisionId) {
    throw new Error('投影片计划版本已变化，请刷新后重试。')
  }

  const factAudit = await auditor.audit(course, page)
  const contentRevisionId = generationInputHash({
    planRevisionId: session.planRevisionId,
    page,
  })
  const revisedSession = revisePageContent(session, {
    pageId,
    planRevisionId: session.planRevisionId,
    inputHash: previous.inputHash,
    contentRevisionId,
    factAuditRevisionId: factAudit.revisionId,
    createdAt: now,
  }, now)
  const nextPageContent = {
    ...pageContent,
    contentRevisionId: generationInputHash(revisedSession.jobs.map(candidate => ({
      pageId: candidate.pageId,
      contentRevisionId: candidate.contentCheckpoint?.contentRevisionId ?? candidate.checkpoint?.contentRevisionId ?? '',
    }))),
    status: 'review' as const,
  }
  const remainingEvidence = course.pageRenderEvidence?.filter(evidence => evidence.pageId !== pageId)
  const {
    generationCourseAudit: _audit,
    teachingQualityAudit: _teachingQualityAudit,
    teacherAcceptance: _acceptance,
    ...courseWithoutAcceptance
  } = course
  return attachGenerationSession({
    ...courseWithoutAcceptance,
    pageContent: nextPageContent,
    ...(remainingEvidence ? { pageRenderEvidence: remainingEvidence } : {}),
    qualityStatus: 'draft',
  }, revisedSession)
}

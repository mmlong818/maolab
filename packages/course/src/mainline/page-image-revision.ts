import type { MainlineCourse } from './domain.js'
import type { GeneratedLessonPage } from './planning/page-content-contract.js'
import { applyGeneratedPageContentRevision } from './page-content-revision.js'

export interface PageImageRevisionAudit {
  audit(course: MainlineCourse, page: GeneratedLessonPage): Promise<{ revisionId: string }>
}

export interface GeneratedPageImageRevision {
  imageUrl: string
  imagePrompt?: string
  imageAspect?: string
}

/**
 * Images do not alter a page's student-visible claims or source references.
 * Keep the existing page fact checkpoint while forcing fresh render and
 * whole-course review gates for the changed visual revision.
 */
export const retainCurrentPageFactAudit: PageImageRevisionAudit = {
  async audit(course, page) {
    const job = course.generationSession?.jobs.find(candidate => candidate.pageId === page.pageId)
    const checkpoint = job?.contentCheckpoint ?? job?.checkpoint
    if (!checkpoint?.factAuditRevisionId) {
      throw new Error('当前投影片没有可保留的正文事实检查点。')
    }
    return { revisionId: checkpoint.factAuditRevisionId }
  },
}

export async function applyGeneratedPageImageRevision(
  course: MainlineCourse,
  pageId: string,
  image: GeneratedPageImageRevision,
  auditor: PageImageRevisionAudit,
  now = new Date().toISOString(),
): Promise<MainlineCourse> {
  const pageContent = course.pageContent
  const page = pageContent?.pages.find(candidate => candidate.pageId === pageId)
  if (!pageContent || !page) {
    throw new Error('当前投影片不属于可修订的新课程生成会话。')
  }

  const revisedPage: GeneratedLessonPage = {
    ...page,
    imageUrl: image.imageUrl.trim(),
    ...(image.imagePrompt ? { imagePrompt: image.imagePrompt } : {}),
    ...(image.imageAspect ? { imageAspect: image.imageAspect } : {}),
  }
  const pages = pageContent.pages.map(candidate => candidate.pageId === pageId ? revisedPage : candidate)
  const revised = await applyGeneratedPageContentRevision({
    ...course,
    pageContent: { ...pageContent, pages },
  }, pageId, auditor, now)
  // A whole-course result is tied to the preceding content revision. The
  // retained checkpoint above covers only unchanged textual page claims.
  const { factAudit: _factAudit, ...withoutFactAudit } = revised
  return withoutFactAudit
}

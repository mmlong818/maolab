import type { z } from 'zod'
import type { LessonPagePurpose, TeacherCompanion } from './page-contract.js'
import type {
  TeacherCompanionContentSchema,
  VisiblePageContentSchema,
} from './page-content-schema.js'

export const PAGE_CONTENT_SCHEMA_VERSION = 'mainline-page-content-v1' as const

export type VisiblePageContent = z.infer<typeof VisiblePageContentSchema>
export type TeacherCompanionContent = z.infer<typeof TeacherCompanionContentSchema>

export interface GeneratedLessonPage {
  pageId: string
  order: number
  purpose: LessonPagePurpose
  planRevisionId: string
  sourceRefs: string[]
  content: VisiblePageContent
  imageUrl?: string
  imagePrompt?: string
  imageAspect?: string
  teacherCompanion: TeacherCompanionContent & Pick<TeacherCompanion, 'pace'>
  pairId?: string
  pairRole?: 'prompt' | 'response'
  layoutGroupId?: string
}

export interface CoursePageContentState {
  schemaVersion: typeof PAGE_CONTENT_SCHEMA_VERSION
  courseId: string
  planRevisionId: string
  contentRevisionId: string
  status: 'review'
  pages: GeneratedLessonPage[]
}

import { describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { applyGeneratedPageImageRevision, retainCurrentPageFactAudit } from '../page-image-revision.js'
import {
  completePageContent,
  completePageGeneration,
  createGenerationSession,
  generationInputHash,
  startPageGeneration,
} from '../generation-session.js'
import type { CoursePlanningState, LessonPagePlan } from '../planning/page-contract.js'
import type { GeneratedLessonPage } from '../planning/page-content-contract.js'

const plans: LessonPagePlan[] = [1, 2].map(order => ({
  id: `page-${order}`, order, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'], purpose: 'explain',
  audience: 'student', learningAction: '观察并说明。', newInformation: `信息 ${order}`, sourceRefs: [],
  contentSpec: { kind: 'explanation', focus: `信息 ${order}`, requiredElements: ['定义'] },
  visualSpec: { required: true, form: 'instructional-image', reason: '帮助观察。', sourceAssetPolicy: 'grounded-or-generate' },
  teacherCompanion: { scriptGoal: '讲清楚。', teachingMove: '追问。', pace: 'normal' }, arcStepId: 'arc-1',
}))

function page(order: number): GeneratedLessonPage {
  return {
    pageId: `page-${order}`, order, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: [],
    content: { kind: 'explanation', title: `第 ${order} 页`, coreStatement: `正文 ${order}`, evidence: [], boundary: '边界。' },
    imageUrl: `/old-${order}.png`, imagePrompt: `prompt-${order}`, imageAspect: '3:2',
    teacherCompanion: { script: '讲稿。', notes: [], pace: 'normal' },
  }
}

function readyCourse(): MainlineCourse {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: 'course-1', planRevisionId: 'plan-1', status: 'plan-approved',
    learningContracts: [], arc: { id: 'arc-1', courseId: 'course-1', steps: [] }, pages: plans,
  }
  const base = { id: 'course-1', planning, qualityStatus: 'passed' } as unknown as MainlineCourse
  let session = createGenerationSession(base, 'session-1')
  for (const plan of plans) {
    const inputHash = generationInputHash({ pageId: plan.id })
    session = startPageGeneration(session, plan.id, inputHash)
    session = completePageContent(session, {
      pageId: plan.id, planRevisionId: 'plan-1', inputHash,
      contentRevisionId: `content-${plan.order}`, factAuditRevisionId: `fact-${plan.order}`, createdAt: '2026-09-11T12:00:00.000Z',
    })
  }
  for (const plan of plans) {
    const checkpoint = session.jobs.find(job => job.pageId === plan.id)!.contentCheckpoint!
    session = completePageGeneration(session, { ...checkpoint, renderEvidenceId: `render-${plan.order}` })
  }
  return {
    ...base,
    generationSession: session,
    pageContent: {
      schemaVersion: 'mainline-page-content-v1', courseId: 'course-1', planRevisionId: 'plan-1',
      contentRevisionId: 'course-content-1', status: 'review', pages: [page(1), page(2)],
    },
    pageRenderEvidence: plans.map(plan => ({
      schemaVersion: 'mainline-page-render-v1', id: `render-${plan.order}`, courseId: 'course-1', pageId: plan.id,
      planRevisionId: 'plan-1', contentRevisionId: `content-${plan.order}`, screenshotPath: `p${plan.order}.png`, screenshotSha256: 'a'.repeat(64),
      viewport: { width: 1920, height: 1080 }, metrics: { minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.4 },
      issues: [], createdAt: '2026-09-11T12:00:00.000Z',
    })),
    teachingQualityAudit: {
      schemaVersion: 'mainline-teaching-quality-audit-v1', id: 'teaching-1', courseId: 'course-1', planRevisionId: 'plan-1', contentRevisionId: 'course-content-1', generationCourseAuditId: 'audit-1',
      standards: [], findings: [], status: 'passed', auditedAt: '2026-09-11T12:00:00.000Z',
    },
  }
}

describe('generated page image revision', () => {
  it('updates the real page and invalidates only its render evidence', async () => {
    const revised = await applyGeneratedPageImageRevision(
      readyCourse(), 'page-1', { imageUrl: '/new.png', imagePrompt: 'new prompt', imageAspect: '16:9' },
      { audit: async () => ({ revisionId: 'fact-new' }) }, '2026-09-11T13:00:00.000Z',
    )
    expect(revised.pageContent?.pages[0]).toMatchObject({ imageUrl: '/new.png', imagePrompt: 'new prompt', imageAspect: '16:9' })
    expect(revised.generationSession?.status).toBe('rendering')
    expect(revised.generationSession?.jobs.map(job => [job.pageId, job.status])).toEqual([
      ['page-1', 'content-ready'], ['page-2', 'passed'],
    ])
    expect(revised.generationSession?.jobs[0]?.contentCheckpoint).toMatchObject({ factAuditRevisionId: 'fact-new' })
    expect(revised.pageRenderEvidence?.map(item => item.pageId)).toEqual(['page-2'])
    expect(revised.factAudit).toBeUndefined()
    expect(revised.teachingQualityAudit).toBeUndefined()
    expect(revised.qualityStatus).toBe('draft')
  })

  it('reuses the unchanged textual fact checkpoint without a model audit', async () => {
    const auditor = { audit: vi.fn(retainCurrentPageFactAudit.audit) }
    const revised = await applyGeneratedPageImageRevision(
      readyCourse(), 'page-1', { imageUrl: '/new.png' }, auditor, '2026-09-11T13:00:00.000Z',
    )

    expect(auditor.audit).toHaveBeenCalledOnce()
    expect(revised.generationSession?.jobs[0]?.contentCheckpoint?.factAuditRevisionId).toBe('fact-1')
    expect(revised.factAudit).toBeUndefined()
    expect(revised.generationCourseAudit).toBeUndefined()
    expect(revised.teachingQualityAudit).toBeUndefined()
    expect(revised.teacherAcceptance).toBeUndefined()
  })
})

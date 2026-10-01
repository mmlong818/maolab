import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import {
  attachGenerationSession,
  cancelGenerationSession,
  completePageContent,
  completePageGeneration,
  createGenerationSession,
  failPageGeneration,
  generationInputHash,
  markCourseAuditPassed,
  markTeacherAccepted,
  recoverInterruptedGeneration,
  resumeBlockedPage,
  startPageGeneration,
  type PageCheckpoint,
  type PageContentCheckpoint,
} from '../generation-session.js'
import type { CoursePlanningState, LessonPagePlan } from '../planning/page-contract.js'

const pages: LessonPagePlan[] = [1, 2].map(order => ({
  id: `page-${order}`,
  order,
  fragmentId: 'fragment-1',
  knowledgePointIds: ['kp-1'],
  purpose: order === 1 ? 'question' : 'answer',
  audience: 'student',
  learningAction: order === 1 ? '先作答。' : '核对依据。',
  newInformation: order === 1 ? '呈现问题。' : '呈现答案与依据。',
  sourceRefs: [],
  contentSpec: order === 1
    ? { kind: 'question', promptGoal: '判断并说明依据', answerPolicy: 'separate-following-page', responsePageId: 'page-2', materialRefs: [] }
    : { kind: 'answer', questionPageId: 'page-1', requiredElements: ['conclusion', 'evidence', 'correction'] },
  visualSpec: { required: false, form: 'none', reason: '测试页。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '组织学习。', teachingMove: '先问后答。', pace: 'brief' },
  arcStepId: 'arc-1',
  pairId: 'pair-1',
  pairRole: order === 1 ? 'prompt' : 'response',
  ...(order === 2 ? { previousPageId: 'page-1' } : {}),
}))

function course(planRevisionId = 'course-1:plan:1'): MainlineCourse {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2',
    courseId: 'course-1',
    planRevisionId,
    status: 'plan-approved',
    learningContracts: [],
    arc: { id: `${planRevisionId}:arc`, courseId: 'course-1', steps: [] },
    pages,
  }
  return { id: 'course-1', planning, qualityStatus: 'draft' } as unknown as MainlineCourse
}

function checkpoint(pageId: string, inputHash: string): PageCheckpoint {
  return {
    pageId,
    planRevisionId: 'course-1:plan:1',
    inputHash,
    contentRevisionId: `${pageId}:content:1`,
    factAuditRevisionId: `${pageId}:fact:1`,
    renderEvidenceId: `${pageId}:render:1`,
    createdAt: '2026-09-11T09:00:00.000Z',
  }
}

function contentCheckpoint(pageId: string, inputHash: string): PageContentCheckpoint {
  const { renderEvidenceId: _renderEvidenceId, ...content } = checkpoint(pageId, inputHash)
  return content
}

function completeWithRender(session: ReturnType<typeof createGenerationSession>, pageId: string, inputHash: string) {
  return completePageGeneration(completePageContent(session, contentCheckpoint(pageId, inputHash)), checkpoint(pageId, inputHash))
}

describe('generation session', () => {
  it('keeps content and render verification as separate truthful stages', () => {
    const firstHash = generationInputHash({ pageId: 'page-1' })
    const secondHash = generationInputHash({ pageId: 'page-2' })
    let session = startPageGeneration(createGenerationSession(course(), 'session-1'), 'page-1', firstHash)
    session = completePageContent(session, contentCheckpoint('page-1', firstHash))
    expect(session.jobs[0]).toMatchObject({ status: 'content-ready', contentCheckpoint: { factAuditRevisionId: 'page-1:fact:1' } })
    expect(startPageGeneration(session, 'page-1', firstHash)).toBe(session)

    session = startPageGeneration(session, 'page-2', secondHash)
    session = completePageContent(session, contentCheckpoint('page-2', secondHash))
    expect(session.status).toBe('rendering')
    expect(session.jobs.every(job => job.status === 'content-ready')).toBe(true)
  })

  it('preserves content-ready checkpoints when a later page is cancelled', () => {
    const hash = generationInputHash({ pageId: 'page-1' })
    let session = startPageGeneration(createGenerationSession(course(), 'session-1'), 'page-1', hash)
    session = completePageContent(session, contentCheckpoint('page-1', hash))
    const cancelled = cancelGenerationSession(session)
    expect(cancelled.jobs.map(job => job.status)).toEqual(['content-ready', 'cancelled'])
  })

  it('creates one ordered job per approved plan page and persists it in the course payload', () => {
    const current = course()
    const session = createGenerationSession(current, 'session-1', '2026-09-11T08:00:00.000Z')
    const next = attachGenerationSession(current, session)

    expect(session.jobs.map(job => [job.order, job.pageId, job.status])).toEqual([
      [1, 'page-1', 'queued'],
      [2, 'page-2', 'queued'],
    ])
    expect(next.generationSession).toEqual(session)
  })

  it('requires explicit plan approval and exact plan revision binding', () => {
    const draft = course()
    draft.planning = { ...draft.planning!, status: 'planning' }
    expect(() => createGenerationSession(draft, 'session-1')).toThrow(/必须先确认/)

    const current = course('course-1:plan:2')
    const stale = createGenerationSession(course(), 'session-1')
    expect(() => attachGenerationSession(current, stale)).toThrow(/不属于当前页面计划版本/)
  })

  it('generates sequentially and treats duplicate starts and completions as idempotent', () => {
    const hash = generationInputHash({ pageId: 'page-1', rules: 1 })
    let session = createGenerationSession(course(), 'session-1')
    expect(() => startPageGeneration(session, 'page-2', hash)).toThrow(/必须先完成页面 page-1/)

    session = startPageGeneration(session, 'page-1', hash)
    expect(startPageGeneration(session, 'page-1', hash)).toBe(session)
    expect(session.jobs[0]).toMatchObject({ status: 'running', attempt: 1, inputHash: hash })

    expect(() => completePageGeneration(session, checkpoint('page-1', hash))).toThrow(/正文与事实核查/)
    const passed = completeWithRender(session, 'page-1', hash)
    expect(completePageGeneration(passed, checkpoint('page-1', hash))).toBe(passed)
    expect(passed.jobs[0]?.status).toBe('passed')
    expect(passed.status).toBe('rendering')
  })

  it('only retries transient or model failures once and preserves diagnostics', () => {
    const hash = generationInputHash({ pageId: 'page-1' })
    let session = startPageGeneration(createGenerationSession(course(), 'session-1'), 'page-1', hash)
    session = failPageGeneration(session, 'page-1', 'transient_error', 'timeout')
    expect(session.jobs[0]).toMatchObject({ status: 'queued', attempt: 1 })

    session = startPageGeneration(session, 'page-1', hash)
    session = failPageGeneration(session, 'page-1', 'model_error', 'invalid output')
    expect(session.jobs[0]).toMatchObject({ status: 'blocked', attempt: 2 })
    expect(session.jobs[0]?.diagnostics).toHaveLength(2)

    session = resumeBlockedPage(session, 'page-1')
    expect(session.jobs[0]?.status).toBe('queued')
  })

  it('blocks deterministic failures without automatic retry', () => {
    const hash = generationInputHash({ pageId: 'page-1' })
    let session = startPageGeneration(createGenerationSession(course(), 'session-1'), 'page-1', hash)
    session = failPageGeneration(session, 'page-1', 'source_error', 'missing source')
    expect(session.jobs[0]).toMatchObject({ status: 'blocked', attempt: 1 })
  })

  it('recovers an interrupted running job without losing passed checkpoints', () => {
    const firstHash = generationInputHash({ pageId: 'page-1' })
    const secondHash = generationInputHash({ pageId: 'page-2' })
    let session = startPageGeneration(createGenerationSession(course(), 'session-1'), 'page-1', firstHash)
    session = completeWithRender(session, 'page-1', firstHash)
    session = startPageGeneration(session, 'page-2', secondHash)

    const recovered = recoverInterruptedGeneration(session)
    expect(recovered.jobs[0]).toMatchObject({ status: 'passed', checkpoint: { inputHash: firstHash } })
    expect(recovered.jobs[1]).toMatchObject({ status: 'queued', attempt: 1, inputHash: secondHash })
    expect(recovered.currentPageId).toBeUndefined()
  })

  it('invalidates the changed page and every downstream checkpoint when its input changes', () => {
    let session = createGenerationSession(course(), 'session-1')
    for (const page of pages) {
      const hash = generationInputHash({ pageId: page.id, revision: 1 })
      session = startPageGeneration(session, page.id, hash)
      session = completeWithRender(session, page.id, hash)
    }
    expect(session.status).toBe('course-audit')

    const changedHash = generationInputHash({ pageId: 'page-1', revision: 2 })
    session = startPageGeneration(session, 'page-1', changedHash)

    expect(session.status).toBe('generating')
    expect(session.jobs[0]).toMatchObject({ status: 'running', attempt: 1, inputHash: changedHash })
    expect(session.jobs[0]?.checkpoint).toBeUndefined()
    expect(session.jobs[1]).toMatchObject({ status: 'queued', attempt: 0 })
    expect(session.jobs[1]?.checkpoint).toBeUndefined()
    expect(session.jobs[1]?.inputHash).toBeUndefined()
  })

  it('requires content, fact and render evidence before course audit and teacher acceptance', () => {
    let session = createGenerationSession(course(), 'session-1')
    for (const page of pages) {
      const hash = generationInputHash({ pageId: page.id })
      session = startPageGeneration(session, page.id, hash)
      const evidence = checkpoint(page.id, hash)
      session = completePageContent(session, contentCheckpoint(page.id, hash))
      if (page.id === 'page-2') evidence.renderEvidenceId = ''
      if (page.id === 'page-2') {
        expect(() => completePageGeneration(session, evidence)).toThrow(/真实渲染证据/)
        evidence.renderEvidenceId = 'page-2:render:1'
      }
      session = completePageGeneration(session, evidence)
    }

    expect(session.status).toBe('course-audit')
    session = markCourseAuditPassed(session)
    expect(session.status).toBe('awaiting-teacher-acceptance')
    session = markTeacherAccepted(session)
    expect(session.status).toBe('ready')
  })

  it('cancels unfinished jobs while preserving completed checkpoints', () => {
    const hash = generationInputHash({ pageId: 'page-1' })
    let session = startPageGeneration(createGenerationSession(course(), 'session-1'), 'page-1', hash)
    session = completeWithRender(session, 'page-1', hash)
    session = cancelGenerationSession(session)

    expect(session.status).toBe('cancelled')
    expect(session.jobs.map(job => job.status)).toEqual(['passed', 'cancelled'])
    expect(recoverInterruptedGeneration(session).jobs.map(job => job.status)).toEqual(['passed', 'queued'])
  })

  it('uses a stable hash independent of object key order', () => {
    expect(generationInputHash({ page: 1, rules: { b: 2, a: 1 } }))
      .toBe(generationInputHash({ rules: { a: 1, b: 2 }, page: 1 }))
  })
})

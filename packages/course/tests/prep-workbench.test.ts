import { describe, expect, it } from 'vitest'
import { createPrepFacade } from '../src/services/prep-facade.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { buildRenderingCourse, goldenExportCourse } from '../src/testing/render-fixtures.js'
import { PREP_FIXTURE_KP_IDS, prepFixtureKnowledge } from '../src/testing/prep-fixtures.js'
import { auditActionForFact, auditActionForFinding } from '../src/services/prep-facade.js'
import { teachingQualityInputHash } from '../src/mainline/teaching-quality-audit.js'

describe('prep facade workbench view (3d)', () => {
  it('returns the full course, the summary, unaccepted pages and export readiness for the owner’s course', async () => {
    const documents = createMemoryCourseDocuments()
    const facade = createPrepFacade({ documents, knowledge: prepFixtureKnowledge() })
    const planned = await facade.planCourse({ kpIds: [...PREP_FIXTURE_KP_IDS] })
    if (!planned.ok) throw new Error(planned.message)
    const courseId = (planned.course as { courseId: string }).courseId
    const view = await facade.workbench(courseId)
    if (!view.ok) throw new Error(view.message)
    const w = view.workbench as Record<string, any>
    expect(w.course.id).toBe(courseId)
    expect(w.course.planning.pages.length).toBeGreaterThan(0)
    expect(w.summary.courseId).toBe(courseId)
    expect(w.summary.pages.length).toBe(w.course.planning.pages.length)
    expect(w.teachingAudit).toBeNull()
    expect(w.auditBlocked).toBeNull()
    expect(w.unacceptedPageIds).toEqual([])
    expect(w.exportReady.ok).toBe(false)
    expect(typeof w.exportReady.message).toBe('string')
  })

  it('a ready golden course is export-ready with the page count and file name', async () => {
    const documents = createMemoryCourseDocuments()
    const golden = goldenExportCourse('c-golden')
    await createMainlineCourseStore(documents).saveMainlineCourse(golden as never)
    const view = await createPrepFacade({ documents, knowledge: prepFixtureKnowledge() }).workbench('c-golden')
    if (!view.ok) throw new Error(view.message)
    expect((view.workbench as Record<string, any>).exportReady).toMatchObject({ ok: true, pageCount: 6 })
  })

  it('the teaching audit record is current only when plan, content, course audit and input hash all match', async () => {
    const base = await buildRenderingCourse(createMainlineCourseStore(createMemoryCourseDocuments()), 'c-wb') as Record<string, any>
    const course: Record<string, any> = { ...base, generationCourseAudit: { ...(base.generationCourseAudit ?? {}), id: 'gca-1' } }
    const record = {
      schemaVersion: 'mainline-teaching-quality-audit-v1', id: 'tqa-1', courseId: 'c-wb',
      planRevisionId: course.planning.planRevisionId, contentRevisionId: course.pageContent.contentRevisionId,
      generationCourseAuditId: 'gca-1', standards: [], status: 'blocked', auditedAt: '2026-10-14T00:00:00.000Z',
      findings: [{ severity: 'warning', category: 'standards-evidence', pageId: course.planning.pages[0].id, evidence: 'e', impact: 'i', fix: '挂载并绑定课程标准原文' }],
    }
    const viewOf = async (value: Record<string, any>) => {
      const documents = createMemoryCourseDocuments()
      await createMainlineCourseStore(documents).saveMainlineCourse(value as never)
      const view = await createPrepFacade({ documents, knowledge: prepFixtureKnowledge() }).workbench('c-wb')
      if (!view.ok) throw new Error(view.message)
      return (view.workbench as Record<string, any>).teachingAudit
    }
    const hash = teachingQualityInputHash(course as never)
    expect(await viewOf({ ...course, teachingQualityAudit: { ...record, inputHash: hash } })).toMatchObject({ status: 'blocked', state: 'current', findings: [{ action: 'add-source' }] })
    expect(await viewOf({ ...course, teachingQualityAudit: { ...record, inputHash: 'other' } })).toMatchObject({ state: 'stale' })
    expect(await viewOf({ ...course, teachingQualityAudit: { ...record, inputHash: hash, contentRevisionId: 'old' } })).toMatchObject({ state: 'stale' })
    expect(await viewOf({ ...course, teachingQualityAudit: { ...record, inputHash: undefined } })).toMatchObject({ state: 'stale' })
  })

  it('a course stopped at course-audit shows the same audit-blocked details, fact fixes that allow deleting the claim as repair-page', async () => {
    const base = await buildRenderingCourse(createMainlineCourseStore(createMemoryCourseDocuments()), 'c-wb') as Record<string, any>
    const pageId = base.planning.pages[0].id
    const course: Record<string, any> = {
      ...base,
      generationSession: { ...base.generationSession, status: 'course-audit' },
      factAudit: {
        contentRevisionId: base.pageContent.contentRevisionId, auditedSceneCount: 1, fatalCount: 1,
        issues: [{ id: 'f-1', severity: 'blocking', targetId: pageId, message: '断言无来源', impact: '学生会记错', fix: '补充权威来源或删去该断言' }],
      },
    }
    const documents = createMemoryCourseDocuments()
    await createMainlineCourseStore(documents).saveMainlineCourse(course as never)
    const view = await createPrepFacade({ documents, knowledge: prepFixtureKnowledge() }).workbench('c-wb')
    if (!view.ok) throw new Error(view.message)
    const blocked = (view.workbench as Record<string, any>).auditBlocked
    expect(blocked.factIssues).toEqual([expect.objectContaining({ pageId, fix: '补充权威来源或删去该断言', action: 'repair-page' })])
    expect(blocked.advice).toContain('repair_page')
    expect(blocked.advice).not.toContain('add-source')
  })

  it('unknown or foreign course → not-found', async () => {
    const facade = createPrepFacade({ documents: createMemoryCourseDocuments(), knowledge: prepFixtureKnowledge() })
    expect(await facade.workbench('c-missing')).toMatchObject({ ok: false, reason: 'not-found' })
  })

  it('fact issues whose fix offers deleting or rewriting the claim are repair-page; teaching findings asking to mount sources stay add-source', () => {
    expect(auditActionForFact('补充权威来源或删去该断言')).toBe('repair-page')
    expect(auditActionForFact('改写为教材原文表述')).toBe('repair-page')
    expect(auditActionForFact('补充权威来源')).toBe('add-source')
    expect(auditActionForFinding('挂载并绑定课程标准原文')).toBe('add-source')
    expect(auditActionForFinding('重新运行整课审查')).toBe('rerun-audit')
  })
})

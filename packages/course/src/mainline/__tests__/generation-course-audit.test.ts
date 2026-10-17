import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { createGenerationCourseAuditor, GenerationCourseAuditError } from '../generation-course-audit.js'
import {
  completePageContent, completePageGeneration, createGenerationSession, generationInputHash, startPageGeneration,
} from '../generation-session.js'
import { createTeacherAcceptanceService, TeacherAcceptanceError } from '../teacher-acceptance.js'
import type { CoursePlanningState, LessonPagePlan } from '../planning/page-contract.js'
import { TEACHING_QUALITY_DIMENSIONS, teachingQualityStandards, type TeachingQualityReviewOutput } from '../teaching-quality-audit.js'

const pagePlan: LessonPagePlan = {
  id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'], purpose: 'explain', audience: 'student',
  learningAction: '说出定义并解释例子。', newInformation: '呈现定义与例子。', sourceRefs: [],
  contentSpec: { kind: 'explanation', focus: '核心定义', requiredElements: ['定义', '例子'] },
  visualSpec: { required: false, form: 'none', reason: '本页不需要图像。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '讲清定义。', teachingMove: '追问例子。', pace: 'normal' }, arcStepId: 'arc-1',
}

function reviewCourse(): MainlineCourse {
  const approved: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: 'course-1', planRevisionId: 'plan-1', status: 'plan-approved',
    learningContracts: [], arc: { id: 'arc-1', courseId: 'course-1', steps: [{
      id: 'arc-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'], goalIds: [], action: 'explain',
      role: '讲清核心定义', focus: '核心定义', contentOutline: ['定义', '例子'], pagePurposes: ['explain'], sourceRefs: [],
    }] }, pages: [pagePlan],
  }
  const base = {
    id: 'course-1', topic: '核心定义', subject: 'math', gradeBand: 'middle-school', planning: approved, sourceMaterial: [{
      kind: 'definition', kpId: 'kp-1', title: '初中数学 middle-school 核心定义课程标准', excerpt: '课程标准要求学生理解核心定义。', citation: '课程标准第 1 节',
      provenance: { source: '教育部课程标准', externalId: 'curriculum-math-middle-school-core', evidenceStatus: 'authoritative-excerpt' },
    }, {
      kind: 'textbook', kpId: 'kp-1', title: '初中数学 middle-school 核心定义教材', excerpt: '教材通过例子说明核心定义。', citation: '教材第 1 页',
      provenance: { source: '授权教材', externalId: 'textbook-math-middle-school-core', evidenceStatus: 'authoritative-excerpt' },
    }], goals: [], learningFragments: [], scenes: [], qualityStatus: 'draft',
  } as unknown as MainlineCourse
  const inputHash = generationInputHash({ pageId: 'page-1' })
  let session = startPageGeneration(createGenerationSession(base, 'session-1'), 'page-1', inputHash, '2026-09-11T12:00:00.000Z')
  session = completePageContent(session, {
    pageId: 'page-1', planRevisionId: 'plan-1', inputHash, contentRevisionId: 'content-1', factAuditRevisionId: 'fact-page-1', createdAt: '2026-09-11T12:01:00.000Z',
  }, '2026-09-11T12:01:00.000Z')
  session = completePageGeneration(session, {
    ...session.jobs[0]!.contentCheckpoint!, renderEvidenceId: 'render-1', createdAt: '2026-09-11T12:02:00.000Z',
  }, '2026-09-11T12:02:00.000Z')
  return {
    ...base,
    planning: { ...approved, status: 'review' },
    generationSession: session,
    pageContent: {
      schemaVersion: 'mainline-page-content-v1', courseId: 'course-1', planRevisionId: 'plan-1', contentRevisionId: 'content-all-1', status: 'review',
      pages: [{
        pageId: 'page-1', order: 1, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: [],
        content: { kind: 'explanation', title: '核心定义', coreStatement: '核心定义说明对象具有什么共同特征。', evidence: [{ text: '这个例子符合定义中的共同特征。' }], boundary: '只讨论本课范围。' },
        teacherCompanion: { script: '先读定义，再用例子核对其中的共同特征，并说出判断依据。', notes: [], pace: 'normal' },
      }],
    },
    pageRenderEvidence: [{
      schemaVersion: 'mainline-page-render-v1', id: 'render-1', courseId: 'course-1', pageId: 'page-1', planRevisionId: 'plan-1', contentRevisionId: 'content-1',
      screenshotPath: 'data/render-1.png', screenshotSha256: 'a'.repeat(64), viewport: { width: 1920, height: 1080 },
      metrics: { minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 0, occupiedAreaRatio: 0.3 },
      issues: [], createdAt: '2026-09-11T12:02:00.000Z',
    }],
  }
}

function memory(initial = reviewCourse()) {
  let value = structuredClone(initial)
  let updatedAt = 1
  return {
    find: async (id: string) => id === value.id ? structuredClone(value) : undefined,
    findSnapshot: async (id: string) => id === value.id ? { course: structuredClone(value), updatedAt } : undefined,
    save: async (course: MainlineCourse) => { value = structuredClone(course); updatedAt += 1 },
    saveIfUnchanged: async (course: MainlineCourse, expectedUpdatedAt: number) => {
      if (expectedUpdatedAt !== updatedAt) return false
      value = structuredClone(course)
      updatedAt += 1
      return true
    },
    replace: (course: MainlineCourse) => { value = structuredClone(course); updatedAt += 1 },
    current: () => value,
  }
}

function auditDependencies(store: ReturnType<typeof memory>) {
  return { findSnapshot: store.findSnapshot, saveIfUnchanged: store.saveIfUnchanged }
}

function passingFactAudit(course: MainlineCourse): { course: MainlineCourse; teachingQualityReview: TeachingQualityReviewOutput } {
  return {
    course: {
      ...course,
      factAudit: {
        contentRevisionId: course.pageContent!.contentRevisionId, auditedAt: '2026-09-11T12:03:00.000Z', auditedSceneCount: 1,
        auditedSceneIds: ['page-1'], requiredSceneIds: ['page-1'], unverifiedSceneIds: [], pendingSceneIds: [], fatalCount: 0, issues: [],
      },
    },
    teachingQualityReview: passingTeachingQualityReview(course),
  }
}

function passingTeachingQualityReview(course: MainlineCourse): TeachingQualityReviewOutput {
  const standards = teachingQualityStandards(course)
  const pageId = course.pageContent!.pages[0]!.pageId
  return {
    reviewedPageIds: [pageId],
    reviewedStandardIds: standards.map(standard => standard.id),
    checks: TEACHING_QUALITY_DIMENSIONS.map((dimension, index) => ({
      dimension,
      standardId: standards[index % standards.length]!.id,
      pageIds: [pageId],
      status: 'pass' as const,
      evidence: '核心定义',
    })),
    findings: [],
  }
}

describe('G5 course audit and teacher acceptance', () => {
  it('rejects course audit when current render evidence is missing', async () => {
    const initial = reviewCourse()
    delete initial.pageRenderEvidence
    const store = memory(initial)
    const auditor = createGenerationCourseAuditor({ ...auditDependencies(store), auditFacts: async course => passingFactAudit(course) })
    await expect(auditor.run('course-1')).rejects.toMatchObject({ code: 'SESSION_NOT_READY' })
  })

  it('requires every page acceptance before publishing a signed ready version', async () => {
    const store = memory()
    const auditor = createGenerationCourseAuditor({ ...auditDependencies(store), auditFacts: async course => passingFactAudit(course) })
    const audited = await auditor.run('course-1', '2026-09-11T12:04:00.000Z')
    expect(audited.session.status).toBe('awaiting-teacher-acceptance')
    expect(audited.audit.renderEvidenceIds).toEqual(['render-1'])

    const acceptance = createTeacherAcceptanceService({ findSnapshot: store.findSnapshot, saveIfUnchanged: store.saveIfUnchanged })
    await expect(acceptance.publish('course-1', audited.session.updatedAt))
      .rejects.toMatchObject({ code: 'PAGES_NOT_ACCEPTED' })
    await acceptance.acceptPage('course-1', 'page-1', audited.session.updatedAt, '2026-09-11T12:05:00.000Z')
    const ready = await acceptance.publish('course-1', audited.session.updatedAt, '2026-09-11T12:06:00.000Z')
    expect(ready).toMatchObject({ planning: { status: 'ready' }, qualityStatus: 'passed', generationSession: { status: 'ready' } })
    expect(ready.teacherAcceptance?.finalSignature).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reopens a published version without preserving simulated teacher acceptance', async () => {
    const store = memory()
    const auditor = createGenerationCourseAuditor({ ...auditDependencies(store), auditFacts: async course => passingFactAudit(course) })
    const audited = await auditor.run('course-1', '2026-09-11T12:04:00.000Z')
    const acceptance = createTeacherAcceptanceService({ findSnapshot: store.findSnapshot, saveIfUnchanged: store.saveIfUnchanged })
    await acceptance.acceptPage('course-1', 'page-1', audited.session.updatedAt, '2026-09-11T12:05:00.000Z')
    const ready = await acceptance.publish('course-1', audited.session.updatedAt, '2026-09-11T12:06:00.000Z')

    const reopened = await acceptance.reopen('course-1', ready.generationSession!.updatedAt, '2026-09-11T12:07:00.000Z')

    expect(reopened).toMatchObject({
      planning: { status: 'review' }, qualityStatus: 'draft', generationSession: { status: 'awaiting-teacher-acceptance' },
      teacherAcceptance: { pages: [] },
    })
    expect(reopened.teacherAcceptance?.finalSignature).toBeUndefined()
    expect(reopened.teacherAcceptance?.acceptedAt).toBeUndefined()
    expect(reopened.generationCourseAudit?.id).toBe(audited.audit.id)
  })

  it('persists insufficient-evidence instead of passing when the shared model response omits teaching review', async () => {
    const store = memory()
    const auditor = createGenerationCourseAuditor({
      ...auditDependencies(store),
      auditFacts: async course => ({ course: passingFactAudit(course).course }),
    })
    await expect(auditor.run('course-1')).rejects.toMatchObject({ code: 'AUDIT_BLOCKED' })
    expect(store.current().teachingQualityAudit).toMatchObject({ status: 'insufficient-evidence' })
    expect(store.current().generationSession?.status).toBe('course-audit')
    expect(store.current().teacherAcceptance).toBeUndefined()
  })

  it('rejects model findings whose standard or page evidence is not part of the audit input', async () => {
    const store = memory()
    const auditor = createGenerationCourseAuditor({
      ...auditDependencies(store),
      auditFacts: async course => ({
        ...passingFactAudit(course),
        teachingQualityReview: {
          findings: [{
            standardId: 'NOT-IN-INPUT', pageId: 'page-404', severity: 'warning', category: 'progression',
            evidence: '不存在的证据', impact: '不存在的影响', fix: '不存在的改法',
          }],
        } as unknown as TeachingQualityReviewOutput,
      }),
    })
    await expect(auditor.run('course-1')).rejects.toMatchObject({ code: 'AUDIT_BLOCKED' })
    expect(store.current().teachingQualityAudit?.findings[0]).toMatchObject({ severity: 'insufficient-evidence', standardId: 'CN-MOE-YW-2022' })
  })

  it('does not accept a teaching-quality finding evidenced only by the teacher script', async () => {
    const store = memory()
    const auditor = createGenerationCourseAuditor({
      ...auditDependencies(store),
      auditFacts: async course => ({
        ...passingFactAudit(course),
        teachingQualityReview: {
          findings: [{
            standardId: 'IES-OISL-2007-R7', pageId: 'page-1', severity: 'warning', category: 'teacher-companion',
            evidence: '先读定义，再用例子核对其中的共同特征，并说出判断依据。',
            impact: '学生页无法据此自行核对学习任务。', fix: '把可核对的判断依据写入学生页。',
          }],
        } as unknown as TeachingQualityReviewOutput,
      }),
    })

    await expect(auditor.run('course-1')).rejects.toMatchObject({ code: 'AUDIT_BLOCKED' })
    expect(store.current().teachingQualityAudit).toMatchObject({ status: 'insufficient-evidence' })
    expect(store.current().teachingQualityAudit?.findings[0]).toMatchObject({
      standardId: 'CN-MOE-YW-2022', pageId: 'page-1', severity: 'insufficient-evidence',
    })
    expect(store.current().teacherAcceptance).toBeUndefined()
  })

  it.each([
    {
      branch: 'block',
      result: (course: MainlineCourse) => {
        const reviewed = passingFactAudit(course)
        reviewed.course.factAudit!.issues = [{
          id: 'fact-race', severity: 'blocking' as const, targetId: 'page-1',
          message: '来源不支持该事实。', impact: '学生可能学到错误事实。', fix: '删除或改正。',
        }]
        reviewed.course.factAudit!.fatalCount = 1
        return reviewed
      },
    },
    {
      branch: 'insufficient',
      result: (course: MainlineCourse) => ({ course: passingFactAudit(course).course }),
    },
    {
      branch: 'pass',
      result: (course: MainlineCourse) => passingFactAudit(course),
    },
  ])('fails closed on a concurrent source refresh in the $branch result branch', async ({ result }) => {
    const store = memory()
    const auditor = createGenerationCourseAuditor({
      ...auditDependencies(store),
      auditFacts: async course => {
        store.replace({
          ...store.current(),
          sourceMaterial: [...store.current().sourceMaterial, {
            kind: 'textbook', kpId: 'kp-new', title: '刷新后的新来源', excerpt: '并发刷新得到的新证据。', citation: '新教材第 2 页',
            provenance: { source: '授权教材', externalId: 'new-source', evidenceStatus: 'authoritative-excerpt' },
          }],
        })
        return result(course)
      },
    })

    await expect(auditor.run('course-1')).rejects.toMatchObject({ code: 'SESSION_CONFLICT' })
    expect(store.current().sourceMaterial).toHaveLength(3)
    expect(store.current().sourceMaterial.at(-1)?.provenance?.externalId).toBe('new-source')
    expect(store.current().generationCourseAudit).toBeUndefined()
    expect(store.current().teachingQualityAudit).toBeUndefined()
  })
})

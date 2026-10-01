import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import type { GenerationCourseAuditRecord } from '../generation-session.js'
import {
  TEACHING_QUALITY_DIMENSIONS,
  buildTeachingQualityAudit,
  teachingQualityInputHash,
  teachingQualityStandards,
  type TeachingQualityReviewOutput,
} from '../teaching-quality-audit.js'

function reviewCourse(): MainlineCourse {
  return {
    id: 'teaching-audit-course',
    topic: '一元一次方程',
    subject: 'math',
    gradeBand: 'middle-school',
    sourceMaterial: [{
      kind: 'definition',
      kpId: 'kp-equation',
      title: '初中数学 middle-school 一元一次方程课程标准',
      excerpt: '学生能理解一元一次方程的概念。',
      citation: '课程标准数学第 2 节',
      provenance: { source: '教育部课程标准', externalId: 'curriculum-math-middle-equation', evidenceStatus: 'authoritative-excerpt' },
    }, {
      kind: 'textbook',
      kpId: 'kp-equation',
      title: '初中数学 middle-school 一元一次方程教材',
      excerpt: '教材用等式关系解释一元一次方程。',
      citation: '教材第 3 页',
      provenance: { source: '授权教材', externalId: 'textbook-math-middle-equation', evidenceStatus: 'authoritative-excerpt' },
    }],
    goals: [], learningFragments: [], scenes: [], qualityStatus: 'draft',
    planning: {
      schemaVersion: 'mainline-page-v2', courseId: 'teaching-audit-course', planRevisionId: 'plan-1', status: 'review',
      learningContracts: [], arc: { id: 'arc-1', courseId: 'teaching-audit-course', steps: [] },
      pages: [{
        id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-equation'], purpose: 'explain', audience: 'student',
        learningAction: '说明方程中的未知数。', newInformation: '一元一次方程只有一个未知数且次数为一。', sourceRefs: [],
        contentSpec: { kind: 'explanation', focus: '一元一次方程', requiredElements: ['定义'] },
        visualSpec: { required: false, form: 'none', reason: '文字定义。', sourceAssetPolicy: 'none' },
        teacherCompanion: { scriptGoal: '讲清定义。', teachingMove: '追问未知数。', pace: 'normal' }, arcStepId: 'arc-1',
      }],
    },
    pageContent: {
      schemaVersion: 'mainline-page-content-v1', courseId: 'teaching-audit-course', planRevisionId: 'plan-1', contentRevisionId: 'content-1', status: 'review',
      pages: [{
        pageId: 'page-1', order: 1, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: [],
        content: { kind: 'explanation', title: '一元一次方程', coreStatement: '一元一次方程只有一个未知数且次数为一。', evidence: [{ text: '2x+1=5 满足这个定义。' }], boundary: '只讨论一元一次方程。' },
        teacherCompanion: { script: '先找未知数，再判断次数。', notes: [], pace: 'normal' },
      }],
    },
  } as unknown as MainlineCourse
}

function generationAudit(): GenerationCourseAuditRecord {
  return {
    schemaVersion: 'mainline-course-audit-v1', id: 'course-audit-1', courseId: 'teaching-audit-course',
    planRevisionId: 'plan-1', contentRevisionId: 'content-1', renderEvidenceIds: ['render-1'], pageIds: ['page-1'],
    factAuditAt: '2026-09-22T00:00:00.000Z', passedAt: '2026-09-22T00:00:00.000Z',
  }
}

function passingReview(course: MainlineCourse): TeachingQualityReviewOutput {
  const standards = teachingQualityStandards(course)
  return {
    reviewedPageIds: ['page-1'],
    reviewedStandardIds: standards.map(standard => standard.id),
    checks: TEACHING_QUALITY_DIMENSIONS.map((dimension, index) => ({
      dimension, standardId: standards[index % standards.length]!.id, pageIds: ['page-1'], status: 'pass' as const,
      evidence: '一元一次方程只有一个未知数且次数为一。',
    })),
    findings: [],
  }
}

describe('standards-backed teaching quality audit', () => {
  it('treats empty findings without exact positive coverage as insufficient evidence', () => {
    const record = buildTeachingQualityAudit(reviewCourse(), generationAudit(), { findings: [] } as unknown as TeachingQualityReviewOutput)

    expect(record.status).toBe('insufficient-evidence')
    expect(record.findings[0]?.impact).toContain('reviewedPageIds')
  })

  it('passes only when curriculum and textbook excerpts are separately traceable and bound to the course', () => {
    const course = reviewCourse()
    const record = buildTeachingQualityAudit(course, generationAudit(), passingReview(course))

    expect(record.status).toBe('passed')
    expect(record.findings).toEqual([])
    expect(record.inputHash).toBe(teachingQualityInputHash(course, record.standards))
  })

  it('changes the input signature when any reviewed semantic input changes without revision IDs changing', () => {
    const course = reviewCourse()
    const original = teachingQualityInputHash(course)
    const changedSource = reviewCourse()
    changedSource.sourceMaterial[0] = { ...changedSource.sourceMaterial[0]!, excerpt: '更新后的课程标准原文。' }
    const changedPage = reviewCourse()
    changedPage.pageContent!.pages[0]!.content = {
      kind: 'explanation', title: '一元一次方程',
      coreStatement: '修改后的学生可见定义。',
      evidence: [{ text: '2x+1=5 满足这个定义。' }], boundary: '只讨论一元一次方程。',
    }
    const changedPlan = reviewCourse()
    changedPlan.planning!.pages[0]!.learningAction = '比较两个方程并解释差异。'
    const changedStyle = reviewCourse()
    changedStyle.stylePackId = 'blueprint'
    const changedImage = reviewCourse()
    changedImage.pageContent!.pages[0]!.imageUrl = '/generated-images/equation-v2.png'

    expect(teachingQualityInputHash(changedSource)).not.toBe(original)
    expect(teachingQualityInputHash(changedPage)).not.toBe(original)
    expect(teachingQualityInputHash(changedPlan)).not.toBe(original)
    expect(teachingQualityInputHash(changedStyle)).not.toBe(original)
    expect(teachingQualityInputHash(changedImage)).not.toBe(original)
    expect(changedSource.pageContent!.contentRevisionId).toBe(course.pageContent!.contentRevisionId)
    expect(changedPage.pageContent!.contentRevisionId).toBe(course.pageContent!.contentRevisionId)
  })

  it('changes the input signature when the resolved student PPT image changes outside page.imageUrl', () => {
    const inherited = reviewCourse()
    inherited.learningFragments = [{
      id: 'fragment-1', goalId: 'goal-1', kpId: 'kp-equation', durationTargetSec: 60,
      sceneIds: ['scene-1'], successSignal: '能够说明定义。',
    }]
    inherited.scenes = [{ id: 'scene-1', imageUrl: '/generated-images/inherited-v1.png' }] as MainlineCourse['scenes']
    const inheritedHash = teachingQualityInputHash(inherited)
    inherited.scenes[0] = { ...inherited.scenes[0]!, imageUrl: '/generated-images/inherited-v2.png' }
    expect(teachingQualityInputHash(inherited)).not.toBe(inheritedHash)

    const sourced = reviewCourse()
    sourced.planning!.pages[0]!.visualSpec = {
      required: true, form: 'instructional-image', reason: '观察教材图。', sourceAssetPolicy: 'grounded-or-generate',
    }
    sourced.planning!.pages[0]!.sourceRefs = ['source:2:kp-equation']
    sourced.pageContent!.pages[0]!.sourceRefs = ['source:2:kp-equation']
    sourced.sourceMaterial[1] = {
      ...sourced.sourceMaterial[1]!,
      candidateResources: [{
        id: 'asset-1', kind: 'textbook-asset', title: '教材图', mediaType: 'image/png',
        assetUrl: '/api/v2/education-resources/file/asset-1',
      }],
    }
    const sourcedHash = teachingQualityInputHash(sourced)
    sourced.sourceMaterial[1] = {
      ...sourced.sourceMaterial[1]!,
      candidateResources: [{
        id: 'asset-2', kind: 'textbook-asset', title: '教材图', mediaType: 'image/png',
        assetUrl: '/api/v2/education-resources/file/asset-2',
      }],
    }
    expect(teachingQualityInputHash(sourced)).not.toBe(sourcedHash)
  })

  it('fails closed when a claimed authoritative source is not bound to the course topic', () => {
    const course = reviewCourse()
    course.sourceMaterial[1] = { ...course.sourceMaterial[1]!, title: '初中数学 middle-school 教材' }
    const record = buildTeachingQualityAudit(course, generationAudit(), passingReview(course))

    expect(record.status).toBe('insufficient-evidence')
    expect(record.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'insufficient-evidence', impact: expect.stringContaining('教材原文') }),
    ]))
  })
})

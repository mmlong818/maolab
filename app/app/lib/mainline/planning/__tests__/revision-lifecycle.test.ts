import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../../domain.js'
import type { CoursePageContentState } from '../page-content-contract.js'
import type { CoursePlanningState, LessonPagePlan } from '../page-contract.js'
import {
  approveDraftPlan,
  forkCourseForReplanning,
  markCourseSuperseded,
  markPageContentReady,
  saveDraftPlan,
} from '../revision-lifecycle.js'

const page: LessonPagePlan = {
  id: 'lp-001-orient',
  order: 1,
  fragmentId: 'fragment:course-opening',
  knowledgePointIds: [],
  purpose: 'orient',
  audience: 'student',
  learningAction: '先写下对本课问题的判断。',
  newInformation: '呈现本课问题。',
  sourceRefs: [],
  contentSpec: { kind: 'course-orientation', topic: '测试课程', goalIds: [] },
  visualSpec: { required: false, form: 'none', reason: '开场不使用装饰图。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '说明学习问题。', teachingMove: '收集初步判断。', pace: 'brief' },
  arcStepId: 'arc-001-orient',
}

function planning(status: CoursePlanningState['status']): CoursePlanningState {
  return {
    schemaVersion: 'mainline-page-v2',
    courseId: 'course-1',
    planRevisionId: 'course-1:plan:1',
    status,
    learningContracts: [],
    arc: {
      id: 'course-1:plan:1:arc',
      courseId: 'course-1',
      steps: [{
        id: 'arc-001-orient',
        order: 1,
        fragmentId: 'fragment:course-opening',
        knowledgePointIds: [],
        goalIds: [],
        action: 'orient',
        role: '提出学习问题',
        focus: '测试课程',
        contentOutline: ['测试课程'],
        pagePurposes: ['orient'],
        sourceRefs: [],
      }],
    },
    pages: [page],
  }
}

function pageContent(): CoursePageContentState {
  return {
    schemaVersion: 'mainline-page-content-v1',
    courseId: 'course-1',
    planRevisionId: 'course-1:plan:1',
    contentRevisionId: 'course-1:plan:1:content:1',
    status: 'review',
    pages: [{
      pageId: page.id,
      order: 1,
      purpose: 'orient',
      planRevisionId: 'course-1:plan:1',
      sourceRefs: [],
      content: { kind: 'course-orientation', title: '测试课程', learningQuestion: '这节课需要解决什么问题？', goals: ['能够根据材料说明自己的判断依据。'] },
      teacherCompanion: { script: '这节课先从一个问题开始，请先独立形成判断，再说出你使用的依据。', notes: [], pace: 'brief' },
    }],
  }
}

function course(status: CoursePlanningState['status']): MainlineCourse {
  return {
    id: 'course-1',
    sourceMaterial: [],
    planning: planning(status),
    qualityStatus: status === 'ready' ? 'passed' : 'draft',
    ...(status === 'review' || status === 'ready' ? { pageContent: pageContent() } : {}),
  } as unknown as MainlineCourse
}

describe('page-first revision lifecycle', () => {
  it('only edits teacher-visible plan fields while the plan is still pending', () => {
    const original = course('planning')
    const next = saveDraftPlan(original, [{
      pageId: page.id,
      learningAction: '  先判断，再说明依据。 ',
      newInformation: ' 呈现一个可回答的学习问题。 ',
      visualReason: ' 不使用无教学作用的装饰图。 ',
      teachingMove: ' 先收集判断，再追问依据。 ',
    }])

    expect(next.planning?.pages[0]).toMatchObject({
      id: page.id,
      purpose: 'orient',
      learningAction: '先判断，再说明依据。',
      newInformation: '呈现一个可回答的学习问题。',
      visualSpec: { reason: '不使用无教学作用的装饰图。' },
      teacherCompanion: { teachingMove: '先收集判断，再追问依据。' },
    })
    expect(original.planning?.pages[0]?.learningAction).toBe(page.learningAction)
    expect(() => saveDraftPlan(course('plan-approved'), [])).toThrow(/不能原地修改/)
  })

  it('rejects an empty visual purpose for a page that requires an image', () => {
    const visualCourse = course('planning')
    visualCourse.planning!.pages[0] = {
      ...visualCourse.planning!.pages[0]!,
      visualSpec: {
        required: true,
        form: 'instructional-image',
        reason: '帮助学生观察关键差异。',
        sourceAssetPolicy: 'grounded-or-generate',
      },
    }

    expect(() => saveDraftPlan(visualCourse, [{
      pageId: page.id,
      learningAction: page.learningAction,
      newInformation: page.newInformation,
      visualReason: '   ',
      teachingMove: page.teacherCompanion.teachingMove,
    }])).toThrow(/必须说明图像的教学作用/)
  })

  it('approves a valid plan without generating or mutating page content', () => {
    const next = approveDraftPlan(course('planning'))
    expect(next.planning?.status).toBe('plan-approved')
    expect(next.pageContent).toBeUndefined()
    expect(next.qualityStatus).toBe('draft')
  })

  it('creates a new planning record and leaves the classroom version unchanged', () => {
    const original = course('ready')
    original.generationSession = { id: 'old-session' } as NonNullable<MainlineCourse['generationSession']>
    original.pageRenderEvidence = [{ id: 'old-render' }] as NonNullable<MainlineCourse['pageRenderEvidence']>
    original.generationCourseAudit = { id: 'old-audit' } as NonNullable<MainlineCourse['generationCourseAudit']>
    original.teacherAcceptance = { courseId: original.id } as NonNullable<MainlineCourse['teacherAcceptance']>
    const next = forkCourseForReplanning(original, 'course-2')

    expect(original).toMatchObject({ id: 'course-1', qualityStatus: 'passed', planning: { status: 'ready' } })
    expect(next).toMatchObject({
      id: 'course-2',
      qualityStatus: 'draft',
      revision: { familyId: 'course-1', revisionNo: 2, basedOnCourseId: 'course-1' },
      planning: {
        courseId: 'course-2',
        planRevisionId: 'course-2:plan:2',
        basedOnPlanRevisionId: 'course-1:plan:1',
        status: 'planning',
      },
    })
    expect(next.pageContent).toBeUndefined()
    expect(next.factAudit).toBeUndefined()
    expect(next.generationSession).toBeUndefined()
    expect(next.pageRenderEvidence).toBeUndefined()
    expect(next.generationCourseAudit).toBeUndefined()
    expect(next.teacherAcceptance).toBeUndefined()
  })

  it('refuses to promote reviewed content without machine audit and teacher signatures', () => {
    expect(() => markPageContentReady(course('review'))).toThrow(/机器审计和教师验收/)

    const stale = course('review')
    stale.pageContent = { ...stale.pageContent!, planRevisionId: 'old-plan' }
    expect(() => markPageContentReady(stale)).toThrow(/机器审计和教师验收|页面正文未通过/)
  })

  it('refuses to promote a version whose teaching-quality review is stale or absent', () => {
    const reviewed = course('review')
    reviewed.generationSession = { status: 'ready' } as NonNullable<MainlineCourse['generationSession']>
    reviewed.generationCourseAudit = {
      id: 'audit-1', courseId: reviewed.id, planRevisionId: reviewed.planning!.planRevisionId,
      contentRevisionId: reviewed.pageContent!.contentRevisionId,
    } as NonNullable<MainlineCourse['generationCourseAudit']>
    reviewed.teacherAcceptance = {
      schemaVersion: 'mainline-teacher-acceptance-v1', courseId: reviewed.id, planRevisionId: reviewed.planning!.planRevisionId, courseAuditId: 'audit-1',
      pages: [], finalSignature: 'signature-1', acceptedAt: '2026-09-22T00:00:00.000Z',
    } as NonNullable<MainlineCourse['teacherAcceptance']>
    reviewed.teachingQualityAudit = {
      status: 'passed', courseId: reviewed.id, planRevisionId: reviewed.planning!.planRevisionId,
      contentRevisionId: 'old-content', generationCourseAuditId: 'audit-1',
    } as NonNullable<MainlineCourse['teachingQualityAudit']>

    expect(() => markPageContentReady(reviewed)).toThrow(/AI 教学审查通过记录/)
  })

  it('marks the replaced course without changing its teaching content', () => {
    const original = course('ready')
    const next = markCourseSuperseded(original, 'course-2')
    expect(next.revision).toEqual({ familyId: 'course-1', revisionNo: 1, supersededByCourseId: 'course-2' })
    expect(next.pageContent).toEqual(original.pageContent)
  })
})

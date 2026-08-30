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
    }])

    expect(next.planning?.pages[0]).toMatchObject({
      id: page.id,
      purpose: 'orient',
      learningAction: '先判断，再说明依据。',
      newInformation: '呈现一个可回答的学习问题。',
    })
    expect(original.planning?.pages[0]?.learningAction).toBe(page.learningAction)
    expect(() => saveDraftPlan(course('plan-approved'), [])).toThrow(/不能原地修改/)
  })

  it('approves a valid plan without generating or mutating page content', () => {
    const next = approveDraftPlan(course('planning'))
    expect(next.planning?.status).toBe('plan-approved')
    expect(next.pageContent).toBeUndefined()
    expect(next.qualityStatus).toBe('draft')
  })

  it('creates a new planning record and leaves the classroom version unchanged', () => {
    const original = course('ready')
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
  })

  it('only promotes reviewed content that is still bound to the current plan', () => {
    const next = markPageContentReady(course('review'))
    expect(next).toMatchObject({ qualityStatus: 'passed', planning: { status: 'ready' } })

    const stale = course('review')
    stale.pageContent = { ...stale.pageContent!, planRevisionId: 'old-plan' }
    expect(() => markPageContentReady(stale)).toThrow(/页面正文未通过/)
  })

  it('marks the replaced course without changing its teaching content', () => {
    const original = course('ready')
    const next = markCourseSuperseded(original, 'course-2')
    expect(next.revision).toEqual({ familyId: 'course-1', revisionNo: 1, supersededByCourseId: 'course-2' })
    expect(next.pageContent).toEqual(original.pageContent)
  })
})

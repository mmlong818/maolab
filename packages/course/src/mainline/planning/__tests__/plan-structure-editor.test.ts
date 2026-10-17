import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../../domain.js'
import type { CoursePlanningState, LessonPagePlan } from '../page-contract.js'
import { editDraftPlanStructure } from '../plan-structure-editor.js'

const base = {
  fragmentId: 'fragment-1', knowledgePointIds: [], audience: 'student' as const,
  learningAction: '完成本页任务。', newInformation: '增加一项可核对的信息。', sourceRefs: [],
  visualSpec: { required: false, form: 'none' as const, reason: '不需要图像。', sourceAssetPolicy: 'none' as const },
  teacherCompanion: { scriptGoal: '推进学习。', teachingMove: '追问依据。', pace: 'normal' as const },
  arcStepId: 'step-1',
}

const pages: LessonPagePlan[] = [{
  ...base, id: 'question', order: 1, purpose: 'question', pairId: 'pair-1', pairRole: 'prompt', layoutGroupId: 'pair-1',
  contentSpec: { kind: 'question', promptGoal: '先判断。', answerPolicy: 'separate-following-page', responsePageId: 'answer', materialRefs: [] },
}, {
  ...base, id: 'answer', order: 2, purpose: 'answer', previousPageId: 'question', pairId: 'pair-1', pairRole: 'response', layoutGroupId: 'pair-1',
  contentSpec: { kind: 'answer', questionPageId: 'question', requiredElements: ['conclusion', 'evidence', 'correction'] },
}, {
  ...base, id: 'explain', order: 3, purpose: 'explain', previousPageId: 'answer', learningAction: '解释概念。', newInformation: '呈现概念关系。',
  contentSpec: { kind: 'explanation', focus: '概念关系', requiredElements: ['概念', '依据'] },
}]

function course(): MainlineCourse {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: 'course-1', planRevisionId: 'plan-1', status: 'planning', learningContracts: [],
    arc: { id: 'arc-1', courseId: 'course-1', steps: [{
      id: 'step-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: [], goalIds: [], action: 'judge-and-revise',
      role: '判断并修正', focus: '概念关系', contentOutline: [], pagePurposes: ['question', 'answer', 'explain'], sourceRefs: [],
    }] },
    pages,
  }
  return { id: 'course-1', planning, sourceMaterial: [], qualityStatus: 'draft' } as unknown as MainlineCourse
}

describe('draft plan structure editor', () => {
  it('moves a paired question and answer as one adjacent unit', () => {
    const next = editDraftPlanStructure(course(), { type: 'move', pageId: 'explain', direction: 'up' })
    expect(next.planning?.pages.map(page => page.id)).toEqual(['explain', 'question', 'answer'])
    expect(next.planning?.pages.map(page => page.order)).toEqual([1, 2, 3])
    expect(next.planning?.pages.map(page => page.previousPageId)).toEqual([undefined, 'explain', 'question'])
    expect(next.planning?.arc.steps[0]?.pagePurposes).toEqual(['explain', 'question', 'answer'])
  })

  it('deletes both pages of a question-answer pair and updates the arc contract', () => {
    const next = editDraftPlanStructure(course(), { type: 'delete', pageId: 'question' })
    expect(next.planning?.pages.map(page => page.id)).toEqual(['explain'])
    expect(next.planning?.arc.steps[0]?.pagePurposes).toEqual(['explain'])
  })

  it('does not mutate an approved plan', () => {
    const approved = course()
    approved.planning = { ...approved.planning!, status: 'plan-approved' }
    expect(() => editDraftPlanStructure(approved, { type: 'delete', pageId: 'question' })).toThrow(/只有待确认/)
  })

  it('inserts a distinct explanation page and updates ordering', () => {
    const next = editDraftPlanStructure(course(), {
      type: 'insert-explanation', afterPageId: 'explain',
      learningAction: '比较两个概念。', newInformation: '呈现两个概念的关键差异。',
    })
    expect(next.planning?.pages).toHaveLength(4)
    expect(next.planning?.pages[3]).toMatchObject({
      id: 'plan-1:manual:1', order: 4, purpose: 'explain',
      learningAction: '比较两个概念。', newInformation: '呈现两个概念的关键差异。',
    })
    expect(next.planning?.arc.steps[0]?.pagePurposes).toEqual(['question', 'answer', 'explain', 'explain'])
  })

  it('splits an explanation into two pages with separate learning purposes', () => {
    const next = editDraftPlanStructure(course(), {
      type: 'split-explanation', pageId: 'explain',
      firstLearningAction: '先辨认概念。', firstNewInformation: '呈现概念定义。',
      secondLearningAction: '再比较差异。', secondNewInformation: '呈现概念间的关键差异。',
    })
    expect(next.planning?.pages.map(page => page.newInformation)).toEqual([
      '增加一项可核对的信息。', '增加一项可核对的信息。', '呈现概念定义。', '呈现概念间的关键差异。',
    ])
    expect(next.planning?.pages[3]?.previousPageId).toBe('explain')
  })

  it('rejects generic splitting for a paired page', () => {
    expect(() => editDraftPlanStructure(course(), {
      type: 'split-explanation', pageId: 'question',
      firstLearningAction: '先判断。', firstNewInformation: '呈现问题。',
      secondLearningAction: '再回答。', secondNewInformation: '呈现另一问题。',
    })).toThrow(/只有独立的概念讲解页/)
  })
})

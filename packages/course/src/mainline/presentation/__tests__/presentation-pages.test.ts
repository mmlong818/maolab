import { describe, expect, it } from 'vitest'
import {
  COURSE_STRUCTURE_ITEMS_SLOT,
  COURSE_STRUCTURE_VARIANT,
  PRESENTATION_VARIANT_SLOT,
  RECAP_TRANSFER_VARIANT,
  courseStructureItemsFromScene,
  lessonPresentationPages,
  presentationPagesForScene,
  presentationScene,
} from '../presentation-pages.js'
import {
  PAGE_CONTENT_DATA_SLOT,
  PAGE_CONTENT_VARIANT_SLOT,
  isPageContentScene,
  pageContentFromScene,
  pairedPromptContentFromScene,
} from '../page-content-presentation.js'
import { PAGE_CONTENT_SCHEMA_VERSION, type CoursePageContentState } from '../../planning/page-content-contract.js'
import { PAGE_PLAN_SCHEMA_VERSION, type CoursePlanningState } from '../../planning/page-contract.js'
import type { LessonScene } from '../../domain.js'

function scene(overrides: Partial<LessonScene>): LessonScene {
  return {
    id: 'scene-1', sceneType: 'ai-verify', visualLayout: 'default', contentSlots: {}, visualFocus: '辨析', narrationAnchor: '重点', syncStrategy: '', boardText: [], sceneTechnique: 'static-board', interactionContract: '', fallbackPresentation: '', characterLayer: { layout: 'no-character', positionRule: '', exitRule: '' }, dialogueLayout: 'no-character', peerFunction: 'none', subjectTeachingMode: 'general-explanation', voiceCue: { emotion: '', pace: 'medium', pauseRule: '' }, gradeTone: '', teacherScript: '', studentAction: '', evidenceOnScreen: [],
    ...overrides,
  }
}

describe('presentationPagesForScene', () => {
  it('将每条 AI 说法的判断与核查展开为连续投影片，而不是页内阶段按钮', () => {
    const pages = presentationPagesForScene(scene({
      misconceptionSources: ['误区一', '误区二'],
      contentSlots: {
        aiClaim1: '错误说法一', reveal1: '纠正一',
        aiClaim2: '错误说法二', reveal2: '纠正二',
      },
    }))

    expect(pages).toHaveLength(4)
    expect(pages.map(page => page.feedbackRevealed)).toEqual([false, true, false, true])
    expect(pages.map(page => page.stateId)).toEqual([
      'scene-1:verify-1',
      'scene-1:verify-1',
      'scene-1:verify-2',
      'scene-1:verify-2',
    ])
    expect(pages.map(page => page.scene.contentSlots.aiClaim)).toEqual(['错误说法一', '错误说法一', '错误说法二', '错误说法二'])
    expect(pages.map(page => page.stageLabel)).toEqual(['第 1 条 · 学生判断', '第 1 条 · 显示核查', '第 2 条 · 学生判断', '第 2 条 · 显示核查'])
  })

  it('将普通先答后揭晓场景展开为两张投影片', () => {
    const pages = presentationPagesForScene(scene({
      sceneType: 'practice',
      contentSlots: { task: '先判断', feedback: '再核对' },
    }))

    expect(pages).toHaveLength(2)
    expect(pages.map(page => page.feedbackRevealed)).toEqual([false, true])
    expect(presentationScene(pages[0]!).boardText).toEqual(['先判断'])
    expect(presentationScene(pages[1]!).boardText).toEqual(['再核对'])
  })

  it('将有效迁移任务作为总结后的独立投影片', () => {
    const pages = presentationPagesForScene(scene({
      sceneType: 'recap',
      contentSlots: {
        takeaway: '本课结论',
        transferTask: '如果把研究对象换成墙，判断手对墙和墙对手是否平衡，并说明变化后的依据。',
      },
    }))

    expect(pages).toHaveLength(2)
    expect(pages.map(page => page.stageLabel)).toEqual(['本课总结', '迁移练习'])
    expect(pages[0]!.scene.contentSlots.transferTask).toBeUndefined()
    expect(pages[1]!.scene.contentSlots[PRESENTATION_VARIANT_SLOT]).toBe(RECAP_TRANSFER_VARIANT)
    expect(pages[1]!.scene.imageUrl).toBeUndefined()
  })
})

describe('lessonPresentationPages', () => {
  it('新正文存在时严格按 pageContent 一对一返回，不再按旧场景拆页或插入派生页', () => {
    const legacyPractice = scene({
      id: 'legacy-practice',
      sceneType: 'practice',
      contentSlots: { task: '旧题面', feedback: '旧反馈' },
    })
    const question = {
      kind: 'practice' as const,
      title: '独立练习',
      prompt: '判断下列说法是否正确，并写出一条依据。',
      materials: ['材料一'],
      responseInstruction: '先写结论，再写依据。',
    }
    const feedback = {
      kind: 'feedback' as const,
      title: '核对与修正',
      successCriteria: ['结论明确', '依据可核对'],
      conclusion: '这条说法不成立。',
      evidence: [{ text: '材料一与该说法矛盾。' }],
      revisionAction: '根据材料一改写原判断。',
    }
    const planning: CoursePlanningState = {
      schemaVersion: PAGE_PLAN_SCHEMA_VERSION,
      courseId: 'course-1',
      planRevisionId: 'plan-1',
      status: 'review',
      learningContracts: [],
      arc: { id: 'arc-1', courseId: 'course-1', steps: [] },
      pages: [
        {
          id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'], purpose: 'practice', audience: 'student',
          learningAction: '独立判断并写依据。', newInformation: '呈现练习题。', sourceRefs: [],
          contentSpec: { kind: 'practice', taskGoal: '独立判断', answerPolicy: 'separate-following-page', responsePageId: 'page-2', materialRefs: [] },
          visualSpec: { required: false, form: 'practice-space', reason: '保留作答空间。', sourceAssetPolicy: 'none' },
          teacherCompanion: { scriptGoal: '读题。', teachingMove: '等待作答。', pace: 'normal' }, arcStepId: 'step-1', pairId: 'pair-1', pairRole: 'prompt', layoutGroupId: 'pair-1',
        },
        {
          id: 'page-2', order: 2, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'], purpose: 'feedback', audience: 'student',
          learningAction: '核对并修正。', newInformation: '增加结论和依据。', sourceRefs: [],
          contentSpec: { kind: 'feedback', questionPageId: 'page-1', requiredElements: ['success-criteria', 'conclusion', 'evidence', 'revision-action'] },
          visualSpec: { required: false, form: 'practice-space', reason: '沿用练习版位。', sourceAssetPolicy: 'none' },
          teacherCompanion: { scriptGoal: '核对。', teachingMove: '完成修正。', pace: 'deliberate' }, arcStepId: 'step-1', pairId: 'pair-1', pairRole: 'response', layoutGroupId: 'pair-1', previousPageId: 'page-1',
        },
      ],
    }
    const pageContent: CoursePageContentState = {
      schemaVersion: PAGE_CONTENT_SCHEMA_VERSION,
      courseId: 'course-1',
      planRevisionId: 'plan-1',
      contentRevisionId: 'content-1',
      status: 'review',
      pages: [
        { pageId: 'page-1', order: 1, purpose: 'practice', planRevisionId: 'plan-1', sourceRefs: [], content: question, imageUrl: '/generated-images/page-1.png', teacherCompanion: { script: '请先独立完成这道练习，再交流判断依据。', notes: [], pace: 'normal' }, pairId: 'pair-1', pairRole: 'prompt', layoutGroupId: 'pair-1' },
        { pageId: 'page-2', order: 2, purpose: 'feedback', planRevisionId: 'plan-1', sourceRefs: [], content: feedback, teacherCompanion: { script: '现在逐条核对判断标准，并根据材料修正原答案。', notes: ['先核对依据'], pace: 'deliberate' }, pairId: 'pair-1', pairRole: 'response', layoutGroupId: 'pair-1' },
      ],
    }

    const pages = lessonPresentationPages({
      scenes: [legacyPractice],
      learningFragments: [{ id: 'fragment-1', goalId: 'goal-1', kpId: 'kp-1', durationTargetSec: 120, sceneIds: ['legacy-practice'], successSignal: '' }],
      sourceMaterial: [],
      planning,
      pageContent,
    })

    expect(pages.map(page => page.id)).toEqual(['page-1', 'page-2'])
    expect(pages.map(page => page.feedbackRevealed)).toEqual([true, true])
    expect(pages.every(page => page.derived)).toBe(true)
    expect(pages.every(page => isPageContentScene(page.scene))).toBe(true)
    expect(pages[0]!.scene.contentSlots[PAGE_CONTENT_VARIANT_SLOT]).toBeTruthy()
    expect(pages[0]!.scene.contentSlots[PAGE_CONTENT_DATA_SLOT]).toBeTruthy()
    expect(pageContentFromScene(pages[0]!.scene)).toEqual(question)
    expect(pages[0]!.scene.imageUrl).toBe('/generated-images/page-1.png')
    expect(pageContentFromScene(pages[1]!.scene)).toEqual(feedback)
    expect(pairedPromptContentFromScene(pages[1]!.scene)).toEqual(question)
    expect(presentationScene(pages[1]!)).toBe(pages[1]!.scene)
  })

  it('在封面后插入学生可见的课程结构投影片，并按知识点完整列出学习顺序', () => {
    const opening = scene({
      id: 'opening',
      sceneType: 'source-reading',
      contentSlots: { learningPath: '先判断 → 再作图 → 最后迁移' },
      studentAction: '写下预测和一条理由',
    })
    const balance = scene({
      id: 'balance',
      sceneType: 'worked-example',
      kpId: 'kp-balance',
      studentAction: '逐条核验四个条件',
    })
    const drawing = scene({
      id: 'drawing',
      sceneType: 'worked-example',
      kpId: 'kp-drawing',
      studentAction: '画出两个力并检查标注',
    })
    const recap = scene({
      id: 'recap',
      sceneType: 'recap',
      studentAction: '用新情境检验本课方法',
    })

    const pages = lessonPresentationPages({
      scenes: [opening, balance, drawing, recap],
      learningFragments: [
        { id: 'intro', goalId: 'goal-1', durationTargetSec: 60, sceneIds: ['opening'], successSignal: '' },
        { id: 'balance-fragment', goalId: 'goal-1', kpId: 'kp-balance', durationTargetSec: 120, sceneIds: ['balance'], successSignal: '' },
        { id: 'drawing-fragment', goalId: 'goal-2', kpId: 'kp-drawing', durationTargetSec: 120, sceneIds: ['drawing'], successSignal: '' },
        { id: 'recap-fragment', goalId: 'goal-1', durationTargetSec: 60, sceneIds: ['recap'], successSignal: '' },
      ],
      sourceMaterial: [
        { kind: 'textbook', title: '二力平衡的四个条件', kpId: 'kp-balance' },
        { kind: 'textbook', title: '力的示意图画法规范', kpId: 'kp-drawing' },
      ],
    })

    expect(pages[0]!.sourceSceneId).toBe('opening')
    expect(pages[1]!.derived).toBe(true)
    expect(pages[1]!.scene.contentSlots[PRESENTATION_VARIANT_SLOT]).toBe(COURSE_STRUCTURE_VARIANT)
    expect(pages[1]!.scene.contentSlots[COURSE_STRUCTURE_ITEMS_SLOT]).toBeTruthy()
    expect(courseStructureItemsFromScene(pages[1]!.scene)).toEqual([
      { title: '提出问题', detail: '写下预测和一条理由' },
      { title: '二力平衡的四个条件', detail: '逐条核验四个条件' },
      { title: '力的示意图画法规范', detail: '画出两个力并检查标注' },
      { title: '总结与迁移', detail: '用新情境检验本课方法' },
    ])
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../../domain.js'
import {
  factAuditPageContentCourse,
  type PageContentFactAuditLLMCall,
} from '../page-content-fact-audit.js'

function reviewCourse(): MainlineCourse {
  return {
    id: 'course-review-1',
    topic: '密闭容器中混合气体密度的变化',
    subject: 'chemistry',
    gradeBand: 'high-school',
    boundary: '只讨论恒温恒容的密闭容器。',
    qualityStatus: 'draft',
    sourceMaterial: [],
    goals: [{
      id: 'goal-1',
      kpId: 'kp-1',
      statement: '能判断恒温恒容密闭容器中混合气体密度是否变化',
      successSignal: '能用质量守恒和体积不变说明结论。',
      nonGoals: [],
    }],
    planning: {
      schemaVersion: 'mainline-page-v2',
      courseId: 'course-review-1',
      planRevisionId: 'course-review-1:plan:1',
      status: 'review',
      learningContracts: [],
      arc: { id: 'arc-1', courseId: 'course-review-1', steps: [] },
      pages: [{
        id: 'page-question', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'],
        purpose: 'question', audience: 'student', learningAction: '先判断密度是否变化。',
        newInformation: '给出恒温恒容密闭容器条件。', sourceRefs: [],
        contentSpec: { kind: 'question', promptGoal: '判断密度是否变化', answerPolicy: 'separate-following-page', responsePageId: 'page-answer', materialRefs: [] },
        visualSpec: { required: false, form: 'none', reason: '文字题。', sourceAssetPolicy: 'none' },
        teacherCompanion: { scriptGoal: '提出问题。', teachingMove: '收集判断。', pace: 'brief' },
        arcStepId: 'step-1', pairId: 'pair-1', pairRole: 'prompt',
      }, {
        id: 'page-answer', order: 2, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'],
        purpose: 'answer', audience: 'student', learningAction: '核对结论与依据。',
        newInformation: '质量守恒且体积不变，所以密度不变。', sourceRefs: [],
        contentSpec: { kind: 'answer', questionPageId: 'page-question', requiredElements: ['conclusion', 'evidence', 'correction'] },
        visualSpec: { required: false, form: 'none', reason: '文字回答。', sourceAssetPolicy: 'none' },
        teacherCompanion: { scriptGoal: '核对依据。', teachingMove: '强调条件。', pace: 'normal' },
        arcStepId: 'step-1', pairId: 'pair-1', pairRole: 'response', previousPageId: 'page-question',
      }],
    },
    pageContent: {
      schemaVersion: 'mainline-page-content-v1',
      courseId: 'course-review-1',
      planRevisionId: 'course-review-1:plan:1',
      contentRevisionId: 'course-review-1:plan:1:content:1',
      status: 'review',
      pages: [{
        pageId: 'page-question', order: 1, purpose: 'question', planRevisionId: 'course-review-1:plan:1',
        sourceRefs: [], pairId: 'pair-1', pairRole: 'prompt',
        content: { kind: 'question', title: '先判断', prompt: '密闭容器中混合气体密度会变化吗？', materials: ['恒温、恒容，反应前后容器密闭。'], responseInstruction: '写出结论和依据。' },
        teacherCompanion: { script: '先独立判断，再用密度定义式说明理由。', notes: [], pace: 'brief' },
      }, {
        pageId: 'page-answer', order: 2, purpose: 'answer', planRevisionId: 'course-review-1:plan:1',
        sourceRefs: [], pairId: 'pair-1', pairRole: 'response',
        content: { kind: 'answer', title: '核对结论', conclusion: '密度不变。', evidence: [{ text: '密闭体系总质量守恒。' }, { text: '容器体积保持不变。' }], correction: '必须同时写明质量和体积条件。' },
        teacherCompanion: { script: '密度等于质量除以体积。密闭体系总质量守恒，容器体积不变，所以混合气体总密度不变。', notes: [], pace: 'normal' },
      }],
    },
  } as unknown as MainlineCourse
}

describe('页面优先课程整课事实核查', () => {
  it('核查通过时记录精确正文版本和全部页面覆盖', async () => {
    const llm: PageContentFactAuditLLMCall = vi.fn(async ({ system, user }) => {
      expect(system).toContain('严格数学分形的精确自相似与自然形态的近似或统计自相似')
      const payload = JSON.parse(user) as { pages: Array<{ pageId: string; hasCheckableMaterial: boolean }> }
      expect(payload.pages.find(page => page.pageId === 'page-question')?.hasCheckableMaterial).toBe(true)
      return {
        issues: [],
        goalCoverage: [{ goalId: 'goal-1', status: 'covered', pageIds: ['page-answer'], evidence: '回答页用质量守恒和体积不变完成解释。' }],
      }
    })

    const result = await factAuditPageContentCourse(reviewCourse(), { llm })

    expect(result.record).toMatchObject({
      contentRevisionId: 'course-review-1:plan:1:content:1',
      auditedSceneCount: 2,
      auditedSceneIds: ['page-question', 'page-answer'],
      fatalCount: 0,
    })
    expect(result.course.qualityStatus).toBe('draft')
  })

  it('文本核查模型不能把已绑定的真实页面图片误报为缺图', async () => {
    const course = reviewCourse()
    course.planning!.pages[0]!.visualSpec = {
      required: true,
      form: 'instructional-image',
      reason: '需要观察图片。',
      sourceAssetPolicy: 'grounded-or-generate',
    }
    course.pageContent!.pages[0]!.imageUrl = '/generated-images/example.png'
    const llm: PageContentFactAuditLLMCall = vi.fn(async ({ system, user }) => {
      expect(system).toContain('hasImage=true')
      const payload = JSON.parse(user) as { pages: Array<{ pageId: string; hasImage: boolean }> }
      expect(payload.pages.find(page => page.pageId === 'page-question')?.hasImage).toBe(true)
      return {
        issues: [{
          pageIds: ['page-question'], severity: 'blocking', category: 'visual-evidence',
          claim: '页面没有提供真实图像。', evidence: '核查输入没有图像像素。', fix: '补充图像。',
        }],
        goalCoverage: [{ goalId: 'goal-1', status: 'covered', pageIds: ['page-answer'], evidence: '回答页完成目标。' }],
      }
    })

    const result = await factAuditPageContentCourse(course, { llm })

    expect(result.record.fatalCount).toBe(0)
    expect(result.record.issues).toEqual([])
  })

  it('明确标注的课堂自编迁移材料不因没有外部出处而被阻断', async () => {
    const course = reviewCourse()
    const question = course.pageContent!.pages[0]!
    question.content = {
      kind: 'question',
      title: '迁移练习',
      prompt: '判断反复词语的表达作用。',
      materials: ['课堂自编材料：绿绿秧苗，细细水流。绿绿秧苗，轻轻风过。'],
      responseInstruction: '引用材料中的词句作为依据。',
    }
    const llm: PageContentFactAuditLLMCall = vi.fn(async ({ system }) => {
      expect(system).toContain('不因没有外部出处或权威原文而判 blocking')
      expect(system).toContain('只统计问题页 studentContent 中承载题面的 materials 或 materialCaption')
      return {
        issues: [],
        goalCoverage: [{ goalId: 'goal-1', status: 'covered', pageIds: ['page-answer'], evidence: '回答页完成目标。' }],
      }
    })

    const result = await factAuditPageContentCourse(course, { llm })

    expect(result.record.fatalCount).toBe(0)
  })

  it('允许重新核查已发布课堂版本，但不改动流程状态', async () => {
    const course = reviewCourse()
    course.planning = { ...course.planning!, status: 'ready' }
    course.qualityStatus = 'passed'
    const llm: PageContentFactAuditLLMCall = vi.fn(async () => ({
      issues: [],
      goalCoverage: [{ goalId: 'goal-1', status: 'covered', pageIds: ['page-answer'], evidence: '回答页完成目标。' }],
    }))

    const result = await factAuditPageContentCourse(course, { llm })

    expect(result.course.planning?.status).toBe('ready')
    expect(result.course.qualityStatus).toBe('passed')
    expect(result.record.fatalCount).toBe(0)
  })

  it('事实错误和目标漏教都形成发布阻断', async () => {
    const llm: PageContentFactAuditLLMCall = vi.fn(async () => ({
      issues: [{
        pageIds: ['page-answer'], severity: 'blocking', category: 'factual-error',
        claim: '密闭恒容体系的总质量会随反应变化。',
        evidence: '密闭体系遵守质量守恒，恒容时混合气体总密度不随反应进度变化。',
        fix: '改为总质量守恒，并区分组分浓度与混合气体总密度。',
      }],
      goalCoverage: [{
        goalId: 'goal-1', status: 'missing', pageIds: [],
        evidence: '只有结论，没有安排学生用定义式完成检核。',
        missingElement: '缺少学生使用密度定义式完成的独立练习。',
      }],
    }))

    const result = await factAuditPageContentCourse(reviewCourse(), { llm })

    expect(result.course.qualityStatus).toBe('blocked')
    expect(result.record.fatalCount).toBe(2)
    expect(result.record.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('事实错误'),
      expect.stringContaining('学习目标未被完整教学'),
    ]))
  })

  it('核查服务失败时整课页面全部标记为未验证', async () => {
    const llm: PageContentFactAuditLLMCall = vi.fn(async () => { throw new Error('provider timeout') })

    const result = await factAuditPageContentCourse(reviewCourse(), { llm })

    expect(result.course.qualityStatus).toBe('blocked')
    expect(result.record.auditedSceneCount).toBe(0)
    expect(result.record.unverifiedSceneIds).toEqual(['page-question', 'page-answer'])
    expect(result.record.issues).toHaveLength(2)
  })

  it('不存在的核查页面 ID 不会被静默接受', async () => {
    const llm: PageContentFactAuditLLMCall = vi.fn(async () => ({
      issues: [{
        pageIds: ['invented-page'], severity: 'blocking', category: 'internal-contradiction',
        claim: '页面前后矛盾。', evidence: '无法定位。', fix: '重新核查。',
      }],
      goalCoverage: [{ goalId: 'goal-1', status: 'covered', pageIds: ['page-answer'], evidence: '回答页完成目标。' }],
    }))

    const result = await factAuditPageContentCourse(reviewCourse(), { llm })

    expect(result.record.fatalCount).toBe(1)
    expect(result.record.issues[0]?.message).toContain('不存在的页面')
  })

  it('兼容外部模型省略空 issues 并使用 pass 表示目标已覆盖', async () => {
    const llm: PageContentFactAuditLLMCall = vi.fn(async () => ({
      review: {
        goalCoverage: [{ goalId: 'goal-1', status: 'pass', pageIds: ['page-answer'], evidence: '回答页完成目标。' }],
        explanation: '没有发现阻断问题。',
      },
    }))

    const result = await factAuditPageContentCourse(reviewCourse(), { llm })

    expect(result.record.fatalCount).toBe(0)
    expect(result.record.auditedSceneCount).toBe(2)
  })

  it('兼容外部模型使用单 pageId 和 message/reason/recommendation 字段', async () => {
    const llm: PageContentFactAuditLLMCall = vi.fn(async () => ({
      issues: [{
        pageId: 'page-answer', severity: 'fatal', category: 'fact',
        message: '错误地声称总质量变化。', reason: '密闭体系总质量守恒。', recommendation: '改正质量守恒表述。',
      }],
      goalCoverage: [{ id: 'goal-1', status: 'pass', pageId: 'page-answer', reason: '回答页完成目标。' }],
    }))

    const result = await factAuditPageContentCourse(reviewCourse(), { llm })

    expect(result.record.fatalCount).toBe(1)
    expect(result.record.issues[0]).toMatchObject({ targetId: 'page-answer', severity: 'blocking' })
  })
})

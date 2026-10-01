import { describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../../domain.js'
import type { GeneratedLessonPage } from '../page-content-contract.js'
import { auditGeneratedPageFacts, type PageFactAuditLLMParams } from '../page-content-page-audit.js'
import type { CoursePlanningState, LessonPagePlan } from '../page-contract.js'

const planPage: LessonPagePlan = {
  id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: [], purpose: 'explain', audience: 'student',
  learningAction: '说明概念。', newInformation: '给出概念边界。', sourceRefs: ['source:1:course'],
  contentSpec: { kind: 'explanation', focus: '测试概念', requiredElements: ['定义', '边界'] },
  visualSpec: { required: false, form: 'none', reason: '不需要图像。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '讲清概念。', teachingMove: '追问边界。', pace: 'brief' }, arcStepId: 'arc-1',
}

function fixture(): { course: MainlineCourse; page: GeneratedLessonPage } {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: 'course-1', planRevisionId: 'plan-1', status: 'plan-approved',
    learningContracts: [], arc: { id: 'arc-1', courseId: 'course-1', steps: [] }, pages: [planPage],
  }
  return {
    course: {
      id: 'course-1', topic: '测试课', subject: 'physics', gradeBand: 'middle-school', boundary: '', planning,
      sourceMaterial: [{ title: '教材', excerpt: '测试概念有明确边界。' }], qualityStatus: 'draft',
    } as unknown as MainlineCourse,
    page: {
      pageId: 'page-1', order: 1, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: ['source:1:course'],
      content: { kind: 'explanation', title: '测试概念', coreStatement: '这是定义。', evidence: [{ text: '教材给出依据。', sourceRef: 'source:1:course' }], boundary: '只在条件成立时适用。' },
      teacherCompanion: { script: '请说明定义成立的条件。', notes: [], pace: 'brief' },
    },
  }
}

describe('single page fact and source audit', () => {
  it('returns stable evidence only after the model reports no blocking issue', async () => {
    const { course, page } = fixture()
    const llm = vi.fn(async (_params: PageFactAuditLLMParams) => ({ issues: [{ severity: 'warning', message: '措辞可更精确', evidence: '不影响结论', fix: '备课时精简' }] }))
    const result = await auditGeneratedPageFacts(course, page, { llm })
    expect(result.revisionId).toMatch(/^page-fact:page-1:/)
    expect(result.warnings).toEqual(['措辞可更精确：备课时精简'])
    expect(llm).toHaveBeenCalledOnce()
    const request = llm.mock.calls[0]?.[0]
    expect(request?.system).toContain('{"issues":[]}')
    expect(request?.system).toContain('禁止输出 checkStatus、summary、answer')
  })

  it('blocks factual issues with evidence and correction retained in the error', async () => {
    const { course, page } = fixture()
    await expect(auditGeneratedPageFacts(course, page, { llm: async () => ({
      issues: [{ severity: 'blocking', message: '定义错误', evidence: '与教材原文冲突', fix: '按原文改写' }],
    }) })).rejects.toThrow(/定义错误.*教材原文冲突.*按原文改写/)
  })

  it('rejects unknown source references before any model call', async () => {
    const { course, page } = fixture()
    page.sourceRefs = ['missing-source']
    const llm = vi.fn()
    await expect(auditGeneratedPageFacts(course, page, { llm })).rejects.toThrow(/不存在的来源/)
    expect(llm).not.toHaveBeenCalled()
  })
})

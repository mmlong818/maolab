import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { MainlineCourse } from '../domain.js'
import { callLLMJson } from '../../v2/llm.js'
import type { GeneratedLessonPage } from './page-content-contract.js'
import { visiblePageText } from './page-content-audit.js'
import { sourceReferenceFor } from './source-reference.js'

const PageFactIssueSchema = z.object({
  severity: z.enum(['blocking', 'warning']),
  message: z.string().trim().min(2).max(400),
  evidence: z.string().trim().min(2).max(500),
  fix: z.string().trim().min(2).max(500),
}).strict()

const PageFactAuditSchema = z.object({
  issues: z.array(PageFactIssueSchema).max(12),
}).strict()

export interface PageFactAuditLLMParams {
  system: string
  user: string
  schema: z.ZodSchema
  temperature?: number
}

export type PageFactAuditLLMCall = (params: PageFactAuditLLMParams) => Promise<unknown>

export interface PageFactAuditResult {
  revisionId: string
  warnings: string[]
}

const defaultLLM: PageFactAuditLLMCall = params => callLLMJson({
  ...params,
  temperature: params.temperature ?? 0.1,
  timeoutSec: 90,
  maxAttempts: 3,
})

export async function auditGeneratedPageFacts(
  course: MainlineCourse,
  page: GeneratedLessonPage,
  options: { llm?: PageFactAuditLLMCall } = {},
): Promise<PageFactAuditResult> {
  const planPage = course.planning?.pages.find(candidate => candidate.id === page.pageId)
  if (!planPage || course.planning?.planRevisionId !== page.planRevisionId) {
    throw new Error('auditGeneratedPageFacts: 页面不属于当前已确认计划。')
  }
  const sourceByRef = new Map(course.sourceMaterial.map((source, index) => [
    sourceReferenceFor(source, index),
    source,
  ]))
  const missingRefs = page.sourceRefs.filter(reference => !sourceByRef.has(reference))
  if (missingRefs.length > 0) {
    throw new Error(`auditGeneratedPageFacts: 页面引用了不存在的来源：${missingRefs.join('、')}`)
  }

  const raw = await (options.llm ?? defaultLLM)({
    system: [
      '你是中小学单页事实与来源核查官，只核查当前投影片，不改写。',
      '核对事实、定义、计算、术语、适用条件、题面与讲稿一致性。',
      '页面声称来自材料时，只能使用输入中的来源；没有可靠依据的可核查断言判 blocking。',
      '问题页可以提出问题，但不能泄露答案；讲稿不能与学生页面矛盾。',
      '只输出一个 JSON 对象，顶层只能有 issues 字段，禁止输出 checkStatus、summary、answer 或其他字段。',
      '没有问题时严格输出 {"issues":[]}。',
      '有问题时 issues 中每项严格包含 severity、message、evidence、fix 四个字段；severity 只能是 blocking 或 warning。',
    ].join('\n'),
    user: JSON.stringify({
      course: { topic: course.topic, subject: course.subject, gradeBand: course.gradeBand },
      plan: {
        purpose: planPage.purpose,
        learningAction: planPage.learningAction,
        newInformation: planPage.newInformation,
      },
      sources: page.sourceRefs.map(reference => {
        const source = sourceByRef.get(reference)!
        return { reference, title: source.title, excerpt: source.excerpt ?? '', citation: source.citation ?? '' }
      }),
      page: {
        pageId: page.pageId,
        studentVisibleText: visiblePageText(page.content),
        studentContent: page.content,
        teacherScript: page.teacherCompanion.script,
      },
    }),
    schema: PageFactAuditSchema,
    temperature: 0.1,
  })
  const result = PageFactAuditSchema.parse(raw)
  const blocking = result.issues.filter(issue => issue.severity === 'blocking')
  if (blocking.length > 0) {
    throw new Error(`单页事实核查未通过：${blocking.map(issue => `${issue.message}（${issue.evidence}；${issue.fix}）`).join('；')}`)
  }
  return {
    revisionId: `page-fact:${page.pageId}:${digest(result)}`,
    warnings: result.issues.map(issue => `${issue.message}：${issue.fix}`),
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

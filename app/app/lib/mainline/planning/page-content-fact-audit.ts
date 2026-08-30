import { z } from 'zod'
import type { FactAuditRecord, MainlineCourse } from '../domain.js'
import { callLLMJson } from '../../v2/llm.js'
import { hasCheckablePageMaterial, visiblePageText } from './page-content-audit.js'
import { sourceReferenceFor } from './source-reference.js'

const ReviewIssueSchema = z.object({
  pageIds: z.array(z.string().trim().min(1)).min(1).max(6),
  severity: z.enum(['blocking', 'warning']),
  category: z.enum([
    'factual-error',
    'internal-contradiction',
    'goal-coverage',
    'prompt-answer-mismatch',
    'visual-evidence',
    'audience',
  ]),
  claim: z.string().trim().min(2).max(300),
  evidence: z.string().trim().min(2).max(500),
  fix: z.string().trim().min(2).max(500),
}).strict()

const CoveredGoalSchema = z.object({
  goalId: z.string().trim().min(1),
  status: z.literal('covered'),
  pageIds: z.array(z.string().trim().min(1)).min(1).max(8),
  evidence: z.string().trim().min(2).max(400),
}).strict()

const UncoveredGoalSchema = z.object({
  goalId: z.string().trim().min(1),
  status: z.enum(['missing', 'misaligned']),
  pageIds: z.array(z.string().trim().min(1)).max(8),
  evidence: z.string().trim().min(2).max(400),
  missingElement: z.string().trim().min(2).max(240),
}).strict()

const GoalCoverageSchema = z.discriminatedUnion('status', [CoveredGoalSchema, UncoveredGoalSchema])

const StrictPageContentFactAuditOutputSchema = z.object({
  issues: z.array(ReviewIssueSchema).max(40),
  goalCoverage: z.array(GoalCoverageSchema).max(16),
}).strict()

export const PageContentFactAuditOutputSchema = z.preprocess(
  normalizeProviderAuditOutput,
  StrictPageContentFactAuditOutputSchema,
)

export type PageContentFactAuditOutput = z.infer<typeof PageContentFactAuditOutputSchema>

export interface PageContentFactAuditLLMParams {
  system: string
  user: string
  schema: z.ZodSchema
  temperature?: number
}

export type PageContentFactAuditLLMCall = (params: PageContentFactAuditLLMParams) => Promise<unknown>

export interface PageContentFactAuditResult {
  course: MainlineCourse
  record: FactAuditRecord
}

const defaultLLM: PageContentFactAuditLLMCall = params => callLLMJson({
  system: params.system,
  user: params.user,
  schema: params.schema,
  temperature: params.temperature ?? 0.1,
  timeoutSec: 120,
  maxAttempts: 3,
})

const REVIEW_SYSTEM_PROMPT = [
  '你是中小学整课事实与教学一致性核查官。你只审查，不改写课程，也不因为文字流畅而判定通过。',
  '逐页核对学生投影片和教师讲稿，并执行以下六类检查：',
  '1. 事实、定义、计算、因果、年代、地点、术语和适用条件必须符合学科共识及输入中的权威原文。题面中的数据也要验证是否构成题目声称的情境。',
  '2. 前页题设与后页答案不得矛盾；题目结论即使碰巧正确，只要推理无效、条件退化或依据不足，也要判 blocking。',
  '3. 每个学习目标必须在正文教学页中真正讲清并至少练习或核对一次。只在开场、课程结构或总结页提到，不算覆盖。',
  '课程标题承诺的知识范围必须被学习目标和正文覆盖；标题包含多个子能力、正文却只教其中一项时，按 goal-coverage 判 blocking。',
  '4. 学生被要求观察图、地图、表格、作品或实验现象时，页面必须提供可检查对象；通用装饰图不能冒充指定作品、地图或数据图。',
  '原文、完整题面和明确列出的数据记录属于可检查文字材料，不应仅因没有位图判为缺图；但任务依赖形状、位置、方向、比例、路线或画面细节时，必须有真实可见图像。',
  '输入中的 hasImage=true 表示应用已经为该页绑定实际可见图像。由于你没有收到图像像素，不得把这种页面判为“缺图”，也不得猜测图像画得是否正确；图像内容质量由后续真实页面检查负责。',
  '5. 问题页不得提前出现答案；回应页必须直接回答前页问题，并保持同一判断方向。',
  '6. 学生页面只保留学生课堂此刻要看的内容，教师讲稿只保留老师可直接说的话；内部生成流程、教材题号、备课指令和占位说明均判 blocking。',
  '判断型题目可以故意呈现待辨析的错误说法；只有页面把错误当作正确知识、回应判断错误或纠正依据错误时，才判事实错误。',
  '明确标注为“课堂自编材料”或“课堂自编情境”的迁移练习，不因没有外部出处或权威原文而判 blocking。仍须核对题面与答案一致、词句数量、术语、推理和学科结论；只有它冒充真实作品或史料、包含错误事实，或答案无法由题面推出时才阻断。',
  '核对题面词语、数字或符号的出现次数时，只统计问题页 studentContent 中承载题面的 materials 或 materialCaption；答案页、标题、作答指令和 teacherScript 对该词的复述不属于题面次数，不得合并计数。',
  '对于自己不能可靠确认的历史、法律、地理、科学史或作品细节，不得猜测为正确，应判 blocking 并要求补权威来源。',
  '专门检查“完全相同、总是、必然、唯一、不能”等绝对化断言是否有足够依据。分形内容必须区分严格数学分形的精确自相似与自然形态的近似或统计自相似；把所有自相似都定义为局部与整体完全相同，必须判 blocking。',
  'blocking 表示不能进入课堂；warning 只用于不影响正确理解的轻微措辞问题。',
  'pageIds 必须使用输入中真实存在的页面 ID。goalCoverage 必须逐条覆盖输入中的全部目标，不能遗漏。',
  '固定输出格式：{"issues":[{"pageIds":["页面ID"],"severity":"blocking","category":"factual-error","claim":"问题断言","evidence":"核查依据","fix":"修正动作"}],"goalCoverage":[{"goalId":"目标ID","status":"covered","pageIds":["页面ID"],"evidence":"教学和练习覆盖证据"}]}。没有问题时 issues 仍必须输出空数组。',
  '目标若判 missing 或 misaligned，必须额外输出 missingElement，明确指出缺少哪项讲解、练习或核对；evidence 不得同时声称该目标已经被讲解、练习和核对。',
  '只输出 schema 要求的 JSON，不要 markdown 或额外说明。',
].join('\n')

export async function factAuditPageContentCourse(
  course: MainlineCourse,
  options: { llm?: PageContentFactAuditLLMCall } = {},
): Promise<PageContentFactAuditResult> {
  const planning = course.planning
  const pageContent = course.pageContent
  if (!planning || !pageContent) throw new Error('factAuditPageContentCourse: 课程缺少页面规划或投影片正文。')
  if (planning.status !== 'review' && planning.status !== 'ready') {
    throw new Error(`factAuditPageContentCourse: 只有备课检查或课堂版本可以核查，当前状态为 ${planning.status}。`)
  }

  const pageIds = pageContent.pages.map(page => page.pageId)
  const pageIdSet = new Set(pageIds)
  const requiredPageIds = [...pageIds]
  const llm = options.llm ?? defaultLLM

  let output: PageContentFactAuditOutput
  try {
    const raw = await llm({
      system: REVIEW_SYSTEM_PROMPT,
      user: reviewPayload(course),
      schema: PageContentFactAuditOutputSchema,
      temperature: 0.1,
    })
    output = PageContentFactAuditOutputSchema.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const record: FactAuditRecord = {
      contentRevisionId: pageContent.contentRevisionId,
      auditedSceneCount: 0,
      auditedSceneIds: [],
      requiredSceneIds: requiredPageIds,
      unverifiedSceneIds: requiredPageIds,
      fatalCount: 0,
      issues: requiredPageIds.map((pageId, index) => ({
        id: `page-fact:${pageId}:unverified-${index + 1}`,
        severity: 'info',
        targetId: pageId,
        message: '整课事实核查未完成，当前投影片未经验证。',
        impact: '错误知识、前后矛盾或目标漏教可能进入正式课堂。',
        fix: `重新运行整课核查。核查服务错误：${message.slice(0, 240)}`,
      })),
    }
    return { course: { ...course, factAudit: record, qualityStatus: 'blocked' }, record }
  }

  const issues: FactAuditRecord['issues'] = []
  for (const [index, item] of output.issues.entries()) {
    const validPageIds = [...new Set(item.pageIds.filter(pageId => pageIdSet.has(pageId)))]
    if (validPageIds.length === 0) {
      issues.push({
        id: `page-fact:${course.id}:invalid-target-${index + 1}`,
        severity: 'blocking',
        targetId: course.id,
        message: `整课核查返回了不存在的页面：${item.pageIds.join('、')}`,
        impact: '核查问题无法定位，不能确认课程已经安全。',
        fix: '重新运行整课核查并只使用输入中的页面 ID。',
      })
      continue
    }
    if (
      item.category === 'visual-evidence'
      && validPageIds.every(pageId => hasVisiblePageImage(course, pageId))
    ) {
      continue
    }
    issues.push({
      id: `page-fact:${validPageIds[0]}:${item.category}-${index + 1}`,
      severity: item.severity,
      targetId: validPageIds[0]!,
      ...(validPageIds.length > 1 ? { relatedTargetIds: validPageIds.slice(1) } : {}),
      message: `${categoryLabel(item.category)}：${item.claim}`,
      impact: item.evidence,
      fix: item.fix,
    })
  }

  const coverageByGoal = new Map(output.goalCoverage.map(item => [item.goalId, item]))
  for (const goal of course.goals) {
    const coverage = coverageByGoal.get(goal.id)
    if (coverage?.status === 'covered' && coverage.pageIds.some(pageId => pageIdSet.has(pageId))) continue
    const validPageIds = coverage?.pageIds.filter(pageId => pageIdSet.has(pageId)) ?? []
    issues.push({
      id: `page-fact:${goal.id}:goal-coverage`,
      severity: 'blocking',
      targetId: validPageIds[0] ?? course.id,
      ...(validPageIds.length > 1 ? { relatedTargetIds: validPageIds.slice(1) } : {}),
      message: `学习目标未被完整教学：${goal.statement}`,
      impact: coverage?.evidence ?? '核查结果没有覆盖这一学习目标。',
      fix: '在正文教学页讲清该目标，并安排独立练习或核对；不能只在开场、结构页或总结页提及。',
    })
  }

  const fatalCount = issues.filter(issue => issue.severity === 'blocking').length
  const record: FactAuditRecord = {
    contentRevisionId: pageContent.contentRevisionId,
    auditedAt: new Date().toISOString(),
    auditedSceneCount: pageIds.length,
    auditedSceneIds: pageIds,
    requiredSceneIds: requiredPageIds,
    unverifiedSceneIds: [],
    pendingSceneIds: [],
    fatalCount,
    issues,
  }
  return {
    course: {
      ...course,
      factAudit: record,
      qualityStatus: fatalCount > 0 ? 'blocked' : planning.status === 'ready' ? 'passed' : 'draft',
    },
    record,
  }
}

function hasVisiblePageImage(course: MainlineCourse, pageId: string): boolean {
  const page = course.pageContent?.pages.find(candidate => candidate.pageId === pageId)
  if (page?.imageUrl?.trim()) return true
  const planPage = course.planning?.pages.find(candidate => candidate.id === pageId)
  return planPage?.sourceRefs.some(reference => {
    const source = course.sourceMaterial.find((candidate, index) => sourceReferenceFor(candidate, index) === reference)
    return source?.candidateResources?.some(resource => resource.assetUrl.trim()) ?? false
  }) ?? false
}

function reviewPayload(course: MainlineCourse): string {
  const planning = course.planning!
  const pageContent = course.pageContent!
  const planById = new Map(planning.pages.map(page => [page.id, page]))
  return JSON.stringify({
    course: {
      topic: course.topic,
      subject: course.subject,
      gradeBand: course.gradeBand,
      boundary: course.boundary,
      goals: course.goals.map(goal => ({
        id: goal.id,
        statement: goal.statement,
        successSignal: goal.successSignal,
      })),
    },
    sources: course.sourceMaterial.map((source, index) => ({
      sourceRef: sourceReferenceFor(source, index),
      title: source.title,
      excerpt: source.excerpt ?? '',
      citation: source.citation ?? '',
      evidenceStatus: source.provenance?.evidenceStatus ?? 'unknown',
    })),
    pages: pageContent.pages.map(page => ({
      pageId: page.pageId,
      order: page.order,
      purpose: page.purpose,
      pairId: page.pairId ?? '',
      pairRole: page.pairRole ?? '',
      learningAction: planById.get(page.pageId)?.learningAction ?? '',
      newInformation: planById.get(page.pageId)?.newInformation ?? '',
      visualRequired: planById.get(page.pageId)?.visualSpec.required ?? false,
      visualForm: planById.get(page.pageId)?.visualSpec.form ?? 'none',
      hasImage: hasVisiblePageImage(course, page.pageId),
      hasCheckableMaterial: hasCheckablePageMaterial(page.content),
      studentVisibleText: visiblePageText(page.content),
      studentContent: page.content,
      teacherScript: page.teacherCompanion.script,
    })),
  })
}

function categoryLabel(category: z.infer<typeof ReviewIssueSchema>['category']): string {
  const labels: Record<z.infer<typeof ReviewIssueSchema>['category'], string> = {
    'factual-error': '事实错误',
    'internal-contradiction': '整课前后矛盾',
    'goal-coverage': '学习目标漏教',
    'prompt-answer-mismatch': '题目与回答不匹配',
    'visual-evidence': '缺少可检查的图像或材料',
    audience: '学生与教师内容边界错误',
  }
  return labels[category]
}

function normalizeProviderAuditOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const root = value as Record<string, unknown>
  const nested = ['review', 'audit', 'result']
    .map(key => root[key])
    .find(candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate))
  const source = (nested ?? root) as Record<string, unknown>
  const rawIssues = Array.isArray(source.issues) ? source.issues : []
  const rawCoverage = Array.isArray(source.goalCoverage) ? source.goalCoverage : []
  return {
    issues: rawIssues.map(item => normalizeReviewIssue(item)),
    goalCoverage: rawCoverage.map(item => normalizeGoalCoverage(item)),
  }
}

function normalizeReviewIssue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const item = value as Record<string, unknown>
  const pageIds = Array.isArray(item.pageIds)
    ? item.pageIds
    : Array.isArray(item.pages)
      ? item.pages
      : typeof item.pageId === 'string'
        ? [item.pageId]
        : typeof item.targetId === 'string'
          ? [item.targetId]
          : item.page
            ? [item.page]
            : undefined
  const severityAliases: Record<string, 'blocking' | 'warning'> = {
    fatal: 'blocking',
    error: 'blocking',
    high: 'blocking',
    major: 'blocking',
    warn: 'warning',
    low: 'warning',
    minor: 'warning',
  }
  const rawSeverity = typeof item.severity === 'string' ? item.severity.toLowerCase() : ''
  const categoryAliases: Record<string, z.infer<typeof ReviewIssueSchema>['category']> = {
    fact: 'factual-error',
    factual: 'factual-error',
    contradiction: 'internal-contradiction',
    consistency: 'internal-contradiction',
    coverage: 'goal-coverage',
    goal: 'goal-coverage',
    mismatch: 'prompt-answer-mismatch',
    answer: 'prompt-answer-mismatch',
    visual: 'visual-evidence',
    image: 'visual-evidence',
    role: 'audience',
  }
  const rawCategory = typeof item.category === 'string' ? item.category.toLowerCase() : ''
  return {
    pageIds,
    severity: severityAliases[rawSeverity] ?? item.severity,
    category: categoryAliases[rawCategory] ?? item.category,
    claim: item.claim ?? item.message ?? item.problem,
    evidence: item.evidence ?? item.reason ?? item.impact,
    fix: item.fix ?? item.correction ?? item.recommendation,
  }
}

function normalizeGoalCoverage(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const item = value as Record<string, unknown>
  const aliases: Record<string, 'covered' | 'missing' | 'misaligned'> = {
    pass: 'covered',
    passed: 'covered',
    complete: 'covered',
    completed: 'covered',
    fail: 'missing',
    failed: 'missing',
    uncovered: 'missing',
    partial: 'misaligned',
    partially_covered: 'misaligned',
  }
  const status = typeof item.status === 'string'
    ? aliases[item.status.toLowerCase()] ?? item.status
    : item.status
  return {
    goalId: item.goalId ?? item.id,
    status,
    pageIds: item.pageIds ?? (item.pageId ? [item.pageId] : []),
    evidence: item.evidence ?? item.reason,
    ...(status === 'missing' || status === 'misaligned'
      ? { missingElement: item.missingElement ?? item.missing ?? item.fix }
      : {}),
  }
}

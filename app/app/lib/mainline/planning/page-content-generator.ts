import type { z } from 'zod'
import { ZodError } from 'zod'
import type { MainlineCourse } from '../domain.js'
import { callLLMJson } from '../../v2/llm.js'
import { assertValidCoursePlanningState } from './page-audit.js'
import type { LessonPagePlan, PageContentSpec } from './page-contract.js'
import {
  PAGE_CONTENT_SCHEMA_VERSION,
  type CoursePageContentState,
  type GeneratedLessonPage,
  type TeacherCompanionContent,
  type VisiblePageContent,
} from './page-content-contract.js'
import {
  PAGE_CONTENT_SCHEMAS,
  TeacherOnlyFillOutputSchema,
  pageFillOutputSchema,
} from './page-content-schema.js'
import {
  auditCoursePageContentState,
  auditGeneratedLessonPage,
  blockingPageContentIssues,
  promptMaterialsStateVerdict,
  visiblePageText,
  type PageContentIssue,
} from './page-content-audit.js'
import { sourceMaterialByReference, sourceReferenceFor } from './source-reference.js'

export interface PageContentLLMParams {
  system: string
  user: string
  schema: z.ZodSchema
  temperature?: number
}

export type PageContentLLMCall = (params: PageContentLLMParams) => Promise<unknown>

export interface FillPlannedPagesOptions {
  llm?: PageContentLLMCall
  maxPageAttempts?: number
  contentRevisionId?: string
  qualityFeedback?: readonly string[]
}

export interface FillPlannedPagesResult {
  course: MainlineCourse
  pageContent: CoursePageContentState
  audit: PageContentIssue[]
}

export interface RegeneratePlannedPageOptions extends FillPlannedPagesOptions {}

export class PageContentGenerationQualityError extends Error {
  readonly code = 'PAGE_CONTENT_QUALITY_RETRY_EXHAUSTED'

  constructor(
    readonly pageId: string,
    readonly pageOrder: number,
    readonly attempts: number,
    readonly reasons: readonly string[],
  ) {
    super(`页面 ${pageOrder}(${pageId}) 连续 ${attempts} 次未通过正文检查：${reasons.join('；')}`)
    this.name = 'PageContentGenerationQualityError'
  }
}

const defaultLLM: PageContentLLMCall = params => callLLMJson({
  system: params.system,
  user: params.user,
  schema: params.schema,
  temperature: params.temperature ?? 0.35,
  timeoutSec: 90,
  maxAttempts: 3,
})

export async function fillPlannedPages(
  course: MainlineCourse,
  options: FillPlannedPagesOptions = {},
): Promise<FillPlannedPagesResult> {
  const planning = course.planning
  if (!planning) throw new Error('fillPlannedPages: 课程缺少页面计划。')
  assertValidCoursePlanningState(planning)
  if (planning.status !== 'plan-approved') {
    throw new Error(`fillPlannedPages: 页面计划状态必须是 plan-approved，实际为 ${planning.status}。`)
  }
  assertGroundedSourceTextPages(course, planning.pages)

  const llm = options.llm ?? defaultLLM
  const maxPageAttempts = options.maxPageAttempts ?? 3
  const generatedPages: GeneratedLessonPage[] = []
  for (const planPage of planning.pages) {
    generatedPages.push(await fillOnePlannedPage({
      course,
      planPage,
      planRevisionId: planning.planRevisionId,
      priorPages: generatedPages,
      llm,
      maxPageAttempts,
    }))
  }

  const pageContent: CoursePageContentState = {
    schemaVersion: PAGE_CONTENT_SCHEMA_VERSION,
    courseId: course.id,
    planRevisionId: planning.planRevisionId,
    contentRevisionId: options.contentRevisionId ?? `${planning.planRevisionId}:content:1`,
    status: 'review',
    pages: generatedPages,
  }
  const blocking = blockingPageContentIssues(planning, pageContent, course.sourceMaterial)
  if (blocking.length > 0) {
    throw new Error(`fillPlannedPages: 完整页面正文未通过：${blocking.map(issue => issue.message).join('；')}`)
  }

  const nextCourse: MainlineCourse = {
    ...course,
    planning: { ...planning, status: 'review' },
    pageContent,
  }
  return {
    course: nextCourse,
    pageContent,
    audit: auditCoursePageContentState(planning, pageContent, course.sourceMaterial),
  }
}

export async function regeneratePlannedPage(
  course: MainlineCourse,
  pageId: string,
  options: RegeneratePlannedPageOptions = {},
): Promise<FillPlannedPagesResult> {
  const planning = course.planning
  const currentContent = course.pageContent
  if (!planning || !currentContent) throw new Error('regeneratePlannedPage: 课程缺少页面计划或已生成正文。')
  assertValidCoursePlanningState(planning)
  if (planning.status !== 'review' || currentContent.status !== 'review') {
    throw new Error('regeneratePlannedPage: 只有备课检查中的课程可以重生成单页。')
  }
  const pageIndex = planning.pages.findIndex(page => page.id === pageId)
  if (pageIndex < 0) throw new Error(`regeneratePlannedPage: 页面计划中不存在 ${pageId}。`)
  if (currentContent.pages.length !== planning.pages.length) {
    throw new Error('regeneratePlannedPage: 当前正文页数与计划不一致，不能局部替换。')
  }

  const generatedPage = await fillOnePlannedPage({
    course,
    planPage: planning.pages[pageIndex]!,
    planRevisionId: planning.planRevisionId,
    priorPages: currentContent.pages.slice(0, pageIndex),
    llm: options.llm ?? defaultLLM,
    maxPageAttempts: options.maxPageAttempts ?? 3,
    qualityFeedback: options.qualityFeedback ?? factFeedbackForPage(course, pageId),
  })
  const pageContent: CoursePageContentState = {
    ...currentContent,
    contentRevisionId: options.contentRevisionId ?? nextContentRevisionId(planning.planRevisionId, currentContent.contentRevisionId),
    pages: currentContent.pages.map((page, index) => index === pageIndex ? generatedPage : page),
  }
  const audit = auditCoursePageContentState(planning, pageContent, course.sourceMaterial)
  const blocking = audit.filter(issue => (
    issue.severity === 'blocking' && (!issue.pageId || issue.pageId === pageId)
  ))
  if (blocking.length > 0) {
    throw new Error(`regeneratePlannedPage: 当前页面更新后仍未通过：${blocking.map(issue => issue.message).join('；')}`)
  }
  const nextCourse: MainlineCourse = { ...course, pageContent, qualityStatus: 'draft' }
  delete nextCourse.factAudit
  return {
    course: nextCourse,
    pageContent,
    audit,
  }
}

interface FillOnePlannedPageInput {
  course: MainlineCourse
  planPage: LessonPagePlan
  planRevisionId: string
  priorPages: readonly GeneratedLessonPage[]
  llm: PageContentLLMCall
  maxPageAttempts: number
  qualityFeedback?: readonly string[]
}

export async function fillOnePlannedPage(input: FillOnePlannedPageInput): Promise<GeneratedLessonPage> {
  const fixedContent = fixedStudentContent(input.course, input.planPage)
  const schema = fixedContent
    ? TeacherOnlyFillOutputSchema
    : pageFillOutputSchema(input.planPage.contentSpec.kind)
  let lastReasons: string[] = [...(input.qualityFeedback ?? [])]

  for (let attempt = 1; attempt <= input.maxPageAttempts; attempt += 1) {
    let raw: unknown
    try {
      raw = await input.llm({
        system: pageContentSystemPrompt(input.course, input.planPage, Boolean(fixedContent)),
        user: pageContentUserPrompt(input.course, input.planPage, input.priorPages, fixedContent, lastReasons),
        schema,
        temperature: 0.35,
      })
    } catch (error) {
      lastReasons = [error instanceof Error ? error.message : String(error)]
      continue
    }
    let parsed: { content?: VisiblePageContent; teacherCompanion: TeacherCompanionContent }
    try {
      parsed = schema.parse(raw) as { content?: VisiblePageContent; teacherCompanion: TeacherCompanionContent }
    } catch (error) {
      if (!(error instanceof ZodError)) throw error
      lastReasons = error.issues.map(issue => `${issue.path.join('.') || 'output'}:${issue.message}`)
      continue
    }

    const content = fixedContent ?? sanitizeGeneratedContent(parsed.content, input.planPage.sourceRefs)
    if (!content) {
      lastReasons = ['模型没有返回学生可见正文。']
      continue
    }
    const generatedPage = attachPlanMetadata(input.planPage, input.planRevisionId, content, parsed.teacherCompanion)
    const issues = auditGeneratedLessonPage({
      planRevisionId: input.planRevisionId,
      planPage: input.planPage,
      generatedPage,
      sourceMaterial: input.course.sourceMaterial,
      priorPages: input.priorPages,
    }).filter(issue => issue.severity === 'blocking')
    if (issues.length === 0) return generatedPage
    lastReasons = issues.map(issue => issue.message)
  }

  throw new PageContentGenerationQualityError(
    input.planPage.id,
    input.planPage.order,
    input.maxPageAttempts,
    lastReasons,
  )
}

function factFeedbackForPage(course: MainlineCourse, pageId: string): string[] {
  return (course.factAudit?.issues ?? [])
    .filter(issue => issue.targetId === pageId || issue.relatedTargetIds?.includes(pageId))
    .map(issue => `${issue.message}；依据：${issue.impact}；必须这样修正：${issue.fix}`)
}

function sanitizeGeneratedContent(
  content: VisiblePageContent | undefined,
  allowedSourceRefs: readonly string[],
): VisiblePageContent | undefined {
  if (!content) return content
  const sanitized = stripVisibleReferenceTokens(content, allowedSourceRefs)
  if (!('evidence' in sanitized)) return sanitized
  const allowed = new Set(allowedSourceRefs)
  return {
    ...sanitized,
    evidence: sanitized.evidence.map(item => (
      item.sourceRef && !allowed.has(item.sourceRef)
        ? { text: item.text }
        : item
    )),
  }
}

function stripVisibleReferenceTokens(
  content: VisiblePageContent,
  sourceRefs: readonly string[],
): VisiblePageContent {
  const visit = (value: unknown, key?: string): unknown => {
    if (typeof value === 'string') {
      if (key === 'sourceRef') return value
      return sourceRefs.reduce((text, sourceRef) => text.replaceAll(sourceRef, ''), value)
        .replace(/\bsource(?:Ref)?\s*[:：]\s*\d+\s*[:：]\s*[\w-]+/gi, '')
        .trim()
    }
    if (Array.isArray(value)) return value.map(item => visit(item))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, visit(entryValue, entryKey)]))
  }
  return visit(content) as VisiblePageContent
}

function attachPlanMetadata(
  planPage: LessonPagePlan,
  planRevisionId: string,
  content: VisiblePageContent,
  companion: TeacherCompanionContent,
): GeneratedLessonPage {
  return {
    pageId: planPage.id,
    order: planPage.order,
    purpose: planPage.purpose,
    planRevisionId,
    sourceRefs: [...planPage.sourceRefs],
    content,
    teacherCompanion: { ...companion, pace: planPage.teacherCompanion.pace },
    ...(planPage.pairId ? { pairId: planPage.pairId } : {}),
    ...(planPage.pairRole ? { pairRole: planPage.pairRole } : {}),
    ...(planPage.layoutGroupId ? { layoutGroupId: planPage.layoutGroupId } : {}),
  }
}

function fixedStudentContent(course: MainlineCourse, page: LessonPagePlan): VisiblePageContent | undefined {
  switch (page.contentSpec.kind) {
    case 'course-orientation': {
      const goals = page.contentSpec.goalStatements?.length
        ? page.contentSpec.goalStatements
        : page.contentSpec.goalIds.map(goalId => {
            const goal = course.goals.find(candidate => candidate.id === goalId)
            if (!goal) throw new Error(`fixedStudentContent: 找不到学习目标 ${goalId}。`)
            return goal.statement
          })
      return PAGE_CONTENT_SCHEMAS['course-orientation'].parse({
        kind: 'course-orientation',
        title: '本课学习问题',
        learningQuestion: `怎样理解${page.contentSpec.topic}？`,
        goals: goals.map(studentFacingPlanText),
      })
    }
    case 'observation': {
      if (page.visualSpec.form !== 'source-text' || page.visualSpec.sourceAssetPolicy !== 'grounded-only') return undefined
      const material = page.sourceRefs
        .map(reference => sourceMaterialByReference(course.sourceMaterial, reference)?.excerpt?.trim())
        .filter((excerpt): excerpt is string => Boolean(excerpt))
        .join('\n\n')
      if (!material) return undefined
      return PAGE_CONTENT_SCHEMAS.observation.parse({
        kind: 'observation',
        title: '观察原文证据',
        prompt: `请阅读材料，圈画能帮助你回答“${page.contentSpec.focus}”的具体词句。`,
        materialCaption: material,
        evidenceLabels: ['关键词句', '形式或内容的线索', '可直接引用的原文依据'],
      })
    }
    case 'course-structure':
      return PAGE_CONTENT_SCHEMAS['course-structure'].parse({
        kind: 'course-structure',
        title: '本课学习路径',
        items: page.contentSpec.items.map(item => studentFacingPlanText(item.title)),
      })
    case 'source-material': {
      const source = sourceMaterialByReference(course.sourceMaterial, page.contentSpec.sourceRef)
      if (!source?.excerpt?.trim()) {
        throw new Error(`fixedStudentContent: 页面 ${page.id} 的完整来源正文不存在。`)
      }
      return PAGE_CONTENT_SCHEMAS['source-material'].parse({
        kind: 'source-material',
        title: source.title,
        body: source.excerpt.trim(),
        ...(source.citation?.trim() ? { citation: source.citation.trim() } : {}),
      })
    }
    default:
      return undefined
  }
}

function studentFacingPlanText(value: string): string {
  return value
    .replace(/[，,；;：:]?\s*(?:完成|对应|参照|使用|结合)?\s*(?:教材)?(?:练习题|习题|例题|活动|任务)\s*[①②③④⑤⑥⑦⑧⑨⑩\d一二三四五六七八九十-]*\s*[（(][^）)]*[）)]/g, '')
    .replace(/[，,；;：:]?\s*(?:完成|对应|参照|使用|结合)?\s*(?:教材)?(?:练习题|习题|例题|活动|任务)\s*[①②③④⑤⑥⑦⑧⑨⑩\d一二三四五六七八九十-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[，,；;：:]\s*$/g, '')
    .trim()
}

function pageContentSystemPrompt(course: MainlineCourse, page: LessonPagePlan, fixedContent: boolean): string {
  return [
    `你是中小学课堂投影片的逐页正文作者，当前课程是“${course.topic}”。`,
    `本课唯一知识领域是“${course.sourceMaterial.map(source => source.title).filter(Boolean).join('、') || course.topic}”。不得因为任务里出现“条件、平衡、结构、变化”等通用词，就替换成其他学科概念或相邻知识点。`,
    '本次只处理页面计划中已经存在的一张真实投影片。页数、页号、顺序、页面目的、配对关系和版式组都已确认，不得输出或改写这些结构。',
    fixedContent
      ? '学生可见正文已经由程序从课程计划或权威来源锁定。你只生成 teacherCompanion，不得复述或改写学生正文。'
      : `content 必须严格使用 ${page.contentSpec.kind} 类型，只能含该类型定义的字段。`,
    `唯一允许的输出结构：${outputShapeDescription(page.contentSpec.kind, fixedContent)}`,
    `本页学生动作：${page.learningAction}`,
    `本页新增信息：${page.newInformation}`,
    `本页内容要求：${contentContractDescription(page.contentSpec)}`,
    `本页版式容量：${pageLayoutBudget(page.contentSpec.kind)}`,
    page.visualSpec.required
      ? `本页已规划可见材料，形式为 ${page.visualSpec.form}；正文只能引用实际会在本页呈现的材料。`
      : '本页没有规划外部图像或表格。不得写“如图、图中、下图、整体图、局部放大图、表中、地图中”等不存在的视觉对象；需要的数据或文字材料必须完整写入正文。',
    page.contentSpec.kind === 'observation'
      && page.visualSpec.form === 'source-text'
      && page.visualSpec.sourceAssetPolicy === 'grounded-or-generate'
      && page.sourceRefs.length === 0
      ? '当前没有可逐字引用的教材原文。materialCaption 必须使用自足的短语料，并以“课堂自编材料：”开头；不得声称来自教材、课文或真实作品。'
      : '',
    'content 是直接投给学生看的文字，只保留学生此刻需要看的材料、问题、结论或步骤。不得出现生成理由、内部字段、教师提示、幕后流程、占位符、“已完成前两步”、“保留原始答案”或“下一页再检验”等流程旁白。',
    `所有学生文字和教师讲稿都必须符合${course.gradeBand}学生的真实课堂语言，表达自然、完整、准确，禁止为了凑概念生造词语或使用幼儿化句式。`,
    'sourceRef 只能写入 evidence.sourceRef 元数据字段，绝不能出现在标题、题目、材料、标签、作答要求或其他学生可见文字中。',
    'teacherCompanion.script 是老师上课时可以直接对学生说的话，不得写“请学生、引导学生、让学生、本页目标”等备课指令；teacherCompanion.notes 才能写最多三条简短授课提醒。',
    '教师讲稿中的事实也必须由输入中的课程信息或来源原文直接支持，不得自行添加字数、年代、作者背景、统计数量或未经提供的解释。',
    '正文内部引用词语时使用中文引号“”或不加引号；字符串值内部禁止使用英文双引号字符，以免破坏 JSON 字段结构。',
    '凡正文或讲稿出现“共N个、N项、N条、N种、N类”等数量判断，必须逐项复数并确保数字与实际列项完全一致。',
    '提问、练习和迁移页只给题目、必要材料和作答要求，绝不出现答案、结论、解析、正确选项或暗示性视觉描述。题干自身也不得用“误将、误认为、忽视、其实、而非、而是”等评价性措辞暗示正误。即使定义句或结论句来自允许来源，只要它与本页问题措辞同义、会直接替学生完成判断，也不能放进题面材料；应只保留原始语料、数据或情境。回应页必须给出可检查的结论与依据。',
    '回应判断题时，结论第一句必须明确写出原说法“成立”或“不成立”，后续解释、证据和修正必须保持同一判断方向；不得先写“说法成立”，随后又用“误将、误作、错误、无实义”等措辞推翻原说法。',
    '程序或方法类课程必须保证全课步骤前后一致。读取信息的书写顺序与根据坐标定位时寻找两条线的操作顺序不是一回事；若课程来源没有规定唯一操作顺序，不得自行制造“必须先做某一步”的规则。',
    '使用“完全相同、总是、必然、唯一、不能”等绝对表述时必须有明确事实依据。讲分形自相似时，严格数学分形可以是精确自相似，自然形态通常只能说近似或统计自相似，不得把两者一概写成局部与整体完全相同。',
    course.subject === 'chinese'
      ? '语文迁移页若使用课堂自编材料，必须是明确的现代白话短句，不得引用、改写、拼接或仿写古今作品；不得把真实作品标成“课堂自编”。'
      : '迁移页若使用课堂自编材料，必须明确标注为虚构情境，不得把真实材料或事实来源标成“课堂自编”。',
    '引用来源时只能使用输入里的 sourceRef；不得虚构出处。页面有来源约束且正文含结论时，至少一条 evidence 必须填写 sourceRef。',
    '不要复述前面页面已经承担的完整教学动作；本页必须产生计划声明的新信息。',
    '只输出 schema 要求的合法 JSON 对象，不要 markdown，不要额外说明。',
  ].join('\n')
}

function pageContentUserPrompt(
  course: MainlineCourse,
  page: LessonPagePlan,
  priorPages: readonly GeneratedLessonPage[],
  fixedContent: VisiblePageContent | undefined,
  qualityFeedback: readonly string[],
): string {
  const promptGoal = promptGoalFor(page.contentSpec)
  const promptSafeText = (value: string) => promptGoal
    ? redactDirectVerdictSegments(promptGoal, value)
    : value
  const allowedSources = course.sourceMaterial.flatMap((source, index) => {
    const sourceRef = sourceReferenceFor(source, index)
    if (!page.sourceRefs.includes(sourceRef)) return []
    return [{
      sourceRef,
      title: source.title,
      excerpt: promptSafeText(source.excerpt ?? ''),
      citation: source.citation ?? '',
      evidenceStatus: source.provenance?.evidenceStatus ?? 'unknown',
    }]
  })
  return JSON.stringify({
    course: {
      topic: course.topic,
      subject: course.subject,
      gradeBand: course.gradeBand,
    },
    page: {
      contentSpec: page.contentSpec,
      learningAction: page.learningAction,
      newInformation: page.newInformation,
      evidenceExpected: page.evidenceExpected ?? '',
      visualSpec: page.visualSpec,
      teacherCompanionGoal: page.teacherCompanion,
    },
    allowedSources,
    priorStudentPages: priorPages.slice(-6).map(prior => ({
      pageId: prior.pageId,
      purpose: prior.purpose,
      visibleText: promptSafeText(visiblePageText(prior.content)).slice(0, 900),
    })),
    ...(qualityFeedback.length > 0 ? { qualityFeedback: [...qualityFeedback] } : {}),
    ...(fixedContent ? { fixedStudentContent: fixedContent } : {}),
  })
}

function promptGoalFor(spec: PageContentSpec): string | undefined {
  switch (spec.kind) {
    case 'question':
      return spec.promptGoal
    case 'practice':
    case 'transfer':
      return spec.taskGoal
    default:
      return undefined
  }
}

function pageLayoutBudget(kind: VisiblePageContent['kind']): string {
  switch (kind) {
    case 'explanation':
      return 'coreStatement 不超过 80 字；evidence 最多 3 条、每条不超过 55 字且合计不超过 140 字；boundary 不超过 55 字。详细说明放入教师讲稿。'
    case 'question':
    case 'practice':
    case 'transfer':
      return 'prompt 不超过 90 字；materials 最多 3 条且合计不超过 140 字；responseInstruction 不超过 40 字。'
    case 'answer':
      return 'conclusion 不超过 60 字；evidence 最多 2 条、每条不超过 45 字；correction 不超过 50 字。'
    case 'feedback':
      return 'successCriteria 最多 2 条、每条不超过 18 字；conclusion 不超过 70 字；evidence 最多 3 条、每条不超过 40 字；revisionAction 不超过 35 字。'
    case 'recap':
      return 'concepts、evidence、methods 每栏最多 3 条，每条不超过 35 字。'
    default:
      return '正文必须在单张 16:9 投影片内完整展示，不得依赖滚动、裁切或缩小字号。'
  }
}

function redactDirectVerdictSegments(prompt: string, value: string): string {
  const segments = value.match(/[^。！？；\n]+[。！？；\n]*/g) ?? [value]
  return segments
    .filter(segment => !promptMaterialsStateVerdict(prompt, [segment]))
    .join('')
    .replace(/；\s*；/g, '；')
    .trim()
}

function nextContentRevisionId(planRevisionId: string, currentRevisionId: string): string {
  const escapedPlanId = planRevisionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = currentRevisionId.match(new RegExp(`^${escapedPlanId}:content:(\\d+)$`))
  const nextRevision = match ? Number(match[1]) + 1 : 2
  return `${planRevisionId}:content:${nextRevision}`
}

function contentContractDescription(spec: PageContentSpec): string {
  switch (spec.kind) {
    case 'course-orientation':
      return '题目和所有学习目标由程序锁定。'
    case 'course-structure':
      return '学习路径名称与顺序由程序锁定。'
    case 'source-material':
      return `完整保留来源 ${spec.sourceRef} 的正文和出处。`
    case 'observation':
      return `围绕“${spec.focus}”提出一个可观察问题，并列出学生需要辨认的证据类别：${spec.requiredEvidence}。evidenceLabels 只能写中性的观察类别，不得写具体答案或已经找到的证据。若本页绑定原文来源，materialCaption 必须直接摘录完成观察所需的原文，不能只让学生回看前页。`
    case 'explanation':
      return `解释“${spec.focus}”，正文必须含：${spec.requiredElements.join('、')}。`
    case 'question':
      return `${spec.promptGoal}；答案只能出现在后续独立页面。可用材料：${spec.materialRefs.join('、') || '题面自足'}。材料只提供判断所需的原始语料或数据，不得摘入与问题同义的定义、正误或结论。responseInstruction 只写当前页的作答格式，不得复述题目或预告下一页。`
    case 'answer':
      return `回应前一问题，必须含：${spec.requiredElements.join('、')}。`
    case 'worked-step':
      return `围绕“${spec.focus}”给出可复查步骤，每步都含：${spec.requiredElements.join('、')}。`
    case 'practice':
      return `${spec.taskGoal}；题面自足，答案只能出现在后续独立反馈页。responseInstruction 只写当前页的作答格式，不得复述题目或预告下一页。`
    case 'feedback':
      return `回应前一任务，必须含：${spec.requiredElements.join('、')}。`
    case 'recap':
      return `完整列出所有学习目标对应的概念、证据和方法，目标为：${spec.goalIds.join('、')}。`
    case 'transfer':
      return `${spec.taskGoal}；必须提供与目标概念严格匹配、没有术语歧义的新材料，不能用相近但不同的现象替代目标概念，答案只能出现在后续独立反馈页。只能使用明确标注“课堂自编材料”的全新材料，并遵守系统给出的学科自编规则。${transferConceptGuardrail(spec.taskGoal)}responseInstruction 只写当前页的作答格式，不得复述题目或预告下一页。`
  }
}

function transferConceptGuardrail(taskGoal: string): string {
  if (/叠词/.test(taskGoal)) {
    return '本任务只考查词本身的重叠，不得把“一片一片”“一个一个”这类数量短语的反复列为叠词；必须选用自然、常见且词义明确的叠词，禁止“熟熟”“香香”等刻意生造或幼儿化表达。'
  }
  return ''
}

function outputShapeDescription(kind: VisiblePageContent['kind'], fixedContent: boolean): string {
  const teacherCompanion = { script: '可直接对学生说的课堂语言', notes: ['最多三条教师提醒'] }
  if (fixedContent) return JSON.stringify({ teacherCompanion })
  const contentByKind: Record<VisiblePageContent['kind'], Record<string, unknown>> = {
    'course-orientation': { kind, title: '标题', learningQuestion: '学习问题', goals: ['学习目标'] },
    'course-structure': { kind, title: '标题', items: ['学习任务'] },
    'source-material': { kind, title: '标题', body: '完整原文', citation: '出处，可省略' },
    observation: { kind, title: '标题', prompt: '观察问题', materialCaption: '观察材料，可省略', evidenceLabels: ['证据标签'] },
    explanation: { kind, title: '标题', coreStatement: '核心结论', evidence: [{ text: '证据', sourceRef: '仅使用允许的来源，可省略' }], boundary: '适用边界' },
    question: { kind, title: '标题', prompt: '问题', materials: ['必要材料'], responseInstruction: '作答要求' },
    answer: { kind, title: '标题', conclusion: '结论', evidence: [{ text: '证据', sourceRef: '仅使用允许的来源，可省略' }], correction: '纠正说明' },
    'worked-step': { kind, title: '标题', steps: [{ step: '操作', reason: '依据', result: '结果' }] },
    practice: { kind, title: '标题', prompt: '练习题', materials: ['必要材料'], responseInstruction: '作答要求' },
    feedback: { kind, title: '标题', successCriteria: ['成功标准'], conclusion: '参考结论', evidence: [{ text: '证据', sourceRef: '仅使用允许的来源，可省略' }], revisionAction: '修改动作' },
    recap: { kind, title: '标题', concepts: ['概念'], evidence: [{ text: '证据', sourceRef: '仅使用允许的来源，可省略' }], methods: ['方法'] },
    transfer: { kind, title: '标题', prompt: '迁移题', materials: ['新的具体材料'], responseInstruction: '作答要求' },
  }
  return JSON.stringify({ content: contentByKind[kind], teacherCompanion })
}

function assertGroundedSourceTextPages(course: MainlineCourse, pages: readonly LessonPagePlan[]): void {
  for (const page of pages) {
    if (page.visualSpec.form !== 'source-text' || page.visualSpec.sourceAssetPolicy !== 'grounded-only') continue
    const hasExcerpt = page.sourceRefs.some(reference => (
      Boolean(sourceMaterialByReference(course.sourceMaterial, reference)?.excerpt?.trim())
    ))
    if (!hasExcerpt) {
      throw new Error(`fillPlannedPages: 页面 ${page.order}(${page.id}) 需要可核验原文，但当前只有目录信息。`)
    }
  }
}

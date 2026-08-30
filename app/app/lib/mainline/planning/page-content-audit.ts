import type { SourceMaterialRef } from '../domain.js'
import type { LessonPagePlan } from './page-contract.js'
import {
  PAGE_CONTENT_SCHEMA_VERSION,
  type CoursePageContentState,
  type GeneratedLessonPage,
  type VisiblePageContent,
} from './page-content-contract.js'
import {
  TeacherCompanionContentSchema,
  VisiblePageContentSchema,
} from './page-content-schema.js'
import { sourceMaterialByReference, sourceReferenceFor } from './source-reference.js'

export interface PageContentIssue {
  code: string
  severity: 'blocking' | 'warning'
  pageId?: string
  message: string
}

interface AuditGeneratedPageInput {
  planRevisionId: string
  planPage: LessonPagePlan
  generatedPage: GeneratedLessonPage
  sourceMaterial: readonly SourceMaterialRef[]
  priorPages?: readonly GeneratedLessonPage[]
}

const INTERNAL_STUDENT_TEXT = /待\s*(?:LLM|AI)\s*填充|contentSlots|sceneType|执行器|生成链路|内部字段|debug|schema|教师讲稿|教师提示|教学提示|请教师|引导学生|让学生|已完成前两步|当前只需完成下一步|先看已完成的前序步骤|展开完整示范|先留下自己的答案|保留(?:你的)?原始(?:判断|答案|作答)|(?:下一页|下一张)[^。！？\n]{0,30}(?:对照|检验|核对)|等待判断|AI\s*将在此|【待补】|\bsource(?:Ref)?\s*[:：]\s*\d+\s*[:：]\s*[\w-]+/i
const TEACHER_SCRIPT_META_TEXT = /请学生|引导学生|让学生|教师应|本页(?:目标|需要|用于)|生成流程|contentSlots|sceneType|schema/i
const ANSWER_LEAK_TEXT = /(?:参考|正确)?答案\s*[:：]|结论\s*[:：]|解析\s*[:：]|(?:正确选项|应选|判断结果)\s*[:：为是]?|(?:所以|因此)[^。！？\n]{0,30}(?:等于|成立|不成立|正确|错误)/i
const UNSUPPORTED_SOURCE_CLAIM_TEXT = /摘录|摘自|选自|出自|(?:教材|课文|史料)原文|(?:引用|记录|圈画|根据|依据)[^。！？\n]{0,10}原文|原文(?:依据|证据|内容|表述)/
const SELF_SIMILARITY_OVERCLAIM = /(?:分形的)?自相似(?:性质)?(?:是指|指)[^。！？\n]{0,80}局部[^。！？\n]{0,40}(?:与|和)整体[^。！？\n]{0,20}(?:完全)?相同|(?:局部|形状)[^。！？\n]{0,50}不完全相同[^。！？\n]{0,30}(?:不能|不属于)[^。！？\n]{0,20}自相似/

export function auditGeneratedLessonPage(input: AuditGeneratedPageInput): PageContentIssue[] {
  const { planRevisionId, planPage, generatedPage, sourceMaterial, priorPages = [] } = input
  const issues: PageContentIssue[] = []
  const issue = (code: string, message: string, severity: PageContentIssue['severity'] = 'blocking') => {
    issues.push({ code, severity, message, pageId: planPage.id })
  }

  if (generatedPage.pageId !== planPage.id) issue('page-id', '正文页面 ID 与已确认计划不一致。')
  if (generatedPage.order !== planPage.order) issue('page-order', '正文页面顺序与已确认计划不一致。')
  if (generatedPage.purpose !== planPage.purpose) issue('page-purpose', '正文页面目的与已确认计划不一致。')
  if (generatedPage.planRevisionId !== planRevisionId) issue('plan-revision', '正文没有绑定当前页面计划版本。')
  if (!sameStrings(generatedPage.sourceRefs, planPage.sourceRefs)) issue('page-sources', '正文页面改写了计划中的来源绑定。')
  if (generatedPage.pairId !== planPage.pairId || generatedPage.pairRole !== planPage.pairRole) {
    issue('page-pair', '正文页面改写了计划中的问答配对。')
  }
  if (generatedPage.layoutGroupId !== planPage.layoutGroupId) issue('layout-group', '正文页面改写了计划中的连续版式组。')

  const contentResult = VisiblePageContentSchema.safeParse(generatedPage.content)
  if (!contentResult.success) issue('content-schema', '学生可见正文不符合该页面的强类型结构。')
  if (generatedPage.content.kind !== planPage.contentSpec.kind) {
    issue('content-kind', `正文类型 ${generatedPage.content.kind} 与计划类型 ${planPage.contentSpec.kind} 不一致。`)
  }
  if (
    planPage.contentSpec.kind === 'observation'
    && planPage.visualSpec.form === 'source-text'
    && planPage.visualSpec.sourceAssetPolicy === 'grounded-or-generate'
    && planPage.sourceRefs.length === 0
    && generatedPage.content.kind === 'observation'
    && !/^课堂自编(?:材料|语料)[：:]/.test(generatedPage.content.materialCaption ?? '')
  ) {
    issue('unlabeled-generated-source', '没有教材原文时，课堂自编观察语料必须明确标注“课堂自编材料”。')
  }
  const companionResult = TeacherCompanionContentSchema.safeParse({
    script: generatedPage.teacherCompanion.script,
    notes: generatedPage.teacherCompanion.notes,
  })
  if (!companionResult.success) issue('teacher-schema', '教师讲稿不符合独立讲稿结构。')
  if (generatedPage.teacherCompanion.pace !== planPage.teacherCompanion.pace) {
    issue('teacher-pace', '正文生成改写了已确认的授课节奏。')
  }

  const studentText = visiblePageText(generatedPage.content)
  if (
    planPage.sourceRefs.length === 0
    && (generatedPage.content.kind === 'observation' || isPromptContent(generatedPage.content))
    && UNSUPPORTED_SOURCE_CLAIM_TEXT.test(studentText)
  ) {
    issue('unsupported-source-claim', '页面没有绑定可引用原文，却把课堂自编材料称为原文、摘录或真实出处。')
  }
  const internalStudentText = studentText.match(INTERNAL_STUDENT_TEXT)?.[0]
  if (internalStudentText) {
    issue('internal-student-text', `学生投影片含内部说明、教师指令或系统旁白：命中“${internalStudentText}”。`)
  }
  if (TEACHER_SCRIPT_META_TEXT.test(generatedPage.teacherCompanion.script)) {
    issue('teacher-script-audience', '教师讲稿不是可以直接对学生说的课堂语言。')
  }
  if (SELF_SIMILARITY_OVERCLAIM.test(`${studentText}\n${generatedPage.teacherCompanion.script}`)) {
    issue('self-similarity-overclaim', '分形自相似被绝对化为局部与整体完全相同，未区分精确、近似或统计自相似。')
  }
  if (isPromptContent(generatedPage.content) && ANSWER_LEAK_TEXT.test(promptOnlyText(generatedPage.content))) {
    issue('answer-leak', '提问或练习页提前泄露了答案、结论或解析。')
  }
  if (isPromptContent(generatedPage.content) && promptStatesOwnVerdict(generatedPage.content.prompt)) {
    issue('answer-leak', '提问或练习页的题干自身用评价性措辞提前给出了判断方向。')
  }
  if (
    isPromptContent(generatedPage.content)
    && promptMaterialsStateVerdict(generatedPage.content.prompt, generatedPage.content.materials)
  ) {
    issue('answer-leak', '提问或练习页的材料已经直接给出本题判断。')
  }
  if (responseHasContradictoryVerdict(generatedPage.content)) {
    issue('verdict-conflict', '回应页先判定原说法成立，后续却用否定或纠错措辞推翻原说法，结论方向自相矛盾。')
  }
  if (
    planPage.contentSpec.kind === 'transfer'
    && /叠词/.test(planPage.contentSpec.taskGoal)
    && generatedPage.content.kind === 'transfer'
    && /一([\u4e00-\u9fff]{1,2})一\1/.test(generatedPage.content.materials.join('\n'))
  ) {
    issue('concept-substitution', '叠词迁移材料混入了数量短语的反复，会造成概念混淆。')
  }

  const sourceText = planPage.sourceRefs
    .map(reference => sourceMaterialByReference(sourceMaterial, reference)?.excerpt ?? '')
    .join('\n')
  const sourceSentenceCounts = sentenceCountClaims(sourceText)
  const generatedText = `${studentText}\n${generatedPage.teacherCompanion.script}`
  if (hasEnumerationCountConflict(generatedText)) {
    issue('enumeration-count-conflict', '页面声明的条目数量与实际列出的内容数量不一致。')
  }
  if (hasParallelMappingCountConflict(generatedText)) {
    issue('parallel-mapping-count-conflict', '页面前后对应项数量不一致，存在漏项或错配。')
  }
  const densityMessage = pageDensityMessage(generatedPage.content)
  if (densityMessage) issue('page-density', densityMessage)
  const generatedSentenceCounts = sentenceCountClaims(generatedText)
  const totalConflict = sourceSentenceCounts.total.size > 0
    && [...generatedSentenceCounts.total].some(count => !sourceSentenceCounts.total.has(count))
  const perChapterConflict = sourceSentenceCounts.perChapter.size > 0
    && [...generatedSentenceCounts.perChapter].some(count => !sourceSentenceCounts.perChapter.has(count))
  if (totalConflict || perChapterConflict) {
    issue('source-fact-conflict', '页面对作品句数的表述与已绑定来源明确给出的数量冲突。')
  }
  if (/第二、四句/.test(sourceText) && /每章第二句/.test(generatedText) && !/第四句/.test(generatedText)) {
    issue('source-structure-conflict', '页面遗漏了来源明确给出的每章第四句动词变化。')
  }
  if (hasUnbalancedQuotes(studentText)) issue('unbalanced-quotes', '学生投影片含未配对的引号。')

  const knownSourceRefs = new Set(sourceMaterial.map(sourceReferenceFor))
  for (const reference of generatedPage.sourceRefs) {
    if (!knownSourceRefs.has(reference)) issue('unknown-source', `页面引用了不存在的来源 ${reference}。`)
  }
  const evidenceRefs = evidenceSourceRefs(generatedPage.content)
  for (const reference of evidenceRefs) {
    if (!knownSourceRefs.has(reference)) issue('unknown-evidence-source', `正文证据引用了不存在的来源 ${reference}。`)
    if (!generatedPage.sourceRefs.includes(reference)) issue('unplanned-evidence-source', `正文使用了计划未授权的来源 ${reference}。`)
  }
  if (generatedPage.sourceRefs.length > 0 && contentNeedsEvidence(generatedPage.content) && evidenceRefs.length === 0) {
    issue('missing-evidence-source', '有来源约束的结论页必须把至少一条证据绑定到具体来源。')
  }

  if (planPage.contentSpec.kind === 'source-material' && generatedPage.content.kind === 'source-material') {
    const source = sourceMaterialByReference(sourceMaterial, planPage.contentSpec.sourceRef)
    if (!source?.excerpt?.trim()) issue('missing-source-body', '完整材料页没有可直接使用的权威正文。')
    if (source?.excerpt?.trim() && generatedPage.content.body !== source.excerpt.trim()) {
      issue('source-body-changed', '完整材料页正文被改写，必须逐字保留已绑定来源。')
    }
    const expectedCitation = source?.citation?.trim()
    if (expectedCitation !== generatedPage.content.citation) {
      issue('source-citation-changed', '完整材料页出处与已绑定来源不一致。')
    }
  }

  for (const prior of priorPages) {
    if (prior.purpose !== generatedPage.purpose) continue
    const similarity = textSimilarity(visiblePageText(prior.content), studentText)
    if (similarity >= 0.92) {
      issue('semantic-duplicate', `本页与 ${prior.pageId} 的学生可见内容没有足够的新信息。`)
      break
    }
  }

  return issues
}

export function auditCoursePageContentState(
  planning: { courseId: string; planRevisionId: string; pages: readonly LessonPagePlan[] },
  state: CoursePageContentState,
  sourceMaterial: readonly SourceMaterialRef[],
): PageContentIssue[] {
  const issues: PageContentIssue[] = []
  const issue = (code: string, message: string, pageId?: string) => {
    issues.push({ code, severity: 'blocking', message, ...(pageId ? { pageId } : {}) })
  }

  if (state.schemaVersion !== PAGE_CONTENT_SCHEMA_VERSION) issue('schema-version', '页面正文版本不受支持。')
  if (state.courseId !== planning.courseId) issue('course-id', '页面正文与页面计划不属于同一门课程。')
  if (state.planRevisionId !== planning.planRevisionId) issue('plan-revision', '页面正文不是由当前页面计划生成。')
  if (!state.contentRevisionId.trim()) issue('content-revision', '页面正文缺少独立版本 ID。')
  if (state.status !== 'review') issue('content-status', '生成后的页面正文必须先进入检查状态。')
  if (state.pages.length !== planning.pages.length) {
    issue('page-count', `正文必须严格保留 ${planning.pages.length} 张计划页面，实际为 ${state.pages.length} 张。`)
  }

  planning.pages.forEach((planPage, index) => {
    const generatedPage = state.pages[index]
    if (!generatedPage) {
      issue('missing-page', `缺少第 ${index + 1} 张计划页面 ${planPage.id}。`, planPage.id)
      return
    }
    issues.push(...auditGeneratedLessonPage({
      planRevisionId: planning.planRevisionId,
      planPage,
      generatedPage,
      sourceMaterial,
      priorPages: state.pages.slice(0, index),
    }))
  })

  for (const extra of state.pages.slice(planning.pages.length)) {
    issue('extra-page', `正文生成了计划外页面 ${extra.pageId}。`, extra.pageId)
  }

  return issues
}

export function blockingPageContentIssues(
  planning: { courseId: string; planRevisionId: string; pages: readonly LessonPagePlan[] },
  state: CoursePageContentState,
  sourceMaterial: readonly SourceMaterialRef[],
): PageContentIssue[] {
  return auditCoursePageContentState(planning, state, sourceMaterial)
    .filter(issue => issue.severity === 'blocking')
}

export function assertValidCoursePageContentState(
  planning: { courseId: string; planRevisionId: string; pages: readonly LessonPagePlan[] },
  state: CoursePageContentState,
  sourceMaterial: readonly SourceMaterialRef[],
): void {
  const blocking = blockingPageContentIssues(planning, state, sourceMaterial)
  if (blocking.length === 0) return
  throw new Error(`页面正文未通过：${blocking.map(issue => `${issue.code}:${issue.message}`).join('；')}`)
}

export function visiblePageText(content: VisiblePageContent): string {
  const values: string[] = []
  collectVisibleStrings(content, values)
  return values.join('\n')
}

/**
 * 学生能直接核查的页面材料不只包括位图。原文、数据记录和题面材料本身也可以是
 * 教学证据；标题、提示语和证据标签不算材料，避免用说明文字冒充观察对象。
 */
export function hasCheckablePageMaterial(content: VisiblePageContent): boolean {
  switch (content.kind) {
    case 'source-material':
      return Boolean(content.body.trim())
    case 'observation':
      return Boolean(content.materialCaption?.trim())
    case 'question':
    case 'practice':
    case 'transfer':
      return content.materials.some(item => item.trim())
    default:
      return false
  }
}

function collectVisibleStrings(value: unknown, values: string[], key?: string): void {
  if (typeof value === 'string') {
    if (key !== 'kind' && key !== 'sourceRef') values.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectVisibleStrings(item, values))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.entries(value).forEach(([entryKey, entryValue]) => collectVisibleStrings(entryValue, values, entryKey))
}

function evidenceSourceRefs(content: VisiblePageContent): string[] {
  switch (content.kind) {
    case 'explanation':
    case 'answer':
    case 'feedback':
    case 'recap':
      return content.evidence.flatMap(item => item.sourceRef ? [item.sourceRef] : [])
    default:
      return []
  }
}

function contentNeedsEvidence(content: VisiblePageContent): boolean {
  return content.kind === 'explanation'
    || content.kind === 'answer'
    || content.kind === 'feedback'
    || content.kind === 'recap'
}

function isPromptContent(content: VisiblePageContent): content is Extract<VisiblePageContent, { kind: 'question' | 'practice' | 'transfer' }> {
  return content.kind === 'question' || content.kind === 'practice' || content.kind === 'transfer'
}

function promptOnlyText(content: Extract<VisiblePageContent, { kind: 'question' | 'practice' | 'transfer' }>): string {
  return [content.prompt, ...content.materials, content.responseInstruction].join('\n')
}

export function promptMaterialsStateVerdict(promptText: string, materialTexts: readonly string[]): boolean {
  if (!/(?:是否|能否|可否|判断|辨析|正误|对不对)/.test(promptText)) return false
  const prompt = normalizeVerdictText(promptText)
  const materials = normalizeVerdictText(materialTexts.join('\n'))
  if (prompt.includes('实义') && /(?:有|无)实义/.test(materials)) return true
  const verdictFamilies = [
    ['正确', '错误'],
    ['成立', '不成立'],
    ['平衡', '不平衡'],
    ['相等', '不相等'],
    ['相同', '不同'],
    ['符合', '不符合'],
    ['属于', '不属于'],
    ['有意义', '无意义'],
    ['可以', '不可以'],
    ['能够', '不能'],
  ] as const
  return verdictFamilies.some(family => (
    family.some(term => prompt.includes(term))
    && family.some(term => materials.includes(term))
  ))
}

function promptStatesOwnVerdict(promptText: string): boolean {
  if (!/(?:是否|能否|可否|判断|辨析|正误|对不对)/.test(promptText)) return false
  return /(?:误将|误认为|误以为|错误地|片面地|忽视|其实|实为|而非|而是|正确的是|错误在于)/.test(promptText)
}

function responseHasContradictoryVerdict(content: VisiblePageContent): boolean {
  if (content.kind !== 'answer' && content.kind !== 'feedback') return false
  const conclusion = normalizeVerdictText(content.conclusion)
  const affirmsClaim = /(?:该|此)?(?:说法|判断|观点|理解)(?:完全)?成立/.test(conclusion)
    && !/(?:说法|判断|观点|理解)(?:完全)?不成立/.test(conclusion)
  if (!affirmsClaim) return false
  return /(?:误将|误作|误认为|误以为|错误理解|忽视|并非|不是|无实义|不属于|不符合|不相等|不平衡)/.test(conclusion)
}

function normalizeVerdictText(value: string): string {
  return normalize(value)
    .replaceAll('实际意义', '实义')
    .replaceAll('有实际含义', '有实义')
    .replaceAll('无实际含义', '无实义')
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

function textSimilarity(first: string, second: string): number {
  const firstText = normalize(first)
  const secondText = normalize(second)
  if (!firstText || !secondText) return 0
  if (firstText === secondText) return 1
  if (Math.min(firstText.length, secondText.length) < 40) return 0
  const firstBigrams = bigrams(firstText)
  const secondBigrams = bigrams(secondText)
  const shared = [...firstBigrams].filter(token => secondBigrams.has(token)).length
  return shared / (firstBigrams.size + secondBigrams.size - shared)
}

function bigrams(value: string): Set<string> {
  const result = new Set<string>()
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2))
  return result
}

function normalize(value: string): string {
  return value.replace(/[\s，。；：、,.!！?？“”"'（）()【】\[\]]/g, '').toLowerCase()
}

function sentenceCountClaims(value: string): { total: Set<number>; perChapter: Set<number> } {
  const number = '[一二三四五六七八九十百两\\d]+'
  const totalPattern = new RegExp(`(?:全诗(?:${number}章[，,]?)?(?:共|有)?|共)(${number})句`, 'g')
  const perChapterPattern = new RegExp(`每章(?:有|共)?(${number})句`, 'g')
  return {
    total: collectNumberClaims(value, totalPattern),
    perChapter: collectNumberClaims(value, perChapterPattern),
  }
}

function collectNumberClaims(value: string, pattern: RegExp): Set<number> {
  const result = new Set<number>()
  for (const match of value.matchAll(pattern)) {
    const parsed = parseChineseNumber(match[1] ?? '')
    if (parsed !== undefined) result.add(parsed)
  }
  return result
}

function hasEnumerationCountConflict(value: string): boolean {
  const pattern = /(?:一共|总共|共计|共有|共)[^，。；：:\n一二三四五六七八九十百两\d]{0,8}([一二三四五六七八九十百两\d]+)(?:个|项|条|种|类)[^：:。\n]{0,12}[：:]([^。\n]+)/g
  for (const match of value.matchAll(pattern)) {
    const expected = parseChineseNumber(match[1] ?? '')
    const enumeration = match[2]?.trim()
    if (expected === undefined || !enumeration) continue
    const separator = enumeration.includes('；') ? '；' : enumeration.includes('、') ? '、' : undefined
    if (!separator) continue
    const actual = enumeration.split(separator).map(item => item.trim()).filter(Boolean).length
    if (actual >= 2 && actual !== expected) return true
  }
  return false
}

function hasParallelMappingCountConflict(value: string): boolean {
  const pattern = /(?:由|从)([^，。；\n]{3,100})，(?:分别|依次)?(?:对应|呈现)([^。；\n]{3,220})/g
  for (const match of value.matchAll(pattern)) {
    const left = (match[1] ?? '')
      .replace(/[“”"']/g, '')
      .replace(/(?:依次)?(?:替换|变化|推进|排列)$/g, '')
    const right = match[2] ?? ''
    const leftItems = left.split(/(?:再)?到|[／/、]/).map(item => item.trim()).filter(Boolean)
    const rightItems = right.split('、').map(item => item.trim()).filter(Boolean)
    if (leftItems.length >= 2 && rightItems.length >= 2 && leftItems.length !== rightItems.length) return true
  }
  return false
}

function pageDensityMessage(content: VisiblePageContent): string | undefined {
  switch (content.kind) {
    case 'explanation': {
      const evidenceLength = content.evidence.reduce((sum, item) => sum + item.text.length, 0)
      const score = content.coreStatement.length + evidenceLength + content.boundary.length + content.evidence.length * 18
      const exceedsFieldBudget = content.coreStatement.length > 80
        || content.evidence.length > 3
        || content.evidence.some(item => item.text.length > 55)
        || evidenceLength > 140
        || content.boundary.length > 55
      return exceedsFieldBudget || score > 310
        ? '讲解页超过版式容量。coreStatement 不超过 80 字；evidence 最多 3 条、每条不超过 55 字且合计不超过 140 字；boundary 不超过 55 字。详细说明放入教师讲稿。'
        : undefined
    }
    case 'question':
    case 'practice':
    case 'transfer': {
      const score = Math.ceil(content.prompt.length * 1.3)
        + content.materials.reduce((sum, item) => sum + item.length, 0)
        + content.responseInstruction.length
        + content.materials.length * 16
      const exceedsFieldBudget = content.prompt.length > 90
        || content.materials.length > 3
        || content.materials.some(item => item.length > 140)
        || content.materials.reduce((sum, item) => sum + item.length, 0) > 140
        || content.responseInstruction.length > 40
      return exceedsFieldBudget || score > 345
        ? '题面超过半屏版式容量。prompt 不超过 90 字；materials 最多 3 条且合计不超过 140 字；responseInstruction 不超过 40 字。只保留作答必需的原始材料。'
        : undefined
    }
    case 'answer': {
      const score = content.conclusion.length
        + content.correction.length
        + content.evidence.reduce((sum, item) => sum + item.text.length, 0)
        + content.evidence.length * 24
      const exceedsFieldBudget = content.conclusion.length > 60
        || content.evidence.length > 2
        || content.evidence.some(item => item.text.length > 45)
        || content.correction.length > 50
      return exceedsFieldBudget || score > 300
        ? '回答栏超过半屏版式容量。conclusion 不超过 60 字；evidence 最多 2 条、每条不超过 45 字；correction 不超过 50 字。结论与证据不得复述。'
        : undefined
    }
    case 'feedback': {
      const score = content.successCriteria.reduce((sum, item) => sum + item.length, 0)
        + content.conclusion.length
        + content.evidence.reduce((sum, item) => sum + item.text.length, 0)
        + content.revisionAction.length
        + (content.successCriteria.length + content.evidence.length) * 24
      const exceedsFieldBudget = content.successCriteria.length > 2
        || content.successCriteria.some(item => item.length > 18)
        || content.conclusion.length > 70
        || content.evidence.length > 3
        || content.evidence.some(item => item.text.length > 40)
        || content.revisionAction.length > 35
      return exceedsFieldBudget || score > 330
        ? '反馈栏超过半屏版式容量。successCriteria 最多 2 条、每条不超过 18 字；conclusion 不超过 70 字；evidence 最多 3 条、每条不超过 40 字；revisionAction 不超过 35 字。'
        : undefined
    }
    case 'recap': {
      const columns = [
        { label: '概念', items: content.concepts },
        { label: '证据', items: content.evidence.map(item => item.text) },
        { label: '方法', items: content.methods },
      ]
      const overloaded = columns.find(column => (
        column.items.length > 3
        || column.items.some(item => item.length > 35)
        || column.items.reduce((sum, item) => sum + item.length, 0) + column.items.length * 24 > 210
      ))
      return overloaded
        ? `总结页“${overloaded.label}”栏超过三栏版式容量。concepts、evidence、methods 每栏最多 3 条，每条不超过 35 字；只保留直接对应学习目标的内容。`
        : undefined
    }
    default:
      return undefined
  }
}

function parseChineseNumber(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value)
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (value === '十') return 10
  const tenIndex = value.indexOf('十')
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[value[tenIndex - 1] ?? '']
    const units = tenIndex === value.length - 1 ? 0 : digits[value[tenIndex + 1] ?? '']
    return tens === undefined || units === undefined ? undefined : tens * 10 + units
  }
  return value.length === 1 ? digits[value] : undefined
}

function hasUnbalancedQuotes(value: string): boolean {
  const asciiDoubleQuotes = value.match(/"/g)?.length ?? 0
  const chineseOpenQuotes = value.match(/“/g)?.length ?? 0
  const chineseCloseQuotes = value.match(/”/g)?.length ?? 0
  return asciiDoubleQuotes % 2 !== 0 || chineseOpenQuotes !== chineseCloseQuotes
}

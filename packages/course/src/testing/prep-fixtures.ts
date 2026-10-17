/**
 * 备课门面与 prep 工具的测试夹具（3c）。不做任何 I/O；course、harness 的测试与 3c 的端到端、真实模型脚本共用。
 * prepFixtureKnowledge：两个初中语文知识点，一个挂权威教材摘录，一个挂权威课标摘录——AI 教学审查要求课程来源里两者都有
 * （teaching-quality-audit.ts 的 authoritativeEvidenceCoverage），而建课时每个知识点只取一条来源（course-grounding.ts 的 selectedSource）。
 * 来源标注里写进学科（语文）、学段（初中）与课题（两个知识点名以顿号相连，compile-lesson.ts 的 lessonTopic 在多知识点时回退到它）。
 * 摘录是测试用的转述，不是逐字核对过的原文。
 * fixtureLlmReply：按提示词类型给出能过迁入闸门的假模型应答；fixtureBrokenPageReply：过不了单页闸门的正文。
 * 其中 contentFor 约 90 行逐字复制自迁入测试 src/mainline/planning/__tests__/page-content-generator.test.ts 的 contentFor
 * （漂移检查不允许导入或移动迁入测试，3c 裁决 F9 接受复制；迁入测试改了这里要同步）。
 */
import type { KpGroundingSourceRow } from '../mainline/generation/course-grounding.js'
import type { VisiblePageContent } from '../mainline/planning/page-content-contract.js'
import { TEACHING_QUALITY_DIMENSIONS } from '../mainline/teaching-quality-audit.js'
import type { CourseKnowledgePort, CourseKnowledgeRow } from '../ports.js'

export const PREP_FIXTURE_KP_IDS = ['kp-prep-fuyi-diezi', 'kp-prep-fuyi-zhangfa'] as const

const POINTS: CourseKnowledgeRow[] = [
  {
    id: 'kp-prep-fuyi-diezi',
    canonical_name: '《芣苢》中叠词的表达效果',
    subject: '语文',
    grade_band: '初中',
    annotations: JSON.stringify({
      knowledgeType: { value: 'conceptual', source: 'human' },
      learningObjectives: { value: ['能识别《芣苢》中“采采”等叠词并说明其表意功能'], source: 'human' },
      misconceptions: { value: ['反复出现的句子只是重复，没有表达作用'], source: 'human' },
    }),
  },
  {
    id: 'kp-prep-fuyi-zhangfa',
    canonical_name: '《芣苢》重章叠句的节奏与情感',
    subject: '语文',
    grade_band: '初中',
    annotations: JSON.stringify({
      knowledgeType: { value: 'conceptual', source: 'human' },
      learningObjectives: { value: ['能结合诗句说明重章叠句在节奏与情感上的作用'], source: 'human' },
    }),
  },
]

export const PREP_FIXTURE_TOPIC = POINTS.map((point) => point.canonical_name).join('、')

const SOURCES: KpGroundingSourceRow[] = [
  {
    knowledgePointId: 'kp-prep-fuyi-diezi',
    source: 'textbook-body',
    externalId: `语文初中教材·${PREP_FIXTURE_TOPIC}`,
    evidenceSnippet: '采采芣苢，薄言采之。\n采采芣苢，薄言有之。\n\n作品结构：全诗三章，每章四句，共十二句；每章第二、四句的末字发生变化。',
    confidence: 0.95,
  },
  {
    knowledgePointId: 'kp-prep-fuyi-zhangfa',
    source: 'curated-verified-curriculum',
    externalId: `义务教育语文课程标准（2022年版）初中学段·${PREP_FIXTURE_TOPIC}`,
    evidenceSnippet: '课程标准要求：阅读诗歌时，能体会作品的情境和形象，品味富有表现力的语言，体会反复、叠词等手法在节奏与情感表达上的作用。',
    confidence: 0.9,
  },
]

export interface PrepFixtureKnowledge extends CourseKnowledgePort {
  points: CourseKnowledgeRow[]
  sources: KpGroundingSourceRow[]
}

export function prepFixtureKnowledge(): PrepFixtureKnowledge {
  const points = structuredClone(POINTS)
  const sources = structuredClone(SOURCES)
  return {
    points,
    sources,
    async knowledgePoints(ids) { return points.filter((point) => ids.includes(point.id)) },
    async knowledgePointSources(ids) { return sources.filter((source) => ids.includes(source.knowledgePointId)) },
  }
}

export interface FixtureLlmRequest {
  system?: string
  user: string
}

interface PageFillInput {
  page?: { contentSpec?: { kind: VisiblePageContent['kind']; [key: string]: unknown }; learningAction: string; newInformation: string }
  allowedSources?: Array<{ sourceRef: string }>
  fixedStudentContent?: unknown
}

interface ReviewPayload {
  course?: { goals?: Array<{ id: string }> }
  pages?: Array<{ pageId: string; studentVisibleText?: string }>
  teachingQualityReviewInput?: {
    standards?: Array<{ id?: string; standardId?: string }>
    pages?: Array<{ pageId: string; studentText?: string; plan?: { knowledgePointIds?: string[] } | null }>
  }
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}

// contentFor 原样取自 src/mainline/planning/__tests__/page-content-generator.test.ts:69-160（3a 迁入测试证明它能过逐页闸门）
function contentFor(
  spec: { kind: VisiblePageContent['kind']; [key: string]: unknown },
  learningAction: string,
  newInformation: string,
  sourceRef?: string,
): VisiblePageContent {
  const evidence = [{
    text: sourceRef ? '原文中相同句式反复出现，同时更换关键词。' : '材料中相同句式反复出现，同时更换关键词。',
    ...(sourceRef ? { sourceRef } : {}),
  }]
  switch (spec.kind) {
    case 'observation':
      return {
        kind: 'observation',
        title: sourceRef ? '观察原文的反复与变化' : '观察材料的反复与变化',
        prompt: `请完成：${learningAction}`,
        materialCaption: sourceRef ? '按诗章顺序逐行观察。' : '课堂自编材料：同一句式反复出现，关键词逐步变化。',
        evidenceLabels: ['重复的句式', '变化的词语'],
      }
    case 'explanation':
      return {
        kind: 'explanation',
        title: String(spec.focus),
        coreStatement: `${String(spec.focus)}通过可检查的形式变化推进表达。`,
        evidence,
        boundary: '必须结合具体词句和结构证据判断，不能只看是否出现相同文字。',
      }
    case 'question':
      return {
        kind: 'question',
        title: '先判断，再说明依据',
        prompt: String(spec.promptGoal),
        materials: [sourceRef ? '请回看前页已经标出的重复句式和变化词语。' : '课堂自编材料：相同句式反复出现，同时更换关键词。'],
        responseInstruction: sourceRef ? '先写下判断，再引用一处原文说明理由。' : '先写下判断，再引用一处材料说明理由。',
      }
    case 'answer':
      return {
        kind: 'answer',
        title: '核对判断与依据',
        conclusion: '反复形式与关键词变化共同推进表达。',
        evidence,
        correction: '把只说“重复”的答案改成“指出反复形式并说明表达推进”。',
      }
    case 'worked-step':
      return {
        kind: 'worked-step',
        title: String(spec.focus),
        steps: [{
          step: '圈出反复出现的句式。',
          reason: '先确认可直接观察的结构证据。',
          result: '相同句式在各章反复出现。',
        }],
      }
    case 'practice':
      return {
        kind: 'practice',
        title: '独立练习',
        prompt: `${String(spec.taskGoal)}请结合新的诗句完成判断。`,
        materials: ['新诗句：河水汤汤，行人彭彭。'],
        responseInstruction: sourceRef ? '写出手法、原文证据和表达效果。' : '写出手法、材料证据和表达效果。',
      }
    case 'feedback':
      return {
        kind: 'feedback',
        title: learningAction.includes('迁移') ? '迁移任务反馈' : '练习反馈',
        successCriteria: ['写明手法并引用材料', '说明表达作用'],
        conclusion: '相同句式形成反复节奏，关键词变化推动内容展开。',
        evidence,
        revisionAction: '补上原文证据和表达作用。',
      }
    case 'recap':
      return {
        kind: 'recap',
        title: '本课总结',
        concepts: ['重章叠句是句式和章法的反复。', '叠词是相同字词的重叠使用。'],
        evidence,
        methods: ['先找形式', '再引原文', '最后说明表达作用'],
      }
    case 'transfer':
      return {
        kind: 'transfer',
        title: '迁移任务',
        prompt: String(spec.taskGoal),
        materials: ['新材料：另一首诗中连续三章使用同一句式，但每章更换一个动作词。'],
        responseInstruction: '判断所用手法，并结合变化说明表达效果。',
      }
    case 'course-orientation':
    case 'course-structure':
    case 'source-material':
      throw new Error(`${spec.kind} 应由程序锁定，不应交给模型生成。`)
  }
}

function pageFillReply(input: PageFillInput): Record<string, unknown> {
  const page = input.page!
  const teacherCompanion = {
    script: `请看清楚画面中的内容，先完成“${page.learningAction}”，再说出你判断时使用的依据。`,
    notes: ['留出独立观察或作答时间。'],
  }
  if (input.fixedStudentContent) return { teacherCompanion }
  return { content: distinctFeedback(contentFor(page.contentSpec!, page.learningAction, page.newInformation, input.allowedSources?.[0]?.sourceRef), page.learningAction), teacherCompanion }
}

/**
 * 两知识点夹具有两张练习反馈页（各接一个知识点的练习），contentFor 给它们的正文逐字相同，
 * 后一张过不了单页闸门的重复检查（page-content-audit.ts 的 semantic-duplicate）。只对 feedback 把学习动作里引号中的目标
 * 写到结论前面（conclusion 版式上限 70 字，successCriteria 每条上限 18 字放不下）；contentFor 本身保持与迁入测试逐字相同。
 */
function distinctFeedback(content: VisiblePageContent, learningAction: string): VisiblePageContent {
  const focus = /“(.+)”的成功标准/.exec(learningAction)?.[1]
  if (content.kind !== 'feedback' || !focus) return content
  return { ...content, conclusion: `${focus}：${content.conclusion}` }
}

/**
 * 由模型生成学生正文的逐页请求：user 是带 page.contentSpec 的 JSON（page-content-generator.test.ts 的 validLLM 同样据此判断），
 * 且不是程序锁定正文、只让模型写讲稿的页（fixedStudentContent）
 */
export function isPageFillRequest(request: FixtureLlmRequest): boolean {
  const input = parseJson(request.user) as PageFillInput | undefined
  return Boolean(input?.page?.contentSpec) && !input?.fixedStudentContent
}

/** 整课事实核查与 AI 教学审查（同一次调用，page-content-fact-audit.ts 的 REVIEW_SYSTEM_PROMPT）的"全部通过"应答 */
function courseReviewReply(user: string): Record<string, unknown> {
  const payload = (parseJson(user) ?? {}) as ReviewPayload
  const review = payload.teachingQualityReviewInput ?? {}
  const reviewPages = review.pages ?? []
  const evidencePage = reviewPages.find((page) => (page.studentText ?? '').trim().length >= 2)
  const evidence = (evidencePage?.studentText ?? '').trim().slice(0, 30)
  // 每个知识点取第一张页：覆盖页集合对每个目标都含其知识点的页（coveragePagesMatchGoal 用 some，page-content-fact-audit.ts:282-285）
  const byKp = new Map<string, string>()
  for (const page of reviewPages) for (const kpId of page.plan?.knowledgePointIds ?? []) if (!byKp.has(kpId)) byKp.set(kpId, page.pageId)
  const coveragePages = [...new Set(byKp.values())].slice(0, 8)
  const coverageEvidence = ((payload.pages ?? []).find((page) => coveragePages.includes(page.pageId) && (page.studentVisibleText ?? '').trim().length >= 2)?.studentVisibleText ?? '').trim().slice(0, 30)
  const standardIds = (review.standards ?? []).map((standard) => standard.id ?? standard.standardId ?? '').filter(Boolean)
  return {
    issues: [],
    goalCoverage: (payload.course?.goals ?? []).map((goal) => ({ goalId: goal.id, status: 'covered', pageIds: coveragePages, evidence: coverageEvidence })),
    teachingQualityReview: {
      reviewedPageIds: reviewPages.map((page) => page.pageId),
      reviewedStandardIds: standardIds,
      checks: TEACHING_QUALITY_DIMENSIONS.map((dimension) => ({ dimension, standardId: standardIds[0] ?? '', pageIds: evidencePage ? [evidencePage.pageId] : [], status: 'pass', evidence })),
      findings: [],
    },
  }
}

/** 按提示词类型应答：整课审查、单页核查、AI 试学、逐页生成；其余给空问题表 */
export function fixtureLlmReply(request: FixtureLlmRequest): string {
  const system = request.system ?? ''
  if (system.includes('整课事实与教学一致性核查官')) return JSON.stringify(courseReviewReply(request.user))
  if (system.includes('单页事实与来源核查官')) return '{"issues":[]}'
  if (system.includes('认真"上"到第')) return JSON.stringify({ overall: '整节课先观察诗句再说明作用，最后迁移到新诗句，节奏清楚，我能跟上。', issues: [], clearestPageNo: 1 })
  const input = parseJson(request.user) as PageFillInput | undefined
  if (input?.page?.contentSpec) return JSON.stringify(pageFillReply(input))
  return '{"issues":[]}'
}

/** 过不了单页闸门的正文：标题混进内部字段名（page-content-audit.ts 的 INTERNAL_STUDENT_TEXT）。不是逐页生成请求时返回 undefined */
export function fixtureBrokenPageReply(request: FixtureLlmRequest): string | undefined {
  const input = parseJson(request.user) as PageFillInput | undefined
  if (!input?.page?.contentSpec || input.fixedStudentContent) return undefined
  const reply = pageFillReply(input) as { content: { title: string }; teacherCompanion: unknown }
  return JSON.stringify({ ...reply, content: { ...reply.content, title: `内部字段：${reply.content.title}` } })
}

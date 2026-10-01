import { z } from 'zod'
import type { MainlineCourse } from './domain.js'
import { generationInputHash, type GenerationCourseAuditRecord, type TeachingQualityAuditFinding, type TeachingQualityAuditRecord, type TeachingQualityStandard } from './generation-session.js'
import { visiblePageText } from './planning/page-content-audit.js'
import { lessonPresentationPages } from './presentation/presentation-pages.js'

export const TEACHING_QUALITY_DIMENSIONS = [
  'goal-alignment',
  'materials',
  'progression',
  'information-gain',
  'answer-separation',
  'visual-purpose',
  'teacher-companion',
  'standards-evidence',
] as const

export const TEACHING_QUALITY_INPUT_SCHEMA_VERSION = 'mainline-teaching-quality-input-v2' as const

const FindingSchema = z.object({
  standardId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  severity: z.enum(['blocking', 'warning', 'insufficient-evidence']),
  category: z.enum(['goal-alignment', 'materials', 'progression', 'information-gain', 'answer-separation', 'visual-purpose', 'teacher-companion', 'standards-evidence']),
  evidence: z.string().trim().min(2).max(700),
  impact: z.string().trim().min(2).max(500),
  fix: z.string().trim().min(2).max(500),
}).strict()

const CheckSchema = z.object({
  dimension: z.enum(TEACHING_QUALITY_DIMENSIONS),
  standardId: z.string().trim().min(1),
  pageIds: z.array(z.string().trim().min(1)).min(1).max(24),
  status: z.enum(['pass', 'issue', 'insufficient-evidence']),
  evidence: z.string().trim().min(2).max(700),
}).strict()

export const TeachingQualityReviewOutputSchema = z.object({
  reviewedPageIds: z.array(z.string().trim().min(1)).min(1).max(100),
  reviewedStandardIds: z.array(z.string().trim().min(1)).min(1).max(32),
  checks: z.array(CheckSchema).length(TEACHING_QUALITY_DIMENSIONS.length),
  findings: z.array(FindingSchema).max(40),
}).strict()

export type TeachingQualityReviewOutput = z.infer<typeof TeachingQualityReviewOutputSchema>

export const TEACHING_QUALITY_REVIEW_PROMPT = [
  '你是中小学教学质量审查器。只审查，不生成或修改课程。',
  '审查依据在输入 standards 中。官方要求、研究支持和产品操作化必须严格区分；不得把产品字号、页数、模板或分数伪称课标要求。',
  '硬编码的标准 ID 只是待核对的索引，不能单独构成已核对的课标或教材证据。课标与教材证据分别以输入 sourceEvidence 中的权威原文、来源定位、学科、学段和知识点绑定为准。',
  '每条 finding 和每条 check 必须使用输入中的 standardId、pageId，并且 evidence 必须逐字摘自对应学生页面的 studentText；教师讲稿和来源摘录不能作为报告 evidence。教师讲稿只用于判断讲稿与学生页是否互补。每条 finding 必须写清对学生学习的具体影响和可执行改法。',
  'severity 只能是 blocking、warning、insufficient-evidence。没有足够可核验依据时必须用 insufficient-evidence，不能以模型自信或流畅措辞判通过。',
  '检查目标对齐、必要材料、前置铺垫与递进、问题答案分离、图像的教学作用、讲稿与学生页互补。',
  '重复不是关键词命中：复习若有明确教学目的、迁移任务，或新增实际步骤、依据、结果之一，不得报重复。仅当 worked-step 的标题、依据、结果反复复述同一条件，且没有新增步骤、依据、结果或迁移任务时，报 information-gain。',
  '不得宣称教材一致性通过，除非输入明确含有分别可核对的教材与学科课程标准原文；两者任一缺失、无来源定位、学科、学段或课题不匹配、或未绑定知识点时应报告 standards-evidence 的 insufficient-evidence。',
  '必须输出 reviewedPageIds 并且与输入 pages 的 pageId 集合完全相同；必须输出 reviewedStandardIds 并且与输入 standards 的 standardId 集合完全相同。不得遗漏、编造或重复 ID。',
  '必须输出恰好八条 checks，且每个维度 goal-alignment、materials、progression、information-gain、answer-separation、visual-purpose、teacher-companion、standards-evidence 各一条。每条 check 必须有输入 standardId、至少一个真实页面 ID 和该页面逐字 evidence。',
  '只有 reviewedPageIds、reviewedStandardIds、八个 checks 都完整无重复、每条 check.status 为 pass 且 findings 为空时，才可以形成通过结论。只要存在 finding，至少一条关联 check.status 必须为 issue 或 insufficient-evidence。',
  '固定输出 {"reviewedPageIds":["页面ID"],"reviewedStandardIds":["标准ID"],"checks":[{"dimension":"goal-alignment","standardId":"...","pageIds":["页面ID"],"status":"pass","evidence":"学生页面原文"}],"findings":[{"standardId":"...","pageId":"...","severity":"warning","category":"information-gain","evidence":"页面原文","impact":"具体学习影响","fix":"具体改法"}]}。无发现时 findings 必须输出空数组。',
].join('\n')

export function teachingQualityStandards(course: MainlineCourse): TeachingQualityStandard[] {
  const official = course.gradeBand === 'high-school'
    ? {
        id: 'CN-MOE-HS-2017-2020',
        title: '普通高中课程方案和语文等学科课程标准（2017年版2020年修订，标准索引待核对）',
        sourceType: 'official-requirement' as const,
        sourceUrl: 'https://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html',
        applicability: '普通高中课程；须按学科课程标准具体条文核对。',
        limitation: '这是硬编码的标准索引；没有课程输入中对应学科、学段和知识点的权威条文或教材原文时，不得声明课程标准或教材一致性已核对。',
      }
    : {
        id: 'CN-MOE-YW-2022',
        title: '义务教育课程方案和课程标准（2022年版，标准索引待核对）',
        sourceType: 'official-requirement' as const,
        sourceUrl: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html',
        applicability: '义务教育课程；须按学科、学段的具体课程目标、内容与学业质量条文核对。',
        limitation: '这是硬编码的标准索引；没有课程输入中对应学科、学段和知识点的权威条文或教材原文时，不得声明课程标准或教材一致性已核对。',
      }
  return [official,
    research('IES-OISL-2007-R2', '完整例题与学生解题交替', '研究支持：用完整例题与学生解题交替组织学习。'),
    research('IES-OISL-2007-R3', '图形与语言描述结合', '研究支持：图像应与语言说明共同承担概念表征。'),
    research('IES-OISL-2007-R5B', '关键内容的再暴露', '研究支持：以测验或有目的复习再暴露关键内容。'),
    research('IES-OISL-2007-R7', '深层解释性问题', '研究支持：使用要求解释依据的问题促进理解。'),
    {
      id: 'MAOLAB-PRODUCT-TEACHING-QUALITY-V1',
      title: 'Maolab 课堂页面教学质量操作化规则',
      sourceType: 'product-operationalization',
      sourceUrl: 'https://ies.ed.gov/ncee/wwc/PracticeGuide/1',
      applicability: '把目标对齐、材料可检查性、递进、信息增量、问答分离、图像教学作用和讲稿互补转化为逐页可审查输出。',
      limitation: '这是产品操作化，不是教育部或 IES 的逐字条款，不设官方分数、字号、页数或模板要求。',
    },
  ]
}

function research(id: string, title: string, applicability: string): TeachingQualityStandard {
  return {
    id, title: `IES Organizing Instruction and Study to Improve Student Learning: ${title}`,
    sourceType: 'research-supported', sourceUrl: 'https://ies.ed.gov/ncee/wwc/PracticeGuide/1', applicability,
    limitation: '这是研究支持的标准索引，不是中国国家课程标准的强制合规条文，也不代表本课已完成课标或教材核对。',
  }
}

export function teachingQualityReviewPayload(course: MainlineCourse, standards: readonly TeachingQualityStandard[]): string {
  const planByPageId = new Map(course.planning?.pages.map(page => [page.id, page]) ?? [])
  return JSON.stringify({
    course: {
      id: course.id,
      topic: course.topic,
      subject: course.subject,
      gradeBand: course.gradeBand,
      stylePackId: course.stylePackId ?? null,
      planRevisionId: course.planning?.planRevisionId ?? null,
      goals: (course.goals ?? []).map(goal => ({ id: goal.id, statement: goal.statement, successSignal: goal.successSignal })),
    },
    standards,
    pages: course.pageContent?.pages.map(page => {
      const plan = planByPageId.get(page.pageId)
      return {
        pageId: page.pageId,
        studentText: visiblePageText(page.content),
        teacherScript: page.teacherCompanion.script,
        image: {
          url: page.imageUrl?.trim() ?? '',
          prompt: page.imagePrompt?.trim() ?? '',
          aspect: page.imageAspect?.trim() ?? '',
        },
        plan: plan ? {
          knowledgePointIds: plan.knowledgePointIds,
          sourceRefs: plan.sourceRefs,
          learningAction: plan.learningAction,
          newInformation: plan.newInformation,
          visualRequired: plan.visualSpec?.required ?? false,
          visualForm: plan.visualSpec?.form ?? 'none',
          visualReason: plan.visualSpec?.reason ?? '',
          teachingMove: plan.teacherCompanion?.teachingMove ?? '',
        } : null,
        sourceRefs: page.sourceRefs,
      }
    }) ?? [],
    // Bind the audit to what the classroom renderer actually resolves. This
    // catches inherited scene images and source-resource fallbacks that are
    // not stored in page.imageUrl but still change the student-visible PPT.
    studentPresentation: resolvedStudentPresentation(course),
    sourceEvidence: (course.sourceMaterial ?? []).map(source => ({
      kind: source.kind,
      title: source.title,
      kpId: source.kpId ?? '',
      citation: source.citation ?? '',
      evidenceStatus: source.provenance?.evidenceStatus,
      provenance: source.provenance ? { source: source.provenance.source, externalId: source.provenance.externalId ?? '' } : undefined,
      excerpt: source.excerpt ?? '',
    })),
  })
}

function resolvedStudentPresentation(course: MainlineCourse): unknown[] {
  const hasCompletePlan = course.planning?.pages.every(page => Boolean(page.visualSpec && page.teacherCompanion && page.fragmentId)) ?? true
  if (!hasCompletePlan) {
    return course.pageContent?.pages.map(page => ({
      pageId: page.pageId,
      content: page.content,
      imageUrl: page.imageUrl?.trim() ?? '',
    })) ?? []
  }
  return lessonPresentationPages({
    ...course,
    scenes: course.scenes ?? [],
    learningFragments: course.learningFragments ?? [],
    sourceMaterial: course.sourceMaterial ?? [],
  }).map(page => ({
    pageId: page.id,
    sourceSceneId: page.sourceSceneId,
    visualLayout: page.scene.visualLayout,
    visualFocus: page.scene.visualFocus,
    contentSlots: page.scene.contentSlots,
    imageUrl: page.scene.imageUrl?.trim() ?? '',
    studentAction: page.scene.studentAction,
    evidenceOnScreen: page.scene.evidenceOnScreen,
  }))
}

export function teachingQualityInputHash(
  course: MainlineCourse,
  standards: readonly TeachingQualityStandard[] = teachingQualityStandards(course),
): string {
  return generationInputHash({
    inputSchemaVersion: TEACHING_QUALITY_INPUT_SCHEMA_VERSION,
    recordSchemaVersion: 'mainline-teaching-quality-audit-v1',
    prompt: TEACHING_QUALITY_REVIEW_PROMPT,
    reviewContract: {
      dimensions: TEACHING_QUALITY_DIMENSIONS,
      checkCount: TEACHING_QUALITY_DIMENSIONS.length,
      severities: ['blocking', 'warning', 'insufficient-evidence'],
    },
    payload: JSON.parse(teachingQualityReviewPayload(course, standards)) as unknown,
  })
}

export function buildTeachingQualityAudit(
  course: MainlineCourse,
  generationCourseAudit: GenerationCourseAuditRecord,
  output: TeachingQualityReviewOutput | undefined,
  now = new Date().toISOString(),
): TeachingQualityAuditRecord {
  const pageContent = course.pageContent
  if (!pageContent) throw new Error('buildTeachingQualityAudit: 课程缺少页面正文。')
  const standards = teachingQualityStandards(course)
  const standardIds = new Set(standards.map(item => item.id))
  // 审查可考虑讲稿是否补充学生页，但报告证据必须可在学生实际看到的页面复核。
  const pages = new Map(pageContent.pages.map(page => [page.pageId, visiblePageText(page.content)]))
  const fallbackPageId = pageContent.pages[0]?.pageId ?? course.id
  const fallbackEvidence = firstStudentEvidence(pages)
  const findings: TeachingQualityAuditFinding[] = []

  const authority = authoritativeEvidenceCoverage(course)
  if (!authority.curriculumStandard) {
    findings.push(insufficient(standards[0]!.id, fallbackPageId, fallbackEvidence, '缺少可追溯、学科和学段匹配且已绑定知识点的权威课程标准原文，不能声明课标已核对。', '挂载并绑定对应学科、学段和知识点的课程标准原文、citation 或 provenance 后重新审查。', 'curriculum-standard'))
  }
  if (!authority.textbook) {
    findings.push(insufficient(standards[0]!.id, fallbackPageId, fallbackEvidence, '缺少可追溯、学科和学段匹配且已绑定知识点的权威教材原文，不能声明教材已核对。', '挂载并绑定对应学科、学段和知识点的教材原文、citation 或 provenance 后重新审查。', 'textbook'))
  }
  const integrityProblems = output ? reviewIntegrityProblems(output, pageContent.pages.map(page => page.pageId), standards.map(standard => standard.id), pages) : ['本次自动教学审查没有返回可校验结果。']
  if (integrityProblems.length) {
    findings.push(insufficient(standards[0]!.id, fallbackPageId, fallbackEvidence, integrityProblems[0]!, '重新运行审查，并完整返回输入中的页面、标准和逐维学生页面证据。', 'review-integrity'))
  } else if (output) {
    for (const [index, candidate] of output.findings.entries()) {
      const pageText = pages.get(candidate.pageId)
      if (!standardIds.has(candidate.standardId) || !pageText || !pageText.includes(candidate.evidence)) {
        findings.push(insufficient(
          standards[0]!.id,
          fallbackPageId,
          fallbackEvidence,
          `审查返回第 ${index + 1} 条发现无法对应输入标准或学生页面原文。`,
          '重新运行审查，并只引用输入标准 ID、页面 ID 和逐字页面原文。',
          `finding-${index + 1}`,
        ))
        continue
      }
      findings.push({ id: `teaching:${candidate.pageId}:${candidate.category}-${index + 1}`, ...candidate })
    }
  }
  const status = findings.some(item => item.severity === 'insufficient-evidence')
    ? 'insufficient-evidence'
    : findings.length > 0 ? 'blocked' : 'passed'
  return {
    schemaVersion: 'mainline-teaching-quality-audit-v1',
    id: generationInputHash({ courseId: course.id, planRevisionId: generationCourseAudit.planRevisionId, contentRevisionId: pageContent.contentRevisionId, generationCourseAuditId: generationCourseAudit.id, standards, findings }),
    inputHash: teachingQualityInputHash(course, standards),
    courseId: course.id, planRevisionId: generationCourseAudit.planRevisionId, contentRevisionId: pageContent.contentRevisionId,
    generationCourseAuditId: generationCourseAudit.id, standards, findings, status, auditedAt: now,
  }
}

function insufficient(standardId: string, pageId: string, evidence: string, impact: string, fix: string, reason: string): TeachingQualityAuditFinding {
  return { id: `teaching:${pageId}:insufficient-${reason}`, standardId, pageId, severity: 'insufficient-evidence', category: 'standards-evidence', evidence, impact, fix }
}

function reviewIntegrityProblems(
  output: TeachingQualityReviewOutput,
  expectedPageIds: readonly string[],
  expectedStandardIds: readonly string[],
  pageTextById: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = []
  // The normal LLM route parses this object with Zod. Keep this defensive
  // boundary as well: injected or legacy callers must become insufficient
  // evidence instead of crashing or treating an empty finding list as a pass.
  const review = output as Partial<TeachingQualityReviewOutput>
  const reviewedPageIds = Array.isArray(review.reviewedPageIds) ? review.reviewedPageIds : []
  const reviewedStandardIds = Array.isArray(review.reviewedStandardIds) ? review.reviewedStandardIds : []
  const checks = Array.isArray(review.checks) ? review.checks : []
  const findings = Array.isArray(review.findings) ? review.findings : []

  if (!isExactIdSet(reviewedPageIds, expectedPageIds)) problems.push('审查返回的 reviewedPageIds 未精确覆盖输入投影片，或含有未知、遗漏、重复 ID。')
  if (!isExactIdSet(reviewedStandardIds, expectedStandardIds)) problems.push('审查返回的 reviewedStandardIds 未精确覆盖输入标准，或含有未知、遗漏、重复 ID。')

  const dimensions = new Set<string>()
  for (const check of checks) {
    if (dimensions.has(check.dimension)) problems.push(`审查返回的 checks 重复了维度 ${check.dimension}。`)
    dimensions.add(check.dimension)
    if (!expectedStandardIds.includes(check.standardId)) problems.push(`审查检查引用了未知标准 ${check.standardId}。`)
    if (hasDuplicateIds(check.pageIds) || check.pageIds.some(pageId => !expectedPageIds.includes(pageId))) {
      problems.push(`审查检查 ${check.dimension} 含有未知或重复的学生页面 ID。`)
    } else if (!hasStudentPageEvidence(pageTextById, check.pageIds, check.evidence)) {
      problems.push(`审查检查 ${check.dimension} 没有可在学生页面中逐字复核的 evidence。`)
    }
  }
  if (!isExactIdSet([...dimensions], TEACHING_QUALITY_DIMENSIONS)) problems.push('审查返回的 checks 没有恰好覆盖全部教学质量维度。')

  const findingKeys = new Set<string>()
  for (const finding of findings) {
    const key = `${finding.standardId}\u0000${finding.pageId}\u0000${finding.category}\u0000${finding.evidence}`
    if (findingKeys.has(key)) problems.push('审查返回了重复的 finding。')
    findingKeys.add(key)
  }
  const allPass = checks.length === TEACHING_QUALITY_DIMENSIONS.length && checks.every(check => check.status === 'pass')
  if (findings.length === 0 && !allPass) problems.push('findings 为空时，必须提供完整逐维的正向 checks，且全部明确为 pass。')
  if (findings.length > 0 && allPass) problems.push('存在 finding 时，至少一条逐维 check 必须标记为 issue 或 insufficient-evidence。')
  return problems
}

function isExactIdSet(actual: unknown, expected: readonly string[]): actual is string[] {
  if (!Array.isArray(actual) || actual.some(id => typeof id !== 'string')) return false
  return actual.length === expected.length
    && !hasDuplicateIds(actual)
    && actual.every(id => expected.includes(id))
}

function hasDuplicateIds(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length
}

function hasStudentPageEvidence(pageTextById: ReadonlyMap<string, string>, pageIds: readonly string[], evidence: string): boolean {
  const excerpt = evidence.trim()
  return Boolean(excerpt) && pageIds.some(pageId => pageTextById.get(pageId)?.includes(excerpt))
}

function firstStudentEvidence(pageTextById: ReadonlyMap<string, string>): string {
  return [...pageTextById.values()].find(text => text.trim().length > 0) ?? ''
}

function authoritativeEvidenceCoverage(course: MainlineCourse): { curriculumStandard: boolean; textbook: boolean } {
  const authoritative = course.sourceMaterial.filter(source => source.provenance?.evidenceStatus === 'authoritative-excerpt' && hasTraceableExcerpt(source))
  return {
    curriculumStandard: authoritative.some(source => isCurriculumStandard(source) && sourceMatchesCourse(source, course)),
    textbook: authoritative.some(source => source.kind === 'textbook' && !isCurriculumStandard(source) && sourceMatchesCourse(source, course)),
  }
}

function hasTraceableExcerpt(source: MainlineCourse['sourceMaterial'][number]): boolean {
  const hasExcerpt = Boolean(source.excerpt?.trim())
  const hasTrace = Boolean(source.citation?.trim() || source.provenance?.source.trim() || source.provenance?.externalId?.trim())
  return hasExcerpt && hasTrace
}

function isCurriculumStandard(source: MainlineCourse['sourceMaterial'][number]): boolean {
  return /课程标准|课程方案|课标|curriculum\s*standard/i.test(sourceScopeText(source))
}

function sourceMatchesCourse(source: MainlineCourse['sourceMaterial'][number], course: MainlineCourse): boolean {
  const kpId = source.kpId?.trim()
  if (!course.topic.trim() || !kpId || !course.planning?.pages.some(page => page.knowledgePointIds.includes(kpId))) return false
  const scope = sourceScopeText(source).toLowerCase()
  return subjectMarkers(course.subject).some(marker => scope.includes(marker))
    && gradeBandMarkers(course.gradeBand).some(marker => scope.includes(marker))
    && scopeIncludesTopic(scope, course.topic)
}

function scopeIncludesTopic(scope: string, topic: string): boolean {
  const normalizedTopic = topic.toLowerCase().replace(/\s+/g, '')
  return normalizedTopic.length > 0 && scope.replace(/\s+/g, '').includes(normalizedTopic)
}

function sourceScopeText(source: MainlineCourse['sourceMaterial'][number]): string {
  return [source.title, source.citation, source.provenance?.source, source.provenance?.externalId].filter(Boolean).join('\n')
}

function subjectMarkers(subject: MainlineCourse['subject']): readonly string[] {
  const markers: Record<NonNullable<MainlineCourse['subject']>, readonly string[]> = {
    chinese: ['chinese', '语文'], math: ['math', '数学'], science: ['science', '科学'], english: ['english', '英语'],
    history: ['history', '历史'], politics: ['politics', '道德与法治', '思想政治'], geography: ['geography', '地理'],
    physics: ['physics', '物理'], chemistry: ['chemistry', '化学'], biology: ['biology', '生物'], general: ['general', '综合'],
  }
  return subject ? markers[subject] : []
}

function gradeBandMarkers(gradeBand: MainlineCourse['gradeBand']): readonly string[] {
  const markers: Record<NonNullable<MainlineCourse['gradeBand']>, readonly string[]> = {
    'lower-primary': ['lower-primary', '小学低年级', '一年级', '二年级'],
    'upper-primary': ['upper-primary', '小学高年级', '三年级', '四年级', '五年级', '六年级'],
    'middle-school': ['middle-school', '初中', '七年级', '八年级', '九年级'],
    'high-school': ['high-school', '高中', '高一', '高二', '高三'],
  }
  return gradeBand ? markers[gradeBand] : []
}

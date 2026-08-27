/**
 * KnowledgePointExtractionAnnotator (v0.1.1 alpha) — KP 抽取首版
 *
 * 边界（仅用于 dry-run 验证 schema）：
 *   - 仅产 KPDraft[]（LLM 自然形态：扁平 6 维 + 无 context 字段），不写 DB、不写 tree JSON
 *   - 不分配 KP.id / cluster.id（由 PR2 完成）
 *
 * 契约变更（v0.1.0 → v0.1.1，仍 alpha）：
 *   - 移除 context-known 字段 subject / curriculumSystem / gradeBand
 *     （LLM 无需重复输出；annotator 从 ctx + opts 注入到 enriched KPDraft）
 *   - 6 维改扁平：knowledgeType / difficulty / learningObjectives / prerequisites /
 *     misconceptions / assessability 直接放 KPDraft 顶层，与 LLM 自然输出对齐
 *   - annotator 内部将扁平 6 维 reshape 成 ChapterAnnotations-shape 的 dimensions:
 *     { knowledgeType: Annotation<KnowledgeType>, ... }，供后续写入路径使用
 */

import { z } from 'zod'
import type { Annotation, KnowledgeType } from '../tree-types.js'
import type { Annotator, AnnotationContext } from '../annotation-pipeline.js'
import { extractJSON } from './knowledge-type.js'

// ============================================================
// KPDraft schema (LLM 输出契约 — 与 LLM 自然形态对齐: 扁平、无 ctx 字段)
// ============================================================

const KnowledgeTypeEnum = z.enum(['factual', 'conceptual', 'procedural', 'metacognitive'])
  .catch('factual' as const)

export const KPDraftSchema = z.object({
  canonicalName: z.string().min(1),
  canonicalNameEn: z.string().min(1),
  aliases: z.array(z.string()),
  // 6 维直接平铺（不嵌 dimensions 对象）
  knowledgeType: KnowledgeTypeEnum,
  difficulty: z.number().min(0).max(1),
  learningObjectives: z.array(z.string().min(1)).min(1),
  prerequisites: z.array(z.string()),
  misconceptions: z.array(z.string()),
  assessability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
})

export type KPDraft = z.infer<typeof KPDraftSchema>

/**
 * annotator 内部把扁平 KPDraft 转成的 "enriched" KP：
 *   - 注入 ctx-known: subject / curriculumSystem / gradeBand
 *   - 6 维 reshape 成 ChapterAnnotations-shape dimensions（每维 Annotation<T> 容器）
 * 这是 annotator 真正交付给下游（DB 写路径 / dry-run 检视）的形态。
 */
export interface EnrichedKPDraft {
  canonicalName: string
  canonicalNameEn: string
  aliases: string[]
  subject: string
  curriculumSystem: string
  gradeBand?: string
  dimensions: {
    knowledgeType: Annotation<KnowledgeType>
    difficulty: Annotation<number>
    learningObjectives: Annotation<string[]>
    prerequisites: Annotation<string[]>
    misconceptions: Annotation<string[]>
    assessability: Annotation<number>
  }
  confidence: number
  reasoning: string
}

export const KPExtractionOutputSchema = z.object({
  knowledgePoints: z.array(KPDraftSchema).min(0),
  leafConfidence: z.number().min(0).max(1),
  leafReasoning: z.string().min(1).max(400),
})

export type KPExtractionOutput = z.infer<typeof KPExtractionOutputSchema>

// ============================================================
// Prompt
// ============================================================

export const KP_EXTRACTION_SYSTEM_PROMPT = `你是一名资深学科课程论 + 教育心理学专家，熟悉 Anderson & Krathwohl 修订版布鲁姆分类与中国国家课程标准。

任务：依据用户提供的**单元元分析 plan（UnitPlan）+ 教材正文**双重锚定，将该"叶子章节"切分为若干个**最小独立教学单元（KnowledgePoint, KP）**，数量由正文实际内容决定，不设上限。UnitPlan 由独立的章节级元分析阶段产出，已为该单元定义了主题、KP 类型清单、本叶子预期重点、难度区间、学科特异点——你**必须**按 plan 给出的 kpTypeCatalog 类型在正文中实际寻找对应 KP，并参考本叶子的 expectedFocus 锁定具体内容。

最高原则（违反视为失败）：
0. **KP 必须从给定正文中实际讲授的内容拆解，严禁仅凭叶子标题臆测**。正文里没有实质展开的概念，不要硬造成 KP。
   - 若用户提供了【教材正文】：以正文为唯一权威依据，逐概念抽取；每个 KP 的 learningObjectives / misconceptions / prerequisites 都应能在正文找到落点。
   - 若用户标注【⚠️无教材正文，仅有标题】：只能据标题与关联资源粗略推测，此时**所有 KP 的 confidence 与 leafConfidence 必须 ≤ 0.4**，且每个 reasoning 必须含"仅据标题推测"字样。

【plan-driven 抽取规则（最高优先）】
用户提供的【UnitPlan】定义了本叶子所属单元的：
  · unitTheme       单元主题
  · kpTypeCatalog   本单元应抽取的 KP 类型清单（按本单元教材实际内容定）
  · subjectFocus    本学科本学段在本单元的特异点
  · difficultyAnchor 本单元难度区间 [low, high]
  · leafExpectedFocus 本叶子预期教学重点（一句话）
  · leafDifficultyEstimate 本叶子难度估值

抽取时必须：
1. **以 kpTypeCatalog 为 KP 类型候选清单**：从教材正文实际讲授的内容里，识别与 catalog 类型对应的具体 KP。catalog 没列出的类型一般不要抽（除非正文确实讲了且 catalog 遗漏）。
2. **以 leafExpectedFocus 为本叶子的内容锁定**：KP 必须落在 expectedFocus 所描述的内容上；正文展开多少，就抽多少；不为凑数硬切。
3. **canonicalName 必须用 kpTypeCatalog 的同源规范术语**——参考类型名给出更具体的术语（如 catalog "声母认读" → 具体 KP "声母 b p m f 的认读"；catalog "笔画笔顺" → "横、竖、撇、捺四个基本笔画的名称与书写"），不要用"借助图画阅读""学习生字"这类笼统话术。
4. **difficulty 在 difficultyAnchor 区间内**取值，参考 leafDifficultyEstimate。
5. **若教材正文缺失（仅有标题）**：仍可参考 plan 给出预期 KP，但所有 confidence 和 leafConfidence 必须 ≤ 0.4，reasoning 标注"仅据 plan + 标题推测"。

切分原则（严格执行）：
1. 每个 KP 必须满足三独立：(a) 独立的学习目标 (b) 独立的前置依赖 (c) 独立的练习可设计
2. 单一概念叶子（如"自由落体运动""摩擦力"）→ 输出 1 个 KP
3. 标题含"与/和"等明显多概念（如"力的合成和分解"）→ 每个独立子概念切 1 个 KP，有几个切几个
4. **活动/实验/探究类叶子**（标题含"实验/学生实验/活动/探究/调查/制作/小结/复习/练习/章末"等）→ 输出 0 或 1 个 KP，**每个 KP 的 confidence 必须 ≤ 0.4，leafConfidence 也必须 ≤ 0.4**；且 reasoning 字段中**必须出现**"实验"/"活动"/"探究"/"复习"等关键词以解释为何 confidence 低（缺该关键词视为失败）
5. canonicalName 用本课程体系内的中文规范名（如"牛顿第二定律"）
6. canonicalNameEn 用**通用学术英文名词短语，首字母大写**（Title Case，如 "Newton's Second Law"、"Free Fall Motion"）。**禁止**全大写（"NEWTON'S SECOND LAW"）或全小写（"newton's second law"），违反视为失败
7. aliases 列出该 KP 在其他教材/口语下的别名（中文，可为空数组）
8. **6 维直接放 KP 顶层**（不要嵌套到 dimensions 对象内）：
   - knowledgeType: factual | conceptual | procedural | metacognitive
   - difficulty: [0,1] 浮点（小学低段 0.1~0.3 / 初中 0.3~0.6 / 高中 0.5~0.9）
   - learningObjectives: 1~6 条中文短句，必须用可直接观察、可检核的学生行为开头（如“能解释…/会用…/能识别…/能画出…/能操作…”）；禁止只写“了解/理解/知道/认识/熟悉/掌握/识记”
   - prerequisites: 0~8 条前置 KP 的 canonicalName（同体系内中文名；无则 []）
   - misconceptions: 0~6 条常见学生误解（中文短句）
   - assessability: [0,1] 该 KP 适合命题考查的程度
9. confidence: [0,1]——该 KP 抽取本身的把握度
10. reasoning: ≤120 中文字，说明为何这样切
11. **不要**输出 subject / curriculumSystem / gradeBand 字段——这些由调用方从上下文注入

输出契约（严格）：
- 单一 JSON 对象，**绝对**不带 markdown 代码块包裹，不带任何额外文字
- **JSON 字符串值内出现的双引号必须用反斜杠转义为 \\"**（例：\`"reasoning": "学生易误以为 \\"重的物体落得更快\\""\`）；未转义的裸双引号会破坏 JSON 解析，视为失败
- 顶层字段：knowledgePoints (KPDraft 数组), leafConfidence (0~1), leafReasoning (≤200 中文字)
- 每个 KPDraft 必须含且仅含这些字段（**6 维全部扁平**，不要嵌 dimensions）：
  canonicalName, canonicalNameEn, aliases,
  knowledgeType, difficulty, learningObjectives, prerequisites, misconceptions, assessability,
  confidence, reasoning
- 数值用 number，不要字符串
- 任何字段缺失或类型错误都视为失败

JSON 示例（1 个 KP，注意 6 维平铺）：
{
  "knowledgePoints": [
    {
      "canonicalName": "自由落体运动",
      "canonicalNameEn": "Free Fall",
      "aliases": ["自由下落"],
      "knowledgeType": "conceptual",
      "difficulty": 0.55,
      "learningObjectives": ["能解释自由落体的判定条件", "会用 v=gt 计算瞬时速度"],
      "prerequisites": ["匀变速直线运动"],
      "misconceptions": ["重的物体落得更快"],
      "assessability": 0.85,
      "confidence": 0.9,
      "reasoning": "单一概念叶子，按规则 2 输出 1 个 KP"
    }
  ],
  "leafConfidence": 0.9,
  "leafReasoning": "标题为单一概念，输出 1 个 KP"
}`

/** 注入 prompt 的正文上限：超出截断，避免单次请求过大 */
const MAX_BODY_CHARS = 10000

export function buildKPExtractionPrompt(ctx: AnnotationContext, curriculumSystem: string): string {
  const lessons =
    ctx.linkedLessonTitles.length > 0
      ? ctx.linkedLessonTitles.slice(0, 5).map((t, i) => `  ${i + 1}. ${t}`).join('\n')
      : '  （无）'
  const ancestors = ctx.ancestorTitles.length > 0 ? ctx.ancestorTitles.join(' › ') : '（顶层）'
  const body = ctx.chapterBodyText?.trim()
  const bodyBlock = body
    ? `【教材正文】（KP 必须落在正文实际讲授的内容上）：
${body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) + '\n…（正文过长，已截断）' : body}`
    : '【⚠️无教材正文，仅有标题】：本叶子未取到教材正文，confidence 与 leafConfidence 必须 ≤ 0.4，reasoning 须含"仅据 plan + 标题推测"。'
  const planBlock = ctx.unitPlan
    ? `【UnitPlan · 本叶子所属单元的章节级元分析】（按此 plan 锚定 KP 类型 / 学科特异点 / 难度区间）：
单元主题：${ctx.unitPlan.unitTheme}
KP 类型清单（kpTypeCatalog）：
${ctx.unitPlan.kpTypeCatalog.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}
学科特异点：${ctx.unitPlan.subjectFocus}
难度区间：[${ctx.unitPlan.difficultyAnchor[0]}, ${ctx.unitPlan.difficultyAnchor[1]}]
本叶子预期重点（leafExpectedFocus）：${ctx.unitPlan.leafExpectedFocus ?? '（plan 未列出）'}
本叶子难度估值（leafDifficultyEstimate）：${ctx.unitPlan.leafDifficultyEstimate ?? '（plan 未列出）'}`
    : '【⚠️UnitPlan 缺失】：本叶子所属单元未做章节级元分析，请仅据正文按学科与学段规范术语谨慎抽取。'
  return `教材：${ctx.textbookTitle}
学科：${ctx.subject}
学段：${ctx.stage}
课程体系：${curriculumSystem}
章节路径：${ancestors}
叶子标题：${ctx.chapterTitle}
关联国家课资源标题：
${lessons}

${planBlock}

${bodyBlock}

请按 system 指令输出 JSON（严格按 KP_EXTRACTION_SYSTEM_PROMPT 的 6 维平铺契约）。`
}

// ============================================================
// Annotator factory
// ============================================================

export interface KnowledgePointExtractionAnnotatorOptions {
  model?: string
  version?: string
  /** 课程体系标识，注入 EnrichedKPDraft.curriculumSystem */
  curriculumSystem?: string
  /** 学段→gradeBand 映射（可选），如 'senior-high'；不传则从 ctx.stage 透传 */
  gradeBand?: string
}

/**
 * 将扁平 KPDraft + ctx 转成 EnrichedKPDraft（注入 ctx + 6 维 reshape 成 Annotation 容器）。
 */
function enrichKPDraft(
  draft: KPDraft,
  ctx: AnnotationContext,
  curriculumSystem: string,
  gradeBand: string | undefined,
  model: string,
  version: string,
  labeledAt: number,
): EnrichedKPDraft {
  const mkAnn = <T>(value: T): Annotation<T> => ({
    value,
    source: 'llm',
    confidence: draft.confidence,
    labeledAt,
    annotatorName: 'knowledge-point-extraction',
    annotatorVersion: version,
    model,
  })
  const enriched: EnrichedKPDraft = {
    canonicalName: draft.canonicalName,
    canonicalNameEn: draft.canonicalNameEn,
    aliases: draft.aliases,
    subject: ctx.subject,
    curriculumSystem,
    dimensions: {
      knowledgeType: mkAnn<KnowledgeType>(draft.knowledgeType),
      difficulty: mkAnn<number>(draft.difficulty),
      learningObjectives: mkAnn<string[]>(draft.learningObjectives),
      prerequisites: mkAnn<string[]>(draft.prerequisites),
      misconceptions: mkAnn<string[]>(draft.misconceptions),
      assessability: mkAnn<number>(draft.assessability),
    },
    confidence: draft.confidence,
    reasoning: draft.reasoning,
  }
  if (gradeBand !== undefined) enriched.gradeBand = gradeBand
  return enriched
}

export function createKnowledgePointExtractionAnnotator(
  opts: KnowledgePointExtractionAnnotatorOptions = {},
): Annotator<EnrichedKPDraft[]> {
  const model = opts.model ?? 'claude-cli:haiku'
  const version = opts.version ?? 'v0.4.0'
  const curriculumSystem = opts.curriculumSystem ?? 'pep-cn'
  const gradeBandOpt = opts.gradeBand

  return {
    key: 'knowledgePointIds',
    name: 'knowledge-point-extraction',
    version,
    model,
    async annotate(ctx, deps): Promise<{
      annotation: Annotation<EnrichedKPDraft[]>
      stats: { promptChars: number; completionChars: number }
    }> {
      const prompt = buildKPExtractionPrompt(ctx, curriculumSystem)
      const callArgs: { prompt: string; system: string; model: string; apiKey: string; baseURL?: string } = {
        prompt,
        system: KP_EXTRACTION_SYSTEM_PROMPT,
        model: deps.model,
        apiKey: deps.apiKey,
      }
      if (deps.baseURL !== undefined) callArgs.baseURL = deps.baseURL
      const raw = await deps.llmCall(callArgs)
      // 调试桥接：把最近一次 raw 暴露给 dry-run 脚本（生产路径无副作用）
      ;(globalThis as { __lastKpRaw?: string }).__lastKpRaw = raw
      let parsed: unknown
      try { parsed = extractJSON(raw) }
      catch (e) {
        // 落盘失败 raw 供诊断
        try {
          const { mkdirSync, writeFileSync } = await import('node:fs')
          const dir = 'data/kp-extract-failures'
          mkdirSync(dir, { recursive: true })
          const fname = `${dir}/${ctx.chapterId.slice(0,8)}-${Date.now()}.txt`
          writeFileSync(fname, `[error] ${(e as Error).message}\n[leaf] ${ctx.chapterTitle}\n[raw len] ${raw.length}\n---RAW---\n${raw}`, 'utf8')
        } catch { /* ignore */ }
        throw e
      }
      const validated = KPExtractionOutputSchema.parse(parsed)
      const labeledAt = Date.now()
      const gradeBand = gradeBandOpt ?? ctx.stage
      const enriched = validated.knowledgePoints.map((kp) =>
        enrichKPDraft(kp, ctx, curriculumSystem, gradeBand, deps.model, version, labeledAt),
      )
      const annotation: Annotation<EnrichedKPDraft[]> = {
        value: enriched,
        source: 'llm',
        confidence: validated.leafConfidence,
        labeledAt,
        annotatorName: 'knowledge-point-extraction',
        annotatorVersion: version,
        model: deps.model,
        reasoning:
          `[KP=${enriched.length}] ` +
          validated.leafReasoning.slice(0, 180),
      }
      return {
        annotation,
        stats: {
          promptChars: KP_EXTRACTION_SYSTEM_PROMPT.length + prompt.length,
          completionChars: raw.length,
        },
      }
    },
  }
}

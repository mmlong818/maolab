/**
 * KnowledgeTypeAnnotator — 给章节叶子节点标 Anderson & Krathwohl 知识维度
 *
 * 输出字段：annotations.knowledgeType
 * 版本约定：升级 prompt / system 文本 / 类型集合 → bump version
 */

import { z } from 'zod'
import type { Annotation, KnowledgeType } from '../tree-types.js'
import type { Annotator, AnnotationContext } from '../annotation-pipeline.js'

export const KNOWLEDGE_TYPES: KnowledgeType[] = [
  'factual', 'conceptual', 'procedural', 'metacognitive',
]

export const KnowledgeTypeOutputSchema = z.object({
  knowledgeType: z.enum(['factual', 'conceptual', 'procedural', 'metacognitive']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(500),
})

export const KNOWLEDGE_TYPE_SYSTEM_PROMPT = `你是一名资深课程论与教育心理学专家，熟悉 Anderson & Krathwohl (2001) 修订版布鲁姆分类。

你的任务：根据中国 K12 教材的章节标题及其上下文，判断该章节主要承载的"知识维度"，从以下四类中选一：

- factual（事实性知识）：术语、具体细节、字词、人名、地名、年代、公式名称、符号——可以"记住"的离散信息。
- conceptual（概念性知识）：分类、原理、模型、理论、概念体系之间的关系——可以"理解"的结构化知识。
- procedural（程序性知识）：算法、技能、方法步骤、特定学科技巧、判断使用条件——可以"做出来"的操作流程。
- metacognitive（元认知知识）：认知策略、自我反思、学习方法、迁移判断、问题解决策略——关于"如何学/如何思考"的知识。

判断要点：
1. 一节课往往多类共存，选"占主导"的那一类
2. 题目带"认识/了解/知道/记住"倾向 factual
3. 带"理解/解释/分析/为什么"倾向 conceptual
4. 带"会做/计算/操作/步骤/学会"倾向 procedural
5. 带"反思/评价/迁移/策略/学习方法"倾向 metacognitive
6. 标题极短或泛指（如"复习""练习""单元小结"）默认 factual + 低置信度
7. 综合实践 / 项目学习 多为 procedural 或 metacognitive

输出要求：严格输出单个 JSON 对象，不要 markdown 代码块包裹，不要任何额外文字。
JSON 字段：
{
  "knowledgeType": "factual" | "conceptual" | "procedural" | "metacognitive",
  "confidence": number,  // 0~1
  "reasoning": string    // 不超过 80 字的中文判断依据
}`

export function buildKnowledgeTypePrompt(ctx: AnnotationContext): string {
  const lessons =
    ctx.linkedLessonTitles.length > 0
      ? ctx.linkedLessonTitles.slice(0, 3).map((t, i) => `  ${i + 1}. ${t}`).join('\n')
      : '  （无）'
  const ancestors = ctx.ancestorTitles.length > 0 ? ctx.ancestorTitles.join(' › ') : '（顶层）'
  return `学科：${ctx.subject}
学段：${ctx.stage}
章节路径：${ancestors}
章节标题：${ctx.chapterTitle}
关联的国家课资源标题：
${lessons}

请输出 JSON。`
}

export function extractJSON(text: string): unknown {
  let s = text.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    return JSON.parse(s)
  } catch (e) {
    // 兜底: claude-cli 输出常见有未转义内联双引号,用 jsonrepair 修
    try {
      // 动态 import 避免 cycle / 服务端构建打包问题
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { jsonrepair } = require('jsonrepair') as { jsonrepair: (t: string) => string }
      return JSON.parse(jsonrepair(s))
    } catch {
      throw e
    }
  }
}

export interface KnowledgeTypeAnnotatorOptions {
  model?: string
  version?: string
}

export function createKnowledgeTypeAnnotator(
  opts: KnowledgeTypeAnnotatorOptions = {},
): Annotator<KnowledgeType> {
  const model = opts.model ?? 'anthropic:claude-haiku-4-5-20251001'
  const version = opts.version ?? 'v1.0.0'
  return {
    key: 'knowledgeType',
    name: 'knowledge-type',
    version,
    model,
    async annotate(ctx, deps): Promise<{ annotation: Annotation<KnowledgeType>; stats: { promptChars: number; completionChars: number } }> {
      const prompt = buildKnowledgeTypePrompt(ctx)
      const callArgs: { prompt: string; system: string; model: string; apiKey: string; baseURL?: string } = {
        prompt,
        system: KNOWLEDGE_TYPE_SYSTEM_PROMPT,
        model: deps.model,
        apiKey: deps.apiKey,
      }
      if (deps.baseURL !== undefined) callArgs.baseURL = deps.baseURL
      const raw = await deps.llmCall(callArgs)
      const parsed = extractJSON(raw)
      const validated = KnowledgeTypeOutputSchema.parse(parsed)
      const annotation: Annotation<KnowledgeType> = {
        value: validated.knowledgeType,
        source: 'llm',
        confidence: validated.confidence,
        labeledAt: Date.now(),
        annotatorName: 'knowledge-type',
        annotatorVersion: version,
        model: deps.model,
        reasoning: validated.reasoning,
      }
      return {
        annotation,
        stats: {
          promptChars: KNOWLEDGE_TYPE_SYSTEM_PROMPT.length + prompt.length,
          completionChars: raw.length,
        },
      }
    },
  }
}

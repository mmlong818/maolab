import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import type { CurriculumDesignResult } from './types.js'
import { resolveTeachingMode } from '@maolab/shared-types'
import { classifyBloomLevel, validateBloomProgression } from './bloom-keywords.js'
import type { BloomLevel } from './bloom-keywords.js'
import { checkReadability } from './readability.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LLMConfig {
  apiKey: string
  model: string
  baseURL?: string
}

const VALID_TEACHING_MODE_IDS = [
  'lecture-image',
  'lecture-diagram',
  'lecture-animation',
  'interactive-drag',
  'interactive-quiz',
  'socratic-dialogue',
] as const

/** TEACHING_MODE → 兼容旧 sceneType（用于向 SceneWorker dispatching） */
const MODE_TO_SCENE_TYPE: Record<string, 'image' | 'slide' | 'animation' | 'drag-drop' | 'quiz' | 'branching'> = {
  'lecture-image': 'image',
  'lecture-diagram': 'slide',
  'lecture-animation': 'animation',
  'interactive-drag': 'drag-drop',
  'interactive-quiz': 'quiz',
  'socratic-dialogue': 'branching',
}

const OutlineItemSchema = z.object({
  title: z.string().min(1),
  /**
   * 新管线必填：从 TEACHING_MODES 注册表选 1 个，决定该场景的 "老师+媒介+学生参与" 组合。
   * 旧字段 sceneType 由 teachingModeId 推导（向后兼容 stage 表与 ContentWorker dispatching）。
   */
  teachingModeId: z.enum(VALID_TEACHING_MODE_IDS),
  objective: z.string().min(1),
  durationHint: z.number().positive(),
  rationale: z.string().min(1),
  /** Concepts taught by this scene — used for library retrieval and reuse. */
  concepts: z.array(z.string().min(1)).min(1).max(6).optional(),
})

const CurriculumDesignSchema = z.object({
  topic: z.string().min(1),
  targetAudience: z.string().min(1),
  language: z.string().min(1),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  knowledgeAnalysis: z.object({
    primaryType: z.enum(['factual', 'conceptual', 'procedural', 'metacognitive']),
    bloomsLevel: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']).optional().catch(undefined),
    reasoning: z.string().min(1),
  }),
  outline: z.array(OutlineItemSchema).min(4).max(8),
  totalDurationHint: z.number().positive(),
  reasoning: z.string().min(1),
})

export class CurriculumDesigner {
  private readonly template: string

  constructor(private readonly llm: LLMConfig) {
    this.template = readFileSync(
      join(__dirname, 'prompts', 'curriculum-design.md'),
      'utf-8',
    )
  }

  protected buildPrompt(topic: string, targetAudience: string, language: string, context = ''): string {
    return this.template
      .replace('{{topic}}', topic)
      .replace('{{targetAudience}}', targetAudience)
      .replace('{{language}}', language)
      .replace('{{context}}', context || 'none')
  }

  async design(
    topic: string,
    targetAudience: string,
    language: string,
    context?: string,
  ): Promise<CurriculumDesignResult> {
    const prompt = this.buildPrompt(topic, targetAudience, language, context)
    const baseURL = (this.llm.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)

    let response: Response
    try {
      response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.llm.apiKey}`,
        },
        body: JSON.stringify({
          model: this.llm.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`CurriculumDesigner: LLM API error ${response.status}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content
    if (!content) {
      throw new Error('CurriculumDesigner: LLM returned empty choices')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error(`CurriculumDesigner: invalid JSON response: ${content.slice(0, 100)}`)
    }

    let validated: z.infer<typeof CurriculumDesignSchema>
    try {
      validated = CurriculumDesignSchema.parse(parsed)
    } catch (err) {
      throw new Error(`CurriculumDesigner: invalid response schema: ${err}`)
    }
    const bloomsLevel: BloomLevel =
      validated.knowledgeAnalysis.bloomsLevel ??
      classifyBloomLevel(validated.knowledgeAnalysis.reasoning)

    const outlineBloomLevels = validated.outline.map(item =>
      classifyBloomLevel(item.objective),
    )
    const progressionIssues = validateBloomProgression(outlineBloomLevels, validated.difficulty)
    for (const issue of progressionIssues) {
      console.warn(`[CurriculumDesigner] Bloom progression warning: ${issue.message}`)
    }

    const readabilityResult = checkReadability(validated.reasoning, validated.difficulty)
    if (!readabilityResult.fits && readabilityResult.message) {
      console.warn(`[CurriculumDesigner] Readability warning: ${readabilityResult.message}`)
    }

    // Zod enum for sceneType is a subset of SceneContentType; inferred type is assignable without cast
    // A1.2: 规则覆写 — teachingModeId 由 resolveTeachingMode(primaryType, hasPriorScaffold) 决定，
    // LLM 在 outline 中给的 teachingModeId 仅作 prompt context，最终以服务端规则为准。
    const primaryType = validated.knowledgeAnalysis.primaryType
    return {
      ...validated,
      outline: validated.outline.map((item, index) => {
        const resolvedModeId = primaryType
          ? resolveTeachingMode(primaryType, index > 0).modeId
          : item.teachingModeId
        return {
          title: item.title,
          teachingModeId: resolvedModeId,
          sceneType: MODE_TO_SCENE_TYPE[resolvedModeId] ?? 'image',
          objective: item.objective,
          durationHint: item.durationHint,
          rationale: item.rationale,
          ...(item.concepts ? { concepts: item.concepts } : {}),
        }
      }),
      knowledgeAnalysis: {
        ...validated.knowledgeAnalysis,
        bloomsLevel,
      },
    }
  }
}

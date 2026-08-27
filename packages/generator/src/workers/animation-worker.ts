import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const AnimationMetaSchema = z.object({
  title: z.string().min(1),
  speakerNote: z.string().min(1),
  stepLabels: z.array(z.string().min(1)).min(2).max(6),
  stepDescriptions: z.array(z.string().min(1)).min(2).max(6),
}).refine(
  d => d.stepLabels.length === d.stepDescriptions.length,
  { message: 'stepLabels and stepDescriptions must have same length' },
)

export class AnimationWorker implements ContentWorker {
  readonly type = 'animation' as const

  constructor(
    private readonly callLLMJson: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
    private readonly callLLMFreeform?: (userPrompt: string, systemPrompt?: string) => Promise<string>,
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system: metaSystem, user: metaUser } = buildPrompt(PROMPT_IDS.ANIMATION_META, {
      topic: profile.topic,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      language: plan.language,
    })

    const meta = await validatedGenerate(
      metaUser,
      AnimationMetaSchema,
      p => this.callLLMJson(p, metaSystem),
      this.retryOptions,
    )

    const callFrame = this.callLLMFreeform ?? this.callLLMJson
    const svgFrames: string[] = []

    for (let i = 0; i < meta.stepLabels.length; i++) {
      const { system: frameSystem, user: frameUser } = buildPrompt(PROMPT_IDS.ANIMATION_FRAME, {
        topic: profile.topic,
        title: item.title,
        stepIndex: String(i + 1),
        totalSteps: String(meta.stepLabels.length),
        stepLabel: meta.stepLabels[i] ?? '',
        stepDescription: meta.stepDescriptions[i] ?? '',
        previousSteps: meta.stepLabels.slice(0, i).join(' → ') || 'none',
        language: plan.language,
      })

      const svg = await callFrame(frameUser, frameSystem)
      svgFrames.push(svg.trim())
    }

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'animation',
      title: meta.title,
      content: {
        type: 'animation',
        title: meta.title,
        speakerNote: meta.speakerNote,
        steps: meta.stepLabels.map((label, i) => ({
          id: `step-${i}`,
          label,
          description: meta.stepDescriptions[i] ?? '',
          svgFrame: svgFrames[i] ?? '',
        })),
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

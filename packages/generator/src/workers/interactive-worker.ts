import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate, LLMOutputValidationError } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const ScientificModelSchema = z.object({
  core_formulas: z.array(z.string()).min(1),
  mechanism: z.array(z.string()).min(1),
  constraints: z.array(z.string()).min(1),
  forbidden_errors: z.array(z.string()).min(1),
})

type ScientificModel = z.infer<typeof ScientificModelSchema>

export class InteractiveWorker implements ContentWorker {
  readonly type = 'interactive' as const

  constructor(
    private readonly callLLMJson: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
    private readonly callLLMFreeform?: (userPrompt: string, systemPrompt?: string) => Promise<string>,
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const model = await this.extractScientificModel(item, profile, plan)
    const html = await this.generateHtml(item, profile, plan, model)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'interactive',
      title: item.title,
      content: {
        type: 'interactive',
        html,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }

  private async extractScientificModel(
    item: OutlineItem,
    profile: KnowledgeProfile,
    plan: TeachingPlan,
  ): Promise<ScientificModel> {
    const { system, user } = buildPrompt(PROMPT_IDS.INTERACTIVE_MODEL, {
      language: plan.language,
      topic: profile.topic,
      domain: profile.domain,
      title: item.title,
      objective: item.objective,
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      analogies: profile.analogies.join('; '),
    })

    const boundCall = (prompt: string) => this.callLLMJson(prompt, system)
    return validatedGenerate(user, ScientificModelSchema, boundCall, this.retryOptions)
  }

  private async generateHtml(
    item: OutlineItem,
    profile: KnowledgeProfile,
    plan: TeachingPlan,
    model: ScientificModel,
  ): Promise<string> {
    const { system, user } = buildPrompt(PROMPT_IDS.INTERACTIVE_HTML, {
      language: plan.language,
      teachingMethod: plan.teachingMethod,
      difficulty: profile.difficulty,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      coreFormulas: model.core_formulas.join(' | '),
      mechanism: model.mechanism.join(' → '),
      constraints: model.constraints.join('; '),
      forbiddenErrors: model.forbidden_errors.join('; '),
    })

    const callHtml = this.callLLMFreeform ?? this.callLLMJson
    let lastRaw = ''
    for (let attempt = 0; attempt < this.retryOptions.maxRetries; attempt++) {
      lastRaw = await callHtml(user, system)
      if (lastRaw.trim().length > 0) return lastRaw.trim()
      if (this.retryOptions.baseDelay > 0) {
        await new Promise(r => setTimeout(r, this.retryOptions.baseDelay * Math.pow(2, attempt)))
      }
    }

    throw new LLMOutputValidationError(
      `HTML generation failed after ${this.retryOptions.maxRetries} retries`,
      lastRaw,
      this.retryOptions.maxRetries,
    )
  }
}

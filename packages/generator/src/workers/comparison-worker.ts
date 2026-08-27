import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import { buildReferenceMaterial } from '../pipeline/find-chapter.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const ComparisonOutputSchema = z.object({
  title: z.string().min(1),
  speakerNote: z.string().min(1),
  leftTitle: z.string().min(1),
  rightTitle: z.string().min(1),
  rows: z.array(z.object({
    attribute: z.string().min(1),
    left: z.string().min(1),
    right: z.string().min(1),
    isDifference: z.boolean(),
  })).min(3).max(10),
})

export class ComparisonWorker implements ContentWorker {
  readonly type = 'comparison' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system, user } = buildPrompt(PROMPT_IDS.COMPARISON, {
      topic: profile.topic,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      language: plan.language,
    })

    const reference = buildReferenceMaterial(item, plan)
    const finalUser = reference ? user + reference : user

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const output = await validatedGenerate(finalUser, ComparisonOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'comparison',
      title: output.title,
      content: {
        type: 'comparison',
        title: output.title,
        speakerNote: output.speakerNote,
        leftTitle: output.leftTitle,
        rightTitle: output.rightTitle,
        rows: output.rows,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

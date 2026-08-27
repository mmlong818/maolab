import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const Model3dOutputSchema = z.object({
  title: z.string().min(1),
  speakerNote: z.string().min(1),
  description: z.string().min(1),
  modelUrl: z.string(),
  motionProfile: z.enum(['road', 'aircraft', 'vessel', 'specimen', 'product', 'orbit']),
})

export class Model3dWorker implements ContentWorker {
  readonly type = 'model-3d' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system, user } = buildPrompt(PROMPT_IDS.MODEL3D, {
      topic: profile.topic,
      domain: profile.domain,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      gradeLevel: plan.gradeLevel ?? 'not specified',
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      language: plan.language,
    })

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const output = await validatedGenerate(user, Model3dOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'model-3d',
      title: output.title,
      content: {
        type: 'model-3d',
        title: output.title,
        speakerNote: output.speakerNote,
        description: output.description,
        modelUrl: output.modelUrl,
        motionProfile: output.motionProfile,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

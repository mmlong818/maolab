import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const HotspotOutputSchema = z.object({
  title: z.string().min(1),
  speakerNote: z.string().min(1),
  svgDiagram: z.string().min(10),
  hotspots: z.array(z.object({
    id: z.string().min(1),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    label: z.string().min(1),
    description: z.string().min(1),
  })).min(2).max(8),
})

export class HotspotWorker implements ContentWorker {
  readonly type = 'hotspot' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system, user } = buildPrompt(PROMPT_IDS.HOTSPOT, {
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
    const output = await validatedGenerate(user, HotspotOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'hotspot',
      title: output.title,
      content: {
        type: 'hotspot',
        svgDiagram: output.svgDiagram,
        title: output.title,
        speakerNote: output.speakerNote,
        hotspots: output.hotspots,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

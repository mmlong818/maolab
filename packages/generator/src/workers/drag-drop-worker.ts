import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const DragDropOutputSchema = z.object({
  instruction: z.string().min(1),
  speakerNote: z.string().min(1),
  items: z.array(z.object({ id: z.string(), text: z.string().min(1) })).min(2).max(10),
  targets: z.array(z.object({ id: z.string(), label: z.string().min(1) })).min(2).max(6),
  matches: z.record(z.string(), z.string()),
}).refine(
  data => data.items.every(item => item.id in data.matches),
  { message: 'Every item must have a match' },
)

export class DragDropWorker implements ContentWorker {
  readonly type = 'drag-drop' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system, user } = buildPrompt(PROMPT_IDS.DRAG_DROP, {
      topic: profile.topic,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      language: plan.language,
    })

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const output = await validatedGenerate(user, DragDropOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'drag-drop',
      title: item.title,
      content: {
        type: 'drag-drop',
        instruction: output.instruction,
        speakerNote: output.speakerNote,
        items: output.items,
        targets: output.targets,
        matches: output.matches,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

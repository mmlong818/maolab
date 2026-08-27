import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import { buildReferenceMaterial } from '../pipeline/find-chapter.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan, ClozeContent } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const SegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1) }),
  z.object({ kind: z.literal('blank'), id: z.string().min(1), answer: z.string().min(1), hint: z.string().optional() }),
])

const ClozeOutputSchema = z.object({
  instruction: z.string().min(1),
  speakerNote: z.string().min(1),
  segments: z.array(SegmentSchema).min(3),
}).refine(
  data => data.segments.some(s => s.kind === 'blank'),
  { message: 'Must have at least one blank' },
)

export class ClozeWorker implements ContentWorker {
  readonly type = 'cloze' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system, user } = buildPrompt(PROMPT_IDS.CLOZE, {
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
    const output = await validatedGenerate(finalUser, ClozeOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'cloze',
      title: item.title,
      content: {
        type: 'cloze',
        instruction: output.instruction,
        speakerNote: output.speakerNote,
        segments: output.segments as ClozeContent['segments'],
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

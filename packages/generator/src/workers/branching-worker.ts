import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan, BranchingContent } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const BranchingNodeSchema = z.object({
  type: z.enum(['situation', 'consequence', 'end']),
  text: z.string().min(1),
  choices: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    nextNodeId: z.string().min(1),
    isCorrect: z.boolean().optional(),
  })).default([]),
  feedback: z.string().optional(),
})

const BranchingOutputSchema = z.object({
  title: z.string().min(1),
  speakerNote: z.string().min(1),
  startNodeId: z.string().min(1),
  nodes: z.record(z.string(), BranchingNodeSchema),
}).refine(
  d => d.startNodeId in d.nodes,
  { message: 'startNodeId must reference an existing node' },
)

export class BranchingWorker implements ContentWorker {
  readonly type = 'branching' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const { system, user } = buildPrompt(PROMPT_IDS.BRANCHING, {
      topic: profile.topic,
      domain: profile.domain,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      teachingStyle: plan.style,
      language: plan.language,
    })

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const output = await validatedGenerate(user, BranchingOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'branching',
      title: output.title,
      content: {
        type: 'branching',
        title: output.title,
        speakerNote: output.speakerNote,
        startNodeId: output.startNodeId,
        nodes: output.nodes as BranchingContent['nodes'],
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

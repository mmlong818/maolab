import { z } from 'zod'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { KnowledgeProfile } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const ConceptSchema = z.object({
  name: z.string(),
  desc: z.string(),
})

const KnowledgeProfileSchema = z.object({
  topic: z.string(),
  domain: z.string(),
  difficulty: z.string(),
  coreConcepts: z.array(ConceptSchema).min(1),
  causalChain: z.array(z.string()).min(1),
  misconceptions: z.array(z.string()),
  narrativeHooks: z.array(z.string()),
  analogies: z.array(z.string()),
  keyFigures: z.array(z.string()),
  emphasizedConcepts: z.array(z.string()),
  prerequisites: z.array(z.string()).optional(),
})

export interface ExtractOptions {
  topic: string
  domain: string
  difficulty: string
  emphasizedConcepts: string[]
}

export class KnowledgeProfileExtractor {
  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async extract(opts: ExtractOptions): Promise<KnowledgeProfile> {
    const { system, user } = buildPrompt(PROMPT_IDS.EXTRACT_KNOWLEDGE, {
      topic: opts.topic,
      domain: opts.domain,
      difficulty: opts.difficulty,
      emphasizedConcepts: opts.emphasizedConcepts.join(', ') || 'none',
    })

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const raw = await validatedGenerate(user, KnowledgeProfileSchema, boundCall, this.retryOptions)
    const { prerequisites, ...rest } = raw
    if (prerequisites !== undefined) {
      return { ...rest, prerequisites }
    }
    return rest
  }
}

import { z } from 'zod'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const ObjectivesSchema = z.object({
  objectives: z.array(z.string().min(1)).min(1).max(7),
})

export async function generateObjectives(
  item: OutlineItem,
  profile: KnowledgeProfile,
  plan: TeachingPlan,
  callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
  retryOptions: RetryOptions = { maxRetries: 2, baseDelay: 0 },
): Promise<string[]> {
  const { system, user } = buildPrompt(PROMPT_IDS.OBJECTIVES, {
    title: item.title,
    objective: item.objective,
    gradeLevel: plan.gradeLevel ?? 'not specified',
    difficulty: plan.difficulty,
    domain: profile.domain,
    coreConcepts: profile.coreConcepts.map(c => c.name).join(', '),
  })

  const boundCall = (prompt: string) => callLLM(prompt, system)
  try {
    const output = await validatedGenerate(user, ObjectivesSchema, boundCall, retryOptions)
    return output.objectives
  } catch {
    // objectives are non-critical — fall back to the original objective string
    return [item.objective]
  }
}

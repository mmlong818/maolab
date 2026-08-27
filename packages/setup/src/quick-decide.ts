import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import type { LearnerProfile } from '@maolab/shared-types'
import type { QuickDecisionResult } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LLMConfig {
  apiKey: string
  model: string
  baseURL?: string
}

const QuickDecisionSchema = z.object({
  topic: z.string(),
  style: z.enum(['lecture', 'socratic', 'project']),
  language: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  agentCount: z.number().int().min(1).max(5),
  outline: z.array(z.object({
    title: z.string(),
    sceneType: z.enum(['slide', 'quiz', 'interactive', 'hotspot', 'comparison', 'drag-drop', 'cloze', 'animation', 'branching']),
    objective: z.string(),
    durationHint: z.number(),
  })).min(1),
  reasoning: z.string(),
})

export class QuickDecider {
  private readonly template: string

  constructor(private readonly llm: LLMConfig) {
    this.template = readFileSync(
      join(__dirname, 'prompts', 'quick-decide.md'),
      'utf-8',
    )
  }

  buildPrompt(
    topic: string,
    profile: LearnerProfile,
    weakConcepts: string[],
    recentHistory: string[],
    gradeLevel?: string,
  ): string {
    const gradeLevelLine = gradeLevel
      ? `**User-specified grade level:** ${gradeLevel} — treat this as a HARD constraint when setting difficulty and choosing vocabulary/examples. Do NOT generate content intended for a higher level.`
      : ''
    return this.template
      .replace('{{topic}}', topic)
      .replace('{{preferredLanguage}}', profile.preferredLanguage)
      .replace('{{preferredStyle}}', profile.preferredStyle)
      .replace('{{preferredDifficulty}}', profile.preferredDifficulty)
      .replace('{{weakConcepts}}', weakConcepts.length > 0 ? weakConcepts.join(', ') : 'none')
      .replace('{{recentHistory}}', recentHistory.length > 0 ? recentHistory.join(', ') : 'none')
      .replace('{{gradeLevelOverride}}', gradeLevelLine)
  }

  parseResult(raw: string): QuickDecisionResult {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`QuickDecider: invalid JSON: ${raw.slice(0, 100)}`)
    }
    return QuickDecisionSchema.parse(parsed)
  }

  private async fetchOnce(prompt: string): Promise<QuickDecisionResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    let response: Response
    try {
      response = await fetch(`${(this.llm.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.llm.apiKey}`,
        },
        body: JSON.stringify({
          model: this.llm.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`QuickDecider: LLM API error ${response.status}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content ?? '{}'
    return this.parseResult(content)
  }

  async decide(
    topic: string,
    profile: LearnerProfile,
    weakConcepts: string[],
    recentHistory: string[],
    gradeLevel?: string,
  ): Promise<QuickDecisionResult> {
    const prompt = this.buildPrompt(topic, profile, weakConcepts, recentHistory, gradeLevel)
    const maxRetries = 3
    let lastError: unknown
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.fetchOnce(prompt)
      } catch (err) {
        lastError = err
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)))
        }
      }
    }
    throw lastError
  }
}

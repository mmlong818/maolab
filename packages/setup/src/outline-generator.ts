import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import type { SetupConfig, OutlineChunk } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LLMConfig {
  apiKey: string
  model: string
  baseURL?: string
}

const RawChunkSchema = z.object({
  title: z.string(),
  sceneType: z.enum(['slide', 'quiz', 'interactive', 'hotspot', 'comparison', 'drag-drop', 'cloze', 'animation', 'branching', 'model-3d']).default('slide'),
  objective: z.string(),
  durationHint: z.number(),
  prerequisites: z.array(z.string()).optional(),
})

export class OutlineGenerator {
  private readonly template: string

  constructor(private readonly llm: LLMConfig) {
    this.template = readFileSync(
      join(__dirname, 'prompts', 'outline.md'),
      'utf-8',
    )
  }

  buildPrompt(config: SetupConfig, emphasizedConcepts: string[]): string {
    return this.template
      .replace('{{topic}}', config.topic)
      .replace('{{style}}', config.style)
      .replace('{{language}}', config.language)
      .replace('{{difficulty}}', config.difficulty)
      .replace('{{teachingMethod}}', config.teachingMethod)
      .replace(
        '{{emphasizedConcepts}}',
        emphasizedConcepts.length > 0 ? emphasizedConcepts.join(', ') : 'none',
      )
  }

  parseChunks(raw: string): OutlineChunk[] {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`OutlineGenerator: invalid JSON from LLM: ${raw.slice(0, 100)}`)
    }
    if (!Array.isArray(parsed)) {
      throw new Error('OutlineGenerator: Expected array from LLM')
    }
    return parsed.map((item: unknown, index: number) => {
      const { prerequisites, ...rest } = RawChunkSchema.parse(item)
      return {
        index,
        ...rest,
        ...(prerequisites !== undefined ? { prerequisites } : {}),
      }
    })
  }

  async generate(
    config: SetupConfig,
    emphasizedConcepts: string[],
  ): Promise<OutlineChunk[]> {
    const prompt = this.buildPrompt(config, emphasizedConcepts)

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
          temperature: 0.7,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`OutlineGenerator: LLM API error ${response.status}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content ?? '[]'
    return this.parseChunks(content)
  }
}

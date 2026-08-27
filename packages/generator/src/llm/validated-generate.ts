import type { z } from 'zod'

export class LLMOutputValidationError extends Error {
  constructor(
    message: string,
    public readonly lastRaw: string,
    public readonly retries: number,
  ) {
    super(message)
    this.name = 'LLMOutputValidationError'
  }
}

export interface RetryOptions {
  maxRetries: number
  baseDelay: number
}

function buildRetryPrompt(originalPrompt: string, badOutput: string, errorMsg: string): string {
  return `${originalPrompt}

---
PREVIOUS ATTEMPT ERROR:
Your previous output was invalid. ERROR: ${errorMsg}
Previous output was: ${badOutput.slice(0, 500)}

Please fix the issues and respond with valid JSON only.`
}

function tryParseJSON(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

export async function validatedGenerate<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  callLLM: (prompt: string) => Promise<string>,
  opts: RetryOptions,
): Promise<T> {
  let currentPrompt = prompt
  let lastRaw = ''

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    lastRaw = await callLLM(currentPrompt)

    let parsed: unknown
    try {
      parsed = tryParseJSON(lastRaw)
    } catch (e) {
      const msg = `Invalid JSON: ${String(e)}`
      currentPrompt = buildRetryPrompt(prompt, lastRaw, msg)
      if (opts.baseDelay > 0) await new Promise(r => setTimeout(r, opts.baseDelay * Math.pow(2, attempt)))
      continue
    }

    const result = schema.safeParse(parsed)
    if (result.success) return result.data

    const msg = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    currentPrompt = buildRetryPrompt(prompt, lastRaw, msg)
    if (opts.baseDelay > 0) await new Promise(r => setTimeout(r, opts.baseDelay * Math.pow(2, attempt)))
  }

  throw new LLMOutputValidationError(
    `LLM output validation failed after ${opts.maxRetries} retries`,
    lastRaw,
    opts.maxRetries,
  )
}

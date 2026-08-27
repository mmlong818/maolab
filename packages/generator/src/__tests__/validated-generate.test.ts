import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validatedGenerate, LLMOutputValidationError } from '../llm/validated-generate.js'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
})

describe('validatedGenerate', () => {
  it('returns parsed result on first try when LLM output is valid', async () => {
    const callLLM = vi.fn().mockResolvedValue('{"name":"Alice","age":30}')
    const result = await validatedGenerate('prompt', PersonSchema, callLLM, { maxRetries: 3, baseDelay: 0 })
    expect(result).toEqual({ name: 'Alice', age: 30 })
    expect(callLLM).toHaveBeenCalledTimes(1)
  })

  it('retries when JSON is invalid, succeeds on second try', async () => {
    const callLLM = vi.fn()
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce('{"name":"Bob","age":25}')
    const result = await validatedGenerate('prompt', PersonSchema, callLLM, { maxRetries: 3, baseDelay: 0 })
    expect(result).toEqual({ name: 'Bob', age: 25 })
    expect(callLLM).toHaveBeenCalledTimes(2)
  })

  it('retries when Zod validation fails, succeeds on third try', async () => {
    const callLLM = vi.fn()
      .mockResolvedValueOnce('{"name":"Carol","age":-1}')
      .mockResolvedValueOnce('{"name":"Carol"}')
      .mockResolvedValueOnce('{"name":"Carol","age":22}')
    const result = await validatedGenerate('prompt', PersonSchema, callLLM, { maxRetries: 3, baseDelay: 0 })
    expect(result.name).toBe('Carol')
    expect(callLLM).toHaveBeenCalledTimes(3)
  })

  it('throws LLMOutputValidationError after all retries exhausted', async () => {
    const callLLM = vi.fn().mockResolvedValue('{"name":"Dave","age":"not-a-number"}')
    await expect(
      validatedGenerate('prompt', PersonSchema, callLLM, { maxRetries: 2, baseDelay: 0 })
    ).rejects.toThrow(LLMOutputValidationError)
    expect(callLLM).toHaveBeenCalledTimes(2)
  })

  it('retry prompt contains original error context', async () => {
    const callLLM = vi.fn()
      .mockResolvedValueOnce('{"name":"Eve","age":"wrong"}')
      .mockResolvedValueOnce('{"name":"Eve","age":28}')
    await validatedGenerate('original prompt', PersonSchema, callLLM, { maxRetries: 3, baseDelay: 0 })
    const secondCall = callLLM.mock.calls[1][0] as string
    expect(secondCall).toContain('original prompt')
    expect(secondCall).toContain('ERROR')
  })
})

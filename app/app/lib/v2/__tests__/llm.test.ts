import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { callLLMJson } from '../llm.js'

const originalEnv = {
  provider: process.env.LLM_PROVIDER,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
  baseURL: process.env.LLM_BASE_URL,
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  restoreEnv('LLM_PROVIDER', originalEnv.provider)
  restoreEnv('LLM_API_KEY', originalEnv.apiKey)
  restoreEnv('LLM_MODEL', originalEnv.model)
  restoreEnv('LLM_BASE_URL', originalEnv.baseURL)
})

describe('callLLMJson', () => {
  it('把上一次 schema 校验原因反馈给下一次请求', async () => {
    vi.useFakeTimers()
    delete process.env.LLM_PROVIDER
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_MODEL = 'test-model'
    process.env.LLM_BASE_URL = 'https://example.invalid/v1'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseWithJson({ content: { title: '错误层级' } }))
      .mockResolvedValueOnce(responseWithJson({ title: '修正完成' }))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = callLLMJson<{ title: string }>({
      user: '生成一个标题对象。',
      schema: z.object({ title: z.string() }).strict(),
      maxAttempts: 2,
    })
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toEqual({ title: '修正完成' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(secondRequest.messages.at(-1)?.content).toContain('上一版输出未通过 JSON 结构校验')
    expect(secondRequest.messages.at(-1)?.content).toContain('Unrecognized key')
  })

  it('把 JSON 语法错误反馈给下一次请求', async () => {
    vi.useFakeTimers()
    delete process.env.LLM_PROVIDER
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_MODEL = 'test-model'
    process.env.LLM_BASE_URL = 'https://example.invalid/v1'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseWithRawJson('{"title":"未闭合}'))
      .mockResolvedValueOnce(responseWithJson({ title: '合法结果' }))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = callLLMJson<{ title: string }>({
      user: '生成一个标题对象。',
      schema: z.object({ title: z.string() }).strict(),
      maxAttempts: 2,
    })
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toEqual({ title: '合法结果' })
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(secondRequest.messages.at(-1)?.content).toContain('字符串引号、转义符、逗号和括号')
  })
})

function responseWithJson(value: unknown): Response {
  return responseWithRawJson(JSON.stringify(value))
}

function responseWithRawJson(content: string): Response {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

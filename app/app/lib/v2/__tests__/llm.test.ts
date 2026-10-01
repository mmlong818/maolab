import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { callLLMJson } from '../llm.js'

const originalEnv = {
  provider: process.env.LLM_PROVIDER,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
  baseURL: process.env.LLM_BASE_URL,
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
  dashscopeModel: process.env.DASHSCOPE_MODEL,
  dashscopeBaseURL: process.env.DASHSCOPE_BASE_URL,
  openAIApiKey: process.env.OPENAI_API_KEY,
  openAIModel: process.env.OPENAI_MODEL,
  openAIBaseURL: process.env.OPENAI_BASE_URL,
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  restoreEnv('LLM_PROVIDER', originalEnv.provider)
  restoreEnv('LLM_API_KEY', originalEnv.apiKey)
  restoreEnv('LLM_MODEL', originalEnv.model)
  restoreEnv('LLM_BASE_URL', originalEnv.baseURL)
  restoreEnv('DASHSCOPE_API_KEY', originalEnv.dashscopeApiKey)
  restoreEnv('DASHSCOPE_MODEL', originalEnv.dashscopeModel)
  restoreEnv('DASHSCOPE_BASE_URL', originalEnv.dashscopeBaseURL)
  restoreEnv('OPENAI_API_KEY', originalEnv.openAIApiKey)
  restoreEnv('OPENAI_MODEL', originalEnv.openAIModel)
  restoreEnv('OPENAI_BASE_URL', originalEnv.openAIBaseURL)
})

describe('callLLMJson', () => {
  it('不会把 OPENAI_API_KEY 发送到默认 DashScope 地址', async () => {
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_API_KEY
    delete process.env.LLM_MODEL
    delete process.env.LLM_BASE_URL
    delete process.env.DASHSCOPE_API_KEY
    process.env.OPENAI_API_KEY = 'openai-key'
    delete process.env.OPENAI_MODEL
    delete process.env.OPENAI_BASE_URL

    const fetchMock = vi.fn().mockResolvedValueOnce(responseWithJson({ title: '安全配置' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callLLMJson<{ title: string }>({
      user: '测试。', schema: z.object({ title: z.string() }).strict(), maxAttempts: 1,
    })).resolves.toEqual({ title: '安全配置' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer openai-key' }) }),
    )
  })

  it('拒绝不完整 LLM_* 配置，不回退到其他供应商凭据', async () => {
    delete process.env.LLM_PROVIDER
    process.env.LLM_API_KEY = 'explicit-key'
    delete process.env.LLM_MODEL
    delete process.env.LLM_BASE_URL
    process.env.OPENAI_API_KEY = 'openai-key'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(callLLMJson({
      user: '测试。', schema: z.object({ title: z.string() }).strict(), maxAttempts: 1,
    })).rejects.toThrow('LLM_API_KEY, LLM_MODEL, and LLM_BASE_URL must be configured together')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('拒绝未显式选择的多个供应商 key', async () => {
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_API_KEY
    delete process.env.LLM_MODEL
    delete process.env.LLM_BASE_URL
    process.env.DASHSCOPE_API_KEY = 'dashscope-key'
    process.env.OPENAI_API_KEY = 'openai-key'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(callLLMJson({
      user: '测试。', schema: z.object({ title: z.string() }).strict(), maxAttempts: 1,
    })).rejects.toThrow('Multiple provider keys configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('兼容供应商把目标对象包在唯一 answer 字段中的响应', async () => {
    delete process.env.LLM_PROVIDER
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_MODEL = 'test-model'
    process.env.LLM_BASE_URL = 'https://example.invalid/v1'

    const fetchMock = vi.fn().mockResolvedValueOnce(responseWithJson({
      answer: { issues: [] },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callLLMJson<{ issues: unknown[] }>({
      user: '核验事实。',
      schema: z.object({ issues: z.array(z.unknown()) }).strict(),
      maxAttempts: 1,
    })).resolves.toEqual({ issues: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('目标 schema 本身包含 answer 时不错误解包', async () => {
    delete process.env.LLM_PROVIDER
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_MODEL = 'test-model'
    process.env.LLM_BASE_URL = 'https://example.invalid/v1'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(responseWithJson({ answer: '42' })))

    await expect(callLLMJson<{ answer: string }>({
      user: '回答。',
      schema: z.object({ answer: z.string() }).strict(),
      maxAttempts: 1,
    })).resolves.toEqual({ answer: '42' })
  })

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

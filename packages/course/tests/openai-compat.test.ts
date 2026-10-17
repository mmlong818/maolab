import { expect, test } from 'vitest'
import { createOpenAiCompatTransport } from '../src/transports/openai-compat.js'

function recordingFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { calls, fetchImpl }
}
const request = { system: 's', user: 'u', temperature: 0.3, timeoutMs: 1000, signal: new AbortController().signal, attempt: 1 }

test('posts a JSON chat completion with the explicit key and disables glm thinking', async () => {
  const { calls, fetchImpl } = recordingFetch(200, { choices: [{ message: { content: '{"ok":true}' } }] })
  const transport = createOpenAiCompatTransport({ baseURL: 'https://gw.example/v1/', apiKey: 'k-1', model: 'glm-5.3', fetchImpl })
  await expect(transport.completeJson(request)).resolves.toBe('{"ok":true}')
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe('https://gw.example/v1/chat/completions')
  expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer k-1')
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>
  expect(body).toMatchObject({ model: 'glm-5.3', temperature: 0.3, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } })
  expect(body.messages).toEqual([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }])
})

test('jsonMode false omits response_format and non-glm models get no thinking switch', async () => {
  const { calls, fetchImpl } = recordingFetch(200, { choices: [{ message: { content: '{}' } }] })
  await createOpenAiCompatTransport({ baseURL: 'https://gw.example/v1', apiKey: 'k', model: 'qwen-plus', jsonMode: false, fetchImpl }).completeJson({ ...request, system: undefined as never })
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>
  expect(body).not.toHaveProperty('response_format')
  expect(body).not.toHaveProperty('thinking')
  expect(body.messages).toEqual([{ role: 'user', content: 'u' }])
})

test('non-2xx surfaces the status for backoff; empty content is an error', async () => {
  await expect(createOpenAiCompatTransport({ baseURL: 'https://gw', apiKey: 'k', model: 'm', fetchImpl: recordingFetch(429, {}).fetchImpl }).completeJson(request)).rejects.toThrow('LLM HTTP 429')
  await expect(createOpenAiCompatTransport({ baseURL: 'https://gw', apiKey: 'k', model: 'm', fetchImpl: recordingFetch(200, { choices: [] }).fetchImpl }).completeJson(request)).rejects.toThrow('Empty LLM response')
})

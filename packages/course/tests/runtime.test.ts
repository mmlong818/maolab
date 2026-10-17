import { afterEach, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { CourseRuntimeMissingError, requireCourseAssets, runWithCourseRuntime, type CourseAssetInput, type CourseLlmTransport, type LlmJsonRequest } from '../src/runtime.js'
import { callLLMJson } from '../src/v2/llm.js'
import { generateImage } from '../src/v2/image-gen.js'

const schema = z.object({ title: z.string(), count: z.number() })
const fast = { sleep: async () => {} }

function scripted(replies: string[]) {
  const requests: LlmJsonRequest[] = []
  const transport: CourseLlmTransport = {
    async completeJson(request) {
      requests.push(request)
      const next = replies.shift()
      if (next === undefined) throw new Error('no scripted reply left')
      return next
    },
  }
  return { transport, requests }
}

afterEach(() => { vi.restoreAllMocks() })

test('without a runtime the calls fail closed and never touch the network', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  await expect(callLLMJson({ user: 'x', schema })).rejects.toBeInstanceOf(CourseRuntimeMissingError)
  await expect(callLLMJson({ user: 'x', schema })).rejects.toMatchObject({ code: 'COURSE_LLM_MISSING' })
  await expect(generateImage('一只猫')).rejects.toMatchObject({ code: 'COURSE_IMAGE_MISSING' })
  await expect(runWithCourseRuntime({ ...fast }, () => callLLMJson({ user: 'x', schema }))).rejects.toMatchObject({ code: 'COURSE_LLM_MISSING' })
  expect(fetchSpy).not.toHaveBeenCalled()
})

test('fenced JSON is extracted, validated and the request carries system, temperature and attempt', async () => {
  const { transport, requests } = scripted(['```json\n{"title":"勾股定理","count":3}\n```'])
  const out = await runWithCourseRuntime({ llm: transport, ...fast }, () =>
    callLLMJson<{ title: string; count: number }>({ system: 'sys', user: 'u', schema, temperature: 0.2, timeoutSec: 5 }))
  expect(out).toEqual({ title: '勾股定理', count: 3 })
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ system: 'sys', user: 'u', temperature: 0.2, timeoutMs: 5000, attempt: 1 })
})

test('schema failures retry with the validation feedback appended to the prompt', async () => {
  const { transport, requests } = scripted(['{"title":"x"}', '{"title":"x","count":1}'])
  const out = await runWithCourseRuntime({ llm: transport, ...fast }, () => callLLMJson({ user: '出一页', schema }))
  expect(out).toEqual({ title: 'x', count: 1 })
  expect(requests.map((r) => r.attempt)).toEqual([1, 2])
  expect(requests[1]!.user.startsWith('出一页\n')).toBe(true)
  expect(requests[1]!.user).toContain('上一版输出未通过 JSON 结构校验。')
  expect(requests[1]!.user).toContain('count')
})

test('a lone answer wrapper is unwrapped', async () => {
  const { transport } = scripted(['{"answer":{"title":"y","count":2}}'])
  await expect(runWithCourseRuntime({ llm: transport, ...fast }, () => callLLMJson({ user: 'u', schema }))).resolves.toEqual({ title: 'y', count: 2 })
})

test('gives up after maxAttempts and reports the last error', async () => {
  const { transport } = scripted(['nope', 'still nope'])
  await expect(runWithCourseRuntime({ llm: transport, ...fast }, () => callLLMJson({ user: 'u', schema, maxAttempts: 2 })))
    .rejects.toThrow(/callLLMJson failed after 2 attempts/)
})

test('rate limited and server errors back off longer than ordinary errors', async () => {
  const waits: number[] = []
  let n = 0
  const transport: CourseLlmTransport = {
    async completeJson() {
      n += 1
      if (n === 1) throw new Error('LLM HTTP 429')
      if (n === 2) throw new Error('socket hang up')
      return '{"title":"t","count":0}'
    },
  }
  await runWithCourseRuntime({ llm: transport, sleep: async (ms) => { waits.push(ms) } }, () => callLLMJson({ user: 'u', schema }))
  expect(waits).toEqual([20_000, 2_000])
})

test('concurrent runtimes stay isolated', async () => {
  const a = scripted(['{"title":"A","count":1}'])
  const b = scripted(['{"title":"B","count":2}'])
  const [ra, rb] = await Promise.all([
    runWithCourseRuntime({ llm: a.transport, ...fast }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return callLLMJson<{ title: string }>({ user: 'from-a', schema })
    }),
    runWithCourseRuntime({ llm: b.transport, ...fast }, () => callLLMJson<{ title: string }>({ user: 'from-b', schema })),
  ])
  expect([ra.title, rb.title]).toEqual(['A', 'B'])
  expect(a.requests.map((r) => r.user)).toEqual(['from-a'])
  expect(b.requests.map((r) => r.user)).toEqual(['from-b'])
})

test('images go through the injected channel with the requested size', async () => {
  const seen: Array<{ prompt: string; size: string }> = []
  const url = await runWithCourseRuntime({ image: { async generate(prompt, request) { seen.push({ prompt, size: request.size }); return 'artifact:img-1' } } }, () =>
    generateImage('光的折射示意', { size: '1024x1024', fallbackWidth: 1, fallbackHeight: 1 }))
  expect(url).toBe('artifact:img-1')
  expect(seen).toEqual([{ prompt: '光的折射示意', size: '1024x1024' }])
  const defaultSize = await runWithCourseRuntime({ image: { async generate(_p, request) { return request.size } } }, () => generateImage('x'))
  expect(defaultSize).toBe('1536x1024')
})

test('the asset sink is injected per call like the other channels and missing means refusal', async () => {
  expect(() => requireCourseAssets()).toThrow(CourseRuntimeMissingError)
  expect(() => requireCourseAssets()).toThrow('备课产物存储未配置。')
  const puts: string[] = []
  const assets = { async put(input: CourseAssetInput) { puts.push(`${input.contentType}:${input.name}:${input.bytes.byteLength}`); return '/api/prep/artifacts/ar_test' } }
  const url = await runWithCourseRuntime({ assets }, () => requireCourseAssets().put({ bytes: new Uint8Array([1, 2]), contentType: 'image/svg+xml', name: 'a.svg' }))
  expect(url).toBe('/api/prep/artifacts/ar_test')
  expect(puts).toEqual(['image/svg+xml:a.svg:2'])
  const missing = await runWithCourseRuntime({}, async () => { try { requireCourseAssets(); return undefined } catch (error) { return error } })
  expect(missing).toMatchObject({ code: 'COURSE_ASSETS_MISSING' })
})

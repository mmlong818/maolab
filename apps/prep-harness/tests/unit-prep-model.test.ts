import { expect, test } from 'vitest'
import { newModelMeter, PREP_IMAGE_NO_CREDENTIAL, PREP_IMAGES_UNAVAILABLE, sessionCourseLlm, sessionImage, sessionSleep, type LlmStreamChunk, type LlmStreamOptions, type LlmStreamer } from '@maolab/prep-bundle/prep-model'

function streamer(chunks: LlmStreamChunk[]) {
  const seen: LlmStreamOptions[] = []
  const llm: LlmStreamer = {
    async *stream(options) {
      seen.push(options)
      for (const chunk of chunks) yield chunk
    },
  }
  return { llm, seen }
}
const request = (signal: AbortSignal = new AbortController().signal) => ({ system: '只输出 JSON', user: '{"page":1}', temperature: 0.2, timeoutMs: 1000, signal, attempt: 1 })

test('tool-internal model calls go through the yunyi adapter with the session id and are metered', async () => {
  const { llm, seen } = streamer([
    { type: 'text-delta', text: '{"issues"' },
    { type: 'text-delta', text: ':[]}' },
    { type: 'usage', usage: { inputTokens: 12, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const meter = newModelMeter()
  let t = 1000
  const transport = sessionCourseLlm({ llm, sessionId: 's-prep-1', model: 'glm-5.3', signal: new AbortController().signal, meter, now: () => (t += 50) })
  expect(await transport.completeJson(request())).toBe('{"issues":[]}')
  expect(seen[0]).toMatchObject({ provider: 'yunyi', model: 'glm-5.3', sessionId: 's-prep-1', system: '只输出 JSON', temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'text', text: '{"page":1}' }] }] })
  expect(meter).toMatchObject({ calls: 1, failures: 0, inputTokens: 12, outputTokens: 5, ms: 50, imageCalls: 0 })
})

test('the tool signal and the per-attempt timeout both abort the model call', async () => {
  const tool = new AbortController()
  const attempt = new AbortController()
  const { llm, seen } = streamer([{ type: 'text-delta', text: '{}' }])
  await sessionCourseLlm({ llm, sessionId: 's', model: 'm', signal: tool.signal, meter: newModelMeter() }).completeJson(request(attempt.signal))
  expect(seen[0]!.signal!.aborted).toBe(false)
  tool.abort()
  expect(seen[0]!.signal!.aborted).toBe(true)
})

test('adapter failures keep their HTTP status for callLLMJson backoff; empty replies are failures', async () => {
  const meter = newModelMeter()
  const failing = streamer([{ type: 'finish', reason: { kind: 'error', failure: { message: 'yunyi-llm: HTTP 429: busy' } } }])
  await expect(sessionCourseLlm({ llm: failing.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter }).completeJson(request())).rejects.toThrow('HTTP 429')
  const empty = streamer([{ type: 'finish', reason: { kind: 'stop' } }])
  await expect(sessionCourseLlm({ llm: empty.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter }).completeJson(request())).rejects.toThrow('Empty LLM response')
  expect(meter).toMatchObject({ calls: 2, failures: 2 })
})

// 3c 裁决 F16：finish aborted 抛 AbortError，不当成空响应
test('an aborted finish throws an AbortError instead of an empty response', async () => {
  const meter = newModelMeter()
  const tool = new AbortController()
  // 请求发出后工具被取消，dsh 以 finish aborted 结束流
  const aborted: LlmStreamer = { async *stream() { tool.abort(); yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } } } } }
  const error = await sessionCourseLlm({ llm: aborted, sessionId: 's', model: 'm', signal: tool.signal, meter }).completeJson(request()).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe('AbortError')
  expect(error.message).not.toContain('Empty LLM response')
  expect(meter).toMatchObject({ calls: 1, failures: 1 })
})

// 审查 I2（3c 裁决 T4/T12）：传输失败按错误名与消息前缀可辨认——门面靠消息里的 [prep-transport:<kind>] 认出它（生成器只留下错误文案）
test('transport failures are tagged by kind: timeout, abort and network', async () => {
  const abortedFinish = streamer([{ type: 'finish', reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } } }])
  const timeout = new AbortController()
  timeout.abort()
  const timedOut = await sessionCourseLlm({ llm: abortedFinish.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter: newModelMeter() }).completeJson(request(timeout.signal)).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(timedOut.name).toBe('PrepModelTimeoutError')
  expect(timedOut.message.startsWith('[prep-transport:timeout] ')).toBe(true)

  const tool = new AbortController()
  tool.abort()
  let streamed = 0
  const counting: LlmStreamer = { async *stream() { streamed += 1; yield { type: 'finish', reason: { kind: 'stop' } } } }
  const cancelled = await sessionCourseLlm({ llm: counting, sessionId: 's', model: 'm', signal: tool.signal, meter: newModelMeter() }).completeJson(request()).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(cancelled.name).toBe('AbortError')
  expect(cancelled.message.startsWith('[prep-transport:abort] ')).toBe(true)
  expect(streamed).toBe(0)

  const network = streamer([{ type: 'finish', reason: { kind: 'error', failure: { message: 'yunyi-llm: request failed: fetch failed', code: 'NETWORK' } } }])
  const offline = await sessionCourseLlm({ llm: network.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter: newModelMeter() }).completeJson(request()).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(offline.name).toBe('PrepModelNetworkError')
  expect(offline.message).toMatch(/^\[prep-transport:network\] .*fetch failed/)

  const busy = streamer([{ type: 'finish', reason: { kind: 'error', failure: { message: 'yunyi-llm: HTTP 503: upstream', code: 'HTTP', status: 503 } } }])
  const unavailable = await sessionCourseLlm({ llm: busy.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter: newModelMeter() }).completeJson(request()).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(unavailable.name).toBe('PrepModelNetworkError')
  expect(String(unavailable)).toMatch(/HTTP 503/)

  const thrower: LlmStreamer = { async *stream() { throw new TypeError('socket hang up') } }
  const broken = await sessionCourseLlm({ llm: thrower, sessionId: 's', model: 'm', signal: new AbortController().signal, meter: newModelMeter() }).completeJson(request()).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(broken.name).toBe('PrepModelNetworkError')
  expect(broken.message).toContain('socket hang up')

  // 请求本身被拒（400、凭证问题）不是传输失败：交给生成器当普通失败处理
  const rejected = streamer([{ type: 'finish', reason: { kind: 'error', failure: { message: 'yunyi-llm: HTTP 400: bad request', code: 'HTTP', status: 400 } } }])
  const bad = await sessionCourseLlm({ llm: rejected.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter: newModelMeter() }).completeJson(request()).then(() => new Error('resolved'), (caught: unknown) => caught as Error)
  expect(bad.message).not.toContain('[prep-transport:')
  expect(bad.message).toContain('HTTP 400')
})

test('images: an unconfigured model or a credential-less session never touches the network', async () => {
  let fetches = 0
  const fetchImpl = (async () => { fetches += 1; return new Response('{}') }) as typeof fetch
  const assets = { put: async () => '/api/prep/artifacts/ar_x' }
  const base = { baseUrl: 'http://gw.test/v1', signal: new AbortController().signal, meter: newModelMeter(), assets, fetchImpl }
  await expect(sessionImage({ ...base, credential: 'cred-a', model: '' }).generate('画一个圆', { size: '1024x1024' })).rejects.toThrow(PREP_IMAGES_UNAVAILABLE)
  await expect(sessionImage({ ...base, credential: undefined, model: 'img-1' }).generate('画一个圆', { size: '1024x1024' })).rejects.toThrow(PREP_IMAGE_NO_CREDENTIAL)
  expect(fetches).toBe(0)
})

test('images use the session credential, accept only inline bytes and land in the artifact store', async () => {
  const requests: Array<{ url: string; auth: string | null; body: Record<string, unknown> }> = []
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  let reply: unknown = { data: [{ b64_json: png.toString('base64') }] }
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return new Response(JSON.stringify(reply), { status: 200 })
  }) as typeof fetch
  const puts: Array<{ bytes: Uint8Array; contentType: string; name: string }> = []
  const assets = { put: async (input: { bytes: Uint8Array; contentType: string; name: string }) => { puts.push(input); return '/api/prep/artifacts/ar_img' } }
  const meter = newModelMeter()
  const image = sessionImage({ baseUrl: 'http://gw.test/v1/', credential: 'cred-a', model: 'img-1', signal: new AbortController().signal, meter, assets, fetchImpl })
  expect(await image.generate('画一个圆', { size: '1024x1024' })).toBe('/api/prep/artifacts/ar_img')
  expect(requests[0]).toMatchObject({ url: 'http://gw.test/v1/images/generations', auth: 'Bearer cred-a', body: { model: 'img-1', prompt: '画一个圆', size: '1024x1024', response_format: 'b64_json' } })
  expect(Buffer.from(puts[0]!.bytes)).toEqual(png)
  expect(puts[0]!.contentType).toBe('image/png')
  reply = { data: [{ url: 'https://elsewhere.test/a.png' }] }
  await expect(image.generate('画一个圆', { size: '1024x1024' })).rejects.toThrow('只接受 b64_json')
  expect(requests).toHaveLength(2)
  expect(meter.imageCalls).toBe(2)
})

// D3 实测没有记录真实返回的格式（只花一次生成请求）：按文件头字节判断，jpeg 不会被标成 png
test('image content type follows the returned bytes', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
  const fetchImpl = (async () => new Response(JSON.stringify({ data: [{ b64_json: jpeg.toString('base64') }] }), { status: 200 })) as typeof fetch
  const puts: Array<{ contentType: string; name: string }> = []
  const assets = { put: async (input: { bytes: Uint8Array; contentType: string; name: string }) => { puts.push(input); return '/api/prep/artifacts/ar_jpg' } }
  await sessionImage({ baseUrl: 'http://gw.test/v1', credential: 'cred-a', model: 'img-1', signal: new AbortController().signal, meter: newModelMeter(), assets, fetchImpl }).generate('画一个圆', { size: '1024x1024' })
  expect(puts[0]).toMatchObject({ contentType: 'image/jpeg' })
  expect(puts[0]!.name).toMatch(/\.jpg$/)
})

// —— Task 4 修复轮（progress.md 最后一条 Ruling [T4]）——
const fail = (promise: Promise<unknown>) => promise.then(() => new Error('resolved'), (caught: unknown) => caught as Error)

test('auth failures are tagged [prep-transport:auth] and never reach the network again in the same tool call', async () => {
  for (const failure of [
    { message: 'yunyi-llm: HTTP 401: invalid key', code: 'AUTH', status: 401 },
    { message: 'yunyi-llm: no credential for session s', code: 'MISSING_CREDENTIAL' },
    { message: 'yunyi-llm: session s and initiator t resolve to different identities', code: 'IDENTITY_MISMATCH' },
  ]) {
    let streamed = 0
    const llm: LlmStreamer = { async *stream() { streamed += 1; yield { type: 'finish', reason: { kind: 'error', failure } } } }
    const meter = newModelMeter()
    const transport = sessionCourseLlm({ llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter })
    const first = await fail(transport.completeJson(request()))
    expect(first.name).toBe('PrepModelAuthError')
    expect(first.message.startsWith('[prep-transport:auth] ')).toBe(true)
    // callLLMJson 会再试：同一通道里不再出网，直接抛同样的认证错误，也不计 calls
    const again = await fail(transport.completeJson(request()))
    expect(again.message.startsWith('[prep-transport:auth] ')).toBe(true)
    expect(streamed).toBe(1)
    expect(meter).toMatchObject({ calls: 1, failures: 1 })
  }
})

test('an aborted finish with neither signal fired is a network failure, not a cancel', async () => {
  const aborted = streamer([{ type: 'finish', reason: { kind: 'aborted', failure: { message: 'aborted', code: 'ABORTED' } } }])
  const error = await fail(sessionCourseLlm({ llm: aborted.llm, sessionId: 's', model: 'm', signal: new AbortController().signal, meter: newModelMeter() }).completeJson(request()))
  expect(error.name).toBe('PrepModelNetworkError')
  expect(error.message.startsWith('[prep-transport:network] ')).toBe(true)
})

test('short-circuited attempts after a cancel are not counted as calls', async () => {
  const tool = new AbortController()
  tool.abort()
  const meter = newModelMeter()
  const transport = sessionCourseLlm({ llm: streamer([]).llm, sessionId: 's', model: 'm', signal: tool.signal, meter })
  expect((await fail(transport.completeJson(request()))).name).toBe('AbortError')
  expect((await fail(transport.completeJson(request()))).name).toBe('AbortError')
  expect(meter).toMatchObject({ calls: 0, failures: 0 })
})

test('an empty session id is refused up front (no initiator fallback)', () => {
  expect(() => sessionCourseLlm({ llm: streamer([]).llm, sessionId: '  ', model: 'm', signal: new AbortController().signal, meter: newModelMeter() })).toThrow(/sessionId/)
})

test('the backoff sleep ends at once when the tool is cancelled', async () => {
  const tool = new AbortController()
  const sleep = sessionSleep(tool.signal)
  const started = Date.now()
  const pending = sleep(60_000)
  tool.abort()
  await pending
  expect(Date.now() - started).toBeLessThan(1000)
  // 已取消时直接返回
  await sleep(60_000)
  expect(Date.now() - started).toBeLessThan(1000)
  // 没取消时照常睡
  const t0 = Date.now()
  await sessionSleep(new AbortController().signal)(30)
  expect(Date.now() - t0).toBeGreaterThanOrEqual(25)
})

function imageWith(reply: () => Response, extra: { maxResponseBytes?: number; timeoutMs?: number } = {}) {
  const puts: Array<{ contentType: string }> = []
  const meter = newModelMeter()
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (extra.timeoutMs !== undefined) {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
    }
    return reply()
  }) as typeof fetch
  const assets = { put: async (input: { bytes: Uint8Array; contentType: string; name: string }) => { puts.push(input); return '/api/prep/artifacts/ar' } }
  const image = sessionImage({ baseUrl: 'http://gw.test/v1', credential: 'cred-a', model: 'img-1', signal: new AbortController().signal, meter, assets, fetchImpl, ...extra })
  return { image, puts, meter }
}
const b64Reply = (bytes: number[]) => () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] }), { status: 200 })

test('images with an unknown format, empty bytes or a truncated png signature are rejected', async () => {
  for (const bytes of [[0x3c, 0x73, 0x76, 0x67, 0x20, 0x78, 0x6d, 0x6c], [], [0x89, 0x50, 0x4e, 0x47]]) {
    const { image, puts, meter } = imageWith(b64Reply(bytes))
    await expect(image.generate('画一个圆', { size: '1024x1024' })).rejects.toThrow('图像格式')
    expect(puts).toHaveLength(0)
    expect(meter.failures).toBe(1)
  }
})

test('an oversized image response is refused and the request has its own timeout', async () => {
  const big = imageWith(() => new Response('x'.repeat(2048), { status: 200 }), { maxResponseBytes: 1024 })
  await expect(big.image.generate('画一个圆', { size: '1024x1024' })).rejects.toThrow('超过')
  expect(big.meter.failures).toBe(1)
  const declared = imageWith(() => new Response('{}', { status: 200, headers: { 'content-length': '999999' } }), { maxResponseBytes: 1024 })
  await expect(declared.image.generate('画一个圆', { size: '1024x1024' })).rejects.toThrow('超过')
  const slow = imageWith(b64Reply([0xff, 0xd8, 0xff]), { timeoutMs: 20 })
  await expect(slow.image.generate('画一个圆', { size: '1024x1024' })).rejects.toThrow('超时')
  expect(slow.meter.failures).toBe(1)
  const garbled = imageWith(() => new Response('not json', { status: 200 }))
  await expect(garbled.image.generate('画一个圆', { size: '1024x1024' })).rejects.toThrow()
  expect(garbled.meter.failures).toBe(1)
})

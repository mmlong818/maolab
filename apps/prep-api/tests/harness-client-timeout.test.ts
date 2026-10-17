// harness 卡住或断开时客户端不能挂住浏览器请求：控制调用与事件流建立都有上限，超时映射成 HarnessError(kind:'timeout')
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createHarnessClient, HarnessError } from '../src/harness/client.ts'

// 假 harness：/hang 路径收下请求不回；/events-silent 只发响应头不发 connected；/events 发 connected 后每 20ms 一帧；记录连接关闭
let server: http.Server
let base = ''
const closed: string[] = []
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? ''
    res.on('close', () => closed.push(url))
    if (url.startsWith('/sessions/silent/events')) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders(); return }
    if (url.startsWith('/sessions/quiet/events')) {
      // Ruling [T8] F5：connected 之后静默一段（长于建立上限与测试里设的空闲上限）再发一帧，然后结束
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(': connected\n\n')
      const t = setTimeout(() => { res.write(`data: ${JSON.stringify({ type: 'late' })}\n\n`); res.end() }, 900)
      res.on('close', () => clearTimeout(t))
      return
    }
    if (url.startsWith('/sessions/live/events')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(': connected\n\n')
      const t = setInterval(() => res.write(`data: ${JSON.stringify({ type: 'tick' })}\n\n`), 20)
      res.on('close', () => clearInterval(t))
      return
    }
    // 其余请求一律不回
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())) })

const input = { sessionId: 's-to', owner: 'lr_x', preset: 'prep' as const, provider: 'fake', model: 'fake-1' }

test('a control call to a hung harness fails within the timeout as a timeout HarnessError', async () => {
  const client = createHarnessClient(base, 'k', { timeoutMs: 200 })
  const started = Date.now()
  const err = await client.ensure(input).catch((e: unknown) => e)
  expect(Date.now() - started).toBeLessThan(2000)
  expect(err).toBeInstanceOf(HarnessError)
  expect(err).toMatchObject({ kind: 'timeout', status: 504 })
  for (const call of [() => client.prompt('s-to', 'x', crypto.randomUUID()), () => client.cancel('s-to'), () => client.dispose('s-to'), () => client.create(input)]) {
    await expect(call()).rejects.toMatchObject({ kind: 'timeout' })
  }
})

test('waiting for ": connected" is bounded, both before headers and after headers', async () => {
  const client = createHarnessClient(base, 'k', { timeoutMs: 200 })
  await expect(client.openEvents('hung')).rejects.toMatchObject({ kind: 'timeout', status: 504 })
  await expect(client.openEvents('silent')).rejects.toMatchObject({ kind: 'timeout', status: 504 })
})

test('an unreachable harness is an unreachable HarnessError', async () => {
  const dead = http.createServer()
  await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(dead.address() as AddressInfo).port}`
  await new Promise<void>((r) => dead.close(() => r()))
  const client = createHarnessClient(url, 'k', { timeoutMs: 200 })
  await expect(client.ensure(input)).rejects.toMatchObject({ kind: 'unreachable', status: 503 })
  await expect(client.openEvents('x')).rejects.toMatchObject({ kind: 'unreachable', status: 503 })
})

test('breaking out of the frame loop closes the SSE connection without calling close()', async () => {
  const client = createHarnessClient(base, 'k', { timeoutMs: 200 })
  const events = await client.openEvents('live')
  // 超过建立上限后连接仍然开着（定时器在 connected 后已清除）
  await new Promise((r) => setTimeout(r, 300))
  for await (const f of events.frames) { expect(f.type).toBe('tick'); break }
  const deadline = Date.now() + 2000
  while (!closed.some((u) => u.startsWith('/sessions/live/events')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
  expect(closed.some((u) => u.startsWith('/sessions/live/events'))).toBe(true)
})

// Ruling [T8] F5：Node 全局 fetch（undici）读正文默认 300 秒没有数据就断，网关又不发保活；备课的工具调用会静默好几分钟。
// 事件流不经全局 fetch、不设正文超时：静默再久也照常收帧。eventsIdleTimeoutMs 只给测试用，把"有正文超时"时的断流在几百毫秒内复现出来。
test('an event stream silent past the connect timeout keeps delivering (no body timeout); an idle limit, when configured, cuts it', async () => {
  const client = createHarnessClient(base, 'k', { timeoutMs: 200 })
  const events = await client.openEvents('quiet')
  const got: string[] = []
  for await (const f of events.frames) got.push(f.type)
  expect(got).toEqual(['late'])
  const limited = createHarnessClient(base, 'k', { timeoutMs: 200, eventsIdleTimeoutMs: 300 })
  const cut = await limited.openEvents('quiet')
  const err = await (async () => { for await (const f of cut.frames) void f })().catch((e: unknown) => e)
  expect(err).toMatchObject({ kind: 'unreachable', status: 502 })
})

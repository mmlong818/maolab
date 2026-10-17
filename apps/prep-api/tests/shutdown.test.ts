// 终审 I3：SIGTERM 时等进行中的回合（含浏览器已断开的）落库再关连接池，至多宽限期；重复信号只停一次。
// 终审 M8：请求日志的 url 抹掉查询参数 token。
import { Writable } from 'node:stream'
import Fastify from 'fastify'
import { expect, test } from 'vitest'
import { createShutdown, drainTurns } from '../src/shutdown.ts'
import { loggerOptions, redactTokenQuery } from '../src/server.ts'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

test('shutdown waits for in-flight turns before ending the pool', async () => {
  const order: string[] = []
  const turn = deferred()
  const inflight = new Set<Promise<unknown>>([turn.promise.then(() => { order.push('turn settled') })])
  const shutdown = createShutdown({ close: async () => { order.push('closed') }, inflight, endPool: async () => { order.push('pool ended') }, graceMs: 5_000 })
  const done = shutdown()
  await new Promise((r) => setTimeout(r, 50))
  expect(order).toEqual(['closed'])
  turn.resolve()
  await done
  expect(order).toEqual(['closed', 'turn settled', 'pool ended'])
  expect(shutdown()).toBe(done)   // 第二个信号等同一次停机
})

test('a turn registered while draining is awaited too; a stuck turn is abandoned after the grace period', async () => {
  const late = deferred()
  const first = deferred()
  const inflight = new Set<Promise<unknown>>([first.promise])
  const draining = drainTurns(inflight, 2_000)
  inflight.add(late.promise)
  first.resolve()
  await new Promise((r) => setTimeout(r, 30))
  inflight.delete(first.promise)
  late.resolve()
  inflight.delete(late.promise)
  expect(await draining).toBe(true)

  const logs: string[] = []
  let ended = false
  const stuck = new Set<Promise<unknown>>([new Promise(() => undefined)])
  const started = Date.now()
  await createShutdown({ close: () => new Promise(() => undefined), inflight: stuck, endPool: async () => { ended = true }, graceMs: 200, log: (m) => logs.push(m) })()
  expect(Date.now() - started).toBeLessThan(2_000)
  expect(ended).toBe(true)
  expect(logs.join('\n')).toMatch(/1 turn\(s\) still running/)
})

test('the request log never carries a token query parameter', async () => {
  expect(redactTokenQuery('/api/learning/sessions/x/export?format=html&token=secret-abc')).toBe('/api/learning/sessions/x/export?format=html&token=[redacted]')
  expect(redactTokenQuery('/api/x?Token=a&tokenish=b&%74oken=c')).toBe('/api/x?Token=[redacted]&tokenish=b&%74oken=[redacted]')
  expect(redactTokenQuery('/api/health')).toBe('/api/health')
  const lines: string[] = []
  const stream = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb() } })
  const app = Fastify({ logger: { ...loggerOptions(), stream } })
  app.get('/api/learning/sessions/:id/export', async () => ({ ok: true }))
  await app.inject({ method: 'GET', url: '/api/learning/sessions/s1/export?token=secret-abc&format=html' })
  await app.close()
  const all = lines.join('')
  expect(all).toContain('/api/learning/sessions/s1/export?token=[redacted]&format=html')
  expect(all).not.toContain('secret-abc')
})

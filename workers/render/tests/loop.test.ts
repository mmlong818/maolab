import type { RenderJob, RenderJobError } from '@maolab/domain'
import { afterEach, expect, test, vi } from 'vitest'
import { armExitFallback, defaultBackoffMs, runLoop, runOnce, startPeriodic, type LoopDeps } from '../src/loop.ts'

const job = (id: string, attempts = 1): RenderJob => ({
  id, owner: 'o', courseId: 'c', kind: 'render-page', requestKey: id, payload: {}, status: 'running', attempts, maxAttempts: 3,
  availableAt: 0, leaseHolder: 'w', leaseExpiresAt: 1, result: null, error: null, createdAt: 0, updatedAt: 0, finishedAt: null,
})
function fakeQueue(queued: RenderJob[], completeOk = true) {
  const calls: string[] = []
  return {
    calls,
    jobs: {
      async claim() { return queued.shift() },
      async heartbeat() { calls.push('heartbeat'); return true },
      async complete(j: RenderJob, _holder: string, result: unknown) { calls.push(`complete ${j.id} ${JSON.stringify(result)}`); return completeOk },
      async fail(j: RenderJob, _holder: string, error: RenderJobError, backoff: number) { calls.push(`fail ${j.id} ${error.code} ${backoff}`); return error.retryable ? 'retry' as const : 'failed' as const },
    },
  }
}
const deps = (queue: ReturnType<typeof fakeQueue>, handle: LoopDeps['handle'], extra: Partial<LoopDeps> = {}): LoopDeps => ({
  jobs: queue.jobs, handle, holder: 'w', leaseMs: 1_000, heartbeatMs: 10, idleMs: 5, backoffMs: defaultBackoffMs, log: () => {}, ...extra,
})

test('an empty queue is idle', async () => {
  expect(await runOnce(deps(fakeQueue([]), async () => ({ ok: true, result: null })))).toBe('idle')
})

test('success completes with the result; failure goes back with the backoff for its attempt', async () => {
  const q = fakeQueue([job('a'), job('b', 2), job('c')])
  let n = 0
  const handle: LoopDeps['handle'] = async () => {
    n += 1
    if (n === 1) return { ok: true, result: { page: 1 } }
    if (n === 2) return { ok: false, error: { code: 'RENDER_TIMEOUT', message: 't', retryable: true } }
    return { ok: false, error: { code: 'SESSION_CONFLICT', message: 's', retryable: false } }
  }
  expect(await runOnce(deps(q, handle))).toBe('succeeded')
  expect(await runOnce(deps(q, handle))).toBe('retry')
  expect(await runOnce(deps(q, handle))).toBe('failed')
  expect(q.calls.filter((c) => !c.startsWith('heartbeat'))).toEqual(['complete a {"page":1}', 'fail b RENDER_TIMEOUT 10000', 'fail c SESSION_CONFLICT 5000'])
})

test('a completion refused by the fence is reported as lost', async () => {
  expect(await runOnce(deps(fakeQueue([job('a')], false), async () => ({ ok: true, result: null })))).toBe('lost')
})

test('the lease is renewed while a job runs and not after it ends', async () => {
  const q = fakeQueue([job('slow')])
  await runOnce(deps(q, async () => { await new Promise((r) => setTimeout(r, 100)); return { ok: true, result: null } }))   // Windows 计时器粒度约 15ms，留足余量
  const beats = q.calls.filter((c) => c === 'heartbeat').length
  expect(beats).toBeGreaterThanOrEqual(3)
  await new Promise((r) => setTimeout(r, 40))
  expect(q.calls.filter((c) => c === 'heartbeat').length).toBe(beats)
})

test('abort lets the job in hand finish, then the loop exits', async () => {
  const q = fakeQueue([job('a'), job('b')])
  const controller = new AbortController()
  const handled: string[] = []
  await runLoop(deps(q, async (j) => { handled.push(j.id); controller.abort(); return { ok: true, result: null } }), controller.signal)
  expect(handled).toEqual(['a'])
  expect(q.calls.filter((c) => c.startsWith('complete'))).toEqual(['complete a null'])
})

test('a handler that throws hands the job back as a retryable internal error instead of waiting out the lease', async () => {
  const q = fakeQueue([job('a')])
  expect(await runOnce(deps(q, async () => { throw new Error('boom at C:\\secret') }))).toBe('retry')
  expect(q.calls.filter((c) => !c.startsWith('heartbeat'))).toEqual(['fail a RENDER_INTERNAL 5000'])
})

test('backoff doubles from five seconds and caps at a minute', () => {
  expect([1, 2, 3, 4, 5, 9].map(defaultBackoffMs)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000])
})

afterEach(() => { vi.useRealTimers() })

test('a heartbeat is skipped while the previous one has not returned (T9 M5 single flight)', async () => {
  vi.useFakeTimers()
  const q = fakeQueue([job('slow')])
  let beats = 0
  let release: (() => void) | undefined
  q.jobs.heartbeat = () => { beats += 1; return new Promise<boolean>((resolve) => { release = () => resolve(true) }) }
  let finish: (() => void) | undefined
  const running = runOnce(deps(q, () => new Promise((resolve) => { finish = () => resolve({ ok: true, result: null }) })))
  await vi.advanceTimersByTimeAsync(10)
  expect(beats).toBe(1)
  await vi.advanceTimersByTimeAsync(50)   // 上一次心跳还没回：这 5 个 tick 都跳过
  expect(beats).toBe(1)
  release!()
  await vi.advanceTimersByTimeAsync(10)
  expect(beats).toBe(2)
  finish!()
  release!()
  expect(await running).toBe('succeeded')
})

test('a periodic task runs at once and on its own interval, skips a tick while still running, and stops (T9 M4)', async () => {
  vi.useFakeTimers()
  let runs = 0
  let release: (() => void) | undefined
  const errors: string[] = []
  const task = startPeriodic(() => { runs += 1; return new Promise<void>((resolve) => { release = resolve }) }, 100, (error) => errors.push(String(error)))
  await vi.advanceTimersByTimeAsync(0)
  expect(runs).toBe(1)
  await vi.advanceTimersByTimeAsync(300)   // 第一次还没结束：不叠加
  expect(runs).toBe(1)
  release!()
  await vi.advanceTimersByTimeAsync(100)
  expect(runs).toBe(2)
  release!()
  await task.stop()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(runs).toBe(2)
  const failing = startPeriodic(async () => { throw new Error('pg down') }, 100, (error) => errors.push((error as Error).message))
  await vi.advanceTimersByTimeAsync(150)
  await failing.stop()
  expect(errors).toEqual(['pg down', 'pg down'])
})

test('after a shutdown signal, a fallback exit fires once the drain grace has passed and never keeps the process alive (T9 M3)', async () => {
  vi.useFakeTimers()
  const exits: number[] = []
  const timer = armExitFallback(1_000, (code) => { exits.push(code) })
  expect(timer.hasRef()).toBe(false)
  await vi.advanceTimersByTimeAsync(999)
  expect(exits).toEqual([])
  await vi.advanceTimersByTimeAsync(1)
  expect(exits).toEqual([1])
})

// 任务循环（3b）：一次一个任务（本机与容器内存都紧）。领取 → 定时续租 → 处理 → 按栅栏完成或失败。
// 收到 abort（SIGTERM）后做完手上的任务再退出；被别人接走租约的任务，本次写入由栅栏拒绝，记为 lost。
import type { PgRenderJobs, RenderJob } from '@maolab/domain'
import type { JobOutcome } from './jobs.ts'

export type QueueLike = Pick<PgRenderJobs, 'claim' | 'heartbeat' | 'complete' | 'fail'>

export interface LoopDeps {
  jobs: QueueLike
  handle(job: RenderJob): Promise<JobOutcome>
  holder: string
  leaseMs: number
  heartbeatMs: number
  idleMs: number
  backoffMs(attempt: number): number
  log(line: string): void
  sleep?(ms: number, signal: AbortSignal): Promise<void>
  onIdle?(): Promise<void>
}

export type RunOnceResult = 'idle' | 'succeeded' | 'retry' | 'failed' | 'lost'

export function defaultBackoffMs(attempt: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.max(0, attempt - 1))
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export async function runOnce(deps: LoopDeps): Promise<RunOnceResult> {
  const job = await deps.jobs.claim(deps.holder, deps.leaseMs)
  if (!job) return 'idle'
  deps.log(`claimed ${job.id} ${job.kind} attempt ${job.attempts}/${job.maxAttempts}`)
  let leaseLost = false
  // T9 M5：上一次心跳没回来（库慢）就跳过本次 tick，不叠加占用连接池
  let beating = false
  const timer = setInterval(() => {
    if (beating) return
    beating = true
    deps.jobs.heartbeat(job, deps.holder, deps.leaseMs)
      .then((ok) => { if (!ok) leaseLost = true })
      .catch(() => { /* 下一次心跳再试；租约真过期了由栅栏兜底 */ })
      .finally(() => { beating = false })
  }, deps.heartbeatMs)
  try {
    // handle 约定不抛（handleRenderJob 自己分类错误）；万一抛了，按可重试的内部错误交回队列，不必干等租约过期
    const outcome: JobOutcome = await deps.handle(job).catch((error: unknown) => ({
      ok: false as const,
      error: { code: 'RENDER_INTERNAL', message: '渲染 worker 内部错误（浏览器或存储异常），将重试。', retryable: true, details: { name: error instanceof Error ? error.name : typeof error } },
    }))
    if (outcome.ok) {
      const done = await deps.jobs.complete(job, deps.holder, outcome.result)
      deps.log(`${done ? 'succeeded' : 'lost'} ${job.id}`)
      return done ? 'succeeded' : 'lost'
    }
    const result = await deps.jobs.fail(job, deps.holder, outcome.error, deps.backoffMs(job.attempts))
    deps.log(`${result} ${job.id} ${outcome.error.code}`)
    return result
  } finally {
    clearInterval(timer)
    if (leaseLost) deps.log(`lease lost during ${job.id}`)
  }
}

export async function runLoop(deps: LoopDeps, signal: AbortSignal): Promise<void> {
  const sleep = deps.sleep ?? abortableSleep
  while (!signal.aborted) {
    let result: RunOnceResult
    try {
      result = await runOnce(deps)
    } catch (error) {
      // 领取或写回时数据库出错：任务若已领到，租约过期后会被重领
      deps.log(`loop error ${error instanceof Error ? error.name : typeof error}`)
      result = 'idle'
    }
    if (result === 'idle') {
      try { await deps.onIdle?.() } catch (error) { deps.log(`idle task error ${error instanceof Error ? error.name : typeof error}`) }
      await sleep(deps.idleMs, signal)
    }
  }
}

/**
 * T9 M4：独立于任务循环的定时任务（清理过期产物）。立即跑一次，之后每 everyMs 跑一次；上一次没结束就跳过本次 tick。
 * 队列一直忙时也会按时执行（原先只在空闲时清理）。
 */
export function startPeriodic(task: () => Promise<void>, everyMs: number, onError: (error: unknown) => void): { stop(): Promise<void> } {
  let current: Promise<void> | undefined
  const tick = () => {
    if (current) return
    current = task().catch(onError).finally(() => { current = undefined })
  }
  const first = setTimeout(tick, 0)
  const timer = setInterval(tick, everyMs)
  // 停止后不再开新的一轮；返回的 Promise 等在途的一轮结束（关连接池之前要等它）
  return { stop: async () => { clearTimeout(first); clearInterval(timer); await current } }
}

/**
 * T9 M3：收到 SIGTERM 后的兜底退出。排空正常结束时进程自然退出；若排空超过 graceMs，或收尾后仍有句柄（如浏览器残留）挂住进程，
 * 到点以退出码 1 退出。计时器 unref，不会因为它本身让进程多活。在途任务的租约到期后由别的 worker 接走，写入有栅栏。
 */
export function armExitFallback(graceMs: number, exit: (code: number) => void = (code) => process.exit(code)): NodeJS.Timeout {
  return setTimeout(() => exit(1), graceMs).unref()
}

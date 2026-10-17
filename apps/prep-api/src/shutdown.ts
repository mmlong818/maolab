// 终审 I3：优雅停机。SIGTERM/SIGINT 时先停止接新请求（app.close 同时等进行中的 HTTP 请求），并等进行中的回合编排落库——
// 包括浏览器已断开、编排在后台继续的回合（orchestrator 登记在 inflight）——至多 graceMs（回合超时加余量），之后才关 PG 连接池。
// 超时仍没完的回合留下 running：超过回合超时后可被同 requestId 重新占位（LearningStore.claimRun 的 staleAfterMs），不会永远 busy。
// 平台的终止宽限期必须 ≥ graceMs（手册第 4 节），否则进程会在这之前被强杀。
export const SHUTDOWN_MARGIN_MS = 5_000

export interface ShutdownDeps {
  /** 停止接新请求并等进行中的 HTTP 请求（Fastify app.close） */
  close(): Promise<void>
  /** 进行中回合的 done */
  inflight: Set<Promise<unknown>>
  endPool(): Promise<void>
  graceMs: number
  log?(message: string): void
}

const sleep = (ms: number) => new Promise<'timeout'>((r) => { const t = setTimeout(() => r('timeout'), ms); t.unref?.() })

/** 等 inflight 里的回合（含等待期间新登记的）全部结束，至多 timeoutMs；全部结束返回 true */
export async function drainTurns(inflight: Set<Promise<unknown>>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const settled = new Set<Promise<unknown>>()
  for (;;) {
    const pending = [...inflight].filter((p) => !settled.has(p))
    if (pending.length === 0) return true
    const left = deadline - Date.now()
    if (left <= 0) return false
    if ((await Promise.race([Promise.allSettled(pending).then(() => 'done' as const), sleep(left)])) === 'timeout') return false
    for (const p of pending) settled.add(p)
  }
}

/** 返回幂等的停机函数：重复的信号只等同一次停机 */
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let running: Promise<void> | undefined
  return () => {
    running ??= (async () => {
      const deadline = Date.now() + deps.graceMs
      const closing = deps.close().catch(() => undefined)
      const drained = await drainTurns(deps.inflight, deps.graceMs)
      if (!drained) deps.log?.(`api-shutdown: ${deps.inflight.size} turn(s) still running after ${deps.graceMs}ms`)
      // app.close 也可能被挂住的连接拖住：同一个宽限期截止
      const left = deadline - Date.now()
      if (left > 0) await Promise.race([closing, sleep(left)])
      await deps.endPool().catch(() => undefined)
    })()
    return running
  }
}

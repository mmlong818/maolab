// api → harness 控制网关（spec 7.2）：命令走 HTTP，事件走 SSE；只带 X-Yunyi-Internal（生产 Kong 拦 Bearer）。
// 内部密钥只在服务端使用，绝不回给浏览器。网关语义（Task 3）：
// - prompt 的 200 只表示"已排队"，不表示回合已开始；回合以 yunyi/turn-final {runId} 收尾。
// - 被丢弃的排队消息（cancel/释放）各收到一帧 yunyi/turn-final {runId, cancelled: true}，见 turnFinalOf。
// - 排队超上限返回 429（HarnessError.queueFull）。
// - 续会话的 403（不是本人/归属未知）与 404 对浏览器必须是同一响应，不能借此探测会话是否存在（HarnessError.sessionUnavailable）。
// - 401 只说明 api 与 harness 的内部密钥不一致，绝不能作为 401 回给浏览器（浏览器会当成登录过期）。
// 每个控制调用、以及事件流建立（拿到响应头并读到 ": connected"）都有上限 timeoutMs（缺省 10 秒，配置 YUNYI_HARNESS_TIMEOUT_MS）：
// 超时 → HarnessError(504, kind 'timeout')；连不上或连接中断 → HarnessError(503/502, kind 'unreachable')；harness 回了非预期状态 → kind 'http'。
import http from 'node:http'
import https from 'node:https'
export type HarnessErrorKind = 'http' | 'timeout' | 'unreachable'
export class HarnessError extends Error {
  status: number
  kind: HarnessErrorKind
  constructor(status: number, message: string, kind: HarnessErrorKind = 'http') { super(message); this.name = 'HarnessError'; this.status = status; this.kind = kind }
  /** 403 与 404：对浏览器统一成同一个"会话不可用"响应 */
  get sessionUnavailable(): boolean { return this.status === 403 || this.status === 404 }
  /** 429：该会话排队的学生消息已满 */
  get queueFull(): boolean { return this.status === 429 }
}
export interface HarnessFrame { type: string; [k: string]: unknown }
/** 是该 runId 的收尾帧时返回 { cancelled }（cancelled = 排队中被丢弃，从未开始），否则 undefined */
export function turnFinalOf(frame: HarnessFrame, runId: string): { cancelled: boolean } | undefined {
  if (frame.type !== 'yunyi/turn-final' || frame.runId !== runId) return undefined
  return { cancelled: frame.cancelled === true }
}
export interface EnsureInput { sessionId: string; owner: string; credential?: string; preset: 'prep'; provider: string; model: string }
export interface EventStream { frames: AsyncIterable<HarnessFrame>; close(): void }
export interface HarnessClient {
  ensure(input: EnsureInput): Promise<'created' | 'resumed' | 'live'>
  create(input: EnsureInput): Promise<void>
  openEvents(sessionId: string): Promise<EventStream>
  /** 200 = 已排队。legacyMemoryOwners 每次都应传（网关把省略视为 []）；legacyMemoryBefore 随名单一起传（Ruling [final]，省略 = 网关清除、不回退） */
  prompt(sessionId: string, text: string, messageId: string, legacyMemoryOwners?: string[], legacyMemoryBefore?: string): Promise<void>
  cancel(sessionId: string): Promise<void>
  dispose(sessionId: string): Promise<void>
}

export interface HarnessClientOptions {
  timeoutMs?: number
  /** 事件流读正文的空闲上限（毫秒）；缺省 0 = 不限（Ruling [T8] F5）。只给测试复现"有正文超时时会断流"用，生产不设 */
  eventsIdleTimeoutMs?: number
}
export const DEFAULT_HARNESS_TIMEOUT_MS = 10_000
const isTimeout = (e: unknown): boolean => (e as { name?: string } | undefined)?.name === 'TimeoutError'
const timeoutError = (what: string, ms: number) => new HarnessError(504, `harness ${what} timed out after ${ms}ms`, 'timeout')
const unreachable = (e: unknown, status = 503) => new HarnessError(status, `harness unreachable${e instanceof Error ? ` (${e.name})` : ''}`, 'unreachable')

export function createHarnessClient(baseUrl: string, internalKey: string, opts: HarnessClientOptions = {}): HarnessClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HARNESS_TIMEOUT_MS
  const idleTimeoutMs = opts.eventsIdleTimeoutMs ?? 0
  const headers = { 'content-type': 'application/json', 'x-yunyi-internal': internalKey }
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
    let res: Response
    let text: string
    try {
      // 同一个 signal 覆盖等响应头与读正文
      res = await fetch(`${baseUrl}${path}`, { method, headers, signal: AbortSignal.timeout(timeoutMs), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      text = await res.text()
    } catch (e) {
      throw isTimeout(e) ? timeoutError(method, timeoutMs) : unreachable(e)
    }
    let json: Record<string, unknown> = {}
    try { json = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { json = {} }
    return { status: res.status, json }
  }
  const fail = (status: number, json: Record<string, unknown>): never => { throw new HarnessError(status, String(json.error ?? `harness ${status}`)) }
  const sessionBody = (i: EnsureInput) => ({ owner: i.owner, credential: i.credential, provider: i.provider, model: i.model })
  const client: HarnessClient = {
    async create(i) {
      const r = await call('POST', '/sessions', { sessionId: i.sessionId, preset: i.preset, ...sessionBody(i) })
      if (r.status !== 201) fail(r.status, r.json)
    },
    async ensure(i) {
      const r = await call('POST', `/sessions/${encodeURIComponent(i.sessionId)}/resume`, { preset: i.preset, ...sessionBody(i) })
      if (r.status === 200) return 'resumed'
      if (r.status === 409 && r.json.error === 'session is live') return 'live'
      if (r.status !== 404) fail(r.status, r.json)
      const c = await call('POST', '/sessions', { sessionId: i.sessionId, preset: i.preset, ...sessionBody(i) })
      if (c.status === 201) return 'created'
      if (c.status === 409 && c.json.error === 'session exists') return 'live'
      return fail(c.status, c.json)
    },
    async openEvents(sessionId) {
      // Ruling [T8] F5：事件流不走全局 fetch——undici 读正文默认 300 秒没有数据就断，网关不发保活，备课的工具调用会静默好几分钟。
      // 改用 node:http（独立连接，agent: false），读正文不设超时（eventsIdleTimeoutMs 缺省 0 = 不限，只给测试复现断流用）。
      // 建立阶段（拿到响应头并读到 ": connected"）仍由定时器限时 timeoutMs；读到之后清掉定时器；close() 或跳出帧循环时断开连接。
      const url = new URL(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/events?replay=0`)
      const request = url.protocol === 'https:' ? https.request : http.request
      let timedOut = false
      let closed = false
      let req: http.ClientRequest | undefined
      const disconnect = (): void => { closed = true; req?.destroy() }
      const timer = setTimeout(() => { timedOut = true; req?.destroy() }, timeoutMs)
      const decoder = new TextDecoder()
      let buf = ''
      let it: AsyncIterator<Buffer>
      try {
        let res: http.IncomingMessage
        try {
          res = await new Promise<http.IncomingMessage>((resolve, reject) => {
            req = request(url, { method: 'GET', headers, agent: false }, resolve)
            // 连接断开的错误之后也会再来（响应已到时由读正文处理）：监听器一直挂着，免得成为未处理的 'error'
            req.on('error', reject)
            req.end()
          })
        } catch (e) {
          throw timedOut ? timeoutError('events connect', timeoutMs) : unreachable(e)
        }
        const status = res.statusCode ?? 502
        if (status < 200 || status >= 300) { res.resume(); throw new HarnessError(status, `events ${status}`) }
        it = res[Symbol.asyncIterator]()
        // 等到 ": connected"：之后再 prompt，本回合的帧不会漏
        while (!buf.includes('\n\n')) {
          let chunk: IteratorResult<Buffer>
          try {
            chunk = await it.next()
          } catch (e) {
            throw timedOut ? timeoutError('events connect', timeoutMs) : unreachable(e, 502)
          }
          if (chunk.done) throw timedOut ? timeoutError('events connect', timeoutMs) : new HarnessError(502, 'events closed before connected', 'unreachable')
          buf += decoder.decode(chunk.value, { stream: true })
        }
      } catch (e) {
        disconnect()
        throw e
      } finally {
        clearTimeout(timer)
      }
      if (idleTimeoutMs > 0) {
        const live = req as http.ClientRequest | undefined
        live?.setTimeout(idleTimeoutMs, () => live.destroy(Object.assign(new Error('events idle timeout'), { name: 'BodyTimeoutError' })))
      }
      async function* frames(): AsyncGenerator<HarnessFrame> {
        try {
          for (;;) {
            let i: number
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i)
              buf = buf.slice(i + 2)
              const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
              if (data) { try { yield JSON.parse(data) as HarnessFrame } catch { /* 坏帧丢弃 */ } }
            }
            let chunk: IteratorResult<Buffer>
            try {
              chunk = await it.next()
            } catch (e) {
              // 本端 close() 断开的不算错误
              if (closed) return
              throw unreachable(e, 502)
            }
            if (chunk.done) return
            buf += decoder.decode(chunk.value, { stream: true })
          }
        } finally {
          // 调用方 break/return 跳出 for-await 也会走到这里：连接随之断开，不靠调用方记得 close()
          disconnect()
        }
      }
      return { frames: frames(), close: disconnect }
    },
    async prompt(sessionId, text, messageId, legacyMemoryOwners, legacyMemoryBefore) {
      const r = await call('POST', `/sessions/${encodeURIComponent(sessionId)}/prompt`, { text, messageId, ...(legacyMemoryOwners ? { legacyMemoryOwners } : {}), ...(legacyMemoryBefore ? { legacyMemoryBefore } : {}) })
      if (r.status !== 200) fail(r.status, r.json)
    },
    async cancel(sessionId) {
      const r = await call('POST', `/sessions/${encodeURIComponent(sessionId)}/cancel`)
      if (r.status !== 200 && r.status !== 404) fail(r.status, r.json)
    },
    async dispose(sessionId) {
      const r = await call('DELETE', `/sessions/${encodeURIComponent(sessionId)}`)
      if (r.status !== 204 && r.status !== 404) fail(r.status, r.json)
    },
  }
  return client
}

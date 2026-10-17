// 启动 maolab-prep-host 进程并提供控制网关的 HTTP / SSE 客户端。
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve, join } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const hostDir = resolve(import.meta.dirname, '..', '..')
const dshBin = join(hostDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

export const INTERNAL_KEY = 'test-internal-key'

const GATEWAY_READY_RE = /yunyi-gateway listening on (http:\/\/[^\s]+)/

export interface EventFrame { type: string; [key: string]: unknown }
export interface EventsHandle {
  received: EventFrame[]
  waitFor(pred: (e: EventFrame) => boolean, timeoutMs?: number): Promise<EventFrame>
  close(): Promise<void>
}
export interface HostHandle {
  base: string
  child: ChildProcess
  api(method: string, route: string, body?: unknown, opts?: { key?: string }): Promise<{ status: number; json: unknown }>
  events(sessionId: string): EventsHandle
  stop(): Promise<void>
}

function spawnHost(extraEnv: Record<string, string>): ChildProcess {
  return spawn(process.execPath, [dshBin, '--profile', 'maolab-prep-host'], {
    cwd: hostDir,
    env: {
      ...process.env,
      DSH_HOME: join(hostDir, '.dsh-home'),
      YUNYI_GATEWAY_PORT: '0',
      YUNYI_SESSIONS_ROOT: fs.mkdtempSync(join(os.tmpdir(), 'yunyi-sessions-')),
      YUNYI_INTERNAL_KEY: INTERNAL_KEY,
      FAKE_API_KEY: 'fake-key',
      NODE_OPTIONS: '--experimental-strip-types --no-warnings',
      YUNYI_DIAGNOSTIC_TOOLS: '1',
      YUNYI_TEST_PRESETS: '1',
      NO_PROXY: '127.0.0.1,localhost',
      // 默认 jsonl 模式：CI 在 job 级设了 YUNYI_PG_URL，不清掉的话不需要 PG 的用例会写进生产 harness schema。
      // 需要 PG 的用例自己在 extraEnv 里传 YUNYI_PG_URL/YUNYI_PG_SCHEMA。
      YUNYI_PG_URL: '',
      // PG 模式下教学/知识点 schema 默认指向不存在的测试名：测试不得写真实 learning、读真实 knowledge；需要的用例自己传
      YUNYI_TEACHING_SCHEMA: 'harness_test_teaching_absent',
      YUNYI_KNOWLEDGE_SCHEMA: 'harness_test_knowledge_absent',
      // 记忆同理：PG 模式下测试不得写真实 memory，需要的用例自己传
      YUNYI_MEMORY_SCHEMA: 'harness_test_memory_absent',
      // 备课同理（3c）：PG 模式下 yunyi-prep 缺省不得读写真实 course、knowledge，需要的用例自己传
      YUNYI_COURSE_SCHEMA: 'harness_test_course_absent',
      YUNYI_PREP_KNOWLEDGE_SCHEMA: 'harness_test_knowledge_absent',
      // 4b：公共库同理，PG 模式下缺省不读真实 publication；需要的用例自己传
      YUNYI_PUBLICATION_SCHEMA: 'harness_test_publication_absent',
      NODE_ENV: 'test',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** 启动宿主并等它自己退出（用于断言启动失败）；返回退出码与 stderr。 */
export async function runHostToExit(extraEnv: Record<string, string> = {}, opts: { timeoutMs?: number } = {}): Promise<{ code: number | null; stderr: string }> {
  const child = spawnHost(extraEnv)
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  child.stdout?.resume()
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`host did not exit within ${opts.timeoutMs ?? 90_000}ms; stderr: ${stderr.slice(-2000)}`)) }, opts.timeoutMs ?? 90_000)
    child.once('exit', (code) => { clearTimeout(timer); resolveExit({ code, stderr }) })
  })
}

export async function startHost(extraEnv: Record<string, string> = {}, opts: { readyTimeoutMs?: number } = {}): Promise<HostHandle> {
  const readyTimeoutMs = opts.readyTimeoutMs ?? 90_000
  const logPath = join(hostDir, 'host-test.log')
  const log = fs.createWriteStream(logPath, { flags: 'a' })
  const child = spawnHost(extraEnv)
  let base = ''
  const ready = new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`host not ready within ${readyTimeoutMs}ms; see ${logPath}`)), readyTimeoutMs)
    const onLine = (line: string) => {
      const m = GATEWAY_READY_RE.exec(line)
      if (m?.[1]) {
        base = m[1]
        clearTimeout(timer)
        resolveReady()
      }
    }
    for (const stream of [child.stdout, child.stderr]) {
      let buf = ''
      stream?.on('data', (chunk: Buffer) => {
        log.write(chunk)
        buf += chunk.toString()
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          onLine(buf.slice(0, i))
          buf = buf.slice(i + 1)
        }
      })
    }
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`host exited early with code ${code}; see ${logPath}`))
    })
  })
  await ready
  const headers = { 'content-type': 'application/json', 'x-yunyi-internal': INTERNAL_KEY }
  return {
    base,
    child,
    async api(method, route, body, { key = INTERNAL_KEY } = {}) {
      const res = await fetch(base + route, {
        method,
        headers: { ...headers, 'x-yunyi-internal': key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const text = await res.text()
      let json: unknown
      try { json = text ? JSON.parse(text) : undefined } catch { json = text }
      return { status: res.status, json }
    },
    events(sessionId) {
      const received: EventFrame[] = []
      const waiters: Array<{ pred: (e: EventFrame) => boolean; resolve: (e: EventFrame) => void }> = []
      const notify = () => {
        for (const w of [...waiters]) {
          const hit = received.find(w.pred)
          if (hit) { waiters.splice(waiters.indexOf(w), 1); w.resolve(hit) }
        }
      }
      const controller = new AbortController()
      const done = fetch(`${base}/sessions/${sessionId}/events`, { headers, signal: controller.signal }).then(async (res) => {
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done: finished } = await reader.read()
          if (finished) break
          buf += dec.decode(value, { stream: true })
          let i: number
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
            if (data) { received.push(JSON.parse(data) as EventFrame); notify() }
          }
        }
      }).catch((e: unknown) => { if ((e as { name?: string }).name !== 'AbortError') throw e })
      return {
        received,
        waitFor(pred, timeoutMs = 60_000) {
          const hit = received.find(pred)
          if (hit) return Promise.resolve(hit)
          return new Promise<EventFrame>((resolveWait, reject) => {
            const t = setTimeout(() => reject(new Error(`timeout waiting for event; got ${received.length} events: ${received.map((e) => e.type).join(',')}`)), timeoutMs)
            waiters.push({ pred, resolve: (v) => { clearTimeout(t); resolveWait(v) } })
          })
        },
        close() { controller.abort(); return done },
      }
    },
    async stop() {
      // 被信号杀掉的进程 exitCode 仍是 null（signalCode 有值）：两者都为空才算还活着，否则会永远等不到 exit
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
        await new Promise((r) => child.once('exit', r))
      }
      log.end()
    },
  }
}

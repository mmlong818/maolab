// 仅测试 preset（probe-*，YUNYI_TEST_PRESETS=1 才启用）挂载的探针工具；正式 preset 不挂。
// probe_job / probe_subagent 验证身份沿后台 job 与 fork 子代理传播（spec 14 条件 3）：
// 不读工具闭包里的 sessionId——job 内从 dsh 的异步发起者上下文（ctx.agents.currentInitiator()）解析身份，
// 并不带 sessionId 发一次 yunyi 模型请求，由模型适配器自己解析凭证；子代理里由 whoami 与子会话自身的模型请求证明。
import { createHash } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'yunyi-diagnostics-probe'
export const inject = ['tools', 'jobs', 'subagents', 'yunyiSessions', 'agents', 'llm']

interface ProbeAgent { id: unknown }
type JobOutcome = { status: 'completed' | 'killed' | 'failed'; result?: string; detail?: string }

interface ProbeCtx {
  tools: { register(tool: unknown): unknown }
  emit(event: string, payload: unknown): unknown
  jobs: {
    start(spec: { kind: string; label: string; owner?: string; run(job: { id: string }): { cancel(reason?: string): void; done: Promise<JobOutcome> } }): string
    get(id: string, caller?: string): { owner?: string }
    wait(id: string, timeoutMs: number, caller?: string): Promise<unknown>
    read(id: string, caller?: string): { result?: string }
    attachController(name: string): () => void
  }
  subagents: { start(provider: string, request: { label: string; prompt: Array<{ type: 'text'; text: string }>; parent: unknown; signal: AbortSignal }): Promise<{ id: unknown; localAgent?: { session?: { deriveMessages?(): Array<{ role?: string; content?: unknown }> } }; result: Promise<{ stopReason?: string }>; dispose?(): Promise<void> | void }> }
  yunyiSessions: { ownerOf(agent: ProbeAgent): string | undefined; credentialOf(agent: ProbeAgent): string | undefined }
  agents: { currentInitiator(): ProbeAgent | undefined }
  llm: { stream(options: { provider: string; model: string; messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>; signal?: AbortSignal }): AsyncIterable<{ type: string; reason?: { kind?: string; failure?: unknown } }> }
}

const fingerprint = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12)

// 并发屏障：同一 key 的 job 都进入后才一起放行，证明多个会话的 job 在时间上确实重叠（不是先后执行）。
// 超时即失败，不静默放行。
const barriers = new Map<string, { entered: number; release: () => void; released: Promise<void> }>()
async function barrier(key: string, parties: number, timeoutMs: number): Promise<void> {
  let b = barriers.get(key)
  if (!b) {
    let release!: () => void
    const released = new Promise<void>((r) => { release = r })
    b = { entered: 0, release, released }
    barriers.set(key, b)
  }
  b.entered += 1
  if (b.entered >= parties) { barriers.delete(key); b.release() }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`barrier ${key} timed out with ${b.entered}/${parties} parties`)), timeoutMs) })
  try { await Promise.race([b.released, timeout]) } finally { clearTimeout(timer) }
}

export function apply(ctx: ProbeCtx): void {
  // 本 preset 没挂 dsh-tool-jobs：jobs.start 要求有控制器服务该 owner，探针自己挂一个（作用域 = 本 preset 下组合的 agent）
  ctx.jobs.attachController('yunyi-diagnostics-probe')

  ctx.tools.register(defineTool({
    name: 'probe_emit',
    description: '测试用：发一个事件。',
    parameters: {
      type: { type: 'string', required: true, description: '事件名' },
      payload: { type: 'json', description: '载荷对象；$big 为 true 时放一个 BigInt' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const agent = exec.agent
      const raw = typeof args.payload === 'object' && args.payload !== null && !Array.isArray(args.payload) ? { ...(args.payload as Record<string, unknown>) } : {}
      if (raw.$big === true) { delete raw.$big; raw.big = 1n }
      ctx.emit('probe/internal', { agent, secret: 'must-not-leak' })
      ctx.emit(String(args.type), { ...raw, agent })
      return { ok: true }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'probe_job',
    description: '测试用：在后台任务里解析本会话身份。',
    parameters: {
      barrier: { type: 'string', description: '并发屏障 key；同 key 的 job 都进入后才一起继续' },
      parties: { type: 'integer', description: '屏障需要的 job 数，缺省 1（不等待）' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const barrierKey = typeof args.barrier === 'string' ? args.barrier : undefined
      const parties = typeof args.parties === 'number' ? args.parties : 1
      const caller = String((exec.agent as ProbeAgent).id) // 只用于 jobs 的归属围栏；job 内不读它
      const id = ctx.jobs.start({
        kind: 'probe',
        label: 'identity probe',
        owner: caller,
        run: (job) => ({
          cancel: () => undefined,
          done: (async (): Promise<JobOutcome> => {
            try {
              const enteredAt = Date.now()
              if (barrierKey) await barrier(barrierKey, parties, 20_000)
              const agent = ctx.agents.currentInitiator()
              if (!agent) return { status: 'completed', result: JSON.stringify({ owner: null, credential: null, jobId: job.id, enteredAt, finishedAt: Date.now() }) }
              // 归属对账：注册表记录的 job owner 必须就是运行时发起者（非 owner 读本身也会抛）
              const registered = ctx.jobs.get(job.id, String(agent.id)).owner
              if (registered !== String(agent.id)) throw new Error(`job owner ${String(registered)} is not the initiator ${String(agent.id)}`)
              // 真实模型请求：不带 sessionId，凭证由 yunyi 适配器从运行时上下文解析
              for await (const chunk of ctx.llm.stream({ provider: 'yunyi', model: 'glm-test', messages: [{ role: 'user', content: [{ type: 'text', text: `JOB-PROBE ${job.id}` }] }] })) {
                if (chunk.type === 'finish' && chunk.reason?.kind === 'error') throw new Error(`model call failed: ${JSON.stringify(chunk.reason.failure ?? chunk.reason)}`)
              }
              const credential = ctx.yunyiSessions.credentialOf(agent)
              return { status: 'completed', result: JSON.stringify({ owner: ctx.yunyiSessions.ownerOf(agent) ?? null, credential: credential ? fingerprint(credential) : null, jobId: job.id, enteredAt, finishedAt: Date.now() }) }
            } catch (e) {
              return { status: 'failed', detail: String((e as Error).message ?? e) }
            }
          })(),
        }),
      })
      const view = await ctx.jobs.wait(id, 30_000, caller) as { status?: string; detail?: string }
      if (view.status !== 'completed') return { error: `job ${view.status ?? 'unknown'}: ${view.detail ?? ''}` }
      return JSON.parse(ctx.jobs.read(id, caller).result ?? '{}') as Record<string, string | number | null>
    },
  }))

  ctx.tools.register(defineTool({
    name: 'probe_subagent',
    description: '测试用：起一个 fork 子代理，让它调用 whoami。',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      // prompt 里的父 id 只是测试对账标签（whoami 忽略 claimedOwner）；子代理的身份与凭证由运行时沿父链解析
      const tag = `forged-${String((exec.agent as ProbeAgent).id)}`
      const run = await ctx.subagents.start('fork', { label: 'identity probe', prompt: [{ type: 'text', text: `TOOL:whoami:${JSON.stringify({ claimedOwner: tag })}` }], parent: exec.agent, signal: exec.signal })
      try {
        const result = await run.result
        const messages = run.localAgent?.session?.deriveMessages?.() ?? []
        let whoami: Record<string, string | null> | null = null
        for (const m of messages) {
          const blocks = Array.isArray(m.content) ? (m.content as Array<{ type?: string; text?: string }>) : []
          for (const b of blocks) {
            if (b.type !== 'text' || !b.text?.includes('"owner"')) continue
            try { whoami = JSON.parse(b.text) as Record<string, string | null> } catch { /* 不是 whoami 的结果 */ }
          }
        }
        return { childId: String(run.id), stopReason: String(result.stopReason ?? ''), whoami }
      } finally {
        await run.dispose?.()
      }
    },
  }))
}

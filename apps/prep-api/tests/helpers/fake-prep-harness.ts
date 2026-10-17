import { FrameQueue } from '../../src/harness/queue.ts'
import { HarnessError, type HarnessClient, type HarnessFrame } from '../../src/harness/client.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** cancelled：这条在网关里被丢弃（只发一帧 cancelled 的 turn-final，没有草稿与工具帧；同 id 重试时先 cancelled 再 completed，Task 2 实测） */
export type FakeStep = { ms: number; tools?: Array<Record<string, unknown>>; reply?: string; cancelled?: true }
type Step = FakeStep
/** gatewayCancel：cancel 按网关语义丢弃排队的消息并中止当前回合（各发一帧 cancelled 的 turn-final）；缺省只记录调用。
 *  lostAck：返回 true 的消息照常收下排队，但 prompt 的答复"丢了"——抛 HarnessError(504, kind 'timeout')（终审 M5） */
export function fakeHarness(script: (text: string) => Step, opts: { queueFullAfter?: number; gatewayCancel?: boolean; lostAck?: (text: string) => boolean } = {}) {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const subscribers = new Map<string, Set<FrameQueue<HarnessFrame>>>()
  const chains = new Map<string, Promise<void>>()
  let prompts = 0
  // gatewayCancel 用：每个会话已 prompt、还没收尾的消息（按顺序），被取消的不再发草稿与收尾帧
  const live = new Map<string, Array<{ id: string; dropped: boolean }>>()
  const publish = (sid: string, frame: HarnessFrame) => { for (const q of subscribers.get(sid) ?? []) q.push(frame) }
  const client: HarnessClient = {
    async ensure(i) { calls.push({ op: 'ensure', args: [i.sessionId, i.owner, i.credential, i.preset] }); return 'created' },
    async create() { calls.push({ op: 'create', args: [] }) },
    async openEvents(sid) {
      const q = new FrameQueue<HarnessFrame>()
      const set = subscribers.get(sid) ?? new Set<FrameQueue<HarnessFrame>>()
      set.add(q)
      subscribers.set(sid, set)
      return { frames: q, close: () => { set.delete(q); q.end() } }
    },
    async prompt(sid, text, messageId) {
      prompts += 1
      if (opts.queueFullAfter !== undefined && prompts > opts.queueFullAfter) throw new HarnessError(429, 'too many queued messages')
      calls.push({ op: 'prompt', args: [sid, text, messageId] })
      const step = script(text)
      const entry = { id: messageId, dropped: false }
      live.set(sid, [...(live.get(sid) ?? []), entry])
      const next = (chains.get(sid) ?? Promise.resolve()).then(async () => {
        if (entry.dropped) return
        // 先等 50 ms：让排在后面的请求已经连上流，前一回合的草稿与工具帧才会真的流到它那里（帧归属测试靠这个）
        await sleep(50)
        // 这 50 ms 里被取消的：网关已丢弃，不再出草稿
        if (entry.dropped) return
        if (step.cancelled) { publish(sid, { type: 'yunyi/turn-final', runId: messageId, cancelled: true }); return }
        publish(sid, { type: 'agent/assistant-stream', frame: { type: 'chunk', chunk: { type: 'text', text: `草稿:${text}` } } })
        for (const t of step.tools ?? []) publish(sid, { type: 'tool/result', data: { message: { content: [{ type: 'text', text: JSON.stringify(t) }] } } })
        await sleep(step.ms)
        if (entry.dropped) return
        live.set(sid, (live.get(sid) ?? []).filter((e) => e !== entry))
        publish(sid, {
          type: 'yunyi/turn-final', runId: messageId, prep: true, assistantMessageId: `a-${messageId}`, reply: step.reply ?? `回复:${text}`, outcome: 'completed',
          tools: (step.tools ?? []).map((t) => ({ ok: t.ok, ...((t.course as { courseId?: string } | undefined)?.courseId ? { courseId: (t.course as { courseId: string }).courseId } : {}) })),
        })
      })
      chains.set(sid, next)
      if (opts.lostAck?.(text)) throw new HarnessError(504, 'harness POST timed out', 'timeout')
    },
    async cancel(sid) {
      calls.push({ op: 'cancel', args: [sid] })
      if (!opts.gatewayCancel) return
      for (const e of live.get(sid) ?? []) { e.dropped = true; publish(sid, { type: 'yunyi/turn-final', runId: e.id, cancelled: true }) }
      live.delete(sid)
    },
    async dispose() { calls.push({ op: 'dispose', args: [] }) },
  }
  return { client, calls, publish, count: (op: string) => calls.filter((c) => c.op === op).length }
}

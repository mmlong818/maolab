// 3d：备课的一轮（spec 8.2 备课场景排队）。与 2e startStandardTurn 的差异（计划"已定事实"）：
// - 不抢占：从不为了新消息去 cancel；网关按会话排队，本 run 等自己 runId 的收尾帧（Task 2 的 prep turn-final）；
// - 帧归属：派发在会话级互斥里做（网关里的排队顺序 = 派发顺序），前面已派发、还没收尾的回合的帧一律不转；
// - 超时按 prep.turnTimeoutMs（缺省 30 分钟），从派发前开始计；超时只在本会话没有别的进行中回合时取消；
// - 幂等：同 requestId 已完成回放、进行中返回 running（路由回 202，不重复派发）、失败或过期重新占位；
// - 不扣配额（成人账号）、不进 inflight 排水（api 重启后过期可重占，课程状态在工具写的库里）。
// 收尾帧按"回合结束"计，不按 id 去重（Ruling [T2/T8] F4，Task 2 实测 dsh 接受重复的 messageId）：
// - 重试沿用同一个 run id（= messageId）。上一次派发若还在网关里，它的收尾帧（completed，或被丢弃时的 cancelled）先到：
//   派发时记下排在前面的派发（可重复的 id 列表），同 id 的收尾帧先抵掉前面那一次，再下一帧才是本次的；
// - dsh 可能在没有新消息时结束一个回合，帧沿用上一个 runId：既不在前面、也不是本次的收尾帧一律忽略；
// - 超时而没取消时（别的回合还在），本次仍在网关里排着：后台接着读流直到它的收尾帧（至多再一个超时），再从派发登记里移除，
//   免得登记一直挂着、压住之后回合的草稿与工具帧（预检 F15）。
// 领取栅栏（T1）：completeRun/failRun 带 startRun 拿到的 claim；返回 false = 已被别人回收，不覆盖对方的结果。
// 编排与响应写出分离：浏览器断开不影响落库。日志只写类别，不写原话与回复。
import type { OwnerPrepConversations, PrepReply, PrepRunRow, PrepSessionRow, PrepToolOutcome } from '@maolab/domain'
import { HarnessError, turnFinalOf, type EventStream, type HarnessClient, type HarnessFrame } from '../harness/client.ts'
import { FrameQueue, inputHash } from '../harness/queue.ts'
import { prepStaleMs, type PrepConfig } from './config.ts'
import { createPrepFrameMapper, sessionDto, type PrepDoneBody, type PrepFrame } from './frames.ts'

export const PREP_TURN_TEXT = {
  failed: '备课助理这一步没有完成，请稍后重试；课程里已经保存的内容不受影响。',
  timeout: '等了太久没有结果：备课助理可能还在处理，稍后在右侧面板查看课程状态，或重新发送。',
  cancelled: '这一条已取消。',
  queueFull: '排队的消息太多了，请等前面的处理完再发。',
} as const

/** 单副本 api 进程内：每个会话"已交给 harness、还没见到收尾帧"的派发（按派发顺序；同一个 run 重试时可出现两次）与会话级派发互斥 */
export class PrepDispatchLog {
  private readonly bySession = new Map<string, string[]>()
  private readonly locks = new Map<string, Promise<unknown>>()
  async exclusive<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve()
    const run = previous.then(fn, fn)
    const settled = run.then(() => undefined, () => undefined)
    this.locks.set(sessionId, settled)
    void settled.then(() => { if (this.locks.get(sessionId) === settled) this.locks.delete(sessionId) })
    return run
  }
  /** 每次派发记一条：同一个 run 的上一次派发还在网关里时，重试会再记一条 */
  dispatched(sessionId: string, runId: string): void {
    const list = this.bySession.get(sessionId) ?? []
    list.push(runId)
    this.bySession.set(sessionId, list)
  }
  /** 只由派发者本人在见到自己的收尾帧（或放弃等待）时调用；移除最早的一条 */
  finished(sessionId: string, runId: string): void {
    const list = this.bySession.get(sessionId) ?? []
    const i = list.indexOf(runId)
    if (i >= 0) list.splice(i, 1)
    if (list.length === 0) this.bySession.delete(sessionId)
  }
  pending(sessionId: string): string[] { return [...(this.bySession.get(sessionId) ?? [])] }
}

export interface PrepTurnDeps { harness: HarnessClient; prep: PrepConfig; provider: string; model: string; dispatch: PrepDispatchLog; log(message: string): void; now?: () => number }
export interface PrepTurnInput { owner: string; credential: string; conversations: OwnerPrepConversations; session: PrepSessionRow; content: string; harnessText: string; requestId: string }
export type PrepTurnOutcome =
  | { kind: 'replayed'; body: PrepDoneBody }
  | { kind: 'running'; runId: string }
  | { kind: 'started'; runId: string; frames: AsyncIterable<PrepFrame>; done: Promise<PrepDoneBody | undefined> }

class MissingPrepFinalError extends Error { constructor() { super('prep turn-final without assistant message'); this.name = 'MissingPrepFinalError' } }
const reasonOf = (e: unknown): string => (e instanceof Error ? e.name : 'error')

function replyOf(frame: HarnessFrame): PrepReply {
  if (frame.prep !== true || typeof frame.assistantMessageId !== 'string' || !frame.assistantMessageId) throw new MissingPrepFinalError()
  const tools: PrepToolOutcome[] = (Array.isArray(frame.tools) ? frame.tools : [])
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object' && typeof (t as { ok?: unknown }).ok === 'boolean')
    .map((t) => ({
      ...(typeof t.name === 'string' && t.name ? { name: t.name } : {}),
      ok: t.ok as boolean,
      ...(typeof t.reason === 'string' ? { reason: t.reason } : {}),
      ...(typeof t.courseId === 'string' ? { courseId: t.courseId } : {}),
    }))
  const modelError = frame.modelError === 'quota' || frame.modelError === 'credential' ? frame.modelError : undefined
  return { messageId: frame.assistantMessageId, content: typeof frame.reply === 'string' ? frame.reply : '', outcome: frame.outcome === 'failed' ? 'failed' : 'completed', tools, ...(modelError ? { modelError } : {}) }
}

export function doneBodyOf(session: PrepSessionRow, run: Pick<PrepRunRow, 'id'>, reply: PrepReply, createdAt: number): PrepDoneBody {
  return {
    runId: run.id, session: sessionDto(session),
    message: { id: reply.messageId, role: 'assistant', content: reply.content, createdAt },
    tools: reply.tools, outcome: reply.outcome, ...(reply.modelError ? { modelError: reply.modelError } : {}),
  }
}

type Next = IteratorResult<HarnessFrame> | 'timeout'

export async function startPrepTurn(deps: PrepTurnDeps, input: PrepTurnInput): Promise<PrepTurnOutcome> {
  const now = deps.now ?? Date.now
  const { conversations, session } = input
  const { harness, dispatch } = deps
  const staleAfterMs = prepStaleMs(deps.prep)
  const started = await conversations.startRun(session.id, { requestId: input.requestId, inputHash: inputHash(input.content), content: input.content, staleAfterMs })
  const run = started.run
  if (started.kind === 'completed' && run.reply) return { kind: 'replayed', body: { ...doneBodyOf((await conversations.getSession(session.id)) ?? session, run, run.reply, run.updatedAt), replayed: true } }
  if (started.kind !== 'claimed') return { kind: 'running', runId: run.id }
  const claim = run.claim
  const queue = new FrameQueue<PrepFrame>()
  const mapFrame = createPrepFrameMapper()

  const drive = async (): Promise<PrepDoneBody | undefined> => {
    let events: EventStream | undefined
    let it: AsyncIterator<HarnessFrame> | undefined
    let pendingNext: Promise<IteratorResult<HarnessFrame>> | undefined
    let timedOut = false
    let onTimeout: (() => void) | undefined
    // prompt 已被网关接受、还没见到本次的收尾帧
    let inHarness = false
    // prompt 没拿到明确答复（超时/断连）：可能已在网关里（终审 M5）
    let uncertain = false
    let draining = false
    let final: HarnessFrame | undefined
    // 派发时排在本次前面、还没收尾的派发（可含本 run 的上一次派发）；收尾帧按先后抵掉
    const earlier: string[] = []
    const timer = setTimeout(() => { timedOut = true; onTimeout?.() }, deps.prep.turnTimeoutMs)

    /** 收尾帧的归属：前面的派发 → earlier；本次 → own；其余（已结束且没有重试的 run、排在后面被丢弃的）→ ignore */
    const classify = (frame: HarnessFrame): 'own' | 'earlier' | 'ignore' | 'frame' => {
      if (frame.type !== 'yunyi/turn-final' || typeof frame.runId !== 'string') return 'frame'
      const i = earlier.indexOf(frame.runId)
      if (i >= 0) { earlier.splice(i, 1); return 'earlier' }
      return turnFinalOf(frame, run.id) ? 'own' : 'ignore'
    }
    const next = (): Promise<Next> => {
      const p = (pendingNext ??= it!.next())
      return new Promise<Next>((resolve, reject) => {
        if (timedOut) { resolve('timeout'); return }
        // 超时先到时，p 稍后落定的帧留在 pendingNext 给 drain 接着读（fix round 1 M1），这里不再清掉
        let expired = false
        onTimeout = () => { expired = true; resolve('timeout') }
        p.then((r) => { if (expired) return; onTimeout = undefined; pendingNext = undefined; resolve(r) }, (e: unknown) => { if (expired) return; onTimeout = undefined; pendingNext = undefined; reject(e) })
      })
    }
    /** 超时没取消：本次仍在网关里。后台读到它的收尾帧（至多再一个超时）再移出派发登记；不碰库、不写浏览器帧 */
    const drain = async (): Promise<void> => {
      const giveUp = setTimeout(() => { deps.log('prep-turn: drain gave up'); events?.close() }, deps.prep.turnTimeoutMs)
      try {
        for (;;) {
          const r = await (pendingNext ?? it!.next())
          pendingNext = undefined
          if (r.done || classify(r.value) === 'own') return
        }
      } catch {
        // 流断了：放弃等待
      } finally {
        clearTimeout(giveUp)
        dispatch.finished(session.id, run.id)
        events?.close()
      }
    }

    try {
      await dispatch.exclusive(session.id, async () => {
        await harness.ensure({ sessionId: session.id, owner: input.owner, credential: input.credential, preset: 'prep', provider: deps.provider, model: deps.model })
        if (timedOut) throw new Error('timeout')
        events = await harness.openEvents(session.id)
        if (timedOut) throw new Error('timeout')
        earlier.push(...dispatch.pending(session.id))
        try {
          await harness.prompt(session.id, input.harnessText, run.id)
        } catch (e) {
          // 终审 M5：prompt 超时或连接中断时网关可能已经收下（200 没回来）。按"可能在网关里"登记，交给下面的收尾：
          // 本会话独自在跑就取消；有别的回合就后台读流等它的收尾帧——它的草稿与工具帧不会漏进之后请求的草稿。
          // harness 回了明确的状态（429 等）= 没收下，照旧
          if (e instanceof HarnessError && e.kind !== 'http') {
            dispatch.dispatched(session.id, run.id)
            inHarness = true
            uncertain = true
          }
          throw e
        }
        dispatch.dispatched(session.id, run.id)
        inHarness = true
      })
      if (earlier.length > 0) queue.push({ type: 'queued', ahead: earlier.length })
      it = events!.frames[Symbol.asyncIterator]()
      for (;;) {
        const r = await next()
        if (r === 'timeout' || r.done) break
        const kind = classify(r.value)
        if (kind === 'own') {
          inHarness = false
          dispatch.finished(session.id, run.id)
          final = r.value
          break
        }
        if (kind !== 'frame' || earlier.length > 0) continue
        const mapped = mapFrame(r.value)
        if (mapped) queue.push(mapped)
      }
      if (!final) throw new Error(timedOut ? 'timeout' : 'events ended')
      if (final.cancelled === true) {
        if (!(await conversations.failRun(run.id, 'cancelled', claim))) deps.log('prep-turn: superseded')
        queue.push({ type: 'error', error: PREP_TURN_TEXT.cancelled, code: 'PREP_CANCELLED' })
        return undefined
      }
      const reply = replyOf(final)
      if (!(await conversations.completeRun(run.id, reply, claim))) {
        // 已被别人回收（claim 变了）：结果归对方，这里不覆盖、不改会话的课程绑定
        deps.log('prep-turn: superseded')
        queue.push({ type: 'error', error: PREP_TURN_TEXT.failed, code: 'PREP_FAILED' })
        return undefined
      }
      const lastCourse = [...reply.tools].reverse().find((t) => t.courseId)?.courseId
      const row = (lastCourse && lastCourse !== session.courseId ? await conversations.bindCourse(session.id, lastCourse) : await conversations.getSession(session.id)) ?? session
      const body = doneBodyOf(row, run, reply, now())
      queue.push({ type: 'done', ...body })
      return body
    } catch (e) {
      // 收到收尾帧之后的失败（库出错、收尾帧缺消息 id）不算超时
      const reason = timedOut && !final ? 'timeout' : e instanceof HarnessError && e.queueFull ? 'queue-full' : reasonOf(e)
      deps.log(`prep-turn: failed (${reason})`)
      if (inHarness) {
        // 只在本会话没有别的进行中回合时取消：网关的 cancel 会丢弃整个会话的排队消息。
        // 检查、取消与移出登记都在会话派发互斥里（fix round 1 M2）：新回合领取后才进锁派发，
        // 所以锁内的检查要么看得见它，要么它在取消之后才派发，不会被这次取消丢掉
        await dispatch.exclusive(session.id, async () => {
          const others = (await conversations.activeRuns({ sessionId: session.id, staleAfterMs }).catch(() => [])).filter((r) => r.id !== run.id)
          if (others.length === 0) {
            await harness.cancel(session.id).catch(() => undefined)
            dispatch.finished(session.id, run.id)
          } else if ((reason === 'timeout' || uncertain) && events) {
            // 流还活着：交给后台读到本次的收尾帧（prompt 没有明确答复时同样处理；没收下的话 drain 至多等一个超时后放弃）
            it ??= events.frames[Symbol.asyncIterator]()
            draining = true
            void drain()
          } else {
            // 流已断：等不到收尾帧了
            dispatch.finished(session.id, run.id)
          }
        })
      }
      if (!(await conversations.failRun(run.id, reason, claim).catch(() => true))) deps.log('prep-turn: superseded')
      const text = reason === 'timeout' ? PREP_TURN_TEXT.timeout : reason === 'queue-full' ? PREP_TURN_TEXT.queueFull : PREP_TURN_TEXT.failed
      const code = reason === 'timeout' ? 'PREP_TIMEOUT' : reason === 'queue-full' ? 'PREP_QUEUE_FULL' : 'PREP_FAILED'
      queue.push({ type: 'error', error: text, code })
      return undefined
    } finally {
      clearTimeout(timer)
      onTimeout = undefined
      if (!draining) events?.close()
      queue.end()
    }
  }
  return { kind: 'started', runId: run.id, frames: queue, done: drive() }
}

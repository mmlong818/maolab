import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { applyCourseDdl, PgPrepConversations } from '@maolab/domain'
import type { HarnessClient } from '../src/harness/client.ts'
import { readConfig } from '../src/config.ts'
import { PrepDispatchLog, startPrepTurn, type PrepTurnDeps } from '../src/prep/turn.ts'
import { createPrepFrameMapper, type PrepFrame } from '../src/prep/frames.ts'
import { testPool } from './helpers/db.ts'
import { fakeHarness } from './helpers/fake-prep-harness.ts'

const pool = testPool()
const SCHEMA = 'course_test_prep_turn'
const OWNER = 'course_test_prep_turn_t'
const store = new PgPrepConversations(pool, { schema: SCHEMA })
const conversations = store.forOwner(OWNER)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function deps(harness: HarnessClient, turnTimeoutMs = 1_500): PrepTurnDeps {
  // 自习室导师的超时变量设成 100 ms：备课回合只看 prep.turnTimeoutMs
  const config = readConfig({ YUNYI_PREP: 'off', YUNYI_TURN_TIMEOUT_MS: '100', YUNYI_PREP_TURN_TIMEOUT_MS: String(turnTimeoutMs) })
  return { harness, prep: config.prep, provider: 'fake', model: 'fake-1', dispatch: new PrepDispatchLog(), log: () => undefined }
}
async function collect(frames: AsyncIterable<PrepFrame>): Promise<PrepFrame[]> {
  const out: PrepFrame[] = []
  for await (const f of frames) out.push(f)
  return out
}
const input = (session: Awaited<ReturnType<typeof conversations.createSession>>, content: string, requestId: string) =>
  ({ owner: OWNER, credential: 'cred-t', conversations, session, content, harnessText: `${content}\n\n〔面板当前课程：c-1〕`, requestId })

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0) on conflict do nothing', [OWNER])
  await applyCourseDdl(pool, SCHEMA)
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = $1', [OWNER])
  await pool.end()
})

describe('prep turns', () => {
  test('two messages in one session queue (no cancel), finish in dispatch order, and the second stream never shows the first turn’s frames', async () => {
    const h = fakeHarness((text) => ({ ms: 300, tools: text.startsWith('一') ? [{ ok: true, course: { courseId: 'c-q' } }] : [] }))
    const d = deps(h.client)
    const session = await conversations.createSession({ title: '排队' })
    const first = await startPrepTurn(d, input(session, '一：建课', 'req-queue-01'))
    const second = await startPrepTurn(d, input(session, '二：谢谢', 'req-queue-02'))
    if (first.kind !== 'started' || second.kind !== 'started') throw new Error('expected started')
    const [f1, f2] = await Promise.all([collect(first.frames), collect(second.frames)])
    expect(h.count('cancel')).toBe(0)
    expect(f1.map((f) => f.type)).toEqual(['delta', 'tool', 'done'])
    expect(f2[0]).toEqual({ type: 'queued', ahead: 1 })
    expect(f2.filter((f) => f.type === 'delta').map((f) => (f as { delta: string }).delta)).toEqual(['草稿:二：谢谢\n\n〔面板当前课程：c-1〕'])
    expect(f2.some((f) => f.type === 'tool')).toBe(false)
    const d1 = f1.at(-1) as Extract<PrepFrame, { type: 'done' }>
    const d2 = f2.at(-1) as Extract<PrepFrame, { type: 'done' }>
    expect(d1.message.createdAt).toBeLessThanOrEqual(d2.message.createdAt)
    expect(d1.tools).toEqual([{ ok: true, courseId: 'c-q' }])
    expect(d1.session.courseId).toBe('c-q')
    // F16/F17：同一毫秒占位时 runs() 的顺序不定，按内容比较
    expect((await conversations.runs(session.id)).map((r) => [r.content, r.status]).sort()).toEqual([['一：建课', 'completed'], ['二：谢谢', 'completed']])
  })

  test('the harness session is ensured as prep with the account username and the teacher credential; the stored content is the teacher’s own words', async () => {
    const h = fakeHarness(() => ({ ms: 10 }))
    const session = await conversations.createSession({ title: '建会话' })
    const out = await startPrepTurn(deps(h.client), input(session, '你好', 'req-ensure-01'))
    if (out.kind !== 'started') throw new Error('expected started')
    await collect(out.frames)
    expect(h.calls.find((c) => c.op === 'ensure')!.args).toEqual([session.id, OWNER, 'cred-t', 'prep'])
    expect(h.calls.find((c) => c.op === 'prompt')!.args[1]).toBe('你好\n\n〔面板当前课程：c-1〕')
    expect((await conversations.runs(session.id))[0]!.content).toBe('你好')
  })

  test('a turn longer than the tutor timeout is fine; past the prep timeout it fails with PREP_TIMEOUT and is cancelled only when it runs alone', async () => {
    const slow = fakeHarness((text) => ({ ms: text.includes('很慢') ? 2_500 : 800 }))
    const d = deps(slow.client, 1_500)
    const session = await conversations.createSession({ title: '超时' })
    const ok = await startPrepTurn(d, input(session, '稍慢', 'req-timeout-01'))
    if (ok.kind !== 'started') throw new Error('expected started')
    expect((await collect(ok.frames)).at(-1)!.type).toBe('done')
    const late = await startPrepTurn(d, input(session, '很慢', 'req-timeout-02'))
    if (late.kind !== 'started') throw new Error('expected started')
    const frames = await collect(late.frames)
    expect(frames.at(-1)).toMatchObject({ type: 'error', code: 'PREP_TIMEOUT' })
    expect(slow.count('cancel')).toBe(1)
    expect((await conversations.runs(session.id)).at(-1)).toMatchObject({ status: 'failed', errorCode: 'timeout' })
    // 有别的回合在排队时超时：不取消（网关的 cancel 会丢弃整个会话的排队消息）
    const busy = fakeHarness((text) => ({ ms: text.includes('很慢') ? 2_500 : 2_000 }))
    const d2 = deps(busy.client, 1_500)
    const s2 = await conversations.createSession({ title: '超时不取消' })
    const a = await startPrepTurn(d2, input(s2, '很慢', 'req-timeout-03'))
    const b = await startPrepTurn(d2, input(s2, '排在后面', 'req-timeout-04'))
    if (a.kind !== 'started' || b.kind !== 'started') throw new Error('expected started')
    await Promise.all([collect(a.frames), collect(b.frames)])
    expect(busy.count('cancel')).toBeLessThanOrEqual(1)
  }, 20_000)

  test('same requestId: running → running (no second prompt), completed → replayed done; different content → conflict', async () => {
    const h = fakeHarness(() => ({ ms: 400 }))
    const d = deps(h.client)
    const session = await conversations.createSession({ title: '幂等' })
    const first = await startPrepTurn(d, input(session, '生成下一页', 'req-idem-01'))
    if (first.kind !== 'started') throw new Error('expected started')
    expect(await startPrepTurn(d, input(session, '生成下一页', 'req-idem-01'))).toEqual({ kind: 'running', runId: first.runId })
    const frames = await collect(first.frames)
    expect(h.count('prompt')).toBe(1)
    const replay = await startPrepTurn(d, input(session, '生成下一页', 'req-idem-01'))
    expect(replay).toMatchObject({ kind: 'replayed', body: { runId: first.runId, replayed: true, message: { id: (frames.at(-1) as { message: { id: string } }).message.id } } })
    await expect(startPrepTurn(d, input(session, '别的话', 'req-idem-01'))).rejects.toMatchObject({ name: 'PrepRequestConflictError' })
  })

  test('queue full in the harness → PREP_QUEUE_FULL and the run is failed (not left running)', async () => {
    const h = fakeHarness(() => ({ ms: 10 }), { queueFullAfter: 0 })
    const session = await conversations.createSession({ title: '满' })
    const out = await startPrepTurn(deps(h.client), input(session, '第九条', 'req-full-01'))
    if (out.kind !== 'started') throw new Error('expected started')
    expect((await collect(out.frames)).at(-1)).toMatchObject({ type: 'error', code: 'PREP_QUEUE_FULL' })
    expect((await conversations.runs(session.id))[0]).toMatchObject({ status: 'failed', errorCode: 'queue-full' })
    expect(h.count('cancel')).toBe(0)
  })

  // Ruling [T2/T8] F4 + Note for T8：同 id 重试时网关里可能还有上一次派发；上一次的收尾帧（completed 或 cancelled）先到，重试要接着等、取第二帧
  test.each([['completed', false], ['cancelled', true]] as const)('a retry with the same id while the earlier attempt is still in the harness skips that attempt’s final (%s) and takes its own', async (_label, cancelFirst) => {
    let n = 0
    const h = fakeHarness((text) => {
      n += 1
      if (text.startsWith('前面')) return { ms: 1_200 }
      return n === 2 && cancelFirst ? { ms: 0, cancelled: true } : { ms: 50, reply: `第${n}次` }
    })
    const log = new PrepDispatchLog()
    const long = { ...deps(h.client, 10_000), dispatch: log }
    const short = { ...deps(h.client, 400), dispatch: log }
    const session = await conversations.createSession({ title: `重试-${_label}` })
    const p = await startPrepTurn(long, input(session, '前面很长', `req-retry-p-${_label}`))
    const x1 = await startPrepTurn(short, input(session, '重试我', `req-retry-x-${_label}`))
    if (p.kind !== 'started' || x1.kind !== 'started') throw new Error('expected started')
    // 第一次在前一条后面排着就超时了：前一条还在跑，所以不取消；网关里这条仍在排队
    expect((await collect(x1.frames)).at(-1)).toMatchObject({ type: 'error', code: 'PREP_TIMEOUT' })
    expect(h.count('cancel')).toBe(0)
    const x2 = await startPrepTurn(long, input(session, '重试我', `req-retry-x-${_label}`))
    if (x2.kind !== 'started') throw new Error('expected started')
    expect(x2.runId).toBe(x1.runId)
    const [fp, f2] = await Promise.all([collect(p.frames), collect(x2.frames)])
    expect(fp.at(-1)!.type).toBe('done')
    expect(f2[0]).toEqual({ type: 'queued', ahead: 2 })
    expect(f2.at(-1)).toMatchObject({ type: 'done', runId: x1.runId, message: { content: '第3次' } })
    expect(f2.filter((f) => f.type === 'delta')).toHaveLength(1)
    expect(h.count('prompt')).toBe(3)
    expect(h.count('cancel')).toBe(0)
    const run = (await conversations.runs(session.id)).find((r) => r.id === x1.runId)!
    expect(run).toMatchObject({ status: 'completed', claim: 2, reply: { content: '第3次' } })
    // 超时没取消的那一次在后台等到了自己的收尾帧：派发登记清空，不会压住之后回合的草稿
    expect(log.pending(session.id)).toEqual([])
  }, 20_000)

  // Note for T8：dsh 没有新学生消息也可能结束一个回合，prep 终帧沿用上一个 runId；对已结束、没有重试的 run 一律忽略
  test('a late final reusing a finished run’s id is ignored: the next turn keeps its own frames and the finished run is untouched', async () => {
    const h = fakeHarness(() => ({ ms: 300 }))
    const d = deps(h.client)
    const session = await conversations.createSession({ title: '迟到的帧' })
    const a = await startPrepTurn(d, input(session, '第一条', 'req-stray-01'))
    if (a.kind !== 'started') throw new Error('expected started')
    await collect(a.frames)
    const b = await startPrepTurn(d, input(session, '第二条', 'req-stray-02'))
    if (b.kind !== 'started') throw new Error('expected started')
    setTimeout(() => {
      h.publish(session.id, { type: 'yunyi/turn-final', runId: a.runId, prep: true, assistantMessageId: 'a-stray', reply: '迟到', outcome: 'completed', tools: [] })
      h.publish(session.id, { type: 'yunyi/turn-final', runId: a.runId, cancelled: true })
    }, 150)
    const fb = await collect(b.frames)
    expect(fb.map((f) => f.type)).toEqual(['delta', 'done'])
    expect(fb.at(-1)).toMatchObject({ runId: b.runId, message: { content: '回复:第二条\n\n〔面板当前课程：c-1〕' } })
    expect((await conversations.runs(session.id)).find((r) => r.id === a.runId)).toMatchObject({ status: 'completed', reply: { content: '回复:第一条\n\n〔面板当前课程：c-1〕' } })
    expect(d.dispatch.pending(session.id)).toEqual([])
  })

  // T1 claim 栅栏：本次领取之后被别人回收（claim 变了），收尾时不覆盖对方的结果
  test('a run reclaimed by someone else mid-turn is not overwritten when this attempt ends', async () => {
    const h = fakeHarness(() => ({ ms: 300, tools: [{ ok: true, course: { courseId: 'c-fence' } }] }))
    const session = await conversations.createSession({ title: '栅栏' })
    const out = await startPrepTurn(deps(h.client), input(session, '被接管', 'req-fence-01'))
    if (out.kind !== 'started') throw new Error('expected started')
    await sleep(100)
    await pool.query(`update ${SCHEMA}.prep_runs set claim = claim + 1 where id = $1`, [out.runId])
    expect((await collect(out.frames)).at(-1)).toMatchObject({ type: 'error', code: 'PREP_FAILED' })
    expect(await out.done).toBeUndefined()
    expect((await conversations.runs(session.id))[0]).toMatchObject({ status: 'running', reply: null, claim: 2 })
    expect((await conversations.getSession(session.id))!.courseId).toBeNull()
  })
  // Fix round 1 M1：超时那一刻到 drain 接手之间（catch 在等库）落定的帧不能丢——若恰是本次的收尾帧，丢了就要等满 giveUp
  test('a final that lands between the timeout and the background drain still reaches the drain', async () => {
    const h = fakeHarness(() => ({ ms: 1_250 }))
    const d = deps(h.client, 1_000)
    const session = await conversations.createSession({ title: '超时后的收尾帧' })
    // 注入时序：超时后的 activeRuns 慢 600 ms，并报告还有别的进行中回合（于是不取消、交给 drain）；本次收尾帧约在 1 300 ms 落定
    const slowCheck = { ...conversations, activeRuns: async () => { await sleep(600); return [{ id: 'other-run' }] as Awaited<ReturnType<typeof conversations.activeRuns>> } }
    const out = await startPrepTurn(d, { ...input(session, '慢一步', 'req-gap-01'), conversations: slowCheck })
    if (out.kind !== 'started') throw new Error('expected started')
    expect((await collect(out.frames)).at(-1)).toMatchObject({ type: 'error', code: 'PREP_TIMEOUT' })
    expect(h.count('cancel')).toBe(0)
    // drain 约 1 600 ms 接手；giveUp 要到约 2 600 ms。收尾帧没丢的话，这里登记早已清空
    await sleep(250)
    expect(d.dispatch.pending(session.id)).toEqual([])
  }, 10_000)

  // Fix round 1 M2：超时回合的"独自在跑 → 取消"与新回合的派发互斥，新回合不会被这次取消丢掉
  test('a turn claimed while a timing-out turn decides to cancel is not dropped by that cancel', async () => {
    const h = fakeHarness((text) => ({ ms: text.startsWith('长') ? 2_000 : 50 }), { gatewayCancel: true })
    const log = new PrepDispatchLog()
    const session = await conversations.createSession({ title: '取消与派发' })
    // 注入时序：A 超时后的 activeRuns 先取快照（此时只有 A），再拖 300 ms；B 在这段时间里领取并派发
    const lagging = { ...conversations, activeRuns: async (i: Parameters<typeof conversations.activeRuns>[0]) => { const r = await conversations.activeRuns(i); await sleep(300); return r } }
    const a = await startPrepTurn({ ...deps(h.client, 400), dispatch: log }, { ...input(session, '长回合', 'req-race-a'), conversations: lagging })
    if (a.kind !== 'started') throw new Error('expected started')
    await sleep(500)
    const b = await startPrepTurn({ ...deps(h.client, 10_000), dispatch: log }, input(session, '新消息', 'req-race-b'))
    if (b.kind !== 'started') throw new Error('expected started')
    const [fa, fb] = await Promise.all([collect(a.frames), collect(b.frames)])
    expect(fa.at(-1)).toMatchObject({ type: 'error', code: 'PREP_TIMEOUT' })
    expect(h.count('cancel')).toBe(1)
    expect(fb.at(-1)).toMatchObject({ type: 'done', runId: b.runId })
    expect(log.pending(session.id)).toEqual([])
  }, 10_000)

  // 终审 M5：prompt 超时但网关其实已收下。有别的回合在跑时不能取消：登记为在网关里、后台等它的收尾帧，
  // 它的草稿不能漏进同一会话下一条请求的草稿
  test('a prompt whose ack is lost while another turn runs is tracked: its frames never leak into the next request’s draft', async () => {
    const h = fakeHarness((text) => ({ ms: text.startsWith('前面') ? 600 : 100 }), { lostAck: (text) => text.startsWith('丢了答复') })
    const d = deps(h.client, 10_000)
    const session = await conversations.createSession({ title: '答复丢失-排队' })
    const a = await startPrepTurn(d, input(session, '前面在跑', 'req-lost-a1'))
    if (a.kind !== 'started') throw new Error('expected started')
    await sleep(20)
    const b = await startPrepTurn(d, input(session, '丢了答复', 'req-lost-b1'))
    if (b.kind !== 'started') throw new Error('expected started')
    expect((await collect(b.frames)).at(-1)).toMatchObject({ type: 'error', code: 'PREP_FAILED' })
    expect(h.count('cancel')).toBe(0)
    expect(d.dispatch.pending(session.id)).toEqual([a.runId, b.runId])
    const c = await startPrepTurn(d, input(session, '下一条', 'req-lost-c1'))
    if (c.kind !== 'started') throw new Error('expected started')
    const [, fc] = await Promise.all([collect(a.frames), collect(c.frames)])
    expect(fc[0]).toEqual({ type: 'queued', ahead: 2 })
    expect(fc.filter((f) => f.type === 'delta').map((f) => (f as { delta: string }).delta)).toEqual(['草稿:下一条\n\n〔面板当前课程：c-1〕'])
    expect(fc.at(-1)).toMatchObject({ type: 'done', runId: c.runId, message: { content: '回复:下一条\n\n〔面板当前课程：c-1〕' } })
    expect((await conversations.runs(session.id)).find((r) => r.id === b.runId)).toMatchObject({ status: 'failed' })
    // 丢了答复的那一次在后台等到了自己的收尾帧，登记清空
    await sleep(100)
    expect(d.dispatch.pending(session.id)).toEqual([])
  }, 10_000)

  test('a prompt whose ack is lost while the session is otherwise idle is cancelled in the gateway; the next request sees only its own frames', async () => {
    const h = fakeHarness(() => ({ ms: 300 }), { gatewayCancel: true, lostAck: (text) => text.startsWith('丢了答复') })
    const d = deps(h.client, 10_000)
    const session = await conversations.createSession({ title: '答复丢失-独自' })
    const b = await startPrepTurn(d, input(session, '丢了答复', 'req-lost-b2'))
    if (b.kind !== 'started') throw new Error('expected started')
    expect((await collect(b.frames)).at(-1)).toMatchObject({ type: 'error', code: 'PREP_FAILED' })
    expect(h.count('cancel')).toBe(1)
    expect(d.dispatch.pending(session.id)).toEqual([])
    const c = await startPrepTurn(d, input(session, '下一条', 'req-lost-c2'))
    if (c.kind !== 'started') throw new Error('expected started')
    const fc = await collect(c.frames)
    expect(fc.map((f) => f.type)).toEqual(['delta', 'done'])
    expect(fc[0]).toMatchObject({ delta: '草稿:下一条\n\n〔面板当前课程：c-1〕' })
  }, 10_000)
})

// 终审修复（T15 走查第 5 条）：真实 dsh 的 tool/result 不带工具名，名字在之前的 tool/call 帧上，按 callId 对上
describe('prep frame mapper', () => {
  const result = (callId: string, body: Record<string, unknown>) => ({ type: 'tool/result', data: { message: { role: 'tool', toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(body) }] } } })
  test('a tool result gets its name from the earlier tool/call with the same callId; unknown ids stay unnamed', () => {
    const map = createPrepFrameMapper()
    expect(map({ type: 'tool/call', data: { callId: 'call_1', name: 'generate_page' } })).toBeUndefined()
    expect(map(result('call_1', { ok: true, course: { courseId: 'c-1' } }))).toEqual({ type: 'tool', name: 'generate_page', ok: true, courseId: 'c-1' })
    expect(map(result('call_9', { ok: false, reason: 'page-blocked' }))).toEqual({ type: 'tool', ok: false, reason: 'page-blocked' })
    // 另一个回合的映射器不认这个回合的调用
    expect(createPrepFrameMapper()(result('call_1', { ok: true }))).toEqual({ type: 'tool', ok: true })
  })
})

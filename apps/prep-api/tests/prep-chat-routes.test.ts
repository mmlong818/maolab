// 3d Task 9：备课对话路由（假 harness）。只动 course_test_prep_api_chat* schema 与 course_test_prep_api_c* 账号行。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { prepTestApp } from './helpers/prep.ts'
import { fakeHarness } from './helpers/fake-prep-harness.ts'
import { HarnessError, type HarnessClient } from '../src/harness/client.ts'

const A = 'course_test_prep_api_ca'
const NOCRED = 'course_test_prep_api_cn'
const B = 'course_test_prep_api_cb'
let env: Awaited<ReturnType<typeof prepTestApp>>
let h: ReturnType<typeof fakeHarness>
let ta = '', tn = '', tb = ''
const json = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown, accept?: string) =>
  env.app.inject({ method, url, headers: { 'x-session-token': token, 'content-type': 'application/json', ...(accept ? { accept } : {}) }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (pred: () => boolean, ms = 5_000) => { const end = Date.now() + ms; while (!pred()) { if (Date.now() > end) throw new Error('until: timed out'); await sleep(10) } }
// fix round 1：按原话注入失败——"排满" 网关 429、"出错" 第一次 prompt 500（之后照常）；ensureGate 非空时 ensure 等它（在派发互斥里卡住派发）
const failedOnce = new Set<string>()
let ensureGate: Promise<void> | undefined
const ensureEntered: string[] = []

beforeAll(async () => {
  // gatewayCancel：取消按网关语义给进行中与排队的消息各发一帧 cancelled 收尾帧
  h = fakeHarness((text) => ({ ms: text.includes('超时') ? 4_000 : text.includes('慢') ? 600 : 20, tools: text.includes('建课') ? [{ ok: true, course: { courseId: 'c-chat' } }] : [] }), { gatewayCancel: true })
  const client: HarnessClient = {
    ...h.client,
    async ensure(i) { ensureEntered.push(i.sessionId); await ensureGate; return h.client.ensure(i) },
    async prompt(sid, text, messageId) {
      if (text.includes('排满')) throw new HarnessError(429, 'too many queued messages')
      if (text.includes('出错') && !failedOnce.has(text)) { failedOnce.add(text); throw new HarnessError(500, 'boom') }
      return h.client.prompt(sid, text, messageId)
    },
  }
  // 回合超时 2 秒：只有"超时"那条（4 秒）会超
  env = await prepTestApp({ owners: [A, NOCRED, B], withCredential: [A, B], harness: client, courseSchema: 'course_test_prep_api_chat', knowledgeSchema: 'course_test_prep_api_chat_kp', env: { YUNYI_PREP_HEARTBEAT_MS: '100', YUNYI_PREP_TURN_TIMEOUT_MS: '2000' } })
  ta = await env.token(A); tn = await env.token(NOCRED); tb = await env.token(B)
}, 120_000)
afterAll(async () => { await env?.close() })

test('a teacher without a yunyi credential is refused before anything reaches the harness (D7)', async () => {
  const created = await json('POST', '/api/prep/sessions', tn, {})
  expect([created.statusCode, created.json().code]).toEqual([403, 'PREP_CREDENTIAL_REQUIRED'])
  // fix round 1 M2：凭证被撤销前建的会话（直接写库模拟），取消也先判凭证，不碰 harness
  const own = await env.app.prep.conversations.forOwner(NOCRED).createSession({ title: '撤销前' })
  const cancel = await json('POST', `/api/prep/sessions/${own.id}/cancel`, tn, {})
  expect([cancel.statusCode, cancel.json().code]).toEqual([403, 'PREP_CREDENTIAL_REQUIRED'])
  expect(h.calls).toEqual([])
})

test('create, send (JSON), read the transcript; another owner sees 404 for the session and its messages', async () => {
  const s = (await json('POST', '/api/prep/sessions', ta, { title: '  第一节  ' })).json().session
  expect(s.title).toBe('第一节')
  const done = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '建课：静夜思', requestId: 'req-chat-0001' })
  expect(done.statusCode).toBe(200)
  expect(done.json()).toMatchObject({ outcome: 'completed', tools: [{ ok: true, courseId: 'c-chat' }], session: { courseId: 'c-chat' } })
  const read = (await json('GET', `/api/prep/sessions/${s.id}`, ta)).json()
  expect(read.messages.map((m: { role: string }) => m.role)).toEqual(['teacher', 'assistant'])
  expect(read.running).toEqual([])
  // 终审 M1/M4：记录带 requestId，面板据此对上本页在途的草稿、用同一个 requestId 重试
  expect(read.messages.map((m: { requestId: string }) => m.requestId)).toEqual(['req-chat-0001', 'req-chat-0001'])
  for (const [method, url, payload] of [['GET', `/api/prep/sessions/${s.id}`, undefined], ['POST', `/api/prep/sessions/${s.id}/messages`, { content: '偷看', requestId: 'req-chat-0002' }], ['POST', `/api/prep/sessions/${s.id}/cancel`, {}]] as const) {
    expect((await json(method, url, tb, payload)).statusCode).toBe(404)
  }
  expect((await json('GET', '/api/prep/sessions', tb)).json().sessions).toEqual([])
  // 别人的取消没有到 harness；本人的取消按会话转给网关
  expect(h.count('cancel')).toBe(0)
  const cancelled = await json('POST', `/api/prep/sessions/${s.id}/cancel`, ta, {})
  expect([cancelled.statusCode, cancelled.json()]).toEqual([202, { cancelled: true }])
  expect(h.calls.filter((c) => c.op === 'cancel')).toEqual([{ op: 'cancel', args: [s.id] }])
})

test('NDJSON stream: delta, tool, ping while idle, done; same requestId while running → 202; after → replayed', async () => {
  const s = (await json('POST', '/api/prep/sessions', ta, {})).json().session
  const res = await fetch(`${await env.app.listen({ port: 0, host: '127.0.0.1' })}/api/prep/sessions/${s.id}/messages`, {
    method: 'POST', headers: { 'x-session-token': ta, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ content: '慢慢建课', requestId: 'req-chat-0010' }),
  })
  const busy = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '慢慢建课', requestId: 'req-chat-0010' })
  expect([busy.statusCode, busy.json().code]).toEqual([202, 'PREP_RUN_IN_PROGRESS'])
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as { type: string })
  expect(lines.map((l) => l.type)).toEqual(expect.arrayContaining(['delta', 'tool', 'ping', 'done']))
  expect(lines.at(-1)!.type).toBe('done')
  expect(h.calls.filter((c) => c.op === 'prompt' && c.args[2] === busy.json().runId).length).toBe(1)
  const replay = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '慢慢建课', requestId: 'req-chat-0010' })
  expect(replay.json()).toMatchObject({ replayed: true, runId: busy.json().runId })
  const conflict = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '换了内容', requestId: 'req-chat-0010' })
  expect([conflict.statusCode, conflict.json().code]).toEqual([409, 'REQUEST_KEY_CONFLICT'])
})

test('body validation and a foreign courseId', async () => {
  const s = (await json('POST', '/api/prep/sessions', ta, {})).json().session
  // fix round 1 I1：requestId 与 T7 同一字符集 [A-Za-z0-9_-]
  for (const payload of [{ content: '', requestId: 'req-chat-0020' }, { content: 'x', requestId: 'short' }, { content: 'x'.repeat(4001), requestId: 'req-chat-0021' }, { content: 'x' }, { content: 'x', requestId: 'req chat 0023' }, { content: 'x', requestId: '请求编号请求编号' }, { content: 'x', requestId: 'req:chat#0024' }]) {
    expect((await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, payload)).statusCode).toBe(400)
  }
  const foreign = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '看这门课', requestId: 'req-chat-0022', courseId: 'c-not-mine' })
  expect([foreign.statusCode, foreign.json().reason]).toEqual([404, 'not-found'])
  expect((await json('POST', '/api/prep/sessions', ta, { courseId: 'c-not-mine' })).statusCode).toBe(404)
})

// fix round 1 M3：JSON 分支的失败状态映射（429 / 504 / 500）与失败后同一个 requestId 重新领取
test('JSON failures map to 429 (queue full), 504 (timeout), 500 (failed); a failed requestId is claimed again and completes', async () => {
  const s = (await json('POST', '/api/prep/sessions', ta, {})).json().session
  const full = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '排满了', requestId: 'req-chat-0030' })
  expect([full.statusCode, full.json().code]).toEqual([429, 'PREP_QUEUE_FULL'])
  const failed = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '出错一次', requestId: 'req-chat-0031' })
  expect([failed.statusCode, failed.json().code]).toEqual([500, 'PREP_FAILED'])
  const retry = await json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '出错一次', requestId: 'req-chat-0031' })
  expect(retry.statusCode).toBe(200)
  expect(retry.json()).toMatchObject({ outcome: 'completed', message: { content: '回复:出错一次' } })
  expect(retry.json().replayed).toBeUndefined()
  const read = (await json('GET', `/api/prep/sessions/${s.id}`, ta)).json()
  // 重试沿用同一个 run：对话记录里是一条老师原话加一条回复，不是两条
  expect(read.messages.filter((m: { runId: string }) => m.runId === retry.json().runId).map((m: { role: string }) => m.role)).toEqual(['teacher', 'assistant'])
  const s2 = (await json('POST', '/api/prep/sessions', ta, {})).json().session
  const timeout = await json('POST', `/api/prep/sessions/${s2.id}/messages`, ta, { content: '会超时', requestId: 'req-chat-0032' })
  expect([timeout.statusCode, timeout.json().code]).toEqual([504, 'PREP_TIMEOUT'])
}, 20_000)

test('cancelling a running turn: the JSON request ends 409 PREP_CANCELLED and the transcript shows the cancellation', async () => {
  const s = (await json('POST', '/api/prep/sessions', ta, {})).json().session
  const pending = json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '慢慢写', requestId: 'req-chat-0040' })
  await until(() => h.calls.some((c) => c.op === 'prompt' && c.args[0] === s.id))
  const cancel = await json('POST', `/api/prep/sessions/${s.id}/cancel`, ta, {})
  expect(cancel.statusCode).toBe(202)
  const res = await pending
  expect([res.statusCode, res.json().code]).toEqual([409, 'PREP_CANCELLED'])
  const read = (await json('GET', `/api/prep/sessions/${s.id}`, ta)).json()
  expect(read.messages.map((m: { role: string; code?: string }) => [m.role, m.code])).toEqual([['teacher', undefined], ['error', 'cancelled']])
  expect(read.running).toEqual([])
}, 20_000)

// fix round 1 M1：取消与派发在同一把会话互斥里——派发进行到一半时到达的取消排在 prompt 之后，能取消掉这一条
test('a cancel that arrives while the turn is still being dispatched waits for the dispatch and then cancels it', async () => {
  const s = (await json('POST', '/api/prep/sessions', ta, {})).json().session
  let release!: () => void
  ensureGate = new Promise<void>((r) => { release = r })
  try {
    const pending = json('POST', `/api/prep/sessions/${s.id}/messages`, ta, { content: '慢慢写', requestId: 'req-chat-0050' })
    await until(() => ensureEntered.includes(s.id))
    const cancel = json('POST', `/api/prep/sessions/${s.id}/cancel`, ta, {})
    await sleep(100)
    // 派发还卡在 ensure：取消没有先到网关
    expect(h.calls.some((c) => c.op === 'cancel' && c.args[0] === s.id)).toBe(false)
    release()
    expect((await cancel).statusCode).toBe(202)
    const ops = h.calls.filter((c) => c.args[0] === s.id && (c.op === 'prompt' || c.op === 'cancel')).map((c) => c.op)
    expect(ops).toEqual(['prompt', 'cancel'])
    const res = await pending
    expect([res.statusCode, res.json().code]).toEqual([409, 'PREP_CANCELLED'])
  } finally {
    ensureGate = undefined
    release?.()
  }
}, 20_000)

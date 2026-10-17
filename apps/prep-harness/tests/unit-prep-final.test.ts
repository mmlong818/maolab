import { describe, expect, test } from 'vitest'
import { createPrepFinalizer, prepFallbackReply } from '@maolab/prep-bundle/prep-finalize'
import { apply, classifyTurnEnd, modelErrorOf } from '@maolab/prep-bundle/finalize'

const RUN = '11111111-2222-4333-8444-555555555555'
const agentWith = (log: Array<Record<string, unknown>>) => ({ id: 's-prep', session: { deriveMessages: () => log } })
// 实测形状（3d Task 2，prep 宿主的 assistant/message 与 tool/result 事件）：工具名只在 assistant 消息的 tool-call 块上，
// 工具结果是 role 'tool'、toolCallId 指回调用 id，消息本身不带工具名
const toolCall = (callId: string, name: string, text = '') => ({
  role: 'assistant',
  content: [...(text ? [{ type: 'text', text }] : []), { type: 'tool-call', id: callId, name, arguments: '{}' }],
})
const toolResult = (callId: string, result: Record<string, unknown>) => ({ role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(result) }], isError: false })
const toolMessage = (callId: string, name: string, result: Record<string, unknown>) => [toolCall(callId, name), toolResult(callId, result)]
const make = () => createPrepFinalizer({ classify: classifyTurnEnd, modelErrorOf, uuid: () => 'assistant-1' })

describe('prep finalizer', () => {
  test('completed turn: runId is the latest student message id, reply is this turn’s assistant text, tools carry ok/reason/courseId', () => {
    const agent = agentWith([
      { id: 'old-run', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '上一条' }] },
      { role: 'assistant', content: [{ type: 'text', text: '上一回合的话' }] },
      { id: RUN, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '建课' }] },
      { role: 'assistant', content: [{ type: 'text', text: '好的，先建课。' }] },
      ...toolMessage('call_1', 'plan_course', { ok: true, course: { courseId: 'c-1' } }),
      ...toolMessage('call_2', 'approve_plan', { ok: false, reason: 'images-unavailable', message: '…' }),
      { role: 'assistant', content: [{ type: 'text', text: '计划需要删掉图像页。' }] },
    ])
    expect(make().finalize(agent, { reason: { kind: 'completed' } })).toEqual({
      runId: RUN, prep: true, assistantMessageId: 'assistant-1', outcome: 'completed',
      reply: '好的，先建课。\n计划需要删掉图像页。',
      tools: [{ name: 'plan_course', ok: true, courseId: 'c-1' }, { name: 'approve_plan', ok: false, reason: 'images-unavailable' }],
    })
  })

  test('cancelled turn reports only the cancellation; a turn is finalized once', () => {
    const agent = agentWith([{ id: RUN, role: 'user', source: { kind: 'user' }, content: '取消我' }])
    const finalizer = make()
    expect(finalizer.finalize(agent, { reason: { kind: 'aborted', reason: { kind: 'user' } } })).toEqual({ runId: RUN, cancelled: true })
    expect(finalizer.finalize(agent, { reason: { kind: 'aborted', reason: { kind: 'user' } } })).toBeUndefined()
  })

  test('failed turn: fallback reply by model error, outcome failed, partial tools kept', () => {
    const agent = agentWith([
      { id: RUN, role: 'user', source: { kind: 'user' }, content: '生成下一页' },
      ...toolMessage('call_1', 'generate_page', { ok: true, page: { pageId: 'p-1' }, course: { courseId: 'c-2' } }),
    ])
    const out = make().finalize(agent, { reason: { kind: 'error', error: { message: 'HTTP 401', status: 401 } } })
    expect(out).toMatchObject({ runId: RUN, prep: true, outcome: 'failed', modelError: 'credential', reply: prepFallbackReply('credential') })
    expect(out && 'tools' in out ? out.tools : []).toEqual([{ name: 'generate_page', ok: true, courseId: 'c-2' }])
  })

  test('no student message in the log → nothing to finalize', () => {
    expect(make().finalize(agentWith([]), { reason: { kind: 'completed' } })).toBeUndefined()
  })

  // Ruling [T2/T8] F4：api 对失败、超时、取消的回合用同一个 messageId 重试；dsh 接受重复 id（实测：新回合里再追加一条同 id 的学生消息），
  // 每次重试都要有自己的终帧，否则 api 等满 30 分钟
  test('a retry with the same message id gets its own final frame (turn numbers from turn/end)', () => {
    const log: Array<Record<string, unknown>> = [
      { id: RUN, role: 'user', source: { kind: 'user' }, content: '生成下一页' },
    ]
    const agent = agentWith(log)
    const finalizer = make()
    expect(finalizer.finalize(agent, { turn: 1, reason: { kind: 'error', error: { message: 'boom' } } } as never)).toMatchObject({ runId: RUN, outcome: 'failed' })
    log.push({ id: RUN, role: 'user', source: { kind: 'user' }, content: '生成下一页' }, { role: 'assistant', content: [{ type: 'text', text: '这次好了。' }] })
    expect(finalizer.finalize(agent, { turn: 2, reason: { kind: 'completed' } } as never)).toEqual({ runId: RUN, prep: true, assistantMessageId: 'assistant-1', outcome: 'completed', reply: '这次好了。', tools: [] })
    // 同一个回合结束只发一帧
    expect(finalizer.finalize(agent, { turn: 2, reason: { kind: 'completed' } } as never)).toBeUndefined()
  })

  test('a retry with the same message id gets its own final frame (no turn number: the retried student message is a new log entry)', () => {
    const log: Array<Record<string, unknown>> = [
      { id: RUN, role: 'user', source: { kind: 'user' }, content: '取消我' },
    ]
    const agent = agentWith(log)
    const finalizer = make()
    expect(finalizer.finalize(agent, { reason: { kind: 'aborted', reason: { kind: 'user' } } })).toEqual({ runId: RUN, cancelled: true })
    log.push({ id: RUN, role: 'user', source: { kind: 'user' }, content: '取消我' }, { role: 'assistant', content: [{ type: 'text', text: '重试成功。' }] })
    expect(finalizer.finalize(agent, { reason: { kind: 'completed' } })).toMatchObject({ runId: RUN, outcome: 'completed', reply: '重试成功。' })
  })

  // fix round 1 I1：回复与导师同一取法，先剥离旁白与伪调用（stripToolChatter emptyIfAll），另外剥掉 prep 工具名的伪调用块
  test('reply strips fake tool blocks and bracket chatter, keeping the teaching text', () => {
    const agent = agentWith([
      { id: RUN, role: 'user', source: { kind: 'user' }, content: '建课' },
      { role: 'assistant', content: [{ type: 'text', text: '好的，先建课。\n<plan_course>{"kpIds":["kp-1"]}</plan_course>\n<skill name="prep-quality-contract" />\n建好了。（检查题已出）' }] },
    ])
    expect(make().finalize(agent, { reason: { kind: 'completed' } })).toMatchObject({ outcome: 'completed', reply: '好的，先建课。\n建好了。' })
  })

  test('a reply that is nothing but chatter becomes the plain acknowledgement, never the raw block', () => {
    const agent = agentWith([
      { id: RUN, role: 'user', source: { kind: 'user' }, content: '建课' },
      { role: 'assistant', content: [{ type: 'text', text: '<plan_course>{"kpIds":["kp-1"]}</plan_course>' }] },
      { role: 'assistant', content: [{ type: 'text', text: '<tool_call>approve_plan {"courseId":"c-1"}</tool_call>\n（检查题已登记）' }] },
    ])
    expect(make().finalize(agent, { reason: { kind: 'completed' } })).toMatchObject({ outcome: 'completed', reply: '已处理。' })
  })

  // fix round 1 Minor：结果不是合法 JSON（isError 或被截断）记 ok:false，不丢；skill 工具的结果本来就是文本，按 isError 判定
  test('tool results that are not JSON are reported as failures with a reason instead of being dropped', () => {
    const agent = agentWith([
      { id: RUN, role: 'user', source: { kind: 'user' }, content: '看看课程' },
      toolCall('call_1', 'read_course'),
      { role: 'tool', toolCallId: 'call_1', content: [{ type: 'text', text: 'Error: tool crashed' }], isError: true },
      toolCall('call_2', 'read_course'),
      { role: 'tool', toolCallId: 'call_2', content: [{ type: 'text', text: '{"ok":true,"course":{"courseId":"c-1","pag' }], isError: false },
      toolCall('call_3', 'skill'),
      { role: 'tool', toolCallId: 'call_3', content: [{ type: 'text', text: '<skill_content name="prep-quality-contract">…</skill_content>' }], isError: false },
      { role: 'assistant', content: [{ type: 'text', text: '读到了。' }] },
    ])
    expect(make().finalize(agent, { reason: { kind: 'completed' } })).toMatchObject({
      tools: [{ name: 'read_course', ok: false, reason: 'tool-error' }, { name: 'read_course', ok: false, reason: 'unreadable-result' }, { name: 'skill', ok: true }],
    })
  })
})

// fix round 1 Minor：apply() 接线层
describe('yunyi-finalize apply() wiring', () => {
  function wired(presets: Record<string, string>) {
    let provided: { finalize(agent: unknown, end: unknown): Promise<unknown> } | undefined
    const emitted: Array<Record<string, unknown>> = []
    apply({
      yunyiSessions: { presetOfSession: (id: string) => presets[id] },
      provide: (_name: string, value: unknown) => { provided = value as typeof provided },
      emit: (event: string, payload: unknown) => { if (event === 'yunyi/turn-final') emitted.push(payload as Record<string, unknown>) },
    })
    return { finalizer: provided!, emitted }
  }
  const log = () => [{ id: RUN, role: 'user', source: { kind: 'user' }, content: '你好' }, { role: 'assistant', content: [{ type: 'text', text: '你好。' }] }]
  const agent = (id: string) => ({ id, session: { deriveMessages: log } })

  test('a non-prep session gets no frame', async () => {
    const { finalizer, emitted } = wired({ 's-tutor': 'tutor', 's-test': 'test' })
    expect(await finalizer.finalize(agent('s-tutor'), { turn: 1, reason: { kind: 'completed' } })).toBeUndefined()
    expect(await finalizer.finalize(agent('s-test'), { turn: 1, reason: { kind: 'completed' } })).toBeUndefined()
    expect(emitted).toEqual([])
  })

  test('two prep agents keep independent dedupe state', async () => {
    const { finalizer, emitted } = wired({ 's-prep-a': 'prep', 's-prep-b': 'prep' })
    const a = agent('s-prep-a')
    const b = agent('s-prep-b')
    const end = { turn: 1, reason: { kind: 'completed' } }
    await finalizer.finalize(a, end)
    await finalizer.finalize(b, end)
    await finalizer.finalize(a, end)
    expect(emitted.map((p) => [(p.agent as { id: string }).id, p.runId, p.prep])).toEqual([['s-prep-a', RUN, true], ['s-prep-b', RUN, true]])
  })
})

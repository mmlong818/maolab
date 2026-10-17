import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readNdjson, splitNdjson } from '../lib/ndjson'
import { newRequestId, prepApi } from '../lib/api'
import { chatReducer, type ChatItem } from '../lib/chat-state'
import { downloadHref, withArtifactTokens } from '../lib/artifact-url'
import { MAX_KPS, SINGLE_KP_WARNING, toggleKp } from '../lib/kp-selection'
import { ACTION_LABELS, auditBlockedView, canAccept, latestExport, needsPolling, teachingAuditNote } from '../lib/panel-model'

const tokenize = (url: string) => `${url}${url.includes('?') ? '&' : '?'}token=t%2B1`

describe('ndjson', () => {
  it('splits complete lines and keeps the partial tail; skips blank and broken lines', () => {
    expect(splitNdjson('{"type":"ping"}\n\n{"type":"delta","delta":"a"}\nnot json\n{"type":"de')).toEqual({ lines: [{ type: 'ping' }, { type: 'delta', delta: 'a' }], rest: '{"type":"de' })
  })
})

describe('chat reducer', () => {
  const sent: ChatItem[] = chatReducer([], { type: 'sent', requestId: 'r1', content: '建课' })
  it('a sent message shows the teacher line and a draft; deltas append; queued shows the wait; tool frames attach', () => {
    let s = chatReducer(sent, { type: 'frame', requestId: 'r1', frame: { type: 'queued', ahead: 2 } })
    expect(s.at(-1)).toMatchObject({ role: 'draft', status: '排队中：前面还有 2 条' })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'delta', delta: '好的，' } })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'delta', delta: '先建课。' } })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'tool', name: 'plan_course', ok: true, courseId: 'c-1' } })
    expect(s.map((m) => m.role)).toEqual(['teacher', 'draft'])
    expect(s.at(-1)).toMatchObject({ content: '好的，先建课。', tools: [{ name: 'plan_course', ok: true, courseId: 'c-1' }] })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'ping' } })
    expect(s.at(-1)!.content).toBe('好的，先建课。')
  })
  it('done replaces the draft with the final message; error replaces it with an error line', () => {
    const done = chatReducer(sent, { type: 'frame', requestId: 'r1', frame: { type: 'done', runId: 'run-1', message: { id: 'm-1', content: '计划已建好。', createdAt: 1 }, tools: [{ ok: true, courseId: 'c-1' }], outcome: 'completed', session: { id: 's', title: 't', courseId: 'c-1', createdAt: 1, updatedAt: 1 } } })
    expect(done.map((m) => [m.role, m.content])).toEqual([['teacher', '建课'], ['assistant', '计划已建好。']])
    const failed = chatReducer(sent, { type: 'frame', requestId: 'r1', frame: { type: 'error', error: '等了太久', code: 'PREP_TIMEOUT' } })
    expect(failed.at(-1)).toMatchObject({ role: 'error', content: '等了太久' })
  })
  it('loaded replaces everything with the server transcript', () => {
    expect(chatReducer(sent, { type: 'loaded', messages: [{ id: 'x:teacher', runId: 'x', role: 'teacher', content: '你好', createdAt: 1 }] }).map((m) => m.role)).toEqual(['teacher'])
  })
})

describe('artifact urls', () => {
  it('adds the token to every artifact url in a course, leaves other strings, is idempotent', () => {
    const course = { id: 'c', pages: [{ imageUrl: '/api/prep/artifacts/a1', note: '/api/prep/artifacts/ 不是开头' }], other: '/api/v2/x', nested: { list: ['/api/prep/artifacts/a2?v=1'] } }
    const out = withArtifactTokens(course, tokenize)
    expect(out.pages[0]!.imageUrl).toBe('/api/prep/artifacts/a1?token=t%2B1')
    expect(out.pages[0]!.note).toBe('/api/prep/artifacts/ 不是开头')
    expect(out.other).toBe('/api/v2/x')
    expect(out.nested.list[0]).toBe('/api/prep/artifacts/a2?v=1&token=t%2B1')
    expect(withArtifactTokens(out, tokenize)).toEqual(out)
    expect(course.pages[0]!.imageUrl).toBe('/api/prep/artifacts/a1')
  })
  it('download links carry the display name', () => {
    expect(downloadHref('/api/prep/artifacts/x', '静夜思.pptx', tokenize)).toBe(`/api/prep/artifacts/x?name=${encodeURIComponent('静夜思.pptx')}&token=t%2B1`)
  })
})

describe('knowledge point selection', () => {
  const kp = (id: string) => ({ kpId: id, canonicalName: id, subject: '语文' })
  it('toggles, caps at MAX_KPS, warns on exactly one', () => {
    const one = toggleKp([], kp('a'))
    expect(one).toEqual({ selected: [kp('a')], warning: SINGLE_KP_WARNING })
    const two = toggleKp(one.selected, kp('b'))
    expect(two).toEqual({ selected: [kp('a'), kp('b')] })
    expect(toggleKp(two.selected, kp('a')).selected).toEqual([kp('b')])
    const full = Array.from({ length: MAX_KPS }, (_, i) => kp(`k${i}`))
    expect(toggleKp(full, kp('z')).selected.length).toBe(MAX_KPS)
    expect(toggleKp(full, kp('z')).warning).toMatch(/最多/)
  })
})

describe('panel model', () => {
  const job = (status: string, extra: Record<string, unknown> = {}) => ({ jobId: `j-${status}`, kind: 'export-pptx', pageId: null, status, attempts: 1, error: null, result: null, createdAt: 1, finishedAt: null, ...extra })
  it('polls while any job is queued or running', () => {
    expect(needsPolling([job('succeeded'), job('running')])).toBe(true)
    expect(needsPolling([job('succeeded'), job('failed')])).toBe(false)
  })
  it('latest export: link with name, pending, or failure message', () => {
    expect(latestExport([job('succeeded', { createdAt: 2, result: { url: '/api/prep/artifacts/p', filename: '课.pptx', expiresAt: 9 } }), job('failed', { createdAt: 1 })])).toEqual({ href: '/api/prep/artifacts/p', filename: '课.pptx', expiresAt: 9 })
    expect(latestExport([job('queued', { createdAt: 3 })])).toEqual({ pending: true })
    expect(latestExport([job('failed', { createdAt: 3, error: { code: 'X', message: '导出失败' } })])).toEqual({ failed: '导出失败' })
    expect(latestExport([])).toBeNull()
  })
  it('audit-blocked details become per-item actions with the advice and the audit error', () => {
    const view = auditBlockedView({ advice: '按条处理', unverifiedPageIds: ['p1', 'p2'], auditError: 'JSON 解析失败', findings: [{ pageId: 'p3', impact: '缺课标', fix: '挂载课标原文', action: 'add-source' }], factIssues: [{ pageId: 'p4', message: '年代错误', fix: '改为 701 年', action: 'repair-page' }] })
    expect(view).toEqual({ advice: '按条处理', auditError: 'JSON 解析失败', unverified: 2, items: [
      { pageId: 'p3', text: '缺课标（挂载课标原文）', action: '缺权威来源：需要补课标或教材原文，修页解决不了' },
      { pageId: 'p4', text: '年代错误（改为 701 年）', action: '修改这一页' },
    ] })
  })
  it('a single-knowledge-point course with insufficient evidence gets an explicit note', () => {
    const w = { teachingAudit: { status: 'insufficient-evidence', state: 'current', findings: [] } } as never
    expect(teachingAuditNote(w, 1)).toMatch(/单知识点/)
    expect(teachingAuditNote(w, 2)).toMatch(/课标或教材原文/)
    expect(teachingAuditNote({ teachingAudit: null } as never, 1)).toBeUndefined()
  })
})

// ---- T11 追加：裁决与 api 契约（Ruling [T11] F1、Note for T12、T7/T9 requestId 口径、prep-chat 状态码） ----
const apiFetchMock = vi.hoisted(() => vi.fn<(input: string, init?: RequestInit) => Promise<Response>>())
vi.mock('@/lib/auth/client', () => ({ apiFetch: apiFetchMock }))

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const stream = (chunks: string[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    const encoder = new TextEncoder()
    for (const c of chunks) controller.enqueue(encoder.encode(c))
    controller.close()
  },
})
const kpOf = (id: string) => ({ kpId: id, canonicalName: id, subject: '语文' })

describe('readNdjson', () => {
  it('reassembles frames split across chunks and keeps a final line without a newline', async () => {
    const out: unknown[] = []
    for await (const f of readNdjson(stream(['{"type":"pi', 'ng"}\n{"type":"delta","delta":"好', '的"}\n{"type":"done","runId":"r"}']))) out.push(f)
    expect(out).toEqual([{ type: 'ping' }, { type: 'delta', delta: '好的' }, { type: 'done', runId: 'r' }])
  })
})

describe('knowledge point cap (Ruling [T11] F1)', () => {
  it('is 6, the same as the api, the course schema and the 3c tool', () => {
    expect(MAX_KPS).toBe(6)
    const five = Array.from({ length: 5 }, (_, i) => kpOf(`k${i}`))
    const six = toggleKp(five, kpOf('x')).selected
    expect(six).toHaveLength(6)
    expect(toggleKp(six, kpOf('y'))).toEqual({ selected: six, warning: '一节课最多选 6 个知识点。' })
  })
})

describe('panel model edge cases', () => {
  it('audit-blocked details with empty lists, null lists or no details at all', () => {
    expect(auditBlockedView({ advice: '', findings: [], factIssues: [], unverifiedPageIds: [], pendingPageIds: [] })).toEqual({ advice: '', unverified: 0, items: [] })
    expect(auditBlockedView({ findings: null, factIssues: null, unverifiedPageIds: null })).toEqual({ advice: '', unverified: 0, items: [] })
    expect(auditBlockedView(null)).toEqual({ advice: '', unverified: 0, items: [] })
  })
  it('unknown audit actions fall back to repairing the page; a fact issue without impact uses its message', () => {
    expect(auditBlockedView({ factIssues: [{ pageId: 'p1', message: '人名写错', action: 'something-new' }] }).items).toEqual([{ pageId: 'p1', text: '人名写错', action: ACTION_LABELS['repair-page'] }])
  })
  it('accept is offered only once the plan is approved (a draft course has no generation session; page accept would 404)', () => {
    expect(canAccept({ course: { planning: { status: 'draft' } } } as never)).toBe(false)
    expect(canAccept({ course: { planning: { status: 'approved' }, generationSession: { status: 'page-review', jobs: [] } } } as never)).toBe(true)
  })
})

describe('prep api client', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('request ids satisfy the api pattern', () => {
    for (let i = 0; i < 20; i += 1) expect(newRequestId()).toMatch(/^[A-Za-z0-9_-]{8,120}$/)
  })

  it('maps error bodies to PrepApiError with status, code, reason and details', async () => {
    apiFetchMock.mockResolvedValueOnce(json(409, { error: '备课助理正在处理上一条消息，完成后再改课程。', code: 'PREP_TURN_RUNNING' }))
    await expect(prepApi.acceptCourse('c-1')).rejects.toMatchObject({ name: 'PrepApiError', status: 409, code: 'PREP_TURN_RUNNING', message: '备课助理正在处理上一条消息，完成后再改课程。' })
    apiFetchMock.mockResolvedValueOnce(json(422, { error: '没有通过审查。', reason: 'audit-blocked', details: { findings: [] } }))
    await expect(prepApi.exportPptx('c-1', 'req-12345678')).rejects.toMatchObject({ status: 422, reason: 'audit-blocked', details: { findings: [] } })
    apiFetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(prepApi.courses()).rejects.toMatchObject({ status: 502, message: '请求失败（502）' })
  })

  it('posts writes as JSON to the owner-scoped routes and accepts 202 for queued jobs', async () => {
    apiFetchMock.mockResolvedValueOnce(json(202, { jobs: [], skipped: ['p1'] }))
    await expect(prepApi.render('c/1', 'req-12345678')).resolves.toEqual({ jobs: [], skipped: ['p1'] })
    const [url, init] = apiFetchMock.mock.calls[0]!
    expect(url).toBe('/api/prep/courses/c%2F1/render')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ requestId: 'req-12345678' }) })
    expect(new Headers(init!.headers).get('content-type')).toBe('application/json')
  })

  it('send streams NDJSON frames', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(stream(['{"type":"queued","ahead":0}\n{"type":"delta","delta":"好"}\n']), { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } }))
    const frames: unknown[] = []
    await expect(prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, (f) => frames.push(f))).resolves.toBe('streamed')
    expect(frames).toEqual([{ type: 'queued', ahead: 0 }, { type: 'delta', delta: '好' }])
    const init = apiFetchMock.mock.calls[0]![1]!
    expect(new Headers(init.headers).get('accept')).toBe('application/x-ndjson')
  })

  it('send: 202 means the same request is still running; a JSON body is a replay delivered as one done frame', async () => {
    apiFetchMock.mockResolvedValueOnce(json(202, { error: '这条消息还在处理中。', code: 'PREP_RUN_IN_PROGRESS', runId: 'r', status: 'running' }))
    const frames: unknown[] = []
    await expect(prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, (f) => frames.push(f))).resolves.toBe('running')
    expect(frames).toEqual([])
    const done = { runId: 'r', session: { id: 's-1', title: 't', courseId: null, createdAt: 1, updatedAt: 1 }, message: { id: 'm', role: 'assistant', content: '好了', createdAt: 2 }, tools: [], outcome: 'completed', replayed: true }
    apiFetchMock.mockResolvedValueOnce(json(200, done))
    await expect(prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, (f) => frames.push(f))).resolves.toBe('replayed')
    expect(frames).toEqual([{ type: 'done', ...done }])
  })

  it('send: chat failures (403 credential, 409 conflict, 429, 504) throw PrepApiError with the code', async () => {
    for (const [status, code] of [[403, 'PREP_CREDENTIAL_REQUIRED'], [409, 'REQUEST_KEY_CONFLICT'], [429, 'PREP_QUEUE_FULL'], [504, 'PREP_TIMEOUT']] as const) {
      apiFetchMock.mockResolvedValueOnce(json(status, { error: 'x', code }))
      await expect(prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, () => {})).rejects.toMatchObject({ status, code })
    }
  })
})

// ---- T11 fix round 1（task-11-review.md） ----
const doneFrame = (outcome: 'completed' | 'failed', id = 'm-1', content = '计划已建好。') => ({ type: 'done' as const, runId: 'run-1', message: { id, content, createdAt: 1 }, tools: [], outcome, session: { id: 's', title: 't', courseId: null, createdAt: 1, updatedAt: 1 } })

describe('chat reducer: retry with the same requestId (review Important)', () => {
  it('send → error → send again (same rid) → frames → done gives one teacher line and one reply, unique keys', () => {
    let s = chatReducer([], { type: 'sent', requestId: 'r1', content: '建课' })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'error', error: '等了太久', code: 'PREP_TIMEOUT' } })
    s = chatReducer(s, { type: 'sent', requestId: 'r1', content: '建课' })
    expect(s.map((m) => m.role)).toEqual(['teacher', 'draft'])
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'delta', delta: '好的' } })
    expect(s.at(-1)).toMatchObject({ role: 'draft', content: '好的' })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: doneFrame('completed') })
    expect(s.map((m) => [m.role, m.content])).toEqual([['teacher', '建课'], ['assistant', '计划已建好。']])
    expect(new Set(s.map((m) => m.key)).size).toBe(s.length)
  })
  it('a failed send (client side) followed by a resend is also deduplicated; frames after an error are ignored', () => {
    let s = chatReducer([], { type: 'sent', requestId: 'r2', content: '再来' })
    s = chatReducer(s, { type: 'failed', requestId: 'r2', error: '网络断了' })
    const errored = chatReducer(s, { type: 'frame', requestId: 'r2', frame: { type: 'delta', delta: '迟到' } })
    expect(errored).toEqual(s)
    s = chatReducer(s, { type: 'sent', requestId: 'r2', content: '再来' })
    expect(s.map((m) => m.role)).toEqual(['teacher', 'draft'])
    expect(new Set(s.map((m) => m.key)).size).toBe(s.length)
  })
  it('other messages are kept when one requestId is resent', () => {
    let s = chatReducer([], { type: 'sent', requestId: 'a1', content: '第一条' })
    s = chatReducer(s, { type: 'frame', requestId: 'a1', frame: doneFrame('completed', 'm-a', '一') })
    s = chatReducer(s, { type: 'sent', requestId: 'b1', content: '第二条' })
    s = chatReducer(s, { type: 'frame', requestId: 'b1', frame: { type: 'error', error: '失败' } })
    s = chatReducer(s, { type: 'sent', requestId: 'b1', content: '第二条' })
    expect(s.map((m) => [m.role, m.content])).toEqual([['teacher', '第一条'], ['assistant', '一'], ['teacher', '第二条'], ['draft', '']])
  })
  it('a done frame with outcome failed renders as an error line', () => {
    const s = chatReducer(chatReducer([], { type: 'sent', requestId: 'r3', content: '建课' }), { type: 'frame', requestId: 'r3', frame: doneFrame('failed', 'm-f', '这次没有处理完。') })
    expect(s.at(-1)).toMatchObject({ role: 'error', content: '这次没有处理完。' })
  })
})

describe('readNdjson robustness (review Minor)', () => {
  it('keeps a multi-byte character split across byte chunks intact', async () => {
    const bytes = new TextEncoder().encode('{"type":"delta","delta":"静夜思"}\n')
    const cut = bytes.indexOf(0xe9) + 1 // 切在"静"的第一个字节之后
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close() } })
    const out: unknown[] = []
    for await (const f of readNdjson(body)) out.push(f)
    expect(out).toEqual([{ type: 'delta', delta: '静夜思' }])
  })
  it('cancels the stream when the consumer stops early', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('{"type":"ping"}\n{"type":"ping"}\n')) },
      cancel() { cancelled = true },
    })
    for await (const _f of readNdjson(body)) break
    expect(cancelled).toBe(true)
  })
})

describe('prep api send robustness (review Minor)', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('skips a malformed line in the middle of a stream', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(stream(['{"type":"delta","delta":"a"}\n{"type":"del', 'ta",broken}\n{"type":"delta","delta":"b"}\n']), { status: 200, headers: { 'content-type': 'application/x-ndjson' } }))
    const frames: unknown[] = []
    await prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, (f) => frames.push(f))
    expect(frames).toEqual([{ type: 'delta', delta: 'a' }, { type: 'delta', delta: 'b' }])
  })

  it('passes the abort signal through and rejects with AbortError when aborted mid-stream', async () => {
    const controller = new AbortController()
    apiFetchMock.mockImplementationOnce(async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"type":"delta","delta":"a"}\n'))
          init!.signal!.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
        },
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
    })
    const frames: unknown[] = []
    const sending = prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, (f) => { frames.push(f); controller.abort() }, controller.signal)
    await expect(sending).rejects.toMatchObject({ name: 'AbortError' })
    expect(apiFetchMock.mock.calls[0]![1]!.signal).toBe(controller.signal)
    expect(frames).toEqual([{ type: 'delta', delta: 'a' }])
  })

  it('a non-NDJSON 5xx throws PrepApiError', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
    await expect(prepApi.send('s-1', { content: '建课', requestId: 'req-12345678' }, () => {})).rejects.toMatchObject({ name: 'PrepApiError', status: 503 })
  })
})

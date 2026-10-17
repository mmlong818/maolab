import { expect, test } from 'vitest'
import { createPrep, type PrepJobs } from '@maolab/prep-bundle/prep'
import type { LlmStreamOptions } from '@maolab/prep-bundle/prep-model'
import { apply as applyPrepTools, PREP_TOOL_NAMES, PREP_TOOL_REASONS } from '@maolab/prep-bundle/tools-prep'
import { loadCourseForTests } from './helpers/prep.ts'

const course = await loadCourseForTests()
type Tool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: { render(args: unknown, value: unknown): Array<{ type: string; text: string }> }
  execute(args: Record<string, unknown>, exec: unknown): Promise<Record<string, any>>
}
type Job = { id: string; owner: string; courseId: string; kind: string; requestKey: string; payload: Record<string, unknown>; status: string; attempts: number; result: unknown; error: null; createdAt: number }

/** 与 PgRenderJobs.forOwner 同语义的内存队列：按 owner 隔离、requestKey 幂等、render-page 必带 pageId、只投本 owner 存在的课程 */
function memoryJobs(owner: string, courseExists: (courseId: string) => Promise<boolean>, all: Job[], failure?: () => Error | undefined): PrepJobs {
  return {
    async enqueue(input) {
      const injected = failure?.()
      if (injected) throw injected
      const pageId = input.payload?.pageId
      if (input.kind === 'render-page' && (typeof pageId !== 'string' || !pageId.trim())) throw new Error('render-page jobs require payload.pageId')
      const existing = all.find((job) => job.owner === owner && job.requestKey === input.requestKey)
      if (existing) return { job: existing as never, created: false }
      if (!(await courseExists(input.courseId))) throw Object.assign(new Error('course not found'), { code: 'COURSE_NOT_FOUND' })
      const job: Job = { id: `rj_${String(all.length + 1).padStart(4, '0')}`, owner, courseId: input.courseId, kind: input.kind, requestKey: input.requestKey, payload: input.payload ?? {}, status: 'queued', attempts: 0, result: null, error: null, createdAt: all.length }
      all.push(job)
      return { job: job as never, created: true }
    },
    async get(id) { return all.find((job) => job.owner === owner && job.id === id) as never },
    async listForCourse(courseId, limit = 20) { return all.filter((job) => job.owner === owner && job.courseId === courseId).reverse().slice(0, limit) as never },
  }
}

function rig(entries: Record<string, { owner: string; credential?: string }>) {
  const docs = new Map<string, ReturnType<typeof course.createMemoryCourseDocuments>>()
  const documentsFor = (owner: string) => {
    let store = docs.get(owner)
    if (!store) { store = course.createMemoryCourseDocuments(); docs.set(owner, store) }
    return store
  }
  const jobs: Job[] = []
  const queue: { failure?: Error } = {}
  /** auditFailure：整课审查请求改为返回这个适配器失败（finish 块），其余请求照常 */
  const gateway: { auditFailure?: Record<string, unknown> } = {}
  const llmCalls: LlmStreamOptions[] = []
  const llm = {
    async *stream(options: LlmStreamOptions) {
      llmCalls.push(options)
      if (gateway.auditFailure && (options.system ?? '').includes('整课事实与教学一致性核查官')) {
        yield { type: 'finish', reason: { kind: 'error', failure: gateway.auditFailure } }
        return
      }
      yield { type: 'text-delta', text: course.fixtureLlmReply({ system: options.system ?? '', user: options.messages[0]!.content[0]!.text }) }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    },
  }
  const prep = createPrep({
    course,
    sessions: {
      ownerOf: (agent) => entries[String(agent.id)]?.owner,
      credentialOf: (agent) => entries[String(agent.id)]?.credential,
      isPrivateSession: () => false,
    },
    llm,
    documentsFor,
    knowledge: course.prepFixtureKnowledge(),
    jobsFor: (owner) => memoryJobs(owner, async (courseId) => Boolean(await course.createMainlineCourseStore(documentsFor(owner)).findMainlineCourse(courseId)), jobs, () => queue.failure),
    model: 'fake-course',
    imageModel: '',
    baseUrl: 'http://gw.test/v1',
  })
  const tools = new Map<string, Tool>()
  applyPrepTools({ tools: { register: (tool: unknown) => { tools.set((tool as Tool).name, tool as Tool) } }, yunyiPrep: prep })
  let seq = 0
  const run = (sessionId: string, tool: string, args: Record<string, unknown>, callId = `call-${++seq}`, signal = new AbortController().signal) =>
    tools.get(tool)!.execute(args, { agent: { id: sessionId }, signal, callId })
  return { tools, run, jobs, llmCalls, documentsFor, queue, gateway }
}

async function plannedAndApproved(t: ReturnType<typeof rig>, sessionId: string): Promise<string> {
  const planned = await t.run(sessionId, 'plan_course', { kpIds: [...course.PREP_FIXTURE_KP_IDS] })
  expect(planned).toMatchObject({ ok: true })
  const courseId = planned.course.courseId as string
  expect(await t.run(sessionId, 'approve_plan', { courseId, action: 'approve', updates: [] })).toMatchObject({ ok: true })
  return courseId
}

test('the tool set is exactly the prep list, no tool takes identity from its arguments, and another owner gets not-found', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' }, 's-b': { owner: 'teacher-b', credential: 'cred-b' } })
  expect([...t.tools.keys()].sort()).toEqual([...PREP_TOOL_NAMES])
  for (const tool of t.tools.values()) expect(Object.keys(tool.parameters).filter((key) => /owner|session|credential|user|teacher/i.test(key)), tool.name).toEqual([])
  const courseId = await plannedAndApproved(t, 's-a')
  const calls = t.llmCalls.length
  for (const [tool, args] of [
    ['read_course', { courseId, owner: 'teacher-a' }], ['prep_brief', { courseId }], ['generate_page', { courseId }], ['audit_page', { courseId, pageId: 'p' }],
    ['repair_page', { courseId, pageId: 'p' }], ['render_page', { courseId }], ['audit_course', { courseId }], ['accept_page', { courseId, pageId: 'p' }],
    ['accept_course', { courseId }], ['export_pptx', { courseId }], ['rehearse', { courseId }], ['approve_plan', { courseId, action: 'approve', updates: [] }],
  ] as const) {
    expect(await t.run('s-b', tool, args), tool).toMatchObject({ ok: false, reason: 'not-found' })
  }
  expect(await t.run('s-b', 'list_courses', {})).toEqual({ ok: true, courses: [] })
  expect(t.llmCalls.length).toBe(calls)
  expect(t.jobs).toHaveLength(0)
})

test('a session without a credential: model tools refuse before any model call, the rest still works', async () => {
  const t = rig({ 's-c': { owner: 'teacher-c' } })
  const courseId = await plannedAndApproved(t, 's-c')
  for (const [tool, args] of [['generate_page', { courseId }], ['repair_page', { courseId, pageId: 'p' }], ['audit_course', { courseId }], ['rehearse', { courseId }]] as const) {
    expect(await t.run('s-c', tool, args), tool).toMatchObject({ ok: false, reason: 'missing-credential' })
  }
  expect(t.llmCalls).toHaveLength(0)
  expect(await t.run('s-c', 'read_course', { courseId })).toMatchObject({ ok: true })
})

test('model tools carry the session id to the adapter and report their metered calls', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  const result = await t.run('s-a', 'generate_page', { courseId })
  expect(result).toMatchObject({ ok: true, page: { status: 'content-ready' }, modelCalls: { calls: expect.any(Number), failures: 0 } })
  expect(result.modelCalls.calls).toBe(t.llmCalls.length)
  expect(t.llmCalls.every((call) => call.sessionId === 's-a' && call.provider === 'yunyi' && call.model === 'fake-course')).toBe(true)
})

test('the tool call signal reaches the facade: an aborted call is cancelled without a model request', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  const aborted = new AbortController()
  aborted.abort()
  expect(await t.run('s-a', 'generate_page', { courseId }, 'call-cancel', aborted.signal)).toMatchObject({ ok: false, reason: 'cancelled' })
  expect(t.llmCalls).toHaveLength(0)
  expect(await t.run('s-a', 'generate_page', { courseId })).toMatchObject({ ok: true })
})

/** 各页当前的正文修订 id（content-ready 的内容检查点） */
async function pageRevisions(t: ReturnType<typeof rig>, owner: string, courseId: string): Promise<Record<string, string>> {
  const stored = await course.createMainlineCourseStore(t.documentsFor(owner)).findMainlineCourse(courseId)
  return Object.fromEntries(stored!.generationSession!.jobs.map((job: { pageId: string; contentCheckpoint?: { contentRevisionId: string } }) => [job.pageId, job.contentCheckpoint?.contentRevisionId ?? '']))
}

test('render_page queues renderable pages in order with pageId and session+call+page+revision keys; replays and queued pages do not duplicate', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  expect(await t.run('s-a', 'render_page', { courseId })).toMatchObject({ ok: false, reason: 'session-not-ready' })
  expect(t.jobs).toHaveLength(0)
  for (let i = 0; i < 40; i += 1) if (!(await t.run('s-a', 'generate_page', { courseId })).ok) break
  const pageIds = (await t.run('s-a', 'read_course', { courseId })).course.pages.map((page: { pageId: string }) => page.pageId)
  const first = await t.run('s-a', 'render_page', { courseId }, 'call-render-1')
  expect(first.queued.map((item: { pageId: string }) => item.pageId)).toEqual(pageIds)
  expect(first.queued.every((item: { created: boolean }) => item.created)).toBe(true)
  // 3c 裁决 F2 与终审 M4：requestKey = 会话 id : 调用 id : 页 id : 页的正文修订 id
  const revisions = await pageRevisions(t, 'teacher-a', courseId)
  expect(Object.values(revisions).every((revision) => revision.length > 0)).toBe(true)
  expect(t.jobs.map((job) => [job.kind, job.payload.pageId, job.requestKey])).toEqual(pageIds.map((pageId: string) => ['render-page', pageId, `s-a:call-render-1:${pageId}:${revisions[pageId]}`]))
  // 同一次调用重放：拿回同一批任务（created false），不重复投递
  const replay = await t.run('s-a', 'render_page', { courseId }, 'call-render-1')
  expect(replay.queued.map((item: { pageId: string; jobId: string }) => [item.pageId, item.jobId])).toEqual(first.queued.map((item: { pageId: string; jobId: string }) => [item.pageId, item.jobId]))
  expect(replay.queued.every((item: { created: boolean }) => item.created === false)).toBe(true)
  // 新调用：已在队列里的页不再投
  const again = await t.run('s-a', 'render_page', { courseId }, 'call-render-2')
  expect(again).toMatchObject({ ok: true, queued: [], alreadyQueued: pageIds })
  expect(t.jobs).toHaveLength(pageIds.length)
  expect((await t.run('s-a', 'read_course', { courseId })).jobs).toHaveLength(Math.min(10, pageIds.length))
  // 截图做完后（任务不再排队），新调用的同一页重新投递，不会拿回旧任务
  for (const job of t.jobs) job.status = 'succeeded'
  const rerender = await t.run('s-a', 'render_page', { courseId, pageId: pageIds[0] }, 'call-render-3')
  expect(rerender).toMatchObject({ ok: true, queued: [{ pageId: pageIds[0], created: true }], alreadyQueued: [] })
  expect(t.jobs.at(-1)).toMatchObject({ kind: 'render-page', requestKey: `s-a:call-render-3:${pageIds[0]}:${revisions[pageIds[0]]}`, payload: { pageId: pageIds[0] } })
  // 同一次调用、同一正文修订重放：仍拿回同一个任务（去重不变）
  const replayed = await t.run('s-a', 'render_page', { courseId, pageId: pageIds[0] }, 'call-render-3')
  expect(replayed).toMatchObject({ ok: true, queued: [{ pageId: pageIds[0], jobId: rerender.queued[0].jobId, created: false }] })
})

test('a repeated call id after the page content changed queues a new render job instead of returning the finished one (final review M4)', async () => {
  // 网关的流里缺 tool_call id 时适配器回退为 call_<序号>，同一会话里调用 id 会重复；页修过后正文修订 id 变了，必须投新任务
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  for (let i = 0; i < 40; i += 1) if (!(await t.run('s-a', 'generate_page', { courseId })).ok) break
  const pageIds = (await t.run('s-a', 'read_course', { courseId })).course.pages.map((page: { pageId: string }) => page.pageId)
  const first = await t.run('s-a', 'render_page', { courseId, pageId: pageIds[0] }, 'call_0')
  expect(first).toMatchObject({ ok: true, queued: [{ pageId: pageIds[0], created: true }] })
  for (const job of t.jobs) job.status = 'succeeded'
  // 模拟修页：这一页的内容检查点换成新的正文修订
  const store = course.createMainlineCourseStore(t.documentsFor('teacher-a'))
  const stored = (await store.findMainlineCourse(courseId))!
  const jobs = stored.generationSession!.jobs.map((job: { pageId: string; contentCheckpoint?: Record<string, unknown> }) => job.pageId === pageIds[0] ? { ...job, contentCheckpoint: { ...job.contentCheckpoint, contentRevisionId: 'rev-after-repair' } } : job)
  await store.saveMainlineCourse({ ...stored, generationSession: { ...stored.generationSession!, jobs } } as never)
  const again = await t.run('s-a', 'render_page', { courseId, pageId: pageIds[0] }, 'call_0')
  expect(again).toMatchObject({ ok: true, queued: [{ pageId: pageIds[0], created: true }] })
  expect(again.queued[0].jobId).not.toBe(first.queued[0].jobId)
  expect(t.jobs.at(-1)!.requestKey).toBe(`s-a:call_0:${pageIds[0]}:rev-after-repair`)
})

test('a dead credential during audit_course is model-channel-missing with no advice to re-run, after a single outbound request (final review I1)', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  for (let i = 0; i < 40; i += 1) if (!(await t.run('s-a', 'generate_page', { courseId })).ok) break
  // 截图：同 3b worker，另一个服务实例、同一份仓储，固定合格度量
  const store = course.createMainlineCourseStore(t.documentsFor('teacher-a'))
  const metrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.35 }
  const render = course.createCourseGenerationServices(store, {
    render: {
      capture: async (_url: string, pageNumber: number) => ({ screenshot: Buffer.from([pageNumber]), metrics }),
      writeEvidence: async (_courseId: string, pageId: string, evidenceId: string) => `/api/prep/artifacts/ar_${pageId}_${evidenceId.slice(0, 8)}`,
      pageUrl: (origin: string, id: string, pageNumber: number) => `${origin}/prep/render/?course=${id}&page=${pageNumber}`,
    },
  }).render!
  for (let i = 0; i < 40; i += 1) if ((await render.runNext(courseId, 'http://web.test')).done) break
  expect((await store.findMainlineCourse(courseId))!.generationSession!.status).toBe('course-audit')
  t.gateway.auditFailure = { code: 'AUTH', status: 401, message: 'yunyi-llm: HTTP 401: invalid key' }
  const before = t.llmCalls.length
  const result = await t.run('s-a', 'audit_course', { courseId })
  expect(result).toMatchObject({ ok: false, reason: 'model-channel-missing', modelCalls: { calls: 1 } })
  expect(t.llmCalls.length - before).toBe(1)
  const text = JSON.stringify(result)
  expect(text).toContain('重新登录')
  expect(text).not.toMatch(/直接重跑|重跑 audit_course|稍后再|repair_page/)
  expect(PREP_TOOL_REASONS['model-channel-missing']).toContain('不要重试')
})

test('an unexpected failure does not hand the raw error text (which may quote course content) to the model', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  for (let i = 0; i < 40; i += 1) if (!(await t.run('s-a', 'generate_page', { courseId })).ok) break
  t.queue.failure = new SyntaxError('Unexpected token 关 in JSON at position 3: "关关雎鸠，在河之洲"')
  const result = await t.run('s-a', 'render_page', { courseId })
  expect(result).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('SyntaxError') })
  expect(JSON.stringify(result)).not.toContain('关关雎鸠')
  expect(JSON.stringify(result)).not.toContain('Unexpected token')
})

test('render_page with nothing left to screenshot says what the current stage is instead of always pointing at audit_course', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  for (let i = 0; i < 40; i += 1) if (!(await t.run('s-a', 'generate_page', { courseId })).ok) break
  // 只看会话阶段：把会话直接置为已验收（ready）
  const store = course.createMainlineCourseStore(t.documentsFor('teacher-a'))
  const stored = (await store.findMainlineCourse(courseId))!
  await store.saveMainlineCourse({ ...stored, generationSession: { ...stored.generationSession!, status: 'ready' } } as never)
  const result = await t.run('s-a', 'render_page', { courseId })
  expect(result).toMatchObject({ ok: true, queued: [], alreadyQueued: [] })
  expect(result.note).not.toContain('audit_course')
  expect(result.note).toContain('export_pptx')
})

test('export_pptx refuses an unready course without queueing, and queues exactly one job for a ready course', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' }, 's-a2': { owner: 'teacher-a', credential: 'cred-a' } })
  const courseId = await plannedAndApproved(t, 's-a')
  expect(await t.run('s-a', 'export_pptx', { courseId })).toMatchObject({ ok: false, reason: 'not-ready' })
  expect(t.jobs).toHaveLength(0)
  const golden = course.goldenExportCourse('golden-export-unit')
  await course.createMainlineCourseStore(t.documentsFor('teacher-a')).saveMainlineCourse(golden)
  const queued = await t.run('s-a', 'export_pptx', { courseId: golden.id }, 'call-export-1')
  expect(queued).toMatchObject({ ok: true, job: { created: true }, export: { filename: expect.stringMatching(/\.pptx$/) } })
  expect(await t.run('s-a', 'export_pptx', { courseId: golden.id }, 'call-export-1')).toMatchObject({ ok: true, job: { created: false } })
  expect(t.jobs.map((job) => [job.kind, job.requestKey])).toEqual([['export-pptx', 's-a:call-export-1']])
  // 同一账号的另一个会话碰巧用了同样的调用 id：是另一次调用，另投一个任务（F2）
  expect(await t.run('s-a2', 'export_pptx', { courseId: golden.id }, 'call-export-1')).toMatchObject({ ok: true, job: { created: true } })
  expect(t.jobs.map((job) => job.requestKey)).toEqual(['s-a:call-export-1', 's-a2:call-export-1'])
  expect((await t.run('s-a', 'read_course', { courseId: golden.id })).jobs).toMatchObject([{ kind: 'export-pptx', status: 'queued', pageId: null }, { kind: 'export-pptx', status: 'queued', pageId: null }])
})

test('the reason table covers facade and tool reasons, and descriptions point the model at the right next step', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  for (const reason of ['not-found', 'invalid-input', 'plan-conflict', 'audit-blocked', 'not-ready', 'model-channel-missing', 'model-unavailable', 'cancelled', 'failed', 'missing-credential', 'render-queue-unavailable', 'no-session', 'private-session', 'prep-unavailable']) {
    expect(PREP_TOOL_REASONS, reason).toHaveProperty(reason)
  }
  const audit = t.tools.get('audit_course')!.description
  for (const word of ['audit-blocked', 'findings', 'factIssues', 'unverifiedPageIds', 'pendingPageIds', 'advice']) expect(audit, word).toContain(word)
  expect(t.tools.get('approve_plan')!.description).toMatch(/plan-conflict[^。]*read_course/)
  for (const tool of ['generate_page', 'repair_page', 'audit_course', 'rehearse']) {
    for (const reason of ['missing-credential', 'model-channel-missing', 'model-unavailable', 'cancelled']) expect(t.tools.get(tool)!.description, `${tool} ${reason}`).toContain(reason)
  }
})

test('tool results render as JSON text only', async () => {
  const t = rig({ 's-a': { owner: 'teacher-a', credential: 'cred-a' } })
  const value = await t.run('s-a', 'list_courses', {})
  const rendered = t.tools.get('list_courses')!.output.render({}, value)
  expect(rendered).toHaveLength(1)
  expect(JSON.parse(rendered[0]!.text)).toEqual(value)
})

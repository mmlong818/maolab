// prep 的隔离专项（3c，spec 11 第 3、4 条）：真实宿主 + 测试库。只动 course_test_prep_iso* schema 与 course_test_prep_iso_* 账号行。
// agent 的模型是假的（fake-openai，provider fake），工具内的模型请求经 yunyi 适配器打到假课程网关（记录凭证头与预算）。
// 3c 裁决 F5（以 T8 实测为准）：工具内调用带 preset 的 max_tokens 与 reasoning_effort low，这里设 YUNYI_LLM_MAX_TOKENS_PREP=1234 并断言。
// 没配 TEST_PG_DATABASE_URL 时整组跳过（与 prep-host 的 PG 组一致）。
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startFakeCourseLlm } from './helpers/fake-course-llm.ts'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'
import { dropPrepSchemas, loadCourseForTests, prepPgUrl, prepSession, resetPrepSchemas, testPgConfigured } from './helpers/prep.ts'

const COURSE_SCHEMA = 'course_test_prep_iso'
const KNOWLEDGE_SCHEMA = 'course_test_prep_iso_kp'
const A = 'course_test_prep_iso_a'
const B = 'course_test_prep_iso_b'
const C = 'course_test_prep_iso_c'
const PREP_MAX_TOKENS = 1234
const run = Date.now().toString(36)

describe.skipIf(!testPgConfigured())('prep isolation on PG', () => {
  let course: Awaited<ReturnType<typeof loadCourseForTests>>
  let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
  let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>>
  let host: Awaited<ReturnType<typeof startHost>>
  let pool: pg.Pool
  let seq = 0

  beforeAll(async () => {
    course = await loadCourseForTests()
    await resetPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners: [A, B, C], fixtures: course })
    pool = new pg.Pool({ connectionString: prepPgUrl(), max: 2 })
    fake = await startFakeOpenAI()
    gateway = await startFakeCourseLlm((request) => course.fixtureLlmReply(request))
    host = await startHost({
      FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: prepPgUrl(),
      YUNYI_COURSE_SCHEMA: COURSE_SCHEMA, YUNYI_PREP_KNOWLEDGE_SCHEMA: KNOWLEDGE_SCHEMA, YUNYI_PREP_MODEL: 'fake-course',
      YUNYI_LLM_MAX_TOKENS_PREP: String(PREP_MAX_TOKENS),
    }, { readyTimeoutMs: 120_000 })
  }, 180_000)
  afterAll(async () => {
    // 前面任何一步抛错都要删掉 schema 与账号行（审查 M4）
    try {
      await host?.stop()
      await fake?.close()
      await gateway?.close()
      await pool?.end()
    } finally {
      await dropPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners: [A, B, C] })
    }
  })

  async function open(owner: string, credential?: string) {
    const id = `s-prep-iso-${++seq}-${run}`
    expect((await host.api('POST', '/sessions', { sessionId: id, owner, ...(credential ? { credential } : {}), preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
    return { id, ...prepSession(host, id) }
  }
  async function approvedCourse(session: Awaited<ReturnType<typeof open>>, kpIds: readonly string[] = course.PREP_FIXTURE_KP_IDS): Promise<string> {
    const planned = await session.call('plan_course', { kpIds: [...kpIds] })
    expect(planned).toMatchObject({ ok: true })
    const courseId = planned.course.courseId as string
    expect(await session.call('approve_plan', { courseId, action: 'approve', updates: [] })).toMatchObject({ ok: true })
    return courseId
  }
  /** 每个工具内请求的 Authorization 与"按请求内容判定的来源会话"的凭证逐条比对：返回认不出来源或凭证不符的请求（应为空） */
  function misattributed(seen: typeof gateway.requests, sourceOf: (request: (typeof gateway.requests)[number]) => string | undefined, credentialOf: Record<string, string>) {
    return seen.map((request, index) => ({ index, source: sourceOf(request), authorization: request.authorization }))
      .filter((item) => item.source === undefined || `Bearer ${credentialOf[item.source]}` !== item.authorization)
  }
  const rows = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as Array<Record<string, any>>

  test('another teacher cannot read, change, render, accept, export or revise a course by id', async () => {
    const a = await open(A, 'cred-a')
    const b = await open(B, 'cred-b')
    const courseId = await approvedCourse(a)
    const before = (await rows(`select updated_at from ${COURSE_SCHEMA}.documents where id = $1`, [courseId]))[0]!.updated_at
    const requests = gateway.requests.length
    // 参数里写 owner: A 也没用：owner 只取自会话（审查 M2）
    for (const [tool, args] of [
      ['read_course', { courseId }], ['prep_brief', { courseId }], ['approve_plan', { courseId, action: 'approve', updates: [] }],
      ['generate_page', { courseId }], ['audit_page', { courseId, pageId: 'p' }], ['repair_page', { courseId, pageId: 'p' }],
      ['render_page', { courseId }], ['audit_course', { courseId }], ['accept_page', { courseId, pageId: 'p' }],
      ['accept_course', { courseId }], ['export_pptx', { courseId }], ['rehearse', { courseId }],
      ['revise_course', { courseId }],
    ] as const) {
      expect(await b.call(tool, { ...args, owner: A }), tool).toMatchObject({ ok: false, reason: 'not-found' })
    }
    expect(await b.call('list_courses', { owner: A })).toEqual({ ok: true, courses: [] })
    expect((await rows(`select updated_at from ${COURSE_SCHEMA}.documents where id = $1`, [courseId]))[0]!.updated_at).toBe(before)
    expect(gateway.requests.length).toBe(requests)
    expect(await rows(`select id from ${COURSE_SCHEMA}.render_jobs where owner = $1`, [B])).toHaveLength(0)
    expect(await rows(`select id from ${COURSE_SCHEMA}.render_jobs where course_id = $1`, [courseId])).toHaveLength(0)
    await a.close()
    await b.close()
  })

  test('a session without a credential gets missing-credential from every model tool and the gateway sees nothing', async () => {
    const c = await open(C)
    const courseId = await approvedCourse(c)
    const before = gateway.requests.length
    for (const [tool, args] of [['generate_page', { courseId }], ['repair_page', { courseId, pageId: 'p' }], ['audit_course', { courseId }], ['rehearse', { courseId }]] as const) {
      expect(await c.call(tool, args), tool).toMatchObject({ ok: false, reason: 'missing-credential' })
    }
    expect(gateway.requests.length).toBe(before)
    expect(await c.call('read_course', { courseId })).toMatchObject({ ok: true })
    await c.close()
  })

  test('concurrent teachers: every tool-internal model request carries its own session credential and the prep budget', async () => {
    const a = await open(A, 'cred-a2')
    const b = await open(B, 'cred-b2')
    // 两门课各取一个知识点，让每个工具内请求的文本能认出来源（审查 M3）：
    // A 的课只含"《芣苢》中叠词的表达效果"，B 的课只含"重章叠句"（实测两门课的逐页生成与单页核查请求都恰好命中一个）
    const [kpA, kpB] = course.PREP_FIXTURE_KP_IDS
    const [ca, cb] = await Promise.all([approvedCourse(a, [kpA!]), approvedCourse(b, [kpB!])])
    const start = gateway.requests.length
    const [ra, rb] = await Promise.all([a.call('generate_page', { courseId: ca }), b.call('generate_page', { courseId: cb })])
    expect(ra).toMatchObject({ ok: true, modelCalls: { failures: 0 } })
    expect(rb).toMatchObject({ ok: true, modelCalls: { failures: 0 } })
    const seen = gateway.requests.slice(start)
    const auth = seen.map((request) => request.authorization)
    expect(new Set(auth)).toEqual(new Set(['Bearer cred-a2', 'Bearer cred-b2']))
    expect(auth.filter((value) => value === 'Bearer cred-a2')).toHaveLength(ra.modelCalls.calls)
    expect(auth.filter((value) => value === 'Bearer cred-b2')).toHaveLength(rb.modelCalls.calls)
    const sourceOf = (request: { system: string; user: string }) => {
      const text = `${request.system} ${request.user}`
      const isA = text.includes('《芣苢》中叠词的表达效果')
      const isB = text.includes('重章叠句')
      return isA === isB ? undefined : isA ? 'a' : 'b'
    }
    expect(misattributed(seen, sourceOf, { a: 'cred-a2', b: 'cred-b2' })).toEqual([])
    // 工具内请求按 prep 预算（裁决 F5：带 preset 的 max_tokens 与 reasoning_effort low），模型名来自 YUNYI_PREP_MODEL
    expect(seen.every((request) => request.model === 'fake-course' && request.reasoningEffort === 'low' && request.maxTokens === PREP_MAX_TOKENS)).toBe(true)
    await a.close()
    await b.close()
  })

  test('render_page queues every renderable page in plan order with its pageId; a second call queues nothing new', async () => {
    const a = await open(A, 'cred-a3')
    const courseId = await approvedCourse(a)
    for (let i = 0; i < 40; i += 1) {
      const result = await a.call('generate_page', { courseId })
      if (!result.ok) { expect(result.reason).toBe('session-not-ready'); break }
    }
    const pageIds = (await a.call('read_course', { courseId })).course.pages.map((page: { pageId: string }) => page.pageId)
    expect(pageIds.length).toBeGreaterThan(1)
    const first = await a.call('render_page', { courseId })
    expect(first).toMatchObject({ ok: true, alreadyQueued: [] })
    expect(first.queued.map((item: { pageId: string }) => item.pageId)).toEqual(pageIds)
    expect(first.queued.every((item: { created: boolean; status: string }) => item.created === true && item.status === 'queued')).toBe(true)
    const queued = await rows(`select payload->>'pageId' as page_id, request_key, kind, status from ${COURSE_SCHEMA}.render_jobs where owner = $1 and course_id = $2 order by available_at, created_at, id collate "C"`, [A, courseId])
    expect(queued.map((row) => row.page_id)).toEqual(pageIds)
    expect(queued.every((row) => row.kind === 'render-page' && row.status === 'queued')).toBe(true)
    // 裁决 F2 与终审 M4：requestKey = 会话 id : 调用 id : 页 id : 页的正文修订 id（同一次调用的各页共用一个调用 id）
    const payload = (await rows(`select payload from ${COURSE_SCHEMA}.documents where id = $1`, [courseId]))[0]!.payload as { generationSession: { jobs: Array<{ pageId: string; contentCheckpoint?: { contentRevisionId: string } }> } }
    const revisions = new Map(payload.generationSession.jobs.map((job) => [job.pageId, job.contentCheckpoint?.contentRevisionId ?? '']))
    const callIds = new Set(queued.map((row, index) => {
      const key = String(row.request_key)
      const suffix = `:${pageIds[index]}:${revisions.get(pageIds[index])}`
      expect(revisions.get(pageIds[index]), pageIds[index]).toBeTruthy()
      expect(key.startsWith(`${a.id}:`), key).toBe(true)
      expect(key.endsWith(suffix), key).toBe(true)
      return key.slice(a.id.length + 1, key.length - suffix.length)
    }))
    expect(callIds.size).toBe(1)
    expect([...callIds][0]).not.toBe('')
    expect(await a.call('render_page', { courseId })).toMatchObject({ ok: true, queued: [], alreadyQueued: pageIds })
    expect(await rows(`select id from ${COURSE_SCHEMA}.render_jobs where owner = $1 and course_id = $2`, [A, courseId])).toHaveLength(pageIds.length)
    expect(await a.call('export_pptx', { courseId })).toMatchObject({ ok: false, reason: 'not-ready' })
    expect(await rows(`select id from ${COURSE_SCHEMA}.render_jobs where kind = 'export-pptx'`)).toHaveLength(0)
    await a.close()
  })

  test('two sessions of the same teacher share one facade: concurrent generate_page calls produce two different pages, each with its own credential', async () => {
    // 同一 owner、两个凭证（审查 M1）：门面按 owner 共享，模型通道与凭证不得跟着门面被缓存复用
    const s1 = await open(A, 'cred-a4')
    const s2 = await open(A, 'cred-a5')
    const courseId = await approvedCourse(s1)
    const start = gateway.requests.length
    const [r1, r2] = await Promise.all([s1.call('generate_page', { courseId }), s2.call('generate_page', { courseId })])
    expect(r1).toMatchObject({ ok: true, modelCalls: { failures: 0 } })
    expect(r2).toMatchObject({ ok: true, modelCalls: { failures: 0 } })
    expect(r1.page.pageId).not.toBe(r2.page.pageId)
    const seen = gateway.requests.slice(start)
    const auth = seen.map((request) => request.authorization)
    expect(new Set(auth)).toEqual(new Set(['Bearer cred-a4', 'Bearer cred-a5']))
    expect(auth.filter((value) => value === 'Bearer cred-a4')).toHaveLength(r1.modelCalls.calls)
    expect(auth.filter((value) => value === 'Bearer cred-a5')).toHaveLength(r2.modelCalls.calls)
    // 同一门课，按页认来源：请求 JSON 的 page 里，单页核查带 pageId，逐页生成带该页计划里的 learningAction（read_course 列出，各页不同）
    const pages = (await s1.call('read_course', { courseId })).course.pages as Array<{ pageId: string; learningAction: string }>
    const sessionOfPage: Record<string, string> = { [r1.page.pageId]: 's1', [r2.page.pageId]: 's2' }
    const sourceOf = (request: { user: string }) => {
      let input: { pageId?: unknown; learningAction?: unknown } | undefined
      try { input = (JSON.parse(request.user) as { page?: typeof input }).page } catch { return undefined }
      const pageId = typeof input?.pageId === 'string' ? input.pageId : pages.find((page) => page.learningAction === input?.learningAction)?.pageId
      return pageId === undefined ? undefined : sessionOfPage[pageId]
    }
    expect(misattributed(seen, sourceOf, { s1: 'cred-a4', s2: 'cred-a5' })).toEqual([])
    await s1.close()
    await s2.close()
  })
})

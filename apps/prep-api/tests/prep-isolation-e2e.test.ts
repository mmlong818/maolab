// 3d 验收（Task 13，Review Focus 1、2）：两个老师并发备课互相不可见、不可改；
// 没有云一凭证的成人发消息、取消都是 403；/api/prep/render 的各种写法一律 404；别人的资源与不存在的资源 404 正文一字不差；
// 工具内模型请求各带各的凭证；对话进行中面板写操作被拒。以上拒绝路径 harness 一律零调用。
// 只动 course_test_prep_iso* schema 与 course_test_prep_iso_* 账号行。
import { request as httpRequest } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { PgCourseArtifacts, PgCourseDocuments, PgRenderJobs } from '@maolab/domain'
import { startFakeCourseLlm } from '../../prep-harness/tests/helpers/fake-course-llm.ts'
import { startFakeOpenAI } from '../../prep-harness/tests/helpers/fake-openai.ts'
import { INTERNAL_KEY, startHost } from '../../prep-harness/tests/helpers/host.ts'
import { prepPgUrl } from '../../prep-harness/tests/helpers/prep.ts'
import { createHarnessClient, type HarnessClient } from '../src/harness/client.ts'
import { prepTestApp } from './helpers/prep.ts'

process.env.NO_PROXY = '127.0.0.1,localhost'
const SCHEMA = 'course_test_prep_iso'
const KP = 'course_test_prep_iso_kp'
const A = 'course_test_prep_iso_a'
const B = 'course_test_prep_iso_b'
/** 老师，但没有云一凭证（D7） */
const C = 'course_test_prep_iso_c'
const MISSING_COURSE = 'c-missing-iso-0001'
const MISSING_SESSION = '00000000-0000-4000-8000-000000000000'
const MISSING_ARTIFACT = 'a-missing-iso-0001'
let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>>
let host: Awaited<ReturnType<typeof startHost>>
let env: Awaited<ReturnType<typeof prepTestApp>>
let base = ''
let port = 0
const tokens: Record<string, string> = {}
const harnessCalls: string[] = []

interface Built { sessionId: string; courseId: string; panelCourse: string; pageId: string; artifactId: string; generated: Array<Record<string, any>> }
const built: Record<string, Built> = {}

beforeAll(async () => {
  fake = await startFakeOpenAI()
  gateway = await startFakeCourseLlm((request) => env.course.fixtureLlmReply(request))
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: prepPgUrl(), YUNYI_COURSE_SCHEMA: SCHEMA, YUNYI_PREP_KNOWLEDGE_SCHEMA: KP, YUNYI_PREP_MODEL: 'fake-course' }, { readyTimeoutMs: 120_000 })
  const real = createHarnessClient(host.base, INTERNAL_KEY, { timeoutMs: 10_000 })
  const counted = <K extends keyof HarnessClient>(k: K) => (async (...args: unknown[]) => { harnessCalls.push(k); return (real[k] as (...a: unknown[]) => unknown)(...args) }) as HarnessClient[K]
  const harness: HarnessClient = { ensure: counted('ensure'), create: counted('create'), openEvents: counted('openEvents'), prompt: counted('prompt'), cancel: counted('cancel'), dispose: counted('dispose') }
  // 站点回退密钥设上：证明 prep 的 D7 判定不回退到它（C 仍是"没有凭证"）
  env = await prepTestApp({ owners: [A, B, C], withCredential: [A, B], harness, courseSchema: SCHEMA, knowledgeSchema: KP, env: { YUNYI_HARNESS_URL: host.base, YUNYI_TURN_PROVIDER: 'fake', YUNYI_TURN_MODEL: 'fake-1', YUNYI_PREP_HEARTBEAT_MS: '200', YUNYI_TURN_FALLBACK_KEY: 'site-fallback-key' } })
  base = await env.app.listen({ port: 0, host: '127.0.0.1' })
  port = Number(new URL(base).port)
  for (const owner of [A, B, C]) tokens[owner] = await env.token(owner)
}, 180_000)
afterAll(async () => { await env?.close(); await host?.stop(); await fake?.close(); await gateway?.close() })

/** 原样发出路径（不经 WHATWG URL 归一：./、//、%70、反斜杠都按原样到达服务器） */
function raw(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<{ status: number; text: string; json: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { ...headers, ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }) } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: Record<string, any> = {}
        try { json = JSON.parse(text) as Record<string, any> } catch { /* 非 JSON（HEAD 无正文） */ }
        resolve({ status: res.statusCode ?? 0, text, json })
      })
    })
    req.on('error', reject)
    req.end(payload)
  })
}
const as = (who: string) => (tokens[who] ? { 'x-session-token': tokens[who]! } : {})
const call = (who: string, method: string, path: string, body?: unknown) => raw(method, path, as(who), body)
const chat = async (owner: string, sessionId: string, content: string, requestId: string) => {
  const res = await fetch(`${base}/api/prep/sessions/${sessionId}/messages`, { method: 'POST', headers: { 'x-session-token': tokens[owner]!, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ content, requestId }) })
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as Record<string, any>)
}

async function teacherBuildsACourse(owner: string, tag: string): Promise<Built> {
  const session = (await call(owner, 'POST', '/api/prep/sessions', {})).json.session as { id: string }
  const plan = await chat(owner, session.id, `TOOL:plan_course:${JSON.stringify({ kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })}`, `req-${tag}-plan-0001`)
  const courseId = plan.at(-1)!.tools.find((t: { courseId?: string }) => t.courseId).courseId as string
  await chat(owner, session.id, `TOOL:approve_plan:${JSON.stringify({ courseId, action: 'approve', updates: [] })}`, `req-${tag}-approve-01`)
  const generated = await chat(owner, session.id, `TOOL:generate_page:${JSON.stringify({ courseId })}`, `req-${tag}-gen-000001`)
  const panelCourse = (await call(owner, 'POST', '/api/prep/courses', { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })).json.course.courseId as string
  // 搭场景只经 domain 读写（不经被测路由）：变异测试里路由的 owner 坏了，断言也落在串户检查上，而不是搭场景时崩掉
  const stored = await env.course.createMainlineCourseStore(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(owner)).findMainlineCourse(courseId)
  const pageId = String(stored?.generationSession?.jobs?.[0]?.pageId)
  // 截图任务（没有 worker，停在排队）：让"别人的任务列表"里真有东西可漏。生成的页还没过审查，面板投递回 422，直接经 domain 入队
  const jobs = new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(owner)
  await jobs.enqueue({ courseId, kind: 'render-page', requestKey: `iso-${tag}:${pageId}`, payload: { pageId } })
  expect([owner, (await jobs.listForCourse(courseId)).length]).toEqual([owner, 1])
  const artifact = await new PgCourseArtifacts(env.pool, { schema: SCHEMA }).forOwner(owner).put({ bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag.charCodeAt(0)]), contentType: 'image/png', kind: 'evidence', courseId })
  return { sessionId: session.id, courseId, panelCourse, pageId, artifactId: artifact.id, generated }
}

/** 全库（本测试 schema）各 owner 的数据指纹：任何被拒的探测都不能改动它 */
async function fingerprint() {
  const q = async (sql: string) => (await env.pool.query(sql)).rows
  return {
    documents: await q(`select id, owner, updated_at from ${SCHEMA}.documents order by id`),
    jobs: await q(`select id, owner, status, request_key from ${SCHEMA}.render_jobs order by id`),
    artifacts: await q(`select id, owner from ${SCHEMA}.artifacts order by id`),
    sessions: await q(`select id, owner, updated_at from ${SCHEMA}.prep_sessions order by id`),
    runs: await q(`select id, session_id, status from ${SCHEMA}.prep_runs order by id`),
  }
}

/** attacker 拿 victim 的 id 打每条 /api/prep 路由；同一路由换成不存在的 id 作对照 */
function probesAgainst(ids: { course: string; page: string; session: string; artifact: string }): Array<[string, string, unknown?]> {
  return [
    ['GET', `/api/prep/courses/${ids.course}`],
    ['GET', `/api/prep/courses/${ids.course}/brief`],
    ['GET', `/api/prep/courses/${ids.course}/jobs`],
    ['GET', `/api/prep/courses/${ids.course}/pages/${ids.page}`],
    ['PATCH', `/api/prep/courses/${ids.course}/plan`, { action: 'save', updates: [] }],
    ['PATCH', `/api/prep/courses/${ids.course}/plan`, { action: 'approve', updates: [] }],
    ['POST', `/api/prep/courses/${ids.course}/pages/${ids.page}/accept`, {}],
    ['POST', `/api/prep/courses/${ids.course}/accept`, {}],
    ['POST', `/api/prep/courses/${ids.course}/render`, { requestId: 'req-steal-render' }],
    ['POST', `/api/prep/courses/${ids.course}/export`, { requestId: 'req-steal-export' }],
    ['GET', `/api/prep/artifacts/${ids.artifact}`],
    ['GET', `/api/prep/sessions/${ids.session}`],
    ['POST', `/api/prep/sessions/${ids.session}/messages`, { content: '偷看', requestId: 'req-steal-msg01' }],
    ['POST', `/api/prep/sessions/${ids.session}/cancel`, {}],
    ['POST', '/api/prep/sessions', { courseId: ids.course }],
  ]
}

async function crossAccountProbes(attacker: string, victim: Built, own: Built) {
  const before = await fingerprint()
  const calls = harnessCalls.length
  const foreign = probesAgainst({ course: victim.courseId, page: victim.pageId, session: victim.sessionId, artifact: victim.artifactId })
  const missing = probesAgainst({ course: MISSING_COURSE, page: victim.pageId, session: MISSING_SESSION, artifact: MISSING_ARTIFACT })
  for (let i = 0; i < foreign.length; i += 1) {
    const [method, path, body] = foreign[i]!
    const theirs = await call(attacker, method, path, body)
    const none = await call(attacker, missing[i]![0], missing[i]![1], missing[i]![2])
    // 别人的与不存在的：同为 404，正文一字不差（不暴露"存在但不是你的"）
    expect([attacker, method, path, theirs.status]).toEqual([attacker, method, path, 404])
    expect([attacker, method, path, theirs.text]).toEqual([attacker, method, path, none.text])
  }
  // 面板课程（未确认计划的草稿）同样不可见
  for (const path of [`/api/prep/courses/${victim.panelCourse}`, `/api/prep/courses/${victim.panelCourse}/brief`]) expect([path, (await call(attacker, 'GET', path)).status]).toEqual([path, 404])
  // 下载链接的 ?token= 形式：拿自己的 token 取别人的产物，同样 404
  const viaQuery = await raw('GET', `/api/prep/artifacts/${victim.artifactId}?token=${tokens[attacker]}`)
  expect([viaQuery.status, viaQuery.text]).toEqual([404, (await raw('GET', `/api/prep/artifacts/${MISSING_ARTIFACT}?token=${tokens[attacker]}`)).text])
  // 在自己的会话里把别人的课程挂成面板当前课程：not-found，不派发
  const ownSessionForeignCourse = await call(attacker, 'POST', `/api/prep/sessions/${own.sessionId}/messages`, { content: '看看这门课', requestId: 'req-steal-ctx01', courseId: victim.courseId })
  const ownSessionMissingCourse = await call(attacker, 'POST', `/api/prep/sessions/${own.sessionId}/messages`, { content: '看看这门课', requestId: 'req-steal-ctx02', courseId: MISSING_COURSE })
  expect([ownSessionForeignCourse.status, ownSessionForeignCourse.text]).toEqual([404, ownSessionMissingCourse.text])
  // 被拒的探测：harness 零调用，数据一字未动
  expect(harnessCalls.slice(calls)).toEqual([])
  expect(await fingerprint()).toEqual(before)
}

test('two teachers prep concurrently and see nothing of each other; every in-tool model request carries its own teacher’s credential', async () => {
  const [a, b] = await Promise.all([teacherBuildsACourse(A, 'a'), teacherBuildsACourse(B, 'b')])
  built[A] = a
  built[B] = b
  expect(a.generated.at(-1)!.type).toBe('done')
  expect(b.generated.at(-1)!.type).toBe('done')
  const ids = (body: Record<string, any>, key: string, field: string) => (body[key] as Array<Record<string, string>>).map((x) => x[field]!).sort()
  expect(ids((await call(A, 'GET', '/api/prep/courses')).json, 'courses', 'courseId')).toEqual([a.courseId, a.panelCourse].sort())
  expect(ids((await call(B, 'GET', '/api/prep/courses')).json, 'courses', 'courseId')).toEqual([b.courseId, b.panelCourse].sort())
  expect(ids((await call(A, 'GET', '/api/prep/sessions')).json, 'sessions', 'id')).toEqual([a.sessionId])
  expect(ids((await call(B, 'GET', '/api/prep/sessions')).json, 'sessions', 'id')).toEqual([b.sessionId])
  // 自己的资源照常可用（对照：下面的 404 不是因为资源本身坏了）
  for (const [who, mine] of [[A, a], [B, b]] as const) {
    for (const path of [`/api/prep/courses/${mine.courseId}`, `/api/prep/courses/${mine.courseId}/brief`, `/api/prep/courses/${mine.courseId}/jobs`, `/api/prep/courses/${mine.courseId}/pages/${mine.pageId}`, `/api/prep/sessions/${mine.sessionId}`, `/api/prep/artifacts/${mine.artifactId}`]) {
      expect([who, path, (await call(who, 'GET', path)).status]).toEqual([who, path, 200])
    }
  }
  const auths = new Set(gateway.requests.map((r) => r.authorization))
  expect(auths).toEqual(new Set([`Bearer key-${A}`, `Bearer key-${B}`]))

  await crossAccountProbes(B, a, b)
  await crossAccountProbes(A, b, a)
  // B 在对话里把 A 的课程 id 交给工具：工具层同样 not-found（3c），A 的课程不变
  const before = await fingerprint()
  const stolen = await chat(B, b.sessionId, `TOOL:read_course:${JSON.stringify({ courseId: a.courseId })}`, 'req-b-steal-tool1')
  expect(stolen.at(-1)!.tools).toEqual([expect.objectContaining({ ok: false, reason: 'not-found' })])
  const after = await fingerprint()
  expect(after.documents).toEqual(before.documents)
  expect(after.jobs).toEqual(before.jobs)
  expect(after.artifacts).toEqual(before.artifacts)
}, 300_000)

test('a teacher without a yunyi credential: chat and cancel are 403 PREP_CREDENTIAL_REQUIRED and the harness sees nothing (no site-key fallback)', async () => {
  const status = await call(C, 'GET', '/api/prep/status')
  expect([status.status, status.json.hasCredential]).toEqual([200, false])
  const calls = harnessCalls.length
  const created = await call(C, 'POST', '/api/prep/sessions', {})
  expect([created.status, created.json.code]).toEqual([403, 'PREP_CREDENTIAL_REQUIRED'])
  // 会话行直接建在 C 名下（模拟凭证失效前建过的会话）：发消息、取消都先判凭证
  const session = await env.app.prep.conversations.forOwner(C).createSession({ title: '旧会话', courseId: null })
  const before = await fingerprint()
  for (const accept of ['application/json', 'application/x-ndjson']) {
    const res = await raw('POST', `/api/prep/sessions/${session.id}/messages`, { ...as(C), accept }, { content: '帮我备课', requestId: `req-c-msg-${accept.length}` })
    expect([accept, res.status, res.json.code]).toEqual([accept, 403, 'PREP_CREDENTIAL_REQUIRED'])
  }
  for (const path of [`/api/prep/sessions/${session.id}/cancel`, `/%61pi/%70rep/sessions/${session.id}/cancel`]) {
    const res = await call(C, 'POST', path, {})
    expect([path, res.status, res.json.code]).toEqual([path, 403, 'PREP_CREDENTIAL_REQUIRED'])
  }
  // C 拿 A 的会话：先是 404（不是本人的），同样不碰 harness
  expect((await call(C, 'POST', `/api/prep/sessions/${built[A]!.sessionId}/cancel`, {})).status).toBe(404)
  expect(harnessCalls.slice(calls)).toEqual([])
  expect(await fingerprint()).toEqual(before)
})

test('/api/prep/render in every spelling is 404 for every identity and carries no course data', async () => {
  const a = built[A]!
  const before = await fingerprint()
  const calls = harnessCalls.length
  const topic = env.course.PREP_FIXTURE_TOPIC
  const variants = [
    '/api/prep/render', '/api/prep/render/', `/api/prep/render/${a.courseId}/`, `/api/prep/render/${a.courseId}/1`, `/api/prep/render/${a.courseId}/x?token=${tokens[A]}`,
    `/api//prep/render/${a.courseId}/`, `/api/prep/./render/${a.courseId}/`, `/api/x/../prep/render/${a.courseId}/`, `/api/prep%2Frender/${a.courseId}/`, `/api/prep%2frender`,
    `/api/prep%252Frender/${a.courseId}/`, '/API/Prep/Render/', '/api/prep/%72ender/', `/api/prep/render;x=1/${a.courseId}/`, '/api\\prep\\render', '//api///prep//render',
    `/api/%70rep/render/${a.courseId}/`, '/%61pi/prep/render', `/%61pi/%70rep/%72ender/${a.courseId}/1`,
  ]
  for (const path of variants) {
    for (const who of [A, B, C, 'anonymous']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const res = await call(who, method, path, method === 'GET' || method === 'DELETE' ? undefined : { requestId: 'req-render-probe' })
        expect([path, who, method, res.status]).toEqual([path, who, method, 404])
        expect(res.text).not.toContain(a.courseId)
        expect(res.text).not.toMatch(/planning|pageContent|contract/)
        if (topic) expect(res.text).not.toContain(topic)
      }
      expect([path, who, 'HEAD', (await call(who, 'HEAD', path)).status]).toEqual([path, who, 'HEAD', 404])
    }
  }
  expect(harnessCalls.slice(calls)).toEqual([])
  expect(await fingerprint()).toEqual(before)
}, 120_000)

test('while A’s chat turn runs, A’s panel writes are refused with 409 and B is unaffected', async () => {
  const session = (await call(A, 'POST', '/api/prep/sessions', {})).json.session as { id: string }
  const slow = chat(A, session.id, 'slow 请慢慢说', 'req-a-slow-000001')
  await new Promise((r) => setTimeout(r, 500))
  const refused = await call(A, 'POST', '/api/prep/courses', { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  expect([refused.status, refused.json.code]).toEqual([409, 'PREP_TURN_RUNNING'])
  expect((await call(B, 'POST', '/api/prep/courses', { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })).status).toBe(201)
  // B 取消不了 A 正在跑的回合
  expect((await call(B, 'POST', `/api/prep/sessions/${session.id}/cancel`, {})).status).toBe(404)
  expect((await slow).at(-1)!.type).toBe('done')
  expect((await call(A, 'POST', '/api/prep/courses', { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })).status).toBe(201)
}, 120_000)

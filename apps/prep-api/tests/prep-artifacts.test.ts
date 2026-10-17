import { afterAll, beforeAll, expect, test } from 'vitest'
import { PgCourseArtifacts, PgCourseDocuments, PgRenderJobs, PPTX_CONTENT_TYPE } from '@maolab/domain'
import { prepTestApp } from './helpers/prep.ts'
import { attachmentName } from '../src/routes/prep-artifacts.ts'
import { renderRequestKey } from '../src/routes/prep-courses.ts'

const SCHEMA = 'course_test_prep_api_art'
const A = 'course_test_prep_api_arta'
const B = 'course_test_prep_api_artb'
let env: Awaited<ReturnType<typeof prepTestApp>>
let ta = ''
let tb = ''
let courseId = ''

beforeAll(async () => {
  env = await prepTestApp({ owners: [A, B], courseSchema: SCHEMA, knowledgeSchema: `${SCHEMA}_kp` })
  ta = await env.token(A)
  tb = await env.token(B)
  // 能导出的金课程（3b 夹具，6 页），存到 A 名下
  const golden = env.course.goldenExportCourse('c-art-golden')
  await env.course.createMainlineCourseStore(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A)).saveMainlineCourse(golden)
  courseId = 'c-art-golden'
}, 120_000)
afterAll(async () => { await env?.close() })

const get = (url: string, headers: Record<string, string> = {}) => env.app.inject({ method: 'GET', url, headers })

test('artifacts: owner downloads with the stored type and nosniff; svg gets a sandbox CSP; others and expired ones are 404', async () => {
  const artifacts = new PgCourseArtifacts(env.pool, { schema: SCHEMA })
  const svg = await artifacts.forOwner(A).put({ bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), contentType: 'image/svg+xml', kind: 'image', courseId })
  const png = await artifacts.forOwner(A).put({ bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), contentType: 'image/png', kind: 'evidence', courseId })
  const old = await artifacts.forOwner(A).put({ bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]), contentType: 'image/png', kind: 'evidence', courseId, expiresAt: 1 })
  const s = await get(`/api/prep/artifacts/${svg.id}?token=${ta}`)
  expect(s.statusCode).toBe(200)
  expect(s.headers['content-type']).toBe('image/svg+xml')
  expect(s.headers['x-content-type-options']).toBe('nosniff')
  expect(String(s.headers['content-security-policy'])).toMatch(/^sandbox; default-src 'none'/)
  // 与 worker 供 SVG 的 CSP 同一组指令（workers/render/src/page-host.ts SVG_HEADERS），外加 sandbox
  expect(s.headers['content-security-policy']).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:")
  expect(s.headers['cache-control']).toBe('private, no-store')
  expect(s.headers['content-disposition']).toBeUndefined()
  const p = await get(`/api/prep/artifacts/${png.id}`, { 'x-session-token': ta })
  expect([p.statusCode, p.headers['content-type'], p.rawPayload.length]).toEqual([200, 'image/png', 11])
  expect(p.headers['content-security-policy']).toBeUndefined()
  const bodies = new Set<string>()
  for (const [id, token] of [[svg.id, tb], [png.id, tb], [old.id, ta], ['a-missing', ta], ['bad id!', ta]] as const) {
    const res = await get(`/api/prep/artifacts/${encodeURIComponent(id)}`, { 'x-session-token': token })
    expect([id, res.statusCode, res.json().code]).toEqual([id, 404, 'NOT_FOUND'])
    bodies.add(res.body)
  }
  // 别人的、过期的、不存在的：正文一字不差
  expect(bodies.size).toBe(1)
  // 纵深防御（T7 review M1、M5）：存储里类型不在白名单的行、不在 PG 里的行（对象存储迁移后），同样回这个 404，不是 500
  const now = Date.now()
  await env.pool.query(`insert into ${SCHEMA}.artifacts (id, owner, sha256, kind, content_type, byte_size, storage, content, course_id, created_at) values
    ('a-html', $1, $5, 'image', 'text/html', 8, 'pg', $2, $3, $4),
    ('a-object', $1, $6, 'image', 'image/png', 5, 'object', null, $3, $4)`, [A, Buffer.from('<b>x</b>'), courseId, now, 'a'.repeat(64), 'b'.repeat(64)])
  for (const id of ['a-html', 'a-object']) {
    const res = await get(`/api/prep/artifacts/${id}`, { 'x-session-token': ta })
    expect([id, res.statusCode, res.body]).toEqual([id, 404, [...bodies][0]])
  }
  // 未登录：全局鉴权先拦
  expect((await get(`/api/prep/artifacts/${png.id}`)).statusCode).toBe(401)
})

test('export: not ready → 422 and no job; ready → one export job per requestId; pptx downloads as an attachment with a cleaned name', async () => {
  const facade = await env.app.prep.courses.facade(A)
  const planned = await facade.planCourse({ kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const draft = (planned as unknown as { course: { courseId: string } }).course.courseId
  const notReady = await env.app.inject({ method: 'POST', url: `/api/prep/courses/${draft}/export`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'req-export-0001' } })
  expect([notReady.statusCode, notReady.json().reason]).toEqual([422, 'not-ready'])
  expect(Array.isArray(notReady.json().details?.blockers)).toBe(true)
  expect(await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A).listForCourse(draft)).toEqual([])
  const post = () => env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/export`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'req-export-0002' } })
  const first = await post()
  const again = await post()
  expect(first.statusCode).toBe(202)
  expect(first.json().job.kind).toBe('export-pptx')
  expect(again.json().job.jobId).toBe(first.json().job.jobId)
  expect((await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A).listForCourse(courseId)).filter((job) => job.kind === 'export-pptx')).toHaveLength(1)
  const stolen = await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/export`, headers: { 'x-session-token': tb, 'content-type': 'application/json' }, payload: { requestId: 'req-export-0003' } })
  expect(stolen.statusCode).toBe(404)
  expect((await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/export`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'short' } })).statusCode).toBe(400)
  // T7 review M3：requestId 只收 [A-Za-z0-9_-]
  for (const requestId of ['req:export:0004', 'req.export.0004', 'req export 0004', 'req#export0004']) {
    const res = await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/export`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId } })
    expect([requestId, res.statusCode, res.json().code]).toEqual([requestId, 400, 'BODY_INVALID'])
  }
  // T7 review M6：同一 requestId 拿去导出另一门课 → 409 REQUEST_KEY_CONFLICT，不投任务
  await env.course.createMainlineCourseStore(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A)).saveMainlineCourse(env.course.goldenExportCourse('c-art-golden2'))
  const conflict = await env.app.inject({ method: 'POST', url: '/api/prep/courses/c-art-golden2/export', headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'req-export-0002' } })
  expect([conflict.statusCode, conflict.json().code]).toEqual([409, 'REQUEST_KEY_CONFLICT'])
  expect(await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A).listForCourse('c-art-golden2')).toEqual([])
  const pptx = await new PgCourseArtifacts(env.pool, { schema: SCHEMA }).forOwner(A).put({ bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), contentType: PPTX_CONTENT_TYPE, kind: 'export', courseId, expiresAt: Date.now() + 60_000 })
  const dl = await get(`/api/prep/artifacts/${pptx.id}?name=${encodeURIComponent('静夜思"/\n课件.pptx')}`, { 'x-session-token': ta })
  expect(dl.statusCode).toBe(200)
  expect(dl.headers['content-type']).toBe(PPTX_CONTENT_TYPE)
  expect(String(dl.headers['content-disposition'])).toBe(`attachment; filename="course.pptx"; filename*=UTF-8''${encodeURIComponent('静夜思 课件.pptx')}`)
  // T7 review I1、M2：emoji 落在第 80 个字处不会被截成半个代理对（不 500）；' ( ) * 按 RFC 5987 转义；bidi 控制字符去掉
  const emoji = await get(`/api/prep/artifacts/${pptx.id}?name=${encodeURIComponent(`${'x'.repeat(79)}😀尾巴`)}`, { 'x-session-token': ta })
  expect(emoji.statusCode).toBe(200)
  expect(String(emoji.headers['content-disposition'])).toBe(`attachment; filename="course.pptx"; filename*=UTF-8''${'x'.repeat(79)}%F0%9F%98%80.pptx`)
  const quoted = await get(`/api/prep/artifacts/${pptx.id}?name=${encodeURIComponent("老师's (第一)*课\u202Egnp.exe")}`, { 'x-session-token': ta })
  expect(String(quoted.headers['content-disposition'])).toBe(`attachment; filename="course.pptx"; filename*=UTF-8''${encodeURIComponent('老师')}%27s%20%28${encodeURIComponent('第一')}%29%2A${encodeURIComponent('课')}gnp.exe.pptx`)
  expect(dl.headers['content-security-policy']).toBeUndefined()
  expect(attachmentName(undefined, '课件')).toBe('课件.pptx')
  expect(attachmentName('  \u0000\\"/  ', '课件')).toBe('课件.pptx')
  expect(attachmentName('x'.repeat(200), '课件')).toBe(`${'x'.repeat(80)}.pptx`)
  expect(attachmentName('x'.repeat(79) + '😀', '课件')).toBe(`${'x'.repeat(79)}😀.pptx`)
  expect(attachmentName('x'.repeat(80) + '😀', '课件')).toBe(`${'x'.repeat(80)}.pptx`)
  expect(attachmentName('a\u202Ab\u202Ec\u2066d\u2069e\u200Ef\u200Fg', '课件')).toBe('abcdefg.pptx')
  expect(attachmentName('\u202E\u200F', '课件')).toBe('课件.pptx')
})

test('render: no generation session → 422 session-not-ready; nothing left to render → 200 with note; 404 for another owner; 400 without requestId', async () => {
  const res = await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/render`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'req-render-0001' } })
  // 实测：金课程没有生成会话（brief 预期的 200 + note 不成立），门面回 session-not-ready（422），不投任务
  expect([res.statusCode, res.json().reason]).toEqual([422, 'session-not-ready'])
  // 会话已过截图阶段（整课审查）：没有可截图的页 → 200 + note，不投任务
  const course = env.course as unknown as { buildRenderingCourse(store: unknown, id: string): Promise<{ generationSession: { status: string } }> }
  const store = env.course.createMainlineCourseStore(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A))
  const audited = await course.buildRenderingCourse(store, 'c-art-audit')
  audited.generationSession.status = 'course-audit'
  await store.saveMainlineCourse(audited)
  const done = await env.app.inject({ method: 'POST', url: '/api/prep/courses/c-art-audit/render', headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'req-render-0009' } })
  expect([done.statusCode, done.json().jobs, done.json().skipped, typeof done.json().note]).toEqual([200, [], [], 'string'])
  expect(await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A).listForCourse('c-art-audit')).toEqual([])
  expect((await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A).listForCourse(courseId)).filter((job) => job.kind === 'render-page')).toEqual([])
  expect((await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/render`, headers: { 'x-session-token': tb, 'content-type': 'application/json' }, payload: { requestId: 'req-render-0002' } })).statusCode).toBe(404)
  expect((await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/render`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(400)
  expect((await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/render`, headers: { 'x-session-token': ta, 'content-type': 'application/json' }, payload: { requestId: 'req:render:0001' } })).statusCode).toBe(400)
})

test('render (Ruling [T7] F3): rendering-state course enqueues each page once per requestId, replay returns the same jobs, queued pages are skipped, finished ones re-queue', async () => {
  const course = env.course as unknown as { buildRenderingCourse(store: unknown, id: string): Promise<{ generationSession?: { jobs: { pageId: string }[] } }> }
  const store = env.course.createMainlineCourseStore(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A))
  const rendering = await course.buildRenderingCourse(store, 'c-art-rendering')
  const pageIds = rendering.generationSession!.jobs.map((job) => job.pageId)
  expect(pageIds).toEqual(['page-1', 'page-2'])
  const render = (requestId: string, token = ta) => env.app.inject({ method: 'POST', url: '/api/prep/courses/c-art-rendering/render', headers: { 'x-session-token': token, 'content-type': 'application/json' }, payload: { requestId } })
  const jobs = new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A)

  const first = await render('req-render-1001')
  expect(first.statusCode).toBe(202)
  expect(first.json().skipped).toEqual([])
  expect(first.json().jobs.map((job: { pageId: string; kind: string; status: string }) => [job.pageId, job.kind, job.status])).toEqual([['page-1', 'render-page', 'queued'], ['page-2', 'render-page', 'queued']])
  // 重放同一请求：拿回同一批任务，不多投
  const replay = await render('req-render-1001')
  expect([replay.statusCode, replay.json().skipped]).toEqual([202, []])
  expect(replay.json().jobs.map((job: { jobId: string }) => job.jobId)).toEqual(first.json().jobs.map((job: { jobId: string }) => job.jobId))
  expect(await jobs.listForCourse('c-art-rendering', 100)).toHaveLength(2)
  // 新请求：两页都还在排队，跳过
  const other = await render('req-render-1002')
  expect([other.statusCode, other.json().jobs, other.json().skipped]).toEqual([202, [], ['page-1', 'page-2']])
  // B 看不到 A 的课：404，不投任务
  expect((await render('req-render-1003', tb)).statusCode).toBe(404)
  // 3b 交接：page-1 被拦、page-2 的任务耗尽（PAGE_NOT_NEXT）后，再点一次把仍可截图的页重新入队
  const page2 = first.json().jobs[1].jobId as string
  await env.pool.query(`update ${SCHEMA}.render_jobs set status = 'failed', finished_at = $2 where id = $1`, [page2, Date.now()])
  const again = await render('req-render-1004')
  expect(again.statusCode).toBe(202)
  expect(again.json().skipped).toEqual(['page-1'])
  expect(again.json().jobs.map((job: { pageId: string }) => job.pageId)).toEqual(['page-2'])
  expect(again.json().jobs[0].jobId).not.toBe(page2)
  const all = await jobs.listForCourse('c-art-rendering', 100)
  expect(all).toHaveLength(3)
  expect(all.every((job) => job.requestKey.startsWith('api:'))).toBe(true)
})

test('renderRequestKey: replay-stable, revision-sensitive, at most 200 characters, never shaped like a tool key', () => {
  const rev = 'a'.repeat(64)
  expect(renderRequestKey('api:req-1', 'page-1', rev)).toBe(`api:req-1:page-1:${rev}`)
  expect(renderRequestKey('api:req-1', 'page-1', rev)).not.toBe(renderRequestKey('api:req-1', 'page-1', 'b'.repeat(64)))
  const longPrefix = `api:${'r'.repeat(120)}`
  const longPage = 'p'.repeat(160)
  const k1 = renderRequestKey(longPrefix, `${longPage}1`, rev)
  const k2 = renderRequestKey(longPrefix, `${longPage}2`, rev)
  const k3 = renderRequestKey(longPrefix, `${longPage}1`, 'b'.repeat(64))
  for (const key of [k1, k2, k3]) expect(key.length).toBeLessThanOrEqual(200)
  expect(new Set([k1, k2, k3]).size).toBe(3)
  expect(renderRequestKey(longPrefix, `${longPage}1`, rev)).toBe(k1)
  const mid = renderRequestKey(`api:${'r'.repeat(150)}`, 'page-1', rev)
  expect(mid.length).toBe(200)
  expect(mid.startsWith(`api:${'r'.repeat(150)}:page-1:${'a'.repeat(16)}`)).toBe(true)
})

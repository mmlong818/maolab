import { afterAll, beforeAll, expect, test } from 'vitest'
import { prepTestApp } from './helpers/prep.ts'
import { cachedLoader, type CourseApi } from '../src/prep/course-loader.ts'
import { PrepCourses } from '../src/prep/courses.ts'
import { ID_MAX, validId } from '../src/routes/prep-courses.ts'

const A = 'course_test_prep_api_a'
const B = 'course_test_prep_api_b'
let env: Awaited<ReturnType<typeof prepTestApp>>
let ta = ''
let tb = ''
let courseId = ''
const get = (url: string, token: string) => env.app.inject({ method: 'GET', url, headers: { 'x-session-token': token } })

beforeAll(async () => {
  env = await prepTestApp({ owners: [A, B] })
  ta = await env.token(A)
  tb = await env.token(B)
  // 经门面建一门课（不经接口：本任务只测只读；建课接口在 Task 6）
  const facade = await env.app.prep.courses.facade(A)
  const planned = await facade.planCourse({ kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  if (!planned.ok) throw new Error(planned.message)
  courseId = (planned.course as { courseId: string }).courseId
}, 120_000)
afterAll(async () => { await env?.close() })

// Ruling [T5] F2：懒加载用注入的 loader 单独测（不建第二个测试 app，不再截断账号表）
test('PrepCourses loads the course module lazily, once, shared by concurrent first calls of different owners', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const api: CourseApi = { createPrepFacade: () => ({}) as never, lessonOutlineOf: () => ({}) as never }
  const courses = new PrepCourses({ pool: env.pool, prep: env.app.deps.config.prep, load: cachedLoader(async () => { calls += 1; await gate; return api }) })
  expect(courses.loaded()).toBe(false)
  expect(calls).toBe(0)
  const first = courses.facade(A)
  const second = courses.facade(B)
  release()
  const [fa, fb] = await Promise.all([first, second])
  expect(calls).toBe(1)
  expect(courses.loaded()).toBe(true)
  expect(fa).not.toBe(fb)
  expect(await courses.facade(A)).toBe(fa)
  await expect(courses.facade(' ')).rejects.toThrow()
})

test('a failed load is not cached: the next request retries', async () => {
  let calls = 0
  const api: CourseApi = { createPrepFacade: () => ({}) as never, lessonOutlineOf: () => ({}) as never }
  const courses = new PrepCourses({ pool: env.pool, prep: env.app.deps.config.prep, load: cachedLoader(async () => { calls += 1; if (calls === 1) throw new Error('boom'); return api }) })
  await expect(courses.facade(A)).rejects.toThrow('boom')
  expect(courses.loaded()).toBe(false)
  await courses.facade(A)
  expect(calls).toBe(2)
  expect(courses.loaded()).toBe(true)
})

test('the facade cache is an LRU bounded by maxOwners', async () => {
  let created = 0
  const api: CourseApi = { createPrepFacade: () => { created += 1; return {} as never }, lessonOutlineOf: () => ({}) as never }
  const courses = new PrepCourses({ pool: env.pool, prep: env.app.deps.config.prep, load: async () => api, maxOwners: 2 })
  const a = await courses.facade('o1')
  await courses.facade('o2')
  expect(await courses.facade('o1')).toBe(a) // o1 变成最近使用
  await courses.facade('o3') // 淘汰 o2
  expect(await courses.facade('o1')).toBe(a)
  expect(created).toBe(3)
  await courses.facade('o2')
  expect(created).toBe(4)
})

test('the server does not load the course module on startup or for /api/prep/status', async () => {
  // 只建 app 不碰库（buildServer 不查课程表）：同一个 pool、同一份配置
  const { buildServer } = await import('../src/server.ts')
  const fresh = await buildServer({ pool: env.pool, config: env.app.deps.config, store: env.store })
  try {
    expect(fresh.prep.courses.loaded()).toBe(false)
    const status = await fresh.inject({ method: 'GET', url: '/api/prep/status', headers: { 'x-session-token': ta } })
    expect(status.statusCode).toBe(200)
    expect(fresh.prep.courses.loaded()).toBe(false)
    const res = await fresh.inject({ method: 'GET', url: '/api/prep/courses', headers: { 'x-session-token': tb } })
    expect(res.json()).toEqual({ courses: [] })
    expect(fresh.prep.courses.loaded()).toBe(true)
  } finally {
    await fresh.close()
  }
})

test('owner sees the list, the workbench view, the brief, one page and its audit; jobs empty', async () => {
  const list = await get('/api/prep/courses', ta)
  expect(list.json().courses.map((c: { courseId: string }) => c.courseId)).toEqual([courseId])
  const detail = await get(`/api/prep/courses/${courseId}`, ta)
  expect(detail.statusCode).toBe(200)
  const w = detail.json().workbench
  expect(w.course.id).toBe(courseId)
  expect(w.summary.pages.length).toBeGreaterThan(0)
  expect(detail.json().jobs).toEqual([])
  // 下一条用例断言别人的响应里没有夹具课题：先确认本人的视图里确实有它
  expect(detail.body).toContain(env.course.PREP_FIXTURE_TOPIC)
  expect((await get(`/api/prep/courses/${courseId}/brief`, ta)).json().brief).toBeTruthy()
  const pageId = w.summary.pages[0].pageId as string
  const page = await get(`/api/prep/courses/${courseId}/pages/${pageId}`, ta)
  expect(page.statusCode).toBe(200)
  expect(page.json().page.page.plan.id).toBe(pageId)
  expect(page.json().audit).toBeTruthy()
  const jobs = await get(`/api/prep/courses/${courseId}/jobs`, ta)
  expect([jobs.statusCode, jobs.json()]).toEqual([200, { jobs: [] }])
})

test('another owner gets 404 for everything about the course (no difference from a missing id)', async () => {
  expect((await get('/api/prep/courses', tb)).json()).toEqual({ courses: [] })
  const missing = await get('/api/prep/courses/c-missing', tb)
  for (const url of [`/api/prep/courses/${courseId}`, `/api/prep/courses/${courseId}/brief`, `/api/prep/courses/${courseId}/pages/p-1`, `/api/prep/courses/${courseId}/jobs`, '/api/prep/courses/c-missing']) {
    const res = await get(url, tb)
    expect([url, res.statusCode, res.json().reason]).toEqual([url, 404, 'not-found'])
    expect(res.body).not.toContain(env.course.PREP_FIXTURE_TOPIC)
    // T5 M2（终审修复）：别人的课程与不存在的课程，404 正文逐字节相同
    expect([url, res.body]).toEqual([url, missing.body])
  }
})

test('malformed ids are 404 not-found without touching the facade; anonymous is 401', async () => {
  for (const url of ['/api/prep/courses/bad%20id', '/api/prep/courses/bad!id/brief', `/api/prep/courses/${courseId}/pages/bad%20page`]) {
    const res = await get(url, ta)
    expect([url, res.statusCode, res.json().reason]).toEqual([url, 404, 'not-found'])
  }
  // 超过 Fastify 的 maxParamLength（100）不命中路由，落到 /api/prep/* 的兜底：同样 404
  expect((await get(`/api/prep/courses/${'x'.repeat(161)}`, ta)).statusCode).toBe(404)
  // T5 M1（终审修复）：validId 的上限与 maxParamLength 一致——100 个字符命中路由（带 reason），101 个 validId 就不接受
  expect(validId('x'.repeat(ID_MAX))).toBe(true)
  expect(validId('x'.repeat(ID_MAX + 1))).toBe(false)
  const longest = await get(`/api/prep/courses/${'x'.repeat(ID_MAX)}`, ta)
  expect([longest.statusCode, longest.json().reason]).toEqual([404, 'not-found'])
  const anon = await env.app.inject({ method: 'GET', url: `/api/prep/courses/${courseId}` })
  expect(anon.statusCode).toBe(401)
})

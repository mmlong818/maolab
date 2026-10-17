import { afterAll, beforeAll, expect, test } from 'vitest'
import { PgCourseDocuments, PgCourseKnowledge, type OwnerCourseDocuments } from '@maolab/domain'
import type { PrepFacade } from '@maolab/course/services/prep-facade-types'
import { prepTestApp } from './helpers/prep.ts'
import { loadCourseApi } from '../src/prep/course-loader.ts'
import { PrepCourses } from '../src/prep/courses.ts'

const A = 'course_test_prep_api_wa'
const B = 'course_test_prep_api_wb'
const SCHEMA = 'course_test_prep_api_w'
const KP_SCHEMA = 'course_test_prep_api_w_kp'
let env: Awaited<ReturnType<typeof prepTestApp>>
let ta = ''
let tb = ''
const send = (method: 'POST' | 'PATCH', url: string, token: string, payload: unknown = {}) =>
  env.app.inject({ method, url, headers: { 'x-session-token': token, 'content-type': 'application/json' }, payload: JSON.stringify(payload) })

beforeAll(async () => {
  env = await prepTestApp({ owners: [A, B], courseSchema: SCHEMA, knowledgeSchema: KP_SCHEMA })
  ta = await env.token(A)
  tb = await env.token(B)
}, 120_000)
afterAll(async () => { await env?.close() })

test('create a course from knowledge points, edit and approve the plan (no model)', async () => {
  const bad = await send('POST', '/api/prep/courses', ta, { kpIds: [] })
  expect([bad.statusCode, bad.json().code]).toEqual([400, 'BODY_INVALID'])
  const unknown = await send('POST', '/api/prep/courses', ta, { kpIds: ['kp-does-not-exist'] })
  expect([unknown.statusCode, unknown.json().reason]).toEqual([400, 'unknown-kp'])
  const created = await send('POST', '/api/prep/courses', ta, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  expect(created.statusCode).toBe(201)
  const courseId = created.json().course.courseId as string
  const firstPage = created.json().course.pages[0].pageId as string
  const saved = await send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, { action: 'save', updates: [{ pageId: firstPage, learningAction: '先读诗，圈出叠词', newInformation: '叠词的节奏作用' }] })
  expect(saved.statusCode).toBe(200)
  const approved = await send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, { action: 'approve', updates: [] })
  expect(approved.statusCode).toBe(200)
  const detail = (await env.app.inject({ method: 'GET', url: `/api/prep/courses/${courseId}`, headers: { 'x-session-token': ta } })).json()
  expect(detail.workbench.summary.planStatus).not.toBe('draft')
  // 别人的课程：改计划、验收一律 404，A 的课程不变
  for (const [method, url, payload] of [
    ['PATCH', `/api/prep/courses/${courseId}/plan`, { action: 'save', updates: [] }],
    ['POST', `/api/prep/courses/${courseId}/pages/${firstPage}/accept`, {}],
    ['POST', `/api/prep/courses/${courseId}/accept`, {}],
  ] as const) {
    const res = await send(method, url, tb, payload)
    expect([url, res.statusCode, res.json().reason]).toEqual([url, 404, 'not-found'])
  }
})

test('acceptance gates come back as 422 with the facade reason (no screenshot yet)', async () => {
  const created = await send('POST', '/api/prep/courses', ta, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const courseId = created.json().course.courseId as string
  const pageId = created.json().course.pages[0].pageId as string
  // 计划未确认时还没有生成会话：门面的 acceptPage 对"没有会话或会话里没有这一页"回 not-found（prep-facade.ts acceptPage），整课验收回 session-not-ready
  const draftPage = await send('POST', `/api/prep/courses/${courseId}/pages/${pageId}/accept`, ta)
  expect([draftPage.statusCode, draftPage.json().reason]).toEqual([404, 'not-found'])
  const draftWhole = await send('POST', `/api/prep/courses/${courseId}/accept`, ta)
  expect([draftWhole.statusCode, draftWhole.json().reason]).toEqual([422, 'session-not-ready'])
  // 确认计划后有了会话，但本页没有截图证据：422
  expect((await send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, { action: 'approve', updates: [] })).statusCode).toBe(200)
  const page = await send('POST', `/api/prep/courses/${courseId}/pages/${pageId}/accept`, ta)
  expect(page.statusCode).toBe(422)
  expect(['render-evidence-missing', 'session-not-ready']).toContain(page.json().reason)
  const whole = await send('POST', `/api/prep/courses/${courseId}/accept`, ta)
  expect([whole.statusCode, whole.json().reason]).toEqual([422, 'session-not-ready'])
})

test('while a prep turn of the owner is running, panel writes are 409 PREP_TURN_RUNNING and change nothing; reads still work', async () => {
  const created = await send('POST', '/api/prep/courses', ta, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const courseId = created.json().course.courseId as string
  const conversations = env.app.prep.conversations.forOwner(A)
  const session = await conversations.createSession({ title: '进行中', courseId })
  const run = await conversations.startRun(session.id, { requestId: 'req-running-1', inputHash: 'h', content: '生成', staleAfterMs: 60_000 })
  const before = (await env.pool.query(`select updated_at from ${SCHEMA}.documents where id = $1`, [courseId])).rows[0].updated_at
  const countBefore = (await env.pool.query(`select count(*)::int as n from ${SCHEMA}.documents where owner = $1`, [A])).rows[0].n
  for (const [method, url, payload] of [
    ['POST', '/api/prep/courses', { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] }],
    ['PATCH', `/api/prep/courses/${courseId}/plan`, { action: 'approve', updates: [] }],
    ['POST', `/api/prep/courses/${courseId}/pages/p-1/accept`, {}],
    ['POST', `/api/prep/courses/${courseId}/accept`, {}],
    ['POST', `/api/prep/courses/${courseId}/revise`, {}],
  ] as const) {
    const res = await send(method, url, ta, payload)
    expect([url, res.statusCode, res.json().code]).toEqual([url, 409, 'PREP_TURN_RUNNING'])
  }
  expect((await env.pool.query(`select updated_at from ${SCHEMA}.documents where id = $1`, [courseId])).rows[0].updated_at).toBe(before)
  expect((await env.pool.query(`select count(*)::int as n from ${SCHEMA}.documents where owner = $1`, [A])).rows[0].n).toBe(countBefore)
  expect((await env.app.inject({ method: 'GET', url: `/api/prep/courses/${courseId}`, headers: { 'x-session-token': ta } })).statusCode).toBe(200)
  // B 不受 A 的回合影响
  expect((await send('POST', '/api/prep/courses', tb, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })).statusCode).toBe(201)
  expect(await conversations.failRun(run.run.id, 'test', run.run.claim)).toBe(true)
  expect((await send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, { action: 'approve', updates: [] })).statusCode).toBe(200)
})

test('a CAS conflict from the facade is returned as 409, not swallowed', async () => {
  const created = await send('POST', '/api/prep/courses', ta, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const courseId = created.json().course.courseId as string
  // 两个并发的确认：门面实例内串行，第二个看到已确认的计划 → plan-conflict 或成功；两者都不能是 500
  const [one, two] = await Promise.all([
    send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, { action: 'approve', updates: [] }),
    send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, { action: 'save', updates: [] }),
  ])
  expect([one.statusCode, two.statusCode].every((s) => s === 200 || s === 409)).toBe(true)
  const facade = await env.app.prep.courses.facade(A)
  const stale = await facade.updatePlan(courseId, { action: 'save', updates: [] }, { imagesAvailable: false })
  expect(stale.ok === true || ['plan-conflict', 'write-conflict'].includes((stale as { reason: string }).reason)).toBe(true)
})

// ---- T5 审查 M3：LRU 淘汰门面会连同它的按课程写队列一起丢掉；写操作靠 CAS 兜底 ----

/** 包一层课程文档：armed 时，下一次读课程在读到之后停住，等 release 再返回（把"读快照"和"CAS 写"拉开） */
function pausingDocuments(inner: OwnerCourseDocuments) {
  let gate: { reached: () => void; wait: Promise<void> } | undefined
  const documents: OwnerCourseDocuments = {
    find: async (kind, id) => {
      const row = await inner.find(kind, id)
      const g = gate
      if (g && kind === 'course') { gate = undefined; g.reached(); await g.wait }
      return row
    },
    save: (kind, doc) => inner.save(kind, doc),
    saveIfUnchanged: (kind, doc, expected) => inner.saveIfUnchanged(kind, doc, expected),
    list: (kind) => inner.list(kind),
    delete: (kind, id) => inner.delete(kind, id),
  }
  return {
    documents,
    /** 返回 reached（读完停住时 resolve）与 release */
    arm() {
      let reached!: () => void
      let release!: () => void
      const reachedP = new Promise<void>((r) => { reached = r })
      const wait = new Promise<void>((r) => { release = r })
      gate = { reached, wait }
      return { reached: reachedP, release }
    },
  }
}

const firstPlanPage = async (courseId: string) => {
  const row = (await env.pool.query(`select payload from ${SCHEMA}.documents where id = $1`, [courseId])).rows[0]
  const payload = (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) as { planning: { pages: { id: string; learningAction: string }[] } }
  return payload.planning.pages[0]!
}
const edit = (pageId: string, text: string) => ({ action: 'save' as const, updates: [{ pageId, learningAction: text, newInformation: `${text}的新知` }] })

test('M3: a write that read the course before its facade was evicted loses to the newer write with a clean plan-conflict (no lost update)', async () => {
  const created = await send('POST', '/api/prep/courses', ta, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const courseId = created.json().course.courseId as string
  const pageId = created.json().course.pages[0].pageId as string
  const api = await loadCourseApi()
  // 每个新建的门面都包一层可停住的文档存储；上限 1：取 B 的门面就淘汰 A 的门面（及其写队列）
  const pausers: ReturnType<typeof pausingDocuments>[] = []
  const courses = new PrepCourses({
    pool: env.pool, prep: env.app.deps.config.prep, maxOwners: 1,
    load: async () => ({
      lessonOutlineOf: api.lessonOutlineOf,
      createPrepFacade: (deps) => {
        const p = pausingDocuments(deps.documents as OwnerCourseDocuments)
        pausers.push(p)
        return api.createPrepFacade({ ...deps, documents: p.documents })
      },
    }),
  })
  const oldFacade: PrepFacade = await courses.facade(A)
  const paused = pausers[0]!.arm()
  const slow = oldFacade.updatePlan(courseId, edit(pageId, '旧门面写入'), { imagesAvailable: false })
  await paused.reached // 旧门面已读快照，停在 CAS 写之前
  await courses.facade(B) // 淘汰 A
  const newFacade = await courses.facade(A)
  expect(newFacade).not.toBe(oldFacade) // 新实例、新的空写队列：实例内串行护不住，只剩 CAS
  const fresh = await newFacade.updatePlan(courseId, edit(pageId, '新门面写入'), { imagesAvailable: false })
  expect(fresh.ok).toBe(true)
  paused.release()
  const late = await slow
  expect(late.ok).toBe(false)
  expect((late as { reason: string }).reason).toBe('plan-conflict')
  expect((await firstPlanPage(courseId)).learningAction).toBe('新门面写入')
})

test('M3 through the routes: concurrent plan edits on one course after the cached facade is evicted end as 200 + 409, never 500 or a lost update', async () => {
  const created = await send('POST', '/api/prep/courses', ta, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const courseId = created.json().course.courseId as string
  const pageId = created.json().course.pages[0].pageId as string
  // 把 api 缓存里 A 的门面换成能停住的实例（读私有缓存只为构造交错；路由本身不变）
  const cache = (env.app.prep.courses as unknown as { facades: Map<string, PrepFacade> }).facades
  const api = await loadCourseApi()
  const pauser = pausingDocuments(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A))
  cache.set(A, api.createPrepFacade({ documents: pauser.documents, knowledge: new PgCourseKnowledge(env.pool, { schema: KP_SCHEMA }) }))
  const paused = pauser.arm()
  const slow = send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, edit(pageId, '旧门面写入'))
  await paused.reached
  cache.delete(A) // 模拟 LRU 淘汰：下一个请求建新门面
  const fresh = await send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, edit(pageId, '新门面写入'))
  expect(fresh.statusCode).toBe(200)
  expect(cache.get(A)).toBeDefined()
  paused.release()
  const late = await slow
  expect([late.statusCode, late.json().reason]).toEqual([409, 'plan-conflict'])
  expect((await firstPlanPage(courseId)).learningAction).toBe('新门面写入')
  // 并发的一批编辑（同一新门面 + 无停顿）：每个都是 200 或 409，最终库里是某个成功者写的值
  const texts = ['并发一', '并发二', '并发三', '并发四']
  const results = await Promise.all(texts.map((t) => send('PATCH', `/api/prep/courses/${courseId}/plan`, ta, edit(pageId, t))))
  expect(results.every((r) => r.statusCode === 200 || (r.statusCode === 409 && r.json().reason === 'plan-conflict'))).toBe(true)
  const winners = texts.filter((_, i) => results[i]!.statusCode === 200)
  expect(winners.length).toBeGreaterThan(0)
  expect(winners).toContain((await firstPlanPage(courseId)).learningAction)
})

test('panel writes call no model: an owner without a Yunyi credential can still create, edit and approve', async () => {
  await env.store.clearCredential(B)
  try {
    const created = await send('POST', '/api/prep/courses', tb, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS], lessonPhase: 'review' })
    expect(created.statusCode).toBe(201)
    const courseId = created.json().course.courseId as string
    expect((await send('PATCH', `/api/prep/courses/${courseId}/plan`, tb, { action: 'approve', updates: [] })).statusCode).toBe(200)
    const page = await send('POST', `/api/prep/courses/${courseId}/pages/${created.json().course.pages[0].pageId}/accept`, tb)
    expect([page.statusCode, page.json().reason]).toEqual([422, 'render-evidence-missing'])
    expect((await send('POST', '/api/prep/courses', tb, { kpIds: [...env.course.PREP_FIXTURE_KP_IDS], lessonPhase: 'bogus' })).statusCode).toBe(400)
  } finally {
    await env.store.setCredential(B, { apiKey: `key-${B}` })
  }
})

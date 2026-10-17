// 修订入口：已整课验收的课 → 建修订版（同一修订族的新课程，退回规划）→ 再次调用拿回已有的修订版；只对本人的课程。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { PgCourseDocuments } from '@maolab/domain'
import { prepTestApp } from './helpers/prep.ts'

const A = 'course_test_prep_rev_a'
const B = 'course_test_prep_rev_b'
const SCHEMA = 'course_test_prep_rev'
const KP = 'course_test_prep_rev_kp'
let env: Awaited<ReturnType<typeof prepTestApp>>
const tokens: Record<string, string> = {}
let courseId = ''
const send = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown) =>
  env.app.inject({ method, url, headers: { 'x-session-token': token, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { payload: JSON.stringify(payload) } : {}) })

beforeAll(async () => {
  env = await prepTestApp({ owners: [A, B], courseSchema: SCHEMA, knowledgeSchema: KP })
  tokens.a = await env.token(A)
  tokens.b = await env.token(B)
  courseId = (await env.course.buildReadyFixtureCourse(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A))).courseId
}, 300_000)
afterAll(async () => { await env?.close() })

test('revise an accepted course: a new revision in planning; calling again returns the existing one; the revision can be completed and exported', async () => {
  const revised = await send('POST', `/api/prep/courses/${courseId}/revise`, tokens.a!, {})
  expect(revised.statusCode).toBe(201)
  const revisionId = revised.json().revision.courseId as string
  expect(revised.json().revision).toMatchObject({ revisionNo: 2, existing: false })
  const again = await send('POST', `/api/prep/courses/${courseId}/revise`, tokens.a!, {})
  expect([again.statusCode, again.json().revision.courseId, again.json().revision.existing]).toEqual([200, revisionId, true])
  await env.course.completeFixtureCourse(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A), revisionId)
  const exported = await send('POST', `/api/prep/courses/${revisionId}/export`, tokens.a!, { requestId: 'req-rev-export1' })
  expect(exported.statusCode).toBeLessThan(300)
})

test('revise is owner-scoped', async () => {
  expect((await send('POST', `/api/prep/courses/${courseId}/revise`, tokens.b!, {})).statusCode).toBe(404)
})

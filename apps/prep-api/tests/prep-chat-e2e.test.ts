// 3d：api + 真实 harness（prep preset 的 17 个工具——3c 的 14 个加 4a 的 publish_course、recall_course 与 4b 的 revise_course；Task 2 的收尾帧）。只动 course_test_prep_chat* schema 与账号行。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeCourseLlm } from '../../prep-harness/tests/helpers/fake-course-llm.ts'
import { startFakeOpenAI } from '../../prep-harness/tests/helpers/fake-openai.ts'
import { INTERNAL_KEY, startHost } from '../../prep-harness/tests/helpers/host.ts'
import { prepPgUrl } from '../../prep-harness/tests/helpers/prep.ts'
import { createHarnessClient, type HarnessClient } from '../src/harness/client.ts'
import { prepTestApp } from './helpers/prep.ts'

process.env.NO_PROXY = '127.0.0.1,localhost'
const SCHEMA = 'course_test_prep_chat'
const KP = 'course_test_prep_chat_kp'
const T = 'course_test_prep_chat_t'
let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>>
let host: Awaited<ReturnType<typeof startHost>>
let env: Awaited<ReturnType<typeof prepTestApp>>
let base = ''
let token = ''
const cancels: string[] = []

beforeAll(async () => {
  fake = await startFakeOpenAI()
  gateway = await startFakeCourseLlm()
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: prepPgUrl(), YUNYI_COURSE_SCHEMA: SCHEMA, YUNYI_PREP_KNOWLEDGE_SCHEMA: KP, YUNYI_PREP_MODEL: 'fake-course' }, { readyTimeoutMs: 120_000 })
  const real = createHarnessClient(host.base, INTERNAL_KEY, { timeoutMs: 10_000 })
  const harness: HarnessClient = { ...real, cancel: async (id) => { cancels.push(id); return real.cancel(id) } }
  env = await prepTestApp({ owners: [T], harness, courseSchema: SCHEMA, knowledgeSchema: KP, env: { YUNYI_HARNESS_URL: host.base, YUNYI_TURN_PROVIDER: 'fake', YUNYI_TURN_MODEL: 'fake-1', YUNYI_PREP_HEARTBEAT_MS: '200' } })
  base = await env.app.listen({ port: 0, host: '127.0.0.1' })
  token = await env.token(T)
}, 180_000)
afterAll(async () => { await env?.close(); await host?.stop(); await fake?.close(); await gateway?.close() })

const ndjson = async (sessionId: string, content: string, requestId: string) => {
  const res = await fetch(`${base}/api/prep/sessions/${sessionId}/messages`, { method: 'POST', headers: { 'x-session-token': token, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ content, requestId }) })
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as Record<string, any>)
}

test('chat builds a course through the harness tool; the api panel then reads the same course; two queued messages both finish without any cancel', async () => {
  const created = await fetch(`${base}/api/prep/sessions`, { method: 'POST', headers: { 'x-session-token': token, 'content-type': 'application/json' }, body: '{}' })
  const session = (await created.json() as { session: { id: string } }).session
  const kpIds = JSON.stringify({ kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  const [one, two] = await Promise.all([ndjson(session.id, `TOOL:plan_course:${kpIds}`, 'req-e2e-00001'), ndjson(session.id, '谢谢', 'req-e2e-00002')])
  const done1 = one.at(-1)!
  const done2 = two.at(-1)!
  expect(done1.type).toBe('done')
  expect(done2.type).toBe('done')
  expect(one.some((f) => f.type === 'tool' && f.ok === true && typeof f.courseId === 'string')).toBe(true)
  expect(two.some((f) => f.type === 'tool')).toBe(false)
  expect(String(done2.message.content)).toContain('echo: 谢谢')
  expect(cancels).toEqual([])
  const courseId = done1.tools.find((t: { courseId?: string }) => t.courseId).courseId as string
  expect(done1.session.courseId).toBe(courseId)
  // 实测：收尾帧的工具结果带工具名（Task 2）；流里的 tool 帧取自 tool/result，取不到名字
  expect(done1.tools).toContainEqual(expect.objectContaining({ name: 'plan_course', ok: true, courseId }))
  const panel = await fetch(`${base}/api/prep/courses/${courseId}`, { headers: { 'x-session-token': token } })
  expect(panel.status).toBe(200)
  expect(((await panel.json()) as { workbench: { course: { id: string } } }).workbench.course.id).toBe(courseId)
}, 180_000)

// prep preset 在真实宿主里的接线（3c）。
// 第一组无 PG：yunyi-prep 走进程内课程、没有知识点与渲染队列。
// 第二组连测试库（Note for T8）：首个备课工具调用懒加载课程模块并创建按 owner 的门面，这些共享资源不得带上发起者身份
//   （service.ts 的 AsyncLocalStorage.snapshot() 假设 dsh 不在会话内重跑插件 setup；直接断言见 unit-prep-service）。只动 course_test_prep_host* schema 与账号行。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startFakeCourseLlm } from './helpers/fake-course-llm.ts'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'
import { dropPrepSchemas, loadCourseForTests, prepPgUrl, prepSession, resetPrepSchemas, testPgConfigured } from './helpers/prep.ts'
import { PREP_TOOLS, withWhoami } from './helpers/whitelist.ts'

const run = Date.now().toString(36)

describe('prep host without PG', () => {
  let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
  let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>>
  let host: Awaited<ReturnType<typeof startHost>>

  beforeAll(async () => {
    fake = await startFakeOpenAI()
    gateway = await startFakeCourseLlm()
    host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: '', YUNYI_PREP_MODEL: 'fake-course' }, { readyTimeoutMs: 120_000 })
  }, 150_000)
  afterAll(async () => { await host?.stop(); await fake?.close(); await gateway?.close() })

  async function open(id: string, owner: string, credential?: string) {
    expect((await host.api('POST', '/sessions', { sessionId: id, owner, ...(credential ? { credential } : {}), preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
    return prepSession(host, id)
  }

  test('the prep preset shows exactly the prep tools; the host has no other product preset', async () => {
    const prepId = `s-prep-wl-${run}`
    expect((await host.api('POST', '/sessions', { sessionId: prepId, owner: 'owner-prep-wl', preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
    expect([...((await host.api('GET', `/sessions/${prepId}/tools`)).json as { names: string[] }).names].sort()).toEqual(withWhoami(PREP_TOOLS))
    for (const preset of ['tutor', 'tutor-private']) {
      expect((await host.api('POST', '/sessions', { sessionId: `s-${preset}-wl-${run}`, owner: 'owner-prep-wl', preset, provider: 'fake', model: 'fake-1' })).status, preset).not.toBe(201)
    }
    const profile = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'profile', 'cordis.patch.yml'), 'utf8')
    const presetIds = [...profile.matchAll(/^ {8}id: ([a-z-]+)$/gm)].map((m) => m[1])
    expect(presetIds).toEqual(['prep', 'probe-private', 'probe-other'])
  })

  test('prep is not a private preset and its tools run through dsh with structured results', async () => {
    const profile = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'profile', 'cordis.patch.yml'), 'utf8')
    const privateLine = profile.split('\n').find((line) => line.trim().startsWith('privatePresets:')) ?? ''
    expect(privateLine).not.toMatch(/\bprep\b/)
    const s = await open(`s-prep-run-${run}`, 'owner-prep-run', 'cred-run')
    expect(await s.call('list_courses', {})).toEqual({ ok: true, courses: [] })
    // 无 PG：知识点端口为空，建课如实报未知知识点
    expect(await s.call('plan_course', { kpIds: ['kp-anything'] })).toMatchObject({ ok: false, reason: 'unknown-kp' })
    expect(await s.call('read_course', { courseId: 'no-such-course' })).toEqual({ ok: false, reason: 'not-found', message: '课程不存在。' })
    // 无 PG：没有渲染队列（课程不存在先报 not-found）
    expect(await s.call('render_page', { courseId: 'no-such-course' })).toMatchObject({ ok: false, reason: 'not-found' })
    await s.close()
  })

  test('a credential-less prep session gets missing-credential from model tools and the gateway sees nothing', async () => {
    const s = await open(`s-prep-nocred-${run}`, 'owner-prep-nocred')
    const before = gateway.requests.length
    expect(await s.call('generate_page', { courseId: 'any' })).toMatchObject({ ok: false, reason: 'missing-credential' })
    expect(await s.call('rehearse', { courseId: 'any' })).toMatchObject({ ok: false, reason: 'missing-credential' })
    expect(gateway.requests.length).toBe(before)
    await s.close()
  })
})

// 没配 TEST_PG_DATABASE_URL 时整组跳过（无 PG 组照常跑）
describe.skipIf(!testPgConfigured())('prep host with PG: shared resources from the first tool call', () => {
  const COURSE_SCHEMA = 'course_test_prep_host'
  const KNOWLEDGE_SCHEMA = 'course_test_prep_host_kp'
  const OWNER = 'course_test_prep_host_a'
  let course: Awaited<ReturnType<typeof loadCourseForTests>>
  let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
  let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>>
  let host: Awaited<ReturnType<typeof startHost>>

  beforeAll(async () => {
    course = await loadCourseForTests()
    await resetPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners: [OWNER], fixtures: course })
    fake = await startFakeOpenAI()
    gateway = await startFakeCourseLlm((request) => course.fixtureLlmReply(request))
    host = await startHost({
      FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: prepPgUrl(),
      YUNYI_COURSE_SCHEMA: COURSE_SCHEMA, YUNYI_PREP_KNOWLEDGE_SCHEMA: KNOWLEDGE_SCHEMA, YUNYI_PREP_MODEL: 'fake-course',
    }, { readyTimeoutMs: 120_000 })
  }, 180_000)
  afterAll(async () => {
    await host?.stop()
    await fake?.close()
    await gateway?.close()
    await dropPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners: [OWNER] })
  })

  async function open(id: string, credential: string) {
    expect((await host.api('POST', '/sessions', { sessionId: id, owner: OWNER, credential, preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
    return prepSession(host, id)
  }

  test('the module and per-owner facade created on the first call do not carry the first caller identity', async () => {
    // 同一 owner、不同凭证的两个会话共用一个门面：门面若在第一个会话的上下文里创建并带上它的发起者，
    // 第二个会话的工具内模型请求会被适配器判为 IDENTITY_MISMATCH（同 owner 不同凭证），或带上第一个会话的凭证
    const first = await open(`s-prep-first-${run}`, 'cred-first')
    // 本宿主的第一个备课工具调用：懒加载课程模块，创建本 owner 的门面
    expect(await first.call('list_courses', {})).toEqual({ ok: true, courses: [] })
    const planned = await first.call('plan_course', { kpIds: [...course.PREP_FIXTURE_KP_IDS] })
    expect(planned).toMatchObject({ ok: true })
    const courseId = planned.course.courseId as string
    expect(await first.call('approve_plan', { courseId, action: 'approve', updates: [] })).toMatchObject({ ok: true })

    const second = await open(`s-prep-second-${run}`, 'cred-second')
    const start = gateway.requests.length
    const page = await second.call('generate_page', { courseId })
    expect(page).toMatchObject({ ok: true, modelCalls: { failures: 0 } })
    const seen = gateway.requests.slice(start)
    expect(seen.length).toBe(page.modelCalls.calls)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((request) => request.authorization === 'Bearer cred-second')).toBe(true)
    // 工具内请求按 prep 预算（profile 缺省 reasoningEffort low），模型名来自 YUNYI_PREP_MODEL
    expect(seen.every((request) => request.model === 'fake-course' && request.reasoningEffort === 'low')).toBe(true)

    // 反过来：第一个会话之后的模型请求只带它自己的凭证
    const again = gateway.requests.length
    const next = await first.call('generate_page', { courseId })
    expect(next).toMatchObject({ ok: true, modelCalls: { failures: 0 } })
    const seenFirst = gateway.requests.slice(again)
    expect(seenFirst.length).toBe(next.modelCalls.calls)
    expect(seenFirst.every((request) => request.authorization === 'Bearer cred-first')).toBe(true)
    await first.close()
    await second.close()
  })
})

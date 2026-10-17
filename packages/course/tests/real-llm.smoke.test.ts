import { config } from 'dotenv'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { pickCastPreset } from '../src/mainline/generation/cast-preset.js'
import { compileLessonFromKps } from '../src/mainline/generation/compile-lesson.js'
import { fillOnePlannedPageWithDefaultLLM } from '../src/mainline/planning/page-content-generator.js'
import { runWithCourseRuntime, type CourseLlmTransport } from '../src/runtime.js'
import { createOpenAiCompatTransport } from '../src/transports/openai-compat.js'

config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env') })
const enabled = process.env.COURSE_REAL_LLM === '1'
// .env 的 LEARNING_LLM_BASE_URL 与密钥不配套（实测 401）；密钥在 yunyi 网关上可用，默认指向它（与 apps/harness/src/llm-yunyi.ts 同一缺省）。
const DEFAULT_GATEWAY = 'https://api.everai.cloud/v1'

test.skipIf(!enabled)('glm through the OpenAI-compatible gateway fills one planned page with the migrated generator', async () => {
  const need = (key: string): string => {
    const value = process.env[key]?.trim()
    if (!value) throw new Error(`缺环境变量 ${key}`)
    return value
  }
  // 传输层目前不能传 reasoning_effort（3c 的发现）；测试里经 fetchImpl 注入 'low'，避免长输出被思考耗尽 max_tokens。
  const usage: unknown[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (process.env.COURSE_REAL_LLM_EFFORT !== 'none') body.reasoning_effort = process.env.COURSE_REAL_LLM_EFFORT ?? 'low'
    const res = await fetch(input, { ...init, body: JSON.stringify(body) })
    try { usage.push(((await res.clone().json()) as { usage?: unknown }).usage) } catch { /* ignore */ }
    return res
  }
  const inner = createOpenAiCompatTransport({
    baseURL: process.env.COURSE_REAL_LLM_BASE_URL?.trim() || DEFAULT_GATEWAY,
    apiKey: need('LEARNING_LLM_API_KEY'),
    model: process.env.LEARNING_LLM_MODEL?.trim() || 'glm-5.3',
    jsonMode: process.env.COURSE_REAL_LLM_JSON_MODE !== '0',
    fetchImpl,
  })
  const calls: Array<{ ms: number; ok: boolean; attempt: number }> = []
  const llm: CourseLlmTransport = {
    async completeJson(request) {
      const started = Date.now()
      try {
        const out = await inner.completeJson(request)
        calls.push({ ms: Date.now() - started, ok: true, attempt: request.attempt })
        return out
      } catch (error) {
        calls.push({ ms: Date.now() - started, ok: false, attempt: request.attempt })
        throw error
      }
    },
  }
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
  const course = compileLessonFromKps({
    kps: [{ id: 'kp-smoke', canonicalName: '勾股定理', knowledgeType: 'procedural', learningObjectives: ['能用勾股定理求直角三角形的未知边长'] }],
    gradeBand: 'middle-school', subject: 'math', preset, courseId: 'smoke-course',
  })
  const planPage = course.planning!.pages.find((page) => !(page.visualSpec.required && page.visualSpec.form === 'instructional-image'))!
  const started = Date.now()
  let outcome: Record<string, unknown>
  try {
    const page = await runWithCourseRuntime({ llm }, () => fillOnePlannedPageWithDefaultLLM({
      course, planPage, planRevisionId: course.planning!.planRevisionId, priorPages: [], maxPageAttempts: 3,
    }))
    outcome = { ok: true, pageId: page.pageId, kind: page.content.kind, excerpt: JSON.stringify(page.content).slice(0, 300) }
    expect(page.pageId).toBe(planPage.id)
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message.slice(0, 400) : String(error) }
  }
  // 只打印统计与结果，不打印密钥
  console.log(JSON.stringify({ model: process.env.LEARNING_LLM_MODEL ?? 'glm-5.3', planPageKind: planPage.contentSpec.kind, outcome, calls, usage, totalMs: Date.now() - started }))
}, 600_000)

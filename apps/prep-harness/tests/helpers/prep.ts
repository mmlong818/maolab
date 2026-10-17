// prep 测试与脚本的公共件（3c）。
// @maolab/course 一律用非字面量说明符在运行时加载：tsc 不跟进迁入源码（参数属性、DOM 类型），harness 的 typecheck 只看到这里声明的最小类型。
// 数据库只连 TEST_PG_DATABASE_URL（库名以 test 为一段），schema 只认 course_test_prep_*，账号行只认 course_test_prep_ 开头。
import { parse } from 'dotenv'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import pg from 'pg'
import { accountDdl } from '@maolab-core/auth'
import { knowledgeDdl } from '@maolab-core/knowledge'
import { applyCourseDdl, normalizePgUrl } from '@maolab/domain'
import type { CourseApi } from '@maolab/prep-bundle/prep-course-loader'
import type { PrepDocumentStore, PrepKnowledgePort, PrepKnowledgeRow, PrepKnowledgeSourceRow } from '@maolab/course/services/prep-facade-types'
import type { EventFrame, HostHandle } from './host.ts'

// 3c 裁决 F21：只从 .env 取需要的变量（dotenv.parse，不并进 process.env），宿主子进程继承的 process.env 里不会混进 .env 的其他值
const ENV_PATH = resolve(import.meta.dirname, '..', '..', '..', '..', '.env')
const fileEnv: Record<string, string> = existsSync(ENV_PATH) ? parse(readFileSync(ENV_PATH)) : {}

const COURSE_ENTRY = '@maolab/course'

type FixtureRequest = { system?: string; user: string }
export interface PrepFixtures {
  PREP_FIXTURE_KP_IDS: readonly string[]
  PREP_FIXTURE_TOPIC: string
  prepFixtureKnowledge(): PrepKnowledgePort & { points: PrepKnowledgeRow[]; sources: PrepKnowledgeSourceRow[] }
  fixtureLlmReply(request: FixtureRequest): string
  fixtureBrokenPageReply(request: FixtureRequest): string | undefined
  isPageFillRequest(request: FixtureRequest): boolean
  goldenExportCourse(id?: string): { id: string; topic: string }
  createMainlineCourseStore(documents: PrepDocumentStore): { saveMainlineCourse(course: unknown): Promise<void>; findMainlineCourse(id: string): Promise<Record<string, any> | undefined> }
  /** 截图服务（同 3b worker，测试里用固定度量把会话推到整课审查） */
  createCourseGenerationServices(store: unknown, options: {
    render: {
      capture(url: string, pageNumber: number): Promise<{ screenshot: Buffer; metrics: Record<string, number> }>
      writeEvidence(courseId: string, pageId: string, evidenceId: string): Promise<string>
      pageUrl(origin: string, courseId: string, pageNumber: number): string
    }
  }): { render?: { runNext(courseId: string, origin: string): Promise<{ done: boolean }> } }
  /** 4a：用夹具模型通道把一门课走到整课验收通过、可发布 */
  buildReadyFixtureCourse(documents: PrepDocumentStore, options?: { candidateResources?: Array<{ id: string; kind: 'textbook-asset'; title: string; assetUrl: string; mediaType: string; sourceUrl?: string; citation?: string }> }): Promise<{ courseId: string }>
  /** 4b：把一门处在规划阶段的课（含 reviseCourse 建出的修订版）用夹具模型通道走到整课验收 */
  completeFixtureCourse(documents: PrepDocumentStore, courseId: string): Promise<void>
  /** 4b：孩子看到的页（课程页按它数页，测试核对清空教材地址后页数不变） */
  lessonPresentationPages(course: unknown): unknown[]
}

export async function loadCourseForTests(): Promise<CourseApi & PrepFixtures> {
  return (await import(COURSE_ENTRY)) as CourseApi & PrepFixtures
}

const TEST_DB = /(^|_)test(_|$)/i
/** 是否配置了 TEST_PG_DATABASE_URL（进程环境或 .env）：没配时需要测试库的用例组跳过；配了但库名不对仍由 prepPgUrl 报错 */
export function testPgConfigured(): boolean {
  return Boolean(process.env.TEST_PG_DATABASE_URL || fileEnv.TEST_PG_DATABASE_URL)
}
export function prepPgUrl(): string {
  const raw = process.env.TEST_PG_DATABASE_URL || fileEnv.TEST_PG_DATABASE_URL
  if (!raw) throw new Error('需要 .env 的 TEST_PG_DATABASE_URL')
  const url = normalizePgUrl(raw)
  if (!TEST_DB.test(new URL(url).pathname.replace(/^\//, ''))) throw new Error('TEST_PG_DATABASE_URL 的库名必须以 test 为一段')
  return url
}

const PREP_SCHEMA = /^course_test_prep_[a-z0-9_]+$/
function guard(input: { courseSchema: string; knowledgeSchema: string; owners: readonly string[] }): void {
  for (const schema of [input.courseSchema, input.knowledgeSchema]) if (!PREP_SCHEMA.test(schema)) throw new Error(`拒绝操作 schema ${schema}`)
  for (const owner of input.owners) if (!owner.startsWith('course_test_prep_')) throw new Error(`拒绝操作账号行 ${owner}`)
}

/** 重建课程 schema（迁移 0000–0002 同一份 DDL）与知识点 schema（core/knowledge 的 kp DDL），写入知识点夹具与账号行。
 *  k12 数据集没有教材证据，夹具里的来源不写（PgCourseKnowledge 的来源恒为空） */
export async function resetPrepSchemas(input: { courseSchema: string; knowledgeSchema: string; owners: readonly string[]; fixtures: PrepFixtures }): Promise<void> {
  guard(input)
  const pool = new pg.Pool({ connectionString: prepPgUrl(), max: 1 })
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${input.courseSchema} CASCADE`)
    await pool.query(`DROP SCHEMA IF EXISTS ${input.knowledgeSchema} CASCADE`)
    await pool.query(accountDdl())
    for (const owner of input.owners) await pool.query('insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0) on conflict do nothing', [owner])
    await applyCourseDdl(pool, input.courseSchema)
    await pool.query(knowledgeDdl(input.knowledgeSchema))
    const knowledge = input.fixtures.prepFixtureKnowledge()
    for (const point of knowledge.points) {
      await pool.query(`INSERT INTO ${input.knowledgeSchema}.knowledge_points (id, canonical_name, subject, grade_band, annotations, dataset) VALUES ($1, $2, $3, $4, $5::jsonb, 'fixture')`, [point.id, point.canonical_name, point.subject, point.grade_band ?? '', point.annotations ?? '{}'])
    }
  } finally {
    await pool.end()
  }
}

export async function dropPrepSchemas(input: { courseSchema: string; knowledgeSchema: string; owners: readonly string[] }): Promise<void> {
  guard(input)
  const pool = new pg.Pool({ connectionString: prepPgUrl(), max: 1 })
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${input.courseSchema} CASCADE`)
    await pool.query(`DROP SCHEMA IF EXISTS ${input.knowledgeSchema} CASCADE`)
    await pool.query('delete from account.users where username = any($1)', [[...input.owners]])
  } finally {
    await pool.end()
  }
}

/** tool/result 帧：data.message.content[].text 是工具 render 出的 JSON（identity.test.ts 实测形状） */
export function toolResultsOf(frames: EventFrame[]): Array<Record<string, any>> {
  return frames.filter((frame) => frame.type === 'tool/result').map((frame) => {
    const blocks = (frame.data as { message?: { content?: Array<{ type?: string; text?: string }> } }).message?.content ?? []
    return JSON.parse(blocks.find((block) => block.type === 'text')?.text ?? '{}') as Record<string, any>
  })
}

/**
 * 一个 prep 会话的驱动：每回合用"TOOL:<工具名>:<JSON 参数>"让假模型调一个工具（fake-openai.ts 的学生原话标记，按请求解析，
 * 不经全局脚本队列，所以多个会话可以并发）。整个会话只开一条 SSE（2c 裁决），按 turn/end 计数切出本回合的帧。
 */
export function prepSession(host: HostHandle, sessionId: string) {
  const events = host.events(sessionId)
  return {
    async call(tool: string, args: Record<string, unknown>): Promise<Record<string, any>> {
      const start = events.received.length
      const ends = events.received.filter((frame) => frame.type === 'turn/end').length
      const sent = await host.api('POST', `/sessions/${sessionId}/prompt`, { text: `TOOL:${tool}:${JSON.stringify(args)}` })
      if (sent.status >= 300) throw new Error(`prompt ${sent.status}`)
      await events.waitFor(() => events.received.filter((frame) => frame.type === 'turn/end').length > ends, 600_000)
      const results = toolResultsOf(events.received.slice(start))
      if (results.length === 0) throw new Error(`回合里没有 ${tool} 的工具结果`)
      return results[0]!
    },
    close: () => events.close(),
  }
}

/** 结束子进程及其全部后代（排空脚本会起浏览器）：Windows 用 taskkill /T /F，其他平台杀整个进程组（子进程以 detached 起） */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else try { process.kill(-pid, 'SIGKILL') } catch { /* 已退出 */ }
}

/**
 * 起 workers/render 的排空脚本子进程（浏览器不进 harness 进程），返回它最后一行 JSON 汇总。
 * 直接用 node --import tsx 起脚本（不经 shell、corepack 与 tsx 的 CLI 包装），超时（缺省 10 分钟）时结束整棵进程树再报错。
 * 3c 裁决 F21：测试库地址经 prepPgUrl()（进程环境或 dotenv.parse 取的单个变量、已过库名守卫）显式传给子进程，不合并整个 .env。
 * 排空脚本跑满 --max-jobs 还没 idle 时也以 0 退出（T10 备注）：调用方要看 counts.idle 并核对队列确实空了。
 */
export async function drainRenderQueue(schema: string, options: { fakeCapture: boolean; timeoutMs?: number }): Promise<Record<string, unknown>> {
  const workerDir = resolve(import.meta.dirname, '..', '..', '..', '..', 'workers', 'render')
  const child = spawn(process.execPath, ['--import', 'tsx', join('scripts', 'drain-queue.ts'), '--schema', schema, ...(options.fakeCapture ? ['--fake-capture'] : [])], {
    cwd: workerDir,
    env: { ...process.env, TEST_PG_DATABASE_URL: prepPgUrl(), NO_PROXY: '127.0.0.1,localhost' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000) })
  let timedOut = false
  const timeoutMs = options.timeoutMs ?? 600_000
  const timer = setTimeout(() => { timedOut = true; killTree(child.pid) }, timeoutMs)
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', (exitCode) => resolveExit(exitCode))
  }).finally(() => clearTimeout(timer))
  if (timedOut) throw new Error(`drain 超过 ${timeoutMs}ms，已结束进程树：${stderr.slice(-800)}`)
  if (code !== 0) throw new Error(`drain 退出码 ${String(code)}：${stderr.slice(-800)}`)
  return JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as Record<string, unknown>
}

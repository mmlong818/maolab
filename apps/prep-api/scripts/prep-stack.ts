// 3d：本机备课全栈（假模型端到端与真实走查共用）。全部只连 TEST_PG_DATABASE_URL；`.env` 用 dotenv.parse 按名取值、显式传给子进程，不整体并进 process.env，不打印任何值。
// fake：fake 模型 + 假课程网关；鉴权用测试 OIDC 配置，token 由脚本在测试库里签发。
// real：harness 用真实云一网关（provider yunyi、glm-5.3，凭证只来自登录用户自己）；api 用 .env 的真实 OIDC 配置（只为对真实身份服务登录），回调必须是 http://127.0.0.1:3000/login-callback（2e 实测已登记），所以 webPort 固定 3000。
// 渲染：每 3 秒看一次本 schema 有没有排队的截图或导出任务，有就起一次 workers/render 的排空子进程（worker 常驻进程只看 course schema，测试 schema 用排空脚本）。
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { buildServer } from '../src/server.ts'
import { readConfig } from '../src/config.ts'
import { PgCredentialStore } from '@maolab-core/auth'
import { startFakeCourseLlm } from '../../prep-harness/tests/helpers/fake-course-llm.ts'
import { startFakeOpenAI } from '../../prep-harness/tests/helpers/fake-openai.ts'
import { INTERNAL_KEY, startHost } from '../../prep-harness/tests/helpers/host.ts'
import { drainRenderQueue, dropPrepSchemas, loadCourseForTests, prepPgUrl, resetPrepSchemas, type PrepFixtures } from '../../prep-harness/tests/helpers/prep.ts'
import { nginxBlocksPrepRender, nginxNormalizedPath } from './nginx-path.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OUT = join(ROOT, 'apps', 'web', 'out')
const fileEnv = dotenv.parse(existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env')) : '')
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' }

export interface PrepStack {
  webBase: string
  apiBase: string
  schema: string
  knowledgeSchema: string
  course: Awaited<ReturnType<typeof loadCourseForTests>>
  pool: pg.Pool
  store: PgCredentialStore
  drain(options?: { fakeCapture?: boolean }): Promise<Record<string, unknown>>
  stop(): Promise<void>
}

export function textbookStub(fixtures: PrepFixtures): { textbooks(): unknown; tree(id: string): unknown | undefined } {
  const points = fixtures.prepFixtureKnowledge().points
  const subject = points[0]?.subject ?? '语文'
  const item = { id: 'tb-prep-fixture', title: '夹具教材（3d 本机）', stage: '初中', subject, version: '夹具', grade: '八年级', volume: '上册' }
  return {
    textbooks: () => ({ items: [item] }),
    tree: (id: string) => id !== item.id ? undefined : {
      treeId: item.id, treeName: item.title,
      chapters: [{ chapterId: 'ch-1', chapterTitle: '第一单元', leaves: [{ leafId: 'leaf-1', leafTitle: '夹具课文', kps: points.map((p) => ({ kpId: p.id, canonicalName: p.canonical_name, subject: p.subject })) }] }],
    },
  }
}

/** 同 Nginx 的 try_files $uri $uri/index.html $uri.html =404（404 页用 404.html） */
function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  let path: string
  try { path = decodeURIComponent((req.url ?? '/').split('?')[0]!) } catch { res.writeHead(400).end(); return }
  const safe = normalize(path).replace(/^([/\\])+/, '')
  for (const candidate of [safe, join(safe, 'index.html'), `${safe}.html`]) {
    const file = join(OUT, candidate)
    if (file.startsWith(OUT) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(res)
      return
    }
  }
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
  createReadStream(join(OUT, '404.html')).on('error', () => res.end()).pipe(res)
}

function startWeb(apiBase: string, stub: ReturnType<typeof textbookStub>, port: number): Promise<{ base: string; close(): Promise<void> }> {
  const api = new URL(apiBase)
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    // 同 Nginx：先归一（解码、合并斜杠、点段），再按 location 判定（终审修复：此前按原始路径判，renderfoo、%72ender、/./render 会被转给 api）
    const path = nginxNormalizedPath(url)
    if (path === null) { res.writeHead(400).end(); return }
    // 同 apps/prep-web/nginx 的 `location ^~ /api/prep/render`：纯前缀，一律 404，不转给 api
    if (nginxBlocksPrepRender(path)) { res.writeHead(404).end(); return }
    if (path === '/api/v2/textbooks') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(stub.textbooks())); return }
    if (path.startsWith('/api/v2/textbook-kps/')) {
      const tree = stub.tree(path.slice('/api/v2/textbook-kps/'.length))
      res.writeHead(tree ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(tree ?? { error: '教材不存在。' }))
      return
    }
    if (path.startsWith('/api/')) {
      // 流式转发（NDJSON 不缓冲）
      const upstream = httpRequest({ host: api.hostname, port: api.port, method: req.method, path: url, headers: { ...req.headers, host: api.host } }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) })
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
      req.pipe(upstream)
      return
    }
    serveStatic(req, res)
  })
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => {
    const address = server.address() as { port: number }
    ok({ base: `http://127.0.0.1:${address.port}`, close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()) }) })
  }))
}

export async function startPrepStack(options: { mode: 'fake' | 'real'; schema: string; owners: string[]; webPort?: number; fakeCapture?: boolean }): Promise<PrepStack> {
  if (!existsSync(join(OUT, 'prep', 'index.html'))) throw new Error('缺少 apps/prep-web/out/prep/index.html：先跑 corepack pnpm build')
  const knowledgeSchema = `${options.schema}_kp`
  const harnessSchema = `${options.schema}_harness`
  const course = await loadCourseForTests()
  // 启动中途失败也把已起的部分关掉、测试 schema 与账号行删掉（Task 14：准备阶段失败也清理）
  const cleanups: Array<() => Promise<unknown>> = []
  const unwind = async () => { while (cleanups.length > 0) await cleanups.pop()!().catch(() => undefined) }
  try {
    await resetPrepSchemas({ courseSchema: options.schema, knowledgeSchema, owners: options.owners, fixtures: course })
    cleanups.push(() => dropPrepSchemas({ courseSchema: options.schema, knowledgeSchema, owners: options.owners }))
    const pgUrl = prepPgUrl()
    const pool = new pg.Pool({ connectionString: pgUrl, max: 5 })
    cleanups.push(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${harnessSchema} CASCADE`).catch(() => undefined); await pool.end() })
    const fake = options.mode === 'fake' ? await startFakeOpenAI() : undefined
    if (fake) cleanups.push(() => fake.close())
    const gateway = options.mode === 'fake' ? await startFakeCourseLlm((request) => course.fixtureLlmReply(request)) : undefined
    if (gateway) cleanups.push(() => gateway.close())
    const hostEnv: Record<string, string> = {
      YUNYI_PG_URL: pgUrl, YUNYI_PG_SCHEMA: harnessSchema, YUNYI_PREP_PG_URL: pgUrl, YUNYI_COURSE_SCHEMA: options.schema, YUNYI_PREP_KNOWLEDGE_SCHEMA: knowledgeSchema,
      ...(options.mode === 'fake'
        ? { FAKE_OPENAI_BASE_URL: fake!.baseUrl, YUNYI_LLM_BASE_URL: gateway!.baseUrl, YUNYI_PREP_MODEL: 'fake-course' }
        : { NODE_ENV: 'development', YUNYI_DIAGNOSTIC_TOOLS: '', YUNYI_TEST_PRESETS: '' }),
    }
    const host = await startHost(hostEnv, { readyTimeoutMs: 120_000 })
    cleanups.push(() => host.stop())
    const pick = (name: string) => fileEnv[name] ?? ''
    const authEnv = options.mode === 'fake'
      ? { OIDC_CLIENT_ID: 'maolab-test', OIDC_CLIENT_SECRET: 'secret', OIDC_AUTHORITY: 'https://gateway.example.com', SECRET_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=' }
      : { OIDC_CLIENT_ID: pick('OIDC_CLIENT_ID'), OIDC_CLIENT_SECRET: pick('OIDC_CLIENT_SECRET'), OIDC_AUTHORITY: pick('OIDC_AUTHORITY'), OIDC_GATEWAY_BASE_URL: pick('OIDC_GATEWAY_BASE_URL'), OIDC_TOKEN_TTL: pick('OIDC_TOKEN_TTL'), SECRET_ENCRYPTION_KEY: pick('SECRET_ENCRYPTION_KEY') }
    const config = readConfig({
      ...authEnv, PG_DATABASE_URL: pgUrl, PORTAL_BASE_URL: '',
      YUNYI_TURNS: 'off', YUNYI_PREP: 'all', YUNYI_HARNESS_URL: host.base, YUNYI_INTERNAL_KEY: INTERNAL_KEY,
      YUNYI_TURN_PROVIDER: options.mode === 'fake' ? 'fake' : 'yunyi', YUNYI_TURN_MODEL: options.mode === 'fake' ? 'fake-1' : 'glm-5.3',
      YUNYI_COURSE_SCHEMA: options.schema, YUNYI_PREP_KNOWLEDGE_SCHEMA: knowledgeSchema,
    })
    const store = new PgCredentialStore(pool, config.secretKey)
    const app = await buildServer({ pool, config, store })
    cleanups.push(() => app.close())
    const apiBase = await app.listen({ port: 0, host: '127.0.0.1' })
    const web = await startWeb(apiBase, textbookStub(course), options.webPort ?? 0)
    cleanups.push(() => web.close())
    let draining: Promise<Record<string, unknown>> | undefined
    const drain = (o: { fakeCapture?: boolean } = {}) => (draining ??= drainRenderQueue(options.schema, { fakeCapture: o.fakeCapture ?? options.fakeCapture ?? true }).finally(() => { draining = undefined }))
    const loop = setInterval(() => {
      void pool.query(`select count(*)::int as n from ${options.schema}.render_jobs where status = 'queued'`).then((r) => { if ((r.rows[0] as { n: number }).n > 0) void drain().catch(() => undefined) }).catch(() => undefined)
    }, 3_000)
    cleanups.push(async () => { clearInterval(loop); await draining?.catch(() => undefined) })
    return {
      webBase: web.base, apiBase, schema: options.schema, knowledgeSchema, course, pool, store, drain,
      // 逆序：停轮询并等排空 → 前端 → api → 宿主 → 假服务 → 删 harness schema 并关池 → 删测试 schema 与账号行
      stop: unwind,
    }
  } catch (error) {
    await unwind()
    throw error
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = process.argv.includes('--real') ? 'real' : 'fake'
  const stack = await startPrepStack({ mode, schema: 'course_test_prep_walk', owners: ['course_test_prep_walk_t'], webPort: mode === 'real' ? 3000 : 0, fakeCapture: mode === 'fake' })
  process.stdout.write(`${JSON.stringify({ web: stack.webBase, mode })}\n`)
  const stop = () => { void stack.stop().finally(() => process.exit(0)) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { registerFastify } from '@agentia/auth-node'
import { buildAuth, PgCredentialStore } from '@maolab-core/auth'
import type pg from 'pg'
import { PgPrepConversations } from '@maolab/domain'
import { authEnabled, type ApiConfig } from './config.ts'
import { getToken } from './auth/token.ts'
import { isPrepKey, routeKey } from './auth/route-path.ts'
import { accountRoutes } from './routes/account.ts'
import { isPrepRenderPath, prepRoutes } from './routes/prep.ts'
import { PREP_ERRORS } from './prep/errors.ts'
import { PrepCourses } from './prep/courses.ts'
import { PrepDispatchLog } from './prep/turn.ts'
import { createHarnessClient, type HarnessClient } from './harness/client.ts'

declare module 'fastify' {
  interface FastifyRequest {
    user_id?: string
  }
  interface FastifyInstance {
    deps: { pool: pg.Pool; config: ApiConfig; store: PgCredentialStore; auth: ReturnType<typeof buildAuth>; harness: HarnessClient }
    /** 备课：对话与回合登记在 config.prep.courseSchema；courses 是按 owner 的门面（课程模块首个课程请求时才加载） */
    prep: { conversations: PgPrepConversations; courses: PrepCourses; dispatch: PrepDispatchLog }
    /** 解析身份（不看是否公开路径）：成功写 req.user_id 返回 true；失败已回 401 返回 false。prep 闸门在身份未解析时调用它（fail closed） */
    authenticateRequest(req: FastifyRequest, reply: FastifyReply): Promise<boolean>
  }
}

export interface ServerDeps {
  pool: pg.Pool
  config: ApiConfig
  store?: PgCredentialStore
  /** 测试注入用；缺省按 config.harness 建真实客户端 */
  harness?: HarnessClient
}

export const LOGIN_REQUIRED = { error: '未登录或登录已过期', code: 'LOGIN_REQUIRED' }
const PUBLIC = new Set(['/api/health'])
/** 未开鉴权（本机开发）时的固定身份 */
export const LOCAL_USER_ID = 'local-teacher'

/** 请求日志里的查询参数 token（导出链接 ?token= 带会话 token）一律抹掉，其余原样 */
export function redactTokenQuery(url: string): string {
  const q = url.indexOf('?')
  if (q < 0) return url
  const params = url.slice(q + 1).split('&').map((part) => {
    const eq = part.indexOf('=')
    const name = eq < 0 ? part : part.slice(0, eq)
    let decoded = name
    try { decoded = decodeURIComponent(name.replace(/\+/g, ' ')) } catch { /* 解不开按原样比对 */ }
    return decoded.trim().toLowerCase() === 'token' ? `${name}=[redacted]` : part
  })
  return `${url.slice(0, q)}?${params.join('&')}`
}
/** Fastify 日志选项：req 只记方法、抹过 token 的 url、host 与对端地址（与默认序列化相同的字段） */
export const loggerOptions = () => ({
  serializers: {
    req(req: FastifyRequest) {
      return { method: req.method, url: redactTokenQuery(req.url), host: req.host, remoteAddress: req.ip, remotePort: req.socket?.remotePort ?? 0 }
    },
  },
})

export async function buildServer({ pool, config, store = new PgCredentialStore(pool, config.secretKey), harness }: ServerDeps): Promise<FastifyInstance> {
  // Fastify 的数字 trustProxy 会一律不信任（fail closed），所以用函数按跳数信任：第 0 跳是 socket 对端
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' ? loggerOptions() : false, trustProxy: (_addr: string, hop: number) => hop < config.trustProxy })
  const auth = buildAuth(config, store)
  const enabled = authEnabled(config)
  const client = harness ?? createHarnessClient(config.harness.url, config.harness.internalKey, { timeoutMs: config.harness.timeoutMs })

  app.decorate('deps', { pool, config, store, auth, harness: client })
  app.decorate('prep', { conversations: new PgPrepConversations(pool, { schema: config.prep.courseSchema }), courses: new PrepCourses({ pool, prep: config.prep }), dispatch: new PrepDispatchLog() })
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-served-by', 'api')
  })
  app.get('/api/health', async () => ({ ok: true, service: 'prep-api' }))

  // SDK 的 /api/auth/*、/api/billing/*：登录、登出、余额、充值
  registerFastify(app as unknown as Parameters<typeof registerFastify>[0], auth.handlers, { getToken, getUserId: (req) => (req as unknown as FastifyRequest).user_id ?? null })

  // 备课渲染数据路径（归一后判定，// 与 %2F 等变体同样命中）在一切之前 404——先于请求体解析与鉴权，匿名也拿不到 401，不读任何数据。
  // 鉴权按路由视角分类（routeKey：命中的路由模板，未命中时取解码后的路径），不按原始 req.url——
  // 否则 /%61pi/...、/api/%70rep/... 这类编码路径会被路由匹配到处理函数，却被钩子当成"不需要鉴权"。
  // prep 路由在 onRequest 就解析身份（先于请求体解析）：prep 插件的闸门也在 onRequest，名单外的账号带坏请求体同样是 403 而不是 400
  app.addHook('onRequest', async (req, reply) => {
    if (isPrepRenderPath(req.url)) return reply.code(404).send(PREP_ERRORS.notFound)
    const key = routeKey(req)
    if (isPrepKey(key)) return identify(req, reply, key)
  })
  app.addHook('preHandler', async (req, reply) => {
    // 已在 onRequest 解析过身份（prep 路由）就不再解析
    if (req.user_id !== undefined) return
    return identify(req, reply, routeKey(req))
  })
  async function identify(req: FastifyRequest, reply: FastifyReply, key: string): Promise<unknown> {
    if (!key.startsWith('/api/') || PUBLIC.has(key) || auth.PUBLIC_PATHS.includes(key)) return
    if (!(await authenticateRequest(req, reply))) return reply
  }
  async function authenticateRequest(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (!enabled) {
      req.user_id = LOCAL_USER_ID
      return true
    }
    const token = getToken(req)
    const userId = token ? await auth.authenticate(token) : null
    if (!userId) { reply.code(401).send(LOGIN_REQUIRED); return false }
    req.user_id = String(userId)
    return true
  }
  app.decorate('authenticateRequest', (req: FastifyRequest, reply: FastifyReply) => authenticateRequest(req, reply))

  await app.register(accountRoutes)
  await app.register(prepRoutes)
  return app
}

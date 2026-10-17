// 渲染 worker 的配置（3b）。只读环境变量，不读 .env；连接串与密钥不打印。
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { envMs } from '@maolab/domain'

export interface RenderWorkerConfig {
  pgUrl: string
  /** apps/prep-web 静态站点的内网地址（生产为 frontend 的 Nginx，如 http://frontend:8080）；渲染页与其静态资源从这里加载 */
  pageOrigin: string
  browserPath: string | undefined
  noSandbox: boolean
  leaseMs: number
  heartbeatMs: number
  idleMs: number
  navigationTimeoutMs: number
  purgeEveryMs: number
  /** 收到 SIGTERM 后最多等这么久就兜底退出（T9 M3）；应不大于平台的终止宽限期 */
  drainGraceMs: number
  healthPort: number
  /** S4 课程包取学段学科与数据集版本的知识点 schema（与 api 的 YUNYI_PREP_KNOWLEDGE_SCHEMA 相同，缺省 kp） */
  knowledgeSchema: string
  /** 租约持有者标识：主机名:进程号:随机串，崩溃重启后不会与旧租约混淆 */
  holder: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RenderWorkerConfig {
  const pgUrl = env.RENDER_PG_URL?.trim() || env.PG_DATABASE_URL?.trim()
  if (!pgUrl) throw new Error('需要 RENDER_PG_URL（或 PG_DATABASE_URL）')
  const origin = env.RENDER_PAGE_ORIGIN?.trim()
  if (!origin || !/^https?:\/\/[^/]+/.test(origin)) throw new Error('需要 RENDER_PAGE_ORIGIN（apps/prep-web 静态站点的 http(s) 地址，如 http://frontend:8080）')
  const leaseMs = envMs('RENDER_LEASE_MS', 120_000, env)
  const heartbeatMs = envMs('RENDER_HEARTBEAT_MS', 30_000, env)
  if (heartbeatMs >= leaseMs) throw new Error('RENDER_HEARTBEAT_MS 必须小于 RENDER_LEASE_MS（心跳要在租约过期前续上）')
  const port = Number(env.RENDER_HEALTH_PORT ?? '8080')
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error('RENDER_HEALTH_PORT must be a port number')
  const knowledgeSchema = env.YUNYI_PREP_KNOWLEDGE_SCHEMA?.trim() || 'kp'
  if (!/^[a-z_][a-z0-9_]*$/.test(knowledgeSchema)) throw new Error('YUNYI_PREP_KNOWLEDGE_SCHEMA must be a plain schema name')
  return {
    pgUrl,
    pageOrigin: new URL(origin).origin,
    browserPath: env.RENDER_BROWSER_PATH?.trim() || undefined,
    noSandbox: env.RENDER_CHROMIUM_NO_SANDBOX === '1',
    leaseMs,
    heartbeatMs,
    idleMs: envMs('RENDER_IDLE_MS', 2_000, env),
    navigationTimeoutMs: envMs('RENDER_NAV_TIMEOUT_MS', 45_000, env),
    purgeEveryMs: envMs('RENDER_PURGE_EVERY_MS', 3_600_000, env),
    drainGraceMs: envMs('RENDER_DRAIN_GRACE_MS', 300_000, env),
    healthPort: port,
    knowledgeSchema,
    holder: `${hostname()}:${process.pid}:${randomUUID().replaceAll('-', '').slice(0, 8)}`,
  }
}

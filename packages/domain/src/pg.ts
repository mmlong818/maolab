import pg from 'pg'

/** Python 侧的连接串是 postgresql+asyncpg://…；node-postgres 只认 postgresql://。 */
export function normalizePgUrl(url: string): string {
  return url.replace(/^postgresql\+asyncpg:/, 'postgresql:').replace(/^postgres\+asyncpg:/, 'postgres:')
}

/** 空闲连接出错（PG 重启、网络抖动）时 pg.Pool 会发 'error'；没有监听器就成了未捕获异常，宿主直接退出。
 *  这里只记一行通用日志（不带连接串、不带错误原文，免得带出凭据），后续查询自然失败并按各自的降级路径处理。 */
export function guardPool<T extends pg.Pool>(pool: T, label: string): T {
  pool.on('error', (e: Error & { code?: unknown }) => {
    process.stderr.write(`${label}: idle pg client error${typeof e?.code === 'string' ? ` (${e.code})` : ''}\n`)
  })
  return pool
}

/** 取连接的上限（控制器裁决 [T8]）：池满或数据库连不上时，事务内的 statement_timeout 还没生效，没有这个上限调用方会一直挂在 connect 上。
 *  环境变量 YUNYI_PG_CONNECT_TIMEOUT_MS 覆盖 */
export const POOL_CONNECTION_TIMEOUT_MS = 5_000

/** 读毫秒数的环境变量：未设或为空用缺省值；设了就必须是正整数（0 在 pg / PG 里都表示"无上限"，不接受），否则启动即报错 */
export function envMs(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const ms = Number(raw)
  if (!Number.isInteger(ms) || ms <= 0) throw new Error(`${name} must be a positive integer (ms)`)
  return ms
}

export function createPool(url: string, options: { connectionTimeoutMillis?: number } = {}): pg.Pool {
  const connectionTimeoutMillis = options.connectionTimeoutMillis ?? envMs('YUNYI_PG_CONNECT_TIMEOUT_MS', POOL_CONNECTION_TIMEOUT_MS)
  return guardPool(new pg.Pool({ connectionString: normalizePgUrl(url), max: 10, connectionTimeoutMillis }), 'yunyi-domain')
}

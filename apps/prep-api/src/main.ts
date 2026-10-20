import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { checkCourseSchema, checkExportSchema, checkPrepSchema, checkRenderSchema, createPool, KP_SEED_FILE_ENV, runMigrations, seedKpIfEmpty } from '@maolab/domain'
import { readConfig } from './config.ts'
import { buildServer } from './server.ts'
import { createShutdown, SHUTDOWN_MARGIN_MS } from './shutdown.ts'

loadEnv({ path: resolve(import.meta.dirname, '..', '..', '..', '.env') })
const config = readConfig()
if (!config.pgUrl) throw new Error('缺少 PG_DATABASE_URL')
const pool = createPool(config.pgUrl)
// 每次启动都跑迁移：account、kp 的 DDL（core）与 course 迁移链；迁移带 lock_timeout，拿不到锁就抛错，api 启动失败，低峰重试
await runMigrations(pool)
// 一次性导入 k12 知识点（生产库本机连不上）：设了 MAOLAB_KP_SEED_FILE 且 kp 为空才导，已有数据就跳过；文件不存在则启动失败
const kpSeedFile = process.env[KP_SEED_FILE_ENV]?.trim()
if (kpSeedFile) console.log(`kp seed: ${JSON.stringify(await seedKpIfEmpty(pool, kpSeedFile))}`)
// 课程、渲染、备课对话与课程包导出表都要在（缺表启动失败，不等到第一次请求）
await checkCourseSchema(pool, config.prep.courseSchema)
await checkRenderSchema(pool, config.prep.courseSchema)
await checkPrepSchema(pool, config.prep.courseSchema)
await checkExportSchema(pool, config.prep.courseSchema)
const app = await buildServer({ pool, config })
await app.listen({ port: config.port, host: '0.0.0.0' })
// 备课回合不进排水（api 重启后过期可重占，课程状态在工具写的库里）：停机只等进行中的 HTTP 请求，再关连接池
const shutdown = createShutdown({
  close: () => app.close(), inflight: new Set(), endPool: () => pool.end(),
  graceMs: SHUTDOWN_MARGIN_MS, log: (m) => app.log.warn(m),
})
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown().finally(() => process.exit(0)))

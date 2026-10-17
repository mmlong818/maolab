import 'dotenv/config'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPool, normalizePgUrl } from '../../src/pg.ts'
config({ path: resolve(import.meta.dirname, '..', '..', '..', '..', '.env') })

/** 测试会 DROP SCHEMA（含 migrate.test 的 learner）并建删一次性库：只认 TEST_PG_DATABASE_URL，且库名必须以 test 为一段（/(^|_)test(_|$)/i）
 *  （Ruling [api-test-db]），绝不回退到 PG_DATABASE_URL（开发库）。 */
export function testPgUrl(): string {
  const raw = process.env.TEST_PG_DATABASE_URL
  if (!raw) throw new Error('需要 TEST_PG_DATABASE_URL（指向库名含 test 的测试库，如 maolab_test；先对它跑 backend 的 alembic upgrade head）。不会回退到 PG_DATABASE_URL')
  const url = normalizePgUrl(raw)
  const db = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  if (!/(^|_)test(_|$)/i.test(db)) throw new Error(`拒绝在库 "${db}" 上跑测试：TEST_PG_DATABASE_URL 的库名必须以 test 为一段（如 maolab_test；测试会 TRUNCATE/DROP）`)
  return url
}
export const testPool = () => createPool(testPgUrl())

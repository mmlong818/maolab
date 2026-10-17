import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPool, normalizePgUrl } from '@maolab/domain'

config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env') })

/** 同 domain/course 测试的守卫（Ruling [api-test-db]）：只认 TEST_PG_DATABASE_URL，库名必须以 test 为一段 */
export function testPool() {
  const raw = process.env.TEST_PG_DATABASE_URL
  if (!raw) throw new Error('需要 TEST_PG_DATABASE_URL（库名含 test 的测试库，已跑 backend 的 alembic upgrade head）')
  const url = normalizePgUrl(raw)
  const db = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  if (!/(^|_)test(_|$)/i.test(db)) throw new Error(`拒绝在库 "${db}" 上跑测试：库名必须以 test 为一段（如 maolab_test）`)
  return createPool(url)
}

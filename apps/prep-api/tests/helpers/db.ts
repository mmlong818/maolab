import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPool, normalizePgUrl, runMigrations } from '@maolab/domain'
import type pg from 'pg'
config({ path: resolve(import.meta.dirname, '..', '..', '..', '..', '.env') })

/** 测试会 TRUNCATE account 与 course 的表：只认 TEST_PG_DATABASE_URL，且库名必须以 test 为一段（/(^|_)test(_|$)/i，Ruling [api-test-db]），
 *  绝不回退到 PG_DATABASE_URL（开发库）。 */
export function testPgUrl(): string {
  const raw = process.env.TEST_PG_DATABASE_URL
  if (!raw) throw new Error('需要 TEST_PG_DATABASE_URL（指向库名含 test 的测试库，如 maolab_prep_test）。不会回退到 PG_DATABASE_URL')
  const url = normalizePgUrl(raw)
  const db = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  if (!/(^|_)test(_|$)/i.test(db)) throw new Error(`拒绝在库 "${db}" 上跑测试：TEST_PG_DATABASE_URL 的库名必须以 test 为一段（如 maolab_prep_test；测试会 TRUNCATE/DROP）`)
  return url
}
export function testPool(): pg.Pool {
  return createPool(testPgUrl())
}
export async function resetDb(pool: pg.Pool): Promise<void> {
  await runMigrations(pool)
  await pool.query('TRUNCATE account.users CASCADE')
}
export const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='

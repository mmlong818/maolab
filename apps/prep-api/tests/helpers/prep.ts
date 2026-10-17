// api 的备课测试环境。课程与知识点在测试库的 course_test_prep_api* schema（harness 的 resetPrepSchemas：迁移 0000–0002 同一份 DDL + 知识点夹具）；
// 老师账号以 course_test_prep_ 开头（helper 的守卫），外部 id 改成 yy_ 前缀并按需存云一凭证（resolvePrepCredential 只认 yy_ 账号）。
// Ruling [T5] F2：同一文件里第二次建测试 app 要传 resetDb: false——否则 TRUNCATE account.users 会删掉前一个 app 的账号与 token。
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { buildServer } from '../../src/server.ts'
import { PgCredentialStore } from '@maolab-core/auth'
import type { HarnessClient } from '../../src/harness/client.ts'
import { TEST_KEY, resetDb, testPool } from './db.ts'
import { prepConfig } from './config.ts'
import { dropPrepSchemas, loadCourseForTests, resetPrepSchemas } from '../../../prep-harness/tests/helpers/prep.ts'

export const PREP_API_SCHEMA = 'course_test_prep_api'
export const PREP_API_KP_SCHEMA = 'course_test_prep_api_kp'

export async function prepTestApp(opts: { owners: string[]; env?: Record<string, string>; harness?: HarnessClient; withCredential?: string[]; courseSchema?: string; knowledgeSchema?: string; resetDb?: boolean }) {
  const courseSchema = opts.courseSchema ?? PREP_API_SCHEMA
  const knowledgeSchema = opts.knowledgeSchema ?? PREP_API_KP_SCHEMA
  const pool: pg.Pool = testPool()
  if (opts.resetDb !== false) await resetDb(pool)
  const course = await loadCourseForTests()
  await resetPrepSchemas({ courseSchema, knowledgeSchema, owners: opts.owners, fixtures: course })
  await pool.query(`update account.users set external_id = 'yy_' || username where username = any($1)`, [opts.owners])
  const store = new PgCredentialStore(pool, TEST_KEY)
  for (const owner of opts.withCredential ?? opts.owners) await store.setCredential(owner, { apiKey: `key-${owner}` })
  const config = prepConfig({ YUNYI_PREP: 'all', YUNYI_COURSE_SCHEMA: courseSchema, YUNYI_PREP_KNOWLEDGE_SCHEMA: knowledgeSchema, ...opts.env })
  const app: FastifyInstance = await buildServer({ pool, config, store, ...(opts.harness ? { harness: opts.harness } : {}) })
  return {
    app, pool, store, course,
    token: (owner: string) => store.createToken(owner),
    async close() {
      await app.close()
      await dropPrepSchemas({ courseSchema, knowledgeSchema, owners: opts.owners })
      await pool.end()
    },
  }
}

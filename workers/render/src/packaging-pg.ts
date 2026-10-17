// S4：export-package 任务的 PG 版依赖（worker 入口与本机排空脚本共用）。
import { PgExports } from '@maolab/domain'
import type { SigningKey } from '@maolab-core/course-package'
import { PgKnowledge } from '@maolab-core/knowledge'
import type pg from 'pg'
import { KNOWLEDGE_DATASET_NAME, type PackagingDeps } from './package-export.ts'

export function createPgPackaging(pool: pg.Pool, options: { schema?: string; knowledgeSchema: string; signingKey: SigningKey | undefined; coreVersion: string }): PackagingDeps {
  const exports = new PgExports(pool, { ...(options.schema ? { schema: options.schema } : {}) })
  const knowledge = new PgKnowledge(pool, { schema: options.knowledgeSchema })
  return {
    signingKey: options.signingKey,
    coreVersion: options.coreVersion,
    exportsFor: (owner) => exports.forOwner(owner),
    identifiersOf: async (owner) => {
      const r = await pool.query<{ external_id: string | null; display_name: string | null; email: string | null }>(
        'select external_id, display_name, email from account.users where username = $1', [owner])
      const row = r.rows[0]
      return [owner, row?.external_id, row?.display_name, row?.email].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    },
    datasetVersion: () => knowledge.datasetVersion(KNOWLEDGE_DATASET_NAME),
    knowledgePoints: async (ids) => (await knowledge.byIds(ids)).map((p) => ({ id: p.id, subject: p.subject, gradeBand: p.gradeBand })),
  }
}

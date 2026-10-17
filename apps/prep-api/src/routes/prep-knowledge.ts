// 知识点选择（S3）：k12-knowledge-points 数据集没有教材章节树，老师按学段、学科与关键词检索（maolab-core/knowledge 的 PgKnowledge，
// schema 同备课的 config.prep.knowledgeSchema）。选中的知识点 id 交给 POST /api/prep/courses 建课。
// 关键词为空时必须带学段或学科，否则拒绝（不扫整张表）；limit 缺省 20、上限 100。
import type { FastifyPluginAsync } from 'fastify'
import { DATASET_NAME, PgKnowledge } from '@maolab-core/knowledge'
import { GRADE_BANDS, isGradeBand } from '@maolab-core/types'

const MAX_QUERY = 80
const MAX_SUBJECT = 20
const BAD_QUERY = { error: '检索条件不正确。', code: 'QUERY_INVALID' }
const QUERY_REQUIRED = { error: '请输入关键词，或先选学段、学科。', code: 'QUERY_REQUIRED' }

interface SearchQuery { q?: string; gradeBand?: string; subject?: string; limit?: string }

export const prepKnowledgeRoutes: FastifyPluginAsync = async (app) => {
  const { pool, config } = app.deps
  const knowledge = new PgKnowledge(pool, { schema: config.prep.knowledgeSchema })

  app.get<{ Querystring: SearchQuery }>('/api/prep/knowledge/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim()
    const gradeBand = (req.query.gradeBand ?? '').trim()
    const subject = (req.query.subject ?? '').trim()
    const limitRaw = (req.query.limit ?? '').trim()
    const limit = limitRaw ? Number(limitRaw) : 20
    if (q.length > MAX_QUERY || subject.length > MAX_SUBJECT || (gradeBand && !isGradeBand(gradeBand)) || !Number.isInteger(limit) || limit < 1) {
      return reply.code(400).send(BAD_QUERY)
    }
    if (!q && !gradeBand && !subject) return reply.code(400).send(QUERY_REQUIRED)
    const points = await knowledge.search({
      query: q,
      ...(gradeBand && isGradeBand(gradeBand) ? { gradeBand } : {}),
      ...(subject ? { subject } : {}),
      limit: Math.min(limit, 100),
    })
    return { items: points.map((p) => ({ id: p.id, name: p.canonicalName, subject: p.subject, gradeBand: p.gradeBand, summary: p.summary })) }
  })

  app.get('/api/prep/knowledge/facets', async () => {
    const s = `"${knowledge.schema}"`
    const r = await pool.query<{ grade_band: string; subject: string }>(`SELECT DISTINCT grade_band, subject FROM ${s}.knowledge_points`)
    const bySubject = new Map<string, string[]>()
    for (const row of r.rows) bySubject.set(row.grade_band, [...(bySubject.get(row.grade_band) ?? []), row.subject])
    return {
      datasetVersion: (await knowledge.datasetVersion(DATASET_NAME)) ?? null,
      gradeBands: GRADE_BANDS.filter((band) => bySubject.has(band)).map((band) => ({ gradeBand: band, subjects: [...bySubject.get(band)!].sort() })),
    }
  })
}

// 备课用知识点读取：按 id 取 kp.knowledge_points（maolab-core/knowledge 导入的 k12-knowledge-points 数据集），列名与旧 SQLite 相同，
// annotations 转回 JSON 文本，交给 @maolab/course 的解析函数。K12：不按学段过滤。空 grade_band 读成 null。
// k12 数据集没有教材正文证据（旧库的 knowledge_point_sources），来源一律为空：备课的来源摘录按"无教材依据"处理（docs/ISSUES.md 4）。
import type pg from 'pg'

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/

export interface CourseKnowledgeRow {
  id: string
  canonical_name: string
  subject: string
  grade_band: string | null
  annotations: string | null
}

export interface CourseKnowledgeSourceRow {
  knowledgePointId: string
  source: string
  externalId: string | null
  evidenceSnippet: string | null
  confidence: number | null
}

export class PgCourseKnowledge {
  readonly schema: string
  private readonly pool: pg.Pool

  constructor(pool: pg.Pool, options: { schema?: string } = {}) {
    const schema = options.schema ?? 'kp'
    if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`)
    this.pool = pool
    this.schema = schema
  }

  async knowledgePoints(ids: readonly string[]): Promise<CourseKnowledgeRow[]> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    const r = await this.pool.query<CourseKnowledgeRow>(
      `select id, canonical_name, subject, nullif(grade_band, '') as grade_band, annotations::text as annotations
       from "${this.schema}".knowledge_points where id = any($1::text[]) order by id`,
      [unique],
    )
    return r.rows
  }

  async knowledgePointSources(_ids: readonly string[]): Promise<CourseKnowledgeSourceRow[]> {
    return []
  }
}

import { eq, sql, inArray, and, or, like } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import type { ContentUnitRepository } from './types.js'
import type { ContentUnit, ContentUnitQuery, SceneContent } from '@maolab/shared-types'
import { contentUnits, programs } from '../schema.js'
import { parseJsonColumn } from './parse-column.js'

interface ContentUnitRow {
  id: string
  kind: string
  subkind: string
  title: string
  content: string
  concepts: string
  subject: string
  gradeLevel: string | null
  difficulty: string
  durationHint: number
  language: string
  tags: string
  embedding: string | null
  origin: string
  sourcePlanId: string | null
  createdAt: number
  usageCount: number
}

function deserialize(row: ContentUnitRow): ContentUnit {
  const at = (column: string) => ({ table: 'content_units', id: row.id, column })
  const unit: ContentUnit = {
    id: row.id,
    kind: row.kind as ContentUnit['kind'],
    subkind: row.subkind as ContentUnit['subkind'],
    title: row.title,
    content: parseJsonColumn<SceneContent>(row.content, at('content')),
    concepts: parseJsonColumn<string[]>(row.concepts, at('concepts')),
    subject: row.subject,
    difficulty: row.difficulty as ContentUnit['difficulty'],
    durationHint: row.durationHint,
    language: row.language,
    tags: parseJsonColumn<string[]>(row.tags, at('tags')),
    origin: row.origin as ContentUnit['origin'],
    createdAt: row.createdAt,
    usageCount: row.usageCount,
  }
  if (row.gradeLevel !== null) unit.gradeLevel = row.gradeLevel
  if (row.embedding !== null) unit.embedding = parseJsonColumn<number[]>(row.embedding, at('embedding'))
  if (row.sourcePlanId !== null) unit.sourcePlanId = row.sourcePlanId
  return unit
}

export function createContentUnitRepository(db: DbClient): ContentUnitRepository {
  return {
    async find(id: string): Promise<ContentUnit | undefined> {
      const row = db.select().from(contentUnits).where(eq(contentUnits.id, id)).get() as ContentUnitRow | undefined
      return row ? deserialize(row) : undefined
    },

    async findMany(ids: string[]): Promise<ContentUnit[]> {
      if (ids.length === 0) return []
      const rows = db.select().from(contentUnits).where(inArray(contentUnits.id, ids)).all() as ContentUnitRow[]
      // preserve caller-given order
      const byId = new Map(rows.map(r => [r.id, deserialize(r)]))
      return ids.map(id => byId.get(id)).filter((u): u is ContentUnit => u !== undefined)
    },

    async save(unit: ContentUnit): Promise<void> {
      const row = {
        id: unit.id,
        kind: unit.kind,
        subkind: unit.subkind,
        title: unit.title,
        content: JSON.stringify(unit.content),
        concepts: JSON.stringify(unit.concepts),
        subject: unit.subject,
        gradeLevel: unit.gradeLevel ?? null,
        difficulty: unit.difficulty,
        durationHint: unit.durationHint,
        language: unit.language,
        tags: JSON.stringify(unit.tags),
        embedding: unit.embedding ? JSON.stringify(unit.embedding) : null,
        origin: unit.origin,
        sourcePlanId: unit.sourcePlanId ?? null,
        createdAt: unit.createdAt,
        usageCount: unit.usageCount,
      }
      db.insert(contentUnits)
        .values(row)
        .onConflictDoUpdate({ target: contentUnits.id, set: row })
        .run()
    },

    async delete(id: string): Promise<void> {
      db.delete(contentUnits).where(eq(contentUnits.id, id)).run()
    },

    async search(query: ContentUnitQuery): Promise<ContentUnit[]> {
      const conditions: ReturnType<typeof eq>[] = []

      function asArray<T>(v: T | T[] | undefined): T[] | undefined {
        if (v === undefined) return undefined
        return Array.isArray(v) ? v : [v]
      }

      const kinds = asArray(query.kind)
      if (kinds && kinds.length) conditions.push(inArray(contentUnits.kind, kinds))

      const subkinds = asArray(query.subkind)
      if (subkinds && subkinds.length) conditions.push(inArray(contentUnits.subkind, subkinds))

      const subjects = asArray(query.subject)
      if (subjects && subjects.length) conditions.push(inArray(contentUnits.subject, subjects))

      const grades = asArray(query.gradeLevel)
      if (grades && grades.length) conditions.push(inArray(contentUnits.gradeLevel, grades))

      const difficulties = asArray(query.difficulty)
      if (difficulties && difficulties.length) conditions.push(inArray(contentUnits.difficulty, difficulties))

      if (query.language) conditions.push(eq(contentUnits.language, query.language))

      // concepts: OR match — bidirectional substring against JSON-encoded array.
      // We match the raw concept string (not the quoted form) so candidates whose
      // concept is a prefix/suffix of the query (or vice versa) also surface.
      if (query.concepts && query.concepts.length) {
        const conceptClauses = query.concepts
          .filter(c => c.length >= 2)
          .map(c => like(contentUnits.concepts, `%${escapeLike(c)}%`))
        if (conceptClauses.length > 0) {
          const combined = or(...conceptClauses)
          if (combined) conditions.push(combined)
        }
      }

      // conceptsAll: AND match — every concept must be present (substring)
      if (query.conceptsAll && query.conceptsAll.length) {
        for (const c of query.conceptsAll) {
          if (c.length >= 2) conditions.push(like(contentUnits.concepts, `%${escapeLike(c)}%`))
        }
      }

      // tags: OR
      if (query.tags && query.tags.length) {
        const tagClauses = query.tags.map(t => like(contentUnits.tags, `%${escapeLike(JSON.stringify(t))}%`))
        const combined = or(...tagClauses)
        if (combined) conditions.push(combined)
      }

      // free-text search on title + concepts + tags
      if (query.text) {
        const needle = `%${escapeLike(query.text)}%`
        const textClause = or(
          like(contentUnits.title, needle),
          like(contentUnits.concepts, needle),
          like(contentUnits.tags, needle),
        )
        if (textClause) conditions.push(textClause)
      }

      const limit = query.limit ?? 50
      const offset = query.offset ?? 0

      const whereClause = conditions.length ? and(...conditions) : undefined
      const baseQuery = db.select().from(contentUnits)
      const rows = (whereClause
        ? baseQuery.where(whereClause).orderBy(sql`usage_count DESC, created_at DESC`).limit(limit).offset(offset)
        : baseQuery.orderBy(sql`usage_count DESC, created_at DESC`).limit(limit).offset(offset)
      ).all() as ContentUnitRow[]

      return rows.map(deserialize)
    },

    async refreshUsageCount(id: string): Promise<number> {
      const rows = db.select({ ordered: programs.ordered }).from(programs).all() as Array<{ ordered: string }>
      let count = 0
      for (const r of rows) {
        try {
          const arr = JSON.parse(r.ordered) as Array<{ unitId: string }>
          if (arr.some(ref => ref.unitId === id)) count++
        } catch {
          // ignore
        }
      }
      db.update(contentUnits).set({ usageCount: count }).where(eq(contentUnits.id, id)).run()
      return count
    },
  }
}

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, m => '\\' + m)
}

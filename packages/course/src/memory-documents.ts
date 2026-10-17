/** 进程内、单 owner 的课程文档仓储：测试与本机工具用，语义与 @maolab/domain 的 PgCourseDocuments.forOwner 相同。 */
import type { CourseDocumentInput, CourseDocumentKind, CourseDocumentRecord, CourseDocumentStore } from './ports.js'

interface MemoryRow extends CourseDocumentRecord { kind: CourseDocumentKind }

export function createMemoryCourseDocuments(options: { now?: () => number } = {}): CourseDocumentStore & { size(): number } {
  const now = options.now ?? Date.now
  const rows = new Map<string, MemoryRow>()
  // 与存储一致：经 JSON 往返（去掉 undefined、复制对象），调用方改返回值不影响存储
  const copy = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown
  const strip = (row: MemoryRow): CourseDocumentRecord => ({
    id: row.id, title: row.title, status: row.status, payload: copy(row.payload), createdAt: row.createdAt, updatedAt: row.updatedAt,
  })
  const write = (kind: CourseDocumentKind, doc: CourseDocumentInput, existing: MemoryRow | undefined): number => {
    const t = now()
    const updatedAt = existing ? (existing.updatedAt >= t ? existing.updatedAt + 1 : t) : t
    rows.set(doc.id, { id: doc.id, kind, title: doc.title, status: doc.status, payload: copy(doc.payload), createdAt: existing?.createdAt ?? t, updatedAt })
    return updatedAt
  }
  return {
    async find(kind, id) {
      const row = rows.get(id)
      return row && row.kind === kind ? strip(row) : undefined
    },
    async save(kind, doc) {
      const existing = rows.get(doc.id)
      if (existing && existing.kind !== kind) throw new Error(`course document ${doc.id} belongs to another kind`)
      return write(kind, doc, existing)
    },
    async saveIfUnchanged(kind, doc, expectedUpdatedAt) {
      const existing = rows.get(doc.id)
      // 与 PgCourseDocuments 一致：纯 CAS，行不存在（含读后被删）返回 false，从不插入
      if (!existing || existing.kind !== kind || existing.updatedAt !== expectedUpdatedAt) return false
      write(kind, doc, existing)
      return true
    },
    async list(kind) {
      return [...rows.values()]
        .filter((row) => row.kind === kind)
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
        .map(strip)
    },
    async delete(kind, id) {
      const row = rows.get(id)
      if (!row || row.kind !== kind) return false
      rows.delete(id)
      return true
    },
    size: () => rows.size,
  }
}

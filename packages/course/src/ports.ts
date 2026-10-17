/**
 * @maolab/course 对外部 I/O 的全部依赖（3a）。本包不依赖 pg：
 * 托管实现在 @maolab/domain（PgCourseDocuments.forOwner(owner)、PgCourseKnowledge），测试用 ./memory-documents。
 */
import type { KpGroundingSourceRow } from './mainline/generation/course-grounding.js'

export type CourseDocumentKind = 'course' | 'season'

export interface CourseDocumentRecord {
  id: string
  title: string
  status: string
  payload: unknown
  createdAt: number
  updatedAt: number
}

export interface CourseDocumentInput {
  id: string
  title: string
  status: string
  payload: unknown
}

/**
 * 已绑定 owner 的课程文档仓储：看不到、写不进、删不掉别人的文档；同一 id 不能跨 kind。
 * updatedAt 是 CAS 版本号：毫秒时间，同一毫秒内再写 +1，单调递增（语义同 maolab mainline-course.sqlite）。
 */
export interface CourseDocumentStore {
  find(kind: CourseDocumentKind, id: string): Promise<CourseDocumentRecord | undefined>
  /** 返回写入后的 updatedAt；id 已属于别的 owner 或别的 kind 时抛错且不写 */
  save(kind: CourseDocumentKind, doc: CourseDocumentInput): Promise<number>
  /** 纯 CAS：只在行存在且 updatedAt 等于 expectedUpdatedAt 时写；行不存在（含读后被删）返回 false，从不插入 */
  saveIfUnchanged(kind: CourseDocumentKind, doc: CourseDocumentInput, expectedUpdatedAt: number): Promise<boolean>
  /** updatedAt 倒序 */
  list(kind: CourseDocumentKind): Promise<CourseDocumentRecord[]>
  delete(kind: CourseDocumentKind, id: string): Promise<boolean>
}

/** 知识点行：列名与 maolab SQLite 相同，annotations 为 JSON 文本，迁入的解析函数一行不改 */
export interface CourseKnowledgeRow {
  id: string
  canonical_name: string
  subject: string
  grade_band: string | null
  annotations: string | null
}

export interface CourseKnowledgePort {
  knowledgePoints(ids: readonly string[]): Promise<CourseKnowledgeRow[]>
  knowledgePointSources(ids: readonly string[]): Promise<KpGroundingSourceRow[]>
}

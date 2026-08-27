/**
 * P0-2 学情数据 — student_responses 表读写
 *
 * 不走 drizzle, 直接 better-sqlite3 minimal API (与 course-store 同库不同表).
 * 表 schema 见 packages/db/src/migrations/0005_student_responses.sql.
 * 启动时建表 IF NOT EXISTS, 保证幂等.
 *
 * v1.1（PR2a）增量：
 *   - 新增 knowledge_point_cluster_id / knowledge_point_id 两列（ALTER 兜底）
 *   - 启动时一并 ensure KP 4 表（β 通道兜底，与 packages/db 同 DDL）
 *   - 读路径触发懒回填（D1.5）
 */

// @ts-expect-error — better-sqlite3 类型在 app 包未安装, 与 packages/db 相同处理
import Database from 'better-sqlite3'

import { ensureKnowledgePointTables } from '@maolab/db'

import { resolveKpCluster } from './kp-cluster-mapper.js'

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS student_responses (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  student_id TEXT NOT NULL DEFAULT 'self',
  objective_ids TEXT NOT NULL DEFAULT '[]',
  atom_type TEXT NOT NULL,
  response TEXT NOT NULL,
  correct INTEGER,
  time_spent_ms INTEGER,
  difficulty_level TEXT NOT NULL DEFAULT 'standard',
  submitted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sr_course ON student_responses (course_id);
CREATE INDEX IF NOT EXISTS idx_sr_course_atom ON student_responses (course_id, atom_id);
CREATE INDEX IF NOT EXISTS idx_sr_student ON student_responses (student_id);
CREATE INDEX IF NOT EXISTS idx_sr_submitted ON student_responses (submitted_at);
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqliteDb = any

/**
 * v1.1 ALTER 兜底：sqlite 不支持 ADD COLUMN IF NOT EXISTS，
 * 用 PRAGMA table_info 查列名后按需 ALTER。索引照常 CREATE IF NOT EXISTS。
 */
/** student_responses 建表+列迁移一站式引导——mastery-store 与本店共用,DDL 单一事实源。 */
export function ensureStudentResponsesTable(db: BetterSqliteDb): void {
  db.exec(TABLE_SQL)
  ensureStudentResponseColumns(db)
}

export function ensureStudentResponseColumns(db: BetterSqliteDb): void {
  const rows = db.prepare(`PRAGMA table_info(student_responses)`).all() as Array<{ name: string }>
  const cols = new Set(rows.map((r) => r.name))
  if (!cols.has('knowledge_point_cluster_id')) {
    db.exec(`ALTER TABLE student_responses ADD COLUMN knowledge_point_cluster_id TEXT`)
  }
  if (!cols.has('knowledge_point_id')) {
    db.exec(`ALTER TABLE student_responses ADD COLUMN knowledge_point_id TEXT`)
  }
  // PR3a: atom 起源的教材叶子节点 id, 用于 kp-cluster-mapper 第二条反查路径
  if (!cols.has('atom_source_leaf_id')) {
    db.exec(`ALTER TABLE student_responses ADD COLUMN atom_source_leaf_id TEXT`)
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sr_cluster ON student_responses (knowledge_point_cluster_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sr_kp ON student_responses (knowledge_point_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sr_leaf ON student_responses (atom_source_leaf_id)`)
}

let _db: BetterSqliteDb = null
function getDb(): BetterSqliteDb {
  if (_db) return _db
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  const path = url.replace(/^file:/, '')
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(TABLE_SQL)
  ensureStudentResponseColumns(db)
  // β 通道：保证 KP 4 表存在（与 packages/db migrations 0006 同 DDL）
  ensureKnowledgePointTables(db)
  _db = db
  return db
}

/** 测试用：允许注入 in-memory db，便于单测。 */
export function __setDbForTest(db: BetterSqliteDb): void {
  _db = db
}

/** 测试用：重置缓存的 db handle。 */
export function __resetDbForTest(): void {
  _db = null
}

export interface StudentResponse {
  id: string
  courseId: string
  atomId: string
  studentId: string
  objectiveIds: string[]
  atomType: string
  /** 序列化的学生提交内容(任意结构) */
  response: unknown
  /** 是否答对; null 表示无法自动判断(简答/开放题) */
  correct: boolean | null
  /** 答题用时 ms */
  timeSpentMs: number | null
  difficultyLevel: 'basic' | 'standard' | 'advanced'
  submittedAt: number
  /** v1.1: 跨体系聚合簇 id */
  knowledgePointClusterId?: string | null
  /** v1.1: 体系下知识点 id */
  knowledgePointId?: string | null
  /** PR3a: atom 起源的教材叶子节点 id, 供 kp-cluster-mapper 反查 */
  atomSourceLeafId?: string | null
}

interface Row {
  id: string
  course_id: string
  atom_id: string
  student_id: string
  objective_ids: string
  atom_type: string
  response: string
  correct: number | null
  time_spent_ms: number | null
  difficulty_level: string
  submitted_at: number
  knowledge_point_cluster_id: string | null
  knowledge_point_id: string | null
  atom_source_leaf_id: string | null
}

function rowToResponse(r: Row): StudentResponse {
  return {
    id: r.id,
    courseId: r.course_id,
    atomId: r.atom_id,
    studentId: r.student_id,
    objectiveIds: JSON.parse(r.objective_ids) as string[],
    atomType: r.atom_type,
    response: JSON.parse(r.response) as unknown,
    correct: r.correct === null ? null : Boolean(r.correct),
    timeSpentMs: r.time_spent_ms,
    difficultyLevel: (r.difficulty_level as 'basic' | 'standard' | 'advanced'),
    submittedAt: r.submitted_at,
    knowledgePointClusterId: r.knowledge_point_cluster_id ?? null,
    knowledgePointId: r.knowledge_point_id ?? null,
    atomSourceLeafId: r.atom_source_leaf_id ?? null,
  }
}

export interface RecordResponseInput {
  courseId: string
  atomId: string
  studentId?: string
  objectiveIds?: string[]
  atomType: string
  response: unknown
  correct?: boolean | null
  timeSpentMs?: number | null
  difficultyLevel?: 'basic' | 'standard' | 'advanced'
  /** v1.1: 写路径可显式带；PR2a 暂不强制（PR3 由 adaptive controller 填） */
  knowledgePointClusterId?: string | null
  knowledgePointId?: string | null
  /** PR3a: atom 起源的教材叶子节点 id (chapter_node_id) */
  atomSourceLeafId?: string | null
}

export function recordResponse(input: RecordResponseInput): StudentResponse {
  const db = getDb()
  const id = `sr-${crypto.randomUUID()}`
  const row: StudentResponse = {
    id,
    courseId: input.courseId,
    atomId: input.atomId,
    studentId: input.studentId ?? 'self',
    objectiveIds: input.objectiveIds ?? [],
    atomType: input.atomType,
    response: input.response,
    correct: input.correct ?? null,
    timeSpentMs: input.timeSpentMs ?? null,
    difficultyLevel: input.difficultyLevel ?? 'standard',
    submittedAt: Date.now(),
    knowledgePointClusterId: input.knowledgePointClusterId ?? null,
    knowledgePointId: input.knowledgePointId ?? null,
    atomSourceLeafId: input.atomSourceLeafId ?? null,
  }
  db.prepare(`
    INSERT INTO student_responses
      (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct, time_spent_ms, difficulty_level, submitted_at, knowledge_point_cluster_id, knowledge_point_id, atom_source_leaf_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.courseId, row.atomId, row.studentId,
    JSON.stringify(row.objectiveIds), row.atomType,
    JSON.stringify(row.response),
    row.correct === null ? null : (row.correct ? 1 : 0),
    row.timeSpentMs,
    row.difficultyLevel,
    row.submittedAt,
    row.knowledgePointClusterId,
    row.knowledgePointId,
    row.atomSourceLeafId,
  )
  return row
}

/**
 * 对一批 response 跑懒回填（D1.5）：
 * - cluster_id 已存在的不动
 * - 否则取 objectiveIds[0] 反查 (kpId, clusterId)
 * - 命中则覆盖到返回对象 + 异步写回 DB（不阻塞）
 */
function backfillKpCluster(db: BetterSqliteDb, responses: StudentResponse[]): StudentResponse[] {
  const out: StudentResponse[] = []
  const pendingUpdates: Array<{ id: string; kpId: string | null; clusterId: string | null }> = []
  for (const r of responses) {
    if (r.knowledgePointClusterId || r.knowledgePointId) {
      out.push(r)
      continue
    }
    const objId = r.objectiveIds[0]
    const leafId = r.atomSourceLeafId ?? undefined
    if (!objId && !leafId) {
      out.push(r)
      continue
    }
    const mapping = resolveKpCluster(db, {
      ...(objId ? { objectiveId: objId } : {}),
      ...(leafId ? { atomSourceLeafId: leafId } : {}),
    })
    if (mapping.knowledgePointClusterId || mapping.knowledgePointId) {
      out.push({
        ...r,
        knowledgePointClusterId: mapping.knowledgePointClusterId,
        knowledgePointId: mapping.knowledgePointId,
      })
      pendingUpdates.push({ id: r.id, kpId: mapping.knowledgePointId, clusterId: mapping.knowledgePointClusterId })
    } else {
      out.push(r)
    }
  }
  if (pendingUpdates.length > 0) {
    // 异步写回，不阻塞读
    setImmediate(() => {
      try {
        const stmt = db.prepare(
          `UPDATE student_responses SET knowledge_point_cluster_id=?, knowledge_point_id=? WHERE id=?`
        )
        const txn = db.transaction((updates: typeof pendingUpdates) => {
          for (const u of updates) stmt.run(u.clusterId, u.kpId, u.id)
        })
        txn(pendingUpdates)
      } catch (e) {
        // 兜底：写失败不影响读
        // eslint-disable-next-line no-console
        console.warn('[student-response-store] backfill write failed:', (e as Error).message)
      }
    })
  }
  return out
}

export function listCourseResponses(courseId: string): StudentResponse[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM student_responses WHERE course_id = ? ORDER BY submitted_at ASC').all(courseId) as Row[]
  return backfillKpCluster(db, rows.map(rowToResponse))
}

export function listAtomResponses(courseId: string, atomId: string): StudentResponse[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM student_responses WHERE course_id = ? AND atom_id = ? ORDER BY submitted_at ASC').all(courseId, atomId) as Row[]
  return backfillKpCluster(db, rows.map(rowToResponse))
}

/** 别名：保持与上层文档一致的命名（getResponsesByCourse）。 */
export const getResponsesByCourse = listCourseResponses

export interface AtomStats {
  atomId: string
  total: number
  correct: number
  incorrect: number
  unknown: number
  correctRate: number
  avgTimeMs: number | null
  uniqueStudents: number
}

export interface ObjectiveStats {
  objectiveId: string
  totalResponses: number
  correctRate: number
  uniqueStudents: number
}

/** v1.1 PR3: cluster 粒度学情（按 KnowledgePointCluster.id 聚合） */
export interface ClusterStats {
  clusterId: string
  totalResponses: number
  correctRate: number
  n: number
}

/** v1.1 PR3: kp 粒度学情（按 KnowledgePoint.id 聚合，B 阶段诊断用） */
export interface KpStats {
  kpId: string
  totalResponses: number
  correctRate: number
  n: number
}

export interface CourseInsights {
  courseId: string
  totalResponses: number
  uniqueStudents: number
  atomStats: AtomStats[]
  objectiveStats: ObjectiveStats[]
  /** v1.1 PR3: cluster 维度聚合 */
  clusterStats: ClusterStats[]
  /** v1.1 PR3: kp 维度聚合 */
  kpStats: KpStats[]
  /** v1.1 PR3: leafId → clusterIds 反查表，供 delivery-adapter 使用 */
  leafToClusters: Record<string, string[]>
  /** 错误率最高的 5 个 atom (correctRate 升序) */
  worstAtoms: AtomStats[]
  generatedAt: number
}

export function computeCourseInsights(courseId: string): CourseInsights {
  const responses = listCourseResponses(courseId)
  const byAtom = new Map<string, StudentResponse[]>()
  const byObjective = new Map<string, StudentResponse[]>()
  const byCluster = new Map<string, StudentResponse[]>()
  const byKp = new Map<string, StudentResponse[]>()
  const leafToClusters: Record<string, Set<string>> = {}
  const students = new Set<string>()

  for (const r of responses) {
    const arr = byAtom.get(r.atomId) ?? []
    arr.push(r)
    byAtom.set(r.atomId, arr)
    for (const oid of r.objectiveIds) {
      const arr2 = byObjective.get(oid) ?? []
      arr2.push(r)
      byObjective.set(oid, arr2)
    }
    if (r.knowledgePointClusterId) {
      const arr3 = byCluster.get(r.knowledgePointClusterId) ?? []
      arr3.push(r)
      byCluster.set(r.knowledgePointClusterId, arr3)
      if (r.atomSourceLeafId) {
        const set = leafToClusters[r.atomSourceLeafId] ?? new Set<string>()
        set.add(r.knowledgePointClusterId)
        leafToClusters[r.atomSourceLeafId] = set
      }
    }
    if (r.knowledgePointId) {
      const arr4 = byKp.get(r.knowledgePointId) ?? []
      arr4.push(r)
      byKp.set(r.knowledgePointId, arr4)
    }
    students.add(r.studentId)
  }

  const atomStats: AtomStats[] = [...byAtom.entries()].map(([atomId, rs]) => {
    const judged = rs.filter(r => r.correct !== null)
    const correct = judged.filter(r => r.correct === true).length
    const incorrect = judged.filter(r => r.correct === false).length
    const unknown = rs.length - judged.length
    const correctRate = judged.length === 0 ? 0 : correct / judged.length
    const times = rs.map(r => r.timeSpentMs).filter((t): t is number => t !== null)
    const avgTimeMs = times.length === 0 ? null : Math.round(times.reduce((s, x) => s + x, 0) / times.length)
    const uniqueStudents = new Set(rs.map(r => r.studentId)).size
    return { atomId, total: rs.length, correct, incorrect, unknown, correctRate, avgTimeMs, uniqueStudents }
  })

  const objectiveStats: ObjectiveStats[] = [...byObjective.entries()].map(([oid, rs]) => {
    const judged = rs.filter(r => r.correct !== null)
    const correctRate = judged.length === 0 ? 0 : judged.filter(r => r.correct === true).length / judged.length
    return { objectiveId: oid, totalResponses: rs.length, correctRate, uniqueStudents: new Set(rs.map(r => r.studentId)).size }
  })

  const clusterStats: ClusterStats[] = [...byCluster.entries()].map(([clusterId, rs]) => {
    const judged = rs.filter(r => r.correct !== null)
    const correctRate = judged.length === 0 ? 0 : judged.filter(r => r.correct === true).length / judged.length
    return { clusterId, totalResponses: rs.length, correctRate, n: judged.length }
  })

  const kpStats: KpStats[] = [...byKp.entries()].map(([kpId, rs]) => {
    const judged = rs.filter(r => r.correct !== null)
    const correctRate = judged.length === 0 ? 0 : judged.filter(r => r.correct === true).length / judged.length
    return { kpId, totalResponses: rs.length, correctRate, n: judged.length }
  })

  const leafToClustersOut: Record<string, string[]> = {}
  for (const [leaf, set] of Object.entries(leafToClusters)) {
    leafToClustersOut[leaf] = [...set]
  }

  const worstAtoms = [...atomStats]
    .filter(a => a.total - a.unknown >= 1)
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 5)

  return {
    courseId,
    totalResponses: responses.length,
    uniqueStudents: students.size,
    atomStats,
    objectiveStats,
    clusterStats,
    kpStats,
    leafToClusters: leafToClustersOut,
    worstAtoms,
    generatedAt: Date.now(),
  }
}

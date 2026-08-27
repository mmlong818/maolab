/**
 * mastery store — v4 M3(server-only)
 *
 * KP 掌握度落库:concept_mastery 表(conceptId = kpId,profile_id 固定
 * 'default'——单用户档案,多用户化时本层放开该维度)。
 *
 * ⚠️ 走 raw SQL 而非 @maolab/db 的 createConceptMasteryRepository:真库表结构
 * 是 v2 时代 DDL(id + profile_id + concept_id,UNIQUE(profile_id,concept_id)),
 * 与 drizzle schema.ts 已漂移(迁移 journal 只登记到 0003 的已知缺口,见
 * packages/db/src/__tests__/mainline-course.test.ts 注释)。schema 对齐属 db
 * 基础设施债,不在 M3 顺手改。
 *
 * ⚠️ 依赖 DB,禁止从 `@/lib/mainline` barrel 导出(同 store.ts)。
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { ensureStudentResponsesTable } from '../v2/student-response-store.js'
import { openSqliteRaw } from '@maolab/db'
import {
  normalizePracticeEvidenceText,
  PRACTICE_SELF_ASSESSMENT_BASIS,
  masteryCanGuideLowRiskAdaptation,
  practiceCalibration,
  practiceFollowUp,
  practiceReflectionQualityReason,
  reviewScheduleFor,
  updatedMasteryScore,
  type PracticeConfidence,
  type MasteryEvidenceStatus,
  type MasteryRecord,
  type PracticeEvidenceSnapshot,
  type PracticeFollowUp,
  type PracticeObjectiveCriterion,
  type PracticeOutcome,
} from './mastery.js'
import { seededKpIds, seededKpIdsAll } from './rehearsal/seed-mastery.js'

const PROFILE_ID = 'default'

let _db: ReturnType<typeof openSqliteRaw> | null = null

function databasePath(): string {
  return (process.env.DATABASE_URL ?? 'file:./data/maolab.db').replace(/^file:/, '')
}

function seedLedgerPath(): string {
  return process.env.SEED_LEDGER_PATH ?? join(databasePath(), '..', 'seed-mastery-ledger.json')
}

function getDb() {
  if (_db) return _db
  _db = openSqliteRaw(databasePath())
  // student_responses 的 DDL 历史上只活在 v2/student-response-store 的懒引导里,
  // 走本模块的 fresh 库(pnpm db:init 不建该表)首次正式练习会 no such table 直接 500
  // (2026-08-26 code-review CONFIRMED)。这里同源引导一次,幂等。
  ensureStudentResponsesTable(_db)
  return _db
}

/** 测试专用：用内存库验证 student_responses 与 mastery 的同事务写入。 */
export function __setMasteryDbForTest(db: ReturnType<typeof openSqliteRaw> | null): void {
  _db = db
}

interface MasteryRow {
  kpId: string
  score: number
  lastReviewedAt: number
}

interface MasteryResponseRow {
  kpId: string
  response: string
  correct: number | null
  submittedAt: number
}

function parseResponsePayload(response: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(response) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function storedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : undefined
}

function parseObjectiveCriteria(value: unknown): PracticeObjectiveCriterion[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return undefined
  const criteria: PracticeObjectiveCriterion[] = []
  const objectiveIds = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined
    const record = item as Record<string, unknown>
    const objectiveId = storedText(record.objectiveId, 200)
    const successSignal = storedText(record.successSignal, 1_000)
    const alignment = record.alignment
    if (
      !objectiveId
      || !successSignal
      || (alignment !== 'kp-specific' && alignment !== 'course-level-legacy')
      || objectiveIds.has(objectiveId)
    ) return undefined
    objectiveIds.add(objectiveId)
    criteria.push({ objectiveId, successSignal, alignment })
  }
  return criteria
}

/**
 * 只解析本产品当前能证明完整性的练习证据。分类可以兼容旧记录，但教师侧详情
 * 必须 fail-closed：缺题面、反馈、成功标准或校准关系不一致时一律不展示。
 */
function parsePracticeEvidence(
  payload: Record<string, unknown> | undefined,
  submittedAt: number,
): PracticeEvidenceSnapshot | undefined {
  if (!payload || payload.evidenceBasis !== PRACTICE_SELF_ASSESSMENT_BASIS || payload.selfReported !== true) {
    return undefined
  }
  const outcome = payload.outcome
  const confidence = payload.confidence
  const scoreStatus = payload.scoreStatus
  if (
    (outcome !== 'correct' && outcome !== 'incorrect')
    || (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high')
    || (scoreStatus !== 'provisional' && scoreStatus !== 'verified')
    || payload.calibration !== practiceCalibration(outcome, confidence).kind
  ) return undefined

  const snapshot = payload.practiceSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined
  const snapshotRecord = snapshot as Record<string, unknown>
  const task = storedText(snapshotRecord.task, 4_000)
  const feedback = storedText(snapshotRecord.feedback, 4_000)
  const attemptText = normalizePracticeEvidenceText(payload.attemptText) ?? undefined
  const reflectionText = normalizePracticeEvidenceText(payload.reflectionText) ?? undefined
  const objectiveCriteria = parseObjectiveCriteria(payload.objectiveCriteria)
  if (
    !task
    || !feedback
    || !attemptText
    || !reflectionText
    || !objectiveCriteria
    || practiceReflectionQualityReason(outcome, reflectionText)
  ) return undefined

  return {
    submittedAt,
    outcome,
    confidence,
    calibration: practiceCalibration(outcome, confidence).kind,
    evidenceBasis: PRACTICE_SELF_ASSESSMENT_BASIS,
    scoreStatus,
    practiceSnapshot: { task, feedback },
    objectiveCriteria,
    attemptText,
    reflectionText,
  }
}

function classifyMasteryEvidence(
  row: MasteryRow,
  seeded: ReadonlySet<string>,
  response: MasteryResponseRow | undefined,
  payload: Record<string, unknown> | undefined,
): MasteryEvidenceStatus {
  if (seeded.has(row.kpId)) return 'seeded-demo'
  if (!response || response.submittedAt !== row.lastReviewedAt) return 'legacy-unattributed'
  if (!payload) return 'legacy-unattributed'
  if (
    payload.evidenceBasis === PRACTICE_SELF_ASSESSMENT_BASIS
    || payload.scoreStatus === 'provisional'
    || payload.selfReported === true
  ) return 'provisional-self-assessment'
  if (payload.scoreStatus === 'verified' || response.correct === 0 || response.correct === 1) return 'verified'
  return 'legacy-unattributed'
}

/**
 * 批量读取分数和证据来源。分数事件必须与 student_responses 的提交时间完全一致，
 * 否则无法证明这条作答产生了当前分数，只能标为历史来源不明。
 */
export async function masteryRecordsOf(
  kpIds: readonly string[],
  ledgerPath = seedLedgerPath(),
): Promise<Map<string, MasteryRecord>> {
  const ids = [...new Set(kpIds.map(id => id.trim()).filter(Boolean))]
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(', ')
  const db = getDb()
  const rows = db.prepare(`SELECT concept_id AS kpId, score, last_reviewed_at AS lastReviewedAt
    FROM concept_mastery WHERE profile_id = ? AND concept_id IN (${placeholders})`)
    .all(PROFILE_ID, ...ids) as MasteryRow[]
  if (rows.length === 0) return new Map()

  const responses = db.prepare(`SELECT knowledge_point_id AS kpId, response, correct,
      submitted_at AS submittedAt
    FROM student_responses
    WHERE student_id = ? AND knowledge_point_id IN (${placeholders})
    ORDER BY submitted_at DESC`)
    .all('self', ...ids) as MasteryResponseRow[]
  const rowByKp = new Map(rows.map(row => [row.kpId, row]))
  const matchingResponse = new Map<string, MasteryResponseRow>()
  for (const response of responses) {
    const mastery = rowByKp.get(response.kpId)
    if (mastery?.lastReviewedAt === response.submittedAt && !matchingResponse.has(response.kpId)) {
      matchingResponse.set(response.kpId, response)
    }
  }
  const seeded = seededKpIdsAll(db, ledgerPath)
  return new Map(rows.map(row => {
    const response = matchingResponse.get(row.kpId)
    const payload = response ? parseResponsePayload(response.response) : undefined
    const latestEvidence = response ? parsePracticeEvidence(payload, response.submittedAt) : undefined
    return [row.kpId, {
      ...row,
      evidenceStatus: classifyMasteryEvidence(row, seeded, response, payload),
      ...(latestEvidence ? { latestEvidence } : {}),
    }]
  }))
}

export async function masteryRecordOf(kpId: string, ledgerPath = seedLedgerPath()): Promise<MasteryRecord | undefined> {
  return (await masteryRecordsOf([kpId], ledgerPath)).get(kpId)
}

/**
 * 返回仍由排练种子提供掌握度的知识点。页面必须据此把它标成演示数据，
 * 不能把教材误区推导的分数包装成学生真实作答。
 */
export async function seededMasteryKpIds(courseId: string, ledgerPath = seedLedgerPath()): Promise<Set<string>> {
  return seededKpIds(getDb(), ledgerPath, courseId)
}

export interface PracticeAttemptInput {
  courseId: string
  sessionId: string
  sceneId: string
  kpId: string
  practiceSnapshot: {
    task: string
    feedback: string
  }
  objectiveCriteria: PracticeObjectiveCriterion[]
  outcome: PracticeOutcome
  confidence: PracticeConfidence
  attemptText: string
  reflectionText: string
}

export interface PracticeAttemptResult {
  score: number
  calibration: ReturnType<typeof practiceCalibration>
  followUp: PracticeFollowUp
  evidenceBasis: typeof PRACTICE_SELF_ASSESSMENT_BASIS
  scoreStatus: 'provisional'
}

export interface PracticeSceneSnapshot {
  sceneId: string
  task: string
  feedback: string
}

interface StoredPracticeResponseRow {
  sceneId: string
  response: string
}

/**
 * 刷新课堂后，正式练习完成状态只能从已经落库且仍与当前题目版本一致的证据恢复。
 * 返回幕编号而不返回学生答案，避免为了恢复导航把作答文本重新暴露给浏览器。
 */
export async function savedPracticeSceneIds(
  courseId: string,
  sessionId: string,
  scenes: readonly PracticeSceneSnapshot[],
): Promise<string[]> {
  const normalizedCourseId = courseId.trim()
  const normalizedSessionId = sessionId.trim()
  if (!normalizedCourseId || !normalizedSessionId || scenes.length === 0) return []
  const sceneById = new Map(scenes.map(scene => [scene.sceneId, {
    task: scene.task.trim(),
    feedback: scene.feedback.trim(),
  }]))
  const rows = getDb().prepare(`SELECT atom_id AS sceneId, response
    FROM student_responses
    WHERE course_id = ? AND atom_type = 'mainline-practice'
    ORDER BY submitted_at DESC`).all(normalizedCourseId) as StoredPracticeResponseRow[]
  const saved = new Set<string>()
  for (const row of rows) {
    if (saved.has(row.sceneId)) continue
    const current = sceneById.get(row.sceneId)
    if (!current?.task || !current.feedback) continue
    const payload = parseResponsePayload(row.response)
    if (!payload || payload.evidenceBasis !== PRACTICE_SELF_ASSESSMENT_BASIS) continue
    if (payload.sessionId !== normalizedSessionId) continue
    if (payload.scoreStatus !== 'provisional' || payload.selfReported !== true) continue
    if (payload.verifiedCorrect !== null) continue
    const outcome = payload.outcome
    const reflectionText = normalizePracticeEvidenceText(payload.reflectionText)
    if (
      (outcome !== 'correct' && outcome !== 'incorrect')
      || !normalizePracticeEvidenceText(payload.attemptText)
      || !reflectionText
      || practiceReflectionQualityReason(outcome, reflectionText)
    ) continue
    const snapshot = payload.practiceSnapshot
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) continue
    const storedSnapshot = snapshot as Record<string, unknown>
    if (storedSnapshot.task !== current.task || storedSnapshot.feedback !== current.feedback) continue
    saved.add(row.sceneId)
  }
  return scenes.map(scene => scene.sceneId).filter(sceneId => saved.has(sceneId))
}

export interface KpMistakeEvidence {
  kpId: string
  /** 当次题目快照(服务端确认版本),供复习课生成变式时对照,不得原题复用。 */
  task: string
  /** 学生揭晓前原答。 */
  attemptText: string
  /** 揭晓后的错因订正。 */
  reflectionText: string
  /** 揭晓前把握度:high+incorrect=高把握误答,复习课优先修正其错误规则。 */
  confidence: string
  submittedAt: number
}

/**
 * 各 KP 最近的误答证据(每 KP 至多 limit 条)。只认自评链完整的正式练习记录
 * (evidenceBasis=self-assessed-after-feedback 且 outcome=incorrect)——契约允许
 * 暂定自评驱动低风险加练,复习课练习设计属于此类;演示种子与来源不明分数
 * 没有作答证据,天然不会出现在这里。供复习课生成注入,让变式直击真实错因。
 */
export async function recentMistakesForKps(kpIds: readonly string[], limit = 2): Promise<KpMistakeEvidence[]> {
  const wanted = new Set(kpIds.map(id => id.trim()).filter(Boolean))
  if (wanted.size === 0) return []
  const rows = getDb().prepare(`SELECT knowledge_point_id AS kpId, response, submitted_at AS submittedAt
    FROM student_responses
    WHERE atom_type = 'mainline-practice' AND knowledge_point_id IS NOT NULL
    ORDER BY submitted_at DESC`).all() as { kpId: string; response: string; submittedAt: number }[]
  const perKp = new Map<string, number>()
  const out: KpMistakeEvidence[] = []
  for (const row of rows) {
    if (!wanted.has(row.kpId)) continue
    if ((perKp.get(row.kpId) ?? 0) >= limit) continue
    const payload = parseResponsePayload(row.response)
    if (!payload || payload.evidenceBasis !== PRACTICE_SELF_ASSESSMENT_BASIS || payload.selfReported !== true) continue
    if (payload.outcome !== 'incorrect') continue
    const attemptText = normalizePracticeEvidenceText(payload.attemptText)
    const reflectionText = normalizePracticeEvidenceText(payload.reflectionText)
    const snapshot = payload.practiceSnapshot
    const task = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? String((snapshot as Record<string, unknown>).task ?? '').trim()
      : ''
    if (!attemptText || !reflectionText || !task) continue
    perKp.set(row.kpId, (perKp.get(row.kpId) ?? 0) + 1)
    out.push({
      kpId: row.kpId,
      task,
      attemptText,
      reflectionText,
      confidence: String(payload.confidence ?? ''),
      submittedAt: row.submittedAt,
    })
  }
  return out
}

/**
 * 把作答证据与暂定掌握度更新放在同一 SQLite 事务中：二者要么一起成功，要么一起失败。
 * response JSON 保留揭晓前把握度、服务端题目/反馈/成功标准快照和自评来源。因为结果
 * 来自学生看过反馈后的自行核对，student_responses.correct 必须保持 null，不能冒充客观判分。
 */
export async function recordPracticeAttempt(input: PracticeAttemptInput): Promise<PracticeAttemptResult> {
  const sessionId = input.sessionId.trim()
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(sessionId)) {
    throw new Error('practice attempt requires a valid classroom session id')
  }
  const attemptText = normalizePracticeEvidenceText(input.attemptText)
  const reflectionText = normalizePracticeEvidenceText(input.reflectionText)
  if (!attemptText || !reflectionText) {
    throw new Error('practice attempt requires non-empty attempt and reflection evidence')
  }
  if (practiceReflectionQualityReason(input.outcome, reflectionText)) {
    throw new Error('practice attempt requires specific reflection evidence')
  }
  const practiceSnapshot = {
    task: input.practiceSnapshot.task.trim(),
    feedback: input.practiceSnapshot.feedback.trim(),
  }
  if (!practiceSnapshot.task || !practiceSnapshot.feedback) {
    throw new Error('practice attempt requires a complete task and feedback snapshot')
  }
  const objectiveCriteria = input.objectiveCriteria.map(criterion => ({
    objectiveId: criterion.objectiveId.trim(),
    successSignal: criterion.successSignal.trim(),
    alignment: criterion.alignment,
  }))
  const uniqueObjectiveIds = new Set(objectiveCriteria.map(criterion => criterion.objectiveId))
  if (
    objectiveCriteria.length === 0
    || objectiveCriteria.some(criterion => !criterion.objectiveId || !criterion.successSignal)
    || objectiveCriteria.some(criterion => criterion.alignment !== 'kp-specific' && criterion.alignment !== 'course-level-legacy')
    || uniqueObjectiveIds.size !== objectiveCriteria.length
  ) {
    throw new Error('practice attempt requires unique aligned objectives with success criteria')
  }
  const followUp = practiceFollowUp(
    input.outcome,
    input.confidence,
    reflectionText,
    objectiveCriteria,
  )
  const db = getDb()
  const transaction = db.transaction(() => {
    const prevRow = db
      .prepare('SELECT score FROM concept_mastery WHERE profile_id = ? AND concept_id = ?')
      .get(PROFILE_ID, input.kpId) as { score: number } | undefined
    const calibration = practiceCalibration(input.outcome, input.confidence)
    const score = updatedMasteryScore(prevRow?.score, input.outcome, input.confidence)
    const now = Date.now()

    db.prepare(`INSERT INTO student_responses
      (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct,
        time_spent_ms, difficulty_level, submitted_at, knowledge_point_cluster_id,
        knowledge_point_id, atom_source_leaf_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        `sr-${randomUUID()}`,
        input.courseId,
        input.sceneId,
        'self',
        JSON.stringify(objectiveCriteria.map(criterion => criterion.objectiveId)),
        'mainline-practice',
        JSON.stringify({
          sessionId,
          outcome: input.outcome,
          confidence: input.confidence,
          calibration: calibration.kind,
          selfReported: true,
          evidenceBasis: PRACTICE_SELF_ASSESSMENT_BASIS,
          scoreStatus: 'provisional',
          verifiedCorrect: null,
          practiceSnapshot,
          objectiveCriteria,
          attemptText,
          reflectionText,
          followUp,
        }),
        null,
        null,
        'standard',
        now,
        null,
        input.kpId,
        null,
      )

    db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, concept_id) DO UPDATE SET score = excluded.score, last_reviewed_at = excluded.last_reviewed_at`)
      .run(randomUUID(), PROFILE_ID, input.kpId, score, now)

    return {
      score,
      calibration,
      followUp,
      evidenceBasis: PRACTICE_SELF_ASSESSMENT_BASIS,
      scoreStatus: 'provisional' as const,
    }
  })
  return transaction() as PracticeAttemptResult
}

export interface WeakKp {
  kpId: string
  score: number
  canonicalName: string
  lastReviewedAt: number
  reviewIntervalDays: number
  reviewDueAt: number
  reviewDue: boolean
  daysUntilReview: number
  overdueDays: number
  evidenceStatus: MasteryEvidenceStatus
}

/** 薄弱 KP 清单及其到期时间；课程库只把已到期项送入复习课。 */
export async function listWeakKps(threshold = 0.6, now = Date.now()): Promise<WeakKp[]> {
  const rows = getDb()
    .prepare(`SELECT m.concept_id AS kpId, m.score, m.last_reviewed_at AS lastReviewedAt,
        k.canonical_name AS canonicalName
      FROM concept_mastery m JOIN knowledge_points k ON k.id = m.concept_id
      WHERE m.profile_id = ? AND m.score < ?
      ORDER BY m.score ASC, m.last_reviewed_at ASC`)
    .all(PROFILE_ID, threshold) as Array<Pick<WeakKp, 'kpId' | 'score' | 'canonicalName' | 'lastReviewedAt'>>
  const records = await masteryRecordsOf(rows.map(row => row.kpId))
  return rows.map(row => {
    const schedule = reviewScheduleFor(row.score, row.lastReviewedAt, now)
    return {
      ...row,
      reviewIntervalDays: schedule.intervalDays,
      reviewDueAt: schedule.dueAt,
      reviewDue: schedule.due,
      daysUntilReview: schedule.daysUntilDue,
      overdueDays: schedule.overdueDays,
      evidenceStatus: records.get(row.kpId)?.evidenceStatus ?? 'legacy-unattributed',
    }
  })
}

/** 自动加练只消费可信或明确暂定的证据，禁止演示种子和无来源历史分数静默参与。 */
export function masteryRecordCanGuideAdaptation(record: MasteryRecord | undefined): record is MasteryRecord {
  return Boolean(record && masteryCanGuideLowRiskAdaptation(record.evidenceStatus))
}

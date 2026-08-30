/**
 * POST /api/v2/mainline/from-kps · P2 生成入口(compile-lesson,不烧 LLM)
 *
 * 接受用户勾选的 KP,查库拿元数据,选卡司预设,编译出空骨架 MainlineCourse 落库。
 * 返回 courseId,前端跳转到 /mainline/[courseId] 即可看到骨架播放。
 * 内容质量待 fill-scenes(下一片,烧 LLM)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { z } from 'zod'
import { openSqliteRaw } from '@maolab/db'
import type { GradeBand, SubjectId } from '../../../../lib/mainline/domain.js'
import { pickCastPreset } from '../../../../lib/mainline/generation/cast-preset.js'
import { compileLessonFromKps } from '../../../../lib/mainline/generation/compile-lesson.js'
import { resolveCourseGroundings, type KpGroundingSourceRow } from '../../../../lib/mainline/generation/course-grounding.js'
import { parseKpDimensions } from '../../../../lib/mainline/generation/kp-dimensions.js'
import { saveMainlineCourse } from '../../../../lib/mainline/store.js'
import { nextEpisodeNo } from '../../../../lib/mainline/season.js'
import { findSeason } from '../../../../lib/mainline/season-store.js'
import { isWeakMastery } from '../../../../lib/mainline/mastery.js'
import { masteryRecordCanGuideAdaptation, masteryRecordsOf } from '../../../../lib/mainline/mastery-store.js'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  kpIds: z.array(z.string().min(1)).min(1).max(6),
  /** v4 M2:传入则本课成为该季下一集(学科/学段必须与季一致) */
  seasonId: z.string().min(1).optional(),
  /** 学习时期:同时决定开场学习动作、内容生成约束与表现密度;缺省新授。 */
  lessonPhase: z.enum(['new', 'review', 'exam-prep']).optional(),
})

interface KpRow {
  id: string
  canonical_name: string
  subject: string
  grade_band: string | null
  annotations: string | null
}

let _db: ReturnType<typeof openSqliteRaw> | null = null
function getDb() {
  if (_db) return _db
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _db = openSqliteRaw(path.isAbsolute(url.replace(/^file:/, '')) ? url.replace(/^file:/, '') : url.replace(/^file:/, ''))
  return _db
}

const SUBJECT_MAP: Record<string, SubjectId> = {
  chinese: 'chinese', 语文: 'chinese',
  math: 'math', 数学: 'math',
  physics: 'physics', 物理: 'physics',
  chemistry: 'chemistry', 化学: 'chemistry',
  biology: 'biology', 生物: 'biology',
  english: 'english', 英语: 'english',
  history: 'history', 历史: 'history',
  politics: 'politics', 思政: 'politics', 道德与法治: 'politics',
  geography: 'geography', 地理: 'geography',
  science: 'science', 科学: 'science',
}

const GRADE_MAP: Record<string, GradeBand> = {
  小学: 'upper-primary', 初中: 'middle-school', 高中: 'high-school',
  'lower-primary': 'lower-primary', 'upper-primary': 'upper-primary',
  'middle-school': 'middle-school', 'high-school': 'high-school',
}

function pickMode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof RequestSchema>
  try { body = RequestSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  const db = getDb()
  const placeholders = body.kpIds.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id, canonical_name, subject, grade_band, annotations FROM knowledge_points WHERE id IN (${placeholders})`)
    .all(...body.kpIds) as KpRow[]
  const foundIds = new Set(rows.map(r => r.id))
  const missing = body.kpIds.filter(id => !foundIds.has(id))
  if (missing.length > 0) {
    return NextResponse.json({ error: 'unknown knowledge point id(s)', missing }, { status: 400 })
  }

  const byId = new Map(rows.map(r => [r.id, r]))
  const ordered = body.kpIds.map(id => byId.get(id)!)
  const sourceRows = db.prepare(`
    SELECT
      knowledge_point_id AS knowledgePointId,
      source,
      external_id AS externalId,
      evidence_snippet AS evidenceSnippet,
      confidence
    FROM knowledge_point_sources
    WHERE knowledge_point_id IN (${placeholders})
  `).all(...body.kpIds) as KpGroundingSourceRow[]

  const subjectValues = ordered.map(r => SUBJECT_MAP[r.subject]).filter((s): s is SubjectId => Boolean(s))
  const gradeValues = ordered.map(r => (r.grade_band ? GRADE_MAP[r.grade_band] : undefined)).filter((g): g is GradeBand => Boolean(g))
  const subject: SubjectId = pickMode(subjectValues) ?? 'general'
  const gradeBand: GradeBand = pickMode(gradeValues) ?? 'middle-school'

  const { preset, matched } = pickCastPreset({ gradeBand, subject })

  // v4 M2:季归属——学科/学段必须与季一致(同季同卡司同气质是圣经层的底线)
  let seasonRef: { seasonId: string; episodeNo: number } | undefined
  if (body.seasonId) {
    const season = await findSeason(body.seasonId)
    if (!season) return NextResponse.json({ error: 'unknown season id' }, { status: 400 })
    if (season.subject !== subject || season.gradeBand !== gradeBand) {
      return NextResponse.json({
        error: `season mismatch: season is ${season.subject}/${season.gradeBand}, KPs resolve to ${subject}/${gradeBand}`,
      }, { status: 400 })
    }
    seasonRef = { seasonId: season.id, episodeNo: nextEpisodeNo(season) }
  }

  // v4 M3 学情加权:已验证结果或明确标为暂定自评的薄弱 KP 才加固。
  // 演示种子和来源不明的历史分数不能静默改变正式课程结构。
  const reinforcedKpIds: string[] = []
  const masteryRecords = await masteryRecordsOf(ordered.map(row => row.id))
  const kpsWithMastery = ordered.map(r => {
    const record = masteryRecords.get(r.id)
    const weak = masteryRecordCanGuideAdaptation(record) && isWeakMastery(record.score)
    if (weak) reinforcedKpIds.push(r.id)
    return {
      id: r.id,
      canonicalName: r.canonical_name,
      ...parseKpDimensions(r.annotations),
      ...(weak ? { needsReinforcement: true } : {}),
    }
  })
  const grounding = await resolveCourseGroundings(
    ordered.map(row => ({ id: row.id, canonicalName: row.canonical_name })),
    sourceRows,
  )

  const compiled = compileLessonFromKps({
    kps: kpsWithMastery,
    gradeBand,
    subject,
    preset,
    groundingByKp: grounding.byKp,
    ...(body.lessonPhase ? { lessonPhase: body.lessonPhase } : {}),
  })
  const course = {
    ...compiled,
    revision: { familyId: compiled.id, revisionNo: 1 },
    ...(seasonRef ? { season: seasonRef } : {}),
  }

  await saveMainlineCourse(course)

  return NextResponse.json({
    courseId: course.id,
    topic: course.topic,
    subject,
    gradeBand,
    presetMatched: matched,
    ...(seasonRef ? { season: seasonRef } : {}),
    ...(reinforcedKpIds.length > 0 ? { reinforcedKpIds } : {}),
    qualityStatus: course.qualityStatus,
    planRevisionId: course.planning?.planRevisionId,
    planStatus: course.planning?.status,
    plannedPages: course.planning?.pages.length,
    scenes: course.scenes.length,
    beats: course.beats.length,
    sourceCoverage: grounding.coverage,
  })
}

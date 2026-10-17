/**
 * 从知识点建课（3a，搬自 maolab app/app/api/v2/mainline/from-kps/route.ts，不烧模型）。
 * 与原路由的差异：知识点经端口取（K12）；学情加固不迁（spec 1.2、9.3），needsReinforcement 一律不设、结果里没有 reinforcedKpIds；
 * 资源包缺省不可用；错误改为 CourseServiceError（文案沿用原路由）。
 * 学段（Ruling [T7]）：GRADE_MAP 补齐仓库已在用的写法（packages/domain/src/knowledge.ts 的 middle、初中阶段与 normalizedGrade 的年级写法）；
 * 没有一个知识点能映射时仍退回初中，但结果带 gradeBandAssumed: true；无法映射的原始值只记日志（只记值，不记知识点名等内容）。
 */
import { z } from 'zod'
import type { GradeBand, MainlineCourse, SubjectId } from '../mainline/domain.js'
import { pickCastPreset } from '../mainline/generation/cast-preset.js'
import { compileLessonFromKps } from '../mainline/generation/compile-lesson.js'
import { resolveCourseGroundings, type CourseGroundingCoverage } from '../mainline/generation/course-grounding.js'
import { parseKpDimensions } from '../mainline/generation/kp-dimensions.js'
import { nextEpisodeNo } from '../mainline/season.js'
import { CourseServiceError, resourceBundleLoader, type CourseServiceDeps } from './errors.js'

export const CreateCourseFromKpsSchema = z.object({
  kpIds: z.array(z.string().min(1)).min(1).max(6),
  /** v4 M2:传入则本课成为该季下一集(学科/学段必须与季一致) */
  seasonId: z.string().min(1).optional(),
  /** 学习时期:同时决定开场学习动作、内容生成约束与表现密度;缺省新授。 */
  lessonPhase: z.enum(['new', 'review', 'exam-prep']).optional(),
})

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

/** 只认映射表自己的键：constructor、toString 等原型上的名字不算有效写法（3a 终审） */
function ownValue<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

const GRADE_MAP: Record<string, GradeBand> = {
  小学: 'upper-primary', 初中: 'middle-school', 高中: 'high-school',
  'lower-primary': 'lower-primary', 'upper-primary': 'upper-primary',
  'middle-school': 'middle-school', 'high-school': 'high-school',
  // 仓库已在用的写法（packages/domain/src/knowledge.ts：grade_band IN ('middle', '初中', '初中阶段', '') 与 normalizedGrade）
  middle: 'middle-school', 初中阶段: 'middle-school',
  初一: 'middle-school', 初二: 'middle-school', 初三: 'middle-school',
  七年级: 'middle-school', 八年级: 'middle-school', 九年级: 'middle-school',
}

function pickMode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export interface CreateCourseFromKpsResult {
  courseId: string
  topic: string
  subject: SubjectId
  gradeBand: GradeBand
  /** 没有一个知识点的学段能映射、gradeBand 是退回的初中时为 true（Ruling [T7]，maolab 原路由静默退回） */
  gradeBandAssumed?: true
  presetMatched: 'exact' | 'grade-only' | 'grade-family' | 'default'
  season?: { seasonId: string; episodeNo: number }
  qualityStatus: MainlineCourse['qualityStatus']
  planRevisionId?: string
  planStatus?: string
  plannedPages?: number
  scenes: number
  beats: number
  sourceCoverage: CourseGroundingCoverage
}

export async function createCourseFromKps(input: unknown, deps: CourseServiceDeps): Promise<CreateCourseFromKpsResult> {
  const parsed = CreateCourseFromKpsSchema.safeParse(input)
  if (!parsed.success) throw new CourseServiceError('INVALID_INPUT', `Invalid request body: ${String(parsed.error)}`)
  const body = parsed.data

  const rows = await deps.knowledge.knowledgePoints(body.kpIds)
  const foundIds = new Set(rows.map(r => r.id))
  const missing = body.kpIds.filter(id => !foundIds.has(id))
  if (missing.length > 0) throw new CourseServiceError('UNKNOWN_KP', 'unknown knowledge point id(s)', { missing })

  const byId = new Map(rows.map(r => [r.id, r]))
  const ordered = body.kpIds.map(id => byId.get(id)!)
  const sourceRows = await deps.knowledge.knowledgePointSources(body.kpIds)

  const subjectValues = ordered.map(r => ownValue(SUBJECT_MAP, r.subject)).filter((s): s is SubjectId => Boolean(s))
  const gradeValues = ordered.map(r => (r.grade_band ? ownValue(GRADE_MAP, r.grade_band.trim()) : undefined)).filter((g): g is GradeBand => Boolean(g))
  const subject: SubjectId = pickMode(subjectValues) ?? 'general'
  const mappedGrade = pickMode(gradeValues)
  const gradeBand: GradeBand = mappedGrade ?? 'middle-school'
  const gradeBandAssumed = mappedGrade === undefined
  const unmappedGrades = [...new Set(ordered.map(r => r.grade_band ?? '').filter(g => !ownValue(GRADE_MAP, g.trim())))]
  if (unmappedGrades.length > 0) {
    // 只记原始学段值（库里的元数据），不记知识点名或用户输入
    console.warn(`[course] unmapped grade_band values ${JSON.stringify(unmappedGrades)}${gradeBandAssumed ? '; assuming middle-school' : ''}`)
  }

  const { preset, matched } = pickCastPreset({ gradeBand, subject })

  let seasonRef: { seasonId: string; episodeNo: number } | undefined
  if (body.seasonId) {
    const season = await deps.store.findSeason(body.seasonId)
    if (!season) throw new CourseServiceError('UNKNOWN_SEASON', 'unknown season id')
    if (season.subject !== subject || season.gradeBand !== gradeBand) {
      throw new CourseServiceError('SEASON_MISMATCH', `season mismatch: season is ${season.subject}/${season.gradeBand}, KPs resolve to ${subject}/${gradeBand}`)
    }
    seasonRef = { seasonId: season.id, episodeNo: nextEpisodeNo(season) }
  }

  const kps = ordered.map(r => ({ id: r.id, canonicalName: r.canonical_name, ...parseKpDimensions(r.annotations) }))
  const grounding = await resolveCourseGroundings(
    ordered.map(row => ({ id: row.id, canonicalName: row.canonical_name })),
    sourceRows,
    { loadBundle: resourceBundleLoader(deps) },
  )

  const compiled = compileLessonFromKps({
    kps,
    gradeBand,
    subject,
    preset,
    groundingByKp: grounding.byKp,
    ...(body.lessonPhase ? { lessonPhase: body.lessonPhase } : {}),
    ...(deps.newId ? { courseId: deps.newId() } : {}),
  })
  const course: MainlineCourse = {
    ...compiled,
    revision: { familyId: compiled.id, revisionNo: 1 },
    ...(seasonRef ? { season: seasonRef } : {}),
  }

  await deps.store.saveMainlineCourse(course)

  return {
    courseId: course.id,
    topic: course.topic,
    subject,
    gradeBand,
    ...(gradeBandAssumed ? { gradeBandAssumed: true as const } : {}),
    presetMatched: matched,
    ...(seasonRef ? { season: seasonRef } : {}),
    qualityStatus: course.qualityStatus,
    ...(course.planning ? { planRevisionId: course.planning.planRevisionId, planStatus: course.planning.status, plannedPages: course.planning.pages.length } : {}),
    scenes: course.scenes.length,
    beats: course.beats.length,
    sourceCoverage: grounding.coverage,
  }
}

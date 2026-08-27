/**
 * POST /api/v2/mainline/refresh-practices/[courseId]
 *
 * 教师显式触发的目标检核修复。已有问题练习只重写命中页；逐知识点目标下完全
 * 缺少独立练习的片段先补一张标准练习骨架。全部生成和事实核查结束后才保存一次。
 */
import { type NextRequest, NextResponse } from 'next/server'
import {
  PracticeRefreshIncompleteError,
  PracticeRefreshStructureError,
  practiceRepairPlan,
  refreshProblemPractices,
} from '../../../../../lib/mainline/edit/practice-refresh.js'
import {
  PracticeGenerationQualityError,
  SceneGenerationQualityError,
} from '../../../../../lib/mainline/generation/fill-scenes.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { seasonInjectionFor } from '../../../../../lib/mainline/season.js'
import { findSeason } from '../../../../../lib/mainline/season-store.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const plan = practiceRepairPlan(course)
  if (plan.total === 0) {
    return NextResponse.json({ error: '当前课程没有需要补齐或重写的目标检核。' }, { status: 409 })
  }

  try {
    const season = course.season ? await findSeason(course.season.seasonId) : undefined
    const injection = season && course.season
      ? seasonInjectionFor(season, course.season.episodeNo)
      : undefined
    const result = await refreshProblemPractices(course, injection ? { season: injection } : undefined)

    const latestCourse = await findMainlineCourse(courseId)
    if (!latestCourse || JSON.stringify(latestCourse) !== JSON.stringify(course)) {
      return NextResponse.json({
        error: '重写期间课程已被修改，整批未保存。请刷新备课页后重试。',
        code: 'COURSE_CHANGED_DURING_REFRESH',
        retryable: true,
      }, { status: 409 })
    }

    await saveMainlineCourse(result.course)
    return NextResponse.json({
      ok: true,
      courseId,
      regeneratedSceneIds: result.regeneratedSceneIds,
      insertedSceneIds: result.insertedSceneIds,
      qualityStatus: result.course.qualityStatus,
      summary: summarizeQuality(result.issues),
      factAudit: {
        auditedScenes: result.course.factAudit?.auditedSceneCount ?? 0,
        fatal: result.course.factAudit?.fatalCount ?? 0,
      },
    })
  } catch (error) {
    if (error instanceof SceneGenerationQualityError) {
      const sceneNo = course.scenes.findIndex(scene => scene.id === error.sceneId) + 1
      const sceneLabel = sceneNo > 0 ? `第 ${sceneNo} 页` : '新增练习页'
      return NextResponse.json({
        error: `${sceneLabel}${error instanceof PracticeGenerationQualityError ? '练习内容' : '页面内容'}连续 ${error.attempts} 次未通过质量检查，整批未保存。`,
        code: error.code,
        retryable: true,
        sceneId: error.sceneId,
        sceneNo: sceneNo > 0 ? sceneNo : null,
        reasons: error.reasons,
      }, { status: 422 })
    }
    if (error instanceof PracticeRefreshIncompleteError) {
      return NextResponse.json({
        error: '仍有练习未通过质量检查，整批未保存。',
        code: error.code,
        retryable: true,
        targetIds: error.sceneIds,
      }, { status: 422 })
    }
    if (error instanceof PracticeRefreshStructureError) {
      return NextResponse.json({
        error: `${error.message} 整批未保存。`,
        code: error.code,
        retryable: false,
      }, { status: 409 })
    }
    return NextResponse.json({ error: `target assessment repair failed: ${String(error)}` }, { status: 500 })
  }
}

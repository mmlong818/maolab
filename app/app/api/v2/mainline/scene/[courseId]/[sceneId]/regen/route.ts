/**
 * POST /api/v2/mainline/scene/[courseId]/[sceneId]/regen · v5 M1 单页重生成
 *
 * 只对一个 scene 重新走 fill(不动其余幕),注入前后幕摘要保证跨幕一致性
 * (lib/mainline/generation/fill-scenes.ts 的 fillSceneInContext)。生成后跑
 * 确定性闸门 + 本幕 fact-audit,FATAL 语义保持(不放行,qualityStatus=blocked)。
 * 与整课 fill 同款季上下文注入(开场承接/结尾钩子),保持季课的连续性不因单页
 * regen 而漂移。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../../lib/mainline/store.js'
import { regenerateScene } from '../../../../../../../lib/mainline/edit/scene-regen.js'
import { PracticeGenerationQualityError, SceneGenerationQualityError } from '../../../../../../../lib/mainline/generation/fill-scenes.js'
import { summarizeQuality } from '../../../../../../../lib/mainline/quality-gates.js'
import { seasonInjectionFor } from '../../../../../../../lib/mainline/season.js'
import { findSeason } from '../../../../../../../lib/mainline/season-store.js'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string; sceneId: string }> }) {
  const { courseId, sceneId } = await ctx.params

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (!course.scenes.some(s => s.id === sceneId)) {
    return NextResponse.json({ error: `scene not found: ${sceneId}` }, { status: 404 })
  }

  try {
    const season = course.season ? await findSeason(course.season.seasonId) : undefined
    const injection = season && course.season ? seasonInjectionFor(season, course.season.episodeNo) : undefined

    // 可选修复指示(如 AI 试学报告的卡壳点):作为本次重写的强约束传给生成链
    const body = await req.json().catch(() => undefined) as { instructions?: unknown } | undefined
    const repairInstructions = Array.isArray(body?.instructions)
      ? body.instructions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
      : []
    const result = await regenerateScene(course, sceneId, {
      ...(injection ? { season: injection } : {}),
      ...(repairInstructions.length > 0 ? { repairInstructions } : {}),
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 })

    await saveMainlineCourse(result.course)
    return NextResponse.json({
      ok: true,
      courseId,
      sceneId,
      qualityStatus: result.course.qualityStatus,
      summary: summarizeQuality(result.issues),
      issues: result.issues,
      factAudit: { auditedScenes: result.course.factAudit?.auditedSceneCount ?? 0, fatal: result.course.factAudit?.fatalCount ?? 0 },
    })
  } catch (err) {
    if (err instanceof SceneGenerationQualityError) {
      const sceneNo = course.scenes.findIndex(scene => scene.id === err.sceneId) + 1
      const pageLabel = sceneNo > 0 ? `第 ${sceneNo} 页` : '本页'
      const contentLabel = err instanceof PracticeGenerationQualityError ? '练习内容' : '页面内容'
      return NextResponse.json({
        error: `${pageLabel}${contentLabel}连续 ${err.attempts} 次未通过质量检查，本次未保存。请直接重试本页生成。`,
        code: err.code,
        retryable: true,
        sceneId: err.sceneId,
        ...(sceneNo > 0 ? { sceneNo } : {}),
        reasons: err.reasons,
      }, { status: 422 })
    }
    return NextResponse.json({ error: `regen failed: ${String(err)}` }, { status: 500 })
  }
}

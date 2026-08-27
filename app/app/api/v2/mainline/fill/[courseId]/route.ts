/**
 * POST /api/v2/mainline/fill/[courseId]
 *
 * 对一门 draft 状态的 mainline 课程跑 fill-scenes(逐 scene 让 LLM 填内容),
 * 完成后跑六类闸门,更新 qualityStatus,落库。同步返回,时长 30-120 秒(4 次 LLM)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'
import { fillScenes, PracticeGenerationQualityError, SceneGenerationQualityError } from '../../../../../lib/mainline/generation/fill-scenes.js'
import { recentMistakesForKps } from '../../../../../lib/mainline/mastery-store.js'
import { factAuditCourse } from '../../../../../lib/mainline/generation/fact-audit.js'
import { repairFactIssuesUntilStable } from '../../../../../lib/mainline/generation/fact-repair.js'
import { auditMainlineCourse, blockingQualityIssues } from '../../../../../lib/mainline/quality-gates.js'
import { auditCourseReleaseReadiness } from '../../../../../lib/mainline/readiness.js'
import { archiveEpisode, seasonInjectionFor, SERIAL_HOOK_SLOT } from '../../../../../lib/mainline/season.js'
import { findSeason, saveSeason } from '../../../../../lib/mainline/season-store.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  // ?force=1 对已 passed 的课重填全部讲稿(配图保留)——内容返工的最小入口
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (auditCourseReleaseReadiness(course).ready && !force) {
    return NextResponse.json({ ok: true, courseId, qualityStatus: 'passed', skipped: 'already-filled' })
  }

  try {
    // v4 M2:属于季的课注入季上下文(承接上集钩子 + 结尾留下集预告)
    const season = course.season ? await findSeason(course.season.seasonId) : undefined
    const injection = season && course.season ? seasonInjectionFor(season, course.season.episodeNo) : undefined
    // v5 M1:非 force 时保护教师手改幕(fillScenes 默认值);force=1 是"整课重填"的
    // 唯一逃生舱,连教师手改也一并覆盖,否则 force 语义名不副实。
    // 复习课注入真实误答证据(暂定自评,契约允许驱动加练设计):变式直击错因
    const mistakes = course.lessonPhase === 'review'
      ? await recentMistakesForKps(course.sourceMaterial.map(item => item.kpId).filter((id): id is string => Boolean(id)))
      : []
    const { course: filled, failedScenes } = await fillScenes(course, { respectTeacherEdits: !force, ...(injection ? { season: injection } : {}), ...(mistakes.length > 0 ? { mistakes } : {}) })
    // 事实核查步:FATAL 与 MISLEADING 都阻断正式授课；核查服务失败仍允许保存
    // 生成结果，但页面保持“未验证”并阻断课堂，教师可在备课中重试单页核查。
    const initialFact = await factAuditCourse(filled)
    const repairLoop = await repairFactIssuesUntilStable(filled, initialFact, {
      protectTeacherEdits: !force,
    })
    const repairedCourse = repairLoop.course
    const fact = repairLoop.fact
    const audit = auditMainlineCourse(repairedCourse)
    const blocking = blockingQualityIssues(audit)
    // 教师手改后待复核的页面:非 force 时被 respectTeacherEdits 保护跳过重填,而
    // 事实核查按需选页也可能没审到它——这轮既没重填也没审计的待复核页必须原样
    // 带过,否则整课 fill 会把「待复核」抹成空,让未验证的手改直接放行
    // (2026-08-26 code-review CONFIRMED)。force 重填覆盖了手改,不再遗留 pending。
    const audited = new Set(fact.auditedSceneIds)
    const carriedPendingSceneIds = force ? [] : (course.factAudit?.pendingSceneIds ?? []).filter(sceneId => {
      const scene = filled.scenes.find(item => item.id === sceneId)
      return Boolean(scene?.editedByTeacher) && !audited.has(sceneId)
    })
    const finalCourse = {
      ...repairedCourse,
      qualityStatus: fact.fatalCount > 0 || fact.unverifiedSceneIds.length > 0 || blocking.length > 0 || failedScenes.length > 0 || carriedPendingSceneIds.length > 0
        ? 'blocked' as const
        : 'passed' as const,
      factAudit: {
        ...(fact.auditedSceneIds.length > 0 ? { auditedAt: new Date().toISOString() } : {}),
        auditedSceneIds: fact.auditedSceneIds,
        requiredSceneIds: fact.requiredSceneIds,
        unverifiedSceneIds: fact.unverifiedSceneIds,
        consistencyAuditedSceneIds: fact.consistencyAuditedSceneIds,
        consistencyConflictCount: fact.consistencyConflictCount,
        pendingSceneIds: carriedPendingSceneIds,
        auditedSceneCount: fact.auditedSceneCount,
        fatalCount: fact.fatalCount,
        repairTrace: repairLoop.trace,
        issues: fact.issues.map(i => ({
          id: i.id, severity: i.severity, targetId: i.targetId,
          ...(i.relatedTargetIds ? { relatedTargetIds: i.relatedTargetIds } : {}),
          message: i.message, impact: i.impact, fix: i.fix,
        })),
      },
    }
    await saveMainlineCourse(finalCourse)

    // 归档:通过闸门的季课写回季(集记录 + 上集钩子标记回收 + 本集新钩子入库);圣经只增不删
    if (season && course.season && finalCourse.qualityStatus === 'passed') {
      const recap = finalCourse.scenes.find(s => s.sceneType === 'recap')
      const endingHook = recap?.contentSlots[SERIAL_HOOK_SLOT]
      await saveSeason(archiveEpisode(season, {
        episodeNo: course.season.episodeNo,
        courseId: finalCourse.id,
        topic: finalCourse.topic,
        kpTitles: finalCourse.sourceMaterial.map(s => s.title),
        ...(endingHook ? { endingHook } : {}),
      }))
    }
    const allIssues = [...audit, ...fact.issues]
    return NextResponse.json({
      ok: true,
      courseId,
      qualityStatus: finalCourse.qualityStatus,
      // 生成失败的幕:内容保持骨架原样,请在备课中逐页重生成(scene regen 端点)
      ...(failedScenes.length > 0 ? { failedScenes } : {}),
      blockingCount: blocking.length + fact.fatalCount + fact.unverifiedSceneIds.length
        + carriedPendingSceneIds.length + failedScenes.length,
      warningCount: allIssues.filter(a => a.severity === 'warning').length,
      factAudit: {
        auditedScenes: fact.auditedSceneCount,
        requiredScenes: fact.requiredSceneIds.length,
        unverifiedScenes: fact.unverifiedSceneIds.length,
        pendingScenes: carriedPendingSceneIds.length,
        consistencyAuditedScenes: fact.consistencyAuditedSceneIds.length,
        consistencyConflicts: fact.consistencyConflictCount,
        fatal: fact.fatalCount,
      },
      factRepair: {
        maxAttempts: repairLoop.trace.maxAttempts,
        attempts: repairLoop.trace.attempts.length,
        stoppedReason: repairLoop.trace.stoppedReason,
        attemptedScenes: repairLoop.trace.attempts.reduce((sum, attempt) => sum + attempt.attemptedSceneIds.length, 0),
        repairedScenes: repairLoop.trace.attempts.reduce((sum, attempt) => sum + attempt.repairedSceneIds.length, 0),
        failedScenes: repairLoop.trace.attempts.reduce((sum, attempt) => sum + attempt.failed.length, 0),
        skippedScenes: repairLoop.trace.attempts.reduce((sum, attempt) => sum + attempt.skipped.length, 0),
        remainingIssues: fact.issues.filter(issue => issue.severity === 'blocking' || issue.severity === 'warning').length,
      },
    })
  } catch (err) {
    if (err instanceof SceneGenerationQualityError) {
      const sceneNo = course.scenes.findIndex(scene => scene.id === err.sceneId) + 1
      const pageLabel = sceneNo > 0 ? `第 ${sceneNo} 页` : '生成页面'
      const contentLabel = err instanceof PracticeGenerationQualityError ? '练习内容' : '页面内容'
      return NextResponse.json({
        error: `${pageLabel}${contentLabel}连续 ${err.attempts} 次未通过质量检查，本次未保存。请重试生成；若仍失败，可在备课中单独重生成该页。`,
        code: err.code,
        retryable: true,
        sceneId: err.sceneId,
        ...(sceneNo > 0 ? { sceneNo } : {}),
        reasons: err.reasons,
      }, { status: 422 })
    }
    return NextResponse.json({ error: `fill failed: ${String(err)}` }, { status: 500 })
  }
}

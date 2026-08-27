/**
 * POST /api/v2/mainline/repair-facts/[courseId]
 *
 * 对已完成事实核查的课程执行定向回修。只处理核查已定位到的单页断言，跨幕
 * 口径冲突不自动猜测改哪一页；所有回修均须再次通过该页事实核查后才会保存。
 */
import { type NextRequest, NextResponse } from 'next/server'
import type { FactAuditResult } from '../../../../../lib/mainline/generation/fact-audit.js'
import { repairFactIssuesUntilStable } from '../../../../../lib/mainline/generation/fact-repair.js'
import { auditCourseReleaseReadiness } from '../../../../../lib/mainline/readiness.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 300

function repairableFactAudit(record: NonNullable<Awaited<ReturnType<typeof findMainlineCourse>>>['factAudit']): FactAuditResult {
  if (!record) throw new Error('fact audit record is required')
  return {
    issues: record.issues.map(issue => ({
      ...issue,
      gate: 'pedagogy',
      targetType: 'scene',
      autoFixable: false,
    })),
    fatalCount: record.fatalCount,
    auditedSceneCount: record.auditedSceneCount,
    auditedSceneIds: record.auditedSceneIds ?? [],
    requiredSceneIds: record.requiredSceneIds ?? [],
    unverifiedSceneIds: record.unverifiedSceneIds ?? [],
    consistencyAuditedSceneIds: record.consistencyAuditedSceneIds ?? [],
    consistencyConflictCount: record.consistencyConflictCount ?? 0,
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const factAudit = course.factAudit
  if (!factAudit || (factAudit.unverifiedSceneIds?.length ?? 0) > 0 || (factAudit.pendingSceneIds?.length ?? 0) > 0) {
    return NextResponse.json({
      error: '请先完成全部页面的事实核查，再执行定向事实回修。',
      code: 'FACT_AUDIT_INCOMPLETE',
    }, { status: 409 })
  }

  const actionable = factAudit.issues.filter(issue => (
    (issue.severity === 'blocking' || issue.severity === 'warning')
    && !issue.id.includes(':consistency-')
  ))
  if (actionable.length === 0) {
    return NextResponse.json({
      error: '当前课程没有可安全自动回修的事实问题；跨幕口径冲突需由教师确认。',
      code: 'NO_ACTIONABLE_FACT_ISSUES',
    }, { status: 409 })
  }

  const repairLoop = await repairFactIssuesUntilStable(course, repairableFactAudit(factAudit), {
    protectTeacherEdits: true,
  })
  const latest = await findMainlineCourse(courseId)
  if (!latest || JSON.stringify(latest) !== JSON.stringify(course)) {
    return NextResponse.json({
      error: '回修期间课程已被修改，整批未保存。请刷新备课页后重试。',
      code: 'COURSE_CHANGED_DURING_REPAIR',
      retryable: true,
    }, { status: 409 })
  }

  const readiness = auditCourseReleaseReadiness(repairLoop.course)
  const finalCourse = {
    ...repairLoop.course,
    qualityStatus: readiness.ready ? 'passed' as const : 'blocked' as const,
    factAudit: {
      ...repairLoop.fact,
      ...(repairLoop.fact.auditedSceneIds.length > 0 ? { auditedAt: new Date().toISOString() } : {}),
      pendingSceneIds: [],
      repairTrace: repairLoop.trace,
    },
  }
  await saveMainlineCourse(finalCourse)

  return NextResponse.json({
    ok: true,
    courseId,
    qualityStatus: finalCourse.qualityStatus,
    repairedSceneIds: repairLoop.trace.attempts.flatMap(attempt => attempt.repairedSceneIds),
    skippedSceneIds: repairLoop.trace.attempts.flatMap(attempt => attempt.skipped.map(item => item.sceneId)),
    factAudit: {
      fatal: repairLoop.fact.fatalCount,
      unverified: repairLoop.fact.unverifiedSceneIds.length,
      consistencyConflicts: repairLoop.fact.consistencyConflictCount,
    },
    trace: repairLoop.trace,
  })
}

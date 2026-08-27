/**
 * 存量课程误区说法校准。
 *
 * 只处理已经绑定教材误区原文的辨析 / AI 找茬页：若课堂错误说法偏离原文，
 * 回退到可追溯的直接说法。没有绑定来源的页面必须由教师逐页选择，禁止系统猜测。
 */
import {
  normalizeAiVerifyClaims,
  normalizeGroundedContrastClaim,
} from '../ai-verify.js'
import { misconceptionSourcesOf, type LessonScene, type MainlineCourse } from '../domain.js'
import { auditCourseReleaseReadiness } from '../readiness.js'
import type { QualityIssue } from '../quality-gates.js'
import { invalidateSceneFactAudit } from './fact-audit-utils.js'

export interface RefreshCourseMisconceptionsResult {
  course: MainlineCourse
  issues: QualityIssue[]
  refreshedSceneIds: string[]
  teacherReviewSceneIds: string[]
}

export function misconceptionClaimNeedsRefresh(scene: LessonScene): boolean {
  const normalized = normalizedMisconceptionContent(scene)
  return normalized !== scene.contentSlots
    && JSON.stringify(normalized) !== JSON.stringify(scene.contentSlots)
}

export function misconceptionSceneNeedsTeacherReview(scene: LessonScene): boolean {
  return (scene.sceneType === 'contrast' || scene.sceneType === 'ai-verify')
    && misconceptionSourcesOf(scene).length === 0
}

export function refreshCourseMisconceptions(course: MainlineCourse): RefreshCourseMisconceptionsResult {
  const refreshedSceneIds: string[] = []
  let factAudit = course.factAudit
  const scenes = course.scenes.map(scene => {
    const contentSlots = normalizedMisconceptionContent(scene)
    if (contentSlots === scene.contentSlots || JSON.stringify(contentSlots) === JSON.stringify(scene.contentSlots)) {
      return scene
    }
    refreshedSceneIds.push(scene.id)
    factAudit = invalidateSceneFactAudit(factAudit, scene.id)
    return { ...scene, contentSlots }
  })

  const candidate: MainlineCourse = {
    ...course,
    scenes,
    ...(factAudit ? { factAudit } : {}),
  }
  const readiness = auditCourseReleaseReadiness(candidate)
  return {
    course: {
      ...candidate,
      qualityStatus: course.qualityStatus === 'draft'
        ? 'draft'
        : readiness.ready ? 'passed' : 'blocked',
    },
    issues: readiness.deterministicIssues,
    refreshedSceneIds,
    teacherReviewSceneIds: scenes.filter(misconceptionSceneNeedsTeacherReview).map(scene => scene.id),
  }
}

function normalizedMisconceptionContent(scene: LessonScene): Record<string, string> {
  if (misconceptionSourcesOf(scene).length === 0) return scene.contentSlots
  if (scene.sceneType === 'contrast') {
    return normalizeGroundedContrastClaim(scene, scene.contentSlots)
  }
  if (scene.sceneType === 'ai-verify') {
    return normalizeAiVerifyClaims(scene, scene.contentSlots)
  }
  return scene.contentSlots
}

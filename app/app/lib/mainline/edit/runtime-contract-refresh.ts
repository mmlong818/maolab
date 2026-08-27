/**
 * 存量课程运行时契约翻新。
 *
 * 旧课可能承诺滑块、逐步回放或自动高亮，但当前课堂实际只支持静态呈现与教师
 * 按钮一次展开。教师主动执行后，只把命中的三项运行时说明同步到当前事实源；
 * 讲稿、板书、任务、配图、事实核查和教师手改标记一律保持不变。
 */

import type { MainlineCourse } from '../domain.js'
import { auditCourseReleaseReadiness } from '../readiness.js'
import { auditMainlineCourse, type QualityIssue } from '../quality-gates.js'
import { runtimeSceneContractFor, unsupportedRuntimePromises } from '../runtime-interaction.js'

export interface RefreshRuntimeContractsResult {
  course: MainlineCourse
  issues: QualityIssue[]
  refreshedSceneIds: string[]
}

const STALE_RUNTIME_CONTRACT_ISSUE_MESSAGE = '课堂交互描述承诺了当前页面未实现的能力。'

function refreshableSceneIds(course: MainlineCourse): Set<string> {
  return new Set(course.scenes
    .filter(scene => unsupportedRuntimePromises(scene).length > 0)
    .map(scene => scene.id))
}

export function refreshableRuntimeContractIssues(course: MainlineCourse): QualityIssue[] {
  const sceneIds = refreshableSceneIds(course)
  return auditMainlineCourse(course).filter(issue => (
    issue.gate === 'technique'
    && issue.severity === 'warning'
    && issue.targetType === 'scene'
    && sceneIds.has(issue.targetId)
    && issue.message === STALE_RUNTIME_CONTRACT_ISSUE_MESSAGE
  ))
}

export function refreshCourseRuntimeContracts(course: MainlineCourse): RefreshRuntimeContractsResult {
  const refreshable = refreshableSceneIds(course)
  const refreshedSceneIds: string[] = []
  const scenes = course.scenes.map(scene => {
    if (!refreshable.has(scene.id)) return scene
    refreshedSceneIds.push(scene.id)
    return { ...scene, ...runtimeSceneContractFor(scene.sceneType) }
  })

  const candidate: MainlineCourse = {
    ...course,
    scenes,
    qualityStatus: course.qualityStatus === 'draft' ? 'draft' : 'passed',
  }
  const readiness = auditCourseReleaseReadiness(candidate)
  const refreshed: MainlineCourse = {
    ...candidate,
    qualityStatus: course.qualityStatus === 'draft'
      ? 'draft'
      : readiness.ready ? 'passed' : 'blocked',
  }

  return {
    course: refreshed,
    issues: readiness.deterministicIssues,
    refreshedSceneIds,
  }
}

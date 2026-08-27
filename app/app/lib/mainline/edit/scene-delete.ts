/**
 * scene-delete · v5 M1 删页
 *
 * 结构保护(读 skeleton-library 后拍板,用测试锁定):
 * - 不能删开场(source-reading)/ 收束(recap):课程骨架固定为
 *   "开场 → 每个 KP 一个 LearningFragment → 收束"(skeleton-library.ts 头注),
 *   这两幕在全课里各只有一份,删除即破坏骨架的固定两端,不是"少一页"而是"课程
 *   没头没尾"。
 * - 不能删一个 LearningFragment 的最后一幕:删空会让 fragment.sceneIds=[]，
 *   quality-gates.pushFragmentIssues 已经把这判 blocking——与其让它在闸门里
 *   悄悄变成阻断态,不如在编辑入口就给出可读的拒绝理由,引导教师改用换骨架
 *   (整片段重展开)或后续的"删片段"操作。
 */

import { auditMainlineCourse, blockingQualityIssues, type QualityIssue } from '../quality-gates.js'
import type { MainlineCourse } from '../domain.js'
import { clearSceneFromFactAudit, hasPendingFactAudit } from './fact-audit-utils.js'

export interface DeleteSceneResult {
  course: MainlineCourse
  issues: QualityIssue[]
}

/** code 供路由层区分 HTTP 状态:not_found → 404,structural → 400(请求合法但被结构规则拒绝)。 */
export type DeleteSceneOutcome = DeleteSceneResult | { error: string; code: 'not_found' | 'structural' }

export function deleteSceneFromCourse(course: MainlineCourse, sceneId: string): DeleteSceneOutcome {
  const scene = course.scenes.find(s => s.id === sceneId)
  if (!scene) return { error: `scene not found: ${sceneId}`, code: 'not_found' }

  if (scene.sceneType === 'source-reading') {
    return { error: '不能删除开场幕(source-reading):它是全课唯一入口,删除会让课程没有主题引入。', code: 'structural' }
  }
  if (scene.sceneType === 'recap') {
    return { error: '不能删除收束幕(recap):它是全课唯一收束,删除会让课程没有学习路径回顾。', code: 'structural' }
  }

  const fragment = course.learningFragments.find(f => f.sceneIds.includes(sceneId))
  if (fragment && fragment.sceneIds.length <= 1) {
    return {
      error: `不能删除本片段的最后一幕:片段「${fragment.id}」删除后将没有任何场景。`
        + '如需去掉这个知识点,请对该片段使用换骨架,或联系产品支持删除整个片段。',
      code: 'structural',
    }
  }

  const scenes = course.scenes.filter(s => s.id !== sceneId)
  const beats = course.beats.filter(b => b.sceneId !== sceneId)
  const removedDuration = fragment ? sceneDurationWithinFragment(course, fragment, sceneId) : 0
  const learningFragments = course.learningFragments.map(f => f.sceneIds.includes(sceneId)
    ? {
        ...f,
        sceneIds: f.sceneIds.filter(id => id !== sceneId),
        durationTargetSec: Math.max(f.durationTargetSec - removedDuration, 1),
      }
    : f)

  const factAudit = clearSceneFromFactAudit(course.factAudit, sceneId)
  const draftCourse: MainlineCourse = { ...course, scenes, beats, learningFragments, ...(factAudit ? { factAudit } : {}) }

  const issues = auditMainlineCourse(draftCourse)
  const blocking = blockingQualityIssues(issues)
  const fatalStillOpen = (factAudit?.fatalCount ?? 0) > 0
  const finalCourse: MainlineCourse = {
    ...draftCourse,
    qualityStatus: blocking.length === 0 && !fatalStillOpen && !hasPendingFactAudit(factAudit) ? 'passed' : 'blocked',
  }
  return { course: finalCourse, issues }
}

/** 新课优先用逐页时长；存量或混合数据从片段剩余预算中均摊，与备课简报口径一致。 */
function sceneDurationWithinFragment(
  course: MainlineCourse,
  fragment: MainlineCourse['learningFragments'][number],
  sceneId: string,
): number {
  const target = course.scenes.find(scene => scene.id === sceneId)
  const explicit = target?.durationTargetSec
  if (explicit !== undefined) return Number.isFinite(explicit) && explicit > 0 ? explicit : 0

  const fragmentScenes = fragment.sceneIds
    .map(id => course.scenes.find(scene => scene.id === id))
    .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene))
  const explicitDuration = fragmentScenes.reduce((sum, scene) => {
    const duration = scene.durationTargetSec
    return sum + (duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : 0)
  }, 0)
  const missingCount = fragmentScenes.filter(scene => scene.durationTargetSec === undefined).length
  return missingCount > 0 ? Math.max(fragment.durationTargetSec - explicitDuration, 0) / missingCount : 0
}

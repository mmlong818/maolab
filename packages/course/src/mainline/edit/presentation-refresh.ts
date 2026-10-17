/**
 * presentation-refresh · 旧课呈现契约翻新(明亮令 2026-07-22 配套)
 *
 * 编译期落库的版式字段会随呈现规则演进而过时:contrast/ai-verify 已在
 * compile-lesson 恒定 corner-avatar(中央左右对照幕,大立绘吃对照区且
 * fill 后必然内容密集,见 tasks/lessons.md 2026-07-22 条),但更早编译的
 * 旧课仍存着大立绘版式,一旦触发 isContentDense 就撞闸门。这里把存量课
 * 按现行规则归一:只动"会撞闸门的大立绘版式",内容密集白名单里的
 * narration-only / no-character 保持不动(它们安全,强改反而引入头像噪音)。
 *
 * 与 scene-patch 同一套收尾:重跑确定性质量闸门并按结果更新 qualityStatus
 * (不烧 LLM;factAudit 的 FATAL 仍按原值参与判定,不清除——本操作不改内容)。
 */

import { auditMainlineCourse, blockingQualityIssues, type QualityIssue } from '../quality-gates.js'
import type { LessonScene, MainlineCourse } from '../domain.js'
import { hasPendingFactAudit } from './fact-audit-utils.js'

/** 与 quality-gates CONTENT_DENSE_LAYOUTS 同源的安全版式(镜像声明,规则见文件头)。 */
const SAFE_DENSE_LAYOUTS: readonly LessonScene['dialogueLayout'][] = ['corner-avatar', 'narration-only', 'no-character']
const CENTER_CONTRAST_SCENE_TYPES: readonly LessonScene['sceneType'][] = ['contrast', 'ai-verify']

export interface RefreshPresentationResult {
  course: MainlineCourse
  issues: QualityIssue[]
  /** 被归一的幕 id(dialogueLayout 从大立绘版式改为 corner-avatar)。 */
  normalizedSceneIds: string[]
}

export function refreshPresentationContract(course: MainlineCourse): RefreshPresentationResult {
  const normalizedSceneIds: string[] = []
  const scenes = course.scenes.map(scene => {
    if (!CENTER_CONTRAST_SCENE_TYPES.includes(scene.sceneType)) return scene
    if (SAFE_DENSE_LAYOUTS.includes(scene.dialogueLayout)) return scene
    normalizedSceneIds.push(scene.id)
    return {
      ...scene,
      dialogueLayout: 'corner-avatar' as const,
      characterLayer: { ...scene.characterLayer, layout: 'corner-avatar' as const },
    }
  })

  const draftCourse: MainlineCourse = { ...course, scenes }
  const issues = auditMainlineCourse(draftCourse)
  const blocking = blockingQualityIssues(issues)
  const fatalStillOpen = (course.factAudit?.fatalCount ?? 0) > 0
  const finalCourse: MainlineCourse = {
    ...draftCourse,
    qualityStatus: blocking.length === 0 && !fatalStillOpen && !hasPendingFactAudit(course.factAudit) ? 'passed' : 'blocked',
  }
  return { course: finalCourse, issues, normalizedSceneIds }
}

import { IMAGE_SCENE_TYPES, type LessonScene, type MainlineCourse } from '../domain.js'
import { specializedContentKind } from './scene-content-contract.js'

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

/** 判断页面是否已有可直接授课的完整画面，而不是只检查是否存在位图。 */
export function sceneHasCompleteTeachingVisual(scene: LessonScene): boolean {
  if (!IMAGE_SCENE_TYPES.includes(scene.sceneType)) return true
  if (scene.imageUrl) return true
  if (specializedContentKind(scene)) return true

  if (scene.sceneType === 'contrast') {
    return hasText(scene.contentSlots.misconception) && hasText(scene.contentSlots.correction)
  }

  if (scene.sceneType === 'recap') return hasText(scene.contentSlots.takeaway)
  return false
}

export function courseHasCompleteTeachingVisuals(course: MainlineCourse): boolean {
  return course.scenes.every(sceneHasCompleteTeachingVisual)
}

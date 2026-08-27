import { IMAGE_SCENE_TYPES, type LessonScene } from '../domain.js'

/** 已生成的课程配图属于页面内容契约，不能被附加的结构化槽位覆盖。 */
export function usesGeneratedSceneImage(scene: LessonScene): scene is LessonScene & { imageUrl: string } {
  return IMAGE_SCENE_TYPES.includes(scene.sceneType) && Boolean(scene.imageUrl)
}

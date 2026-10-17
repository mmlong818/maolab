/**
 * 专属页面核心内容槽契约。
 *
 * sceneType 决定真实渲染器读取哪些键；模型返回任意两个字符串并不等于页面有内容。
 * 这里是生成验收与发布闸门共用的唯一键表，避免 prompt、渲染器和质量检查各写一份。
 */
import type { LessonScene, SceneType } from './domain.js'
import { conceptTemplateForScene } from './concept-template.js'
import { recapCoreSlotKeys } from './recap-template.js'

const PLACEHOLDER_PATTERN = /^待\s*(?:LLM\s*)?填充[:：]?/i

const CORE_SLOTS: Readonly<Record<SceneType, readonly string[]>> = {
  // 开场由确定性模板生成；存量课程使用过多套历史键名，另由开场学习顺序检查约束。
  'source-reading': [],
  'visual-observation': ['panelATitle', 'panelA', 'panelBTitle', 'panelB', 'panelCTitle', 'panelC'],
  'concept-build': ['statement', 'example'],
  contrast: ['misconception', 'correction'],
  'worked-example': ['problem', 'steps'],
  practice: ['task', 'feedback'],
  recap: ['path', 'takeaway'],
  'ai-verify': ['aiClaim', 'reveal'],
  'ai-inquiry': ['shallowSample', 'probingSample'],
  'ai-collab': ['task', 'rubric'],
}

function useful(value: string | undefined): boolean {
  const trimmed = value?.trim()
  return Boolean(trimmed && !PLACEHOLDER_PATTERN.test(trimmed))
}

export function requiredSceneContentSlotKeys(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>,
): readonly string[] {
  if (scene.sceneType === 'concept-build' && conceptTemplateForScene(scene)?.id === 'strategy-cycle') {
    return ['trigger', 'steps', 'selfCheck']
  }
  if (scene.sceneType === 'recap' && scene.infoShape) return recapCoreSlotKeys(scene)
  return CORE_SLOTS[scene.sceneType]
}

export function sceneContentSlotProblems(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>,
  contentSlots: Record<string, string> = scene.contentSlots,
): string[] {
  const missing = requiredSceneContentSlotKeys(scene).filter(key => !useful(contentSlots[key]))
  return missing.map(key => `缺少专属页面核心槽 contentSlots.${key}`)
}

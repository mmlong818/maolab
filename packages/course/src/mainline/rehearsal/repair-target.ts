import { misconceptionSourcesOf, type MainlineCourse } from '../domain.js'
import type { RehearsalWeakness } from './types.js'

export interface RehearsalRepairTarget {
  sceneId: string
  misconception?: string
}

/**
 * 把“问题出现在哪一页”转换成“教师应在哪一页修”。误区问题优先送到同 KP 的
 * 辨析/核查页；教材元数据缺失时保持原跳转，不伪造一个看似可修的入口。
 */
export function repairTargetForWeakness(
  course: MainlineCourse,
  weakness: RehearsalWeakness,
  misconceptionsByKp: Readonly<Record<string, readonly string[]>>,
): RehearsalRepairTarget {
  const misconceptionKinds = ['unanswered-question', 'misconception-wording-drift']
  if (!misconceptionKinds.includes(weakness.kind) || weakness.evidence.from !== 'misconception') {
    return { sceneId: weakness.sceneId }
  }
  const options = misconceptionsByKp[weakness.evidence.kpId] ?? []
  if (!options.includes(weakness.evidence.text)) return { sceneId: weakness.sceneId }

  const handlers = course.scenes.filter(scene => scene.kpId === weakness.evidence.kpId
    && (scene.sceneType === 'contrast' || scene.sceneType === 'ai-verify'))
  const unassignedContrast = handlers.find(scene => scene.sceneType === 'contrast'
    && misconceptionSourcesOf(scene).filter(source => options.includes(source)).length === 0)
  const target = unassignedContrast
    ?? handlers.find(scene => scene.sceneType === 'ai-verify')
  return target
    ? { sceneId: target.id, misconception: weakness.evidence.text }
    : { sceneId: weakness.sceneId }
}

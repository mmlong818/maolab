/**
 * fragment-reskeleton · v5 M1 换骨架
 *
 * 对一个知识点片段(LearningFragment.kpId 非空)按新的 knowledgeType 重新从
 * skeleton-library 展开幕序列——复用 compile-lesson.ts 导出的
 * buildFragmentScenes/buildBeats,不重新实现 scene builder(P3 备课工作台接口
 * 契约:换骨架 = 换 skeletonId 重展开,见 skeleton-library.ts 头注)。
 *
 * 取舍(不自动 fill):换骨架只重建结构,新幕内容是 compile-lesson 式的
 * "待 LLM 填充"占位草稿,不在这里顺带触发 fill——换骨架是一次同步的纯结构操作
 * (像 compile-lesson 一样不烧 LLM),把它和"生成内容"这个 30-90 秒的异步 LLM
 * 操作绑在一起会让一个结构调整变成不可预期的高延迟请求,也违反"教师主要动作:
 * 换版式/重新生成本页"在设计上本就是两个独立动作(project-redesign §8.1)。
 * 前端应在响应的 filledStatus:'draft-empty' 提示下,引导教师对新幕逐一调用
 * 单页 regen,或后续补一个"整片段重生成"的批量入口。
 */

import { randomUUID } from 'node:crypto'
import type { KnowledgeType } from '@maolab/shared-types'
import type { LearningFragment, MainlineCourse } from '../domain.js'
import {
  buildFragmentScenes,
  buildBeats,
  type SceneBaseInput,
} from '../generation/compile-lesson.js'
import {
  FRAGMENT_SKELETONS,
  VISUAL_FORM_BY_SCENE_TYPE,
  fragmentSkeletonFor,
  type SkeletonKpInput,
} from '../generation/skeleton-library.js'
import { clearScenesFromFactAudit } from './fact-audit-utils.js'

export interface ReskeletonResult {
  course: MainlineCourse
  /** 新展开的 scene id,前端据此逐一引导"让 AI 填内容"(单页 regen)。 */
  newSceneIds: string[]
}

/** code 供路由层区分 HTTP 状态:not_found → 404,invalid → 400。 */
export type ReskeletonOutcome = ReskeletonResult | { error: string; code: 'not_found' | 'invalid' }

export function reskeletonFragment(
  course: MainlineCourse,
  fragmentId: string,
  knowledgeType: KnowledgeType,
): ReskeletonOutcome {
  const fragmentIndex = course.learningFragments.findIndex(f => f.id === fragmentId)
  if (fragmentIndex === -1) return { error: `fragment not found: ${fragmentId}`, code: 'not_found' }
  const fragment = course.learningFragments[fragmentIndex]!
  if (!fragment.kpId) {
    return { error: `片段「${fragmentId}」是课级片段(开场/收束等),没有绑定知识点,不能换骨架。`, code: 'invalid' }
  }
  if (fragment.sceneIds.length === 0) {
    return { error: `片段「${fragmentId}」当前没有任何场景,数据异常,无法定位替换位置。`, code: 'invalid' }
  }

  const kpTitle = course.sourceMaterial.find(s => s.kpId === fragment.kpId)?.title ?? fragment.kpId
  const kp: SkeletonKpInput = { id: fragment.kpId, canonicalName: kpTitle, knowledgeType }
  const skeleton = fragmentSkeletonFor(kp)

  const base: SceneBaseInput = {
    topic: course.topic,
    kpTextBlock: course.sourceMaterial.map(s => s.title).join('、'),
    teacherCastId: course.selectedTeacher,
    studentCastId: course.peerRoleProfile.peerId,
    subject: course.subject,
  }
  // 辨析幕立绘左右轮换的规则与 compile-lesson 一致:按 KP 片段(排除课级片段)的序号取模。
  const kpFragmentIds = course.learningFragments.filter(f => f.kpId).map(f => f.id)
  const kpFragmentPosition = kpFragmentIds.indexOf(fragmentId)
  const spriteSide: 'left' | 'right' = kpFragmentPosition % 2 === 0 ? 'left' : 'right'

  // 新场景 id 用片段 id + 短随机后缀,避免撞上课程里既有 id(compile-lesson 的
  // p2-序号 命名假设"从零编译整课",这里是"替换课程里的一段")。
  let seq = 0
  const makeSceneId = (sceneType: string) => `${fragmentId}-r${randomUUID().slice(0, 6)}-${++seq}-${sceneType}`
  const newFragmentScenes = buildFragmentScenes(kp, skeleton, base, makeSceneId, spriteSide)

  const oldSceneIds = new Set(fragment.sceneIds)
  const oldSceneIndex = course.scenes.findIndex(s => oldSceneIds.has(s.id))
  const scenes = [
    ...course.scenes.slice(0, oldSceneIndex),
    ...newFragmentScenes,
    ...course.scenes.slice(oldSceneIndex).filter(s => !oldSceneIds.has(s.id)),
  ]
  const beats = buildBeats(scenes)

  const learningFragments: LearningFragment[] = [...course.learningFragments]
  learningFragments[fragmentIndex] = {
    ...fragment,
    sceneIds: newFragmentScenes.map(s => s.id),
    durationTargetSec: skeleton.durationTargetSec,
    skeletonId: skeleton.id,
    successSignal: skeleton.successSignalTemplate(kpTitle),
  }

  const teachingSkeleton = {
    ...course.teachingSkeleton,
    arc: updatedArc(course.teachingSkeleton.arc, kpFragmentPosition, kpTitle, skeleton.teachingType),
    requiredVisualForms: [...new Set(
      scenes.map(s => VISUAL_FORM_BY_SCENE_TYPE[s.sceneType]).filter((v): v is string => Boolean(v)),
    )],
    knowledgeType: recomputeCourseKnowledgeType(learningFragments),
  }

  const factAudit = clearScenesFromFactAudit(course.factAudit, oldSceneIds)

  return {
    course: {
      ...course,
      scenes,
      beats,
      learningFragments,
      teachingSkeleton,
      qualityStatus: 'draft',
      ...(factAudit ? { factAudit } : {}),
    },
    newSceneIds: newFragmentScenes.map(s => s.id),
  }
}

/** arc[0] 固定是"进入话题",第 N 个 KP 片段对应 arc[N];只更新被换骨架的那一段。 */
function updatedArc(arc: readonly string[], kpFragmentPosition: number, kpTitle: string, teachingType: string): string[] {
  const next = [...arc]
  const arcIndex = kpFragmentPosition + 1
  if (next[arcIndex] !== undefined) next[arcIndex] = `${kpTitle}·${teachingType}`
  return next
}

/** 课级 knowledgeType 是各 KP 片段类型按出现顺序 `+` 连接(与 skeleton-library.ts 的
 * courseKnowledgeType 同一规则),换骨架后需要重算以反映新类型。 */
function recomputeCourseKnowledgeType(fragments: readonly LearningFragment[]): string {
  const seen: string[] = []
  for (const f of fragments) {
    if (!f.kpId || !f.skeletonId) continue
    const baseId = f.skeletonId.replace(/-reinforced$/, '')
    const kt = Object.values(FRAGMENT_SKELETONS).find(s => s.id === baseId)?.knowledgeType
    if (kt && !seen.includes(kt)) seen.push(kt)
  }
  return seen.join('+')
}

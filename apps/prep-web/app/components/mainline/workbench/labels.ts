/**
 * labels · 备课工作台中文标签与徽章样式的共享映射表(v5 M1 WP2)
 *
 * 只做展示层文案/配色,不含业务逻辑;供 StructureTree/Filmstrip/PrepBriefView/
 * TopBar 复用,避免同一份中文映射在多个组件里各写一遍。
 */
import type { KnowledgeType } from '@maolab/shared-types'
import type { Executor, LessonScene, SceneType } from '@/lib/mainline'
import type { PrepBriefSource } from '@/lib/mainline/prep-brief'
import { recapTemplateForScene } from '@/lib/mainline/recap-template'
export { contentSlotLabel } from '@/lib/mainline/presentation/scene-content-contract'

/** v5 M2 人机分工切换文案(工作台幕操作条,与骨架库注释措辞对齐)。 */
export const EXECUTOR_LABEL: Record<Executor, string> = {
  teacher: '教师亲授',
  ai: 'AI 演出',
  co: '双师协作',
}

export const EXECUTOR_OPTIONS: readonly Executor[] = ['teacher', 'ai', 'co']

/**
 * v5 M2 手动插页可选的 sceneType(工作台「插入幕」下拉项)。与
 * lib/mainline/edit/scene-insert.ts 的 INSERTABLE_SCENE_TYPES 保持同一份清单——
 * 该模块是 server-only 编辑层(依赖 node:crypto),不从客户端组件 import,故在
 * UI 侧显式复制一份,改动其一时记得同步另一处。
 */
export const INSERTABLE_SCENE_TYPE_OPTIONS: readonly SceneType[] = ['ai-collab']

export const SCENE_TYPE_LABEL: Record<SceneType, string> = {
  'source-reading': '开场导入',
  'concept-build': '概念建构',
  'worked-example': '例题讲解',
  'visual-observation': '观察画面',
  contrast: '辨析误区',
  practice: '练习检核',
  recap: '收束总结',
  'ai-verify': 'AI 找茬',
  'ai-inquiry': 'AI 提问链',
  'ai-collab': 'AI 协作任务',
}

export function scenePageContents(scene: LessonScene): string {
  switch (scene.sceneType) {
    case 'source-reading': return '课程主题、学习价值与学习路径'
    case 'visual-observation': return scene.imageUrl ? '原配图与观察要点' : '结构化图示与观察要点'
    case 'concept-build': return '概念关系、核心表述与例证'
    case 'worked-example': return '题目、解题步骤与结构图示'
    case 'contrast': return scene.imageUrl ? '原配图、常见误区与修正' : '常见误区与修正对照'
    case 'practice': return '练习任务与反馈'
    case 'recap': {
      if (scene.imageUrl) return '原配图与确认板书'
      const template = recapTemplateForScene(scene)
      return template ? `${template.label}、确认板书与迁移收获` : '学习路径、确认板书与核心收获'
    }
    case 'ai-verify': return 'AI 说法与核查结论'
    case 'ai-inquiry': return '问题链与思考线索'
    case 'ai-collab': return '协作任务与评价标准'
  }
}

export const KNOWLEDGE_TYPE_LABEL: Record<KnowledgeType, string> = {
  factual: '事实性',
  conceptual: '概念性',
  procedural: '程序性',
  metacognitive: '元认知',
}

export const KNOWLEDGE_TYPE_OPTIONS: readonly KnowledgeType[] = ['factual', 'conceptual', 'procedural', 'metacognitive']

/** 观察页按「标题→说明」成对展示，其余结构化槽保持原有顺序。 */
export function orderedContentSlotEntries(scene: LessonScene): [string, string][] {
  const entries = Object.entries(scene.contentSlots)
  if (scene.sceneType !== 'visual-observation') return entries
  const pairedKeys = ['panelATitle', 'panelA', 'panelBTitle', 'panelB', 'panelCTitle', 'panelC']
  const paired = pairedKeys.flatMap(key => scene.contentSlots[key] === undefined ? [] : [[key, scene.contentSlots[key]!] as [string, string]])
  const rest = entries.filter(([key]) => !pairedKeys.includes(key))
  return [...paired, ...rest]
}

export type SourceTagKind = PrepBriefSource | '默认兜底'

export const SOURCE_TAG_STYLE: Record<SourceTagKind, { bg: string; fg: string }> = {
  教材标注: { bg: '#eef2ff', fg: '#3730a3' },
  事实核查: { bg: '#fef2f2', fg: '#991b1b' },
  学情档案: { bg: '#ecfdf5', fg: '#065f46' },
  骨架库: { bg: '#fff7ed', fg: '#9a3412' },
  质量闸门: { bg: '#fef9c3', fg: '#854d0e' },
  真检判例: { bg: '#eef2f7', fg: '#344054' },
  默认兜底: { bg: '#f3f4f6', fg: '#4b5563' },
}

export function gradeBandLabel(g: string): string {
  if (g === 'lower-primary') return '小学低段'
  if (g === 'upper-primary') return '小学高段'
  if (g === 'middle-school') return '初中'
  if (g === 'high-school') return '高中'
  return g
}

export function subjectLabel(s: string): string {
  const map: Record<string, string> = {
    chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学',
    biology: '生物', history: '历史', politics: '道德与法治', geography: '地理', science: '科学', general: '通识',
  }
  return map[s] ?? s
}

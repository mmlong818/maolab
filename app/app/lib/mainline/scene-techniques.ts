import type { DialogueLayout, SceneTechniqueId, SceneType } from './domain.js'

export type TechniqueInteractionDemand = 'none' | 'optional' | 'required'

export interface SceneTechniqueSpec {
  id: SceneTechniqueId
  label: string
  purpose: string
  supportedSceneTypes: readonly SceneType[]
  preferredDialogueLayouts: readonly DialogueLayout[]
  interactionDemand: TechniqueInteractionDemand
  stableLayoutRule: string
  defaultFallback: string
  auditFocus: string
}

export const SCENE_TECHNIQUE_REGISTRY = {
  'static-board': {
    id: 'static-board',
    label: '稳定板书',
    purpose: '承载原文、题干、公式、定义和最终结论。',
    // v5 M2:ai-collab(AI 协作任务卡 + 评价量规)语义最近的既有技法,
    // 该幕型本包不自动进骨架,支持仅为后续手动插入(WP8)预留。
    supportedSceneTypes: ['source-reading', 'concept-build', 'recap', 'ai-collab'],
    preferredDialogueLayouts: ['narration-only', 'no-character', 'corner-avatar'],
    interactionDemand: 'none',
    stableLayoutRule: '主体内容固定在画布中央，角色必须退到角落或完全退场。',
    defaultFallback: '保留中央板书和旁白字幕，关闭角色立绘。',
    auditFocus: '检查文字是否完整、版式是否稳定、角色是否遮挡主体。',
  },
  'layered-reveal': {
    id: 'layered-reveal',
    label: '分层显现',
    purpose: '按讲解顺序逐步出现诗句、证据、步骤或关键词。',
    supportedSceneTypes: ['source-reading', 'concept-build', 'worked-example', 'visual-observation', 'recap'],
    preferredDialogueLayouts: ['teacher-left-content-right', 'student-right-content-left', 'corner-avatar'],
    interactionDemand: 'optional',
    stableLayoutRule: '只改变可见性和强调层，不改变主体尺寸、列宽和角色站位。',
    defaultFallback: '一次展示全部层级，并用编号保留讲解顺序。',
    auditFocus: '检查 reveal 是否对应讲稿，不允许画面长时间没有变化。',
  },
  'local-zoom': {
    id: 'local-zoom',
    label: '局部放大',
    purpose: '把当前讲解对象从复杂画面中单独取出观察。',
    supportedSceneTypes: ['visual-observation', 'concept-build', 'worked-example', 'contrast'],
    preferredDialogueLayouts: ['teacher-left-content-right', 'corner-avatar', 'narration-only'],
    interactionDemand: 'optional',
    stableLayoutRule: '原图和放大窗位置固定，放大对象随讲解切换。',
    defaultFallback: '用并排的裁切图和文字说明替代动态放大。',
    auditFocus: '检查放大对象是否就是 narrationAnchor，且不盖住证据。',
  },
  'path-tracing': {
    id: 'path-tracing',
    label: '路径追踪',
    purpose: '呈现视线、运动、时间、论证或情感推进路径。',
    supportedSceneTypes: ['visual-observation', 'concept-build', 'contrast', 'recap'],
    preferredDialogueLayouts: ['corner-avatar', 'narration-only', 'no-character'],
    interactionDemand: 'optional',
    stableLayoutRule: '路径覆盖层必须轻，不能把主体对象框死或遮盖。',
    defaultFallback: '用 1-2-3 的路径节点和短箭头替代动态轨迹。',
    auditFocus: '检查路径是否帮助理解，不允许装饰性绕线。',
  },
  'comparison-slider': {
    id: 'comparison-slider',
    label: '对照滑块',
    purpose: '比较两种状态、两种解法、前后变化或相近意象。',
    // v5 M2:ai-verify(AI 说法 vs 揭底)、ai-inquiry(浅问 vs 追问)都是对照结构,
    // 复用本技法渲染,不新增专属组件。
    supportedSceneTypes: ['contrast', 'worked-example', 'visual-observation', 'ai-verify', 'ai-inquiry'],
    preferredDialogueLayouts: ['corner-avatar', 'narration-only'],
    interactionDemand: 'optional',
    stableLayoutRule: '左右对照区宽度稳定，滑块只改变对照边界。',
    defaultFallback: '左右并排静态对照，保留相同标尺和标题。',
    auditFocus: '检查对照维度是否明确，不允许只是换图。',
  },
  timeline: {
    id: 'timeline',
    label: '时间线',
    purpose: '呈现历史、叙事、实验或推理的先后关系。',
    supportedSceneTypes: ['concept-build', 'contrast', 'recap'],
    preferredDialogueLayouts: ['teacher-left-content-right', 'corner-avatar', 'narration-only'],
    interactionDemand: 'optional',
    stableLayoutRule: '时间轴位置固定，当前节点高亮随讲解移动。',
    defaultFallback: '静态时间轴加当前节点标记。',
    auditFocus: '检查先后关系是否清楚，节点文字不能挤成清单。',
  },
  'draggable-model': {
    id: 'draggable-model',
    label: '可拖模型',
    purpose: '让学生通过移动对象理解结构、空间、分类或变量关系。',
    supportedSceneTypes: ['concept-build', 'practice', 'worked-example'],
    preferredDialogueLayouts: ['corner-avatar', 'narration-only'],
    interactionDemand: 'required',
    stableLayoutRule: '拖拽区和反馈区固定，角色不能盖住可操作对象。',
    defaultFallback: '用预设状态切换替代拖拽。',
    auditFocus: '检查操作是否真的改变理解，不允许为互动而互动。',
  },
  'dynamic-chart': {
    id: 'dynamic-chart',
    label: '动态图表',
    purpose: '呈现数据变化、比例关系、变量趋势和证据读图。',
    supportedSceneTypes: ['visual-observation', 'concept-build', 'practice'],
    preferredDialogueLayouts: ['corner-avatar', 'narration-only', 'no-character'],
    interactionDemand: 'optional',
    stableLayoutRule: '坐标、比例尺和图例固定，只更新数据或高亮。',
    defaultFallback: '静态图表加分步高亮。',
    auditFocus: '检查图表比例和标签是否准确，不能为了好看改数据关系。',
  },
  simulation: {
    id: 'simulation',
    label: '轻量模拟',
    purpose: '呈现可观察的因果机制、实验现象或物理变化。',
    supportedSceneTypes: ['visual-observation', 'concept-build', 'practice'],
    preferredDialogueLayouts: ['corner-avatar', 'narration-only', 'no-character'],
    interactionDemand: 'optional',
    stableLayoutRule: '模拟区、参数区和结论区分开，参数变化不能造成跳版。',
    defaultFallback: '用三个关键状态帧解释机制。',
    auditFocus: '检查模拟是否准确，是否有清楚的降级状态。',
  },
  'step-replay': {
    id: 'step-replay',
    label: '步骤回放',
    purpose: '复盘解题、实验、朗读、分析或写作修改的关键步骤。',
    supportedSceneTypes: ['worked-example', 'practice', 'recap', 'source-reading'],
    preferredDialogueLayouts: ['teacher-left-content-right', 'student-right-content-left', 'corner-avatar'],
    interactionDemand: 'optional',
    stableLayoutRule: '步骤区固定，当前步骤放大或高亮，已完成步骤退为浅色。',
    defaultFallback: '完整步骤列表加当前步骤标记。',
    auditFocus: '检查每一步是否有动作和判断，不允许只有提纲。',
  },
} satisfies Record<SceneTechniqueId, SceneTechniqueSpec>

export function sceneTechniqueSpec(id: SceneTechniqueId): SceneTechniqueSpec {
  return SCENE_TECHNIQUE_REGISTRY[id]
}

export function sceneTechniquesForSceneType(sceneType: SceneType): SceneTechniqueSpec[] {
  return Object.values(SCENE_TECHNIQUE_REGISTRY).filter(spec =>
    (spec.supportedSceneTypes as readonly SceneType[]).includes(sceneType),
  )
}

export function isInteractiveTechnique(id: SceneTechniqueId): boolean {
  return SCENE_TECHNIQUE_REGISTRY[id].interactionDemand !== 'none'
}

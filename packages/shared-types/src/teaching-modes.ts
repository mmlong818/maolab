import type { KnowledgeType } from './knowledge-type-rules.js'

/**
 * Teaching Mode Registry
 *
 * "教学方法" 在 maolab 的语义是 "老师 + 媒介 + 学生参与" 的组合形态，
 * 不是 5E / 苏格拉底这类抽象教学方法论。
 *
 * 设计目标：开放可扩展。加新 mode = 在下方 TEACHING_MODES 数组 push 一项 +
 * 在 ContentWorker 注册对应处理函数。核心管线不动。
 */

/** 学生参与强度分类 */
export type ParticipationLevel =
  | 'watch' // 纯听看
  | 'respond' // 听讲 + 选答/拖拽（一次性）
  | 'explore' // 自由操作（滑块/分支）
  | 'create' // 自创内容
  | 'dialogue' // 多轮对答

/** 媒介主类型 */
export type MediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'model-3d'
  | 'animation'
  | 'diagram'
  | 'table'
  | 'timeline'
  | 'experiment-sim'
  | 'text'
  | 'interactive-html'
  | 'quiz-form'
  | 'dialogue-turns'

export interface TeachingModeSpec {
  /** 稳定 id，用于 DB / API */
  id: string
  /** 显示给老师选的中文名 */
  label: string
  /** 一句话描述 */
  description: string
  /** 媒介主类型 */
  media: MediaKind
  /** 学生参与强度 */
  participation: ParticipationLevel
  /** 哪个 content worker 处理（在 generator 包注册） */
  worker:
    | 'image'
    | 'slide'
    | 'animation'
    | 'video'
    | 'audio'
    | 'model3d'
    | 'hotspot'
    | 'comparison'
    | 'drag-drop'
    | 'quiz'
    | 'cloze'
    | 'branching'
    | 'interactive'
    | 'math'
  /** 适合什么主题（用于 CurriculumDesigner 选 mode 时的 hint） */
  goodFor: string[]
  /**
   * 该 mode 适配哪些知识类型（Anderson & Krathwohl 2001）
   * 由 CurriculumDesigner 在 knowledgeType → modeId 校验时使用。
   * additive 字段，未填表示不参与 knowledge-type 维度匹配。
   */
  goodForKnowledgeTypes?: KnowledgeType[]
}

/**
 * Mode 注册表（初版 6 个，未来 push 即可扩展）
 *
 * 加新 mode 的步骤：
 * 1. 在此数组追加一项
 * 2. 如 worker 是新的，在 packages/generator 加对应 worker 文件
 * 3. 在 ClassroomRuntime 配匹配的 View 组件
 */
export const TEACHING_MODES: ReadonlyArray<TeachingModeSpec> = [
  {
    id: 'lecture-image',
    label: '讲解 + 配图',
    description: '老师讲解，配静态图，最基础形态',
    media: 'image',
    participation: 'watch',
    worker: 'image',
    goodFor: ['概念引入', '事实陈述', '生活情境'],
    // factual 永远适用；conceptual 在新手缺脚手架时降级到此（KSC 2006）
    goodForKnowledgeTypes: ['factual', 'conceptual'],
  },
  {
    id: 'lecture-diagram',
    label: '讲解 + 分步图解',
    description: '老师按步骤讲解，配分步图（推导/流程/结构）',
    media: 'diagram',
    participation: 'watch',
    worker: 'slide',
    goodFor: ['数学推导', '流程说明', '结构图'],
    // procedural 主场；conceptual 的结构化讲授也用得上
    goodForKnowledgeTypes: ['procedural', 'conceptual'],
  },
  {
    id: 'lecture-animation',
    label: '讲解 + 动画演示',
    description: '老师讲解，配动画展示过程（化学反应、物理运动）',
    media: 'animation',
    participation: 'watch',
    worker: 'animation',
    goodFor: ['过程类', '动态变化', '机制演示'],
    goodForKnowledgeTypes: ['procedural', 'conceptual'],
  },
  {
    id: 'interactive-drag',
    label: '提问 + 拖拽分类',
    description: '老师设问，学生拖物件到目标桶',
    media: 'interactive-html',
    participation: 'respond',
    worker: 'drag-drop',
    goodFor: ['分类辨析', '匹配关系', '识别正反例'],
    goodForKnowledgeTypes: ['conceptual', 'factual'],
  },
  {
    id: 'interactive-quiz',
    label: '提问 + 选择/填空',
    description: '老师提问后学生作答（选择题/填空题）',
    media: 'quiz-form',
    participation: 'respond',
    worker: 'quiz',
    goodFor: ['即时检测', '知识巩固', '错题诊断'],
    goodForKnowledgeTypes: ['factual', 'conceptual', 'procedural'],
  },
  {
    id: 'socratic-dialogue',
    label: '苏格拉底问答',
    description: '老师持续追问，引学生自己得出结论',
    media: 'dialogue-turns',
    participation: 'dialogue',
    worker: 'branching',
    goodFor: ['哲学/逻辑', '深度思辨', '概念辨析'],
    // 仅对已有脚手架的 conceptual 适用；metacognitive 主场
    goodForKnowledgeTypes: ['conceptual', 'metacognitive'],
  },
]

export type TeachingModeId = (typeof TEACHING_MODES)[number]['id']

/** 工具：按 id 取 mode */
export function getTeachingMode(id: string): TeachingModeSpec | undefined {
  return TEACHING_MODES.find((m) => m.id === id)
}

/** 工具：是否合法 id */
export function isTeachingModeId(id: unknown): id is TeachingModeId {
  return typeof id === 'string' && TEACHING_MODES.some((m) => m.id === id)
}

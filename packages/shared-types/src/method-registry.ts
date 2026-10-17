/**
 * MethodSpec Registry — Sprint 3.1 / 3.2
 *
 * 6 种内置教学方法的完整定义：
 * - 各自的 atom 组合规则（哪些 atom type 可出现、按什么顺序、必含什么）
 * - 各自的 prompt 模板（用于 RundownGenerator 输入）
 * - 各自的可视化标签
 */

import type { TeachingMethodId, MethodSpec } from './teaching-method-plan.js'
import type { AtomType } from './scene-atom.js'

/** 一种方法的完整规则 */
export interface MethodCompositionRule {
  /** 允许出现的 atom 类型（其他类型自动拒收） */
  allowedAtomTypes: AtomType[]
  /** 段落必须以这些类型之一收尾 */
  mustEndWith: AtomType[]
  /** 段落必须包含至少一个这些类型 */
  mustInclude: AtomType[]
  /** 段落禁止出现的 atom 类型 */
  forbidden: AtomType[]
  /** 互动密度限制：允许多少个 single-question per segment */
  maxQuestionsPerSegment: number
}

/** 完整的 MethodSpec（含组合规则 + UI 元数据） */
export interface MethodSpecFull extends MethodSpec {
  /** UI 颜色（用于卡片左条等） */
  uiColor: string
  /** UI emoji（卡片小图标） */
  uiEmoji: string
  /** 组合规则 */
  composition: MethodCompositionRule
  /** RundownGenerator 用的 prompt 片段（"按本方法编排"） */
  rundownPromptHint: string
}

export const METHOD_REGISTRY: Record<TeachingMethodId, MethodSpecFull> = {
  lecture: {
    id: 'lecture',
    displayName: '纯授课',
    positioning: '连贯讲解，无互动打断',
    studentAgency: 0.0,
    allowsInteraction: false,
    requiresClaimClosure: true,
    bestFor: '密集信息传授、推导、引入新知识',
    uiColor: '#0ea5e9',
    uiEmoji: '📖',
    composition: {
      allowedAtomTypes: [
        'image-caption',
        'single-claim',
        'single-example',
        'derivation-step',
        'demonstration',
        'recap-bullet',
      ],
      mustEndWith: ['single-claim', 'recap-bullet'],
      mustInclude: ['single-claim'],
      forbidden: ['single-question'],
      maxQuestionsPerSegment: 0,
    },
    rundownPromptHint:
      '本段为纯授课。绝不包含任何提问节点。按"引入→举例→推导→收束论断"组织。最后一个节点必须是 single-claim 或 recap-bullet。',
  },

  interactive: {
    id: 'interactive',
    displayName: '可交互',
    positioning: '讲解 + 提问 + 反馈循环',
    studentAgency: 0.5,
    allowsInteraction: true,
    requiresClaimClosure: true,
    bestFor: '检验理解、防止溜号、巩固',
    uiColor: '#16a34a',
    uiEmoji: '💬',
    composition: {
      allowedAtomTypes: [
        'image-caption',
        'single-claim',
        'single-question',
        'single-example',
        'derivation-step',
        'recap-bullet',
      ],
      mustEndWith: ['single-claim', 'recap-bullet'],
      mustInclude: ['single-question'],
      forbidden: [],
      maxQuestionsPerSegment: 3,
    },
    rundownPromptHint:
      '本段为可交互。讲两三步后插入一个 single-question 检验理解。错答时给 hint 或 reteach。最后用 single-claim/recap-bullet 收束。',
  },

  socratic: {
    id: 'socratic',
    displayName: '苏格拉底',
    positioning: '连续提问，学生自得结论',
    studentAgency: 0.8,
    allowsInteraction: true,
    requiresClaimClosure: true,
    bestFor: '人文 / 思辨 / 价值判断 / 概念辨析',
    uiColor: '#a855f7',
    uiEmoji: '🧠',
    composition: {
      allowedAtomTypes: [
        'single-question',
        'dialogue-turn',
        'single-claim',
        'single-example',
        'recap-bullet',
      ],
      mustEndWith: ['single-claim'],
      mustInclude: ['single-question', 'dialogue-turn'],
      forbidden: ['demonstration'],
      maxQuestionsPerSegment: 6,
    },
    rundownPromptHint:
      '本段为苏格拉底式。以 single-question 链条推进，每问之后用 dialogue-turn 呼应学生回应。最后由学生自得结论后，老师用 single-claim 凝练。绝不直接讲结论。',
  },

  flipped: {
    id: 'flipped',
    displayName: '翻转课堂',
    positioning: '先操作 / 试错，再讲解',
    studentAgency: 0.7,
    allowsInteraction: true,
    requiresClaimClosure: true,
    bestFor: '数学 / 编程 / 实验 / 步骤型技能',
    uiColor: '#f59e0b',
    uiEmoji: '🔁',
    composition: {
      allowedAtomTypes: [
        'demonstration',
        'single-question',
        'derivation-step',
        'single-claim',
        'recap-bullet',
      ],
      mustEndWith: ['single-claim', 'recap-bullet'],
      mustInclude: ['demonstration', 'single-question'],
      forbidden: [],
      maxQuestionsPerSegment: 2,
    },
    rundownPromptHint:
      '本段为翻转课堂。先用 demonstration 让学生自己摸索，再用 single-question 检验，最后用 derivation-step / single-claim 讲解原理。先做后讲。',
  },

  'case-study': {
    id: 'case-study',
    displayName: '案例研讨',
    positioning: '复杂案例分阶段拆解',
    studentAgency: 0.6,
    allowsInteraction: true,
    requiresClaimClosure: true,
    bestFor: '商业 / 医学 / 法律 / 历史 / 决策类',
    uiColor: '#ef4444',
    uiEmoji: '📋',
    composition: {
      allowedAtomTypes: [
        'single-example',
        'single-question',
        'derivation-step',
        'dialogue-turn',
        'single-claim',
        'recap-bullet',
      ],
      mustEndWith: ['single-claim', 'recap-bullet'],
      mustInclude: ['single-example', 'single-question'],
      forbidden: [],
      maxQuestionsPerSegment: 4,
    },
    rundownPromptHint:
      '本段为案例研讨。开头 single-example 给完整案例，中间多个 single-question 引导拆解（每问聚焦案例一个方面），derivation-step 串起分析链条，最后 single-claim 抽象出通用结论。',
  },

  quest: {
    id: 'quest',
    displayName: '闯关',
    positioning: '必须做对才解锁下一关',
    studentAgency: 0.9,
    allowsInteraction: true,
    requiresClaimClosure: false,
    bestFor: '工具操作 / 编程语法 / 公式应用',
    uiColor: '#ec4899',
    uiEmoji: '🎯',
    composition: {
      allowedAtomTypes: ['single-question', 'demonstration', 'recap-bullet'],
      mustEndWith: ['recap-bullet'],
      mustInclude: ['single-question'],
      forbidden: ['single-claim', 'dialogue-turn'],
      maxQuestionsPerSegment: 5,
    },
    rundownPromptHint:
      '本段为闯关。连续 single-question 关卡，每关 allowRetry=true 且 onIncorrect 给 hint 不放过。可穿插 demonstration 提示。最后 recap-bullet 总结闯关获得的能力。',
  },
}

export function getMethodSpec(id: TeachingMethodId): MethodSpecFull {
  return METHOD_REGISTRY[id]
}

/** 检查一段 atom 序列是否符合方法的组合规则 */
export interface CompositionViolation {
  rule: 'forbidden-atom' | 'missing-required' | 'over-quota' | 'bad-ending'
  message: string
}

export function checkComposition(
  method: TeachingMethodId,
  atomTypesInput: AtomType[],
): CompositionViolation[] {
  // P1: media-interlude 是用户显式插入的横切媒体节点(歌/漫画), 对任何教学方法的
  // 组合规则透明——不计入 allowed/forbidden/段尾/题量检查
  const atomTypes: AtomType[] = atomTypesInput.filter(t => t !== 'media-interlude')
  const spec = METHOD_REGISTRY[method]
  const violations: CompositionViolation[] = []

  for (const t of atomTypes) {
    if (spec.composition.forbidden.includes(t)) {
      violations.push({ rule: 'forbidden-atom', message: `方法 ${method} 禁止 atom 类型 ${t}` })
    }
    if (!spec.composition.allowedAtomTypes.includes(t)) {
      violations.push({ rule: 'forbidden-atom', message: `方法 ${method} 不允许 atom 类型 ${t}` })
    }
  }

  for (const must of spec.composition.mustInclude) {
    if (!atomTypes.includes(must)) {
      violations.push({ rule: 'missing-required', message: `方法 ${method} 必须包含至少一个 ${must}` })
    }
  }

  const last = atomTypes[atomTypes.length - 1]
  if (last && !spec.composition.mustEndWith.includes(last)) {
    violations.push({
      rule: 'bad-ending',
      message: `方法 ${method} 必须以 ${spec.composition.mustEndWith.join(' 或 ')} 结尾，实际为 ${last}`,
    })
  }

  const qCount = atomTypes.filter(t => t === 'single-question').length
  if (qCount > spec.composition.maxQuestionsPerSegment) {
    violations.push({
      rule: 'over-quota',
      message: `方法 ${method} 单段题量 ${qCount} 超出限制 ${spec.composition.maxQuestionsPerSegment}`,
    })
  }

  return violations
}

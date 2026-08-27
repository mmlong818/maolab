/**
 * Rundown — v2 节目单 / 教学流程细化大纲（Sprint 0）
 *
 * 输入：已审批的 TeachingMethodPlan
 * 输出：把每个 MethodSegment 进一步拆成 RundownNode 序列，
 *       细到"先讲什么 → 再讲什么 → 用什么例子 → 何时提问 → 正确/错误分支"
 *
 * 节目单是讲稿生成的"分镜稿"，是节奏、互动、分支的最终蓝本。
 * 用户必须显式审批 Rundown 才能进入讲稿生成。
 */

import type { AtomType } from './scene-atom.js'
import type { TeachingMethodId } from './teaching-method-plan.js'

/** 节目单节点的角色（在教学叙事中的功能） */
export type RundownNodeRole =
  | 'hook'           // 开场钩子 / 情境锚定
  | 'activate'       // 激活先验 / 旧知唤醒
  | 'introduce'      // 引入新概念
  | 'develop'        // 展开 / 推导
  | 'illustrate'     // 举例
  | 'probe'          // 提问 / 检测
  | 'practice'       // 练习
  | 'synthesize'     // 归纳 / 收束
  | 'recap'          // 回顾要点
  | 'preview-next'   // 预告下节

/** 互动失败时的分支策略 */
export type IncorrectBranchStrategy =
  | 'reteach'        // 重新讲一遍（生成 reteach 节点）
  | 'hint'           // 给提示后再问一次
  | 'simpler'        // 切到更简单的同主题题目
  | 'continue'       // 不分支，给反馈后继续
  | 'escalate'       // 标记为困难点，移交老师

export interface RundownInteractionSpec {
  /** 是否包含互动 */
  hasInteraction: boolean
  /** 互动提示语（"请写出 y 关于 x 的函数式"） */
  prompt?: string | undefined
  /** 答对路径策略 */
  onCorrect?: 'celebrate' | 'silent' | 'extend' | undefined
  /** 答错路径策略 */
  onIncorrect?: IncorrectBranchStrategy | undefined
  /** 最大重试次数 */
  maxRetries?: number | undefined
}

export interface RundownNode {
  /** 稳定 id */
  id: string
  /** 在 segment 内的顺序 */
  order: number
  /** 在节目单整体中的角色 */
  role: RundownNodeRole
  /** 这一节预期生成的 Atom 类型（生成器据此选 worker） */
  expectedAtomType: AtomType
  /** 一句话内容简介（"用出租车计费引入一次函数"） */
  brief: string
  /** 关联 TeachingPlan.objectives 的 id */
  objectiveIds: string[]
  /** 脚手架信息（举什么例子、用什么数据、关键词） */
  scaffolding: {
    /** 必须提到的关键词 / 概念 */
    mustMention: string[]
    /** 必须避免的措辞 / 概念（防止越界或误区） */
    mustAvoid: string[]
    /** 引用的具体素材（若有教材，引用页码 / 段落 id） */
    materialRefs?: string[] | undefined
  }
  /** 互动规范 */
  interaction: RundownInteractionSpec
  /** 估计时长（秒） */
  estimatedSeconds: number
  /**
   * PR3a-prereq: 该节点对应的教材叶子节点 id (chapter_node_id).
   * 由 rundown 生成器从 TeachingPlanV2.sourceLeafId 继承; 旧课程为 undefined.
   * atom-worker 据此填 SceneAtom.sourceLeafId, 让学情按叶子聚合.
   */
  sourceLeafId?: string
  /**
   * P1 媒体节点（仅 expectedAtomType === 'media-interlude' 时有意义）：
   * 媒体体裁。song/comic 已实装；story/standup/palace 预留（presentation-system-design P5）。
   */
  mediaKind?: 'song' | 'comic' | 'story' | 'standup' | 'palace'
}

/** 节目单中的一段（对应 TeachingMethodPlan.segments[i]） */
export interface RundownSegment {
  /** 与 MethodSegment.id 一致 */
  id: string
  /** 沿用方法 plan 的 method */
  method: TeachingMethodId
  /** 节目单节点序列 */
  nodes: RundownNode[]
}

export interface Rundown {
  /** 与 Course / TeachingPlan 同 id */
  id: string
  segments: RundownSegment[]
  /** 全局变量：节奏建议、整体语气、风格基调 */
  globalNotes: {
    pacing: 'tight' | 'comfortable' | 'slow'
    tone: 'formal' | 'friendly' | 'playful' | 'rigorous'
    /** 整体禁忌（如"不要使用宗教比喻"） */
    constraints: string[]
  }
  meta: {
    generatedAt: number
    approvedAt?: number
    editedByUser: boolean
    revision: number
  }
}

export type RundownStatus = 'draft' | 'editing' | 'approved' | 'rejected'

/** 节目单整体校验问题 */
export interface RundownValidationIssue {
  nodeId?: string
  segmentId?: string
  severity: 'error' | 'warning'
  rule:
    | 'objective-not-covered'
    | 'method-atom-mismatch'
    | 'orphan-node'
    | 'over-budget'
    | 'compound-node-detected'
  message: string
}

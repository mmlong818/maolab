/**
 * TeachingMethodPlan — v2 教学方法方案（Sprint 0）
 *
 * 输入：已审批的 TeachingPlan
 * 输出：把课程切成若干段（segment），每段分配一种教学方法 + 选择理由
 *
 * 设计原则：方法可混合，但同一 segment 内只能用一种方法
 * 用户必须显式审批 TeachingMethodPlan 才能进入节目单生成
 */

/** 教学方法 id（与 Sprint 3 方法库注册表对齐） */
export type TeachingMethodId =
  | 'lecture'       // 纯授课：连贯讲解，无 interaction
  | 'interactive'   // 可交互：提问 + 学生作答 + 反馈
  | 'socratic'      // 苏格拉底：连续提问引导学生自得结论
  | 'flipped'       // 翻转课堂：先操作 / 试错，再讲解
  | 'case-study'    // 案例研讨：复杂案例分阶段拆解
  | 'quest'         // 闯关：必须做对才解锁下一关

/** 方法的核心特征（节目单生成器据此组装 atom） */
export interface MethodSpec {
  id: TeachingMethodId
  /** 显示名 */
  displayName: string
  /** 一句话定位 */
  positioning: string
  /** 学生主动性 0–1（0=纯听，1=纯做） */
  studentAgency: number
  /** 是否允许 interaction atom */
  allowsInteraction: boolean
  /** 是否强制每段以 claim 收束 */
  requiresClaimClosure: boolean
  /** 推荐使用场景（自由文本） */
  bestFor: string
}

/** 节目单层之上的"分段" — 把课程粗切为若干教学环节 */
export interface MethodSegment {
  /** 稳定 id */
  id: string
  /** 在 plan 中的顺序（0 起） */
  order: number
  /** 关联到 TeachingPlan.objectives 的 id 列表 */
  objectiveIds: string[]
  /** 本段标题（学生可见） */
  title: string
  /** 本段使用的教学方法 */
  method: TeachingMethodId
  /** 为什么选这个方法（AI 生成，用户可改） */
  rationale: string
  /** 估计时长（分钟） */
  estimatedMinutes: number
}

export interface TeachingMethodPlan {
  /** 与 Course / TeachingPlan 同 id */
  id: string
  /** 切分后的分段 */
  segments: MethodSegment[]
  /** 整体策略说明（如"开场苏格拉底激活，中段案例展开，收尾闯关巩固"） */
  overallStrategy: string
  /** 总课时（分钟） */
  totalMinutes: number
  meta: {
    generatedAt: number
    approvedAt?: number
    editedByUser: boolean
    revision: number
  }
}

export type TeachingMethodPlanStatus = 'draft' | 'editing' | 'approved' | 'rejected'

/**
 * TeachingPlan — v2 教学计划（Sprint 0）
 *
 * 输入：一句话主题 / 段落描述 / 教材文件
 * 输出：知识 + 人 + 教学目的的结构化表达，是节目单的"宪法"
 *
 * 用户必须显式审批 TeachingPlan 才能进入方法规划阶段
 */

/** 学段 */
export type AudienceStage = 'primary' | 'middle' | 'high' | 'college' | 'adult' | 'unspecified'

/** 教学深度（Bloom 改良 4 档） */
export type TeachingDepth = 'awareness' | 'understanding' | 'application' | 'analysis'

/** 教学目的（顶层意图） */
export type TeachingPurpose =
  | 'introduce'    // 引入新概念
  | 'reinforce'    // 巩固已学
  | 'review'       // 复习串讲
  | 'enrichment'   // 拓展加深
  | 'remediation'  // 补救纠错
  | 'assessment'   // 形成性评估

export interface AudienceProfile {
  stage: AudienceStage
  /** 年级（可选，配合 stage 精确化） */
  grade?: string | undefined
  /** 已具备的前置知识 */
  priorKnowledge: string[]
  /** 已知薄弱点 / 误区 */
  knownGaps: string[]
  /** 学习风格倾向（自由文本，1–3 句） */
  learningStyle?: string | undefined
}

export interface KnowledgeBoundary {
  /** 必须包含的核心概念 */
  inScope: string[]
  /** 明确不展开（避免越界） */
  outOfScope: string[]
  /** 邻接学科 / 上下游知识连接 */
  adjacent: string[]
}

export interface LearningObjective {
  /** 稳定 id，用于关联节目单 segment */
  id: string
  /** 一句话目标描述（动作 + 知识 + 标准） */
  statement: string
  /** Bloom 层级 */
  bloomLevel: 'L1-Remember' | 'L2-Understand' | 'L3-Apply' | 'L4-Analyze' | 'L5-Evaluate' | 'L6-Create'
  /** 可观测的成功指标 */
  successCriteria: string
}

export interface TeachingPlanV2 {
  /** Plan id（= courseId） */
  id: string
  /** 原始输入摘要（一句话主题 + 是否含教材） */
  topic: string
  hasReferenceMaterial: boolean
  /** 受众画像 */
  audience: AudienceProfile
  /** 知识边界 */
  knowledgeBoundary: KnowledgeBoundary
  /** 知识内容核心摘要（200–400 字） */
  knowledgeSummary: string
  /** 知识视野：本主题在更大知识图谱中的位置 */
  knowledgeVision: string
  /** 教学深度 */
  depth: TeachingDepth
  /** 教学目的 */
  purpose: TeachingPurpose
  /** 学习目标（≥ 1） */
  objectives: LearningObjective[]
  /**
   * PR3a-prereq: 教材叶子节点 id (来自 CourseV2.textbookSource.sectionId ?? chapterId).
   * 用于 SceneAtom.sourceLeafId 透传, 让学情聚合按教材叶子粒度归类.
   * 仅当用户通过国家智慧教育平台选定章节时存在; 纯 OCR / 一句话主题流程下为 undefined.
   */
  sourceLeafId?: string
  /** AI 生成 + 用户编辑痕迹 */
  meta: {
    generatedAt: number
    approvedAt?: number
    editedByUser: boolean
    revision: number
  }
}

/** TeachingPlanV2 审批状态 */
export type TeachingPlanV2Status = 'draft' | 'editing' | 'approved' | 'rejected'

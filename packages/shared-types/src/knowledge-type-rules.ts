/**
 * Knowledge Type → Teaching Mode 规则映射（阶段 A1.1）
 *
 * 设计依据：
 * - Anderson & Krathwohl (2001) 四类知识维度
 * - Kalyuga et al. (2003) Expertise Reversal Effect — 新手在缺脚手架时
 *   不适合开放式问答，应降级为直接讲授（CHALLENGE-A7：KSC 2006 修正）
 * - procedural 当前用 lecture-diagram 作 A 阶段占位，B 阶段切换 worked-example
 *
 * 此函数是 CurriculumDesigner 的 deterministic fallback：
 * 当 LLM 未指定 mode 或 mode 校验失败时，按本表回退到合规默认值。
 */

import type { TeachingModeId } from './teaching-modes.js'

export type KnowledgeType =
  | 'factual'
  | 'conceptual'
  | 'procedural'
  | 'metacognitive'

export interface ResolveTeachingModeResult {
  modeId: TeachingModeId
  source: 'rule'
}

/**
 * 根据知识类型 + 学习者是否已有先验脚手架，回退到默认 teaching mode。
 *
 * 映射表：
 *   factual       → lecture-image       （任何情况）
 *   conceptual    + hasPriorScaffold    → socratic-dialogue
 *   conceptual    + !hasPriorScaffold   → lecture-image     （KSC 2006 降级）
 *   procedural    → lecture-diagram     （A 阶段占位）
 *   metacognitive → socratic-dialogue   （判断/迁移类，需要对话）
 */
export function resolveTeachingMode(
  knowledgeType: KnowledgeType,
  hasPriorScaffold: boolean,
): ResolveTeachingModeResult {
  let modeId: TeachingModeId
  switch (knowledgeType) {
    case 'factual':
      modeId = 'lecture-image'
      break
    case 'conceptual':
      modeId = hasPriorScaffold ? 'socratic-dialogue' : 'lecture-image'
      break
    case 'procedural':
      // A 阶段占位；B 阶段计划切换为 worked-example
      modeId = 'lecture-diagram'
      break
    case 'metacognitive':
      // metacognitive 类天然需要对话式追问；新手亦不降级，
      // 因为本身就是 "判断/反思" 任务，没有"先掌握再追问"的预设
      modeId = 'socratic-dialogue'
      break
  }
  return { modeId, source: 'rule' }
}

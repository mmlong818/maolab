/**
 * KP 校验 helper — 纯规则层，零 LLM 调用
 *
 * 检查 3 类问题：
 *   长度超限 / (B) 命名污染（含教学动作词）/ (C) 空泛无信息（仅通用词）
 *
 * (A) 离题检查依赖语义，规则层无法覆盖；但 KP 本身从教材正文抽出，
 *     正文就是该叶子内容，离题概率极低，直接放行。
 *
 * llmCall / model 参数保留以兼容调用方签名，内部不使用。
 */

import type { LLMCaller } from '../src/annotation-pipeline.js'

export interface ValidatorInput {
  leafTitle: string
  ancestorTitles: string[]
  canonicalName: string
  canonicalNameEn: string
  subject: string
}

export interface ValidatorOutput {
  valid: boolean
  reason: string
}

// (B) 命名污染：含教学动作描述，不是知识点本身
const POLLUTION_PATTERNS: RegExp[] = [
  /教师指|学生应|课堂上|教学中|本节课|学习过程|教学活动/,
  /掌握方法|培养能力|提高认识|感受体验|学会运用/,
  /通过.*学习|经历.*过程|体验.*活动/,
]

// (C) 空泛无信息：名字仅含通用词，没有具体知识内容
const VAGUE_PATTERNS: RegExp[] = [
  /^(基础知识|重点内容|学习要求|主要内容|基本概念|核心内容|重要知识)$/,
  /^第[一二三四五六七八九十百\d]+[章节课单元](\s*内容)?$/,
  /^本[章节课单元](的?)(重点|难点|内容|知识点|总结|小结)?$/,
  /^(知识|内容|概念|原理|定理|公式)(点|的|总结|归纳|梳理)?$/,
]

export async function validateKp(
  input: ValidatorInput,
  _llmCall: LLMCaller,
  _model = 'claude-cli:haiku',
): Promise<ValidatorOutput> {
  // 长度检查
  const hasCJK = /[一-鿿]/.test(input.canonicalName)
  if (hasCJK && input.canonicalName.length > 40)
    return { valid: false, reason: `canonicalName 中文超过 40 字符 (${input.canonicalName.length})` }
  if (!hasCJK && input.canonicalNameEn.length > 80)
    return { valid: false, reason: `canonicalNameEn 英文超过 80 字符 (${input.canonicalNameEn.length})` }

  // (B) 命名污染
  for (const p of POLLUTION_PATTERNS) {
    if (p.test(input.canonicalName))
      return { valid: false, reason: `命名污染: "${input.canonicalName}"` }
  }

  // (C) 空泛无信息
  for (const p of VAGUE_PATTERNS) {
    if (p.test(input.canonicalName))
      return { valid: false, reason: `空泛无信息: "${input.canonicalName}"` }
  }

  return { valid: true, reason: 'rule-pass' }
}

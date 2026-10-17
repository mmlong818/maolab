import { misconceptionSourcesOf, type LessonScene, type MainlineCourse } from '../../../lib/mainline/domain.js'
import { aiMasterFactor } from '../../../lib/mainline/presentation/master-routing.js'
import { pickMaster } from './master-hash'

/**
 * ai-master-select · ai-verify/ai-inquiry 母版选择的纯逻辑(2026-07-21 4+3 母版扩容)
 *
 * 单独成文件(而非塞进 ai-scenes.tsx)只为一件事:让选择逻辑可以被
 * __tests__/*.test.ts 直接单测,不牵连 ai-scenes.tsx 里一堆组件级 JSX/
 * '@/lib/mainline' 别名 import(vitest 未配 tsconfig-paths,'@/' 在测试环境
 * 不可解析)。本文件只用 domain.ts 的相对路径 import + master-hash 的纯函数。
 */

/**
 * 加权版 pickMaster:候选按 weights 表分配哈希桶份额,权重越大命中概率越高,
 * 但不是非黑即白的"锁死"——所有候选始终有份额。真实建课数据显示"骨架合并
 * (misconceptionSources.length>=2)"是绝大多数 ai-verify 幕的常态(几乎每门课
 * 的误区标注都≥3条,merge 后必然落进 N>=2),如果给③清单式 100% 概率,
 * 同一门课的所有 ai-verify 幕会重新变回清一色同款——这正是本轮扩容要根治的
 * 病灶。加权轮换让"清单式是原生形态、更常出现"与"同课仍有真实形态差异"两者
 * 都成立。
 */
function weightedPick<M extends string>(
  course: MainlineCourse,
  scene: LessonScene,
  sceneType: 'ai-verify' | 'ai-inquiry',
  salt: string,
  order: readonly M[],
  weights: Readonly<Record<M, number>>,
): M {
  // 内容特征权重 × 学段学科气质因子(master-routing):低学段偏便签钉板/对话流,
  // 高中偏审讯式;因子含 0.15 地板,任何母版都不会被路由清零。
  const buckets = order.map(m => Math.max(1, Math.round(weights[m] * aiMasterFactor(sceneType, m, course) * 20)))
  const total = buckets.reduce((sum, b) => sum + b, 0)
  const bucket = pickMaster(course, scene, salt, total)
  let acc = 0
  for (let i = 0; i < order.length; i++) {
    acc += buckets[i]!
    if (bucket < acc) return order[i]!
  }
  return order[order.length - 1]!
}

/**
 * ai-verify 4 母版:①对照(既有)②审讯式③找茬清单式④便签钉板式。
 *
 * 找茬清单式是「骨架合并幕」(一个片段收编 ≥2 条误概念)的原生形态——细分槽
 * aiClaim1..N/reveal1..N 本就是为逐条清单准备的,合并幕里权重最高(半数哈希
 * 桶命中它),但①②④依然各占份额,同课多条合并幕不会全部撞脸。单条误区时
 * 清单式没有素材可摆(硬凑会显得空),从候选中剔除,在①对照/②审讯式/④便签
 * 钉板式三者间等权轮换。
 */
export const AI_VERIFY_MASTERS = ['comparison', 'interrogation', 'checklist', 'sticky-note'] as const
export type AiVerifyMaster = (typeof AI_VERIFY_MASTERS)[number]

const AI_VERIFY_SINGLE_ROTATION: readonly AiVerifyMaster[] = ['comparison', 'interrogation', 'sticky-note']

/** 合并幕权重表:清单式命中一半哈希桶,其余三个母版平分剩下的一半。 */
const AI_VERIFY_MERGED_WEIGHTS: Readonly<Record<AiVerifyMaster, number>> = {
  checklist: 3,
  comparison: 1,
  interrogation: 1,
  'sticky-note': 1,
}

const AI_VERIFY_SINGLE_WEIGHTS: Readonly<Record<AiVerifyMaster, number>> = {
  checklist: 0, // 单条态无清单素材,不在 AI_VERIFY_SINGLE_ROTATION 内,权重表仅为类型完整
  comparison: 1,
  interrogation: 1,
  'sticky-note': 1,
}

export function pickAiVerifyMaster(course: MainlineCourse, scene: LessonScene): AiVerifyMaster {
  const sourcesCount = misconceptionSourcesOf(scene).length
  if (sourcesCount >= 2) return weightedPick(course, scene, 'ai-verify', 'ai-verify-merged', AI_VERIFY_MASTERS, AI_VERIFY_MERGED_WEIGHTS)
  return weightedPick(course, scene, 'ai-verify', 'ai-verify-single', AI_VERIFY_SINGLE_ROTATION, AI_VERIFY_SINGLE_WEIGHTS)
}

/**
 * ai-inquiry 3 母版:①对照(既有)②上下瀑布式③对话流式。
 * 三者都保持"浅问降权/追问升权"的权重修辞,内容形态无强弱之分——
 * 不像 ai-verify 有"合并幕"这种内容特征,基础等权,由学段学科气质因子倾斜
 * (低学段/英语课偏对话流,中学基线仍近似等权轮换)。
 */
export const AI_INQUIRY_MASTERS = ['comparison', 'waterfall', 'chat'] as const
export type AiInquiryMaster = (typeof AI_INQUIRY_MASTERS)[number]

const AI_INQUIRY_BASE_WEIGHTS: Readonly<Record<AiInquiryMaster, number>> = {
  comparison: 1,
  waterfall: 1,
  chat: 1,
}

export function pickAiInquiryMaster(course: MainlineCourse, scene: LessonScene): AiInquiryMaster {
  return weightedPick(course, scene, 'ai-inquiry', 'ai-inquiry', AI_INQUIRY_MASTERS, AI_INQUIRY_BASE_WEIGHTS)
}

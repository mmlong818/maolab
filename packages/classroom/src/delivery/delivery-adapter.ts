/**
 * delivery-adapter — 教材本体 + 学情 → atom 序列决策（Sprint A1.3）
 *
 * 纯函数层。读教材 atoms + 学情 → 输出确定性的 DeliveryPlan。
 * 复用 AdaptiveController 的 mastery/remediation 语义；scene-level shouldSkip
 * 与 atom-level objectiveIds 不完全匹配，因此本层只复用 suggestRemediation，
 * skip 判定直接按 correctRate >= 0.85 阈值（与 controller 的 MASTERY_THRESHOLD 一致）。
 */

import type { SceneAtom, AtomType } from '@maolab/shared-types'
import { AdaptiveController } from '../adaptive/controller.js'

export type KnowledgeType = 'factual' | 'conceptual' | 'procedural' | 'metacognitive'

export interface DeliveryContext {
  courseId: string
  knowledgeType: KnowledgeType
  atoms: SceneAtom[]
  studentHistory?: {
    correctRateByObjective: Record<string, number>
    /** v1.1 PR3b: cluster 维度学情；命中优先于 objective 路径 */
    correctRateByCluster?: Record<string, number>
    consecutiveErrors: number
  }
  /**
   * v1.1 PR3b: leafId → clusterIds 反查表（来自 insights API）。
   * delivery-adapter 是纯函数, 不能查 DB; 调用方预计算并喂进来。
   */
  leafToClusters?: Record<string, string[]>
}

export interface DeliveryPlan {
  orderedAtomIds: string[]
  insertedRemediation: string[]
  skippedAtomIds: string[]
  reason: string
}

const SKIP_THRESHOLD = 0.85
const REMEDIATION_ERROR_THRESHOLD = 2

/** teach 类 atom：用于定位"下一个 teach atom 前"的插入点 */
const TEACH_ATOM_TYPES: ReadonlySet<AtomType> = new Set<AtomType>([
  'image-caption',
  'single-claim',
  'single-example',
  'derivation-step',
  'demonstration',
])

export function buildDeliveryPlan(ctx: DeliveryContext): DeliveryPlan {
  const { atoms, knowledgeType, studentHistory, leafToClusters } = ctx
  const correctRate = studentHistory?.correctRateByObjective ?? {}
  const correctRateByCluster = studentHistory?.correctRateByCluster ?? {}
  const consecutiveErrors = studentHistory?.consecutiveErrors ?? 0
  const hasClusterData = Object.keys(correctRateByCluster).length > 0
  const reasons: string[] = []

  // v1.1 PR3b: seed mastery 用 clusterId（优先），无 cluster 数据时回落到 objectiveId
  const controller = new AdaptiveController()
  if (hasClusterData) {
    for (const [clusterId, rate] of Object.entries(correctRateByCluster)) {
      controller.setMastery(clusterId, rate)
    }
  } else {
    for (const [objId, rate] of Object.entries(correctRate)) {
      controller.setMastery(objId, rate)
    }
  }
  const allObjectiveIds = Array.from(
    new Set(atoms.flatMap((a) => a.objectiveIds))
  )
  const lowMasteryObjectives = controller.suggestRemediation(allObjectiveIds)

  /**
   * 判定一个 atom 是否所有相关知识点都已 mastered（>= 0.85）。
   * v1.1 PR3b: 优先 cluster 路径（atom.sourceLeafId → leafToClusters → cluster correctRate）;
   * 兜底 objective 路径（向后兼容）。
   */
  function isAtomMastered(atom: SceneAtom): { mastered: boolean; detail: string } {
    // 路径 A: cluster
    const leafId = atom.sourceLeafId
    if (leafId && leafToClusters && leafToClusters[leafId]?.length) {
      const clusterIds = leafToClusters[leafId]
      const rates = clusterIds.map((cid) => correctRateByCluster[cid] ?? -1)
      const hasAnyData = rates.some((r) => r >= 0)
      if (hasAnyData) {
        const allMastered =
          rates.length > 0 && rates.every((r) => r >= SKIP_THRESHOLD)
        const detail = clusterIds
          .map((cid, i) => {
            const r = rates[i] ?? -1
            return `${cid}=${r >= 0 ? r.toFixed(2) : 'NA'}`
          })
          .join(',')
        return { mastered: allMastered, detail: `cluster:${detail}` }
      }
    }
    // 路径 B: objective 兜底
    const objMastered =
      atom.objectiveIds.length > 0 &&
      atom.objectiveIds.every((id) => (correctRate[id] ?? 0) >= SKIP_THRESHOLD)
    const detail = atom.objectiveIds
      .map((id) => `${id}=${(correctRate[id] ?? 0).toFixed(2)}`)
      .join(',')
    return { mastered: objMastered, detail: `objective:${detail}` }
  }

  // 策略 2: skip — mastered 的 single-question
  // 策略 3: procedural 时 demonstration 强制保留
  const skippedAtomIds: string[] = []
  for (const atom of atoms) {
    if (atom.type !== 'single-question') continue
    const { mastered, detail } = isAtomMastered(atom)
    if (!mastered) continue
    skippedAtomIds.push(atom.id)
    reasons.push(`skip ${atom.id} (${detail})`)
  }
  if (knowledgeType !== 'procedural') {
    for (const atom of atoms) {
      if (atom.type !== 'demonstration') continue
      const { mastered, detail } = isAtomMastered(atom)
      if (mastered) {
        skippedAtomIds.push(atom.id)
        reasons.push(`skip demonstration ${atom.id} (non-procedural; ${detail})`)
      }
    }
  } else {
    reasons.push(`procedural: preserve all demonstration atoms`)
  }

  // 策略 1: consecutiveErrors >= 2 → 在下一个 teach atom 前插入最近的 recap-bullet
  const insertedRemediation: string[] = []
  const orderedAtomIds: string[] = []
  let remediationInserted = false

  if (consecutiveErrors >= REMEDIATION_ERROR_THRESHOLD) {
    // 寻找最近的 recap-bullet（atoms 中第一个 recap-bullet 即"倒找"的候选；
    // 这里语义上是"从已发生的内容中找一个相近的复用"，取第一个即可）
    const remediationAtomId = atoms.find((a) => a.type === 'recap-bullet')?.id
    if (remediationAtomId) {
      for (const atom of atoms) {
        if (
          !remediationInserted &&
          TEACH_ATOM_TYPES.has(atom.type) &&
          !skippedAtomIds.includes(atom.id)
        ) {
          orderedAtomIds.push(remediationAtomId)
          insertedRemediation.push(remediationAtomId)
          remediationInserted = true
          reasons.push(
            `insert ${remediationAtomId} before ${atom.id} (consecutiveErrors=${consecutiveErrors})`
          )
        }
        if (!skippedAtomIds.includes(atom.id)) {
          orderedAtomIds.push(atom.id)
        }
      }
    } else {
      reasons.push(
        `consecutiveErrors=${consecutiveErrors} but no recap-bullet available`
      )
      for (const atom of atoms) {
        if (!skippedAtomIds.includes(atom.id)) orderedAtomIds.push(atom.id)
      }
    }
  } else {
    for (const atom of atoms) {
      if (!skippedAtomIds.includes(atom.id)) orderedAtomIds.push(atom.id)
    }
  }

  if (lowMasteryObjectives.length > 0) {
    reasons.push(`low-mastery objectives: ${lowMasteryObjectives.join(',')}`)
  }

  return {
    orderedAtomIds,
    insertedRemediation,
    skippedAtomIds,
    reason: reasons.length > 0 ? reasons.join('; ') : 'no adjustments',
  }
}

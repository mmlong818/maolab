import type { Scene, SlideContent } from '@maolab/shared-types'
import type { QuizResult } from '../quiz/grader.js'
import { estimateAbility, type IRTResponse } from './irt.js'

const MASTERY_THRESHOLD = 0.85
const MASTERY_INCREMENT = 0.4
const REMEDIATION_THRESHOLD = 0.6

function extractConceptIds(scene: Scene): string[] {
  if (scene.content.type === 'slide') {
    return (scene.content as SlideContent).conceptIds
  }
  if (scene.content.type === 'quiz') {
    const concepts = new Set<string>()
    for (const q of scene.content.questions) {
      for (const c of q.concepts) {
        concepts.add(c)
      }
    }
    return [...concepts]
  }
  return []
}

export class AdaptiveController {
  /**
   * masteryMap: 学生对各 ConceptUnit 的掌握度估计 ∈ [0, 1]
   *
   * v1.1 语义升级:
   *   - 键空间: 此前为 atom.objectiveIds[i] (旧概念) → 升级为 KnowledgePointCluster.id
   *     (v1.1 跨课程同概念簇)
   *   - 过渡期: 接受任意字符串 key, 不强制校验, 保持公共 API (setMastery / suggestRemediation
   *     / recordQuizResult 等) 签名与行为不变
   *   - 严格模式: 设环境变量 STRICT_CLUSTER_ID_ASSERT=true 时, setMastery 的 key 必须以
   *     'clst_' 前缀; 否则 throw (用于灰度验证迁移完成度, 默认关闭)
   *   - 迁移: setMastery 调用方 (delivery-adapter / student-response-store 懒回填) 应统一
   *     传 clusterId
   *
   * 完整设计: docs/knowledge-ontology-v1.1.md §4,
   *           docs/knowledge-ontology-migration-plan.md §G
   */
  private masteryMap: Record<string, number> = {}
  private abilityTheta = 0
  private irtHistory: IRTResponse[] = []

  getMasteryMap(): Readonly<Record<string, number>> {
    return { ...this.masteryMap }
  }

  setMastery(conceptId: string, value: number): void {
    if (process.env.STRICT_CLUSTER_ID_ASSERT === 'true' && !conceptId.startsWith('clst_')) {
      throw new Error(
        `[AdaptiveController.setMastery] STRICT mode: key must start with 'clst_', got: ${conceptId}`,
      )
    }
    this.masteryMap = { ...this.masteryMap, [conceptId]: value }
  }

  recordQuizResult(scene: Scene, result: QuizResult): void {
    const newMastery = { ...this.masteryMap }
    for (const conceptId of result.conceptsCovered) {
      const current = newMastery[conceptId] ?? 0
      newMastery[conceptId] = Math.min(1.0, current + MASTERY_INCREMENT)
    }
    this.masteryMap = newMastery
  }

  shouldSkip(scene: Scene): boolean {
    if (scene.content.type === 'quiz') return false

    const conceptIds = extractConceptIds(scene)
    if (conceptIds.length === 0) return false

    return conceptIds.every((id) => (this.masteryMap[id] ?? 0) >= MASTERY_THRESHOLD)
  }

  suggestRemediation(conceptIds: string[]): string[] {
    return conceptIds.filter((id) => (this.masteryMap[id] ?? 0) < REMEDIATION_THRESHOLD)
  }

  shouldGenerateSupplementary(masteryScore: number): boolean {
    return masteryScore <= 0.60
  }

  recordIRTResponses(responses: IRTResponse[]): void {
    this.irtHistory = [...this.irtHistory, ...responses]
    this.abilityTheta = estimateAbility(this.irtHistory)
  }

  getAbilityEstimate(): number {
    return this.abilityTheta
  }
}

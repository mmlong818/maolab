/**
 * PR3a-prereq · leafId 透传链类型与优先级测试
 *
 * 验证:
 *  1. TeachingPlanV2.sourceLeafId / RundownNode.sourceLeafId 字段存在且 optional
 *  2. 透传优先级: node > plan > textbookSource.sectionId > textbookSource.chapterId
 *  3. 旧课程 (无任何 leaf 字段) 不报错, leafId === undefined
 */
import { describe, it, expect } from 'vitest'
import type {
  TeachingPlanV2,
  RundownNode,
  CourseV2,
} from '../index.js'

/** atom-worker 调用方使用的同一优先级表达式; 抽出为纯函数便于测试. */
function resolveSourceLeafId(input: {
  node: Pick<RundownNode, 'sourceLeafId'>
  plan: Pick<TeachingPlanV2, 'sourceLeafId'>
  textbookSource?: CourseV2['textbookSource']
}): string | undefined {
  return (
    input.node.sourceLeafId ??
    input.plan.sourceLeafId ??
    input.textbookSource?.sectionId ??
    input.textbookSource?.chapterId
  )
}

describe('leafId propagation chain', () => {
  it('prefers node.sourceLeafId when present', () => {
    const out = resolveSourceLeafId({
      node: { sourceLeafId: 'leaf-from-node' },
      plan: { sourceLeafId: 'leaf-from-plan' },
      textbookSource: {
        textbookId: 'tb',
        textbookTitle: 't',
        stage: '高中',
        subject: 's',
        version: 'v',
        grade: 'g',
        volume: 'vol',
        sectionId: 'leaf-from-section',
      },
    })
    expect(out).toBe('leaf-from-node')
  })

  it('falls back to plan.sourceLeafId when node missing', () => {
    const out = resolveSourceLeafId({
      node: {},
      plan: { sourceLeafId: 'leaf-from-plan' },
    })
    expect(out).toBe('leaf-from-plan')
  })

  it('falls back to textbookSource.sectionId when node and plan missing', () => {
    const out = resolveSourceLeafId({
      node: {},
      plan: {},
      textbookSource: {
        textbookId: 'tb',
        textbookTitle: 't',
        stage: '高中',
        subject: 's',
        version: 'v',
        grade: 'g',
        volume: 'vol',
        sectionId: 'leaf-from-section',
        chapterId: 'leaf-from-chapter',
      },
    })
    expect(out).toBe('leaf-from-section')
  })

  it('falls back to textbookSource.chapterId when sectionId missing', () => {
    const out = resolveSourceLeafId({
      node: {},
      plan: {},
      textbookSource: {
        textbookId: 'tb',
        textbookTitle: 't',
        stage: '高中',
        subject: 's',
        version: 'v',
        grade: 'g',
        volume: 'vol',
        chapterId: 'leaf-from-chapter',
      },
    })
    expect(out).toBe('leaf-from-chapter')
  })

  it('returns undefined for legacy courses with no textbookSource', () => {
    const out = resolveSourceLeafId({
      node: {},
      plan: {},
    })
    expect(out).toBeUndefined()
  })

  it('TeachingPlanV2 and RundownNode accept optional sourceLeafId', () => {
    const plan: TeachingPlanV2 = {
      id: 'c1',
      topic: 't',
      hasReferenceMaterial: false,
      audience: { stage: 'high', priorKnowledge: ['x'], knownGaps: [] },
      knowledgeBoundary: { inScope: ['a'], outOfScope: [], adjacent: [] },
      knowledgeSummary: 'x'.repeat(60),
      knowledgeVision: 'x'.repeat(30),
      depth: 'understanding',
      purpose: 'introduce',
      objectives: [
        { id: 'o1', statement: 's', bloomLevel: 'L1-Remember', successCriteria: 'sc' },
      ],
      meta: { generatedAt: 0, editedByUser: false, revision: 1 },
      sourceLeafId: 'leaf-1',
    }
    const node: RundownNode = {
      id: 'seg-1-node-1',
      order: 0,
      role: 'introduce',
      expectedAtomType: 'single-claim',
      brief: 'b',
      objectiveIds: ['o1'],
      scaffolding: { mustMention: [], mustAvoid: [] },
      interaction: { hasInteraction: false },
      estimatedSeconds: 60,
      sourceLeafId: 'leaf-1',
    }
    expect(plan.sourceLeafId).toBe('leaf-1')
    expect(node.sourceLeafId).toBe('leaf-1')
  })
})

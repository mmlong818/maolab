import { describe, it, expect } from 'vitest'
import type { SceneAtom } from '@maolab/shared-types'
import {
  buildDeliveryPlan,
  type DeliveryContext,
  type KnowledgeType,
} from '../delivery/delivery-adapter.js'

const baseMeta = { generatedAt: 0, revision: 1 }

function recapAtom(id: string, objectiveIds: string[] = []): SceneAtom {
  return {
    id,
    rundownSegmentId: 'seg-1',
    objectiveIds,
    skippable: true,
    meta: baseMeta,
    type: 'recap-bullet',
    payload: { bullet: 'r' },
  }
}

function claimAtom(id: string, objectiveIds: string[] = []): SceneAtom {
  return {
    id,
    rundownSegmentId: 'seg-1',
    objectiveIds,
    skippable: false,
    meta: baseMeta,
    type: 'single-claim',
    payload: { claim: 'c' },
  }
}

function questionAtom(id: string, objectiveIds: string[], sourceLeafId?: string): SceneAtom {
  return {
    id,
    rundownSegmentId: 'seg-1',
    objectiveIds,
    skippable: false,
    meta: baseMeta,
    type: 'single-question',
    ...(sourceLeafId ? { sourceLeafId } : {}),
    payload: {
      stem: 's',
      kind: 'mcq',
      options: ['a', 'b'],
      answer: 0,
      onCorrect: 'ok',
      onIncorrect: 'no',
      allowRetry: true,
    },
  }
}

function demoAtom(id: string, objectiveIds: string[], sourceLeafId?: string): SceneAtom {
  return {
    id,
    rundownSegmentId: 'seg-1',
    objectiveIds,
    skippable: false,
    meta: baseMeta,
    type: 'demonstration',
    ...(sourceLeafId ? { sourceLeafId } : {}),
    payload: { medium: 'animation', src: 'x', narration: 'n' },
  }
}

function ctx(
  atoms: SceneAtom[],
  knowledgeType: KnowledgeType = 'conceptual',
  history?: DeliveryContext['studentHistory']
): DeliveryContext {
  const out: DeliveryContext = { courseId: 'c1', knowledgeType, atoms }
  if (history) out.studentHistory = history
  return out
}

describe('buildDeliveryPlan', () => {
  it('strategy 1 positive: inserts recap-bullet remediation when consecutiveErrors >= 2', () => {
    const atoms = [
      recapAtom('r1', ['o1']),
      claimAtom('c1', ['o1']),
      claimAtom('c2', ['o1']),
    ]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'conceptual', { correctRateByObjective: {}, consecutiveErrors: 3 })
    )
    expect(plan.insertedRemediation).toEqual(['r1'])
    expect(plan.orderedAtomIds.length).toBeGreaterThan(atoms.length)
    expect(plan.reason).toMatch(/consecutiveErrors=3/)
  })

  it('strategy 1 boundary: no recap-bullet available → no insertion, no throw', () => {
    const atoms = [claimAtom('c1', ['o1']), claimAtom('c2', ['o1'])]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'conceptual', { correctRateByObjective: {}, consecutiveErrors: 3 })
    )
    expect(plan.insertedRemediation).toEqual([])
    expect(plan.orderedAtomIds).toEqual(['c1', 'c2'])
  })

  it('strategy 2 positive: correctRate >= 0.85 → single-question skipped', () => {
    const atoms = [claimAtom('c1', ['o1']), questionAtom('q1', ['o1'])]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'conceptual', {
        correctRateByObjective: { o1: 0.9 },
        consecutiveErrors: 0,
      })
    )
    expect(plan.skippedAtomIds).toContain('q1')
    expect(plan.orderedAtomIds).not.toContain('q1')
  })

  it('strategy 2 boundary: correctRate=0.84 → not skipped (strict >= 0.85)', () => {
    const atoms = [questionAtom('q1', ['o1'])]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'conceptual', {
        correctRateByObjective: { o1: 0.84 },
        consecutiveErrors: 0,
      })
    )
    expect(plan.skippedAtomIds).not.toContain('q1')
    expect(plan.orderedAtomIds).toContain('q1')
  })

  it('strategy 3 positive: procedural preserves demonstration even when objective mastered', () => {
    const atoms = [demoAtom('d1', ['o1'])]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'procedural', {
        correctRateByObjective: { o1: 0.9 },
        consecutiveErrors: 0,
      })
    )
    expect(plan.skippedAtomIds).not.toContain('d1')
    expect(plan.orderedAtomIds).toContain('d1')
  })

  it('strategy 3 boundary: factual + mastered demonstration → skipped', () => {
    const atoms = [demoAtom('d1', ['o1'])]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'factual', {
        correctRateByObjective: { o1: 0.9 },
        consecutiveErrors: 0,
      })
    )
    expect(plan.skippedAtomIds).toContain('d1')
    expect(plan.orderedAtomIds).not.toContain('d1')
  })

  // v1.1 PR3b: cluster 路径 ----------------------------------------------------

  it('PR3b cluster path: correctRateByCluster hit → single-question skipped via leafToClusters', () => {
    const atoms = [
      claimAtom('c1', ['o1']),
      questionAtom('q1', ['o1'], 'leaf-A'),
    ]
    const plan = buildDeliveryPlan({
      courseId: 'c1',
      knowledgeType: 'conceptual',
      atoms,
      studentHistory: {
        correctRateByObjective: {}, // 故意空, 不允许 objective 路径救场
        correctRateByCluster: { 'clst-A': 0.9 },
        consecutiveErrors: 0,
      },
      leafToClusters: { 'leaf-A': ['clst-A'] },
    })
    expect(plan.skippedAtomIds).toContain('q1')
    expect(plan.orderedAtomIds).not.toContain('q1')
    expect(plan.reason).toMatch(/cluster:clst-A=0\.90/)
  })

  it('PR3b cluster path + procedural: demonstration preserved even when cluster mastered', () => {
    const atoms = [demoAtom('d1', ['o1'], 'leaf-A')]
    const plan = buildDeliveryPlan({
      courseId: 'c1',
      knowledgeType: 'procedural',
      atoms,
      studentHistory: {
        correctRateByObjective: {},
        correctRateByCluster: { 'clst-A': 0.95 },
        consecutiveErrors: 0,
      },
      leafToClusters: { 'leaf-A': ['clst-A'] },
    })
    expect(plan.skippedAtomIds).not.toContain('d1')
    expect(plan.orderedAtomIds).toContain('d1')
  })

  it('PR3b backward compat: only correctRateByObjective (no cluster data) → legacy skip path still works', () => {
    const atoms = [questionAtom('q1', ['o1'])]
    const plan = buildDeliveryPlan(
      ctx(atoms, 'conceptual', {
        correctRateByObjective: { o1: 0.9 },
        consecutiveErrors: 0,
      })
    )
    expect(plan.skippedAtomIds).toContain('q1')
    expect(plan.reason).toMatch(/objective:o1=0\.90/)
  })
})

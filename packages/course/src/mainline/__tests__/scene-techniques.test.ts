import { describe, expect, it } from 'vitest'
import { SCENE_TECHNIQUE_IDS } from '../domain.js'
import {
  SCENE_TECHNIQUE_REGISTRY,
  isInteractiveTechnique,
  sceneTechniquesForSceneType,
} from '../scene-techniques.js'

describe('scene technique registry', () => {
  it('covers every declared technique id', () => {
    expect(Object.keys(SCENE_TECHNIQUE_REGISTRY).sort()).toEqual([...SCENE_TECHNIQUE_IDS].sort())
  })

  it('declares fallback and audit focus for every technique', () => {
    for (const spec of Object.values(SCENE_TECHNIQUE_REGISTRY)) {
      expect(spec.defaultFallback.length).toBeGreaterThan(8)
      expect(spec.auditFocus.length).toBeGreaterThan(8)
      expect(spec.stableLayoutRule.length).toBeGreaterThan(8)
      expect(spec.preferredDialogueLayouts.length).toBeGreaterThan(0)
      expect(spec.supportedSceneTypes.length).toBeGreaterThan(0)
    }
  })

  it('keeps required interaction techniques explicit', () => {
    expect(isInteractiveTechnique('draggable-model')).toBe(true)
    expect(isInteractiveTechnique('static-board')).toBe(false)
    expect(sceneTechniquesForSceneType('source-reading').map(spec => spec.id)).toContain('static-board')
  })
})

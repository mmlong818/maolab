import { describe, it, expect } from 'vitest'
import { presentationFor } from '../presentation.js'
import type { LessonScene, SceneType } from '../../domain.js'

function scene(overrides: Partial<LessonScene>): LessonScene {
  return {
    id: 's1', sceneType: 'concept-build', visualLayout: 'x', contentSlots: {}, visualFocus: 'x',
    narrationAnchor: 'x', syncStrategy: 'x', boardText: ['a'], sceneTechnique: 'layered-reveal',
    interactionContract: 'x', fallbackPresentation: 'x',
    characterLayer: { layout: 'narration-only', positionRule: 'x', exitRule: 'x' },
    dialogueLayout: 'narration-only', peerFunction: 'none', subjectTeachingMode: 'general-explanation',
    voiceCue: { emotion: 'calm', pace: 'medium', pauseRule: 'x' }, gradeTone: 'x',
    teacherScript: 'x', studentAction: 'x', evidenceOnScreen: ['x'],
    ...overrides,
  }
}

// classic 走放行池轮换(general 学科不命中 signature 风格包)
function variety(sceneType: SceneType, axis: 'baseplate' | 'label' | 'marker' | 'decor' | 'textblock'): number {
  const values = new Set(
    Array.from({ length: 60 }, (_, i) =>
      presentationFor(scene({ sceneType, id: `p2-03-${sceneType}` }), { id: `course-${i}`, subject: 'general', gradeBand: 'middle-school' })[axis],
    ),
  )
  return values.size
}

describe('presentation 放行池(round08 待决 2:放宽后各幕型有真实轮换)', () => {
  it('每幕型每条已放行轴跨课程可达 ≥2 种取值', () => {
    expect(variety('source-reading', 'marker')).toBeGreaterThanOrEqual(2)
    expect(variety('visual-observation', 'baseplate')).toBeGreaterThanOrEqual(2)
    expect(variety('contrast', 'baseplate')).toBeGreaterThanOrEqual(2)
    expect(variety('concept-build', 'label')).toBeGreaterThanOrEqual(2)
    expect(variety('concept-build', 'textblock')).toBeGreaterThanOrEqual(2)
    expect(variety('worked-example', 'decor')).toBeGreaterThanOrEqual(2)
    expect(variety('practice', 'label')).toBeGreaterThanOrEqual(2)
    expect(variety('recap', 'decor')).toBeGreaterThanOrEqual(2)
  })

  it('语义锁死的轴不放行:worked-example/recap 的 textblock 维持 numbered(步骤/路径语义)', () => {
    expect(variety('worked-example', 'textblock')).toBe(1)
    expect(variety('recap', 'textblock')).toBe(1)
  })
})

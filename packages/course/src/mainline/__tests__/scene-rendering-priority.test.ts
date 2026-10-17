import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { usesGeneratedSceneImage } from '../presentation/scene-rendering-priority.js'

describe('scene rendering priority', () => {
  it('keeps every generated course image visible even when the page also has typed content', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    for (const sceneType of ['visual-observation', 'contrast', 'recap'] as const) {
      const scene = course.scenes.find(item => item.sceneType === sceneType)!
      scene.imageUrl = `/generated-${sceneType}.png`
      scene.contentSlots.timelineEvents = '观察前|观察中|观察后'

      expect(usesGeneratedSceneImage(scene)).toBe(true)
    }

    const sourceReading = course.scenes.find(item => item.sceneType === 'source-reading')!
    sourceReading.imageUrl = '/incidental-image.png'
    expect(usesGeneratedSceneImage(sourceReading)).toBe(false)
  })
})

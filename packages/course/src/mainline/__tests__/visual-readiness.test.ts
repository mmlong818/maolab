import { describe, expect, it } from 'vitest'
import type { LessonScene, MainlineCourse } from '../domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { courseHasCompleteTeachingVisuals, sceneHasCompleteTeachingVisual } from '../presentation/visual-readiness.js'

function sceneOfType(sceneType: LessonScene['sceneType']): LessonScene {
  const scene = GOLDEN_MAINLINE_COURSES
    .flatMap(course => course.scenes)
    .find(candidate => candidate.sceneType === sceneType)
  if (!scene) throw new Error(`golden samples need a ${sceneType} scene`)
  return structuredClone(scene)
}

describe('teaching visual readiness', () => {
  it('accepts a specialized Chinese observation page without requiring a bitmap', () => {
    const scene = sceneOfType('visual-observation')
    delete scene.imageUrl
    scene.contentSlots.classicalText = '采采芣苢，薄言采之。'
    scene.contentSlots.classicalTranslation = '繁茂的芣苢，采摘它。'
    scene.contentSlots.classicalGloss = '采|采摘|第一章'

    expect(sceneHasCompleteTeachingVisual(scene)).toBe(true)
  })

  it('accepts complete contrast and recap renderers but rejects an unrenderable observation page', () => {
    const contrast = sceneOfType('contrast')
    delete contrast.imageUrl
    contrast.contentSlots = { misconception: '错误说法', correction: '核对结论' }

    const recap = sceneOfType('recap')
    delete recap.imageUrl
    recap.contentSlots.takeaway = '本课结论'

    const incomplete = sceneOfType('visual-observation')
    delete incomplete.imageUrl
    incomplete.contentSlots = {
      panelATitle: '观察一', panelA: '说明一',
      panelBTitle: '观察二', panelB: '说明二',
      panelCTitle: '观察三', panelC: '说明三',
    }

    expect(sceneHasCompleteTeachingVisual(contrast)).toBe(true)
    expect(sceneHasCompleteTeachingVisual(recap)).toBe(true)
    expect(sceneHasCompleteTeachingVisual(incomplete)).toBe(false)
  })

  it('reports the whole course ready only when every teaching page has a complete visual', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!) as MainlineCourse
    course.scenes = course.scenes.map(scene => ({ ...scene, imageUrl: '/generated.png' }))
    expect(courseHasCompleteTeachingVisuals(course)).toBe(true)

    const observation = course.scenes.find(scene => scene.sceneType === 'visual-observation')!
    delete observation.imageUrl
    observation.contentSlots = {}
    expect(courseHasCompleteTeachingVisuals(course)).toBe(false)
  })
})

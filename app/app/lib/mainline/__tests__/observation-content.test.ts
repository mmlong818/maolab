import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LessonScene } from '../domain.js'
import { ensureObservationPanelTitles, observationPanels } from '../presentation/observation-content.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

function observationScene(): LessonScene {
  const scene = GOLDEN_MAINLINE_COURSES
    .flatMap(course => course.scenes)
    .find(candidate => candidate.sceneType === 'visual-observation')
  if (!scene) throw new Error('golden samples need a visual-observation scene')
  return structuredClone(scene)
}

describe('observation content ownership', () => {
  it('explicit panel titles and details define the three visual cards, not teacher board text', () => {
    const scene = observationScene()
    scene.contentSlots = {
      panelATitle: '起因', panelA: '外重内轻，安禄山拥兵三镇',
      panelBTitle: '过程', panelB: '范阳起兵，洛阳长安相继失守',
      panelCTitle: '后果', panelC: '藩镇割据，唐朝由盛转衰',
    }
    scene.boardText = ['755 年起兵', '756 年失守', '763 年平定', '教师总结']

    expect(observationPanels(scene)).toEqual([
      { id: 'panelA', title: '起因', detail: '外重内轻，安禄山拥兵三镇' },
      { id: 'panelB', title: '过程', detail: '范阳起兵，洛阳长安相继失守' },
      { id: 'panelC', title: '后果', detail: '藩镇割据，唐朝由盛转衰' },
    ])
  })

  it('derives legacy titles from panel prefixes before consulting a three-line board', () => {
    const slots = ensureObservationPanelTitles({
      panelA: 'A层·词形与读音：melodic、rhythmic、upbeat',
      panelB: '语义指向：形容旋律、节奏与情绪基调',
      panelC: '句法运用：形容词作定语或表语',
    }, ['旧板书一', '旧板书二', '旧板书三'])

    expect(slots.panelATitle).toBe('词形与读音')
    expect(slots.panelBTitle).toBe('语义指向')
    expect(slots.panelCTitle).toBe('句法运用')
  })

  it('a four-line teacher board cannot turn a three-layer observation page into four cards', () => {
    const scene = observationScene()
    scene.contentSlots = {
      panelA: '正常眼：物像落在视网膜上',
      panelB: '近视眼：物像落在视网膜前方',
      panelC: '矫正：凹透镜使物像后移',
    }
    scene.boardText = ['正常眼', '近视眼', '成因', '矫正']

    expect(observationPanels(scene).map(panel => panel.title)).toEqual(['正常眼', '近视眼', '矫正'])
    expect(observationPanels(scene)).toHaveLength(3)
  })

  it('does not split a formula at the equals sign when deriving a legacy title', () => {
    const slots = ensureObservationPanelTitles({
      panelA: '先把两个三角形拼成平行四边形。',
      panelB: '拼成图形的底和高与原三角形相等。',
      panelC: '三角形面积是平行四边形的一半。',
    }, ['拼合图形', '底高对应', '\\(S=\\frac{1}{2}ah\\)'])

    expect(slots.panelCTitle).toBe('三角形面积是平行四边形的一半')
  })

  it('all observation masters consume panel content instead of teacher board text', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/mainline/scene-views/visual-slide.tsx'), 'utf8')
    expect(source).not.toContain('scene.boardText')
    expect(source.match(/observationPanels\(scene\)/g)).toHaveLength(5)
  })
})

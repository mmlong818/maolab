import { describe, expect, it } from 'vitest'
import { mainlineCourseToDeck, type MainlineCourseLike, type MainlineSceneLike } from '../adapt-from-mainline.js'

function scene(overrides: Partial<MainlineSceneLike> = {}): MainlineSceneLike {
  return {
    sceneTypeLabel: '概念建构',
    visualFocus: '示例视觉聚焦',
    boardText: ['要点一', '要点二'],
    teacherScript: '这是这一幕的讲稿内容,足够长以模拟真实教案。',
    ...overrides,
  }
}

function baseCourse(overrides: Partial<MainlineCourseLike> = {}): MainlineCourseLike {
  return {
    topic: '一元二次方程',
    gradeLabel: '初中',
    subjectLabel: '数学',
    objectives: ['理解一元二次方程的定义', '掌握配方法求解'],
    scenes: [scene()],
    ...overrides,
  }
}

describe('mainlineCourseToDeck', () => {
  it('封面 + 目标 + 逐幕 + 收束 四段结构齐全', () => {
    const deck = mainlineCourseToDeck(baseCourse())
    expect(deck.slides[0]).toMatchObject({ type: 'cover', title: '一元二次方程' })
    expect(deck.slides[1]).toMatchObject({ type: 'checklist', heading: '今天你将能够' })
    expect(deck.slides[2]).toMatchObject({ type: 'argument', heading: '示例视觉聚焦' })
    const closing = deck.slides.at(-1)
    expect(closing).toMatchObject({ type: 'checklist', eyebrow: '收束' })
  })

  it('goals 为空时跳过教学目标页', () => {
    const deck = mainlineCourseToDeck(baseCourse({ objectives: [] }))
    expect(deck.slides.map(s => s.type)).toEqual(['cover', 'argument', 'checklist'])
  })

  it('讲稿进演讲者备注,notes.slideIndex 与幻灯片顺序对齐', () => {
    const deck = mainlineCourseToDeck(baseCourse())
    // slides: [cover, checklist(目标), argument(幕), checklist(收束)] → 幕在 index 3
    const sceneNote = deck.notes.find(n => n.slideIndex === 3)
    expect(sceneNote?.text).toContain('讲稿内容')
  })

  it('配图路径透传到 images,以 slideIndex 为 key', () => {
    const deck = mainlineCourseToDeck(baseCourse({ scenes: [scene({ imagePath: 'E:/img/a.png' })] }))
    expect(deck.images[3]).toBe('E:/img/a.png')
  })

  it('recap 幕存在时收束页取其板书 + 下集预告', () => {
    const recap = scene({ boardText: ['路径A→路径B'], serialHook: '下节课我们继续', imagePath: 'E:/img/recap.png' })
    const deck = mainlineCourseToDeck(baseCourse({ scenes: [scene()], recap }))
    const closing = deck.slides.at(-1) as { items: string[] }
    expect(closing.items).toContain('路径A→路径B')
    expect(closing.items.some(i => i.includes('下集预告'))).toBe(true)
    const closingIndex = deck.slides.length
    expect(deck.images[closingIndex]).toBe('E:/img/recap.png')
  })

  it('无 recap 幕时收束页用 fallbackClosing 兜底', () => {
    const deck = mainlineCourseToDeck(baseCourse({ fallbackClosing: ['掌握配方法求解'] }))
    const closing = deck.slides.at(-1) as { items: string[] }
    expect(closing.items).toEqual(['掌握配方法求解'])
  })

  it('boardText 为空时用 teacherScript 截断兜底,避免空白幕页', () => {
    const deck = mainlineCourseToDeck(baseCourse({
      scenes: [scene({ boardText: [], teacherScript: '较长的讲稿用于截断测试用例场景描述文本' })],
    }))
    const sceneSlide = deck.slides.find(s => s.type === 'argument') as { points: string[] }
    expect(sceneSlide.points[0]?.length).toBeLessThanOrEqual(40)
  })
})

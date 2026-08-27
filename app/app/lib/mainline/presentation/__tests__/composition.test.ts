import { describe, it, expect } from 'vitest'
import type { LessonScene } from '../../domain.js'
import {
  COMPOSITION_LIBRARY,
  compositionFor,
  imageSlotFor,
  isValidComposition,
  spriteSideOf,
  type Composition,
} from '../composition.js'

function scene(overrides: Partial<LessonScene>): LessonScene {
  return {
    id: 'scene-x',
    sceneType: 'visual-observation',
    visualLayout: 'x',
    contentSlots: {},
    visualFocus: 'x',
    narrationAnchor: 'x',
    syncStrategy: 'x',
    boardText: ['a', 'b'],
    sceneTechnique: 'static-board',
    interactionContract: 'x',
    fallbackPresentation: 'x',
    characterLayer: { layout: 'narration-only', positionRule: 'x', exitRule: 'x' },
    dialogueLayout: 'narration-only',
    peerFunction: 'none',
    subjectTeachingMode: 'general-explanation',
    voiceCue: { emotion: 'calm', pace: 'medium', pauseRule: 'x' },
    gradeTone: 'x',
    teacherScript: 'x',
    studentAction: 'x',
    evidenceOnScreen: ['x'],
    ...overrides,
  }
}

describe('composition library', () => {
  it('图文立绘字幕合法混合方式 ≥ 100 种', () => {
    expect(COMPOSITION_LIBRARY.length).toBeGreaterThanOrEqual(100)
    // id 唯一
    expect(new Set(COMPOSITION_LIBRARY.map(c => c.id)).size).toBe(COMPOSITION_LIBRARY.length)
  })

  it('库内每一条都满足合法性规则', () => {
    for (const c of COMPOSITION_LIBRARY) expect(isValidComposition(c)).toBe(true)
  })

  it('非法组合被拒:满幅裁切无侧栏 / 有立绘必有话 / 图贴边不与立绘同侧抢栏', () => {
    expect(isValidComposition({ image: 'cover-full', text: 'rail-cards', sprite: 'none', subtitle: 'narration' })).toBe(false)
    expect(isValidComposition({ image: 'letterbox-center', text: 'rail-cards', sprite: 'left', subtitle: 'none' })).toBe(false)
    expect(isValidComposition({ image: 'anchor-left', text: 'rail-cards', sprite: 'right', subtitle: 'dialogue' })).toBe(false)
  })

  it('立绘位严格从 dialogueLayout 派生', () => {
    expect(spriteSideOf(scene({ dialogueLayout: 'student-right-content-left' }))).toBe('right')
    expect(spriteSideOf(scene({ dialogueLayout: 'teacher-left-content-right' }))).toBe('left')
    expect(spriteSideOf(scene({ dialogueLayout: 'corner-avatar' }))).toBe('left')
    expect(spriteSideOf(scene({ dialogueLayout: 'narration-only' }))).toBe('none')
    expect(spriteSideOf(scene({ dialogueLayout: 'no-character' }))).toBe('none')
  })

  it('compositionFor 永远返回合法组合,且侧栏自动避开立绘', () => {
    const withImage = scene({ imageUrl: '/generated-images/x.png', dialogueLayout: 'student-right-content-left', sceneType: 'contrast' })
    const c = compositionFor(withImage)
    expect(isValidComposition(c)).toBe(true)
    expect(c.sprite).toBe('right')
    // 辨析幕图贴边时不允许贴到立绘对侧抢栏(anchor-left+rail 已被规则排除)
    expect(c.id).not.toContain('anchor-left/rail-cards/right')
  })

  it('同类型多幕按 scene.id 确定性错开版式', () => {
    const a = compositionFor(scene({ id: 'p2-02-visual-observation', imageUrl: '/x.png' }))
    const b = compositionFor(scene({ id: 'p2-05-visual-observation', imageUrl: '/x.png' }))
    const again = compositionFor(scene({ id: 'p2-02-visual-observation', imageUrl: '/x.png' }))
    expect(a.id).toBe(again.id) // 确定性
    expect(COMPOSITION_LIBRARY.some(c => c.id === `${a.image}/${a.text}/${a.sprite}/${a.subtitle}`)).toBe(true)
    expect(COMPOSITION_LIBRARY.some(c => c.id === `${b.image}/${b.text}/${b.sprite}/${b.subtitle}`)).toBe(true)
  })

  it('课程盐生效:同一 scene id 在不同课程选中不同版式(跨课零变化回归,以辨析幕为例)', () => {
    // 回归守卫改用 contrast:visual-observation 已按用户要求锁定单一"文字主图辅"版式
    // (见下一条),不再有跨课变化;辨析幕仍保留多形态,继续守"跨课零变化"这条老 bug 线。
    const base = scene({ id: 'p2-04-contrast', sceneType: 'contrast', imageUrl: '/x.png', dialogueLayout: 'corner-avatar' })
    const picks = new Set(
      Array.from({ length: 24 }, (_, i) => compositionFor(base, `course-${i}`).id),
    )
    expect(picks.size).toBeGreaterThanOrEqual(3)
  })

  it('观察幕锁定"文字主、图辅":恒 band-top(图收为顶部插图带)+ strip-bottom(下方可读文字卡区),不再把文字挤成图上角标', () => {
    // 2026-07-22 用户复核「图片丧失辅助说明意义、文字变得不重要」:visual-observation
    // 的教学主体是文字(如"五特征分层"),此处以正确层级换取该幕型的版式多样性。
    const base = scene({ id: 'p2-02-visual-observation', imageUrl: '/x.png', dialogueLayout: 'narration-only' })
    const reachable = new Set(
      Array.from({ length: 200 }, (_, i) => compositionFor(base, `seed-${i}`).id),
    )
    expect([...reachable]).toEqual(['band-top/strip-bottom/none/narration'])
  })

  it('band-top 投放只搭底部文字形态(下带即文字区)', () => {
    const base = scene({ id: 'p2-02-visual-observation', imageUrl: '/x.png', dialogueLayout: 'narration-only' })
    const picks = Array.from({ length: 200 }, (_, i) => compositionFor(base, `seed-${i}`))
    const bandTops = picks.filter(c => c.image === 'band-top')
    expect(bandTops.length).toBeGreaterThan(0)
    for (const c of bandTops) expect(['strip-bottom', 'stepper-bottom']).toContain(c.text)
  })

  it('辨析幕只落在能承载误区/修正双卡的形态(rail-cards/strip-bottom)', () => {
    for (let i = 0; i < 40; i++) {
      const c = compositionFor(scene({ id: 'p2-04-contrast', sceneType: 'contrast', imageUrl: '/x.png', dialogueLayout: 'corner-avatar' }), `s${i}`)
      expect(['rail-cards', 'strip-bottom']).toContain(c.text)
    }
  })

  it('无图幕:concept-build 走中央定义卡,practice/worked-example 走堆叠卡', () => {
    expect(compositionFor(scene({ sceneType: 'concept-build' })).text).toBe('card-center')
    expect(compositionFor(scene({ sceneType: 'practice' })).text).toBe('cards-stack')
    expect(compositionFor(scene({ sceneType: 'worked-example' })).text).toBe('cards-stack')
  })
})

describe('imageSlotFor(按版式槽位定制生图尺寸)', () => {
  const comp = (image: Composition['image'], subtitle: Composition['subtitle']): Composition =>
    ({ id: 'x', image, text: 'strip-bottom', sprite: 'none', subtitle })

  it('每种形态 × 字幕态的尺寸均为 16 倍数且宽高比 ≤3:1(API 硬上限)', () => {
    for (const image of ['cover-full', 'band-top', 'anchor-left', 'anchor-right', 'letterbox-center'] as const) {
      for (const subtitle of ['narration', 'none'] as const) {
        const { width, height } = imageSlotFor(comp(image, subtitle))
        expect(width % 16, `${image}/${subtitle} width`).toBe(0)
        expect(height % 16, `${image}/${subtitle} height`).toBe(0)
        expect(width / height, `${image}/${subtitle} aspect`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('满幅形态贴合 1920 舞台宽;有字幕时收高让出字幕带', () => {
    expect(imageSlotFor(comp('cover-full', 'narration'))).toEqual({ width: 1920, height: 912 })
    expect(imageSlotFor(comp('cover-full', 'none'))).toEqual({ width: 1920, height: 1088 })
  })

  it('band-top 槽位比例超 3:1 时 clamp 到 3:1(1920×640)', () => {
    expect(imageSlotFor(comp('band-top', 'narration'))).toEqual({ width: 1920, height: 640 })
  })

  it('贴边形态出方图,letterbox 出 3:2 近似', () => {
    expect(imageSlotFor(comp('anchor-left', 'narration'))).toEqual({ width: 880, height: 880 })
    const lb = imageSlotFor(comp('letterbox-center', 'narration'))
    expect(lb).toEqual({ width: 1312, height: 880 })
  })
})

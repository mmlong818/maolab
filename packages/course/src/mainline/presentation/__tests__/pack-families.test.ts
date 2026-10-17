import { describe, it, expect } from 'vitest'
import { hexToOklch } from '../color.js'
import { ACTIVE_COLOR_ANCHORS } from '../anchors.js'
import {
  PACK_MOODS,
  PAPER_TINTS,
  TEXTURE_SIGNATURES,
  anchorPoolFor,
  derivePackInstance,
  derivePalette,
  packInstanceCount,
  pickGenerativeInstance,
} from '../pack-families.js'
import { stylePackFor } from '../style-packs.js'
import { presentationFor } from '../presentation.js'
import type { SubjectId, GradeBand, LessonScene } from '../../domain.js'

const SUBJECTS: readonly SubjectId[] = ['chinese', 'math', 'science', 'english', 'history', 'politics', 'geography', 'physics', 'chemistry', 'biology', 'general']
const GRADE_BANDS: readonly GradeBand[] = ['lower-primary', 'upper-primary', 'middle-school', 'high-school']

describe('anchors 策展质量(明亮令:现代锚默认池)', () => {
  it('36-52 个锚,排除彩度过低(<0.03,真灰色相不稳)与刺眼荧光(>0.26)的极端值', () => {
    expect(ACTIVE_COLOR_ANCHORS.length).toBeGreaterThanOrEqual(36)
    expect(ACTIVE_COLOR_ANCHORS.length).toBeLessThanOrEqual(52)
    for (const a of ACTIVE_COLOR_ANCHORS) {
      const c = hexToOklch(a.hex).c
      expect(c, `${a.id} native chroma`).toBeGreaterThanOrEqual(0.03)
      expect(c, `${a.id} native chroma`).toBeLessThanOrEqual(0.26)
    }
  })

  it('锚 id 互不重复,色相分布跨全色相环(非扎堆在一个色区)', () => {
    const ids = ACTIVE_COLOR_ANCHORS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const hues = ACTIVE_COLOR_ANCHORS.map(a => hexToOklch(a.hex).h)
    const bins = new Set(hues.map(h => Math.floor(h / 30)))
    expect(bins.size).toBeGreaterThanOrEqual(8) // 360/30=12 个色区,至少覆盖 8 个
  })

  it('每个学段都至少能筛出锚(小学暖色池、高中低彩度池均非空)', () => {
    for (const subject of SUBJECTS) {
      for (const gradeBand of GRADE_BANDS) {
        expect(anchorPoolFor(subject, gradeBand).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('派生引擎:全量实例(每锚 × 每 mood × 每地色 tint)质量闸门', () => {
  const cases = ACTIVE_COLOR_ANCHORS.flatMap(anchor =>
    PACK_MOODS.flatMap(mood => PAPER_TINTS.map(tint => ({ anchor, mood, tint }))),
  )

  it('对比度锁档成立:浅底 accent.l≤0.55,深底 accent.l≥0.75', () => {
    for (const { anchor, mood, tint } of cases) {
      const p = derivePalette(anchor, mood, tint)
      const isDarkPack = hexToOklch(p.paper).l < hexToOklch(p.ink).l
      const accentL = hexToOklch(p.accent).l
      if (isDarkPack) expect(accentL).toBeGreaterThanOrEqual(0.75)
      else expect(accentL).toBeLessThanOrEqual(0.55)
    }
  })

  it('backdrop 三档 L 单调(顶→中→底递减)', () => {
    for (const { anchor, mood, tint } of cases) {
      const p = derivePalette(anchor, mood, tint)
      const [l0, l1, l2] = p.backdrop.map(hex => hexToOklch(hex).l)
      expect(l0).toBeGreaterThan(l1!)
      expect(l1).toBeGreaterThan(l2!)
    }
  })

  it('白族地色带:paper 彩度落 [0.001, 0.02](白为主第四次收紧——地色近纯白,只留一丝几乎不可见的冷暖 hue)', () => {
    for (const { anchor, mood, tint } of cases) {
      const p = derivePalette(anchor, mood, tint)
      const paperC = hexToOklch(p.paper).c
      expect(paperC, `${anchor.id}:${mood}:${tint.id}`).toBeGreaterThanOrEqual(0.001)
      expect(paperC, `${anchor.id}:${mood}:${tint.id}`).toBeLessThanOrEqual(0.02)
    }
  })

  it('accentSoft 与 accent 同色相,ΔL 在同一 mood 内固定(容差内——sRGB 8bit 量化与越界钳制带来的浮动 <0.05;accent 不吃 tint,固定取首个)', () => {
    const tint = PAPER_TINTS[0]!
    for (const mood of PACK_MOODS) {
      const deltas = ACTIVE_COLOR_ANCHORS.map(anchor => {
        const p = derivePalette(anchor, mood, tint)
        return hexToOklch(p.accentSoft).l - hexToOklch(p.accent).l
      })
      expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThan(0.05)
    }
  })

  it('ink/paper 非空且互不相同(可读性基本盘)', () => {
    for (const { anchor, mood, tint } of cases) {
      const p = derivePalette(anchor, mood, tint)
      expect(p.ink).toBeTruthy()
      expect(p.paper).toBeTruthy()
      expect(p.ink).not.toBe(p.paper)
    }
  })
})

describe('派生空间规模', () => {
  it('锚 × mood(6) × 地色 tint(8) × 质感签名(6-8) 组合空间达到"上千方案"量级', () => {
    const stats = packInstanceCount()
    expect(stats.moods).toBe(6)
    expect(stats.tints).toBe(8)
    expect(stats.textures).toBeGreaterThanOrEqual(6)
    expect(stats.textures).toBeLessThanOrEqual(8)
    expect(stats.total).toBe(stats.anchors * stats.moods * stats.tints * stats.textures)
    expect(stats.total).toBeGreaterThan(500)
  })

  it('derivePackInstance 与 StylePack 同构:四轴 + palette + imageDNA 均非空', () => {
    const anchor = ACTIVE_COLOR_ANCHORS[0]!
    const texture = TEXTURE_SIGNATURES[0]!
    const instance = derivePackInstance(anchor, 'noon', PAPER_TINTS[0]!, texture)
    expect(instance.palette).toBeTruthy()
    expect(instance.baseplate).toBe(texture.baseplate)
    expect(instance.labelStyle).toBe(texture.labelStyle)
    expect(instance.markerStyle).toBe(texture.markerStyle)
    expect(instance.decorStyle).toBe(texture.decorStyle)
    expect(instance.imageDNA.length).toBeGreaterThan(0)
  })
})

describe('反同质回归:同学科同学段的课程不应撞同一张皮', () => {
  it('30 个同学科同学段假 course id → 生成档选出 ≥10 个不同实例', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `fake-course-${i}-${Math.random().toString(36).slice(2)}`)
    const instances = ids.map(id => pickGenerativeInstance({ id, subject: 'math', gradeBand: 'middle-school' }))
    const distinct = new Set(instances.map(i => i.id))
    expect(distinct.size).toBeGreaterThanOrEqual(10)
  })

  it('同一 course.id 永远派生同一实例(确定性,不是随机数)', () => {
    const course = { id: 'stable-course-77', subject: 'physics' as SubjectId, gradeBand: 'high-school' as GradeBand }
    const a = pickGenerativeInstance(course)
    const b = pickGenerativeInstance(course)
    expect(a.id).toBe(b.id)
    expect(a.palette).toEqual(b.palette)
  })
})

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

describe('stylePackFor 兼容性:既有消费方零改动可跑', () => {
  it('presentationFor 拿到的 pack 无论精修/生成档都满足 ScenePresentation 形状', () => {
    for (let i = 0; i < 20; i++) {
      const course = { id: `compat-course-${i}`, subject: 'chemistry' as SubjectId, gradeBand: 'middle-school' as GradeBand }
      const p = presentationFor(scene({}), course)
      expect(p.palette.ink).toBeTruthy()
      expect(p.palette.paper).toBeTruthy()
      expect(p.baseplate).toBeTruthy()
      expect(p.label).toBeTruthy()
      expect(p.marker).toBeTruthy()
      expect(p.decor).toBeTruthy()
    }
  })

  it('stylePackFor 对同一 course.id 确定性一致(重复调用不跳变)', () => {
    const course = { id: 'determinism-check-1', subject: 'english' as SubjectId, gradeBand: 'upper-primary' as GradeBand }
    const first = stylePackFor(course)
    const second = stylePackFor(course)
    expect(first.id).toBe(second.id)
  })
})

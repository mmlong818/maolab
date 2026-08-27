import { describe, it, expect } from 'vitest'
import { hexToOklch } from '../color.js'
import { pickGenerativeInstance } from '../pack-families.js'
import { STYLE_PACKS, legacyStylePackFor, resolveStylePackById, stylePackFor } from '../style-packs.js'
import { presentationFor } from '../presentation.js'
import type { LessonScene } from '../../domain.js'

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

describe('signature style packs', () => {
  it('五个 signature 风格 + classic 托底,签名调色板都含 ink/paper 且互不相同', () => {
    const ids = Object.keys(STYLE_PACKS)
    expect(ids).toHaveLength(6)
    const palettes = Object.values(STYLE_PACKS).filter(p => p.palette).map(p => p.palette!)
    expect(palettes).toHaveLength(5)
    expect(new Set(palettes.map(p => p.accent)).size).toBe(5)
    for (const p of palettes) {
      expect(p.ink).toBeTruthy()
      expect(p.paper).toBeTruthy()
      expect(p.ink).not.toBe(p.paper)
    }
  })

  it('精修档学科×学段映射:理科蓝图、文史水墨、小学童话、地理英语杂志、未匹配 classic', () => {
    // legacyStylePackFor 是精修档本身(不掺生成档分流),学科×学段映射保持 v4 期的确定性契约
    expect(legacyStylePackFor({ subject: 'math', gradeBand: 'middle-school' }).id).toBe('blueprint')
    expect(legacyStylePackFor({ subject: 'physics', gradeBand: 'high-school' }).id).toBe('manuscript')
    expect(legacyStylePackFor({ subject: 'science', gradeBand: 'high-school' }).id).toBe('manuscript')
    expect(legacyStylePackFor({ subject: 'chinese', gradeBand: 'middle-school' }).id).toBe('ink-academy')
    expect(legacyStylePackFor({ subject: 'history', gradeBand: 'middle-school' }).id).toBe('ink-academy')
    expect(legacyStylePackFor({ subject: 'math', gradeBand: 'lower-primary' }).id).toBe('wonder-lab')
    expect(legacyStylePackFor({ subject: 'biology', gradeBand: 'middle-school' }).id).toBe('wonder-lab')
    expect(legacyStylePackFor({ subject: 'geography', gradeBand: 'middle-school' }).id).toBe('field-journal')
    expect(legacyStylePackFor({ subject: 'general', gradeBand: 'middle-school' }).id).toBe('classic')
  })

  it('stylePackFor 25/20/55 三分流:精修档为托底,浅色引进档与生成档共同占多数', () => {
    // 以下 course.id 经哈希核实(盐 '::pack-tier-imported-mix')落在精修档分支,
    // 用于验证 stylePackFor 与 legacyStylePackFor 在该分支下结果一致(非到处都变)
    expect(stylePackFor({ id: 'math-middle-c1', subject: 'math', gradeBand: 'middle-school' }).id).toBe('blueprint')
    expect(stylePackFor({ id: 'general-middle-c6', subject: 'general', gradeBand: 'middle-school' }).id).toBe('classic')

    // 30 个同学科同学段的不同课程 id,三档都应该被抽样命中(id 前缀分别为空/imported:/generative:)
    const ids = Array.from({ length: 30 }, (_, i) => `math-middle-course-${i}`)
    const packs = ids.map(id => stylePackFor({ id, subject: 'math', gradeBand: 'middle-school' }))
    const generativeCount = packs.filter(p => p.id.startsWith('generative:')).length
    const importedCount = packs.filter(p => p.id.startsWith('imported:')).length
    const legacyCount = packs.length - generativeCount - importedCount
    expect(generativeCount).toBeGreaterThan(0)
    expect(importedCount).toBeGreaterThan(0)
    expect(legacyCount).toBeGreaterThan(0)
    expect(generativeCount).toBeLessThan(ids.length)
  })

  it('风格包锁定签名四轴,classic 保留学科配色轮换', () => {
    // 'math-middle-c1' / 'general-middle-c6' 经哈希核实落 stylePackFor 的精修档分支
    const bp = presentationFor(scene({}), { id: 'math-middle-c1', subject: 'math', gradeBand: 'middle-school' })
    expect(bp.pack.id).toBe('blueprint')
    expect(bp.palette.id).toBe('pack-blueprint')
    expect(bp.baseplate).toBe('grid')
    expect(bp.label).toBe('underline-tag')

    const classic = presentationFor(scene({}), { id: 'general-middle-c6', subject: 'general', gradeBand: 'middle-school' })
    expect(classic.pack.id).toBe('classic')
    expect(classic.palette.id).toContain('general')
  })

  it('模板替换:resolveStylePackById 三档 id 均可解析还原', () => {
    expect(resolveStylePackById('blueprint')?.id).toBe('blueprint')
    expect(resolveStylePackById('imported:rose-pine-dawn')?.id).toBe('imported:rose-pine-dawn')
    const gen = pickGenerativeInstance({ id: 'resolve-rt-1', subject: 'math', gradeBand: 'middle-school' })
    const resolved = resolveStylePackById(gen.id)
    expect(resolved?.id).toBe(gen.id)
    expect(resolved?.palette).toEqual(gen.palette)
    expect(resolveStylePackById('no-such-pack')).toBeNull()
    expect(resolveStylePackById('generative:bogus:noon:rose:glass-gallery')).toBeNull()
  })

  it('模板替换:stylePackFor 覆盖优先;未知/失效 id 回落自动分流不炸课堂', () => {
    const course = { id: 'override-course-1', subject: 'math' as const, gradeBand: 'middle-school' as const }
    const auto = stylePackFor(course)
    expect(stylePackFor({ ...course, stylePackId: 'ink-academy' }).id).toBe('ink-academy')
    expect(stylePackFor({ ...course, stylePackId: 'generative:bogus:noon:rose:glass-gallery' }).id).toBe(auto.id)
  })

  it('明亮令:全部 signature 包浅底深字(paper 亮于 ink),不再有整页暗场', () => {
    for (const pack of Object.values(STYLE_PACKS)) {
      if (!pack.palette) continue
      const paperL = hexToOklch(pack.palette.paper).l
      const inkL = hexToOklch(pack.palette.ink).l
      expect(paperL, `${pack.id} paper 应亮于 ink`).toBeGreaterThan(inkL)
    }
  })
})

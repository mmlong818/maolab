import { describe, it, expect } from 'vitest'
import { hexToOklch } from '../color.js'
import { IMPORTED_PACKS } from '../imported-packs.data.js'
import { importedPackStats, importedPoolFor, pickImportedInstance } from '../imported-packs.js'
import { stylePackFor } from '../style-packs.js'
import type { GradeBand, SubjectId } from '../../domain.js'

describe('引进包数据(imported-packs.data.ts)落地规模', () => {
  it('至少接入 80 条具名引进包(71 套开源配色宇宙收割目标)', () => {
    expect(IMPORTED_PACKS.length).toBeGreaterThanOrEqual(80)
  })

  it('id 与 label 均互不重复', () => {
    const ids = IMPORTED_PACKS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const labels = IMPORTED_PACKS.map(p => p.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('每条都带溯源(universe/repo/license)', () => {
    for (const p of IMPORTED_PACKS) {
      expect(p.source.universe).toBeTruthy()
      expect(p.source.repo).toMatch(/^https?:\/\//)
      expect(p.source.license).toBeTruthy()
    }
  })
})

describe('引进包全量质量闸门(与 pack-families.test.ts 同构)', () => {
  it('对比度锁档成立:浅底 accent.l≤0.55,深底 accent.l≥0.75', () => {
    for (const p of IMPORTED_PACKS) {
      const isDarkPack = hexToOklch(p.palette.paper).l < hexToOklch(p.palette.ink).l
      const accentL = hexToOklch(p.palette.accent).l
      if (isDarkPack) expect(accentL, `${p.id} accent.l`).toBeGreaterThanOrEqual(0.75)
      else expect(accentL, `${p.id} accent.l`).toBeLessThanOrEqual(0.55)
    }
  })

  it('backdrop 三档 L 单调(顶→中→底递减)', () => {
    for (const p of IMPORTED_PACKS) {
      const [l0, l1, l2] = p.palette.backdrop.map(hex => hexToOklch(hex).l)
      expect(l0, `${p.id} backdrop[0]>[1]`).toBeGreaterThan(l1!)
      expect(l1, `${p.id} backdrop[1]>[2]`).toBeGreaterThan(l2!)
    }
  })

  it('浅色包渐变为白族浅铺(白为主 2026-07-22:防惨白废止,backdrop 底档 L ≥ 0.87)', () => {
    for (const p of IMPORTED_PACKS) {
      const isDarkPack = hexToOklch(p.palette.paper).l < hexToOklch(p.palette.ink).l
      if (isDarkPack) continue
      // codemod 已把浅色条目 backdrop 重铺为 paper−0.008/0.022/0.040;断言相对纸面
      // 的浅铺契约(留量化余量)。纸面本身偏暗的"浅色"包(如 doom-64 L≈0.85)是否
      // 进默认池由 brightness-gates 全审决定(importedPoolFor),数据层只守不回退。
      const paperL = hexToOklch(p.palette.paper).l
      const minL = Math.min(...p.palette.backdrop.map(hex => hexToOklch(hex).l))
      expect(paperL - minL, `${p.id} backdrop 底档相对纸面下沉`).toBeLessThanOrEqual(0.05)
    }
  })

  it('ink/paper 非空且互不相同(可读性基本盘)', () => {
    for (const p of IMPORTED_PACKS) {
      expect(p.palette.ink).toBeTruthy()
      expect(p.palette.paper).toBeTruthy()
      expect(p.palette.ink).not.toBe(p.palette.paper)
    }
  })

  it('isLight 标记与 paper/ink 实测明度一致', () => {
    for (const p of IMPORTED_PACKS) {
      const actualIsLight = hexToOklch(p.palette.paper).l >= hexToOklch(p.palette.ink).l
      expect(p.isLight, p.id).toBe(actualIsLight)
    }
  })
})

describe('引进档选择逻辑(imported-packs.ts)', () => {
  it('小学段只从浅色 flavor 池中选(isLight=true)', () => {
    const primaryBands: readonly GradeBand[] = ['lower-primary', 'upper-primary']
    for (const gradeBand of primaryBands) {
      for (let i = 0; i < 40; i++) {
        const datum = pickImportedInstance({ id: `primary-fake-${gradeBand}-${i}`, gradeBand })
        expect(datum.isLight, datum.id).toBe(true)
      }
    }
  })

  it('明亮令:全学段默认池只出浅色 flavor(暗色包归档不可达)', () => {
    const bands: readonly GradeBand[] = ['middle-school', 'high-school']
    for (const gradeBand of bands) {
      for (let i = 0; i < 60; i++) {
        const datum = pickImportedInstance({ id: `mid-fake-${gradeBand}-${i}`, gradeBand })
        expect(datum.isLight, datum.id).toBe(true)
      }
    }
  })

  it('同一 course.id 永远选中同一条引进包(确定性)', () => {
    const a = pickImportedInstance({ id: 'stable-imported-course', gradeBand: 'high-school' })
    const b = pickImportedInstance({ id: 'stable-imported-course', gradeBand: 'high-school' })
    expect(a.id).toBe(b.id)
  })

  it('importedPoolFor 任何学段都非空', () => {
    const bands: readonly GradeBand[] = ['lower-primary', 'upper-primary', 'middle-school', 'high-school']
    for (const b of bands) expect(importedPoolFor(b).length).toBeGreaterThan(0)
  })

  it('importedPackStats 与 IMPORTED_PACKS 长度一致', () => {
    const stats = importedPackStats()
    expect(stats.total).toBe(IMPORTED_PACKS.length)
    expect(stats.light + stats.dark).toBe(stats.total)
  })
})

describe('stylePackFor 三档分流比例:精修 0.25 / 引进 0.20 / 生成 0.55(±5%,明亮令调整)', () => {
  it('1000 个假 course id 落点比例在目标值 ±5 个百分点内', () => {
    const N = 1000
    let legacy = 0, imported = 0, generative = 0
    for (let i = 0; i < N; i++) {
      const pack = stylePackFor({ id: `ratio-fake-course-${i}`, subject: 'math' as SubjectId, gradeBand: 'middle-school' })
      if (pack.id.startsWith('generative:')) generative++
      else if (pack.id.startsWith('imported:')) imported++
      else legacy++
    }
    expect(legacy / N).toBeGreaterThanOrEqual(0.20)
    expect(legacy / N).toBeLessThanOrEqual(0.30)
    expect(imported / N).toBeGreaterThanOrEqual(0.15)
    expect(imported / N).toBeLessThanOrEqual(0.25)
    expect(generative / N).toBeGreaterThanOrEqual(0.50)
    expect(generative / N).toBeLessThanOrEqual(0.60)
  })
})

describe('三门真课落点回归锁定(防未来哈希/分流漂移无感回归)', () => {
  // 课程 id 见 docs/real-check/2026-07-21-round14/FINAL-REPORT.md;三课均为 middle-school,
  // 数学两门(7199cd1a.../cd194b9e...)+ 语文一门(dd228da7...)。改分流盐或比例前,先看这里会不会红。
  // 明亮令 + 粉紫禁令(2026-07-22)后实测重锁:锚池/tint/引进课堂池全部换代,
  // 三课仍分落三档(核实见施工期 scratch 实测)。
  const COURSES = [
    { id: '7199cd1a-4b32-4c3b-ac6e-609f13159418', subject: 'math' as SubjectId, gradeBand: 'middle-school' as GradeBand, expectId: 'blueprint' },
    { id: 'cd194b9e-2f73-422d-862a-3e1342eb667f', subject: 'math' as SubjectId, gradeBand: 'middle-school' as GradeBand, expectId: 'generative:naiyou:toned:periwinkle:guochao-mist' },
    { id: 'dd228da7-12c9-424f-8e4f-c326bf9e3329', subject: 'chinese' as SubjectId, gradeBand: 'middle-school' as GradeBand, expectId: 'imported:tweakcn-soft-pop-light' },
  ]

  it('三课分流锁定:legacy(blueprint)/ generative / imported 各占一档', () => {
    const packs = COURSES.map(c => stylePackFor(c))
    for (let i = 0; i < COURSES.length; i++) expect(packs[i]!.id).toBe(COURSES[i]!.expectId)
  })

  it('三课皮肤互不相同(至少两门离开旧精修皮的验证点)', () => {
    const packs = COURSES.map(c => stylePackFor(c))
    const ids = packs.map(p => p.id)
    expect(new Set(ids).size).toBe(3)
    const legacyCount = ids.filter(id => id === 'blueprint' || id === 'ink-academy' || id === 'classic' || id === 'wonder-lab' || id === 'field-journal' || id === 'manuscript').length
    expect(legacyCount).toBeLessThanOrEqual(1)
  })
})

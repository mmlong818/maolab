import { describe, it, expect } from 'vitest'
import type { GradeBand } from '../../domain.js'
import { ACTIVE_COLOR_ANCHORS } from '../anchors.js'
import {
  ACCENT_L_CEILING,
  BACKDROP_L_FLOOR,
  INK_PAPER_DELTA_MIN,
  PAPER_L_FLOOR,
  auditPaletteBrightness,
  isSameLuminance,
} from '../brightness-gates.js'
import { importedPoolFor } from '../imported-packs.js'
import { PACK_MOODS, PAPER_TINTS, derivePalette } from '../pack-families.js'
import { STYLE_PACKS } from '../style-packs.js'

/**
 * 明亮令全空间闸门 · brightness-mandate.md WP-F
 *
 * 「不合格的方案根本不产出」的证明方式:对默认路径可达的**每一张皮**跑闸门——
 * 生成档全空间(锚 × mood × tint,质感不影响 palette)+ 精修档 6 包 + 引进档
 * 默认池(全学段浅色池)。任何一条越线(整页深底/浅字浅底/对比不足)在 CI 就红,
 * 不需要等真检截图才发现"又出了一门上个世纪的课"。
 */
describe('brightness-gates · 明亮令调色板硬闸门(全默认空间零违规)', () => {
  it('生成档全空间(锚 × mood × tint)零违规', () => {
    for (const anchor of ACTIVE_COLOR_ANCHORS) {
      for (const mood of PACK_MOODS) {
        for (const tint of PAPER_TINTS) {
          const violations = auditPaletteBrightness(derivePalette(anchor, mood, tint))
          expect(violations, `${anchor.id}:${mood}:${tint.id} → ${violations.map(v => `${v.rule}(${v.detail})`).join('; ')}`).toEqual([])
        }
      }
    }
  })

  it('精修档 signature 包(含重做后的 blueprint)零违规', () => {
    for (const pack of Object.values(STYLE_PACKS)) {
      if (!pack.palette) continue // classic 走学科配色库(全浅底暖纸),无固定 palette
      const violations = auditPaletteBrightness(pack.palette)
      expect(violations, `${pack.id} → ${violations.map(v => `${v.rule}(${v.detail})`).join('; ')}`).toEqual([])
    }
  })

  it('引进档默认池(全学段)全部浅色且零违规', () => {
    const bands: readonly GradeBand[] = ['lower-primary', 'upper-primary', 'middle-school', 'high-school']
    for (const band of bands) {
      for (const p of importedPoolFor(band)) {
        expect(p.isLight, `${p.id} 混入默认池的暗色包`).toBe(true)
        const violations = auditPaletteBrightness(p.palette)
        expect(violations, `${p.id}@${band} → ${violations.map(v => `${v.rule}(${v.detail})`).join('; ')}`).toEqual([])
      }
    }
  })

  it('闸门本身能拦住暗色方案(以旧 blueprint 深蓝暗场为反例)', () => {
    const legacyDarkBlueprint = {
      id: 'pack-blueprint-legacy-dark',
      accent: '#5cc8e8',
      accentSoft: '#112e36',
      ink: '#e6f1f8',
      paper: '#132a3f',
      backdrop: ['#1a3049', '#13263b', '#0e1d2e'] as [string, string, string],
    }
    const rules = auditPaletteBrightness(legacyDarkBlueprint).map(v => v.rule)
    expect(rules).toContain('light-ground')
    expect(rules).toContain('backdrop-floor')
    expect(rules).toContain('accent-lock')
  })

  it('ground-hue 闸门:粉紫地色被拦,近中性灰白地不论色相放行', () => {
    const pinkGround = {
      id: 'pack-pink-ground',
      accent: '#b91c1c',
      accentSoft: '#fde5df',
      ink: '#221d18',
      paper: '#f6dce8', // 粉紫地(hue≈340,c>0.02)
      backdrop: ['#f3d5e3', '#eecbdc', '#e8c0d3'] as [string, string, string],
    }
    expect(auditPaletteBrightness(pinkGround).map(v => v.rule)).toContain('ground-hue')

    const neutralGround = {
      id: 'pack-neutral-ground',
      accent: '#b91c1c',
      accentSoft: '#fde5df',
      ink: '#221d18',
      paper: '#f5f4f4', // 近中性,即便色相角落在禁带也不判
      backdrop: ['#f2f1f1', '#edecec', '#e7e6e6'] as [string, string, string],
    }
    expect(auditPaletteBrightness(neutralGround).map(v => v.rule)).not.toContain('ground-hue')
  })

  it('闸门阈值互洽:纸面下限与深字差值加总不越出明度轴', () => {
    expect(PAPER_L_FLOOR - INK_PAPER_DELTA_MIN).toBeGreaterThan(0)
    expect(BACKDROP_L_FLOOR).toBeLessThanOrEqual(PAPER_L_FLOOR)
    expect(ACCENT_L_CEILING).toBeLessThan(PAPER_L_FLOOR)
  })

  it('isSameLuminance:同明度多色标签放行,明度断层拒绝', () => {
    expect(isSameLuminance(['#ff5a5f', '#38bdf8', '#a3e635'], 0.2)).toBe(true)
    expect(isSameLuminance(['#ffe08a', '#1d4ed8'])).toBe(false)
    expect(isSameLuminance(['#ff5a5f'])).toBe(true)
  })
})

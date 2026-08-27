import { describe, it, expect } from 'vitest'
import type { GradeBand } from '../../domain.js'
import { auditPaletteBrightness } from '../brightness-gates.js'
import { moodPoolFor } from '../pack-families.js'
import { stylePackCatalogFor } from '../pack-catalog.js'
import { resolveStylePackById } from '../style-packs.js'

const BANDS: readonly GradeBand[] = ['lower-primary', 'upper-primary', 'middle-school', 'high-school']

describe('pack-catalog · 模板替换选皮目录', () => {
  it('目录三档齐备,id 互不重复,每个 id 都能被 resolveStylePackById 还原', () => {
    for (const gradeBand of BANDS) {
      const catalog = stylePackCatalogFor({ subject: 'math', gradeBand })
      const ids = catalog.map(e => e.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const tier of ['signature', 'imported', 'generative'] as const) {
        expect(catalog.some(e => e.tier === tier), `${gradeBand} 缺 ${tier} 档`).toBe(true)
      }
      for (const entry of catalog) {
        expect(resolveStylePackById(entry.id), `${entry.id} 不可解析`).not.toBeNull()
      }
    }
  })

  it('目录只供应明亮池:每个可解析 palette 过 brightness 闸门零违规', () => {
    const catalog = stylePackCatalogFor({ subject: 'chinese', gradeBand: 'middle-school' })
    for (const entry of catalog) {
      const pack = resolveStylePackById(entry.id)!
      if (!pack.palette) continue // classic 走学科配色库,无固定 palette
      const violations = auditPaletteBrightness(pack.palette)
      expect(violations, `${entry.id} → ${violations.map(v => v.rule).join(',')}`).toEqual([])
    }
  })

  it('小学段生成档抽样遵守学段 mood 约束(只出最高调三档)', () => {
    const moods = new Set(moodPoolFor('lower-primary'))
    const catalog = stylePackCatalogFor({ subject: 'math', gradeBand: 'lower-primary' })
    for (const entry of catalog.filter(e => e.tier === 'generative')) {
      const mood = entry.id.split(':')[2]!
      expect(moods.has(mood as never), `${entry.id} 越出小学 mood 池`).toBe(true)
    }
  })

  it('确定性:同学科同学段两次生成目录完全一致(选皮器不闪烁)', () => {
    const a = stylePackCatalogFor({ subject: 'physics', gradeBand: 'high-school' })
    const b = stylePackCatalogFor({ subject: 'physics', gradeBand: 'high-school' })
    expect(a).toEqual(b)
  })
})

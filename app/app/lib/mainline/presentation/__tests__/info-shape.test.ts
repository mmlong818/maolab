import { describe, expect, it } from 'vitest'
import { INFO_SHAPES, type InfoShape } from '../../domain.js'
import {
  INFO_SHAPE_CRITERIA,
  SHAPE_SLOT_REQUIREMENTS,
  SKELETON_FOR,
  type SkeletonId,
} from '../info-shape.js'

/**
 * 信息形状词汇表的完整性守卫(2026-07-28)。
 *
 * ⚠️ 本词汇表原本服务的方案(LLM 声明形状 → 判定器证伪 → 路由收窄)**已实测推翻并废止**,
 * 见 `info-shape.ts` 顶部与 `tasks/e-infoshape-presentation-2026-07-28.md` 文末。
 * 词汇表本身保留,将在 E′「一幕型 N 套结构模板」里改由**模板派生**使用。
 *
 * 当前没有任何消费方,行为零变化——所以这里唯一值得测的是**三张表不缺口、不打架**。
 * 类型系统对 `Record<InfoShape, X>` 会报错,但对「两种形状指向同一骨架」
 * 「判据写成了占位串」这类跨表一致性兜不住,那才是这组测试的价值。
 * 动一处,另两处必须跟上。
 */
describe('E-1 · 信息形状契约完整性', () => {
  it('INFO_SHAPES 与 InfoShape 类型逐一对应,无重复', () => {
    expect(new Set(INFO_SHAPES).size).toBe(INFO_SHAPES.length)
    // 类型层面:漏一个成员这里编译不过
    const exhaustive: Record<InfoShape, true> = {
      parallel: true, progressive: true, radial: true,
      contrast: true, hierarchy: true, chronological: true,
    }
    expect(Object.keys(exhaustive).sort()).toEqual([...INFO_SHAPES].sort())
  })

  it('**每种形状都有骨架**,且骨架互不重复(重复即两种逻辑共用一个版式,失去意义)', () => {
    for (const shape of INFO_SHAPES) {
      expect(SKELETON_FOR[shape], `${shape} 缺骨架`).toBeTruthy()
    }
    const skeletons = INFO_SHAPES.map(s => SKELETON_FOR[s])
    expect(new Set(skeletons).size, '两种形状指向了同一骨架').toBe(INFO_SHAPES.length)
  })

  it('**每种形状都有判据**,且判据是能回答的问句形式(非空、非占位)', () => {
    for (const shape of INFO_SHAPES) {
      const c = INFO_SHAPE_CRITERIA[shape]
      expect(c, `${shape} 缺判据`).toBeTruthy()
      expect(c.length, `${shape} 判据过短,大概率是占位`).toBeGreaterThan(6)
      expect(c, `${shape} 判据只是复述形状名`).not.toBe(shape)
    }
  })

  it('**每种形状都有伴生槽键要求**,且区间自洽', () => {
    for (const shape of INFO_SHAPES) {
      const r = SHAPE_SLOT_REQUIREMENTS[shape]
      expect(r, `${shape} 缺槽键要求`).toBeTruthy()
      expect(r.minItems).toBeGreaterThanOrEqual(2)
      if (r.maxItems !== null) expect(r.maxItems).toBeGreaterThanOrEqual(r.minItems)
      expect(r.why.length, `${shape} 没写为什么这么要求`).toBeGreaterThan(5)
    }
  })

  it('radial / hierarchy 必须要求各自的显式槽键——否则与 parallel 无从区分', () => {
    expect(SHAPE_SLOT_REQUIREMENTS.radial.requiredSlots).toContain('shapeCenter')
    expect(SHAPE_SLOT_REQUIREMENTS.hierarchy.requiredSlots).toContain('shapeSummary')
  })

  it('contrast 恰好两侧(上下限都锁死),这是它区别于 parallel 的定义', () => {
    expect(SHAPE_SLOT_REQUIREMENTS.contrast.minItems).toBe(2)
    expect(SHAPE_SLOT_REQUIREMENTS.contrast.maxItems).toBe(2)
  })

  it('parallel 下限 ≥3:两项的并列本质是对照,不许它吞掉 contrast', () => {
    expect(SHAPE_SLOT_REQUIREMENTS.parallel.minItems).toBeGreaterThanOrEqual(3)
  })

  it('骨架 id 取值在声明的联合类型内(拼写错会被这里挡下)', () => {
    const known: readonly SkeletonId[] = ['grid', 'stair', 'satellite', 'dual-column', 'banner-split', 'timeline']
    for (const shape of INFO_SHAPES) {
      expect(known).toContain(SKELETON_FOR[shape])
    }
  })
})

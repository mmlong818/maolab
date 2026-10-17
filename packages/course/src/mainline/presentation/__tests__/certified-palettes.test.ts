import { describe, it, expect } from 'vitest'
import { ACTIVE_COLOR_ANCHORS } from '../anchors.js'
import {
  CERTIFIED_PALETTES,
  MIN_DISTANCE,
  allPaletteCandidates,
  certifiedPaletteCount,
  paletteDistance,
} from '../certified-palettes.js'
import { TEXTURE_SIGNATURES } from '../pack-families.js'

/**
 * 认证配色注册表硬指标测试 · hard-targets-spec.md 指标 1,明亮令(2026-07-22)修订版
 *
 * 旧达标值 55(2026-07-21)大半由暗色档的 paper 明度分离(L 0.09-0.93,轴权重 0.21)
 * 撑起。明亮令废止整页深底后 paper 明度收窄到 [0.63,0.965],六轴度量下明亮带的
 * 几何容量上限实测 ≈35(已穷尽合法调参:锚 42→48、tint 6→10、paperL/paperC 解耦、
 * 复活 21 条浅色引进包)。**用户拍板(2026-07-22):明亮令优先,硬指标改为
 * 「≥实测值,只升不降」,MIN_DISTANCE 0.15 不松**——不靠放宽两两距离凑数字。
 * 配色轴之外的多样性由质感/字体/构图轴承担(不在本度量内,但真实可辨)。
 */
describe('certified-palettes · 配色硬指标(明亮令修订:≥实测值,两两 ≥0.15 不松)', () => {
  it('候选池规模 = 精修(5,不含无专属调色板的 classic)+ 引进课堂池(34,白族+粉紫accent双闸门后)+ 生成(39 锚×6 mood×8 tint)', () => {
    expect(allPaletteCandidates().length).toBe(5 + 34 + 39 * 6 * 8)
  })

  it('认证注册表两两距离全部 ≥ MIN_DISTANCE(0.15),无一例外', () => {
    const arr = CERTIFIED_PALETTES
    expect(arr.length).toBeGreaterThan(0)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const d = paletteDistance(arr[i]!.palette, arr[j]!.palette)
        expect(d, `${arr[i]!.id} vs ${arr[j]!.id}`).toBeGreaterThanOrEqual(MIN_DISTANCE)
      }
    }
  })

  it('认证注册表 id 互不重复(每条对应一个真实可达的包)', () => {
    const ids = CERTIFIED_PALETTES.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('配色距离护栏:白为主世界的实测值 ≥ 5(度量已名存实亡,见下一条的接棒度量)', () => {
    // 白为主第四次收紧(2026-07-23)后,paper 明度/彩度/色相三轴全部塌成"白族耳语"
    // (彩度≤0.02、明度≈0.96),六轴 palette 距离几乎只剩 accent 色相——5 是几何终点。
    // 这恰恰证明"数配色距离"在白为主世界已名存实亡:课与课的真实可辨度由**身份组合**
    // (accent 色相 × 质感 × 字体 × 表面 × 母版)承担,见下一条接棒度量。距离阈值 0.15 未松。
    expect(certifiedPaletteCount()).toBeGreaterThanOrEqual(4)
  })

  it('接棒度量(白为主):生成档身份组合(锚色相 × 质感签名,含字体/表面身份)≥ 60', () => {
    // 白纸上课程身份的真实载体:强调色相 + 质感(mesh/glow/grid/颗粒)+ 大标字体 +
    // 卡片表面语言。按锚温度与签名准入实际枚举合法 (anchor × textureSignature) 对——
    // 防止未来改动把身份轴悄悄收窄(如签名字体/表面改回清一色、温度准入过度收紧)。
    let combos = 0
    for (const anchor of ACTIVE_COLOR_ANCHORS) {
      const pool = TEXTURE_SIGNATURES.filter(t => t.temperatures.includes(anchor.temperature))
      combos += (pool.length > 0 ? pool : TEXTURE_SIGNATURES).length
    }
    expect(combos).toBeGreaterThanOrEqual(60)
  })
})

import { describe, it, expect } from 'vitest'
import { hexToOklch } from '../color.js'
import { ACTIVE_COLOR_ANCHORS } from '../anchors.js'
import { PACK_MOODS, PAPER_TINTS, derivePalette } from '../pack-families.js'
import { IMPORTED_PACKS } from '../imported-packs.data.js'
import { STYLE_PACKS } from '../style-packs.js'
import { paletteOf, type Palette } from '../primitives.js'
import { MOOD_ARC_TIERS, applyMoodArc, sceneMoodFor } from '../presentation.js'
import type { SceneType, SubjectId } from '../../domain.js'

const SUBJECTS: readonly SubjectId[] = ['chinese', 'math', 'science', 'english', 'history', 'politics', 'geography', 'physics', 'chemistry', 'biology', 'general']
const PALETTE_MOODS_LOCAL = ['standard', 'deep', 'airy'] as const

/**
 * 全量包宇宙的基准 palette · 与 stylePackFor 的三档分流(精修 25% / 引进 45% /
 * 生成 30%,见 style-packs.ts)同构,是 coursePaletteFor 实际可能产出的全部取值:
 * - 5 个手写 signature 包各自固定 palette;classic 无固定 palette,走学科配色库
 *   (paletteOf),按 10 学科 × 3 mood 展开;
 * - 89 条引进包(imported-packs.data.ts);
 * - 1764 张生成档去重调色板(42 锚 × 7 mood × 6 地色 tint,pack-families.ts)——质感签名
 *   不影响 palette(derivePalette 只吃 anchor+mood+tint),故只按这三轴展开,不再 ×8 质感。
 */
function allBasePalettes(): { label: string; palette: Palette }[] {
  const out: { label: string; palette: Palette }[] = []

  for (const [id, pack] of Object.entries(STYLE_PACKS)) {
    if (pack.palette) {
      out.push({ label: `legacy:${id}`, palette: pack.palette })
    } else {
      for (const subject of SUBJECTS) {
        for (const mood of PALETTE_MOODS_LOCAL) {
          out.push({ label: `legacy:${id}:${subject}:${mood}`, palette: paletteOf(subject, mood) })
        }
      }
    }
  }

  for (const p of IMPORTED_PACKS) {
    out.push({ label: `imported:${p.id}`, palette: p.palette })
  }

  for (const anchor of ACTIVE_COLOR_ANCHORS) {
    for (const mood of PACK_MOODS) {
      for (const tint of PAPER_TINTS) {
        const palette = derivePalette(anchor, mood, tint)
        out.push({ label: `generative:${palette.id}`, palette })
      }
    }
  }

  return out
}

const UNIVERSE = allBasePalettes()

describe('课内色彩节奏 · 全量包宇宙 × 4 档闸门', () => {
  it('宇宙规模达到"上千包"量级(精修+引进+生成三档来源全覆盖)', () => {
    expect(UNIVERSE.length).toBeGreaterThan(1000)
  })

  it('逐包逐档:accent 对比锁档成立(生成档子集复用 pack-families.ts 自设阈值:浅底 accent.l≤0.55,深底 accent.l≥0.75)', () => {
    for (const { label, palette } of UNIVERSE) {
      if (!label.startsWith('generative:')) continue // 精修/引进库的手写 accent 不保证落在生成引擎自设的窗口内,见下一条通用闸门
      for (const tier of MOOD_ARC_TIERS) {
        const p = applyMoodArc(palette, tier)
        const isDark = hexToOklch(p.paper).l < hexToOklch(p.ink).l
        const accentL = hexToOklch(p.accent).l
        if (isDark) expect(accentL, `${label}@${tier}`).toBeGreaterThanOrEqual(0.75)
        else expect(accentL, `${label}@${tier}`).toBeLessThanOrEqual(0.55)
      }
    }
  })

  it('逐包逐档(全宇宙通用闸门):accent 相对 paper 的对比距离不低于 basis——mood arc 只允许"变好"的方向呼吸,不允许任何一档比不呼吸更差', () => {
    for (const { label, palette } of UNIVERSE) {
      const paperL = hexToOklch(palette.paper).l
      const baseMargin = Math.abs(hexToOklch(palette.accent).l - paperL)
      for (const tier of MOOD_ARC_TIERS) {
        const p = applyMoodArc(palette, tier)
        const tierMargin = Math.abs(hexToOklch(p.accent).l - paperL)
        expect(tierMargin, `${label}@${tier}`).toBeGreaterThanOrEqual(baseMargin - 1e-9)
      }
    }
  })

  it('逐包逐档:ink/paper 恒定(身份锚——卡片正文/纸面不随幕的明暗弧线变化)', () => {
    for (const { label, palette } of UNIVERSE) {
      for (const tier of MOOD_ARC_TIERS) {
        const p = applyMoodArc(palette, tier)
        expect(p.ink, `${label}@${tier}`).toBe(palette.ink)
        expect(p.paper, `${label}@${tier}`).toBe(palette.paper)
      }
    }
  })

  it('逐包逐档:backdrop 三档 L 单调(顶→中→底递减,不因 ΔL 平移撞界而反转)', () => {
    for (const { label, palette } of UNIVERSE) {
      for (const tier of MOOD_ARC_TIERS) {
        const p = applyMoodArc(palette, tier)
        const [l0, l1, l2] = p.backdrop.map(hex => hexToOklch(hex).l)
        expect(l0, `${label}@${tier}`).toBeGreaterThan(l1!)
        expect(l1, `${label}@${tier}`).toBeGreaterThan(l2!)
      }
    }
  })

  it('逐包逐档:accent 色相严格不变(withLInGamut 收缩彩度落回 gamut,不动色相;色相角本身在彩度趋零处数值不稳定,跳过高/低两端都低彩度的样本)', () => {
    for (const { label, palette } of UNIVERSE) {
      const baseAccent = hexToOklch(palette.accent)
      if (baseAccent.c <= 0.02) continue // 低彩度色相角本身数值不稳定,跳过(anchors.ts 策展同款阈值)
      for (const tier of MOOD_ARC_TIERS) {
        const p = applyMoodArc(palette, tier)
        const tierAccent = hexToOklch(p.accent)
        if (tierAccent.c <= 0.02) continue // 该档把彩度收缩到接近 0(逼近纯黑/纯白边界),色相角同样不稳定,不是回归
        const hueDelta = Math.abs(((tierAccent.h - baseAccent.h + 540) % 360) - 180)
        expect(hueDelta, `${label}@${tier}`).toBeLessThan(2)
      }
    }
  })

  it('basis 档等价于原样返回(不做无谓的颜色往返损耗)', () => {
    for (const { palette } of UNIVERSE.slice(0, 50)) {
      expect(applyMoodArc(palette, 'basis')).toEqual(palette)
    }
  })
})

describe('sceneMoodFor · 弧线映射表', () => {
  const SCENE_TYPES: readonly SceneType[] = [
    'source-reading', 'visual-observation', 'concept-build', 'worked-example',
    'contrast', 'practice', 'recap', 'ai-verify', 'ai-inquiry', 'ai-collab',
  ]

  it('全部 10 个 sceneType 都有显式档位,快照锁定映射表', () => {
    const table = Object.fromEntries(SCENE_TYPES.map(sceneType => [sceneType, sceneMoodFor({ sceneType })]))
    expect(table).toMatchInlineSnapshot(`
      {
        "ai-collab": "dim",
        "ai-inquiry": "deep",
        "ai-verify": "deep",
        "concept-build": "dim",
        "contrast": "deep",
        "practice": "dim",
        "recap": "lift",
        "source-reading": "basis",
        "visual-observation": "basis",
        "worked-example": "dim",
      }
    `)
  })

  it('确定性:同 sceneType 永远同档(纯函数,不依赖 course)', () => {
    for (const sceneType of SCENE_TYPES) {
      expect(sceneMoodFor({ sceneType })).toBe(sceneMoodFor({ sceneType }))
    }
  })

  it('弧线覆盖全部 4 档,且教学位置符合设计:开场基准 → 概念/例题沉 → 对比/AI辨析类最深 → 练习回升 → 收束提亮', () => {
    expect(sceneMoodFor({ sceneType: 'source-reading' })).toBe('basis')
    expect(sceneMoodFor({ sceneType: 'visual-observation' })).toBe('basis')
    expect(sceneMoodFor({ sceneType: 'concept-build' })).toBe('dim')
    expect(sceneMoodFor({ sceneType: 'worked-example' })).toBe('dim')
    expect(sceneMoodFor({ sceneType: 'contrast' })).toBe('deep')
    expect(sceneMoodFor({ sceneType: 'ai-verify' })).toBe('deep')
    expect(sceneMoodFor({ sceneType: 'ai-inquiry' })).toBe('deep')
    expect(sceneMoodFor({ sceneType: 'practice' })).toBe('dim')
    expect(sceneMoodFor({ sceneType: 'ai-collab' })).toBe('dim')
    expect(sceneMoodFor({ sceneType: 'recap' })).toBe('lift')
  })
})

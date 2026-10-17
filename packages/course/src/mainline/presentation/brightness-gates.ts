import { hexToOklch } from './color.js'
import type { Palette } from './primitives.js'

/**
 * 明亮令硬闸门 · docs/design-refresh/2026-07-22-brightness-mandate.md 准则 5 / WP-F
 *
 * 调色板级硬约束——不是渲染后检查,而是「不合格的方案根本不该被产出」:
 * 派生引擎(pack-families)靠 MOOD_SPECS 区间在构造上保证,本模块提供统一的
 * 判定函数,由全空间测试(brightness-gates.test.ts)对**默认可达的每一张皮**
 * (生成档全空间 × 精修档 × 引进档默认池)逐条执行,任何越线在 CI 就红。
 *
 * 四条闸门(palette 可判定的部分;「主副色比例/无遮挡」是版式与渲染的职责,
 * 由 quality-gates.ts 的内容密集/遮挡类闸门与母版约束承担,不在此处):
 * - light-ground  浅底:paper.l ≥ PAPER_L_FLOOR 且 paper 亮于 ink(浅底深字);
 * - ink-contrast  深字:ink 与 paper 的 ΔL ≥ INK_PAPER_DELTA_MIN;
 * - backdrop-floor 禁整页深底:基准态 backdrop 最深一档 L ≥ BACKDROP_L_FLOOR;
 * - accent-lock   对比锁档:accent.l ≤ ACCENT_L_CEILING(浅底上的深强调色,
 *   与 pack-families 派生引擎 / mood-arc shiftAccentL 同一套不变量)。
 */

/** 纸面(卡片底)明度下限——白为主改造(2026-07-22 第三次收紧,用户拍板「更多以
 * 白色为主色」):0.80 → 0.92,全部地面进近白带(设计带下限 0.935,留量化余量)。 */
export const PAPER_L_FLOOR = 0.92
/** 浅底深字的最小明度差(全档 ink ≤0.25 / paper ≥0.935 → 实际 ≥0.68,底线留 0.38)。 */
export const INK_PAPER_DELTA_MIN = 0.38
/** 基准态舞台底色(backdrop 三档中最深一档)明度下限——白为主 0.78 → 0.89:
 * 渐变只是白纸上的光向暗示,不再是可感的"变暗区域"。 */
export const BACKDROP_L_FLOOR = 0.89
/** 白族纸面彩度上限——白为主第四次收紧(2026-07-23,用户「都不是白的」):2-4% 底韵
 * 在整屏 backdrop 上仍读成一片色,压到 ≤0.02(设计带上限 0.014,留量化余量)。
 * 地色只许一丝几乎不可见的冷暖 hue;颜色全部让给 accent 物件层。 */
export const PAPER_C_CEILING = 0.02
/** 浅底对比锁档:accent 必须是深强调色(深块浅字仍允许——那是块级,不是整页)。 */
export const ACCENT_L_CEILING = 0.55
/** 「标签多色同明度」判定容差(OKLCH L)。 */
export const LABEL_LUMINANCE_EPSILON = 0.08

/** 粉紫地色禁带(2026-07-22 用户裁定「粉紫色不适合 K12 课程」,地理课玫瑰紫地实证):
 * OKLCH 色相 [280°,360°)∪[0°,18°) 的地色(paper/backdrop)一律不许——紫/洋红/粉
 * 不做课程底色;彩度低于 GROUND_HUE_CHROMA_GATE 的近中性地不论色相(灰白无粉感)。 */
export const BANNED_GROUND_HUE_START = 280
export const BANNED_GROUND_HUE_END = 18
export const GROUND_HUE_CHROMA_GATE = 0.02

function isBannedGroundHue(hex: string): boolean {
  const { c, h } = hexToOklch(hex)
  if (c < GROUND_HUE_CHROMA_GATE) return false
  return h >= BANNED_GROUND_HUE_START || h < BANNED_GROUND_HUE_END
}

/** 地色粉紫检测(paper + backdrop 任一档命中即真)——importedPoolFor 用它过滤默认池。 */
export function hasBannedGroundHue(p: Pick<Palette, 'paper' | 'backdrop'>): boolean {
  return isBannedGroundHue(p.paper) || p.backdrop.some(hex => isBannedGroundHue(hex))
}

export type BrightnessRule = 'light-ground' | 'ink-contrast' | 'backdrop-floor' | 'accent-lock' | 'ground-hue' | 'white-ground'

export interface BrightnessViolation {
  rule: BrightnessRule
  detail: string
}

export function auditPaletteBrightness(p: Palette): BrightnessViolation[] {
  const violations: BrightnessViolation[] = []
  const paperL = hexToOklch(p.paper).l
  const inkL = hexToOklch(p.ink).l
  const accentL = hexToOklch(p.accent).l
  const backdropMinL = Math.min(...p.backdrop.map(hex => hexToOklch(hex).l))

  if (paperL < PAPER_L_FLOOR || paperL <= inkL) {
    violations.push({ rule: 'light-ground', detail: `paper.l=${paperL.toFixed(3)} (floor ${PAPER_L_FLOOR}, ink.l=${inkL.toFixed(3)})` })
  }
  if (paperL - inkL < INK_PAPER_DELTA_MIN) {
    violations.push({ rule: 'ink-contrast', detail: `paper.l-ink.l=${(paperL - inkL).toFixed(3)} < ${INK_PAPER_DELTA_MIN}` })
  }
  if (backdropMinL < BACKDROP_L_FLOOR) {
    violations.push({ rule: 'backdrop-floor', detail: `min(backdrop.l)=${backdropMinL.toFixed(3)} < ${BACKDROP_L_FLOOR}` })
  }
  if (accentL > ACCENT_L_CEILING) {
    violations.push({ rule: 'accent-lock', detail: `accent.l=${accentL.toFixed(3)} > ${ACCENT_L_CEILING}` })
  }
  if (hasBannedGroundHue(p)) {
    violations.push({ rule: 'ground-hue', detail: `paper/backdrop 命中粉紫禁带 [${BANNED_GROUND_HUE_START}°,${BANNED_GROUND_HUE_END}°)` })
  }
  const paperC = hexToOklch(p.paper).c
  if (paperC > PAPER_C_CEILING) {
    violations.push({ rule: 'white-ground', detail: `paper.c=${paperC.toFixed(3)} > ${PAPER_C_CEILING}(白族上限)` })
  }

  return violations
}

/**
 * 「标签可多色但同明度」——一组同级标签色的 OKLCH L 必须落在 ε 容差带内。
 * 供未来的多色标签库在生成端自检;当前 palette 只有单 accent,尚无消费方,
 * 先与闸门常量一起固化,标签库落地时直接引用。
 */
export function isSameLuminance(colors: readonly string[], epsilon: number = LABEL_LUMINANCE_EPSILON): boolean {
  if (colors.length <= 1) return true
  const ls = colors.map(hex => hexToOklch(hex).l)
  return Math.max(...ls) - Math.min(...ls) <= epsilon
}

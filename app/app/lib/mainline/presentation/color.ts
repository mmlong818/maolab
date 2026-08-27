/**
 * OKLCH 色彩数学 · 无第三方依赖(标准 sRGB↔OKLab↔OKLCH 矩阵,Björn Ottosson 公式)
 *
 * 供两处消费:
 * - chrome.ts:课堂 chrome(控制条/对白框/名牌)按风格包 palette 算法派生颜色;
 * - .claude/recolor-style-packs.ts(一次性脚本):重派生 style-packs.ts 的 palette hex。
 *
 * 只做颜色空间转换与插值,不含任何业务规则——业务规则(对比度档位、ΔL 阶梯等)
 * 由调用方决定,这里保持纯数学、可单测。
 */

export interface Oklch {
  l: number
  c: number
  /** 角度,0-360;C≈0 时 h 无意义但仍保留最近一次有效值 */
  h: number
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055
  return clamp01(v)
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '')
  const full = v.length === 3 ? v.split('').map(ch => ch + ch).join('') : v
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(c => clampByte(c).toString(16).padStart(2, '0')).join('')}`
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(v => srgbToLinear(v / 255))
  const [L, a, bb] = linearRgbToOklab(r!, g!, b!)
  const c = Math.sqrt(a * a + bb * bb)
  const h = c < 0.0001 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI
  return { l: L, c, h: h < 0 ? h + 360 : h }
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180
  const a = Math.cos(rad) * c
  const bb = Math.sin(rad) * c
  const [r, g, b] = oklabToLinearRgb(l, a, bb)
  return rgbToHex(linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(b) * 255)
}

/** 最短路径圆形插值(色相环 0-360) */
function lerpHue(h1: number, h2: number, t: number): number {
  let delta = ((h2 - h1 + 540) % 360) - 180
  const h = h1 + delta * t
  return ((h % 360) + 360) % 360
}

export function mixOklch(hexA: string, hexB: string, t: number): string {
  const a = hexToOklch(hexA)
  const b = hexToOklch(hexB)
  return oklchToHex({
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: lerpHue(a.h, b.h, t),
  })
}

/** hex → rgba() 字符串,承载不透明度(替代 Tailwind `bg-[#..]/NN` 对动态色值不生效的问题) */
export function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

/** 保持色相与色度,把 L 钳制到目标区间(用于对比度分档) */
export function withL(hex: string, l: number): string {
  const o = hexToOklch(hex)
  return oklchToHex({ ...o, l: clamp01(l) })
}

function inSrgbGamut(l: number, c: number, h: number): boolean {
  const rad = (h * Math.PI) / 180
  const a = Math.cos(rad) * c
  const bb = Math.sin(rad) * c
  const [r, g, b] = oklabToLinearRgb(l, a, bb)
  const eps = 1e-4
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps
}

/**
 * 保持色相与 L 目标值,彩度收缩到刚好落回 sRGB gamut 内——供"把 L 推向明暗两极"
 * 的调用方(如 mood-arc 幕级明暗分层)代替 withL:withL 的 oklchToHex 末端是逐通道
 * 硬钳位,越界时会把色相也拖偏(实测高彩度色推到 L≈0.85+ 时偏色可达 20°+);
 * 这里改成沿彩度轴收缩(二分查找,24 次迭代精度足够 8bit 输出),色相在数学上
 * 保持不变,代价是极端 L 下会看起来更"淡"(gamut 边界本就画不出高彩度+极端明暗
 * 的组合,这是显示颜色空间的物理限制,不是实现选择)。
 */
/**
 * 从 OKLCH 分量直接构造 hex,越界时沿彩度轴收缩落回 sRGB gamut(色相/明度不动)——
 * 供派生引擎(pack-families derivePalette)用:明亮令后纸色带高明度+较高彩度
 * (如 pastel 档 L≈0.9 C≈0.1),蓝紫相在该区间越界,oklchToHex 的逐通道硬钳位
 * 会把色相拖偏;这里与 withLInGamut 同一收缩策略,只是入参是分量而非既有 hex。
 */
export function oklchToHexInGamut({ l, c, h }: Oklch): string {
  const cl = clamp01(l)
  if (inSrgbGamut(cl, c, h)) return oklchToHex({ l: cl, c, h })
  let lo = 0
  let hi = c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inSrgbGamut(cl, mid, h)) lo = mid
    else hi = mid
  }
  return oklchToHex({ l: cl, c: lo, h })
}

export function withLInGamut(hex: string, targetL: number): string {
  const o = hexToOklch(hex)
  const l = clamp01(targetL)
  if (inSrgbGamut(l, o.c, o.h)) return oklchToHex({ l, c: o.c, h: o.h })
  let lo = 0
  let hi = o.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inSrgbGamut(l, mid, o.h)) lo = mid
    else hi = mid
  }
  return oklchToHex({ l, c: lo, h: o.h })
}

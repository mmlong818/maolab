import { hexToOklch, mixOklch, toRgba, withL } from './color.js'
import { paletteOf, type Palette } from './primitives.js'

/**
 * 课堂 chrome(控制条/页码/双师开关/对白框/名牌)配色 · 从课程风格包 palette 算法派生
 *
 * 此前这些浮层一律硬编码 classic 的暖棕色,压在蓝图(冷色暗场)等风格包幕布上冷暖打架
 * (真检 2026-07-21)。规则:chrome 只认 palette 的 ink/paper/accent 三色,不认具体包 id——
 * 新增风格包无需回来改这里。
 *
 * - darkColor/lightColor:ink、paper 两者中较暗/较亮的一个(暗场包 paper 暗、ink 亮;
 *   纸色包反过来)——chrome 的"底色"永远取较暗者压深一档,永远和当前包同色相。
 * - active 态(当前页/开关开启)沿用"浅色 accent 底 + 深墨字"的高对比约定,与包深浅无关,
 *   因为它要在深色 chrome 上跳出来。
 */
export interface ChromeColors {
  /** 控制条/提词器面板背景(半透明) */
  barBg: string
  /** 控制条顶边线 / 面板边框 */
  barBorder: string
  /** 静态按钮/胶囊底色(页码、质量摘要、语音关;控制条内已不透明,直接实色) */
  chipBg: string
  /** 同 chipBg,但供直接浮在幕布上的孤立按钮用(双师开关/课程切换/备课入口),带透明度 */
  chipBgFloating: string
  chipBorder: string
  chipText: string
  /** 次要文字(分隔符、副标题) */
  mutedText: string
  /** 选中/开启态 */
  activeBg: string
  activeBorder: string
  activeText: string
  /** 对白框/旁白框 */
  dialogueBg: string
  dialogueBorder: string
  dialogueText: string
  /** 对白框内的说话人小标签(如"旁白")——accent 已按对比度分档保证在 paper 上可读 */
  dialogueLabelText: string
  /** 人名贴纸 */
  nameplateBg: string
  nameplateText: string
}

export function chromeColorsFor(palette: Palette): ChromeColors {
  const ink = hexToOklch(palette.ink)
  const paper = hexToOklch(palette.paper)
  const isDarkPack = paper.l < ink.l
  const darkColor = isDarkPack ? palette.paper : palette.ink
  const lightColor = isDarkPack ? palette.ink : palette.paper

  const barCore = mixOklch(darkColor, '#000000', 0.32)
  const chipBg = mixOklch(darkColor, '#000000', 0.10)
  const chipBorder = mixOklch(darkColor, lightColor, 0.32)
  const chipText = mixOklch(lightColor, palette.accent, 0.12)
  const mutedText = mixOklch(lightColor, darkColor, 0.38)

  const activeBg = withL(palette.accent, 0.82)
  const accentLum = hexToOklch(palette.accent).l
  const activeText = accentLum > 0.6 ? mixOklch(darkColor, '#000000', 0.2) : darkColor

  const nameplateBg = palette.accent
  const nameplateText = accentLum > 0.6 ? mixOklch(darkColor, '#000000', 0.25) : mixOklch(lightColor, '#ffffff', 0.3)

  return {
    barBg: toRgba(barCore, 0.9),
    barBorder: toRgba(palette.accent, 0.4),
    chipBg,
    chipBgFloating: toRgba(chipBg, 0.88),
    chipBorder,
    chipText,
    mutedText,
    activeBg,
    activeBorder: palette.accent,
    activeText,
    dialogueBg: toRgba(palette.paper, 0.93),
    dialogueBorder: toRgba(mixOklch(palette.paper, palette.accent, 0.3), 0.55),
    dialogueText: palette.ink,
    dialogueLabelText: palette.accent,
    nameplateBg,
    nameplateText,
  }
}

/**
 * 未持有 course 语境的极少数消费方(如 workbench/PreviewStage.tsx 只读预览,不接
 * StageCanvas 的翻页/学情状态,也不在本次改动范围内)缺省用这份 chrome——用 general
 * 学科的托底配色算出来,视觉上等同重构前的硬编码暖色,不引入回归。
 */
export const DEFAULT_CHROME: ChromeColors = chromeColorsFor(paletteOf('general', 'standard'))

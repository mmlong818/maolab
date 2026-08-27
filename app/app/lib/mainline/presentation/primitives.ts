import type { SubjectId } from '../domain.js'
import { subjectTheme, type SubjectTheme } from './tokens.js'

/**
 * 呈现原子库 · 配色/底图/标签/标记/装饰/段落排版 六库
 *
 * 每库是纯数据(CSS token),库与库正交,由 presentation.ts 的解析器按
 * (course.id + scene.id) 确定性组合;每幕型有一套精修模板托底
 * (templates in presentation.ts),任何轴解析失败都落回模板值。
 * 组合空间 = 版式库(106) × 配色(30) × 标签(4) × 标记(4) × 装饰(4) × 底图(6)。
 */

/* ── 配色库:每学科 3 档(标准/深郁/清浅),由学科主题色确定性派生 ── */

export interface Palette extends SubjectTheme {
  id: string
  /** 墨色(正文/标题文字) */
  ink: string
  /** 纸色(卡片底) */
  paper: string
}

function clamp(n: number): number { return Math.max(0, Math.min(255, Math.round(n))) }

function shiftHex(hex: string, factor: number): string {
  const v = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16))
  const mix = (c: number) => factor >= 0 ? clamp(c + (255 - c) * factor) : clamp(c * (1 + factor))
  return `#${[mix(r!), mix(g!), mix(b!)].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

export type PaletteMood = 'standard' | 'deep' | 'airy'
export const PALETTE_MOODS: readonly PaletteMood[] = ['standard', 'deep', 'airy']

const WARM_INK = '#2d2417'
const WARM_PAPER = '#fff8e8'

export function paletteOf(subject: SubjectId, mood: PaletteMood): Palette {
  const base = subjectTheme(subject)
  if (mood === 'standard') return { id: `${subject}-standard`, ink: WARM_INK, paper: WARM_PAPER, ...base }
  if (mood === 'deep') {
    return {
      id: `${subject}-deep`,
      ink: WARM_INK,
      paper: WARM_PAPER,
      accent: shiftHex(base.accent, -0.22),
      accentSoft: shiftHex(base.accentSoft, -0.06),
      // 白为主(2026-07-22):deep 档幕布下压从 -5/-8/-12% 收敛到 -2/-3/-5%,
      // "深郁"只落在 accent 上,地面留在白族。
      backdrop: [shiftHex(base.backdrop[0], -0.02), shiftHex(base.backdrop[1], -0.03), shiftHex(base.backdrop[2], -0.05)],
    }
  }
  return {
    id: `${subject}-airy`,
    ink: WARM_INK,
    paper: WARM_PAPER,
    accent: shiftHex(base.accent, 0.12),
    accentSoft: shiftHex(base.accentSoft, 0.4),
    backdrop: [shiftHex(base.backdrop[0], 0.3), shiftHex(base.backdrop[1], 0.22), shiftHex(base.backdrop[2], 0.16)],
  }
}

/* ── 底图库:幕布纹理层(叠在配色渐变之上) ── */

export type BaseplateId = 'wash' | 'grid' | 'dots' | 'diagonal' | 'vignette' | 'band'
export const BASEPLATE_LIBRARY: readonly BaseplateId[] = ['wash', 'grid', 'dots', 'diagonal', 'vignette', 'band']

/** 返回叠加在渐变底上的纹理 CSS(background-image 片段);wash 为素面托底。 */
export function baseplateOverlay(id: BaseplateId, p: Palette): string {
  const ink = 'rgba(45,36,23,'
  switch (id) {
    case 'grid':
      return `repeating-linear-gradient(0deg, ${ink}0.05) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, ${ink}0.05) 0 1px, transparent 1px 64px)`
    case 'dots':
      return `radial-gradient(${ink}0.09) 1.2px, transparent 1.4px)`
    case 'diagonal':
      return `linear-gradient(135deg, ${p.accent}14 0%, transparent 38%)`
    case 'vignette':
      return `radial-gradient(ellipse at 50% 42%, transparent 58%, ${ink}0.10) 100%)`
    case 'band':
      return `linear-gradient(180deg, #ffffff2e 0%, transparent 18%)`
    default:
      return ''
  }
}

export function baseplateSize(id: BaseplateId): string | undefined {
  return id === 'dots' ? '44px 44px' : undefined
}

/* ── 标签库:板书胶囊/贴签的四种形态 ── */

export type LabelStyleId = 'capsule-dark' | 'paper-sticker' | 'ribbon' | 'underline-tag'
export const LABEL_LIBRARY: readonly LabelStyleId[] = ['capsule-dark', 'paper-sticker', 'ribbon', 'underline-tag']

export interface LabelCss {
  background: string
  color: string
  border?: string
  borderBottom?: string
  borderRadius: string
  boxShadow?: string
  transform?: string
  backdropFilter?: string
}

export function labelCss(id: LabelStyleId, p: Palette): LabelCss {
  switch (id) {
    case 'paper-sticker':
      return { background: `${p.paper}f2`, color: p.ink, border: `1px solid ${p.accent}66`, borderRadius: '8px', boxShadow: '0 6px 18px rgba(40,26,12,0.22)', transform: 'rotate(-0.6deg)' }
    case 'ribbon':
      return { background: p.accent, color: '#fdf6e6', borderRadius: '3px', boxShadow: '0 6px 18px rgba(40,26,12,0.28)' }
    case 'underline-tag':
      return { background: 'transparent', color: p.ink, borderBottom: `3px solid ${p.accent}`, borderRadius: '0' }
    default: // capsule-dark(托底)
      return { background: 'rgba(36,28,17,0.82)', color: '#f7ecd6', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.28)', backdropFilter: 'blur(2px)' }
  }
}

/* ── 标记库:编号章/节点的四种形态 ── */

export type MarkerStyleId = 'circle-outline' | 'circle-solid' | 'square-ink' | 'ghost'
export const MARKER_LIBRARY: readonly MarkerStyleId[] = ['circle-outline', 'circle-solid', 'square-ink', 'ghost']

export interface MarkerCss {
  background: string
  color: string
  border?: string
  borderRadius: string
}

export function markerCss(id: MarkerStyleId, p: Palette): MarkerCss {
  switch (id) {
    case 'circle-solid':
      return { background: p.accent, color: '#fdf6e6', borderRadius: '9999px' }
    case 'square-ink':
      return { background: '#2d2417', color: '#f7ecd6', borderRadius: '8px' }
    case 'ghost':
      return { background: 'transparent', color: p.accent, border: `2px solid ${p.accent}88`, borderRadius: '9999px' }
    default: // circle-outline(托底)
      return { background: p.paper, color: p.accent, border: `1px solid ${p.accent}`, borderRadius: '9999px' }
  }
}

/* ── 装饰库:卡片缘饰的四种形态 ── */

export type DecorStyleId = 'clean' | 'left-spine' | 'top-rule' | 'lift'
export const DECOR_LIBRARY: readonly DecorStyleId[] = ['clean', 'left-spine', 'top-rule', 'lift']

export function decorCss(id: DecorStyleId, p: Palette): Record<string, string> {
  switch (id) {
    case 'left-spine':
      return { borderLeft: `6px solid ${p.accent}` }
    case 'top-rule':
      return { borderTop: `3px solid ${p.accent}` }
    case 'lift':
      return { boxShadow: '0 22px 60px rgba(40,26,12,0.28)' }
    default:
      return {}
  }
}

/* ── 段落排版库:板书卡组的文字排布方式 ── */

export type TextblockStyleId = 'stack' | 'two-col' | 'lede-body' | 'numbered'
export const TEXTBLOCK_LIBRARY: readonly TextblockStyleId[] = ['stack', 'two-col', 'lede-body', 'numbered']

/**
 * 表面语言库 · StylePack 身份三轴之二(2026-07-21 identity refresh)
 *
 * 卡片"长什么形状"的轴——区别于 decorCss(缘饰:哪条边加线/投影)与 labelCss
 * (胶囊/贴签形态),这里管的是卡片本体的形状语法:直角细边(编辑部气质)/
 * 大圆角软投影 / 玻璃拟态(半透明+模糊+亮边)/ 水墨笔触边(不规则圆角+晕染)/
 * 贴纸感(圆角+硬投影+微旋转)。五种在黑白稿下也必须可辨——radius 形状与
 * transform 旋转是纯结构信号,不依赖配色。实现见 scene-views/shared.tsx 的
 * cardSurface() 与 globals.css 的 `.pack-surface` 工具类(CSS 变量注入版,供
 * 未逐个传参的长尾卡片用)。
 */
export type SurfaceId = 'sharp-editorial' | 'rounded-soft' | 'glass' | 'ink-brush' | 'paper-sticker'
export const SURFACE_LIBRARY: readonly SurfaceId[] = ['sharp-editorial', 'rounded-soft', 'glass', 'ink-brush', 'paper-sticker']

/**
 * 质感库 · StylePack 身份三轴之三——舞台**全幅背景**的质感层(StageCanvas.tsx
 * StageBackdrop 消费),与 baseplate(幕内卡片/胶囊背后的局部纹理,按幕型模板轮换)
 * 是两条正交轴:baseplate 每幕可能不同,texture 锁定在风格包上,全课统一。
 * intensity(0-1)控制叠加强度,取代此前写死的 wantsFilmGrain 单一深浅判定。
 */
/**
 * 明亮令(2026-07-22)扩两种现代光影素材——旧五种只有平面纹理,承载不了「空间立体/
 * 光影方向」的身份(schema 是同质化机器,先扩 schema 再谈引进):
 * - mesh:渐变网格——accent/accentSoft 色晕锚在画面角落的柔和色场,当代 aurora 质感;
 * - glow:定向光晕——左上主光源 + 斜向光带,给明亮地色做出光的方向与衰减。
 * 渲染实现见 StageCanvas.tsx StageTextureLayer。
 */
export type TextureKind = 'none' | 'grain' | 'grid' | 'dots' | 'paper' | 'mesh' | 'glow'
export const TEXTURE_KIND_LIBRARY: readonly TextureKind[] = ['none', 'grain', 'grid', 'dots', 'paper', 'mesh', 'glow']

export interface TextureSpec {
  kind: TextureKind
  intensity: number
}

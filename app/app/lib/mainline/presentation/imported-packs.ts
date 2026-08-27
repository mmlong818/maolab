import type { GradeBand } from '../domain.js'
import { auditPaletteBrightness, BANNED_GROUND_HUE_END, BANNED_GROUND_HUE_START } from './brightness-gates.js'
import { hexToOklch } from './color.js'
import { IMPORTED_PACKS, type ImportedPackDatum } from './imported-packs.data.js'
import type { SurfaceId, TextureSpec } from './primitives.js'
import type { FontRole, ReadableFontRole } from './tokens.js'
import type { StylePack } from './style-packs.js'

/**
 * 引进档主入口 · 71 套开源配色宇宙(vendor 数据见 imported-packs.data.ts) 的选择逻辑
 *
 * 数据本身已在 codegen 阶段跑过质量闸门(见 imported-packs.data.ts 文件头统计),
 * 这里做三件事:按学段做基调过滤(小学偏浅色 flavor,其余学段全开)、按 universe
 * 补上身份三轴(2026-07-21 identity refresh——vendor 数据只收割了调色板,字体/表面/
 * 质感这套"设计语言"不是任何配色宇宙自带的信息,只能由我们按宇宙气质策展补齐,
 * 不回到 codegen 重跑,直接在这层按 universe 合并)、按 course.id 加盐哈希选一条
 * ——与 pack-families.ts 的生成档选择同构(同课永远同款)。
 */

export interface ImportedPackInstance extends ImportedPackDatum, Pick<StylePack, 'typography' | 'surface' | 'texture'> {}

/**
 * 宇宙 → 身份三轴映射表(12 个非 tweakcn 宇宙显式表态,tweakcn 63 个预设按名字
 * 语义分桶,见 identityForTweakcnPreset)。依据:
 * - Catppuccin/Rosé Pine:柔雾马卡龙、猫系可爱 → 大圆角软投影;Rosé Pine 额外带
 *   一点胶片颗粒呼应其"复古调色"气质。
 * - Kanagawa:日式浮世绘配色 → 水墨笔触边 + 纸纹 + 宋显楷文(与 ink-academy 精修
 *   包同构,气质高度重合)。
 * - Tokyo Night/Dracula/One Dark/Monokai:程序员编辑器暗色宇宙,共享"屏幕玻璃"
 *   气质 → 玻璃拟态 + 颗粒(荧光屏噪点感)。
 * - Nord:极简冷淡 → 直角细边,零质感。
 * - Everforest:山林绿意、纸感偏软 → 大圆角 + 纸纹 + 刘建毛草体(草木随笔感)。
 * - Gruvbox:复古做旧、暖褐高对比 → 贴纸感 + 颗粒 + 站酷快乐体(复古玩具感)。
 * - Solarized:学术味的低饱和双色阶 → 直角细边 + 宋体。
 *
 * 2026-07-21 十族扩容:Everforest/Gruvbox/Kanagawa 三个宇宙的 display 换用新引入的
 * 美术字体(刘建毛草/站酷快乐体/站酷小薇体),body 仍留在可读三族内——两条各自的
 * flavor 数(6/2/3)虽不足单独凑够「≥5 包引用」,但与 pack-families.ts 生成档的同款
 * 字体签名(各 126 实例)合并计数早已远超门槛,这里的意义是让引进档也长出十族身份,
 * 而不是让新字体只活在生成档。
 */
const UNIVERSE_IDENTITY: Record<string, { typography: { display: FontRole; body: ReadableFontRole }; surface: SurfaceId; texture: TextureSpec }> = {
  Catppuccin: { typography: { display: 'hei', body: 'hei' }, surface: 'rounded-soft', texture: { kind: 'none', intensity: 0 } },
  Kanagawa: { typography: { display: 'xiaowei', body: 'song' }, surface: 'ink-brush', texture: { kind: 'paper', intensity: 0.35 } },
  'Rosé Pine': { typography: { display: 'song', body: 'song' }, surface: 'rounded-soft', texture: { kind: 'grain', intensity: 0.4 } },
  'Tokyo Night': { typography: { display: 'hei', body: 'hei' }, surface: 'glass', texture: { kind: 'grain', intensity: 0.45 } },
  Dracula: { typography: { display: 'hei', body: 'hei' }, surface: 'glass', texture: { kind: 'grain', intensity: 0.45 } },
  'One Dark': { typography: { display: 'hei', body: 'hei' }, surface: 'glass', texture: { kind: 'grain', intensity: 0.45 } },
  Monokai: { typography: { display: 'hei', body: 'hei' }, surface: 'glass', texture: { kind: 'grain', intensity: 0.45 } },
  Nord: { typography: { display: 'hei', body: 'hei' }, surface: 'sharp-editorial', texture: { kind: 'none', intensity: 0 } },
  Everforest: { typography: { display: 'liujian', body: 'kai' }, surface: 'rounded-soft', texture: { kind: 'paper', intensity: 0.3 } },
  Gruvbox: { typography: { display: 'kuaile', body: 'kai' }, surface: 'paper-sticker', texture: { kind: 'grain', intensity: 0.45 } },
  Solarized: { typography: { display: 'song', body: 'song' }, surface: 'sharp-editorial', texture: { kind: 'none', intensity: 0 } },
}

const HEI_UNIFORM = { typography: { display: 'hei' as FontRole, body: 'hei' as ReadableFontRole } }
const KAI_UNIFORM = { typography: { display: 'kai' as FontRole, body: 'kai' as ReadableFontRole } }

/**
 * tweakcn 63 个预设按名字语义分桶(第一条匹配的规则生效,详见各分支注释),
 * 兜底 rounded-soft + none + hei(task 明确要求的兜底组合)。不逐一手写 63 条——
 * shadcn/tweakcn 的预设名本身就是气质标签,关键词分桶比强行每条定制更诚实。
 */
function identityForTweakcnPreset(packId: string): { typography: { display: FontRole; body: ReadableFontRole }; surface: SurfaceId; texture: TextureSpec } {
  const name = packId.replace(/^imported:tweakcn-/, '').replace(/-(light|dark)$/, '')

  if (/clay/.test(name)) return { ...HEI_UNIFORM, surface: 'rounded-soft', texture: { kind: 'grain', intensity: 0.5 } }
  if (/vintage|paper|notebook/.test(name)) return { typography: { display: 'song', body: 'song' }, surface: 'paper-sticker', texture: { kind: 'paper', intensity: 0.35 } }
  if (/cosmic|night|darkmatter|quantum|starry|northern-lights|midnight/.test(name)) return { ...HEI_UNIFORM, surface: 'glass', texture: { kind: 'grain', intensity: 0.55 } }
  if (/cyber|tech|supabase/.test(name)) return { ...HEI_UNIFORM, surface: 'glass', texture: { kind: 'grid', intensity: 0.4 } }
  if (/candy|bubblegum|pastel|soft-pop|kodama|sage|ocean|nature|mousse/.test(name)) return { ...KAI_UNIFORM, surface: 'rounded-soft', texture: { kind: 'dots', intensity: 0.35 } }
  if (/brutal|doom|arcade|twitter/.test(name)) return { ...HEI_UNIFORM, surface: 'sharp-editorial', texture: { kind: 'grid', intensity: 0.5 } }
  if (/minimal|slate|graphite|^mono$|elegant|perpetuity|t3-chat|claude/.test(name)) return { ...HEI_UNIFORM, surface: 'sharp-editorial', texture: { kind: 'none', intensity: 0 } }
  if (/caffeine|tangerine|solar|sunset|amethyst|violet|rose/.test(name)) return { ...KAI_UNIFORM, surface: 'paper-sticker', texture: { kind: 'grain', intensity: 0.4 } }

  return { ...HEI_UNIFORM, surface: 'rounded-soft', texture: { kind: 'none', intensity: 0 } }
}

function identityFor(datum: ImportedPackDatum): { typography: { display: FontRole; body: ReadableFontRole }; surface: SurfaceId; texture: TextureSpec } {
  if (datum.source.universe === 'tweakcn') return identityForTweakcnPreset(datum.id)
  return UNIVERSE_IDENTITY[datum.source.universe] ?? { ...HEI_UNIFORM, surface: 'rounded-soft', texture: { kind: 'none', intensity: 0 } }
}

const IMPORTED_INSTANCES: readonly ImportedPackInstance[] = IMPORTED_PACKS.map(p => ({ ...p, ...identityFor(p) }))

function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/** 粉紫禁令扩到引进包 accent(2026-07-23,白化后地色已近白,唯一残留粉紫风险在
 * 强调色):accent 色相落 [280°,18°) 且彩度可见即排除(如 amethyst/violet/bubblegum
 * 的紫粉强调)——粉紫不做 K12 用色,地色与强调色一致适用。 */
function hasBannedAccentHue(p: { accent: string }): boolean {
  const { c, h } = hexToOklch(p.accent)
  if (c < 0.04) return false
  return h >= BANNED_GROUND_HUE_START || h < BANNED_GROUND_HUE_END
}

/**
 * 白为主 + 粉紫禁令后的默认池:**全学段**只取 ① 通过 brightness-gates 全部闸门
 * (近白纸面/白族彩度/渐变亮端/粉紫地/对比锁档)且 ② accent 非粉紫 的浅色引进包。
 * 暗色主题、粉紫地/粉紫强调主题、有色纸主题全部退出默认池(数据档案保留,库只增不减)。
 * 池为空才逐级回退,保证任何输入都有解。
 */
export function importedPoolFor(_gradeBand: GradeBand): readonly ImportedPackInstance[] {
  const light = IMPORTED_INSTANCES.filter(p => p.isLight)
  const classroom = light.filter(p => auditPaletteBrightness(p.palette).length === 0 && !hasBannedAccentHue(p.palette))
  if (classroom.length > 0) return classroom
  return light.length > 0 ? light : IMPORTED_INSTANCES
}

export function pickImportedInstance(course: { id: string; gradeBand: GradeBand }): ImportedPackInstance {
  const pool = importedPoolFor(course.gradeBand)
  const datum = pool[hashOf(`${course.id}::imported-v2`) % pool.length]
  if (!datum) throw new Error('IMPORTED_PACKS 为空,引进档不可用')
  return datum
}

/** 供测试/报告统计用:引进包总量与浅色/深色拆分。 */
export function importedPackStats(): { total: number; light: number; dark: number } {
  const light = IMPORTED_PACKS.filter(p => p.isLight).length
  return { total: IMPORTED_PACKS.length, light, dark: IMPORTED_PACKS.length - light }
}

/** 供测试用:89 条引进包(已合并身份三轴)的全量列表,不做学段/哈希过滤。 */
export function allImportedInstances(): readonly ImportedPackInstance[] {
  return IMPORTED_INSTANCES
}

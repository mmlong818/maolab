import type { GradeBand, SubjectId } from '../domain.js'
import { ACTIVE_COLOR_ANCHORS } from './anchors.js'
import type { BaseplateId, DecorStyleId, LabelStyleId, MarkerStyleId, Palette, SurfaceId, TextureSpec } from './primitives.js'
import type { FontRole, ReadableFontRole } from './tokens.js'
import { PACK_MOODS, PAPER_TINTS, TEXTURE_SIGNATURES, derivePackInstance, pickGenerativeInstance, type PackMood } from './pack-families.js'
import { allImportedInstances, pickImportedInstance } from './imported-packs.js'

/**
 * Signature 风格包 · 独有风格库(审美长期目标:世界一流、脱离传统教学范式)
 *
 * 每个风格包是一套完整的视觉手笔:专属调色板(含 ink/paper,支持暗场)、
 * 底图/标签/标记/装饰四轴的**固定签名值**(签名 = 一致的手笔,不参与轮换)、
 * 以及配图 prompt 的风格 DNA。版式(图文立绘字幕怎么摆)仍由版式库轮换——
 * 风格管质感,版式管结构,两者正交。
 *
 * 温度设计(参考 huashu-design):故意注入大胆款(蓝图暗场/水墨/糖果),
 * 对抗"安全米色"的模型默认;classic 为托底,任何未匹配组合落回它。
 */

export type StylePackId = 'classic' | 'blueprint' | 'ink-academy' | 'wonder-lab' | 'field-journal' | 'manuscript'

export interface StylePack {
  /** 精修档用 StylePackId 字面量;生成档用 `generative:<anchor>:<mood>:<tint>:<texture>` 拼接 id。 */
  id: string
  label: string
  whenToUse: string
  /** null = 沿用学科配色库(classic 专用) */
  palette: Palette | null
  baseplate: BaseplateId | null
  labelStyle: LabelStyleId | null
  markerStyle: MarkerStyleId | null
  decorStyle: DecorStyleId | null
  /** 追加到 fill-images STYLE_BASE 的配图风格 DNA */
  imageDNA: string
  /**
   * 身份三轴(2026-07-21 identity refresh)· 光有调色板不构成"设计语言",字体/表面/
   * 质感三者才是蒙掉颜色仍能分辨的结构信号。全部必填——不留 null 托底,任何新增
   * 风格包(精修/引进/生成)都必须显式表态,防止再退化成"只换 7 个 hex"。
   */
  /**
   * display 用于大字标题/核心表述(TYPE_SCALE.display/heading),十族全开(美术/书法体
   * 只许出现在这里);body 用于正文卡(其余 tier),类型收紧到 ReadableFontRole——
   * 硬指标「可读性约束写进类型」docs/design-refresh/hard-targets-spec.md 指标 2。
   */
  typography: { display: FontRole; body: ReadableFontRole }
  /** 卡片表面语言,见 primitives.ts SurfaceId 注释。 */
  surface: SurfaceId
  /** 舞台全幅背景质感层,见 primitives.ts TextureSpec 注释。 */
  texture: TextureSpec
}

export const STYLE_PACKS: Record<StylePackId, StylePack> = {
  classic: {
    id: 'classic',
    label: '经典暖纸',
    whenToUse: '托底:任何未匹配学科/学段;温和、可靠、不会错。',
    palette: null, baseplate: null, labelStyle: null, markerStyle: null, decorStyle: null,
    imageDNA: '',
    typography: { display: 'hei', body: 'hei' },
    surface: 'rounded-soft',
    texture: { kind: 'none', intensity: 0 },
  },
  blueprint: {
    id: 'blueprint',
    label: '白图纸课堂',
    // 明亮令(2026-07-22)重做:深蓝暗场→白晒图纸。工程感不靠黑底,靠白纸上的
    // 精密青蓝线稿 + 定向天光,浅底深字。
    whenToUse: '理科(数/理/化)中学段:白图纸工房,精密青蓝线稿,晴空天光。',
    palette: {
      id: 'pack-blueprint',
      accent: '#0369a1',
      accentSoft: '#d7eefb',
      ink: '#12354f',
      paper: '#f4f9fd',
      backdrop: ['#edf5fb', '#ebf3f9', '#e9f1f7'],
    },
    baseplate: 'grid',
    labelStyle: 'underline-tag',
    markerStyle: 'ghost',
    decorStyle: 'top-rule',
    imageDNA: ' Signature style: engineering drawing on bright white drafting paper — fine cyan-blue technical linework, drafting grid, precise annotation ticks, sunlit studio clarity, layered depth with crisp soft shadows. No dark backgrounds.',
    typography: { display: 'hei', body: 'hei' },
    surface: 'sharp-editorial',
    texture: { kind: 'grid', intensity: 0.3 },
  },
  'ink-academy': {
    id: 'ink-academy',
    label: '朱墨新编',
    // 明亮令(2026-07-22)重做:水墨书院(宣纸/毛笔/晕染)复古气质废止——文史改走
    // 明亮编辑部:亮暖白纸 + 朱红大标点睛 + 现代宋体编排,left-spine 书脊线保留
    // (它是编辑排印语言,不是复古符号)。
    whenToUse: '文史(语文/历史):亮白编辑部排印,朱红点睛,宋体大标,天光柔照。',
    palette: {
      id: 'pack-ink-academy',
      accent: '#b91c1c',
      accentSoft: '#fde5df',
      ink: '#221d18',
      paper: '#fdfaf4',
      backdrop: ['#f8f3ea', '#f7f1e8', '#f5efe7'],
    },
    baseplate: 'band',
    labelStyle: 'underline-tag',
    markerStyle: 'square-ink',
    decorStyle: 'left-spine',
    imageDNA: ' Signature style: bright modern editorial illustration for literature and history — luminous warm-white paper, confident vermilion-red accent, crisp serif typography spirit, layered paper cutout depth, soft directional daylight. No aged paper, no dark tones.',
    typography: { display: 'song', body: 'kai' },
    surface: 'sharp-editorial',
    texture: { kind: 'glow', intensity: 0.35 },
  },
  'wonder-lab': {
    id: 'wonder-lab',
    label: '童话实验室',
    // 明亮令(2026-07-22)升级:奶油底不变,叠渐变网格色场(mesh)——「明亮但复杂」,
    // 糖果色晕给低龄课空间层次,不再是单张平纸。
    whenToUse: '小学段全部 + 中学生命/科学:奶油高明度,珊瑚糖果强调,渐变色场,贴纸立体。',
    palette: {
      id: 'pack-wonder-lab',
      // #c04111 的 OKLCH L=0.5504 贴线越过 0.55 对比锁档,压半档保色相
      accent: '#b93d0f',
      accentSoft: '#ffe3d0',
      ink: '#3a2b1d',
      paper: '#fffdf3',
      backdrop: ['#f7f3ea', '#f5f1e8', '#f4f0e7'],
    },
    baseplate: 'dots',
    labelStyle: 'paper-sticker',
    markerStyle: 'circle-solid',
    decorStyle: 'lift',
    imageDNA: ' Signature style: storybook wonder-lab illustration — soft rounded shapes, candy-cream palette with coral accents, aurora-like pastel gradient fields, gentle sunlight, paper-craft sticker depth with soft shadows, friendly and curious mood.',
    typography: { display: 'kuaile', body: 'kai' },
    surface: 'paper-sticker',
    texture: { kind: 'mesh', intensity: 0.5 },
  },
  'field-journal': {
    id: 'field-journal',
    label: '日光专题',
    // 明亮令(2026-07-22)升级:象牙纸提亮为日光白,加定向光晕(glow)——杂志专题的
    // 编辑排印骨架保留,光线从「室内台灯」换成「白昼天光」。
    whenToUse: '地理/英语/艺术/通用 中学段以上:日光白纸编辑排印,藏青细规则线,天光通透。',
    palette: {
      id: 'pack-field-journal',
      accent: '#28425c',
      accentSoft: '#d4e0eb',
      ink: '#1f1d18',
      paper: '#fdfcf4',
      backdrop: ['#f6f4ea', '#f4f2e8', '#f2f0e7'],
    },
    baseplate: 'band',
    labelStyle: 'underline-tag',
    markerStyle: 'circle-outline',
    decorStyle: 'top-rule',
    imageDNA: ' Signature style: daylight magazine feature illustration — bright white paper, precise naturalist drawing with thin navy rules, annotated specimen aesthetics, airy daylight with soft directional glow, magazine feature layout sensibility.',
    typography: { display: 'xiaowei', body: 'song' },
    surface: 'sharp-editorial',
    texture: { kind: 'glow', intensity: 0.3 },
  },
  manuscript: {
    id: 'manuscript',
    label: '白纸学刊',
    // 明亮令(2026-07-22)重做:去掉 vintage 手稿的做旧感——白纸现代学刊,近黑墨
    // 精密制图 + 绯红批注,细网格底,学术但当代。
    whenToUse: '高中理科/科学:白纸现代学刊排印,近黑墨,绯红批注点睛。',
    palette: {
      id: 'pack-manuscript',
      accent: '#8a1f2d',
      accentSoft: '#ffdcda',
      ink: '#1b1815',
      paper: '#fffef4',
      backdrop: ['#f6f3ea', '#f5f2e8', '#f3f0e7'],
    },
    baseplate: 'grid',
    labelStyle: 'underline-tag',
    markerStyle: 'ghost',
    decorStyle: 'top-rule',
    imageDNA: ' Signature style: modern academic journal figure — precise scientific diagram in near-black ink on bright white paper, fine annotation ticks and measure marks, restrained monochrome with a single crimson accent, contemporary journal plate clarity. No vintage aging.',
    typography: { display: 'song', body: 'song' },
    surface: 'sharp-editorial',
    texture: { kind: 'grid', intensity: 0.2 },
  },
}

const PRIMARY: GradeBand[] = ['lower-primary', 'upper-primary']

/**
 * 精修档:6 个手写 signature 包的显式映射(学科×学段),未命中一律 classic 托底。
 * 这条链本身保持不变——仍是"确知安全"的手笔组合,只是不再独占 stylePackFor 的输出:
 * 见下方 stylePackFor 的 70/30 分流。
 */
export function legacyStylePackFor(course: { subject: SubjectId; gradeBand: GradeBand }): StylePack {
  const { subject, gradeBand } = course
  if (PRIMARY.includes(gradeBand)) return STYLE_PACKS['wonder-lab']
  const sci = subject === 'math' || subject === 'physics' || subject === 'chemistry' || subject === 'science'
  if (sci && gradeBand === 'high-school') return STYLE_PACKS.manuscript
  if (subject === 'math' || subject === 'physics' || subject === 'chemistry') return STYLE_PACKS.blueprint
  if (subject === 'chinese' || subject === 'history') return STYLE_PACKS['ink-academy']
  if (subject === 'biology' || subject === 'science') return STYLE_PACKS['wonder-lab']
  if (subject === 'geography' || subject === 'english') return STYLE_PACKS['field-journal']
  return STYLE_PACKS.classic
}

function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * 精修档命中率——手笔不能被生成档/引进档淹没,但也不能让它继续独占。
 * 三档分流(明亮令 2026-07-22 调整):精修 0.25 / 引进 0.20 / 生成 0.55。
 * 引进档默认池明亮化后只剩 29 条浅色包(60 条暗色归档,见 imported-packs.ts),
 * 45% 流量压在 29 条皮上会过度集中;生成档(明亮现代锚 × 6 光影 mood × 8 tint ×
 * 8 质感签名,2304 palette)接棒承担多样性主体。精修保留 1/4 作"确知安全"托底。
 *
 * 哈希盐 '::pack-tier-imported-mix':2026-07-21 从 70/30 二档改造成三档时,旧盐
 * (`::pack-tier`)与直接改阈值的候选盐(`::pack-tier-v2`)都会让三门演示课
 * (7199cd1a.../cd194b9e.../dd228da7...)全部落在同一档(实测三课全落 generative),
 * 达不到"至少两门离开旧精修皮"的验证点;换成这个盐后三课分别落 legacy/generative/
 * imported 三个不同档(核实见 style-packs.test.ts),同时展示三档全貌,故写死。
 */
const LEGACY_TIER_RATE = 0.25
const IMPORTED_TIER_RATE = 0.20
// 生成档 = 剩余 1 - LEGACY_TIER_RATE - IMPORTED_TIER_RATE = 0.55

/**
 * 模板替换(2026-07-22):按风格包 id 解析回完整 StylePack,三档 id 全支持——
 * - 精修档:StylePackId 字面量('blueprint' 等);
 * - 引进档:'imported:xxx',在全量引进实例里按 id 查(含归档暗色包:已设置的
 *   历史覆盖不能因池收窄而悄悄失效,新选择由 pack-catalog 只供应浅色池);
 * - 生成档:'generative:锚:mood:tint:质感' 参数化 id,直接重派生同一实例。
 * 未知/失效 id 返回 null,调用方回落自动分流——坏数据不炸课堂。
 */
export function resolveStylePackById(packId: string): StylePack | null {
  if (packId in STYLE_PACKS) return STYLE_PACKS[packId as StylePackId]
  if (packId.startsWith('imported:')) {
    return allImportedInstances().find(p => p.id === packId) ?? null
  }
  if (packId.startsWith('generative:')) {
    const [, anchorId, mood, tintId, textureId] = packId.split(':')
    const anchor = ACTIVE_COLOR_ANCHORS.find(a => a.id === anchorId)
    const tint = PAPER_TINTS.find(t => t.id === tintId)
    const texture = TEXTURE_SIGNATURES.find(t => t.id === textureId)
    if (!anchor || !tint || !texture || !PACK_MOODS.includes(mood as PackMood)) return null
    return derivePackInstance(anchor, mood as PackMood, tint, texture)
  }
  return null
}

/**
 * 课程 → 风格包:教师手动指定的 stylePackId(模板替换)优先;否则精修档(6 个手写
 * signature)/ 引进档(浅色开源配色宇宙引进包,见 imported-packs.ts)/ 生成档
 * (anchors × mood × texture 派生家族,见 pack-families.ts)按 course.id 加盐哈希
 * 25/20/55 三分流——同课永远同款,不同课自然错开。
 */
export function stylePackFor(course: { id: string; subject: SubjectId; gradeBand: GradeBand; stylePackId?: string | undefined }): StylePack {
  if (course.stylePackId) {
    const resolved = resolveStylePackById(course.stylePackId)
    if (resolved) return resolved
  }
  const roll = hashOf(`${course.id}::pack-tier-imported-mix`) % 100
  if (roll < LEGACY_TIER_RATE * 100) return legacyStylePackFor(course)
  if (roll < (LEGACY_TIER_RATE + IMPORTED_TIER_RATE) * 100) return pickImportedInstance(course)
  return pickGenerativeInstance(course)
}

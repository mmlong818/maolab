import type { LessonScene, MainlineCourse, SceneType } from '../domain.js'
import { stylePackFor, type StylePack } from './style-packs.js'
import { compositionFor, type Composition } from './composition.js'
import { hexToOklch, withLInGamut } from './color.js'
import {
  BASEPLATE_LIBRARY,
  DECOR_LIBRARY,
  LABEL_LIBRARY,
  MARKER_LIBRARY,
  PALETTE_MOODS,
  TEXTBLOCK_LIBRARY,
  paletteOf,
  type BaseplateId,
  type DecorStyleId,
  type LabelStyleId,
  type MarkerStyleId,
  type Palette,
  type PaletteMood,
  type TextblockStyleId,
} from './primitives.js'

/**
 * 呈现解析器:六库 + 版式库 → 一幕的完整呈现方案(ScenePresentation)。
 *
 * 规则:
 * - 每幕型有一套**精修模板托底**(TEMPLATES):经过审美把关的安全组合;
 * - 各轴按 (course.id + scene.id + 轴名) 哈希在该幕型的**放行池**里轮换;
 *   放行池为空/未定义的轴直接用模板值——组合自由度只开放在确认不翻车的轴上;
 * - 课程色相/风格身份(pack)全课一致,避免页页变脸;但同一色相家族内按幕的
 *   教学弧线位置分明暗档(见 applyMoodArc/sceneMoodFor),不再 18 幕锁死同一张纸。
 */

export interface ScenePresentation {
  composition: Composition
  pack: StylePack
  palette: Palette
  baseplate: BaseplateId
  label: LabelStyleId
  marker: MarkerStyleId
  decor: DecorStyleId
  textblock: TextblockStyleId
}

interface PresentationTemplate {
  baseplate: BaseplateId
  label: LabelStyleId
  marker: MarkerStyleId
  decor: DecorStyleId
  textblock: TextblockStyleId
  /** 各轴放行池:缺省 = 该轴锁死在模板值 */
  pools?: Partial<{
    baseplate: readonly BaseplateId[]
    label: readonly LabelStyleId[]
    marker: readonly MarkerStyleId[]
    decor: readonly DecorStyleId[]
    textblock: readonly TextblockStyleId[]
  }>
}

const DEFAULT_TEMPLATE: PresentationTemplate = {
  baseplate: 'wash',
  label: 'capsule-dark',
  marker: 'circle-outline',
  decor: 'clean',
  textblock: 'stack',
  pools: {
    baseplate: BASEPLATE_LIBRARY,
    label: LABEL_LIBRARY,
    marker: MARKER_LIBRARY,
    decor: DECOR_LIBRARY,
    textblock: TEXTBLOCK_LIBRARY,
  },
}

const TEMPLATES: Partial<Record<SceneType, PresentationTemplate>> = {
  // 开场:扉页气质,纸贴标签 + 书脊饰;底图开放纹理
  'source-reading': {
    baseplate: 'band', label: 'paper-sticker', marker: 'circle-outline', decor: 'left-spine', textblock: 'lede-body',
    pools: { baseplate: ['band', 'wash', 'grid', 'dots'], label: ['paper-sticker', 'underline-tag'], marker: ['circle-outline', 'circle-solid'], textblock: ['lede-body', 'numbered', 'stack'], decor: ['left-spine', 'top-rule', 'clean'] },
  },
  // 观察:图为主,标签在图上——只开放不抢图的形态;底图只开素面/暗角(信箱边缘可见处不与图斗)
  'visual-observation': {
    baseplate: 'wash', label: 'capsule-dark', marker: 'circle-outline', decor: 'clean', textblock: 'stack',
    pools: { baseplate: ['wash', 'vignette'], label: ['capsule-dark', 'ribbon'], marker: MARKER_LIBRARY },
  },
  contrast: {
    baseplate: 'wash', label: 'capsule-dark', marker: 'circle-solid', decor: 'top-rule', textblock: 'stack',
    pools: { baseplate: ['wash', 'vignette'], label: ['capsule-dark', 'ribbon'], marker: ['circle-solid', 'square-ink'], decor: ['top-rule', 'clean'] },
  },
  'concept-build': {
    baseplate: 'grid', label: 'underline-tag', marker: 'circle-outline', decor: 'left-spine', textblock: 'lede-body',
    pools: { baseplate: ['grid', 'wash', 'dots', 'diagonal'], label: ['underline-tag', 'paper-sticker'], marker: ['circle-outline', 'ghost'], decor: ['left-spine', 'top-rule', 'lift'], textblock: ['lede-body', 'stack'] },
  },
  'worked-example': {
    baseplate: 'grid', label: 'underline-tag', marker: 'circle-solid', decor: 'left-spine', textblock: 'numbered',
    pools: { baseplate: ['grid', 'wash', 'dots'], marker: ['circle-solid', 'square-ink'], decor: ['left-spine', 'top-rule'] },
  },
  practice: {
    baseplate: 'dots', label: 'paper-sticker', marker: 'ghost', decor: 'lift', textblock: 'stack',
    pools: { baseplate: ['dots', 'wash', 'diagonal'], label: ['paper-sticker', 'underline-tag'], marker: ['ghost', 'circle-outline'], decor: ['lift', 'left-spine'], textblock: ['stack', 'lede-body'] },
  },
  recap: {
    baseplate: 'vignette', label: 'capsule-dark', marker: 'circle-outline', decor: 'clean', textblock: 'numbered',
    pools: { baseplate: ['vignette', 'wash', 'band'], label: ['capsule-dark', 'ribbon'], marker: MARKER_LIBRARY, decor: ['clean', 'top-rule'] },
  },
}

function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

function pick<T>(pool: readonly T[] | undefined, fallback: T, key: string): T {
  if (!pool || pool.length === 0) return fallback
  return pool[hashOf(key) % pool.length]!
}

/**
 * 课程级配色:风格包(如命中)或"学科×mood"配色库,只依赖 course,不依赖具体 scene——
 * 同一课程所有幕调色板一致(mood 按 course.id 哈希,不按 scene)。chrome(控制条/对白框等
 * 不随幕变化的浮层)、以及不持有具体 scene 的调用方(如课程列表页的返回链接)都从此拿色,
 * 避免为了取个 palette 硬造一个假 scene。
 */
export function coursePaletteFor(course: Pick<MainlineCourse, 'id' | 'subject' | 'gradeBand' | 'stylePackId'>): Palette {
  const pack = stylePackFor(course)
  const mood: PaletteMood = PALETTE_MOODS[hashOf(`${course.id}::mood`) % PALETTE_MOODS.length]!
  return pack.palette ?? paletteOf(course.subject, mood)
}

/**
 * 课内色彩节奏 · 幕级明暗分层(2026-07-21)
 *
 * 背景:此前 coursePaletteFor 全课唯一,18 幕锁同一 palette,课级身份没问题但
 * 幕与幕之间零区分(总览图一眼"18 张同色纸")。这里在**同一份课级 palette**之上
 * 按幕的教学弧线位置派生明度档,色相/字体/表面/质感四轴(身份锚)保持不变——
 * 只有"灯光"(backdrop + accent 的 L)按剧场逻辑呼吸。
 */
export type MoodArcTier = 'basis' | 'dim' | 'deep' | 'lift'
export const MOOD_ARC_TIERS: readonly MoodArcTier[] = ['basis', 'dim', 'deep', 'lift']

/**
 * ΔL 幅度,以"浅底包"为参照系书写(dim/deep 沉、lift 提);深底包在 applyMoodArc
 * 里对同一档整体翻转符号——浅底包基准态已贴着明界(backdrop 顶到 0.96+),往下压
 * 才是"沉入戏剧张力";深底包基准态已贴着暗界(backdrop 底到 0.27-0.44),再往下压
 * 只会糊成一片纯黑、三档失去区分,所以深底包用"往亮处走、accent 更炸"表达同一份
 * 张力——两者都是"离开该包的舒适基准态",只是舒适态在明暗轴的哪一端不同。
 */
// 2026-07-22 第二次收紧:用户裁定整页明度必须停留在渐变亮端水平——dim/deep 的
// 下沉幅度从 −0.06/−0.12 压缩到 −0.02/−0.04(真检实感:−0.12 的辨析幕被判"发闷"),
// 张力主要靠 shiftAccentL 的 accent 对比呼吸表达,backdrop 只留可感知的最小暗示。
const MOOD_ARC_DELTA_L: Record<MoodArcTier, number> = {
  basis: 0,
  dim: -0.02,
  deep: -0.04,
  lift: 0.03,
}

/**
 * 幕型 → 教学弧线档位:开场/观察(还未进课,维持包的基准态)→ 概念/例题(沉半档,
 * 进入正课)→ 对比/找茬/AI 素养三型(全部落"辨析张力"类,最深,呼应 skeleton-library.ts
 * VISUAL_FORM_BY_SCENE_TYPE 把 ai-verify/ai-inquiry 与 contrast 同归 'comparison' 的既有
 * 分类)→ 练习/AI 协作(从最深处回升半档,同 VISUAL_FORM_BY_SCENE_TYPE 把 ai-collab
 * 与 practice 同归 'practice-check')→ 收束(提亮,呼应"灯光暗下来课开演、下课灯亮")。
 */
const SCENE_MOOD_ARC: Record<SceneType, MoodArcTier> = {
  'source-reading': 'basis',
  'visual-observation': 'basis',
  'concept-build': 'dim',
  'worked-example': 'dim',
  contrast: 'deep',
  'ai-verify': 'deep',
  'ai-inquiry': 'deep',
  practice: 'dim',
  'ai-collab': 'dim',
  recap: 'lift',
}

/** 按幕型确定性映射弧线档位——纯函数,同幕永远同档,不参与 course.id 哈希。 */
export function sceneMoodFor(scene: Pick<LessonScene, 'sceneType'>): MoodArcTier {
  return SCENE_MOOD_ARC[scene.sceneType] ?? 'basis'
}

function isDarkPalette(p: Pick<Palette, 'ink' | 'paper'>): boolean {
  return hexToOklch(p.paper).l < hexToOklch(p.ink).l
}

/** 给一组需要保持相对顺序的 L 值算一个"共享安全 ΔL"——按最紧的那个的余量clamp,
 * 保证整组同步平移后仍严格单调(不会因为个别值先撞顶/撞底导致顺序反转)。 */
function safeUniformDelta(ls: readonly number[], delta: number): number {
  if (delta === 0) return 0
  if (delta > 0) return Math.min(delta, Math.min(...ls.map(l => 1 - l)))
  return Math.max(delta, -Math.min(...ls.map(l => l)))
}

/**
 * accent 对比锁档:不套一个全局绝对 L 阈值(pack-families.ts 派生引擎自设的
 * "浅底≤0.55/深底≥0.75"只是它自己生成空间的产物,精修/引进库的手写 accent 未必
 * 落在这个窗口——套用会误伤"起点就不一样"的包)。真正要守的不变量是"这一档的
 * accent 相对 paper 的对比距离不能比 basis 差":dim/deep/lift 的 ΔL 方向如果让
 * 距离变大(离 paper 更远),照常应用;如果会变小(离 paper 更近,对比变差),
 * 直接把这一档的位移归零,退回 basis 的 accent——只在"变好"的方向上呼吸。
 */
function shiftAccentL(baseAccentL: number, paperL: number, delta: number): number {
  // 钳在 [0.04, 0.96] 而非 [0, 1]:真正的 0/1 是纯黑/纯白,在那两点彩度被迫归零
  // (gamut 在 L=0/1 只有一个点),accent 会整个褪成灰白,丢光色相家族——留这圈
  // 余量保证 withLInGamut 之后手里还有能辨认的彩度。
  const candidate = Math.max(0.04, Math.min(0.96, baseAccentL + delta))
  const baseMargin = Math.abs(baseAccentL - paperL)
  const candidateMargin = Math.abs(candidate - paperL)
  return candidateMargin >= baseMargin ? candidate : baseAccentL
}

/**
 * 幕级明暗分层:ink/paper(正文字/卡片纸面)课内恒定——它们是"身份锚"的一部分,
 * chrome(控制条/对白框)与卡片本体不该跟着幕跳变;只有 backdrop(舞台底色三档)
 * 与 accent/accentSoft 按 tier 呼吸。backdrop/accent 都用 withLInGamut(而非 withL)
 * 派生——ΔL 幅度会把某些高彩度色推到 sRGB gamut 边界外,withL 的逐通道硬钳位在
 * 那里会拖偏色相(实测偏移可达 20°+),withLInGamut 改成收缩彩度落回 gamut,
 * 色相严格不变(见 color.ts 注释)。
 */
export function applyMoodArc(base: Palette, tier: MoodArcTier): Palette {
  if (tier === 'basis') return base
  const dark = isDarkPalette(base)
  // lift(收束幕)不参与深底翻转:「下课灯亮」对深浅底都是字面义的变亮——深底包
  // 若跟随 dim/deep 的翻转逻辑会把 recap 压成全课最暗(实测 L≈0.011 近纯黑,
  // 质感层不可见),与收束=释然的剧场语义相反。张力档(dim/deep)保持翻转不变。
  const delta = tier === 'lift' ? MOOD_ARC_DELTA_L.lift : MOOD_ARC_DELTA_L[tier] * (dark ? -1 : 1)

  const backdropLs = base.backdrop.map(hex => hexToOklch(hex).l)
  const backdropDelta = safeUniformDelta(backdropLs, delta)
  const backdrop = base.backdrop.map((hex, i) => withLInGamut(hex, backdropLs[i]! + backdropDelta)) as [string, string, string]

  const paperL = hexToOklch(base.paper).l
  const accentL = shiftAccentL(hexToOklch(base.accent).l, paperL, delta)
  const accentSoftL = shiftAccentL(hexToOklch(base.accentSoft).l, paperL, delta)
  const accent = withLInGamut(base.accent, accentL)
  const accentSoft = withLInGamut(base.accentSoft, accentSoftL)

  return { ...base, backdrop, accent, accentSoft }
}

export function presentationFor(scene: LessonScene, course: Pick<MainlineCourse, 'id' | 'subject' | 'gradeBand' | 'lessonPhase' | 'stylePackId'>): ScenePresentation {
  const template = TEMPLATES[scene.sceneType] ?? DEFAULT_TEMPLATE
  const seed = `${course.id}::${scene.id}`
  // Signature 风格包:命中则调色板与四轴签名值锁定(风格=一致的手笔);
  // classic 走学科配色库,mood 课级一致(同一门课不换脸)
  const pack = stylePackFor(course)
  const palette = applyMoodArc(coursePaletteFor(course), sceneMoodFor(scene))
  return {
    // 四轴组合接 K12 路由(2026-07-22):有图幕的图/文形态按学段学科时期气质加权
    composition: compositionFor(scene, course.id, course),
    pack,
    palette,
    baseplate: pack.baseplate ?? pick(template.pools?.baseplate, template.baseplate, `${seed}::baseplate`),
    label: pack.labelStyle ?? pick(template.pools?.label, template.label, `${seed}::label`),
    marker: pack.markerStyle ?? pick(template.pools?.marker, template.marker, `${seed}::marker`),
    decor: pack.decorStyle ?? pick(template.pools?.decor, template.decor, `${seed}::decor`),
    textblock: pick(template.pools?.textblock, template.textblock, `${seed}::textblock`),
  }
}

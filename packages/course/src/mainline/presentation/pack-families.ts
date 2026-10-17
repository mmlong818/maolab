import type { GradeBand, SubjectId } from '../domain.js'
import { hexToOklch, oklchToHexInGamut } from './color.js'
import type { BaseplateId, DecorStyleId, LabelStyleId, MarkerStyleId, Palette, SurfaceId, TextureSpec } from './primitives.js'
import type { FontRole, ReadableFontRole } from './tokens.js'
import type { StylePack } from './style-packs.js'
import { ACTIVE_COLOR_ANCHORS, type ColorAnchor } from './anchors.js'

/**
 * 生成式风格包家族 · 三轴色彩系统 明度键(mood) × 地色底韵(tint) × accent 色相锚(anchor) → OKLCH 确定性派生
 *
 * 背景:6 个手写 signature 包按学科×学段粗选,25666 个 KP 分摊下来同学科同学段
 * 永远撞同一张皮。这里不再手写调色板——锚贡献 accent 色相角(h),地色 tint 贡献
 * paper/backdrop 底韵色相,明度(L)/彩度(C)由 mood 安全区间 + 锚原生 (L,C) 派生,
 * 质感签名复用 primitives.ts 既有四轴(不再新增底图/标签/标记/装饰形态)。
 *
 * 组合空间 = 锚 × mood(6) × 地色 tint(8) × 质感签名(textures.length),见 packInstanceCount()。
 * 明亮令(2026-07-22):锚池换血为明亮现代锚(ACTIVE_COLOR_ANCHORS),mood 全档浅底。
 * 选锚/mood/tint/质感四步各自按 course.id 加盐哈希,保证同课永远同款、不同课自然错开。
 * 硬指标背景与三轴决策见 docs/design-refresh/hard-targets-spec.md 指标 1 决策备忘。
 */

/**
 * 明度键(mood) · 明亮令 6 档「光影姿态」(2026-07-22 重建,brightness-mandate.md WP-A)。
 *
 * 旧 7 档里的 4 个整页深底档(dusk/night/mid/abyss)是「上个世纪暗沉感」的最大来源,
 * 已废止——明亮令硬规则:全档浅底深字,禁止整页深底。多样性不再靠"整页变黑",
 * 而靠**明亮带内部的光影姿态**分档:每档有自己的光源逻辑(正午顶光/晨雾漫射/
 * 画廊侧光/金时暖光/糖霜彩纸/调纸中间态),paper 明度 × 地色彩度 × backdrop 梯度
 * (光衰减方向)三者一起变,不是单轴调亮度。
 * - noon    正午高光:近白高调,梯度最小,清脆利落;
 * - morning 晨雾柔光:暖白高调,漫射柔和;
 * - pastel  糖霜彩纸:高明度但地色彩度显著(彩纸感,色彩碰撞的地基);
 * - gallery 画廊侧光:paper 中高调,backdrop 梯度最大(定向光衰减,空间立体感);
 * - golden  金时暖光:暖调中高,地色彩度偏高(黄昏光温,不是黄昏暗度);
 * - toned   调纸中间态:全带最深档,仍严格浅底深字(闸门 PAPER_L_FLOOR 之上)。
 */
export type PackMood = 'noon' | 'morning' | 'pastel' | 'gallery' | 'golden' | 'toned'
export const PACK_MOODS: readonly PackMood[] = ['noon', 'morning', 'pastel', 'gallery', 'golden', 'toned']

/**
 * 地色底韵 tint 家族 · 6 色相环(60° 均分,2026-07-21 tier-deep 新增)。
 *
 * 与"锚只贡献 accent 色相"正交的第二条色相轴:tint 只染**地色**(paper + backdrop)的
 * hue,accent 色相仍走锚。低彩度(受 paperCBand + 彩度下限约束),纸色底韵冷暖是人眼
 * 分辨配色方式的真实维度(paletteDistance 已补 paper 色相轴,彩度门折算)。选 tint 按
 * course.id 加盐哈希,与选锚/mood/质感各自独立。
 */
export interface PaperTint {
  id: string
  name: string
  /** 地色(paper + backdrop)的 OKLCH 色相角(accent 色相另走锚,不受此影响) */
  hue: number
  /** 地色彩度整体微缩放(各 tint 略调,仍夹在 paperCBand 与彩度下限之间) */
  chromaScale: number
}
export const PAPER_TINTS: readonly PaperTint[] = [
  // 粉紫禁令(2026-07-22 用户裁定,地理课玫瑰紫地实证):晨粉/丁香/玫瑰三个
  // 粉紫地色 tint 退出,8 色相在「蜜桃→雾蓝」课堂色带内近均分(~32°)——
  // 地色底韵只许暖米/黄绿/青蓝系,粉紫带 [280°,18°) 由 brightness-gates
  // 的 ground-hue 闸门永久封禁。
  { id: 'peach',      name: '蜜桃', hue: 45,  chromaScale: 1.1 },
  { id: 'cream',      name: '奶油', hue: 80,  chromaScale: 0.95 },
  { id: 'lemon',      name: '柠檬', hue: 112, chromaScale: 1.0 },
  { id: 'mint',       name: '薄荷', hue: 145, chromaScale: 1.0 },
  { id: 'celadon',    name: '青瓷', hue: 178, chromaScale: 1.0 },
  { id: 'aqua',       name: '水色', hue: 210, chromaScale: 1.05 },
  { id: 'sky',        name: '晴空', hue: 240, chromaScale: 1.05 },
  // 雾蓝 260(不是 268):地色向锚混 10% 色相,红端锚(西柚 h≈20)会把它拉高 ~12°,
  // 低彩度 8bit 量化再抖 ±4°——268 起步会蹭到 280° 粉紫禁带线,260 留足余量。
  { id: 'periwinkle', name: '雾蓝', hue: 260, chromaScale: 1.0 },
] as const

interface MoodSpec {
  inkL: number; inkC: number; inkHue: number
  accentC: number
  /** accent.l 安全区间(浅底 ≤0.55/深底 ≥0.75 对比锁档内,留 mood-arc deep 档 ±0.12 余量);锚原生明度定区间内位置。 */
  accentLBand: [number, number]
  /** paper.l 安全区间(浅底上限 ≤0.93:蓝相地色近白撑不住彩度下限;深底不越 ink.l);锚原生彩度定位置。 */
  paperLBand: [number, number]
  paperCBand: [number, number]
  /** backdrop 顶档 L 区间(三档整体平移,ΔStep 不变,单调天然保持);锚原生明度定位置。 */
  backTopLBand: [number, number]
  backStep: number; backC: number; backCStep: number
  /** accentSoft 相对 accent 的 ΔL——mood 常量(不随锚浮动),守"同 mood 内 ΔL 恒定"不变量。 */
  accentSoftDeltaL: number
  accentSoftC: number
}

/**
 * 明度键规格 · 明亮令 6 档区间数值(2026-07-22 第二次收紧:用户裁定「渐变只有亮端
 * 的明度可接受」——整页一切区域(纸面 + backdrop 全部三档 + 幕级明暗弧线)都必须
 * 停留在亮端水平,明度不再是 mood 之间的主区分轴,多样性全部交给色相/彩度/暖冷/
 * 光向梯度承担)。全档浅底深字:
 * - paperLBand 下限 0.82(toned)——闸门 PAPER_L_FLOOR(0.80)之上留量化余量;
 * - backdrop 底档 = backTop − 2×backStep,全档 ≥ 0.80(闸门 BACKDROP_L_FLOOR 0.78 之上);
 * - inkL ≤ 0.25,与 paper 的 ΔL 全档 ≥ 0.57(远超闸门 INK_PAPER_DELTA_MIN 0.38);
 * - accentLBand 全档 ≤ 0.545(0.55 对比锁档内留 8bit 量化余量);
 * - gallery 的 backStep(0.045)仍是全档最大——侧光衰减签名保留,但衰减后仍在亮端;
 * - noon 纸明度上限 0.945:更白的纸在保色相下装不下彩度下限(蓝紫相 gamut 物理限制);
 * - pastel/golden 的 paperCBand 上限 0.10-0.125,彩纸地色靠 oklchToHexInGamut
 *   收缩彩度落回 gamut,色相不偏——高明度下彩度被 gamut 自然压低,「彩」靠暖冷
 *   底韵与 accent 碰撞表达。
 */
/**
 * 白为主改造(2026-07-22 第三次收紧,用户拍板「更多以白色为主色的搭配」):
 * 全档纸面收进近白带 L 0.935-0.965、底韵彩度 0.008-0.046(微底韵,不是纯 #fff——
 * 保留 2-4% 彩度的冷暖身份,白是"白族"不是"一个白")。白是主色,accent 物件层
 * (色块/标签/光晕/网格)是副色——mood 之间的区分只剩:底韵浓度 × 暖冷 × 光向
 * 梯度 × 物件密度。「防惨白」彩度下限随白为主废止(纸就该近白)。
 */
/**
 * 白为主第四次收紧(2026-07-23,用户「都不是白的」):第三次的 2-4% 底韵在整屏
 * backdrop 上仍读成一整片薄荷/青/蓝色,不是白。地色(paper + backdrop 全三档)彩度
 * 压到近零(≤0.014,多数 0.006-0.010),明度提到 0.955-0.975——底真正读成白;
 * 冷暖身份只剩close inspection 才觉察的一丝 hue。**颜色全部让给 accent 物件层**
 * (色块/标签/光晕/网格/"01"巨字),accentC 0.15-0.17 不动。mood 之间几乎同为白,
 * 区分交给光向梯度(backStep)、accent、质感、母版、字体。
 */
const MOOD_SPECS: Record<PackMood, MoodSpec> = {
  noon:    { inkL: 0.22, inkC: 0.02,  inkHue: 70,  accentC: 0.165, accentLBand: [0.34, 0.545], paperLBand: [0.965, 0.975], paperCBand: [0.003, 0.007], backTopLBand: [0.965, 0.975], backStep: 0.008, backC: 0.005, backCStep: 0.001, accentSoftDeltaL: 0.40, accentSoftC: 0.045 },
  morning: { inkL: 0.25, inkC: 0.025, inkHue: 60,  accentC: 0.155, accentLBand: [0.33, 0.53],  paperLBand: [0.96, 0.972],  paperCBand: [0.005, 0.010], backTopLBand: [0.96, 0.972],  backStep: 0.010, backC: 0.008, backCStep: 0.0015, accentSoftDeltaL: 0.42, accentSoftC: 0.050 },
  pastel:  { inkL: 0.24, inkC: 0.03,  inkHue: 80,  accentC: 0.160, accentLBand: [0.38, 0.545], paperLBand: [0.955, 0.97],  paperCBand: [0.008, 0.014], backTopLBand: [0.955, 0.97],  backStep: 0.010, backC: 0.012, backCStep: 0.002, accentSoftDeltaL: 0.38, accentSoftC: 0.060 },
  // gallery 侧光白:梯度全档最大(0.020,仍在 0.94+ 内),光向是签名——但底色彩度同样近零。
  gallery: { inkL: 0.21, inkC: 0.02,  inkHue: 250, accentC: 0.160, accentLBand: [0.30, 0.50],  paperLBand: [0.96, 0.972],  paperCBand: [0.004, 0.008], backTopLBand: [0.965, 0.975], backStep: 0.020, backC: 0.006, backCStep: 0.0015, accentSoftDeltaL: 0.44, accentSoftC: 0.040 },
  golden:  { inkL: 0.24, inkC: 0.03,  inkHue: 55,  accentC: 0.170, accentLBand: [0.32, 0.52],  paperLBand: [0.958, 0.97],  paperCBand: [0.006, 0.012], backTopLBand: [0.958, 0.97],  backStep: 0.012, backC: 0.010, backCStep: 0.002, accentSoftDeltaL: 0.42, accentSoftC: 0.055 },
  // toned = 底韵白:白族里底韵仍最浓的一档,但也仅到 0.014——冷暖看 tint,整体读白。
  toned:   { inkL: 0.17, inkC: 0.02,  inkHue: 66,  accentC: 0.150, accentLBand: [0.24, 0.42],  paperLBand: [0.955, 0.968], paperCBand: [0.008, 0.014], backTopLBand: [0.955, 0.968], backStep: 0.010, backC: 0.012, backCStep: 0.002, accentSoftDeltaL: 0.46, accentSoftC: 0.040 },
}

/** 地色彩度下限——白为主改造(2026-07-22)后「防惨白」废止(纸就该近白),
 * 只留极小值保派生数学稳定;微底韵的存在感由 MOOD_SPECS 各档彩度带负责。 */
const LIGHT_CHROMA_FLOOR = 0.006

function blendHue(base: number, target: number, t: number): number {
  const delta = ((target - base + 540) % 360) - 180
  return ((base + delta * t) % 360 + 360) % 360
}

/**
 * 三轴色彩系统分解 · 明度键(mood) × 地色底韵(tint) × accent 色相(anchor) · 2026-07-21 tier-deep
 *
 * 背景:前序把 accent 明度/paper 明度/彩度/backdrop 明度四轴从"mood 内常量"改成
 * "按锚原生 (L,C) 派生区间",certified 从 9 升到 17-18 后触顶——同 mood 内那四轴都是
 * 锚原生 (L,C) 两个标量挤进窄区间的派生量,真正跨锚大变量只有 accent 色相,可分维度
 * 约 1.3。本次:(b) mood 3→7 档扩大 paper 明度分离(见 PACK_MOODS);(d) 引入独立于锚的
 * 地色 tint 轴(见 PAPER_TINTS),把同 mood 内 packing 从 1D 升到 2D,certified→56。
 *
 * 锚的原生明度/彩度仍各自线性映射进 MOOD_SPECS 的安全区间,定 accent.l / paper.l /
 * paper.c / backdrop.l 在区间内的位置;accentSoft 与 accent 的 ΔL 是 mood 常量
 * (不随锚浮动),保持"同 mood 内 ΔL 恒定"不变量精确成立(方差恒为 0)。
 */
const ANCHOR_NATIVE_L: readonly number[] = ACTIVE_COLOR_ANCHORS.map(a => hexToOklch(a.hex).l)
const ANCHOR_L_MIN = Math.min(...ANCHOR_NATIVE_L)
const ANCHOR_L_MAX = Math.max(...ANCHOR_NATIVE_L)
const ANCHOR_NATIVE_C: readonly number[] = ACTIVE_COLOR_ANCHORS.map(a => hexToOklch(a.hex).c)
const ANCHOR_C_MIN = Math.min(...ANCHOR_NATIVE_C)
const ANCHOR_C_MAX = Math.max(...ANCHOR_NATIVE_C)

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

/** 锚的原生明度在全锚池里的归一化位置(0-1),锚池全同明度时退化为 0.5。 */
function normalizedNativeL(anchor: ColorAnchor): number {
  if (ANCHOR_L_MAX <= ANCHOR_L_MIN) return 0.5
  return (hexToOklch(anchor.hex).l - ANCHOR_L_MIN) / (ANCHOR_L_MAX - ANCHOR_L_MIN)
}

/** 锚的原生彩度在全锚池里的归一化位置(0-1)。 */
function normalizedNativeC(anchor: ColorAnchor): number {
  if (ANCHOR_C_MAX <= ANCHOR_C_MIN) return 0.5
  return (hexToOklch(anchor.hex).c - ANCHOR_C_MIN) / (ANCHOR_C_MAX - ANCHOR_C_MIN)
}

/**
 * 按锚 × mood × tint 派生一套配色(与手写 signature 包同构的 Palette)。
 * accent 色相=锚;地色(paper + backdrop)色相=tint 底韵(向锚略靠 10% 求和谐);
 * 明度/彩度各轴由 mood 安全区间 + 锚原生 (L,C) 定位。
 */
export function derivePalette(anchor: ColorAnchor, mood: PackMood, tint: PaperTint): Palette {
  const spec = MOOD_SPECS[mood]
  const anchorHue = hexToOklch(anchor.hex).h
  const groundHue = blendHue(tint.hue, anchorHue, 0.10)
  const inkHue = blendHue(spec.inkHue, anchorHue, 0.10)

  // 全部经 oklchToHexInGamut:明亮令的高明度+较高彩度地色(pastel/golden 档)在
  // 蓝紫相越 sRGB gamut,逐通道硬钳位会拖偏色相——统一走彩度收缩,色相不动。
  const ink = oklchToHexInGamut({ l: spec.inkL, c: spec.inkC, h: inkHue })
  // paperL 吃锚原生 L、paperC 吃锚原生 C——两轴用不同的锚原生量,同 mood×tint 内
  // paperL/paperC 解耦成真 2D(此前都吃 native C,完全相关,白白折损认证距离)。
  const paperC = Math.max(lerp(spec.paperCBand[0], spec.paperCBand[1], normalizedNativeC(anchor)) * tint.chromaScale, LIGHT_CHROMA_FLOOR)
  const paperL = lerp(spec.paperLBand[0], spec.paperLBand[1], normalizedNativeL(anchor))
  const paper = oklchToHexInGamut({ l: paperL, c: paperC, h: groundHue })
  const backdropTopL = lerp(spec.backTopLBand[0], spec.backTopLBand[1], normalizedNativeL(anchor))
  const backdrop = [0, 1, 2].map(i => oklchToHexInGamut({
    l: backdropTopL - i * spec.backStep,
    c: Math.max(spec.backC - i * spec.backCStep, LIGHT_CHROMA_FLOOR),
    h: groundHue,
  })) as [string, string, string]

  // 对比锁档:全档浅底,accent.l≤0.55——与 chrome.ts 的 isDarkPack(paper.l < ink.l)
  // 判定同一套不变量,mood 定安全区间、锚原生明度定区间内位置。
  // 蓝系提亮补偿(2026-07-23):蓝(h∈[225,300))同明度下感知更沉,深 accent 档
  // (toned/gallery)会把蓝锚压成压抑的深海军蓝。仅蓝相抬明度下限、收彩度上限——
  // 亮而不失白底对比(仍在锁档 ≤0.55 内),暖色不动。
  const isBlueAccent = anchorHue >= 225 && anchorHue < 300
  const accentL = Math.max(
    lerp(spec.accentLBand[0], spec.accentLBand[1], normalizedNativeL(anchor)),
    isBlueAccent ? 0.47 : 0,
  )
  const accentC = isBlueAccent ? Math.min(spec.accentC, 0.15) : spec.accentC
  const accent = oklchToHexInGamut({ l: accentL, c: accentC, h: anchorHue })
  // accentSoft 与 accent 的 ΔL 固定为该 mood 常量(不随锚浮动),守"同 mood 内 ΔL 恒定"不变量。
  const accentSoft = oklchToHexInGamut({ l: accentL + spec.accentSoftDeltaL, c: spec.accentSoftC, h: anchorHue })

  return {
    id: `pack-${anchor.id}-${mood}-${tint.id}`,
    accent, accentSoft, ink, paper, backdrop,
  }
}

/* ── 质感签名:复用 primitives 四轴,6-8 套固定组合(签名=不轮换) ── */

export interface TextureSignature {
  id: string
  label: string
  baseplate: BaseplateId
  labelStyle: LabelStyleId
  markerStyle: MarkerStyleId
  decorStyle: DecorStyleId
  /** 适配的锚温度;避免"暖锚配冷感质感"这类违和组合 */
  temperatures: readonly ColorAnchor['temperature'][]
  /** 身份三轴(2026-07-21):每个质感签名各定一组固定三轴,不随锚/mood 轮换——
   * 生成档 1008 实例(42 锚 × 3 mood × 8 签名)靠这组固定值获得字体/表面/质感身份,
   * 而不是只有调色板在变(否则蒙掉颜色仍是同一套字体/形状,等于没做身份)。
   * 8 组刻意各不相同(字体×表面×质感三元组互不重复),最大化跨签名可辨度。
   * 2026-07-21 十族扩容:display 六组换用新引入的美术/书法字体(each ×42 锚×3 mood
   * =126 生成实例,远超"每族 ≥5 包引用"门槛);body 类型收紧到 ReadableFontRole。 */
  typography: { display: FontRole; body: ReadableFontRole }
  surface: SurfaceId
  texture: TextureSpec
}

/**
 * 明亮令(2026-07-22)8 组重组:古纸/水墨/暗幕气质退出默认池(mashan/liujian 书法显示
 * 字体随之退出生成档,仍在精修/引进档注册),新增 glow(定向光晕)/mesh(渐变网格)两种
 * 现代光影素材(见 primitives.ts TextureKind 与 StageCanvas StageTextureLayer)。
 * 8 组的 typography×surface×texture 三元组仍互不重复,黑白稿可辨。
 */
export const TEXTURE_SIGNATURES: readonly TextureSignature[] = [
  { id: 'glass-gallery', label: '玻璃光廊感', baseplate: 'wash', labelStyle: 'capsule-dark', markerStyle: 'ghost', decorStyle: 'clean', temperatures: ['cool', 'neutral'],
    typography: { display: 'xiaowei', body: 'song' }, surface: 'glass', texture: { kind: 'glow', intensity: 0.5 } },
  { id: 'mesh-aurora', label: '渐变云雾感', baseplate: 'wash', labelStyle: 'ribbon', markerStyle: 'circle-solid', decorStyle: 'lift', temperatures: ['cool', 'neutral'],
    typography: { display: 'longcang', body: 'kai' }, surface: 'rounded-soft', texture: { kind: 'mesh', intensity: 0.6 } },
  { id: 'white-blueprint', label: '白晒图纸感', baseplate: 'grid', labelStyle: 'underline-tag', markerStyle: 'ghost', decorStyle: 'top-rule', temperatures: ['cool'],
    typography: { display: 'hei', body: 'hei' }, surface: 'sharp-editorial', texture: { kind: 'grid', intensity: 0.35 } },
  { id: 'daylight-editorial', label: '日光杂志感', baseplate: 'band', labelStyle: 'underline-tag', markerStyle: 'circle-outline', decorStyle: 'top-rule', temperatures: ['warm', 'cool', 'neutral'],
    typography: { display: 'song', body: 'song' }, surface: 'sharp-editorial', texture: { kind: 'none', intensity: 0 } },
  { id: 'candy-pop', label: '糖果立体感', baseplate: 'dots', labelStyle: 'paper-sticker', markerStyle: 'circle-solid', decorStyle: 'lift', temperatures: ['warm'],
    typography: { display: 'kuaile', body: 'kai' }, surface: 'paper-sticker', texture: { kind: 'dots', intensity: 0.4 } },
  { id: 'neon-riso', label: '荧彩斜切感', baseplate: 'diagonal', labelStyle: 'ribbon', markerStyle: 'square-ink', decorStyle: 'lift', temperatures: ['warm', 'neutral'],
    typography: { display: 'huangyou', body: 'kai' }, surface: 'rounded-soft', texture: { kind: 'grain', intensity: 0.35 } },
  { id: 'annotated-lab', label: '批注手帐感', baseplate: 'grid', labelStyle: 'paper-sticker', markerStyle: 'square-ink', decorStyle: 'left-spine', temperatures: ['cool', 'neutral'],
    typography: { display: 'zhimang', body: 'song' }, surface: 'sharp-editorial', texture: { kind: 'paper', intensity: 0.22 } },
  // 国潮新写:亮底毛笔大标(mashan)+ 玻璃面 + 渐变色场——书法体在明亮带的当代活法
  // (新中式潮流),不是水墨复古;也让 mashan 族维持「≥5 包引用」硬指标(font-roster)。
  { id: 'guochao-mist', label: '国潮雾彩感', baseplate: 'dots', labelStyle: 'capsule-dark', markerStyle: 'circle-outline', decorStyle: 'clean', temperatures: ['neutral', 'warm'],
    typography: { display: 'mashan', body: 'hei' }, surface: 'glass', texture: { kind: 'mesh', intensity: 0.4 } },
] as const

/* ── 学科亲和 + 学段过滤:小学暖高明度、高中低彩度、初中不额外限制 ── */

const LOW_CHROMA_THRESHOLD = 0.09
const PRIMARY_BANDS: readonly GradeBand[] = ['lower-primary', 'upper-primary']

function anchorMatchesSubject(anchor: ColorAnchor, subject: SubjectId): boolean {
  return anchor.subjects.length === 0 || anchor.subjects.includes(subject)
}

/** 供高中"低彩度锚"过滤用:锚原始色的 OKLCH 彩度(锚池策展已排除彩度过低/过艳的极端值)。 */
function nativeChroma(anchor: ColorAnchor): number {
  return hexToOklch(anchor.hex).c
}

export function anchorPoolFor(subject: SubjectId, gradeBand: GradeBand): readonly ColorAnchor[] {
  let pool = ACTIVE_COLOR_ANCHORS.filter(a => anchorMatchesSubject(a, subject))
  if (PRIMARY_BANDS.includes(gradeBand)) {
    pool = pool.filter(a => a.temperature === 'warm')
  } else if (gradeBand === 'high-school') {
    pool = pool.filter(a => nativeChroma(a) <= LOW_CHROMA_THRESHOLD)
  }
  return pool.length > 0 ? pool : ACTIVE_COLOR_ANCHORS.filter(a => anchorMatchesSubject(a, subject))
}

/** 小学段 mood 限最高调三档(正午/晨雾/糖霜,低龄课地色最亮最甜);其余学段六档全开。
 * 导出供 pack-catalog(模板替换选皮目录)复用同一学段约束。 */
const PRIMARY_MOODS: readonly PackMood[] = ['noon', 'morning', 'pastel']
export function moodPoolFor(gradeBand: GradeBand): readonly PackMood[] {
  return PRIMARY_BANDS.includes(gradeBand) ? PRIMARY_MOODS : PACK_MOODS
}

function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/* ── imageDNA:锚色名 + 质感描述的英文 prompt 片段(模板生成,非手写) ── */

const HUE_FAMILY_BINS: readonly [max: number, label: string][] = [
  [15, 'crimson red'], [45, 'vermilion orange-red'], [70, 'amber gold'], [100, 'citrine yellow'],
  [140, 'moss yellow-green'], [170, 'jade green'], [200, 'teal cyan'], [230, 'azure blue'],
  [260, 'indigo blue'], [290, 'violet purple'], [320, 'orchid purple'], [345, 'plum mauve'], [361, 'crimson red'],
]

function hueFamily(h: number): string {
  return HUE_FAMILY_BINS.find(([max]) => h < max)?.[1] ?? 'muted neutral'
}

const MOOD_DNA: Record<PackMood, string> = {
  noon: 'crisp noon-lit white ground, luminous high-key clarity, clean directional shadows',
  morning: 'soft morning haze, warm luminous high-key ground, diffused gentle light',
  pastel: 'frosted pastel-paper ground, playful high-key colour fields, candy-bright light',
  gallery: 'bright gallery sidelight, directional light falloff across a pale ground, layered spatial depth',
  golden: 'golden-hour warm glow on a bright ground, saturated warm light, long soft highlights',
  toned: 'toned bright paper, muted mid-high-key daylight, quiet studio light',
}

const TINT_DNA: Record<string, string> = {
  peach: 'warm peach undertone',
  cream: 'warm cream undertone',
  lemon: 'fresh lemon undertone',
  mint: 'cool mint undertone',
  celadon: 'cool celadon undertone',
  aqua: 'cool aqua undertone',
  sky: 'cool clear-sky undertone',
  periwinkle: 'cool haze-blue undertone',
}

function buildImageDNA(anchor: ColorAnchor, mood: PackMood, tint: PaperTint, texture: TextureSignature): string {
  const family = hueFamily(hexToOklch(anchor.hex).h)
  return ` Signature style: generative palette with ${anchor.name} (${family}) accent — ${MOOD_DNA[mood]} on a ${TINT_DNA[tint.id] ?? 'neutral'} ground, ${texture.label} composition texture. Distinct curated hue, not a default template palette.`
}

/* ── 派生 + 选择入口 ── */

export interface PackFamilyInstance extends StylePack {
  /** 生成档实例必有派生调色板(收窄 StylePack 的 `Palette | null`,消费方免判空)。 */
  palette: Palette
  anchor: ColorAnchor
  mood: PackMood
  tint: PaperTint
  /** 命名 textureSignature 而非 texture——StylePack.texture 已被身份三轴占用
   * (TextureSpec,舞台背景质感),这里是选中的质感签名整体(四轴+身份三轴来源)。 */
  textureSignature: TextureSignature
}

export function derivePackInstance(anchor: ColorAnchor, mood: PackMood, tint: PaperTint, texture: TextureSignature): PackFamilyInstance {
  return {
    id: `generative:${anchor.id}:${mood}:${tint.id}:${texture.id}`,
    label: `${anchor.name} · ${tint.name} · ${texture.label}`,
    whenToUse: `生成档:锚点「${anchor.name}」(${anchor.intro}) × ${mood} × ${tint.name} × ${texture.label}`,
    palette: derivePalette(anchor, mood, tint),
    baseplate: texture.baseplate,
    labelStyle: texture.labelStyle,
    markerStyle: texture.markerStyle,
    decorStyle: texture.decorStyle,
    imageDNA: buildImageDNA(anchor, mood, tint, texture),
    typography: texture.typography,
    surface: texture.surface,
    texture: texture.texture,
    anchor, mood, tint, textureSignature: texture,
  }
}

/**
 * 生成档主入口:按 course.id 加盐哈希选锚 → 选 mood → 选地色 tint → 选质感,四步分别
 * 加盐避免四轴联动(同一 id 选中的锚不应总是配上同一 mood/tint)。同课永远同款,不同课自然错开。
 */
export function pickGenerativeInstance(course: { id: string; subject: SubjectId; gradeBand: GradeBand }): PackFamilyInstance {
  const anchorPool = anchorPoolFor(course.subject, course.gradeBand)
  const anchor = anchorPool[hashOf(`${course.id}::anchor`) % anchorPool.length]!

  const moodPool = moodPoolFor(course.gradeBand)
  const mood = moodPool[hashOf(`${course.id}::mood`) % moodPool.length]!

  const tint = PAPER_TINTS[hashOf(`${course.id}::tint`) % PAPER_TINTS.length]!

  const texturePool = TEXTURE_SIGNATURES.filter(t => t.temperatures.includes(anchor.temperature))
  const pool = texturePool.length > 0 ? texturePool : TEXTURE_SIGNATURES
  const texture = pool[hashOf(`${course.id}::texture`) % pool.length]!

  return derivePackInstance(anchor, mood, tint, texture)
}

/** 派生空间规模统计,供测试/报告断言用。 */
export function packInstanceCount(): { anchors: number; moods: number; tints: number; textures: number; total: number } {
  return {
    anchors: ACTIVE_COLOR_ANCHORS.length,
    moods: PACK_MOODS.length,
    tints: PAPER_TINTS.length,
    textures: TEXTURE_SIGNATURES.length,
    total: ACTIVE_COLOR_ANCHORS.length * PACK_MOODS.length * PAPER_TINTS.length * TEXTURE_SIGNATURES.length,
  }
}

/**
 * composition · 图/文/立绘/字幕四轴版式基因库
 *
 * 背景(docs/scene-presentation-redesign-2026-07-13.md):配图原生 3:2,舞台 16:9,
 * 信箱式居中后左右各余一条竖带——本库把它显式化为「侧栏」文字卡位;文字浮层
 * 不再固定压在图左上角,立绘侧的内容区自动让位。
 *
 * 四条正交轴 × 合法性规则 → 170+ 种合法组合(测试断言 ≥100)。
 * 每幕的组合由 compositionFor 决定:立绘/字幕轴严格从 scene.dialogueLayout 派生
 * (显式数据,不猜),图/文轴按 sceneType 偏好列表 + scene.id 确定性轮换——
 * 同类型多幕自动错开版式,且同一课程每次渲染稳定不跳。
 */

import { lessonPhaseOf, type LessonScene, type SceneType } from '../domain.js'
import { masterWeightFor, subjectFamilyOf, type MasterDensity, type MasterFormality, type RoutingCourse } from './master-routing.js'

export type ImageForm =
  | 'letterbox-center' // 3:2 图居中,左右天然留出侧栏
  | 'anchor-left'      // 图贴左,右侧一条宽侧栏
  | 'anchor-right'     // 图贴右,左侧一条宽侧栏
  | 'cover-full'       // 满幅裁切铺满 16:9(牺牲图缘,无侧栏)
  | 'band-top'         // 图占上部,底部留横条文字带
  | 'none'

export type TextForm =
  | 'chips-tl'         // 图上左上角胶囊(≤3 条,超出折叠)
  | 'chips-tr'         // 图上右上角胶囊
  | 'rail-cards'       // 侧栏文字卡(自动选立绘对侧)
  | 'strip-bottom'     // 底部横排卡
  | 'stepper-bottom'   // 底部路径 stepper
  | 'card-center'      // 中央定义卡(无图幕)
  | 'cards-stack'      // 堆叠板书卡(无图幕,立绘让位)
  | 'none'

export type SpriteSide = 'left' | 'right' | 'none'
export type SubtitleForm = 'dialogue' | 'narration' | 'none'

export interface Composition {
  id: string
  image: ImageForm
  text: TextForm
  sprite: SpriteSide
  subtitle: SubtitleForm
}

const IMAGE_FORMS: ImageForm[] = ['letterbox-center', 'anchor-left', 'anchor-right', 'cover-full', 'band-top']
const IMAGE_TEXT_FORMS: TextForm[] = ['chips-tl', 'chips-tr', 'rail-cards', 'strip-bottom', 'stepper-bottom', 'none']
const NOIMG_TEXT_FORMS: TextForm[] = ['card-center', 'cards-stack', 'stepper-bottom', 'strip-bottom']
const SPRITE_SIDES: SpriteSide[] = ['left', 'right', 'none']

export function isValidComposition(c: Omit<Composition, 'id'>): boolean {
  // 字幕轴与立绘轴的搭配约束:有立绘必有话(对白或旁白);无立绘不可能有对白框
  if (c.sprite !== 'none' && c.subtitle === 'none') return false
  if (c.sprite === 'none' && c.subtitle === 'dialogue') return false

  if (c.image === 'none') {
    if (!NOIMG_TEXT_FORMS.includes(c.text)) return false
  } else {
    if (!IMAGE_TEXT_FORMS.includes(c.text)) return false
    // 满幅裁切没有侧栏
    if (c.image === 'cover-full' && c.text === 'rail-cards') return false
    // 上带式的下带就是文字区,文字必须走底部形态
    if (c.image === 'band-top' && c.text !== 'strip-bottom' && c.text !== 'stepper-bottom') return false
    // 贴边形态空出的一侧必须被侧栏卡占用,否则出现整列空白(真检 round08)
    if ((c.image === 'anchor-left' || c.image === 'anchor-right') && c.text !== 'rail-cards') return false
    // 立绘不得与贴边图同侧(立绘会盖住图内教学主体,真检 round08);
    // 立绘也不得压住对侧侧栏
    if (c.image === 'anchor-left' && c.sprite === 'left') return false
    if (c.image === 'anchor-right' && c.sprite === 'right') return false
    if (c.image === 'anchor-left' && c.text === 'rail-cards' && c.sprite === 'right') return false
    if (c.image === 'anchor-right' && c.text === 'rail-cards' && c.sprite === 'left') return false
  }
  return true
}

function subtitleOptions(sprite: SpriteSide): SubtitleForm[] {
  return sprite === 'none' ? ['narration', 'none'] : ['dialogue', 'narration']
}

function buildLibrary(): Composition[] {
  const all: Composition[] = []
  const push = (image: ImageForm, text: TextForm, sprite: SpriteSide, subtitle: SubtitleForm) => {
    const candidate = { image, text, sprite, subtitle }
    if (isValidComposition(candidate)) {
      all.push({ id: `${image}/${text}/${sprite}/${subtitle}`, ...candidate })
    }
  }
  for (const image of [...IMAGE_FORMS, 'none' as ImageForm]) {
    const textForms = image === 'none' ? NOIMG_TEXT_FORMS : IMAGE_TEXT_FORMS
    for (const text of textForms) {
      for (const sprite of SPRITE_SIDES) {
        for (const subtitle of subtitleOptions(sprite)) push(image, text, sprite, subtitle)
      }
    }
  }
  return all
}

/** 全部合法组合。规模是硬指标:图文立绘字幕混合方式 ≥100(见单测)。 */
export const COMPOSITION_LIBRARY: Composition[] = buildLibrary()

/** 立绘位从 dialogueLayout 显式派生,渲染与生成共用一个事实源。 */
export function spriteSideOf(scene: LessonScene): SpriteSide {
  switch (scene.dialogueLayout) {
    case 'student-right-content-left': return 'right'
    case 'narration-only':
    case 'no-character': return 'none'
    default: return 'left'
  }
}

function subtitleFormOf(scene: LessonScene): SubtitleForm {
  if (scene.dialogueLayout === 'no-character') return 'none'
  if (scene.dialogueLayout === 'narration-only') return 'narration'
  return 'dialogue'
}

/**
 * 幕型 → 适配的文字形态。版式池由「全量合法组合 × 本表过滤」推导,
 * 不再手排小名单——170 种组合里凡是适配本幕型的都可达。
 * (真检 round08:此前手排 2-6 项小池 + 哈希只用 scene.id(各课 id 序列相同),
 * 导致跨课零变化、库形同虚设。)
 */
/** 导出供 layout-form-registry.ts 复用同一份过滤规则(硬指标「排版形式」不另编合法性规则)。 */
export const TEXT_FORM_FIT: Partial<Record<SceneType, readonly TextForm[]>> = {
  // 2026-07-22 用户复核「配图幕主次颠倒」:visual-observation 的教学主体是文字
  // (如"五特征分层"A/B/C),图只是辅助说明——废止 chips-tl/tr(把文字挤成图上
  // 角标),只用 strip-bottom(文字在下方成可读卡片区),配合 IMAGE_FORM_FIT 的
  // band-top(图收为顶部插图带),恢复"文字主、图辅"。
  'visual-observation': ['strip-bottom'],
  // 辨析幕的误区/修正双卡必须上屏:只允许承载它们的侧栏/底条形态
  contrast: ['rail-cards', 'strip-bottom'],
  // 收束幕以路径为主,兼容底条/侧栏
  recap: ['stepper-bottom', 'strip-bottom', 'rail-cards'],
}
export const DEFAULT_TEXT_FIT: readonly TextForm[] = ['rail-cards', 'strip-bottom']

/**
 * 幕型 → 适配的图形态(2026-07-22 用户复核「图片丧失辅助说明意义、文字变得不重要」)。
 * 缺省不限制(全部图形态可达);登记的幕型收窄到"图为辅助"的形态:
 * - visual-observation:锁 band-top(图为顶部插图带,下方留可读文字区),
 *   禁 cover-full(画面即内容,必然把文字挤成角标)。存量宽图经 band-top 的
 *   contain+模糊铺底零裁切,无需重生成。
 */
export const IMAGE_FORM_FIT: Partial<Record<SceneType, readonly ImageForm[]>> = {
  'visual-observation': ['band-top'],
}

const NOIMG_SCENE_PREFERENCES: Partial<Record<SceneType, readonly TextForm[]>> = {
  'concept-build': ['card-center'],
  practice: ['cards-stack'],
  'worked-example': ['cards-stack'],
}

function hashOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/**
 * 为一幕选定版式。
 * @param seed 课程级盐(传 course.id):同型幕在**不同课程**选中不同版式的关键。
 *             各课的 scene id 序列相同(p2-02-visual-observation…),不加盐则全库同款。
 */
/** 舞台设计基准分辨率(上课页 16:9 视口)。 */
export const STAGE_SIZE = { width: 1920, height: 1080 } as const

/**
 * 各图形态的图像槽高度占比(有字幕时收高让出字幕带)——
 * 渲染层图区高度与生图尺寸的**共同事实源**,改这里渲染和生成一起变。
 * 宽度规则:cover/band 全宽;anchor 方图(留出对侧宽侧栏);letterbox 3:2 居中。
 */
export const IMAGE_ZONE_HEIGHT: Record<Exclude<ImageForm, 'none'>, { subtitled: number; plain: number }> = {
  'cover-full': { subtitled: 0.84, plain: 1 },
  'band-top': { subtitled: 0.58, plain: 0.64 },
  'anchor-left': { subtitled: 0.81, plain: 1 },
  'anchor-right': { subtitled: 0.81, plain: 1 },
  'letterbox-center': { subtitled: 0.81, plain: 1 },
}

/** 图像 API 接受任意 16 倍数尺寸,但宽高比封顶 3:1(2026-07-14 对 gpt-image-2 实测)。 */
const MAX_IMAGE_ASPECT = 3
const snap16 = (px: number) => Math.max(16, Math.round(px / 16) * 16)

/**
 * 版式 → 该幕图像槽的精确生成尺寸:按舞台像素量槽定制,不再挤 1024/1536 两档预设。
 * band-top 槽位(≈3.07:1)超出 API 比例上限,clamp 到 3:1——渲染层是 contain+模糊延展,
 * 差出的两条窄边由模糊底吸收。
 */
export function imageSlotFor(c: Composition): { width: number; height: number } {
  const zone = IMAGE_ZONE_HEIGHT[c.image as Exclude<ImageForm, 'none'>] ?? IMAGE_ZONE_HEIGHT['letterbox-center']
  const h = STAGE_SIZE.height * (c.subtitle !== 'none' ? zone.subtitled : zone.plain)
  const w = c.image === 'cover-full' || c.image === 'band-top'
    ? STAGE_SIZE.width
    : c.image === 'anchor-left' || c.image === 'anchor-right'
      ? h
      : h * 1.5
  return { width: snap16(w), height: snap16(Math.max(h, w / MAX_IMAGE_ASPECT)) }
}

/**
 * 四轴气质标签(2026-07-22 四轴合成接入 K12 路由):图/文形态各自登记密度×正式度,
 * 与 master-routing 的学段/学科/时期因子同一口径——低学段偏满幅沉浸大图+少文字
 * 负荷,高中偏图+批注侧栏的高信息密度。ground 恒 paper(四轴无深底形态)。
 */
const IMAGE_FORM_TRAITS: Record<Exclude<ImageForm, 'none'>, { density: MasterDensity; formality: MasterFormality }> = {
  'cover-full': { density: 'airy', formality: 'playful' }, // 满幅沉浸,画面即内容
  'band-top': { density: 'airy', formality: 'neutral' },
  'letterbox-center': { density: 'medium', formality: 'neutral' },
  'anchor-left': { density: 'medium', formality: 'neutral' },
  'anchor-right': { density: 'medium', formality: 'neutral' },
}

const TEXT_FORM_TRAITS: Record<TextForm, { density: MasterDensity; formality: MasterFormality }> = {
  'chips-tl': { density: 'airy', formality: 'neutral' },
  'chips-tr': { density: 'airy', formality: 'neutral' },
  'rail-cards': { density: 'dense', formality: 'austere' }, // 侧栏批注,信息密度最高
  'strip-bottom': { density: 'medium', formality: 'neutral' },
  'stepper-bottom': { density: 'medium', formality: 'neutral' },
  'card-center': { density: 'medium', formality: 'neutral' },
  'cards-stack': { density: 'dense', formality: 'neutral' },
  none: { density: 'airy', formality: 'playful' },
}

function compositionBuckets(pool: readonly Composition[], course: RoutingCourse): number[] {
  const family = subjectFamilyOf(course.subject)
  const phase = lessonPhaseOf(course)
  return pool.map(c => {
    const img = c.image === 'none' ? null : IMAGE_FORM_TRAITS[c.image]
    const txt = TEXT_FORM_TRAITS[c.text]
    const w = (img ? masterWeightFor({ id: c.id, ground: 'paper', ...img }, course.gradeBand, family, phase) : 1)
      * masterWeightFor({ id: c.id, ground: 'paper', ...txt }, course.gradeBand, family, phase)
    return Math.max(1, Math.round(w * 20))
  })
}

/**
 * @param routing 传入课程学段/学科/时期时,组合按 K12 气质加权选择(权重有地板,
 *                倾斜不锁死);缺省保持均匀轮换(既有调用/测试零回退)。
 */
export function compositionFor(scene: LessonScene, seed = '', routing?: RoutingCourse): Composition {
  const sprite = spriteSideOf(scene)
  const subtitle = subtitleFormOf(scene)
  const h = hashOf(`${seed}::${scene.id}`)

  if (!scene.imageUrl) {
    const prefs = NOIMG_SCENE_PREFERENCES[scene.sceneType] ?? ['cards-stack']
    const text = prefs[h % prefs.length]!
    return { id: `none/${text}/${sprite}/${subtitle}`, image: 'none', text, sprite, subtitle }
  }

  const fit = TEXT_FORM_FIT[scene.sceneType] ?? DEFAULT_TEXT_FIT
  const imgFit = IMAGE_FORM_FIT[scene.sceneType]
  const pool = COMPOSITION_LIBRARY.filter(c =>
    c.sprite === sprite && c.subtitle === subtitle && c.image !== 'none'
    && fit.includes(c.text)
    && (!imgFit || imgFit.includes(c.image)),
    // band-top 已解锁:渲染层改模糊延展拼接(原图 contain 零裁切,模糊放大版铺满全宽),
    // 不再依赖生成端宽幅尺寸
  )
  if (pool.length === 0) {
    return { id: `letterbox-center/rail-cards/${sprite}/${subtitle}`, image: 'letterbox-center', text: 'rail-cards', sprite, subtitle }
  }
  if (!routing) return pool[h % pool.length]!

  const buckets = compositionBuckets(pool, routing)
  const total = buckets.reduce((sum, b) => sum + b, 0)
  let bucket = h % total
  for (let i = 0; i < pool.length; i++) {
    bucket -= buckets[i]!
    if (bucket < 0) return pool[i]!
  }
  return pool[pool.length - 1]!
}

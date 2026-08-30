import { lessonPhaseOf, type GradeBand, type LessonPhase, type LessonScene, type MainlineCourse, type SubjectId } from '../domain.js'

/**
 * master-routing · 学段学科表现路由(K12 Presentation Router,2026-07-22)
 *
 * 病灶(docs/design-refresh/2026-07-22-k12-presentation-space.md S1):构图母版
 * 选择此前只吃 course.id+scene.id 哈希——高中物理与小学语文的 concept-build 抽
 * 同一个母版池、同一签。风格包色彩层早有学段/学科过滤(anchorPoolFor/
 * legacyStylePackFor),母版层却零感知,耦合点严重不对称。
 *
 * 机制:不逐格手写「4 学段 × 5 学科族 × 幕型 × 母版」权重表(维护不动,新母版
 * 一来就漏),而是给每个母版登记**气质特征**(密度/正式度/明暗/学科亲缘),用
 * 特征 × 学段因子推导权重——新母版出生登记即入路由。
 *
 * 两条铁律:
 * 1. **权重是倾斜不是锁死**(ai-master-select 同款教训):所有母版有 WEIGHT_FLOOR
 *    地板份额,低学段仍会偶遇学术式、高中仍会偶遇亲和式——避免沦为「学段刻板
 *    印象机器」,同课多幕也不会清一色。
 * 2. **确定性不变**:同 (course.id, scene.id) 永远同签;学段/学科是课程常量,
 *    不会导致同课渲染抖动。
 *
 * 放在 lib 而非 components/scene-views 的原因:quality-gates 需要在服务端复算
 * 母版落点做撞车检查(components 不许被 lib 反向 import,与 layout-form-registry
 * 同一分层纪律);scene-views 经 master-hash.ts 消费本文件。
 */

/* ── 学科族 ─────────────────────────────────────────────────── */

/** 学科族:亲缘映射的粒度。逐学科登记会让 10 学科 × N 母版全是手写魔数,
 * 族级映射来自真实教学法传统(注疏之于文史、板演推导之于数理),不是审美猜测。 */
export type SubjectFamily = 'reasoning' | 'literary' | 'nature' | 'language' | 'general'

const SUBJECT_FAMILY: Record<SubjectId, SubjectFamily> = {
  math: 'reasoning',
  physics: 'reasoning',
  chemistry: 'reasoning',
  chinese: 'literary',
  history: 'literary',
  politics: 'general',
  biology: 'nature',
  geography: 'nature',
  science: 'nature',
  english: 'language',
  general: 'general',
}

export function subjectFamilyOf(subject: SubjectId): SubjectFamily {
  return SUBJECT_FAMILY[subject]
}

/* ── 母版气质登记 ───────────────────────────────────────────── */

export type MasterDensity = 'airy' | 'medium' | 'dense'
export type MasterFormality = 'playful' | 'neutral' | 'austere'
export type MasterGround = 'paper' | 'dark'

export interface MasterTraits {
  /** 数字母版用下标字符串('0'..'4'),ai 幕型用具名 id——与 layout-form-registry
   * 的 MASTER_IDS 同一命名空间,单测互相校验。 */
  id: string
  /** 信息密度:低学段认知负荷小→airy 升权;高中信息量大→dense 升权。 */
  density: MasterDensity
  /** 正式度:playful(玩心/亲和)↔austere(学术/克制),学段因子的主杠杆。 */
  formality: MasterFormality
  /** 明暗:dark(深底/剧场黑底/纯色实底)对低学段压权——不是禁用,是少见。 */
  ground: MasterGround
  /** 学科亲缘倍率(缺省 1):只登记有真实教学法依据的亲缘,禁凑数。 */
  affinity?: Partial<Record<SubjectFamily, number>>
}

/** 走数字母版路由的幕型(ai-verify/ai-inquiry 有内容特征加权,单列)。
 * contrast/ai-collab 2026-07-22 加入(S3 扩容,见 scene-views/contrast-scenes.tsx、ai-collab.tsx)。 */
export type RoutedSceneType = 'source-reading' | 'concept-build' | 'worked-example' | 'practice' | 'recap' | 'contrast' | 'ai-collab' | 'visual-observation'

/**
 * 气质登记表——依据各 scene-views 文件头的母版注释诚实登记,禁凭空发挥。
 * 数组顺序 = 各视图 pickMaster 的分支下标顺序(0 号是各文件的「原版」)。
 */
export const MASTER_TRAITS: Record<RoutedSceneType, readonly MasterTraits[]> = {
  'source-reading': [
    { id: '0', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { literary: 1.3 } }, // 报头式:62/38 报刊编辑部气质
    { id: '1', density: 'medium', formality: 'playful', ground: 'paper', affinity: { reasoning: 1.2 } }, // 满版序号式:巨型课号当主角的玩心
    { id: '2', density: 'airy', formality: 'neutral', ground: 'paper' }, // 横幅式:通栏+大留白,最松弛的开场
    { id: '3', density: 'airy', formality: 'austere', ground: 'paper', affinity: { literary: 1.25 } }, // 扉页式:书籍扉页的极简纵向流
    { id: '4', density: 'medium', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.25 } }, // 学术抬头式:university title-slide
    // Wave1 引进(harvest/layouts):
    { id: '5', density: 'airy', formality: 'austere', ground: 'paper', affinity: { literary: 1.3 } }, // 引语扉页式(marpstyle cite 卡)
    { id: '6', density: 'airy', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.2 } }, // 仪表队列式(beamer metropolis title-slide)
    { id: '7', density: 'medium', formality: 'playful', ground: 'paper' }, // 留白潦草式(shibainu default blob)
  ],
  'concept-build': [
    { id: '0', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.5 } }, // Stargazer 定理卡
    { id: '1', density: 'medium', formality: 'austere', ground: 'paper', affinity: { literary: 2.0 } }, // 注疏式:古籍注疏骨架
    { id: '2', density: 'medium', formality: 'neutral', ground: 'paper' }, // 全出血式:accent 出血色块(白为主转换 2026-07-23)
    { id: '3', density: 'airy', formality: 'neutral', ground: 'paper' }, // 聚光式:白底 accent 柔光聚光(白为主转换 2026-07-23)
    { id: '4', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.3, nature: 1.25 } }, // 棋盘式:表格感
    // Wave2 引进(harvest/layouts):
    { id: '5', density: 'medium', formality: 'austere', ground: 'paper', affinity: { literary: 1.2 } }, // 出血色带式(marpstyle heidegger)
    { id: '6', density: 'airy', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.2 } }, // 细线极简式(touying metropolis)
    { id: '7', density: 'airy', formality: 'playful', ground: 'paper' }, // 巨数气泡式(touying aqua)
    { id: '8', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.4 } }, // 网格图纸式(neocarbon diagram)
    { id: '9', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.3 } }, // 令牌条式(marpstyle gropius)
  ],
  'worked-example': [
    { id: '0', density: 'medium', formality: 'neutral', ground: 'paper' }, // 62/38 非对称
    { id: '1', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.8 } }, // 纵嵌式:证明逐行推导
    { id: '2', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { literary: 1.6, language: 1.3 } }, // 对开式:书页对开
    { id: '3', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.6 } }, // 双层定理卡式
    { id: '4', density: 'airy', formality: 'austere', ground: 'paper' }, // 极简进度线式:metropolis 大留白
    // Wave2 引进(harvest/layouts):
    { id: '5', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.3, nature: 1.2 } }, // 棋盘格式(touying university/matrix)
    { id: '6', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.4 } }, // 网格草稿流(neocarbon diagram)
    { id: '7', density: 'medium', formality: 'neutral', ground: 'paper' }, // 出血分栏式(marpstyle heidegger columns)
    { id: '8', density: 'medium', formality: 'austere', ground: 'paper', affinity: { literary: 1.4 } }, // 账本引语式(neocarbon quote + touying simple)
    { id: '9', density: 'medium', formality: 'playful', ground: 'paper', affinity: { reasoning: 1.2 } }, // 窗口终端式(neocarbon browser/code)
  ],
  practice: [
    { id: '0', density: 'medium', formality: 'neutral', ground: 'paper' }, // 62/38 非对称
    { id: '1', density: 'airy', formality: 'playful', ground: 'paper' }, // 任务卡居中放大:最低认知负荷
    { id: '2', density: 'medium', formality: 'neutral', ground: 'paper' }, // 横幅任务式
    { id: '3', density: 'dense', formality: 'austere', ground: 'paper' }, // 棋盘式
    { id: '4', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.2 } }, // 对比双栏式:核对语义
    // Wave2 引进(harvest/layouts):
    { id: '5', density: 'dense', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.2 } }, // KPI 卡片行(neocarbon metrics)
    { id: '6', density: 'airy', formality: 'austere', ground: 'paper' }, // 大留白节拍舞台(touying metropolis section)
    { id: '7', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.4 } }, // 网格图纸面板(neocarbon diagram)
    { id: '8', density: 'airy', formality: 'playful', ground: 'paper' }, // 印章气泡式(touying aqua title)
    { id: '9', density: 'medium', formality: 'austere', ground: 'paper' }, // 出血条式(marpstyle heidegger)
  ],
  recap: [
    { id: '0', density: 'airy', formality: 'neutral', ground: 'paper' }, // Focus:白底深墨巨字+粗下划线(白为主转换 2026-07-23)
    { id: '1', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { literary: 1.5, nature: 1.2 } }, // 纵向时间线式
    { id: '2', density: 'medium', formality: 'playful', ground: 'paper' }, // 板书总结墙:黑板圈重点的课堂温度
    { id: '3', density: 'airy', formality: 'austere', ground: 'paper' }, // 断点式:白底 accentSoft 大色块(白为主转换 2026-07-23)
    { id: '4', density: 'airy', formality: 'playful', ground: 'paper' }, // 光环聚焦式
    // Wave1 引进(harvest/layouts):
    { id: '5', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.2 } }, // 信息网格总结(touying university/matrix)
    { id: '6', density: 'medium', formality: 'neutral', ground: 'paper' }, // 大纲高亮总览(touying stargazer/dewdrop section)
    { id: '7', density: 'airy', formality: 'austere', ground: 'paper', affinity: { literary: 1.4 } }, // 引言收束(marpstyle cite 全屏引语)
    { id: '8', density: 'airy', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.15 } }, // 巨数收尾(touying aqua/university section)
  ],
  contrast: [
    { id: '0', density: 'medium', formality: 'neutral', ground: 'paper' }, // 对照双栏:半屏 Focus 落差
    { id: '1', density: 'airy', formality: 'neutral', ground: 'paper' }, // 裁决纵列式:单列纵向流,认知负荷最低
    { id: '2', density: 'medium', formality: 'austere', ground: 'paper', affinity: { literary: 1.6 } }, // 勘辨式:古籍勘误批注骨架
    // Wave1 引进(harvest/layouts):
    { id: '3', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { reasoning: 1.2 } }, // 渐变分隔双栏(neocarbon comparison)
    { id: '4', density: 'airy', formality: 'neutral', ground: 'paper', affinity: { literary: 1.3 } }, // 宣言深底式(neocarbon statement)
    { id: '5', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.3, nature: 1.2 } }, // 棋盘对比(touying university/matrix)
    { id: '6', density: 'airy', formality: 'austere', ground: 'paper' }, // 极简纵叠(neocarbon two-cols)
  ],
  'ai-collab': [
    { id: '0', density: 'medium', formality: 'playful', ground: 'paper' }, // 任务卡纵列式:accent 题头卡+编号量规
    { id: '1', density: 'medium', formality: 'austere', ground: 'paper' }, // 契约双栏式:任务大字+验收清单竖栏
  ],
  'visual-observation': [
    { id: '0', density: 'medium', formality: 'neutral', ground: 'paper' }, // 栏目卡式:标题→居中图卡→编号说明卡横排(原版)
    { id: '1', density: 'medium', formality: 'neutral', ground: 'paper', affinity: { literary: 1.3, language: 1.2 } }, // 左图右注式:编辑双栏,配图注解阅读(touying/slidev split)
    { id: '2', density: 'dense', formality: 'playful', ground: 'paper', affinity: { nature: 1.3, reasoning: 1.2 } }, // 引线标注式:图居中+编号引线 chip 环绕(neocarbon diagram/open-design callout)
    { id: '3', density: 'airy', formality: 'neutral', ground: 'paper', affinity: { literary: 1.25 } }, // 影院单带式:大图框+overline标题+底部单行说明带(marpstyle 收边全幅)
    { id: '4', density: 'dense', formality: 'austere', ground: 'paper', affinity: { reasoning: 1.2, nature: 1.25 } }, // 图鉴网格式:标题条+hero图卡+说明卡2列网格(touying university/matrix)
  ],
}

/** ai-verify/ai-inquiry 母版气质:不走 pickMasterRouted(它们有内容特征加权,
 * 见 ai-master-select.ts),只提供学段学科倍率给既有权重相乘。 */
const AI_MASTER_TRAITS: Record<string, MasterTraits> = {
  'ai-verify/comparison': { id: 'comparison', density: 'medium', formality: 'neutral', ground: 'paper' },
  'ai-verify/interrogation': { id: 'interrogation', density: 'airy', formality: 'austere', ground: 'paper' },
  'ai-verify/checklist': { id: 'checklist', density: 'dense', formality: 'neutral', ground: 'paper' },
  'ai-verify/sticky-note': { id: 'sticky-note', density: 'medium', formality: 'playful', ground: 'paper' },
  'ai-inquiry/comparison': { id: 'comparison', density: 'medium', formality: 'neutral', ground: 'paper' },
  'ai-inquiry/waterfall': { id: 'waterfall', density: 'medium', formality: 'neutral', ground: 'paper' },
  'ai-inquiry/chat': { id: 'chat', density: 'medium', formality: 'playful', ground: 'paper', affinity: { language: 1.4 } },
}

/* ── 学段因子 ───────────────────────────────────────────────── */

interface BandFactors {
  formality: Record<MasterFormality, number>
  density: Record<MasterDensity, number>
  /** dark ground 的额外倍率(paper 恒 1)。 */
  dark: number
}

/**
 * 学段因子对应认知负荷与情绪需求的行为学事实,不是审美偏好:低学段要低密度、
 * 高亲和、忌剧场黑底;高中要信息密度、学术克制、忌幼态。middle-school 是全 1
 * 基线——既是当前全部演示课的档位(零回退锚点),也是因子表可读性的参照系。
 */
const BAND_FACTORS: Record<GradeBand, BandFactors> = {
  'lower-primary': { formality: { playful: 2.0, neutral: 1.0, austere: 0.4 }, density: { airy: 1.5, medium: 1.0, dense: 0.5 }, dark: 0.55 },
  'upper-primary': { formality: { playful: 1.6, neutral: 1.0, austere: 0.6 }, density: { airy: 1.25, medium: 1.0, dense: 0.7 }, dark: 0.75 },
  'middle-school': { formality: { playful: 1.0, neutral: 1.0, austere: 1.0 }, density: { airy: 1.0, medium: 1.0, dense: 1.0 }, dark: 1.0 },
  'high-school': { formality: { playful: 0.55, neutral: 1.0, austere: 1.7 }, density: { airy: 0.9, medium: 1.0, dense: 1.25 }, dark: 1.1 },
}

/**
 * 学习时期因子(方向三·时期与时令 v1):复习/考前的课偏高密度检核形态、收敛
 * 玩心——同一学段学科,新授与考前复习的同一幕型该长得不一样。new 全 1 是
 * 零回退基线(未标注时期的旧课行为不变)。
 */
const PHASE_FACTORS: Record<LessonPhase, BandFactors> = {
  new: { formality: { playful: 1.0, neutral: 1.0, austere: 1.0 }, density: { airy: 1.0, medium: 1.0, dense: 1.0 }, dark: 1.0 },
  review: { formality: { playful: 0.9, neutral: 1.0, austere: 1.1 }, density: { airy: 0.85, medium: 1.0, dense: 1.3 }, dark: 1.0 },
  'exam-prep': { formality: { playful: 0.7, neutral: 1.0, austere: 1.25 }, density: { airy: 0.8, medium: 1.0, dense: 1.45 }, dark: 0.9 },
}

/** 权重地板:任何母版在任何学段×学科×时期下的最低份额——「倾斜不锁死」的数值承诺。 */
export const WEIGHT_FLOOR = 0.15
/** 浮点权重 → 整数哈希桶的缩放(哈希桶必须整数,见 weightedIndexOf)。 */
const WEIGHT_SCALE = 20

export function masterWeightFor(traits: MasterTraits, gradeBand: GradeBand, family: SubjectFamily, phase: LessonPhase = 'new'): number {
  const f = BAND_FACTORS[gradeBand]
  const p = PHASE_FACTORS[phase]
  const raw = f.formality[traits.formality] * p.formality[traits.formality]
    * f.density[traits.density] * p.density[traits.density]
    * (traits.ground === 'dark' ? f.dark * p.dark : 1)
    * (traits.affinity?.[family] ?? 1)
  return Math.max(WEIGHT_FLOOR, raw)
}

/** 路由输入:课程的学段/学科/时期三维(时期可缺省,旧课按新授)。
 * 导出给四轴合成(composition.ts)等下游复用同一路由口径。 */
export type RoutingCourse = Pick<MainlineCourse, 'gradeBand' | 'subject'> & { lessonPhase?: LessonPhase }

/** ai 幕型专用:学段×学科×时期倍率(供 ai-master-select 与内容特征权重相乘)。 */
export function aiMasterFactor(sceneType: 'ai-verify' | 'ai-inquiry', masterId: string, course: RoutingCourse): number {
  const traits = AI_MASTER_TRAITS[`${sceneType}/${masterId}`]
  if (!traits) return 1
  return masterWeightFor(traits, course.gradeBand, subjectFamilyOf(course.subject), lessonPhaseOf(course))
}

/* ── 确定性加权选择 ─────────────────────────────────────────── */

/**
 * 31 乘法字符串哈希 + fmix32 雪崩混合。混合必不可少:加权桶总和可能是 2 的幂
 * (如初中数学 worked-example 恰为 128),取模 2 的幂只用哈希低位,而 h*31 对
 * 结构化 id 串(course-N::scene-N)的低位分布很差——单测的落点分布断言曾因此
 * 翻车(#2 反超权重最高的 #1)。master-hash.ts 的均匀 pickMaster 不受此影响
 * (模数 3/5 非 2 的幂),维持原实现不动。
 */
function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** 整数权重表(顺序对齐 MASTER_TRAITS 下标),供选择与闸门/测试复算共用。 */
export function masterBucketsFor(course: RoutingCourse, sceneType: RoutedSceneType): number[] {
  const family = subjectFamilyOf(course.subject)
  const phase = lessonPhaseOf(course)
  return MASTER_TRAITS[sceneType].map(traits => Math.max(1, Math.round(masterWeightFor(traits, course.gradeBand, family, phase) * WEIGHT_SCALE)))
}

function weightedIndexOf(buckets: readonly number[], bucket: number): number {
  let acc = 0
  for (let i = 0; i < buckets.length; i++) {
    acc += buckets[i]!
    if (bucket < acc) return i
  }
  return buckets.length - 1
}

/**
 * 学段学科路由版母版选择:同 (course.id, scene.id) 确定性稳定,权重由
 * 学段因子 × 学科亲缘推导。替代五个主力幕型此前的均匀 pickMaster。
 */
export function pickMasterRouted(
  course: Pick<MainlineCourse, 'id'> & RoutingCourse,
  scene: Pick<LessonScene, 'id'>,
  sceneType: RoutedSceneType,
): number {
  const buckets = masterBucketsFor(course, sceneType)
  const total = buckets.reduce((sum, b) => sum + b, 0)
  const bucket = hashOf(`${course.id}::${scene.id}::${sceneType}`) % total
  return weightedIndexOf(buckets, bucket)
}

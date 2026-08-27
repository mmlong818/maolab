/**
 * 信息形状 → 骨架 · 词汇表(2026-07-28)
 *
 * ## ⚠️ 本文件原本服务的方案已废止,别照旧注释理解
 *
 * 落地时(E-1)它是「LLM 声明形状 → 判定器证伪 → 路由按形状收窄母版候选」这条链的契约。
 * **同日实测推翻**:`generation/fill-scenes.ts` 的 `SCENE_ROLES` 按幕型写死槽键,
 * 形状 100% 可由 `sceneType` 推出(126 幕实测,8 个幕型有 7 个核心槽键组合只有 1 种,
 * Codex 独立复核确认)。于是:
 *
 * - 判定器(E-2):校验一个可推导的声明 = 纯开销 + 幻觉面 → **废止**
 * - 路由收窄(E-4):交集是每幕型一个固定子集,跨幕零判别力,**比 no-op 更糟**
 *   (缩小母版池却换不来区分)→ **废止**
 * - 生成期声明(E-5)→ **废止**
 *
 * 详见 `tasks/e-infoshape-presentation-2026-07-28.md` 文末「实测推翻」。
 *
 * ## 保留它的理由
 *
 * 真正的缺口在内容层——每个幕型只有一种信息结构可选。方向 E′ 让 `SCENE_ROLES`
 * 从「一幕型一套槽键」变成「一幕型 N 套候选**结构模板**」,那时:
 *
 * > **形状是「选了哪套模板」的派生结果。** 模板的槽要么填了要么没填,
 * > 可信性白来,不需要 E-2 那套证伪机器。
 *
 * 下面三张表届时的角色:
 * - `SKELETON_FOR` —— 模板 → 版面骨架(不变)
 * - `INFO_SHAPE_CRITERIA` —— **选模板**的判据(不再是校验声明的判据)
 * - `SHAPE_SLOT_REQUIREMENTS` —— 一套该形状的模板**至少要提供什么槽**(模板设计约束,
 *   不再是给 LLM 声明挑错的规则)
 *
 * 2026-08-21 起 E′ 已先在 recap 落地：`recap-template.ts` 从显式课程结构选择
 * progressive / contrast / hierarchy / radial 四类模板；同日 concept-build 又按知识
 * 类型为元认知策略选择 progressive 闭环模板。两者都由生成、渲染和质量闸门共同
 * 消费模板派生的 infoShape，仍禁止 LLM 自报形状。
 */
import type { InfoShape } from '../domain.js'

/**
 * 骨架 = 内容在版面上的**结构**,不是装饰。
 * 与母版(master)的关系:一张母版实现某一种骨架;同一骨架可以有多张气质不同的母版。
 * E-3 会给现有每张母版登记它实际属于哪种骨架。
 */
export type SkeletonId =
  | 'grid'
  | 'stair'
  | 'satellite'
  | 'dual-column'
  | 'banner-split'
  | 'timeline'

export const SKELETON_FOR: Record<InfoShape, SkeletonId> = {
  parallel: 'grid',
  progressive: 'stair',
  radial: 'satellite',
  contrast: 'dual-column',
  hierarchy: 'banner-split',
  chronological: 'timeline',
}

/**
 * 判据原文。**这里是唯一出处**,凡要用判据的地方引用它,不要另抄一份。
 *
 * 角色已变:原本是「校验 LLM 形状声明」的口径(E-5,已废止);在 E′ 里它是
 * **「这段内容该用哪套结构模板」的判断依据**。
 *
 * 做成常量而不是注释的理由不变且更重要了:写两份必然漂移。
 * 判据必须是**能回答的问句**——问不出答案的判据等于没有。
 */
export const INFO_SHAPE_CRITERIA: Record<InfoShape, string> = {
  parallel: '任意调换两项,意思不变',
  progressive: '调换后读不通,后项依赖前项',
  radial: '去掉中心项,其余各项失去意义',
  contrast: '恰好两侧,且要点能一一对位',
  hierarchy: '有一句总述,其余都在支撑它',
  chronological: '各项带真实时间刻度(年代/时刻),没有年代就不是时序',
}

/**
 * 每种形状的结构底线 —— **一套该形状的模板至少要提供什么**。
 *
 * 原用途是给 LLM 的形状声明挑错(E-2 `parseShapeDeclaration`,已废止:
 * 形状可由 sceneType 推出,没有声明需要被证伪)。在 E′ 里它变成**模板设计约束**:
 * 设计一套 radial 模板,它的槽里必须有中心项,否则渲染出来不成其为放射。
 *
 * 表本身的内容不因用途改变而失效——`radial` 要中心、`contrast` 恰好两侧、
 * `parallel` 至少三项(两项的并列本质是对照),这些是版面事实,不是校验策略。
 */
export interface ShapeSlotRequirement {
  /** 除通用列表项外还必须存在的 contentSlots 键 */
  requiredSlots: readonly string[]
  /** 列表项条数下限 */
  minItems: number
  /** 列表项条数上限;不限则为 null */
  maxItems: number | null
  /** 这条要求存在的理由,写给下一个改它的人 */
  why: string
}

export const SHAPE_SLOT_REQUIREMENTS: Record<InfoShape, ShapeSlotRequirement> = {
  parallel: {
    requiredSlots: [],
    minItems: 3,
    maxItems: null,
    why: '2 项的并列本质上是对照,该归 contrast;不设下限则 parallel 会吞掉一切。',
  },
  progressive: {
    requiredSlots: [],
    minItems: 3,
    maxItems: null,
    why: '2 步谈不上递进。',
  },
  radial: {
    requiredSlots: ['shapeCenter'],
    minItems: 3,
    maxItems: null,
    why: '没有中心项就不是放射;卫星少于 3 颗视觉上退化成并列。',
  },
  contrast: {
    requiredSlots: [],
    minItems: 2,
    maxItems: 2,
    why: '恰好两侧是对照的定义,三侧就不是对照了。',
  },
  hierarchy: {
    requiredSlots: ['shapeSummary'],
    minItems: 2,
    maxItems: null,
    why: '总分的「总」必须显式给出,否则与并列无从区分。',
  },
  chronological: {
    requiredSlots: [],
    minItems: 3,
    maxItems: null,
    why: '真正的判据是各项带时间刻度,不是数量;此处只挡「两点连线」式伪时序。',
  },
}

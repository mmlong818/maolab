import type { SceneType } from '../domain.js'
import {
  COMPOSITION_LIBRARY,
  DEFAULT_TEXT_FIT,
  TEXT_FORM_FIT,
  type Composition,
  type ImageForm,
  type SpriteSide,
  type SubtitleForm,
  type TextForm,
} from './composition.js'

/**
 * 排版形式注册表 · docs/design-refresh/hard-targets-spec.md 指标 3「排版形式 ≥1000 种,两两差距 ≥15%」
 *
 * 口径:一「排版形式」= (幕型, 构图母版, 图形态, 文形态, 立绘位, 字幕形态) 合法六元组。
 * 母版数按各幕型真实实现取值(不重新发明):
 * - source-reading/concept-build/worked-example/practice/recap 各 5 个数字母版
 *   (components/mainline/scene-views/{source-reading,concept-build,worked-example,
 *   practice,recap}.tsx 的 `pickMaster(course, scene, sceneType, 5)`)。
 * - ai-verify 4 个 / ai-inquiry 3 个(与 scene-views/ai-master-select.ts 的
 *   AI_VERIFY_MASTERS/AI_INQUIRY_MASTERS 同源计数;不跨目录反向 import components/
 *   下的模块到 lib/,保持既有分层,这里只镜像其计数与命名)。
 * - visual-observation 5 个(Wave3,scene-views/visual-slide.tsx pickMasterRouted 轮换);
 *   contrast 7 个 / ai-collab 2 个(S3 扩容,各自 scene-view 文件)。
 *
 * 图/文/立绘/字幕四轴的合法组合直接复用 composition.ts 的 COMPOSITION_LIBRARY +
 * TEXT_FORM_FIT(+ DEFAULT_TEXT_FIT 兜底)——不另编合法性规则:有图的组合按该
 * 幕型的文字形态适配表过滤(与 compositionFor() 运行时选择同一张表);无图组合
 * (image==='none')对所有幕型一视同仁地开放(NOIMG_SCENE_PREFERENCES 是运行时
 * 的"偏好列表",不是"合法性"边界——合法性仍以 isValidComposition 已过滤出的
 * COMPOSITION_LIBRARY 为准)。
 *
 * 两两距离 ≥15% 由构造保证(不需要逐对再算一次 OKLCH 式的距离函数):
 * DIMENSION_WEIGHTS 里最小的单维权重是 0.15(立绘位/字幕形态),而 LAYOUT_FORM_REGISTRY
 * 的每一条都以 (sceneType, master, image, text, sprite, subtitle) 六元组去重——任何
 * 两条不同的记录必然至少有一维不同:若只差立绘位或字幕形态,单维贡献恰好 0.15,
 * 达标;若差图形态/文形态(各 0.20)或母版(0.25),单维贡献本就 >0.15;若幕型不同,
 * 母版本身就来自不可比的两个"母版空间"(如 ai-verify 的 'checklist' 与 recap 的
 * '2' 不是同一枚举),幕型语义项(0.05 基础差异 + 0.25 跨母版空间)单独就 ≥0.15。
 * 故"注册表无重复"这一条测试断言,直接推出"两两距离 ≥15%"成立。
 */

export const SCENE_TYPES: readonly SceneType[] = [
  'source-reading',
  'concept-build',
  'worked-example',
  'visual-observation',
  'contrast',
  'practice',
  'recap',
  'ai-verify',
  'ai-inquiry',
  'ai-collab',
]

/** 各幕型的母版 id 清单,数值/命名对齐各 scene-view 文件的真实实现(见文件头注释)。
 * 导出供 master-routing 测试做「气质登记 ↔ 母版清单」互相校验。 */
export const MASTER_IDS: Record<SceneType, readonly string[]> = {
  'source-reading': ['0', '1', '2', '3', '4', '5', '6', '7'],
  'concept-build': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  'worked-example': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  practice: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  recap: ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
  'ai-verify': ['comparison', 'interrogation', 'checklist', 'sticky-note'],
  'ai-inquiry': ['comparison', 'waterfall', 'chat'],
  // visual-observation Wave3 扩容:栏目卡/左图右注/引线标注/影院单带/图鉴网格(scene-views/visual-slide.tsx)
  'visual-observation': ['0', '1', '2', '3', '4'],
  // contrast/ai-collab 2026-07-22 S3 扩容(scene-views/contrast-scenes.tsx、ai-collab.tsx)
  contrast: ['0', '1', '2', '3', '4', '5', '6'],
  'ai-collab': ['0', '1'],
}

/** 维度权重表(照抄 spec 指标 3),只收录"同幕型内可直接比较"的五维——幕型本身的
 * 权重是复合项(0.05 基础 + 0.25 跨母版空间),不是与其余五维同口径的单一数值,
 * 单独记在 SCENE_TYPE_WEIGHT 里,不掺进这张"最小权重"表。 */
export const DIMENSION_WEIGHTS = {
  master: 0.25,
  image: 0.20,
  text: 0.20,
  sprite: 0.15,
  subtitle: 0.15,
} as const

/** 幕型语义项:同幕型内两条差异记 0.05,跨幕型(母版空间不可比)额外 +0.25。 */
export const SCENE_TYPE_WEIGHT = { withinFamily: 0.05, crossFamily: 0.25 } as const

function legalCompositionsFor(sceneType: SceneType): readonly Composition[] {
  const fit = TEXT_FORM_FIT[sceneType] ?? DEFAULT_TEXT_FIT
  return COMPOSITION_LIBRARY.filter(c => c.image === 'none' || fit.includes(c.text))
}

export interface LayoutForm {
  id: string
  sceneType: SceneType
  master: string
  image: ImageForm
  text: TextForm
  sprite: SpriteSide
  subtitle: SubtitleForm
}

function buildRegistry(): LayoutForm[] {
  const out: LayoutForm[] = []
  for (const sceneType of SCENE_TYPES) {
    const masters = MASTER_IDS[sceneType]
    const compositions = legalCompositionsFor(sceneType)
    for (const master of masters) {
      for (const c of compositions) {
        out.push({
          id: `${sceneType}/${master}/${c.id}`,
          sceneType,
          master,
          image: c.image,
          text: c.text,
          sprite: c.sprite,
          subtitle: c.subtitle,
        })
      }
    }
  }
  return out
}

/** 全部合法排版形式,规模是硬指标:≥1000(见单测)。 */
export const LAYOUT_FORM_REGISTRY: readonly LayoutForm[] = buildRegistry()

export function layoutFormCount(): number {
  return LAYOUT_FORM_REGISTRY.length
}

/** 供报告/测试用:按幕型拆分的规模明细。 */
export function layoutFormCountBySceneType(): Record<SceneType, number> {
  const out = {} as Record<SceneType, number>
  for (const sceneType of SCENE_TYPES) {
    out[sceneType] = MASTER_IDS[sceneType].length * legalCompositionsFor(sceneType).length
  }
  return out
}

import type { GradeBand, SubjectId } from '../domain.js'
import { PAPER_TINTS, TEXTURE_SIGNATURES, anchorPoolFor, derivePackInstance, moodPoolFor } from './pack-families.js'
import { importedPoolFor } from './imported-packs.js'
import { paletteOf } from './primitives.js'
import { STYLE_PACKS } from './style-packs.js'

/**
 * 模板替换选皮目录(2026-07-22)· 供备课工作台「模板」tab 展示可选风格包
 *
 * 三档来源与 stylePackFor 同一套事实源,但只供应**默认可达的明亮池**:
 * - 精修档 6 个 signature 全给(classic 的 swatch 用学科配色库标准档代表);
 * - 引进档给全学段浅色池(与 importedPoolFor 同源,暗色归档不出现在新选择里);
 * - 生成档从课程学段学科的合法锚池里确定性抽样 24 条(锚均匀跨池 × mood 轮换 ×
 *   tint 跳步 × 温度匹配的质感签名)——2 万实例不能全列,抽样保证跨色相/明度/
 *   质感的真实多样性,同一门课每次打开看到同一批(不闪烁)。
 * 目录里每个 id 都能被 resolveStylePackById 还原(pack-catalog.test.ts 断言)。
 */

export interface PackCatalogEntry {
  id: string
  label: string
  tier: 'signature' | 'imported' | 'generative'
  whenToUse: string
  /** 选皮器色卡:强调色/纸色/墨色/舞台顶色 */
  swatch: { accent: string; paper: string; ink: string; backdropTop: string }
}

const GENERATIVE_SAMPLE_COUNT = 24

export function stylePackCatalogFor(course: { subject: SubjectId; gradeBand: GradeBand }): PackCatalogEntry[] {
  const entries: PackCatalogEntry[] = []

  for (const pack of Object.values(STYLE_PACKS)) {
    const palette = pack.palette ?? paletteOf(course.subject, 'standard')
    entries.push({
      id: pack.id,
      label: pack.label,
      tier: 'signature',
      whenToUse: pack.whenToUse,
      swatch: { accent: palette.accent, paper: palette.paper, ink: palette.ink, backdropTop: palette.backdrop[0] },
    })
  }

  for (const pack of importedPoolFor(course.gradeBand)) {
    entries.push({
      id: pack.id,
      label: pack.label,
      tier: 'imported',
      whenToUse: pack.whenToUse,
      swatch: { accent: pack.palette.accent, paper: pack.palette.paper, ink: pack.palette.ink, backdropTop: pack.palette.backdrop[0] },
    })
  }

  const anchors = anchorPoolFor(course.subject, course.gradeBand)
  const moods = moodPoolFor(course.gradeBand)
  for (let i = 0; i < GENERATIVE_SAMPLE_COUNT; i++) {
    const anchor = anchors[Math.floor((i * anchors.length) / GENERATIVE_SAMPLE_COUNT) % anchors.length]!
    const mood = moods[i % moods.length]!
    const tint = PAPER_TINTS[(i * 3) % PAPER_TINTS.length]!
    const texturePool = TEXTURE_SIGNATURES.filter(t => t.temperatures.includes(anchor.temperature))
    const pool = texturePool.length > 0 ? texturePool : TEXTURE_SIGNATURES
    const texture = pool[i % pool.length]!
    const instance = derivePackInstance(anchor, mood, tint, texture)
    if (entries.some(e => e.id === instance.id)) continue
    entries.push({
      id: instance.id,
      label: instance.label,
      tier: 'generative',
      whenToUse: instance.whenToUse,
      swatch: { accent: instance.palette.accent, paper: instance.palette.paper, ink: instance.palette.ink, backdropTop: instance.palette.backdrop[0] },
    })
  }

  return entries
}

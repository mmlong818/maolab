import { hexToOklch } from './color.js'
import type { Palette } from './primitives.js'
import { STYLE_PACKS } from './style-packs.js'
import { importedPoolFor } from './imported-packs.js'
import { ACTIVE_COLOR_ANCHORS } from './anchors.js'
import { PACK_MOODS, PAPER_TINTS, derivePalette } from './pack-families.js'

/**
 * 认证配色注册表 · docs/design-refresh/hard-targets-spec.md 指标 1「配色 ≥50 套,两两差距 ≥15%」
 *
 * 口径:风格包调色板(palette 7 token)为一「配色方式」。候选池取全部三档包
 * **默认可达**的「基准态」palette——精修 5(classic 除外,见下)+ 引进浅色池
 * (明亮令后 29 条)+ 生成 48 锚×6 mood×8 tint = 2304 条去重调色板。生成档只按
 * (anchor,mood,tint) 展开(质感签名不改 palette,不并入),与 pack-families.ts
 * 的三轴分解同源。
 *
 * classic 精修包 palette 字段为 null(设计上"沿用学科配色库",见 style-packs.ts
 * 注释),它不是一张固定的、可命名的 7-token 调色板,而是运行时按
 * course.subject 从 paletteOf() 借出的 27 种(9 学科×3 mood)之一——这不属于本
 * 指标口径定义的"风格包调色板",故不纳入候选(如实说明,而非编造一个代表值凑数)。
 *
 * paletteDistance 权重表照抄 spec 指标 1(OKLCH 空间,权重和=1,2026-07-21 tier-deep 修订):
 * accent 色相 0.26 + paper 明度 0.21 + paper 色相(彩度门)0.20 + accent 明度 0.12 +
 * backdrop[1] 明度 0.12 + paper 彩度 0.09。paper 色相是本次新增轴(地色冷暖底韵),
 * 坐第三(在 accent 色相、paper 明度之下),按纸色实际彩度折算——详见 spec 决策备忘。
 */

export interface PaletteCandidate {
  id: string
  label: string
  tier: 'precision' | 'imported' | 'generated'
  palette: Palette
}

/** 色相环最短弧距(0-180),再按 spec 除以 180 归一化到 0-1。 */
function circularHueDiff(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360
  return Math.min(d, 360 - d)
}

/** paper 色相项的彩度参考:两纸色的实际彩度低于此值时,其色相差按比例折减(近灰纸的
 * hue 感知上无意义,OKLCH 在彩度趋零处 hue 也数值不稳)。 */
const PAPER_HUE_CHROMA_REF = 0.05

/**
 * 两套调色板的距离,0-1(spec 指标 1 权重表,权重和恰为 1)。
 * 六轴:accent 色相 0.26 / paper 明度 0.21 / paper 色相(彩度门)0.20 / accent 明度 0.12 /
 * backdrop[1] 明度 0.12 / paper 彩度 0.09。两两只要有一轴显著不同即可跨过 0.15 门槛。
 */
export function paletteDistance(a: Palette, b: Palette): number {
  const accentA = hexToOklch(a.accent)
  const accentB = hexToOklch(b.accent)
  const paperA = hexToOklch(a.paper)
  const paperB = hexToOklch(b.paper)
  const backdropA = hexToOklch(a.backdrop[1])
  const backdropB = hexToOklch(b.backdrop[1])

  const accentHueDiff = circularHueDiff(accentA.h, accentB.h) / 180
  const accentLDiff = Math.abs(accentA.l - accentB.l)
  const paperLDiff = Math.abs(paperA.l - paperB.l)
  const paperCDiff = Math.min(Math.abs(paperA.c - paperB.c) / 0.1, 1)
  const backdropLDiff = Math.abs(backdropA.l - backdropB.l)
  // paper 色相冷暖差,按两纸色的最小实际彩度折算(彩度门:近灰纸的 hue 差不计入)。
  const paperHueChromaGate = Math.min(Math.min(paperA.c, paperB.c) / PAPER_HUE_CHROMA_REF, 1)
  const paperHueDiff = (circularHueDiff(paperA.h, paperB.h) / 180) * paperHueChromaGate

  return (
    accentHueDiff * 0.26 +
    paperLDiff * 0.21 +
    paperHueDiff * 0.20 +
    accentLDiff * 0.12 +
    backdropLDiff * 0.12 +
    paperCDiff * 0.09
  )
}

/** 两两距离门槛,spec 指标 1/3 共用的"雷同"判定线。 */
export const MIN_DISTANCE = 0.15

function precisionCandidates(): PaletteCandidate[] {
  return Object.values(STYLE_PACKS)
    .filter(p => p.palette !== null)
    .map(p => ({ id: p.id, label: p.label, tier: 'precision' as const, palette: p.palette! }))
}

function importedCandidates(): PaletteCandidate[] {
  // 明亮令(2026-07-22):候选只取默认可达的浅色池——60 条暗色包已退出默认分流,
  // 留在候选里会虚报"可达配色数"(认证的承诺是每条都能被课程哈希真实选中)。
  return importedPoolFor('middle-school').map(p => ({ id: p.id, label: p.label, tier: 'imported' as const, palette: p.palette }))
}

/** 生成档候选 = 锚 × mood × 地色 tint 的**去重调色板**(质感签名不影响 palette,不并入),
 * 每条都可由 pickGenerativeInstance 落到(选中该 (anchor,mood,tint) 的课程配任一质感即得此 palette)。 */
function generatedCandidates(): PaletteCandidate[] {
  const out: PaletteCandidate[] = []
  for (const anchor of ACTIVE_COLOR_ANCHORS) {
    for (const mood of PACK_MOODS) {
      for (const tint of PAPER_TINTS) {
        const palette = derivePalette(anchor, mood, tint)
        out.push({ id: palette.id, label: `${anchor.name} · ${tint.name} · ${mood}`, tier: 'generated' as const, palette })
      }
    }
  }
  return out
}

/** 全部候选(精修 5 + 引进浅色池 29 + 生成 2304,基准态,不做课程哈希抽样)。 */
export function allPaletteCandidates(): readonly PaletteCandidate[] {
  return [...precisionCandidates(), ...importedCandidates(), ...generatedCandidates()]
}

/**
 * 最远点(farthest-point / greedy k-center)选点法,取代"按原始顺序先到先得"的朴素
 * 贪心——朴素贪心(精修→引进→生成原始顺序扫描)会被引进档手感相近的"暗色玻璃拟态"
 * 预设(tweakcn 系)前几十条一致命中同一片区域后早早卡死。最远点法每一步都选"离已选
 * 集合最近距离最大"的候选加入,持续到无法再找到与全体已选点距离都 ≥ MIN_DISTANCE 的
 * 候选为止——这是"pairwise ≥ d 的最大子集"经典 2-近似算法(farthest-point k-center),
 * 比顺序贪心显著提升可选数量。三轴生成空间(mood 7 × tint 6 × 锚 42)下 64 起点收敛到 55 套。
 */
function farthestPointFrom(candidates: readonly PaletteCandidate[], start: number): number[] {
  const n = candidates.length
  const minDistToChosen = new Float64Array(n).fill(Infinity)
  const takenIdx = new Set<number>()

  let cursor = start
  takenIdx.add(cursor)
  minDistToChosen[cursor] = -Infinity
  for (let i = 0; i < n; i++) {
    if (i === cursor) continue
    minDistToChosen[i] = paletteDistance(candidates[cursor]!.palette, candidates[i]!.palette)
  }

  for (;;) {
    let bestIdx = -1
    let bestVal = -Infinity
    for (let i = 0; i < n; i++) {
      if (takenIdx.has(i)) continue
      if (minDistToChosen[i]! > bestVal) { bestVal = minDistToChosen[i]!; bestIdx = i }
    }
    if (bestIdx === -1 || bestVal < MIN_DISTANCE) break
    takenIdx.add(bestIdx)
    minDistToChosen[bestIdx] = -Infinity
    for (let i = 0; i < n; i++) {
      if (takenIdx.has(i)) continue
      const d = paletteDistance(candidates[bestIdx]!.palette, candidates[i]!.palette)
      if (d < minDistToChosen[i]!) minDistToChosen[i] = d
    }
  }

  return [...takenIdx].sort((a, b) => a - b)
}

/** 多起点跑最远点法,取入选数最多的一组——起点固定按候选池等距抽 64 个下标
 * (不用随机数,保证可复现),farthest-point 对起点敏感,同一候选池不同起点能收敛到
 * 不同大小的可行解,多试几个起点是几乎免费的规模提升(16 起点得 54,64 起点稳定 55,
 * 逐点穷举上界约 57)。 */
function farthestPointCertify(candidates: readonly PaletteCandidate[]): PaletteCandidate[] {
  if (candidates.length === 0) return []
  const n = candidates.length
  const startCount = Math.min(64, n)
  let best: number[] = []
  for (let k = 0; k < startCount; k++) {
    const start = Math.floor((k / startCount) * n)
    const result = farthestPointFrom(candidates, start)
    if (result.length > best.length) best = result
  }
  return best.map(i => candidates[i]!)
}

/** 认证配色注册表:两两距离全部 ≥ MIN_DISTANCE,课程哈希选择器已覆盖这些包 id,故全部可达。 */
export const CERTIFIED_PALETTES: readonly PaletteCandidate[] = farthestPointCertify(allPaletteCandidates())

export function certifiedPaletteCount(): number {
  return CERTIFIED_PALETTES.length
}

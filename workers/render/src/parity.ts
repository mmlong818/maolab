// 截图度量对拍（3b 验收"与 maolab 同一页面同一视口一致"）。五项度量，容差写死；visualElementCount 与舞台尺寸不比（舞台尺寸已由门禁本身卡死）。
import type { ProjectionRenderMetrics } from '@maolab/course'

export const PARITY_TOLERANCE = { minimumFontPx: 0.5, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, occupiedAreaRatio: 0.02 } as const
type ParityMetric = keyof typeof PARITY_TOLERANCE

export function compareMetrics(baseline: ProjectionRenderMetrics, candidate: ProjectionRenderMetrics): string[] {
  const differences: string[] = []
  for (const key of Object.keys(PARITY_TOLERANCE) as ParityMetric[]) {
    const a = baseline[key]
    const b = candidate[key]
    if (a === null || b === null) {
      if (a !== b) differences.push(`${key}: 基线 ${a}，候选 ${b}`)
      continue
    }
    if (Math.abs(a - b) > PARITY_TOLERANCE[key] + 1e-9) differences.push(`${key}: 基线 ${a}，候选 ${b}，容差 ${PARITY_TOLERANCE[key]}`)
  }
  return differences
}

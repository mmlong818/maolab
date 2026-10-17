import type { PageRenderEvidence, PageRenderIssue } from './generation-session.js'

export interface ProjectionRenderMetrics {
  stageWidth: number
  stageHeight: number
  minimumFontPx: number | null
  clippedElementCount: number
  overlappingTextCount: number
  brokenImageCount: number
  visualElementCount: number
  occupiedAreaRatio: number
}

export function renderIssues(metrics: ProjectionRenderMetrics, options: { visualRequired?: boolean } = {}): PageRenderIssue[] {
  const issues: PageRenderIssue[] = []
  if (Math.round(metrics.stageWidth) !== 1920 || Math.round(metrics.stageHeight) !== 1080) {
    issues.push({ code: 'stage-size', severity: 'blocking', message: `投影片实际尺寸为 ${Math.round(metrics.stageWidth)}x${Math.round(metrics.stageHeight)}，不是 1920x1080。` })
  }
  if (metrics.minimumFontPx !== null && metrics.minimumFontPx < 20) {
    issues.push({ code: 'font-size', severity: 'blocking', message: `学生可见文字最小 ${metrics.minimumFontPx.toFixed(1)}px，低于 20px 下限。` })
  }
  if (metrics.clippedElementCount > 0) {
    issues.push({ code: 'clipping', severity: 'blocking', message: `${metrics.clippedElementCount} 个可见内容元素超出投影片或自身发生裁切。` })
  }
  if (metrics.overlappingTextCount > 0) {
    issues.push({ code: 'text-overlap', severity: 'blocking', message: `${metrics.overlappingTextCount} 组学生文字发生非包含式重叠。` })
  }
  if (metrics.brokenImageCount > 0) {
    issues.push({ code: 'broken-image', severity: 'blocking', message: `${metrics.brokenImageCount} 张页面图片加载失败。` })
  }
  if (options.visualRequired && metrics.visualElementCount === 0) {
    issues.push({ code: 'missing-visual', severity: 'blocking', message: '页面规划要求提供教学图像或可视化，但真实画面中没有可检查的视觉对象。' })
  }
  if (metrics.occupiedAreaRatio < 0.08) {
    issues.push({ code: 'sparse-layout', severity: 'warning', message: `有效内容仅覆盖约 ${(metrics.occupiedAreaRatio * 100).toFixed(0)}% 的画面，请人工确认留白是否服务于教学。` })
  }
  return issues
}

export function evidenceBlocksPage(evidence: Pick<PageRenderEvidence, 'issues'>): boolean {
  return evidence.issues.some(issue => issue.severity === 'blocking')
}

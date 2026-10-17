import { describe, expect, it } from 'vitest'
import { evidenceBlocksPage, renderIssues } from '../generation-render-evidence.js'

describe('generation render evidence', () => {
  it('blocks unreadable, clipped, overlapping or broken projection output', () => {
    const issues = renderIssues({
      stageWidth: 1920,
      stageHeight: 1080,
      minimumFontPx: 18,
      clippedElementCount: 1,
      overlappingTextCount: 2,
      brokenImageCount: 1,
      visualElementCount: 0,
      occupiedAreaRatio: 0.3,
    })
    expect(issues.map(issue => issue.code)).toEqual(['font-size', 'clipping', 'text-overlap', 'broken-image'])
    expect(evidenceBlocksPage({ issues })).toBe(true)
  })

  it('keeps extreme whitespace as a human-review warning instead of inventing a hard layout rule', () => {
    const issues = renderIssues({
      stageWidth: 1920,
      stageHeight: 1080,
      minimumFontPx: 28,
      clippedElementCount: 0,
      overlappingTextCount: 0,
      brokenImageCount: 0,
      visualElementCount: 0,
      occupiedAreaRatio: 0.05,
    })
    expect(issues).toEqual([expect.objectContaining({ code: 'sparse-layout', severity: 'warning' })])
    expect(evidenceBlocksPage({ issues })).toBe(false)
  })

  it('blocks a planned visual page when the rendered slide has no inspectable visual', () => {
    const issues = renderIssues({
      stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28,
      clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0,
      visualElementCount: 0, occupiedAreaRatio: 0.3,
    }, { visualRequired: true })
    expect(issues).toEqual([expect.objectContaining({ code: 'missing-visual', severity: 'blocking' })])
  })
})

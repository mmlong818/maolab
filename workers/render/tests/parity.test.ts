import { expect, test } from 'vitest'
import { compareMetrics, PARITY_TOLERANCE } from '../src/parity.ts'

const base = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.3 }

test('tolerances are fixed: font size within half a pixel, counts exact, occupied area within two points', () => {
  expect(PARITY_TOLERANCE).toEqual({ minimumFontPx: 0.5, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, occupiedAreaRatio: 0.02 })
  expect(compareMetrics(base, { ...base, minimumFontPx: 28.4, occupiedAreaRatio: 0.315, visualElementCount: 3 })).toEqual([])
  expect(compareMetrics(base, { ...base, minimumFontPx: 28.6 })).toHaveLength(1)
  expect(compareMetrics(base, { ...base, clippedElementCount: 1, overlappingTextCount: 2 })).toHaveLength(2)
  expect(compareMetrics(base, { ...base, brokenImageCount: 1, occupiedAreaRatio: 0.33 })).toHaveLength(2)
  expect(compareMetrics(base, { ...base, minimumFontPx: null })).toEqual([expect.stringContaining('minimumFontPx')])
})

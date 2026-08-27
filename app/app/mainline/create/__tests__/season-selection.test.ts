import { describe, expect, it } from 'vitest'
import {
  compatibleSeasons,
  defaultSeasonDraft,
  gradeBandFromPick,
  seasonFitsPick,
  subjectFromPick,
  type SeasonSummary,
} from '../season-selection.js'
import type { TextbookPick } from '../../../(setup)/create/TextbookPicker.js'

function pick(overrides: Partial<TextbookPick> = {}): TextbookPick {
  return {
    textbookId: 'book-1',
    textbookTitle: '语文',
    stage: '初中',
    subject: '语文',
    version: '统编版',
    grade: '七年级',
    volume: '上册',
    ...overrides,
  }
}

function season(overrides: Partial<SeasonSummary> = {}): SeasonSummary {
  return {
    id: 'season-1',
    title: '文体侦探社',
    subject: 'chinese',
    gradeBand: 'middle-school',
    seasonTheme: '拆解每一种文体的秘密结构',
    episodeCount: 1,
    nextEpisodeNo: 2,
    openHooks: [],
    ...overrides,
  }
}

describe('mainline create season selection', () => {
  it('maps textbook pick to mainline subject and gradeBand', () => {
    expect(subjectFromPick(pick({ subject: '物理' }))).toBe('physics')
    expect(subjectFromPick(pick({ subject: '未知学科' }))).toBe('general')
    expect(gradeBandFromPick(pick({ stage: '小学' }))).toBe('upper-primary')
    expect(gradeBandFromPick(pick({ stage: '初中' }))).toBe('middle-school')
    expect(gradeBandFromPick(pick({ stage: '高中' }))).toBe('high-school')
  })

  it('only offers seasons matching both subject and gradeBand', () => {
    const current = pick({ subject: '语文', stage: '初中' })
    expect(seasonFitsPick(season({ subject: 'chinese', gradeBand: 'middle-school' }), current)).toBe(true)
    expect(seasonFitsPick(season({ subject: 'history', gradeBand: 'middle-school' }), current)).toBe(false)
    expect(seasonFitsPick(season({ subject: 'chinese', gradeBand: 'upper-primary' }), current)).toBe(false)

    const matches = compatibleSeasons([
      season({ id: 'a', subject: 'chinese', gradeBand: 'middle-school' }),
      season({ id: 'b', subject: 'history', gradeBand: 'middle-school' }),
      season({ id: 'c', subject: 'chinese', gradeBand: 'high-school' }),
    ], current)
    expect(matches.map(s => s.id)).toEqual(['a'])
  })

  it('creates a deterministic draft for new season requests', () => {
    const draft = defaultSeasonDraft(pick({ subject: '地理', stage: '初中', textbookTitle: '地理七上', grade: '七年级', volume: '上册' }))
    expect(draft).toMatchObject({
      title: '地理七年级连续课',
      seasonTheme: '地理七上 · 七年级上册的连续学习线索',
      subject: 'geography',
      gradeBand: 'middle-school',
    })
  })

  it('keeps default season payload within API length limits', () => {
    const draft = defaultSeasonDraft(pick({
      subject: '语文',
      textbookTitle: '新教材-统编版语文七年级上册第一单元超长标题用于验证课程季主题不会超过接口限制',
      grade: '七年级',
      volume: '上册',
    }))
    expect(draft.title.length).toBeLessThanOrEqual(40)
    expect(draft.seasonTheme.length).toBeLessThanOrEqual(80)
  })
})

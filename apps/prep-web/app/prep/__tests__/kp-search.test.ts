import { expect, test } from 'vitest'
import { choiceOf, DEFAULT_BAND, searchQueryOf, subjectsOf } from '../lib/kp-search'

const facets = { datasetVersion: 'v', gradeBands: [{ gradeBand: '小学', subjects: ['数学', '语文'] }, { gradeBand: '初中', subjects: ['物理', '语文'] }] }

test('subjects follow the chosen band; an unknown band has none', () => {
  expect(subjectsOf(facets, '初中')).toEqual(['物理', '语文'])
  expect(subjectsOf(facets, '大学')).toEqual([])
  expect(subjectsOf(null, '初中')).toEqual([])
  expect(DEFAULT_BAND).toBe('初中')
})

test('a search needs a keyword or a subject (a band alone would list a whole band); the keyword is trimmed and capped', () => {
  expect(searchQueryOf({ q: '  ', band: '初中', subject: '' })).toBeNull()
  expect(searchQueryOf({ q: ' 二力 ', band: '初中', subject: '' })).toEqual({ q: '二力', gradeBand: '初中' })
  expect(searchQueryOf({ q: '', band: '初中', subject: '物理' })).toEqual({ q: '', gradeBand: '初中', subject: '物理' })
  expect(searchQueryOf({ q: '长'.repeat(100), band: '', subject: '' })!.q).toHaveLength(80)
})

test('a search hit becomes the same choice shape the course is built from', () => {
  expect(choiceOf({ id: 'kp-1', name: '二力平衡', subject: '物理', gradeBand: '初中', summary: '' })).toEqual({ kpId: 'kp-1', canonicalName: '二力平衡', subject: '物理' })
})

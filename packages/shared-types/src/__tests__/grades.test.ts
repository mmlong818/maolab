import { expect, test } from 'vitest'
import { GRADES, ageBandFor, isGrade } from '../grades.js'
test('twelve grades, 初一 is 12–13', () => {
  expect(GRADES).toHaveLength(12)
  expect(ageBandFor('初一')).toBe('约 12–13 岁的学习语言难度')
  expect(ageBandFor('高三')).toBe('约 17–18 岁的学习语言难度')
  expect(isGrade('高一')).toBe(true)
  expect(isGrade('大一')).toBe(false)
})

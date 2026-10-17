import { expect, test } from 'vitest'
import { getToken } from '../src/auth/token.ts'

test('X-Session-Token wins, then ?token=, then Bearer', () => {
  expect(getToken({ headers: { 'x-session-token': ' abc ' }, query: { token: 'q' } })).toBe('abc')
  expect(getToken({ headers: {}, query: { token: 'q' } })).toBe('q')
  expect(getToken({ headers: { authorization: 'Bearer b' }, query: {} })).toBe('b')
  expect(getToken({ headers: {}, query: {} })).toBe('')
})

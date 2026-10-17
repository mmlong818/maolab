import { expect, test } from 'vitest'
import { readConfig } from '../src/config.ts'

test('trustProxy defaults to 1, accepts a hop count, falls back to 1 when invalid', () => {
  expect(readConfig({ YUNYI_PREP: 'off' }).trustProxy).toBe(1)
  expect(readConfig({ YUNYI_PREP: 'off', API_TRUST_PROXY: '2' }).trustProxy).toBe(2)
  expect(readConfig({ YUNYI_PREP: 'off', API_TRUST_PROXY: 'abc' }).trustProxy).toBe(1)
  expect(readConfig({ YUNYI_PREP: 'off', API_TRUST_PROXY: '-3' }).trustProxy).toBe(1)
  expect(readConfig({ YUNYI_PREP: 'off', API_TRUST_PROXY: '1.5' }).trustProxy).toBe(1)
})

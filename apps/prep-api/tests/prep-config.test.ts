import { expect, test } from 'vitest'
import { readConfig, readHarnessConfig } from '../src/config.ts'
import { DEFAULT_PREP_TURN_TIMEOUT_MS, prepAllowed, readPrepConfig } from '../src/prep/config.ts'

const harnessOk = { YUNYI_HARNESS_URL: 'http://127.0.0.1:9', YUNYI_INTERNAL_KEY: 'k' }

test('defaults: all, 30-minute turns, course and kp schemas, images off, yunyi glm-5.3 agent model', () => {
  const c = readConfig(harnessOk).prep
  expect(c).toMatchObject({ mode: 'all', turnTimeoutMs: DEFAULT_PREP_TURN_TIMEOUT_MS, heartbeatMs: 15_000, courseSchema: 'course', knowledgeSchema: 'kp', imagesAvailable: false, provider: 'yunyi', model: 'glm-5.3' })
  expect(DEFAULT_PREP_TURN_TIMEOUT_MS).toBe(1_800_000)
  expect(readConfig({ ...harnessOk, YUNYI_TURN_TIMEOUT_MS: '180000' }).prep.turnTimeoutMs).toBe(1_800_000)
})

test('list mode only lets the listed usernames in; all lets every teacher in; off nobody', () => {
  const list = readConfig({ ...harnessOk, YUNYI_PREP: 'list', YUNYI_PREP_USERS: ' t1, t2 ,' }).prep
  expect([prepAllowed(list, 't1'), prepAllowed(list, 't2'), prepAllowed(list, 't3')]).toEqual([true, true, false])
  expect(prepAllowed(readConfig({ ...harnessOk, YUNYI_PREP: 'all' }).prep, 'anyone')).toBe(true)
  expect(prepAllowed(readConfig({ YUNYI_PREP: 'off' }).prep, 't1')).toBe(false)
})

test('invalid values fail startup; prep (the default) requires the harness url and internal key', () => {
  expect(() => readConfig({ YUNYI_PREP: 'gray' })).toThrow(/YUNYI_PREP/)
  expect(() => readConfig({})).toThrow(/YUNYI_HARNESS_URL/)
  expect(() => readConfig({ ...harnessOk, YUNYI_PREP_TURN_TIMEOUT_MS: '0' })).toThrow(/YUNYI_PREP_TURN_TIMEOUT_MS/)
  expect(() => readConfig({ ...harnessOk, YUNYI_COURSE_SCHEMA: 'bad-name' })).toThrow(/schema/)
  expect(() => readConfig({ ...harnessOk, YUNYI_HARNESS_TIMEOUT_MS: '-1' })).toThrow(/YUNYI_HARNESS_TIMEOUT_MS/)
})

test('schemas and images follow the harness variables (same names as the prep-harness profile)', () => {
  const harness = readHarnessConfig({})
  const c = readPrepConfig({ YUNYI_PREP: 'off', YUNYI_COURSE_SCHEMA: 'course_test_prep_x', YUNYI_PREP_KNOWLEDGE_SCHEMA: 'kn', YUNYI_PREP_IMAGE_MODEL: 'doubao-seedream-4-0-250828' }, harness)
  expect(c).toMatchObject({ courseSchema: 'course_test_prep_x', knowledgeSchema: 'kn', imagesAvailable: true })
  // 自习室的 YUNYI_KNOWLEDGE_SCHEMA 不影响备课室
  expect(readPrepConfig({ YUNYI_PREP: 'off', YUNYI_KNOWLEDGE_SCHEMA: 'knowledge' }, harness).knowledgeSchema).toBe('kp')
})

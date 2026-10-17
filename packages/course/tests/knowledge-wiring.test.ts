import { expect, test } from 'vitest'
import { loadCurrentKpGoalMetadata } from '../src/mainline/edit/kp-goal-loader.js'
import { resolveCurrentCourseGroundings } from '../src/mainline/edit/source-grounding-loader.js'
import { fetchKpMetadata } from '../src/mainline/kp-metadata.js'
import { GOLDEN_MAINLINE_COURSES } from '../src/mainline/samples.js'
import type { CourseKnowledgePort } from '../src/ports.js'

const calls: string[][] = []
const knowledge: CourseKnowledgePort = {
  async knowledgePoints(ids) {
    calls.push([...ids])
    return ids.includes('kp-1')
      ? [{ id: 'kp-1', canonical_name: '静夜思', subject: '语文', grade_band: '小学', annotations: JSON.stringify({ knowledgeType: { value: 'conceptual' }, learningObjectives: { value: ['能说出月光引起的思乡之情', ' '] }, misconceptions: { value: ['把"床"理解为卧床'] } }) }]
      : []
  },
  async knowledgePointSources(ids) {
    calls.push([...ids])
    return ids.includes('kp-1') ? [{ knowledgePointId: 'kp-1', source: 'textbook-body', externalId: 'pep-chinese-1b-8', evidenceSnippet: '床前明月光，疑是地上霜。', confidence: 0.9 }] : []
  },
}
const course = { ...structuredClone(GOLDEN_MAINLINE_COURSES[0]!), sourceMaterial: [{ kind: 'textbook' as const, title: '静夜思', kpId: 'kp-1' }, { kind: 'textbook' as const, title: '无知识点的材料' }] }

test('kp metadata parses annotations from the port with the migrated parser', async () => {
  const metadata = await fetchKpMetadata(['kp-1', 'kp-missing'], knowledge)
  expect([...metadata.keys()]).toEqual(['kp-1'])
  expect(metadata.get('kp-1')).toMatchObject({ canonicalName: '静夜思', knowledgeType: 'conceptual', learningObjectives: ['能说出月光引起的思乡之情'] })
  expect((await fetchKpMetadata([], knowledge)).size).toBe(0)
})

test('kp goal loader is async and only asks for the course kps', async () => {
  calls.length = 0
  const goals = await loadCurrentKpGoalMetadata(course, knowledge)
  expect(calls).toEqual([['kp-1']])
  expect(goals['kp-1']).toEqual({ id: 'kp-1', canonicalName: '静夜思', learningObjectives: ['能说出月光引起的思乡之情'] })
})

test('source grounding uses the port and degrades without the resource bundle', async () => {
  const result = await resolveCurrentCourseGroundings(course, knowledge, { loadBundle: async () => { throw new Error('教育资源包未配置') } })
  expect(result.coverage.resourceCatalogAvailable).toBe(false)
  expect(Object.keys(result.byKp)).toEqual(['kp-1'])
})

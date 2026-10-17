import { expect, test, vi } from 'vitest'

// 终审：不给 loadBundle 时也不能回退到读文件系统/环境变量的 loadEducationResourceBundle（3c 的 repair 路径会直接调用这个 loader）
const fsLoader = vi.hoisted(() => vi.fn(async () => { throw new Error('不应读取文件系统资源包') }))
vi.mock('../src/education-resources/catalog.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/education-resources/catalog.js')>()),
  loadEducationResourceBundle: fsLoader,
}))

const { resolveCurrentCourseGroundings } = await import('../src/mainline/edit/source-grounding-loader.js')
const { GOLDEN_MAINLINE_COURSES } = await import('../src/mainline/samples.js')

test('source grounding without options treats the resource bundle as unavailable instead of probing the filesystem', async () => {
  const knowledge = {
    knowledgePoints: async () => [],
    knowledgePointSources: async () => [{ knowledgePointId: 'kp-1', source: 'textbook-body', externalId: 'pep-chinese-1b-8', evidenceSnippet: '床前明月光，疑是地上霜。', confidence: 0.9 }],
  }
  const course = { ...structuredClone(GOLDEN_MAINLINE_COURSES[0]!), sourceMaterial: [{ kind: 'textbook' as const, title: '静夜思', kpId: 'kp-1' }] }
  const withKps = await resolveCurrentCourseGroundings(course, knowledge)
  expect(withKps.coverage.resourceCatalogAvailable).toBe(false)
  expect(Object.keys(withKps.byKp)).toEqual(['kp-1'])
  const empty = await resolveCurrentCourseGroundings({ ...course, sourceMaterial: [] }, knowledge)
  expect(empty.coverage.resourceCatalogAvailable).toBe(false)
  expect(fsLoader).not.toHaveBeenCalled()
})

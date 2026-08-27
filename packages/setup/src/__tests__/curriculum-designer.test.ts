import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CurriculumDesigner } from '../curriculum-designer.js'

interface OutlineFixture {
  title: string
  teachingModeId: string
  objective: string
  durationHint: number
  rationale: string
}

function buildOutline(modeIdForAll: string): OutlineFixture[] {
  return [
    { title: '第一节', teachingModeId: modeIdForAll, objective: '建立基础', durationHint: 120, rationale: '入门' },
    { title: '第二节', teachingModeId: modeIdForAll, objective: '深入理解', durationHint: 180, rationale: '展开' },
    { title: '第三节', teachingModeId: modeIdForAll, objective: '应用', durationHint: 150, rationale: '练习' },
    { title: '第四节', teachingModeId: modeIdForAll, objective: '检验', durationHint: 120, rationale: '评估' },
  ]
}

function mockLLM(payload: object) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  }
}

describe('CurriculumDesigner', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockFetch.mockReset()
  })

  it('overrides teachingModeId with rule for procedural → lecture-diagram', async () => {
    mockFetch.mockResolvedValueOnce(mockLLM({
      topic: '光合作用步骤',
      targetAudience: '高中生',
      language: 'zh',
      difficulty: 'beginner',
      knowledgeAnalysis: {
        primaryType: 'procedural',
        bloomsLevel: 'understand',
        reasoning: '步骤型流程',
      },
      // LLM 故意给一个不匹配的 mode，验证服务端覆写
      outline: buildOutline('interactive-quiz'),
      totalDurationHint: 570,
      reasoning: '程序性知识',
    }))

    const designer = new CurriculumDesigner({ apiKey: 'k', model: 'm', baseURL: 'https://api.example.com/v1' })
    const result = await designer.design('光合作用', '高中生', 'zh')

    expect(result.outline).toHaveLength(4)
    for (const item of result.outline) {
      expect(item.teachingModeId).toBe('lecture-diagram')
    }
  })

  it('overrides teachingModeId with rule for factual → lecture-image', async () => {
    mockFetch.mockResolvedValueOnce(mockLLM({
      topic: '元素周期表',
      targetAudience: '初中生',
      language: 'zh',
      difficulty: 'beginner',
      knowledgeAnalysis: {
        primaryType: 'factual',
        bloomsLevel: 'remember',
        reasoning: '事实记忆',
      },
      outline: buildOutline('socratic-dialogue'),
      totalDurationHint: 480,
      reasoning: '事实性知识',
    }))

    const designer = new CurriculumDesigner({ apiKey: 'k', model: 'm', baseURL: 'https://api.example.com/v1' })
    const result = await designer.design('元素周期表', '初中生', 'zh')

    for (const item of result.outline) {
      expect(item.teachingModeId).toBe('lecture-image')
    }
  })

  it('downgrades first conceptual scene without prior scaffold to lecture-image, later scenes use socratic-dialogue', async () => {
    mockFetch.mockResolvedValueOnce(mockLLM({
      topic: '熵的概念',
      targetAudience: '高中生',
      language: 'zh',
      difficulty: 'intermediate',
      knowledgeAnalysis: {
        primaryType: 'conceptual',
        bloomsLevel: 'understand',
        reasoning: '抽象概念',
      },
      outline: buildOutline('lecture-animation'),
      totalDurationHint: 570,
      reasoning: '概念性知识',
    }))

    const designer = new CurriculumDesigner({ apiKey: 'k', model: 'm', baseURL: 'https://api.example.com/v1' })
    const result = await designer.design('熵', '高中生', 'zh')

    const modes = result.outline.map(o => o.teachingModeId)
    expect(modes).toEqual([
      'lecture-image',
      'socratic-dialogue',
      'socratic-dialogue',
      'socratic-dialogue',
    ])
  })

  it('rejects LLM payloads with invalid teachingModeId (Zod still guards input)', async () => {
    mockFetch.mockResolvedValueOnce(mockLLM({
      topic: 'X',
      targetAudience: 'Y',
      language: 'zh',
      difficulty: 'beginner',
      knowledgeAnalysis: { primaryType: 'factual', bloomsLevel: 'remember', reasoning: 'r' },
      outline: [
        { title: 'a', teachingModeId: 'not-a-real-mode', objective: 'o', durationHint: 100, rationale: 'r' },
        { title: 'b', teachingModeId: 'lecture-image', objective: 'o', durationHint: 100, rationale: 'r' },
        { title: 'c', teachingModeId: 'lecture-image', objective: 'o', durationHint: 100, rationale: 'r' },
        { title: 'd', teachingModeId: 'lecture-image', objective: 'o', durationHint: 100, rationale: 'r' },
      ],
      totalDurationHint: 400,
      reasoning: 'r',
    }))

    const designer = new CurriculumDesigner({ apiKey: 'k', model: 'm', baseURL: 'https://api.example.com/v1' })
    await expect(designer.design('x', 'y', 'zh')).rejects.toThrow(/invalid response schema/)
  })

  it('throws on LLM API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const designer = new CurriculumDesigner({ apiKey: 'x', model: 'qwen-plus' })
    await expect(designer.design('test', 'adults', 'en')).rejects.toThrow('CurriculumDesigner: LLM API error 500')
  })
})

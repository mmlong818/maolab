import { describe, expect, it } from 'vitest'
import { shouldUseConceptVisual } from '../concept-visual-triggers.js'
import { canRenderEducationalVisual } from '../EducationalVisual.js'

describe('concept-visual-triggers 与闸门共用的单一真相源', () => {
  it('显式 visualSpec 无条件判定为结构化承载', () => {
    expect(shouldUseConceptVisual({
      caption: '随便什么文本',
      visualSpec: { kind: 'concept-map', subject: '燃烧三要素', nodes: [{ id: 'a', label: '可燃物' }, { id: 'c', label: '燃烧' }], links: [{ from: 'a', to: 'c' }] },
    })).toBe(true)
  })

  it('round04 假阳性案例: 燃烧三角形文案命中播放端触发器(闸门委托同一函数后不再漂移)', () => {
    expect(shouldUseConceptVisual({
      caption: '燃烧三角形缺一个顶点就坍塌——破坏一个，就能灭火。',
    })).toBe(true)
  })

  it('纯叙事文本不触发结构化承载', () => {
    expect(shouldUseConceptVisual({ caption: '深夜里烛光摇曳' })).toBe(false)
  })
})

describe('canRenderEducationalVisual 覆盖全部 LLM 可产出的 spec kind', () => {
  it('concept-map / data-chart / math-model / experiment-board / worked-example-board 均可渲染', () => {
    expect(canRenderEducationalVisual({ kind: 'concept-map', subject: 's', nodes: [], links: [] })).toBe(true)
    expect(canRenderEducationalVisual({ kind: 'data-chart', chart: 'bar', data: [] })).toBe(true)
    expect(canRenderEducationalVisual({ kind: 'math-model', model: 'number-line', values: {} })).toBe(true)
    expect(canRenderEducationalVisual({ kind: 'experiment-board', objects: [], conditions: [], observations: [] })).toBe(true)
    expect(canRenderEducationalVisual({ kind: 'worked-example-board', problem: 'p', known: [], goal: 'g', steps: [] })).toBe(true)
  })

  it('supporting-illustration(装饰图)不算结构化渲染器, 不能亮内部占位文案', () => {
    expect(canRenderEducationalVisual({ kind: 'supporting-illustration', decorKind: 'notebook', cue: 'c', style: 's' })).toBe(false)
  })
})

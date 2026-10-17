import { describe, expect, it } from 'vitest'
import { parseKpDimensions } from '../kp-dimensions.js'

describe('knowledge point annotations', () => {
  it('does not publish model-authored misconception candidates as student pages', () => {
    expect(parseKpDimensions(JSON.stringify({
      knowledgeType: { value: 'conceptual', source: 'llm' },
      learningObjectives: { value: ['能解释核心概念'], source: 'llm' },
      misconceptions: { value: ['未经教研确认的错误说法'], source: 'llm' },
    }))).toEqual({
      knowledgeType: 'conceptual',
      learningObjectives: ['能解释核心概念'],
    })
  })

  it('keeps teacher-reviewed misconceptions for explicit question and response pages', () => {
    expect(parseKpDimensions(JSON.stringify({
      misconceptions: { value: ['已由教师确认的典型误区'], source: 'teacher-reviewed' },
    }))).toEqual({ misconceptions: ['已由教师确认的典型误区'] })
  })
})

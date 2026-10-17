import { describe, it, expect } from 'vitest'
import type { GradeBand, SubjectId } from '../../domain.js'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import { imageDirectives, imageFidelityFor } from '../image-fidelity.js'

function makeCourse(gradeBand: GradeBand, subject: SubjectId) {
  const { preset } = pickCastPreset({ gradeBand, subject })
  return compileLessonFromKps({
    kps: [{
      id: 'kp-a',
      canonicalName: '示例知识点',
      misconceptions: ['把一个表面特征当成概念成立的充分条件'],
    }],
    gradeBand,
    subject,
    preset,
  })
}

function sceneOf(course: ReturnType<typeof makeCourse>, sceneType: string) {
  const scene = course.scenes.find(s => s.sceneType === sceneType)
  if (!scene) throw new Error(`course has no ${sceneType} scene`)
  return scene
}

describe('imageFidelityFor', () => {
  it('高学段精度学科的观察/辨析幕要求准确图示', () => {
    const high = makeCourse('high-school', 'physics')
    expect(imageFidelityFor(high, sceneOf(high, 'visual-observation'))).toBe('diagram-accurate')
    const middle = makeCourse('middle-school', 'history')
    expect(imageFidelityFor(middle, sceneOf(middle, 'contrast'))).toBe('diagram-accurate')
  })

  it('低龄表达型学科的观察幕只做氛围配图', () => {
    const course = makeCourse('lower-primary', 'chinese')
    expect(imageFidelityFor(course, sceneOf(course, 'visual-observation'))).toBe('atmosphere')
  })

  it('低龄精度学科仍需对象保真(童趣呈现但数量形状不许错)', () => {
    const course = makeCourse('lower-primary', 'math')
    expect(imageFidelityFor(course, sceneOf(course, 'visual-observation'))).toBe('stylized-teaching')
  })

  it('辨析幕全线不低于风格化教学图:对错关系必须视觉可辨', () => {
    const course = makeCourse('lower-primary', 'chinese')
    expect(imageFidelityFor(course, sceneOf(course, 'contrast'))).not.toBe('atmosphere')
  })

  it('收束隐喻幕全线不出准确图示档:隐喻强行准确是自相矛盾', () => {
    const course = makeCourse('high-school', 'physics')
    expect(imageFidelityFor(course, sceneOf(course, 'recap'))).toBe('stylized-teaching')
  })
})

describe('imageDirectives', () => {
  it('约束块 = 保真档 + 学段视觉语言,且氛围档明示不是图表', () => {
    const young = makeCourse('lower-primary', 'chinese')
    const { fidelity, block } = imageDirectives(young, sceneOf(young, 'visual-observation'))
    expect(fidelity).toBe('atmosphere')
    expect(block).toContain('NOT a diagram')
    expect(block).toContain('6-8 year olds')

    const senior = makeCourse('high-school', 'physics')
    const directive = imageDirectives(senior, sceneOf(senior, 'visual-observation'))
    expect(directive.block).toContain('FACTUAL FIDELITY')
    expect(directive.block).toContain('15-18 year olds')
  })
})

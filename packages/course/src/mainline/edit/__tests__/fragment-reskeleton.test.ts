import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { reskeletonFragment } from '../fragment-reskeleton.js'
import type { MainlineCourse } from '../../domain.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  // conceptual 骨架:source-reading, visual-observation, concept-build, contrast, recap
  return compileLessonFromKps({
    kps: [{ id: 'kp-1', canonicalName: '消息文体特征' }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

describe('reskeletonFragment', () => {
  it('把 conceptual 片段换成 procedural:幕序列变成 concept-build + worked-example + practice', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const oldSceneIds = new Set(fragment.sceneIds)

    const result = reskeletonFragment(course, fragment.id, 'procedural')
    if ('error' in result) throw new Error('unexpected error')

    const updatedFragment = result.course.learningFragments.find(f => f.id === fragment.id)!
    expect(updatedFragment.skeletonId).toBe('frag-procedural')
    expect(updatedFragment.sceneIds).toHaveLength(3)
    expect(updatedFragment.sceneIds).toEqual(result.newSceneIds)

    const newScenes = result.course.scenes.filter(s => updatedFragment.sceneIds.includes(s.id))
    expect(newScenes.map(s => s.sceneType)).toEqual(['concept-build', 'worked-example', 'practice'])
    expect(newScenes.map(s => s.durationTargetSec)).toEqual([60, 60, 50])
    expect(updatedFragment.durationTargetSec).toBe(
      newScenes.reduce((sum, scene) => sum + (scene.durationTargetSec ?? 0), 0),
    )
    // 新 scene id 不与课程里既有 id 冲突
    newScenes.forEach(s => expect(oldSceneIds.has(s.id)).toBe(false))
  })

  it('旧场景从 scenes/beats 中整体移除,课程总幕数按新骨架变化', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const oldSceneIds = fragment.sceneIds

    const result = reskeletonFragment(course, fragment.id, 'procedural')
    if ('error' in result) throw new Error('unexpected error')

    oldSceneIds.forEach(id => {
      expect(result.course.scenes.some(s => s.id === id)).toBe(false)
      expect(result.course.beats.some(b => b.sceneId === id)).toBe(false)
    })
    // 全课幕数 = 原 5 幕 - 旧 3 幕(conceptual) + 新 3 幕(procedural 含讲授) = 5
    expect(result.course.scenes).toHaveLength(5)
    // 开场和收束不受影响,顺序保留
    expect(result.course.scenes[0]!.sceneType).toBe('source-reading')
    expect(result.course.scenes.at(-1)!.sceneType).toBe('recap')
  })

  it('课程 qualityStatus 回 draft,即使换骨架前是 passed', () => {
    const course = { ...makeCourse(), qualityStatus: 'passed' as const }
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const result = reskeletonFragment(course, fragment.id, 'factual')
    if ('error' in result) throw new Error('unexpected error')
    expect(result.course.qualityStatus).toBe('draft')
  })

  it('更新 teachingSkeleton.arc 对应片段那一段 + requiredVisualForms + knowledgeType', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const result = reskeletonFragment(course, fragment.id, 'procedural')
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.teachingSkeleton.arc[1]).toContain('讲授跟做')
    expect(result.course.teachingSkeleton.knowledgeType).toBe('procedural')
    expect(result.course.teachingSkeleton.requiredVisualForms).toContain('worked-steps')
  })

  it('课级片段(无 kpId,如开场/收束)不能换骨架', () => {
    const course = makeCourse()
    const introFragment = course.learningFragments.find(f => f.id === 'fragment-intro')!
    const result = reskeletonFragment(course, introFragment.id, 'conceptual')
    expect(result).toEqual({ error: expect.stringContaining('课级片段'), code: 'invalid' })
  })

  it('找不到片段时返回 not_found', () => {
    const course = makeCourse()
    const result = reskeletonFragment(course, 'no-such-fragment', 'conceptual')
    expect(result).toEqual({ error: expect.stringContaining('no-such-fragment'), code: 'not_found' })
  })

  it('清除被替换掉的旧 scene 在 factAudit 里的旧结论', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const staleSceneId = fragment.sceneIds[0]!
    const courseWithFatal: MainlineCourse = {
      ...course,
      factAudit: {
        auditedAt: new Date().toISOString(),
        auditedSceneCount: 1,
        fatalCount: 1,
        issues: [{ id: 'x', severity: 'blocking', targetId: staleSceneId, message: 'FATAL', impact: 'i', fix: 'f' }],
      },
    }
    const result = reskeletonFragment(courseWithFatal, fragment.id, 'procedural')
    if ('error' in result) throw new Error('unexpected error')
    expect(result.course.factAudit?.fatalCount).toBe(0)
  })
})

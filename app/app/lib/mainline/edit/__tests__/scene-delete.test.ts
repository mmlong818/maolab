import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { deleteSceneFromCourse } from '../scene-delete.js'
import type { MainlineCourse } from '../../domain.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  // 显式提供教研误区，保留四页概念片段来覆盖旧课均摊删页算法。
  return compileLessonFromKps({
    kps: [{
      id: 'kp-1',
      canonicalName: '消息文体特征',
      misconceptions: ['标题越长，消息提供的信息就一定越完整'],
    }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

describe('deleteSceneFromCourse', () => {
  it('拒绝删除开场幕(source-reading),给出可读理由', () => {
    const course = makeCourse()
    const intro = course.scenes.find(s => s.sceneType === 'source-reading')!
    const result = deleteSceneFromCourse(course, intro.id)
    expect(result).toEqual({ error: expect.stringContaining('开场幕'), code: 'structural' })
  })

  it('拒绝删除收束幕(recap),给出可读理由', () => {
    const course = makeCourse()
    const recap = course.scenes.find(s => s.sceneType === 'recap')!
    const result = deleteSceneFromCourse(course, recap.id)
    expect(result).toEqual({ error: expect.stringContaining('收束幕'), code: 'structural' })
  })

  it('拒绝删除片段的最后一幕', () => {
    const course = makeCourse()
    // 逐一删到只剩一幕，再确认最后一幕仍受片段结构保护。
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    let current = course
    for (const sceneId of fragment.sceneIds.slice(0, -1)) {
      const deleted = deleteSceneFromCourse(current, sceneId)
      if ('error' in deleted) throw new Error(`unexpected error deleting ${sceneId}`)
      current = deleted.course
    }

    const result = deleteSceneFromCourse(current, fragment.sceneIds.at(-1)!)
    expect(result).toEqual({ error: expect.stringContaining('最后一幕'), code: 'structural' })
  })

  it('删除中间幕:从 scenes/beats/fragment.sceneIds 三处一并移除,重跑闸门', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const targetId = fragment.sceneIds[0]!

    const result = deleteSceneFromCourse(course, targetId)
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.scenes.some(s => s.id === targetId)).toBe(false)
    expect(result.course.beats.some(b => b.sceneId === targetId)).toBe(false)
    const updatedFragment = result.course.learningFragments.find(f => f.id === fragment.id)!
    expect(updatedFragment.sceneIds).not.toContain(targetId)
    expect(updatedFragment.sceneIds.length).toBe(fragment.sceneIds.length - 1)
    expect(updatedFragment.durationTargetSec).toBe(fragment.durationTargetSec - 35)
  })

  it('存量课没有逐页时长时，删页按片段均值扣减总预算', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    for (const scene of course.scenes.filter(candidate => fragment.sceneIds.includes(candidate.id))) {
      delete scene.durationTargetSec
    }

    const result = deleteSceneFromCourse(course, fragment.sceneIds[0]!)
    if ('error' in result) throw new Error('unexpected error')
    const updatedFragment = result.course.learningFragments.find(f => f.id === fragment.id)!
    expect(updatedFragment.durationTargetSec).toBe(135)
  })

  it('找不到 scene 时返回 not_found', () => {
    const course = makeCourse()
    const result = deleteSceneFromCourse(course, 'no-such-scene')
    expect(result).toEqual({ error: expect.stringContaining('no-such-scene'), code: 'not_found' })
  })

  it('删除的 scene 若在 factAudit 里留有旧结论,一并清除', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const targetId = fragment.sceneIds[0]!
    const courseWithFatal: MainlineCourse = {
      ...course,
      factAudit: {
        auditedAt: new Date().toISOString(),
        auditedSceneCount: 1,
        fatalCount: 1,
        issues: [{ id: 'x', severity: 'blocking', targetId, message: 'FATAL', impact: 'i', fix: 'f' }],
      },
    }
    const result = deleteSceneFromCourse(courseWithFatal, targetId)
    if ('error' in result) throw new Error('unexpected error')
    expect(result.course.factAudit?.fatalCount).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { blockingQualityIssues } from '../../quality-gates.js'
import { insertSceneAfter } from '../scene-insert.js'
import type { MainlineCourse } from '../../domain.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  // 显式提供教研误区，确保本夹具包含可用于插页锚点测试的辨析页。
  return compileLessonFromKps({
    kps: [{
      id: 'kp-1',
      canonicalName: '消息文体特征',
      knowledgeType: 'conceptual',
      misconceptions: ['标题越长，消息提供的信息就一定越完整'],
    }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

describe('insertSceneAfter', () => {
  it('拒绝不支持手动插入的 sceneType', () => {
    const course = makeCourse()
    const anchor = course.scenes.find(s => s.sceneType === 'contrast')!
    const result = insertSceneAfter(course, anchor.id, 'practice')
    expect(result).toEqual({ error: expect.stringContaining('不支持手动插入'), code: 'unsupported' })
  })

  it('拒绝插在收束幕(recap)之后,给出可读理由', () => {
    const course = makeCourse()
    const recap = course.scenes.find(s => s.sceneType === 'recap')!
    const result = insertSceneAfter(course, recap.id, 'ai-collab')
    expect(result).toEqual({ error: expect.stringContaining('收束幕'), code: 'structural' })
  })

  it('找不到 anchor scene 时返回 not_found', () => {
    const course = makeCourse()
    const result = insertSceneAfter(course, 'no-such-scene', 'ai-collab')
    expect(result).toEqual({ error: expect.stringContaining('no-such-scene'), code: 'not_found' })
  })

  it('anchor scene 未挂在任何学习片段下时返回 structural', () => {
    const course = makeCourse()
    const anchor = course.scenes.find(s => s.sceneType === 'contrast')!
    const orphaned: MainlineCourse = {
      ...course,
      learningFragments: course.learningFragments.map(f => ({ ...f, sceneIds: f.sceneIds.filter(id => id !== anchor.id) })),
    }
    const result = insertSceneAfter(orphaned, anchor.id, 'ai-collab')
    expect(result).toEqual({ error: expect.stringContaining('未挂在任何学习片段下'), code: 'structural' })
  })

  it('插入合法幕:scenes/beats/fragment.sceneIds 三处一并追加,新幕紧跟在 anchor 之后', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const anchor = course.scenes.find(s => s.id === fragment.sceneIds.at(-1))!

    const result = insertSceneAfter(course, anchor.id, 'ai-collab')
    if ('error' in result) throw new Error('unexpected error')

    const anchorIndex = result.course.scenes.findIndex(s => s.id === anchor.id)
    const newScene = result.course.scenes[anchorIndex + 1]!
    expect(newScene.id).toBe(result.sceneId)
    expect(newScene.sceneType).toBe('ai-collab')
    expect(newScene.executor).toBe('co')
    expect(newScene.durationTargetSec).toBe(50)
    expect(newScene.kpId).toBe(anchor.kpId)
    expect(newScene.voiceCue.castId).toBe(course.selectedTeacher)
    expect(newScene.contentSlots.task).toBeTruthy()
    expect(newScene.contentSlots.rubric).toBeTruthy()

    expect(result.course.beats.some(b => b.sceneId === newScene.id)).toBe(true)

    const updatedFragment = result.course.learningFragments.find(f => f.id === fragment.id)!
    expect(updatedFragment.sceneIds).toEqual([...fragment.sceneIds, newScene.id])
    expect(updatedFragment.durationTargetSec).toBe(fragment.durationTargetSec + 50)
  })

  it('新幕本身不触发 blocking 闸门(占位内容结构合法)', () => {
    const course = makeCourse()
    const fragment = course.learningFragments.find(f => f.kpId === 'kp-1')!
    const anchor = course.scenes.find(s => s.id === fragment.sceneIds.at(-1))!

    const result = insertSceneAfter(course, anchor.id, 'ai-collab')
    if ('error' in result) throw new Error('unexpected error')

    const blocking = blockingQualityIssues(result.issues)
    expect(blocking.some(issue => issue.targetId === result.sceneId)).toBe(false)
  })

  it('插入到课级片段(开场 source-reading)之后也允许,新幕挂进同一片段', () => {
    const course = makeCourse()
    const intro = course.scenes.find(s => s.sceneType === 'source-reading')!
    const introFragment = course.learningFragments.find(f => f.sceneIds.includes(intro.id))!

    const result = insertSceneAfter(course, intro.id, 'ai-collab')
    if ('error' in result) throw new Error('unexpected error')

    const updatedFragment = result.course.learningFragments.find(f => f.id === introFragment.id)!
    expect(updatedFragment.sceneIds).toEqual([intro.id, result.sceneId])
    expect(updatedFragment.durationTargetSec).toBe(introFragment.durationTargetSec + 50)
    expect(result.course.scenes.find(s => s.id === result.sceneId)!.kpId).toBeUndefined()
  })
})

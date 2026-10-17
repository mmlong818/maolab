import { describe, expect, it, vi } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { buildBeats, compileLessonFromKps } from '../../generation/compile-lesson.js'
import type { MainlineCourse } from '../../domain.js'
import {
  PracticeRefreshIncompleteError,
  insertMissingPracticeForFragment,
  missingPracticeFragmentIds,
  practiceRepairPlan,
  problemPracticeSceneIds,
  refreshProblemPractices,
  type PracticeSceneRegenerator,
} from '../practice-refresh.js'

function makeCourse(kpCount = 1): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chemistry' })
  return compileLessonFromKps({
    courseId: `practice-refresh-${kpCount}`,
    kps: Array.from({ length: kpCount }, (_, index) => ({
      id: `kp-${index + 1}`,
      canonicalName: `化学概念 ${index + 1}`,
      knowledgeType: 'conceptual' as const,
    })),
    gradeBand: 'middle-school',
    subject: 'chemistry',
    preset,
  })
}

function breakPractice(course: MainlineCourse, sceneId: string): void {
  const scene = course.scenes.find(candidate => candidate.id === sceneId)!
  scene.contentSlots = {
    ...scene.contentSlots,
    task: '判断屏幕上三条方程式各有一处错误，指出具体位置并说明理由。',
    feedback: '第一条缺条件；第二条符号错误；第三条系数不对应。若判断错误，回到反应条件逐项核对。',
  }
}

function withoutFirstPractice(course: MainlineCourse): {
  course: MainlineCourse
  fragmentId: string
  originalPractice: MainlineCourse['scenes'][number]
} {
  const fragment = course.learningFragments.find(candidate => candidate.kpId)!
  const originalPractice = course.scenes.find(scene => (
    fragment.sceneIds.includes(scene.id) && scene.sceneType === 'practice'
  ))!
  const scenes = course.scenes.filter(scene => scene.id !== originalPractice.id)
  const learningFragments = course.learningFragments.map(candidate => candidate.id === fragment.id
    ? {
        ...candidate,
        sceneIds: candidate.sceneIds.filter(sceneId => sceneId !== originalPractice.id),
        durationTargetSec: candidate.durationTargetSec - (originalPractice.durationTargetSec ?? 0),
      }
    : candidate)
  return {
    fragmentId: fragment.id,
    originalPractice,
    course: { ...course, scenes, learningFragments, beats: buildBeats(scenes), qualityStatus: 'blocked' },
  }
}

describe('问题练习整批重生成', () => {
  it('只选择被练习质量闸门阻断的 practice 页面', () => {
    const course = makeCourse()
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    expect(problemPracticeSceneIds(course)).toEqual([])

    breakPractice(course, practice.id)
    expect(problemPracticeSceneIds(course)).toEqual([practice.id])
  })

  it('逐页重生成并保留未命中页面，全部通过后返回整课结果', async () => {
    const course = makeCourse()
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    const originalPractice = structuredClone(practice)
    const untouched = course.scenes.find(scene => scene.id !== practice.id)!
    breakPractice(course, practice.id)

    const regenerate: PracticeSceneRegenerator = vi.fn(async (current: MainlineCourse, sceneId: string) => ({
      course: {
        ...current,
        scenes: current.scenes.map(scene => scene.id === sceneId ? originalPractice : scene),
      },
      issues: [],
    }))
    const result = await refreshProblemPractices(course, { regenerate })

    expect(result.regeneratedSceneIds).toEqual([practice.id])
    expect(result.insertedSceneIds).toEqual([])
    expect(problemPracticeSceneIds(result.course)).toEqual([])
    expect(result.course.scenes.find(scene => scene.id === untouched.id)).toEqual(untouched)
    expect(regenerate).toHaveBeenCalledTimes(1)
  })

  it('为有逐知识点目标但缺少独立练习的片段补标准练习页', () => {
    const removed = withoutFirstPractice(makeCourse())
    expect(missingPracticeFragmentIds(removed.course)).toEqual([removed.fragmentId])
    expect(practiceRepairPlan(removed.course).total).toBe(1)

    const inserted = insertMissingPracticeForFragment(removed.course, removed.fragmentId)
    const repairedFragment = inserted.course.learningFragments.find(fragment => fragment.id === removed.fragmentId)!
    const newScene = inserted.course.scenes.find(scene => scene.id === inserted.sceneId)!

    expect(newScene.sceneType).toBe('practice')
    expect(newScene.kpId).toBe(repairedFragment.kpId)
    expect(newScene.executor).toBe('ai')
    expect(newScene.durationTargetSec).toBe(50)
    expect(newScene.contentSlots.task).toContain('待 LLM 填充')
    expect(repairedFragment.sceneIds.at(-1)).toBe(inserted.sceneId)
    expect(repairedFragment.durationTargetSec).toBe(
      removed.course.learningFragments.find(fragment => fragment.id === removed.fragmentId)!.durationTargetSec + 50,
    )
    expect(inserted.course.beats.some(beat => beat.sceneId === inserted.sceneId)).toBe(true)
  })

  it('缺失练习会先补页再重生成，其他页面和目标保持不变', async () => {
    const original = makeCourse()
    const removed = withoutFirstPractice(original)
    const protectedScenes = structuredClone(removed.course.scenes)
    const protectedGoals = structuredClone(removed.course.goals)
    const regenerate: PracticeSceneRegenerator = vi.fn(async (current: MainlineCourse, sceneId: string) => ({
      course: {
        ...current,
        scenes: current.scenes.map(scene => scene.id === sceneId
          ? { ...structuredClone(removed.originalPractice), id: sceneId, kpId: scene.kpId! }
          : scene),
      },
      issues: [],
    }))

    const result = await refreshProblemPractices(removed.course, { regenerate })

    expect(result.insertedSceneIds).toHaveLength(1)
    expect(result.regeneratedSceneIds).toEqual(result.insertedSceneIds)
    expect(missingPracticeFragmentIds(result.course)).toEqual([])
    expect(problemPracticeSceneIds(result.course)).toEqual([])
    expect(result.course.goals).toEqual(protectedGoals)
    expect(result.course.scenes.filter(scene => !result.insertedSceneIds.includes(scene.id))).toEqual(protectedScenes)
    expect(regenerate).toHaveBeenCalledTimes(1)
  })

  it('片段没有同知识点目标时拒绝自动补练习', () => {
    const removed = withoutFirstPractice(makeCourse())
    const invalid = {
      ...removed.course,
      goals: removed.course.goals.map(({ kpId: _kpId, ...goal }) => goal),
    }

    expect(() => insertMissingPracticeForFragment(invalid, removed.fragmentId))
      .toThrow('尚未绑定同知识点目标')
  })

  it('任一页面失败时抛错，调用方不会拿到可保存的半修结果', async () => {
    const course = makeCourse(2)
    const practices = course.scenes.filter(scene => scene.sceneType === 'practice')
    const originals = new Map(practices.map(scene => [scene.id, structuredClone(scene)]))
    practices.forEach(scene => breakPractice(course, scene.id))

    let calls = 0
    const regenerate: PracticeSceneRegenerator = async (current, sceneId) => {
      calls += 1
      if (calls === 2) throw new Error('second page failed')
      return {
        course: {
          ...current,
          scenes: current.scenes.map(scene => scene.id === sceneId ? originals.get(sceneId)! : scene),
        },
        issues: [],
      }
    }

    await expect(refreshProblemPractices(course, { regenerate })).rejects.toThrow('second page failed')
    expect(problemPracticeSceneIds(course)).toHaveLength(2)
  })

  it('重生成结果仍命中原问题时拒绝返回', async () => {
    const course = makeCourse()
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    breakPractice(course, practice.id)

    await expect(refreshProblemPractices(course, {
      regenerate: async current => ({ course: current, issues: [] }),
    })).rejects.toBeInstanceOf(PracticeRefreshIncompleteError)
  })
})

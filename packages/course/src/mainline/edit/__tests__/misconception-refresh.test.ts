import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../../samples.js'
import {
  misconceptionClaimNeedsRefresh,
  misconceptionSceneNeedsTeacherReview,
  refreshCourseMisconceptions,
} from '../misconception-refresh.js'

function courseWithAiClaim(source = '海岸线吻合就足以证明大陆漂移') {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const scene = course.scenes[0]!
  scene.sceneType = 'ai-verify'
  scene.misconceptionSource = source
  scene.contentSlots = {
    aiClaim: '三角形内角和是二百度。',
    reveal: '需要核对多类证据。',
  }
  return { course, scene }
}

describe('存量课程误区说法校准', () => {
  it('把偏离教材误区的 AI 找茬说法校准，并让该页重新进入事实核查', () => {
    const { course, scene } = courseWithAiClaim()

    const result = refreshCourseMisconceptions(course)
    const refreshed = result.course.scenes.find(item => item.id === scene.id)!

    expect(result.refreshedSceneIds).toEqual([scene.id])
    expect(refreshed.contentSlots.aiClaim).toContain(scene.misconceptionSource)
    expect(refreshed.contentSlots.reveal).toBe('需要核对多类证据。')
    expect(result.course.factAudit?.pendingSceneIds).toContain(scene.id)
  })

  it('已紧扣来源的说法保持原样', () => {
    const { course, scene } = courseWithAiClaim()
    scene.contentSlots.aiClaim = `AI 助教说：${scene.misconceptionSource}。`

    expect(misconceptionClaimNeedsRefresh(scene)).toBe(false)
    expect(refreshCourseMisconceptions(course).refreshedSceneIds).toEqual([])
  })

  it('没有教材绑定的辨析页只进入教师确认队列，不自动猜测来源', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes[0]!
    scene.sceneType = 'contrast'
    scene.contentSlots = { misconception: '当前旧说法', correction: '当前旧纠正' }
    delete scene.misconceptionSource
    delete scene.misconceptionSources

    const result = refreshCourseMisconceptions(course)

    expect(misconceptionSceneNeedsTeacherReview(scene)).toBe(true)
    expect(result.refreshedSceneIds).toEqual([])
    expect(result.teacherReviewSceneIds).toContain(scene.id)
    expect(result.course.scenes[0]!.contentSlots).toEqual(scene.contentSlots)
  })
})

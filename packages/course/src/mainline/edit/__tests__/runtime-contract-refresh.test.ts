import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../../samples.js'
import { runtimeSceneContractFor } from '../../runtime-interaction.js'
import {
  refreshCourseRuntimeContracts,
  refreshableRuntimeContractIssues,
} from '../runtime-contract-refresh.js'
import type { MainlineCourse } from '../../domain.js'

function legacyRuntimeCourse(): MainlineCourse {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const staleByType = {
    contrast: '学生在误解与修正两栏之间切换',
    'worked-example': '步骤按讲解逐步回放，当前步骤高亮',
    practice: '学生作答后反馈要点分步显现',
    recap: '系统高亮当前节点，中央路径回放',
  } as const

  return {
    ...course,
    qualityStatus: 'passed',
    scenes: course.scenes.map(scene => scene.sceneType in staleByType ? {
      ...scene,
      interactionContract: staleByType[scene.sceneType as keyof typeof staleByType],
    } : scene),
  }
}

describe('refreshCourseRuntimeContracts · 存量课堂交互契约翻新', () => {
  it('只同步命中过时承诺的三项运行时说明，不覆盖教学内容或教师手改标记', () => {
    const course = legacyRuntimeCourse()
    const teachingContent = course.scenes.map(scene => ({
      id: scene.id,
      contentSlots: scene.contentSlots,
      boardText: scene.boardText,
      teacherScript: scene.teacherScript,
      studentAction: scene.studentAction,
      evidenceOnScreen: scene.evidenceOnScreen,
      imageUrl: scene.imageUrl,
      editedByTeacher: scene.editedByTeacher,
    }))
    expect(refreshableRuntimeContractIssues(course)).not.toEqual([])

    const result = refreshCourseRuntimeContracts(course)

    expect(result.refreshedSceneIds.length).toBeGreaterThan(0)
    expect(refreshableRuntimeContractIssues(result.course)).toEqual([])
    for (const sceneId of result.refreshedSceneIds) {
      const scene = result.course.scenes.find(item => item.id === sceneId)!
      expect({
        syncStrategy: scene.syncStrategy,
        interactionContract: scene.interactionContract,
        fallbackPresentation: scene.fallbackPresentation,
      }).toEqual(runtimeSceneContractFor(scene.sceneType))
    }
    expect(result.course.scenes.map(scene => ({
      id: scene.id,
      contentSlots: scene.contentSlots,
      boardText: scene.boardText,
      teacherScript: scene.teacherScript,
      studentAction: scene.studentAction,
      evidenceOnScreen: scene.evidenceOnScreen,
      imageUrl: scene.imageUrl,
      editedByTeacher: scene.editedByTeacher,
    }))).toEqual(teachingContent)
  })

  it('没有过时承诺时不改任何页面', () => {
    const sample = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const course: MainlineCourse = {
      ...sample,
      scenes: sample.scenes.map(scene => ({ ...scene, ...runtimeSceneContractFor(scene.sceneType) })),
    }
    const result = refreshCourseRuntimeContracts(course)

    expect(result.refreshedSceneIds).toEqual([])
    expect(result.course.scenes).toEqual(course.scenes)
  })

  it('事实阻断不会被运行时契约翻新洗白', () => {
    const course: MainlineCourse = {
      ...legacyRuntimeCourse(),
      factAudit: {
        auditedAt: '2026-08-21T00:00:00.000Z',
        auditedSceneCount: 1,
        fatalCount: 1,
        issues: [{
          id: 'fact-block',
          severity: 'blocking',
          targetId: 'scene-1',
          message: '事实错误',
          impact: '会误导学生',
          fix: '按教材修正',
        }],
      },
    }

    expect(refreshCourseRuntimeContracts(course).course.qualityStatus).toBe('blocked')
  })
})

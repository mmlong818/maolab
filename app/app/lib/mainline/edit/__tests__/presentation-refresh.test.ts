import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { refreshPresentationContract } from '../presentation-refresh.js'
import type { MainlineCourse } from '../../domain.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-1', canonicalName: '平方差公式识别与应用' }],
    gradeBand: 'middle-school',
    subject: 'math',
    preset,
  })
}

/** 模拟旧课:把一幕改成明亮令之前编译期会产出的大立绘对照幕。 */
function withLegacyContrastScene(course: MainlineCourse, sceneIndex: number): MainlineCourse {
  const scenes = [...course.scenes]
  const base = scenes[sceneIndex]!
  scenes[sceneIndex] = {
    ...base,
    sceneType: 'contrast',
    dialogueLayout: 'student-right-content-left',
    characterLayer: { ...base.characterLayer, layout: 'student-right-content-left' },
  }
  return { ...course, scenes }
}

describe('refreshPresentationContract · 旧课呈现契约翻新', () => {
  it('contrast/ai-verify 的大立绘版式归一为 corner-avatar(dialogueLayout 与 characterLayer 同步)', () => {
    const course = withLegacyContrastScene(makeCourse(), 1)
    const target = course.scenes[1]!
    const { course: refreshed, normalizedSceneIds } = refreshPresentationContract(course)
    expect(normalizedSceneIds).toEqual([target.id])
    const scene = refreshed.scenes[1]!
    expect(scene.dialogueLayout).toBe('corner-avatar')
    expect(scene.characterLayer.layout).toBe('corner-avatar')
  })

  it('内容密集白名单里的安全版式(narration-only 等)不动;非对照幕型一律不动', () => {
    const course = makeCourse()
    const { course: refreshed, normalizedSceneIds } = refreshPresentationContract(course)
    // 现行 compile 已恒 corner-avatar,整课无可归一项
    expect(normalizedSceneIds).toEqual([])
    expect(refreshed.scenes.map(s => s.dialogueLayout)).toEqual(course.scenes.map(s => s.dialogueLayout))
  })

  it('翻新后重跑确定性闸门并更新 qualityStatus;不清除 factAudit(不改内容)', () => {
    const base = withLegacyContrastScene(makeCourse(), 1)
    const withFatal: MainlineCourse = {
      ...base,
      factAudit: { auditedAt: 'x', auditedSceneCount: 1, fatalCount: 1, issues: [] },
    }
    const { course: refreshed, issues } = refreshPresentationContract(withFatal)
    expect(Array.isArray(issues)).toBe(true)
    expect(refreshed.qualityStatus).toBe('blocked') // FATAL 仍在,状态不得洗白
    expect(refreshed.factAudit?.fatalCount).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { courseDisplayScene, courseDisplayTitle, sceneDisplayTitle } from '../course-display-title.js'

describe('courseDisplayTitle', () => {
  it('按课程知识点顺序完整显示，不用数量代称截断标题', () => {
    expect(courseDisplayTitle({
      topic: '二力平衡的四个条件 等 2 个知识点',
      sourceMaterial: [
        { kind: 'textbook', title: '二力平衡的四个条件', kpId: 'kp-balance' },
        { kind: 'textbook', title: '力的示意图画法', kpId: 'kp-force-diagram' },
      ],
    })).toBe('二力平衡的四个条件、力的示意图画法')
  })

  it('旧课没有知识点来源时保留已有主题', () => {
    expect(courseDisplayTitle({ topic: '二力平衡', sourceMaterial: [] })).toBe('二力平衡')
  })

  it('让旧课的课程级开场页跟随完整课程标题', () => {
    const course = {
      topic: '二力平衡的四个条件 等 2 个知识点',
      sourceMaterial: [
        { kind: 'textbook' as const, title: '二力平衡的四个条件', kpId: 'kp-balance' },
        { kind: 'textbook' as const, title: '力的示意图画法规范', kpId: 'kp-force-diagram' },
      ],
    }
    expect(sceneDisplayTitle(course, { visualFocus: course.topic })).toBe('二力平衡的四个条件、力的示意图画法规范')
    expect(sceneDisplayTitle(course, { kpId: 'kp-balance', visualFocus: '二力平衡判定' })).toBe('二力平衡判定')
  })

  it('只在显示态替换旧开场页内复制的缩写，不修改知识点页', () => {
    const course = {
      id: 'course-1', topic: '甲 等 2 个知识点', sourceMaterial: [
        { kind: 'textbook' as const, title: '甲', kpId: 'kp-1' },
        { kind: 'textbook' as const, title: '乙', kpId: 'kp-2' },
      ],
    }
    const scene = {
      id: 'scene-1', visualFocus: course.topic, contentSlots: { topic: course.topic }, narrationAnchor: course.topic,
      syncStrategy: course.topic, interactionContract: course.topic, fallbackPresentation: course.topic, gradeTone: course.topic,
      teacherScript: `围绕 ${course.topic} 展开`, studentAction: course.topic, boardText: [course.topic], evidenceOnScreen: [course.topic],
      voiceCue: { castId: 'teacher', emotion: 'calm', pace: 'medium' as const, pauseRule: course.topic },
    }
    const displayed = courseDisplayScene(course as never, scene as never)
    expect(displayed.visualFocus).toBe('甲、乙')
    expect(displayed.teacherScript).toBe('围绕 甲、乙 展开')
    expect(displayed.contentSlots.topic).toBe('甲、乙')
    expect(courseDisplayScene(course as never, { ...scene, kpId: 'kp-1' } as never).visualFocus).toBe(course.topic)
  })
})

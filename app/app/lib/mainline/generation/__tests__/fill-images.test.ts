import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import { fillImages, type ImageCall } from '../fill-images.js'

function makeCourse() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  return compileLessonFromKps({
    kps: [{
      id: 'kp-a',
      canonicalName: '示例知识点',
      misconceptions: ['把一个表面特征当成概念成立的充分条件'],
    }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

describe('fillImages', () => {
  it('generates images for visual-observation / contrast / recap only', async () => {
    const calls: string[] = []
    const mockImage: ImageCall = async ({ prompt, size }) => {
      // 尺寸来自版式槽位:必为 16 倍数、宽高比 ≤3:1,且随幕落库为 imageAspect
      const m = /^(\d+)x(\d+)$/.exec(size ?? '')
      if (!m) throw new Error(`bad size: ${size}`)
      expect(Number(m[1]) % 16).toBe(0)
      expect(Number(m[2]) % 16).toBe(0)
      expect(Number(m[1]) / Number(m[2])).toBeLessThanOrEqual(3)
      calls.push(prompt.slice(0, 30))
      return `/generated-images/mock-${calls.length}.png`
    }
    const { course, filledSceneIds, failedSceneIds } = await fillImages(makeCourse(), { imageCall: mockImage })

    // 6 scene 中 3 个符合(vo/contrast/recap),其余不生成
    expect(filledSceneIds).toHaveLength(3)
    expect(failedSceneIds).toEqual([])
    const filledTypes = course.scenes.filter(s => s.imageUrl).map(s => s.sceneType)
    expect(new Set(filledTypes)).toEqual(new Set(['visual-observation', 'contrast', 'recap']))
    const skippedTypes = course.scenes.filter(s => !s.imageUrl).map(s => s.sceneType)
    expect(skippedTypes).toEqual(['source-reading', 'concept-build', 'practice'])
    // imageAspect 记录生成时的真实像素比 W:H
    for (const s of course.scenes.filter(s => s.imageUrl)) {
      expect(s.imageAspect).toMatch(/^\d+:\d+$/)
    }
  })

  it('records imageUrl and imagePrompt on each filled scene', async () => {
    const mockImage: ImageCall = async () => '/generated-images/mock.png'
    const { course } = await fillImages(makeCourse(), { imageCall: mockImage })
    const contrast = course.scenes.find(s => s.sceneType === 'contrast')
    expect(contrast?.imageUrl).toBe('/generated-images/mock.png')
    expect(contrast?.imagePrompt).toBeTruthy()
    expect(contrast?.imagePrompt).toContain('misconception')
  })

  it('prompt carries the fidelity block and the tier is recorded on the scene', async () => {
    const mockImage: ImageCall = async () => '/generated-images/mock.png'
    const { course } = await fillImages(makeCourse(), { imageCall: mockImage })
    // middle-school × chinese(表达型)× visual-observation → stylized-teaching
    const vo = course.scenes.find(s => s.sceneType === 'visual-observation')
    expect(vo?.imageFidelity).toBe('stylized-teaching')
    expect(vo?.imagePrompt).toContain('TEACHING-OBJECT FIDELITY')
    expect(vo?.imagePrompt).toContain('12-14 year olds')
    // recap 在表达型学科 → atmosphere,prompt 明示不是图表
    const recap = course.scenes.find(s => s.sceneType === 'recap')
    expect(recap?.imageFidelity).toBe('atmosphere')
    expect(recap?.imagePrompt).toContain('NOT a diagram')
  })

  it('skips scenes already filled unless force=true', async () => {
    let callCount = 0
    const mockImage: ImageCall = async () => { callCount++; return `/generated-images/mock-${callCount}.png` }
    const before = makeCourse()
    // 预先给一个 recap scene 打 imageUrl,模拟已生成
    const recap = before.scenes.find(s => s.sceneType === 'recap')!
    recap.imageUrl = '/generated-images/existing.png'
    recap.imagePrompt = 'existing prompt'

    const { filledSceneIds } = await fillImages(before, { imageCall: mockImage })
    // 只应生成 2 张(vo/contrast),recap 已有跳过
    expect(filledSceneIds).toHaveLength(2)
    expect(callCount).toBe(2)
  })

  it('re-generates all target scenes when force=true', async () => {
    let callCount = 0
    const mockImage: ImageCall = async () => { callCount++; return `/generated-images/forced-${callCount}.png` }
    const before = makeCourse()
    before.scenes.find(s => s.sceneType === 'recap')!.imageUrl = '/generated-images/existing.png'

    const { filledSceneIds, course } = await fillImages(before, { imageCall: mockImage, force: true })
    expect(filledSceneIds).toHaveLength(3)
    expect(callCount).toBe(3)
    // 原有的 imageUrl 被 force 覆盖
    const recap = course.scenes.find(s => s.sceneType === 'recap')!
    expect(recap.imageUrl).toMatch(/forced-/)
  })

  it('records failed scene ids without breaking the batch', async () => {
    let callCount = 0
    const mockImage: ImageCall = async () => {
      callCount++
      if (callCount === 2) throw new Error('mock image API failure')
      return `/generated-images/ok-${callCount}.png`
    }
    const { filledSceneIds, failedSceneIds, course } = await fillImages(makeCourse(), { imageCall: mockImage })
    expect(filledSceneIds).toHaveLength(2)
    expect(failedSceneIds).toHaveLength(1)
    // 其他 scene 仍拿到图
    expect(course.scenes.filter(s => s.imageUrl)).toHaveLength(2)
  })
})

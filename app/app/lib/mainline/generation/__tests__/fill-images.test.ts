import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import { buildCoordinateGridSvg, fillImages, type ImageCall } from '../fill-images.js'
import { PAGE_CONTENT_SCHEMA_VERSION } from '../../planning/page-content-contract.js'

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

function makePageFirstCourse() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
  const base = compileLessonFromKps({
    kps: [{
      id: 'kp-density',
      canonicalName: '从受力图判断二力平衡',
      knowledgeType: 'conceptual',
      learningObjectives: ['能从受力图判断两个力是否平衡'],
    }],
    gradeBand: 'middle-school',
    subject: 'physics',
    preset,
  })
  const visualPage = base.planning?.pages.find(page => page.visualSpec.form === 'instructional-image')
  if (!base.planning || !visualPage) throw new Error('fixture 缺少教学配图页')
  return {
    pageId: visualPage.id,
    course: {
      ...base,
      planning: { ...base.planning, status: 'review' as const },
      pageContent: {
        schemaVersion: PAGE_CONTENT_SCHEMA_VERSION,
        courseId: base.id,
        planRevisionId: base.planning.planRevisionId,
        contentRevisionId: `${base.planning.planRevisionId}:content:1`,
        status: 'review' as const,
        pages: [{
          pageId: visualPage.id,
          order: visualPage.order,
          purpose: visualPage.purpose,
          planRevisionId: base.planning.planRevisionId,
          sourceRefs: [],
          content: {
            kind: 'observation' as const,
            title: '观察金属球的测量信息',
            prompt: '观察同体积金属球的质量差异，指出判断空心与实心需要比较的量。',
            materialCaption: '同体积的两个金属球与天平、量筒测量场景。',
            evidenceLabels: ['质量', '体积'],
          },
          teacherCompanion: {
            script: '先让学生只观察测量对象和数据关系，不在这一页揭示判断结论。',
            notes: [],
            pace: 'deliberate' as const,
          },
        }],
      },
    },
  }
}

function makePairedGeographyCourse() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
  const base = compileLessonFromKps({
    kps: [{
      id: 'kp-grid',
      canonicalName: '经纬网坐标读取与定位',
      knowledgeType: 'procedural',
      learningObjectives: ['能按步骤完成经纬网坐标读取与定位'],
    }],
    gradeBand: 'middle-school',
    subject: 'geography',
    preset,
  })
  const prompt = base.planning?.pages.find(page => page.purpose === 'question')
  const response = base.planning?.pages.find(page => page.purpose === 'worked-step')
  if (!base.planning || !prompt || !response) throw new Error('fixture 缺少经纬网例题页对')
  return {
    promptId: prompt.id,
    responseId: response.id,
    course: {
      ...base,
      planning: { ...base.planning, status: 'review' as const },
      pageContent: {
        schemaVersion: PAGE_CONTENT_SCHEMA_VERSION,
        courseId: base.id,
        planRevisionId: base.planning.planRevisionId,
        contentRevisionId: `${base.planning.planRevisionId}:content:1`,
        status: 'review' as const,
        pages: [{
          pageId: prompt.id, order: prompt.order, purpose: prompt.purpose,
          planRevisionId: base.planning.planRevisionId, sourceRefs: [],
          content: {
            kind: 'question' as const, title: '经纬网定位',
            prompt: '在经纬网上定位A点。', materials: ['A点位于东经120°、北纬40°。'],
            responseInstruction: '先写出定位步骤。',
          },
          teacherCompanion: { script: '先定位经线，再定位纬线。', notes: [], pace: 'normal' as const },
          ...(prompt.pairId ? { pairId: prompt.pairId } : {}),
          ...(prompt.pairRole ? { pairRole: prompt.pairRole } : {}),
          ...(prompt.layoutGroupId ? { layoutGroupId: prompt.layoutGroupId } : {}),
        }, {
          pageId: response.id, order: response.order, purpose: response.purpose,
          planRevisionId: base.planning.planRevisionId, sourceRefs: [],
          content: {
            kind: 'worked-step' as const, title: '经纬网定位步骤',
            steps: [{ step: '找到东经120°经线。', reason: '先确定经度。', result: '确定目标经线。' }],
          },
          teacherCompanion: { script: '核对定位步骤。', notes: [], pace: 'deliberate' as const },
          ...(response.pairId ? { pairId: response.pairId } : {}),
          ...(response.pairRole ? { pairRole: response.pairRole } : {}),
          ...(response.layoutGroupId ? { layoutGroupId: response.layoutGroupId } : {}),
        }],
      },
    },
  }
}

describe('fillImages', () => {
  it('builds a deterministic coordinate grid with exact longitude and latitude labels', () => {
    const svg = buildCoordinateGridSvg('A点位于东经120°与北纬40°；B点位于西经30°与南纬20°。')
    expect(svg).toContain('120°E')
    expect(svg).toContain('30°W')
    expect(svg).toContain('40°N')
    expect(svg).toContain('20°S')
    expect(svg).not.toContain('A点')
    expect(svg).not.toContain('B点')
  })

  it('generates one image for a visual prompt and reuses it on the paired response page', async () => {
    let callCount = 0
    const fixture = makePairedGeographyCourse()
    const mockImage: ImageCall = async () => {
      callCount += 1
      return '/generated-images/grid.png'
    }

    const result = await fillImages(fixture.course, { imageCall: mockImage })
    const prompt = result.course.pageContent?.pages.find(page => page.pageId === fixture.promptId)
    const response = result.course.pageContent?.pages.find(page => page.pageId === fixture.responseId)

    expect(callCount).toBe(1)
    expect(result.filledSceneIds).toEqual([fixture.promptId])
    expect(prompt?.imageUrl).toBe('/generated-images/grid.png')
    expect(response?.imageUrl).toBe('/generated-images/grid.png')
  })

  it('writes required page-first images into pageContent and respects force', async () => {
    let callCount = 0
    const mockImage: ImageCall = async ({ prompt, size }) => {
      callCount++
      expect(size).toBe('1024x768')
      expect(prompt).toContain('Do not reveal the answer')
      expect(prompt).toContain('Do not render paragraphs')
      return `/generated-images/page-${callCount}.png`
    }
    const fixture = makePageFirstCourse()

    const first = await fillImages(fixture.course, { imageCall: mockImage })
    expect(first.filledSceneIds).toEqual([fixture.pageId])
    expect(first.failedSceneIds).toEqual([])
    expect(first.course.pageContent?.pages[0]).toMatchObject({
      imageUrl: '/generated-images/page-1.png',
      imageAspect: '4:3',
    })
    expect(first.course.pageContent?.pages[0]?.imagePrompt).toContain(fixture.course.topic)
    expect(first.course.scenes.every(scene => !scene.imageUrl)).toBe(true)

    const skipped = await fillImages(first.course, { imageCall: mockImage })
    expect(skipped.filledSceneIds).toEqual([])
    expect(callCount).toBe(1)

    const forced = await fillImages(first.course, { imageCall: mockImage, force: true })
    expect(forced.filledSceneIds).toEqual([fixture.pageId])
    expect(forced.course.pageContent?.pages[0]?.imageUrl).toBe('/generated-images/page-2.png')
    expect(callCount).toBe(2)
  })

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
    expect(contrast?.imagePrompt).toContain('DO NOT reveal which option is correct')
    expect(contrast?.imagePrompt).toContain('Never use checkmarks, crosses')
    expect(contrast?.imagePrompt).toContain('red-versus-green correctness coding')
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

import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import { fillSceneInContext, type FillLLMCall } from '../fill-scenes.js'

describe('recap template fill', () => {
  it('prompts and normalizes against the compiled template during single-scene regeneration', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{
        id: 'kp-buoyancy',
        canonicalName: '浮力',
        knowledgeType: 'conceptual',
        misconceptions: ['物体越重，受到的浮力越大'],
      }],
      gradeBand: 'middle-school',
      subject: 'physics',
      preset,
      courseId: 'recap-template-fill',
    })
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    let capturedSystem = ''
    const llm: FillLLMCall = async params => {
      capturedSystem = params.system
      return {
        contentSlots: {
          misconception: '物体越重，受到的浮力一定越大',
          correction: '浮力取决于排开液体所受的重力',
          evidence: '浸入体积变化时，测力计示数同步变化',
          takeaway: '判断浮力要回到液体密度和排液体积',
          transferTask: '如果液体密度不变，只把物体浸入体积减半，判断浮力怎样变化并说明依据。',
          path: '模型擅自改回旧路径',
        },
        visualFocus: '想法修正',
        narrationAnchor: '想法修正',
        boardText: ['比较测力计示数', '控制液体密度', '观察浸入体积'],
        teacherScript: '现在回到想法修正。先比较起始判断和新的解释，停一下，指出哪条实验现象迫使我们改变看法，再说明这条证据为什么比直觉更可靠。最后用一个新物体检验自己的判断。',
        studentAction: '复述本课结论',
        evidenceOnScreen: ['起始想法', '实验现象', '修正解释'],
      }
    }

    const { scene } = await fillSceneInContext(course, recap.id, { llm })

    expect(capturedSystem).toContain('收束 / 想法修正')
    expect(capturedSystem).toContain('startingIdea / revisedIdea / revisionEvidence / takeaway / transferTask')
    expect(capturedSystem).not.toContain('至少含 path / takeaway')
    expect(scene.infoShape).toBe('contrast')
    expect(scene.contentSlots).toEqual({
      startingIdea: '物体越重，受到的浮力一定越大',
      revisedIdea: '浮力取决于排开液体所受的重力',
      revisionEvidence: '浸入体积变化时，测力计示数同步变化',
      takeaway: '判断浮力要回到液体密度和排液体积',
      transferTask: '如果液体密度不变，只把物体浸入体积减半，判断浮力怎样变化并说明依据。',
    })
    expect(scene.studentAction).toContain('完成屏幕迁移题')
    expect(scene.studentAction).not.toBe('复述本课结论')
  })
})

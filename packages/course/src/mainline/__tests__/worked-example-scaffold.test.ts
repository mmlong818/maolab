import { describe, expect, it } from 'vitest'
import {
  workedExampleCompletionPrompt,
  workedExampleScaffoldProblems,
} from '../worked-example-scaffold.js'

describe('worked example scaffold', () => {
  it('accepts one explicit completion gap with prior-step context and a reason cue', () => {
    const scene = {
      contentSlots: {
        completionPrompt: '题面已有：研究对象已经确定。请在【待补】处补出下一步，并说明依据。',
        steps: '第一步：确定研究对象；第二步：画出物体受到的两个力，并说明依据。',
      },
    }

    expect(workedExampleCompletionPrompt(scene)).toContain('【待补】')
    expect(workedExampleScaffoldProblems(scene)).toEqual([])
  })

  it('rejects missing, answerless, multi-gap, context-free, and reason-free prompts', () => {
    expect(workedExampleScaffoldProblems({ contentSlots: {} })).toEqual([
      '缺少 contentSlots.completionPrompt，无法形成例题完成题',
    ])
    expect(workedExampleScaffoldProblems({
      contentSlots: { completionPrompt: '请在【待补】和【待补】处完成步骤。' },
    })).toEqual([
      'completionPrompt 必须且只能保留一个 【待补】 空缺',
      'completionPrompt 必须直接写出题面已经给出的信息或步骤',
      'completionPrompt 必须要求学生说明补步依据',
    ])
  })

  it('「已知/已给出/题面给出」等标准题面措辞同样算写明了已给信息', () => {
    for (const prompt of [
      '已知拉力为 6 N，方向水平向右。请在【待补】处核验摩擦力，并说明依据。',
      '受力图已给出四个力，拉力为 6 N。请在【待补】处逐条核验，并说明理由。',
      '题面给出物体质量为 2 kg。请补出【待补】处的关键一步，并写明为什么。',
    ]) {
      expect(workedExampleScaffoldProblems({ contentSlots: { completionPrompt: prompt } }))
        .not.toContain('completionPrompt 必须直接写出题面已经给出的信息或步骤')
    }
  })

  it('rejects a gap that leaks its answer or remains blank in the full reveal', () => {
    expect(workedExampleScaffoldProblems({
      contentSlots: {
        completionPrompt: '题面已有：研究对象已经确定。正确步骤应填“画出重力和拉力”【待补】，并说明依据。',
        steps: '第一步：确定研究对象；第二步：画出重力和拉力。',
      },
    })).toContain('completionPrompt 在空缺附近提前写出了待补答案')

    expect(workedExampleScaffoldProblems({
      contentSlots: {
        completionPrompt: '题面已有：研究对象已经确定。请在【待补】处补出下一步，并说明依据。答案是画出重力和拉力。',
        steps: '第一步：确定研究对象；第二步：画出重力和拉力。',
      },
    })).toContain('completionPrompt 在空缺之后提前泄露了完整示范中的结果')

    expect(workedExampleScaffoldProblems({
      contentSlots: {
        completionPrompt: '题面已有：研究对象已经确定。请在【待补】处补出下一步，并说明依据。',
        steps: '第一步：确定研究对象；第二步：【待补】。',
      },
    })).toContain('steps 必须给出完整示范，不能继续保留【待补】空缺')
  })
})

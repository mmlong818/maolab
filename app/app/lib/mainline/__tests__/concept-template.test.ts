import { describe, expect, it } from 'vitest'
import {
  conceptTemplateForScene,
  conceptTemplateProblems,
  normalizeConceptContentSlots,
  selectConceptBuildTemplate,
} from '../concept-template.js'

describe('concept-build deterministic templates', () => {
  it('为元认知知识选择策略闭环，而不是定义加正例', () => {
    const template = selectConceptBuildTemplate('metacognitive')
    expect(template.id).toBe('strategy-cycle')
    expect(template.infoShape).toBe('progressive')
    expect(conceptTemplateForScene({ sceneType: 'concept-build', infoShape: 'progressive' })?.id)
      .toBe('strategy-cycle')
  })

  it('把模型的普通概念别名收敛为时机、步骤和自检，同时保留学科专属槽', () => {
    const contentSlots = normalizeConceptContentSlots(
      {
        sceneType: 'concept-build',
        infoShape: 'progressive',
        contentSlots: {
          trigger: '待 LLM 填充：使用时机',
          steps: '待 LLM 填充：执行步骤',
          selfCheck: '待 LLM 填充：自检问题',
        },
      },
      {
        statement: '题目信息很多、目标不明确时启动审题策略',
        example: '圈出任务词 → 标记已知条件 → 用自己的话重述问题',
        check: '我是否明确了要回答什么，并且每个条件都有用途？',
        sentenceParse: '任务词|条件|问题',
      },
      ['先找任务词', '再核对条件', '最后确认目标'],
    )

    expect(contentSlots).toEqual({
      sentenceParse: '任务词|条件|问题',
      trigger: '题目信息很多、目标不明确时启动审题策略',
      steps: '圈出任务词 → 标记已知条件 → 用自己的话重述问题',
      selfCheck: '我是否明确了要回答什么，并且每个条件都有用途？',
    })
    expect(contentSlots.statement).toBeUndefined()
    expect(contentSlots.example).toBeUndefined()
  })

  it('缺槽或步骤数量不可执行时返回结构问题', () => {
    const base = {
      sceneType: 'concept-build' as const,
      infoShape: 'progressive' as const,
      contentSlots: {
        trigger: '不确定下一步时',
        steps: '先停下来',
        selfCheck: '',
      },
    }
    expect(conceptTemplateProblems(base)).toEqual([
      '缺少策略槽 selfCheck',
      '执行步骤需要 2-5 个箭头连接的节点',
    ])

    expect(conceptTemplateProblems({
      ...base,
      contentSlots: {
        trigger: '不确定下一步时',
        steps: '识别情境 → 选择策略 → 执行 → 核对结果',
        selfCheck: '结果是否有证据支持？',
      },
    })).toEqual([])
  })
})

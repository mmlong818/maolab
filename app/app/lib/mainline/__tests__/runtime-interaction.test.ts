import { describe, expect, it } from 'vitest'
import type { SceneType } from '../domain.js'
import { runtimeSceneContractFor, unsupportedRuntimePromises } from '../runtime-interaction.js'

const SCENE_TYPES: readonly SceneType[] = [
  'source-reading',
  'visual-observation',
  'concept-build',
  'contrast',
  'ai-verify',
  'ai-inquiry',
  'worked-example',
  'practice',
  'recap',
  'ai-collab',
]

describe('runtime interaction contracts', () => {
  it('当前课堂契约不会承诺未实现的操作或动画', () => {
    for (const sceneType of SCENE_TYPES) {
      const contract = runtimeSceneContractFor(sceneType)
      expect(unsupportedRuntimePromises({ sceneType, ...contract }), sceneType).toEqual([])
    }
  })

  it.each([
    ['contrast', '学生在误解与修正两栏之间切换', '可切换或拖动的辨析滑块'],
    ['worked-example', '步骤按讲解逐步回放，当前步骤高亮', '逐步回放并高亮当前步骤'],
    ['practice', '学生作答后反馈要点分步显现', '反馈逐步显现'],
    ['recap', '系统高亮当前节点，中央路径回放', '路径自动回放或节点高亮'],
  ] as const)('识别 %s 的存量假交互承诺', (sceneType, interactionContract, claim) => {
    const current = runtimeSceneContractFor(sceneType)
    const promises = unsupportedRuntimePromises({
      sceneType,
      syncStrategy: current.syncStrategy,
      interactionContract,
      fallbackPresentation: current.fallbackPresentation,
    })

    expect(promises.map(item => item.claim)).toContain(claim)
  })

  it('不把“无滑块时静态并排”的降级说明误报为可操作滑块', () => {
    const current = runtimeSceneContractFor('contrast')
    expect(unsupportedRuntimePromises({
      sceneType: 'contrast',
      syncStrategy: current.syncStrategy,
      interactionContract: current.interactionContract,
      fallbackPresentation: '左右并排显示误解与修正，不使用滑块。',
    })).toEqual([])
  })

  it('AI 找茬契约要求先逐条作答，再一次展开全部对应核查结论', () => {
    const contract = runtimeSceneContractFor('ai-verify')

    expect(contract.syncStrategy).toContain('全部待核查说法')
    expect(contract.syncStrategy).toContain('每条都留下文字判断')
    expect(contract.interactionContract).toContain('按说法逐条检查文字作答完整性')
    expect(contract.interactionContract).toContain('不伪造答案文本')
    expect(contract.interactionContract).toContain('逐条改写并举证')
    expect(contract.interactionContract).toContain('完成前后续页面入口保持禁用')
    expect(contract.interactionContract).toContain('保持禁用')
  })

  it.each(['worked-example', 'contrast'] as const)('%s 契约不允许只点按钮跳过真实作答', sceneType => {
    const contract = runtimeSceneContractFor(sceneType)

    expect(contract.syncStrategy).toContain('确认已在纸面、口头完成')
    expect(contract.interactionContract).toContain('不伪造文本')
    expect(contract.interactionContract).toContain('保持禁用')
    expect(contract.interactionContract).toContain('后续页面入口')
    expect(contract.interactionContract).toMatch(sceneType === 'worked-example'
      ? /解释关键步骤为什么成立/
      : /改写正确表述并指出关键条件/)
    expect(contract.interactionContract).toContain('完成前后续页面入口保持禁用')
    expect(contract.fallbackPresentation).toContain('在纸上')
  })

  it('练习契约把把握度固定在反馈揭晓前', () => {
    const contract = runtimeSceneContractFor('practice')

    expect(contract.syncStrategy).toContain('揭晓前标记把握度')
    expect(contract.interactionContract.indexOf('揭晓前选择把握度'))
      .toBeLessThan(contract.interactionContract.indexOf('展开完整反馈'))
    expect(contract.fallbackPresentation).toContain('询问把握度')
    expect(contract.interactionContract).toContain('反馈展开前，后续页面入口保持禁用')
  })

  it('开场契约要求保存揭晓前作答，收束契约要求回看并修正', () => {
    const opening = runtimeSceneContractFor('source-reading')
    const recap = runtimeSceneContractFor('recap')

    expect(opening.syncStrategy).toContain('完成揭晓前作答并标记把握度')
    expect(opening.interactionContract).toContain('投影课堂')
    expect(opening.interactionContract).toContain('不伪造答案文本')
    expect(opening.fallbackPresentation).toContain('在纸上写下作答与把握度')
    expect(recap.syncStrategy).toContain('回看学生自己的记录')
    expect(recap.interactionContract).toContain('纸面或口头模式只确认')
    expect(recap.interactionContract).toContain('不冒充文本证据')
  })
})

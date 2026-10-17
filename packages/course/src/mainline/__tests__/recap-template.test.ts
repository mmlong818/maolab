import { describe, expect, it } from 'vitest'
import {
  normalizeRecapContentSlots,
  recapCoreSlotKeys,
  recapSeedContentSlots,
  recapTemplateProblems,
  recapTransferAttemptIsComplete,
  recapTransferTaskProblems,
  selectRecapTemplate,
  type RecapTransferAttempt,
} from '../recap-template.js'

describe('deterministic recap templates', () => {
  it('selects structure from explicit KP metadata rather than an LLM declaration', () => {
    expect(selectRecapTemplate([{ canonicalName: '分数除法', knowledgeType: 'procedural' }]).id).toBe('learning-ladder')
    expect(selectRecapTemplate([{
      canonicalName: '浮力',
      knowledgeType: 'conceptual',
      misconceptions: ['物体越重浮力越大'],
    }]).id).toBe('belief-revision')
    expect(selectRecapTemplate([{ canonicalName: '安史之乱', knowledgeType: 'factual' }]).id).toBe('claim-evidence')
    expect(selectRecapTemplate([
      { canonicalName: '起因', knowledgeType: 'factual' },
      { canonicalName: '过程', knowledgeType: 'factual' },
      { canonicalName: '影响', knowledgeType: 'conceptual' },
    ]).id).toBe('concept-network')
  })

  it('keeps the compiled belief-revision shape when the model returns legacy keys', () => {
    const template = selectRecapTemplate([{
      canonicalName: '浮力',
      knowledgeType: 'conceptual',
      misconceptions: ['物体越重浮力越大'],
    }])
    const scene = {
      sceneType: 'recap' as const,
      infoShape: template.infoShape,
      contentSlots: recapSeedContentSlots(template, [{ canonicalName: '浮力' }], '浮力'),
    }
    const normalized = normalizeRecapContentSlots(scene, {
      misconception: '物体越重，受到的浮力一定越大',
      correction: '浮力取决于排开液体所受重力',
      evidence: '同一物体浸入体积变化时，测力计示数随之变化',
      takeaway: '判断浮力要回到排液体积与液体密度',
      transferTask: '如果液体密度不变，只把浸入体积减半，判断浮力怎样变化并说明依据。',
      path: '模型擅自改回的旧路径',
    }, ['比较测力计示数', '控制液体密度', '观察浸入体积'])

    expect(normalized).toEqual({
      startingIdea: '物体越重，受到的浮力一定越大',
      revisedIdea: '浮力取决于排开液体所受重力',
      revisionEvidence: '同一物体浸入体积变化时，测力计示数随之变化',
      takeaway: '判断浮力要回到排液体积与液体密度',
      transferTask: '如果液体密度不变，只把浸入体积减半，判断浮力怎样变化并说明依据。',
    })
    expect(recapTemplateProblems({ ...scene, contentSlots: normalized })).toEqual([])
  })

  it('preserves a five-branch network even when generated keys are incomplete', () => {
    const kps = ['甲', '乙', '丙', '丁', '戊'].map(canonicalName => ({ canonicalName, knowledgeType: 'conceptual' as const }))
    const template = selectRecapTemplate(kps)
    const scene = {
      sceneType: 'recap' as const,
      infoShape: template.infoShape,
      contentSlots: recapSeedContentSlots(template, kps, '五个概念的联系'),
    }
    const normalized = normalizeRecapContentSlots(scene, {
      shapeCenter: '共同主题',
      shapeItem1: '甲解释中心的第一个角度',
      shapeItem2: '乙解释中心的第二个角度',
      takeaway: '五个概念共同组成完整解释',
      transferTask: '如果只去掉“丁”这个条件，判断共同解释是否仍成立并说明依据。',
    }, ['丙提供第三个角度', '丁提供第四个角度', '戊提供第五个角度'])

    expect(recapCoreSlotKeys({ ...scene, contentSlots: normalized })).toEqual([
      'shapeCenter', 'shapeItem1', 'shapeItem2', 'shapeItem3', 'shapeItem4', 'shapeItem5', 'takeaway', 'transferTask',
    ])
    expect(normalized.shapeItem3).toBe('丙提供第三个角度')
    expect(normalized.shapeItem4).toBe('丁提供第四个角度')
    expect(normalized.shapeItem5).toBe('戊提供第五个角度')
    expect(recapTemplateProblems({ ...scene, contentSlots: normalized })).toEqual([])
  })

  it('leaves legacy recap slots untouched when infoShape is absent', () => {
    const scene = {
      sceneType: 'recap' as const,
      contentSlots: { path: '观察 → 解释 → 应用', takeaway: '旧课结论' },
    }
    expect(normalizeRecapContentSlots(scene, scene.contentSlots, ['观察', '解释', '应用'])).toEqual(scene.contentSlots)
  })

  it('rejects generic or answer-leaking transfer prompts and accepts one concrete changed condition', () => {
    expect(recapTransferTaskProblems('请举一个新例子，迁移到新情境。')).not.toEqual([])
    expect(recapTransferTaskProblems('如果只把液体换成盐水，浮力一定变大，请说明原因。')).toContain('迁移题题面提前写出了答案或结果')
    expect(recapTransferTaskProblems('如果液体密度不变，只把浸入体积减半，判断浮力怎样变化并说明依据。')).toEqual([])
  })

  it('requires a reasoned initial response and an explicit post-criteria review', () => {
    expect(recapTransferAttemptIsComplete({
      mode: 'typed',
      confidence: 'medium',
      response: '浮力变小，因为液体密度不变时，排开液体的体积减半。',
      reviewDecision: 'kept',
      reviewNote: '我会保留原答，因为已说明变化条件并用浮力关系给出依据。',
    })).toBe(true)
    expect(recapTransferAttemptIsComplete({
      mode: 'typed',
      confidence: 'medium',
      response: '浮力变小，因为液体密度不变时，排开液体的体积减半。',
    } as unknown as RecapTransferAttempt)).toBe(false)
    expect(recapTransferAttemptIsComplete({
      mode: 'paper-or-oral',
      confidence: 'low',
      paperOrOralComplete: true,
    } as unknown as RecapTransferAttempt)).toBe(false)
    expect(recapTransferAttemptIsComplete({
      mode: 'paper-or-oral',
      confidence: 'low',
      paperOrOralComplete: true,
      paperReviewComplete: true,
    })).toBe(true)
  })
})

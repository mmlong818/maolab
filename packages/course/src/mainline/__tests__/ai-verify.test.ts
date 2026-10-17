import { describe, expect, it } from 'vitest'
import {
  AI_VERIFY_OVERLAP_THRESHOLD,
  aiVerifyPairs,
  aiVerifyTextOverlapRatio,
  normalizeAiVerifyClaims,
  normalizeGroundedContrastClaim,
} from '../ai-verify.js'

describe('AI 找茬错误说法溯源锚定', () => {
  it('三条找茬保留三组独立内容，由放映层展开为独立投影片', () => {
    const scene = {
      contentSlots: {
        aiClaim1: '说法一', reveal1: '核查一',
        aiClaim2: '说法二', reveal2: '核查二',
        aiClaim3: '说法三', reveal3: '核查三',
      },
      misconceptionSources: ['误区一', '误区二', '误区三'],
    }

    expect(aiVerifyPairs(scene)).toEqual([
      { index: 1, source: '误区一', claim: '说法一', reveal: '核查一' },
      { index: 2, source: '误区二', claim: '说法二', reveal: '核查二' },
      { index: 3, source: '误区三', claim: '说法三', reveal: '核查三' },
    ])
  })

  it('单条找茬保留一组待核查说法与结论', () => {
    const scene = { contentSlots: { aiClaim: '单条说法', reveal: '单条核查' }, misconceptionSource: '单条误区' }
    expect(aiVerifyPairs(scene)).toMatchObject([{ index: 1, claim: '单条说法', reveal: '单条核查' }])
  })

  it('保留仍紧扣教研误区原文的自然改写', () => {
    const source = '板块运动速度肉眼可见'
    const contentSlots = {
      aiClaim: '我觉得板块运动速度肉眼可见，所以站在地面上就能直接看到大陆移动。',
      reveal: '板块运动极其缓慢，需要长期测量才能识别。',
    }

    expect(normalizeAiVerifyClaims({ misconceptionSource: source }, contentSlots)).toEqual(contentSlots)
  })

  it('单条错误说法偏离时回退到原文锚定说法，保留模型揭底', () => {
    const source = '板块运动速度肉眼可见'
    const contentSlots = {
      aiClaim: '我觉得三角形内角和是二百度。',
      reveal: '板块运动极其缓慢，需要长期测量才能识别。',
    }

    const normalized = normalizeAiVerifyClaims({ misconceptionSource: source }, contentSlots)

    expect(normalized.aiClaim).toContain(source)
    expect(normalized.reveal).toBe(contentSlots.reveal)
    expect(aiVerifyTextOverlapRatio(source, normalized.aiClaim!)).toBeGreaterThanOrEqual(AI_VERIFY_OVERLAP_THRESHOLD)
  })

  it('多条误区逐条归一并重建偏离的合并说法，不替模型编造揭底', () => {
    const sources = ['移项不用变号', '系数化 1 时符号不变']
    const normalized = normalizeAiVerifyClaims(
      { misconceptionSources: sources },
      {
        aiClaim: '我觉得今天只需要讨论三角形。',
        aiClaim1: '我认为移项不用变号。',
        aiClaim2: '我认为平行线一定相交。',
        reveal1: '移项跨越等号时必须改变符号。',
      },
    )

    expect(normalized.aiClaim1).toBe('我认为移项不用变号。')
    expect(normalized.aiClaim2).toContain(sources[1])
    expect(normalized.aiClaim).toContain(sources[0])
    expect(normalized.aiClaim).toContain(sources[1])
    expect(normalized.reveal1).toBe('移项跨越等号时必须改变符号。')
    expect(normalized.reveal2).toBeUndefined()
  })

  it('没有误区溯源时不伪造错误说法', () => {
    const contentSlots = { aiClaim: '模型原说法', reveal: '模型原揭底' }
    expect(normalizeAiVerifyClaims({}, contentSlots)).toBe(contentSlots)
  })
})

describe('辨析页错误说法溯源锚定', () => {
  it('保留紧扣来源的学生口吻,模型改成无关错误时回退原文', () => {
    const source = '把海岸线吻合直接当成大陆漂移的充分证据'
    const grounded = {
      misconception: '有同学认为海岸线吻合就足以证明大陆发生过漂移。',
      correction: '还要结合岩层、古生物和测量证据判断。',
    }
    expect(normalizeGroundedContrastClaim({ misconceptionSource: source }, grounded)).toBe(grounded)

    const drifted = normalizeGroundedContrastClaim(
      { misconceptionSource: source },
      { misconception: '三角形内角和是二百度。', correction: grounded.correction },
    )
    expect(drifted.misconception).toContain(source)
    expect(drifted.correction).toBe(grounded.correction)
  })

  it('没有来源时不替课程编造误区', () => {
    const contentSlots = { misconception: '模型原说法', correction: '模型原修正' }
    expect(normalizeGroundedContrastClaim({}, contentSlots)).toBe(contentSlots)
  })
})

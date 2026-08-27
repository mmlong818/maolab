import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../../../../lib/mainline/generation/cast-preset.js'
import { compileLessonFromKps } from '../../../../lib/mainline/generation/compile-lesson.js'
import { misconceptionSourcesOf, type LessonScene, type MainlineCourse } from '../../../../lib/mainline/domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../../../../lib/mainline/samples.js'
import {
  AI_INQUIRY_MASTERS,
  AI_VERIFY_MASTERS,
  pickAiInquiryMaster,
  pickAiVerifyMaster,
} from '../ai-master-select.js'

/**
 * ai-verify/ai-inquiry 母版选择测试(2026-07-21 4+3 母版扩容)
 *
 * conceptual 型 KP 已有 contrast 步骤吃掉 misconceptions[0],ai-verify 只收编
 * 第 2 条起的剩余误区(skeleton-library.ts aiVerifyStepsFor)——传 2 条时 ai-verify
 * 恰好收编 1 条(单条态,misconceptionSource),传 3/4 条时收编 2/3 条(合并态,
 * misconceptionSources),与 quality-gates.test.ts 的既有验证方式一致。
 */
function compileConceptualWithMisconceptions(misconceptions: string[]): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-m', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions }],
    gradeBand: 'middle-school',
    subject: 'geography',
    preset,
  })
}

function findAiVerify(course: MainlineCourse): LessonScene {
  const scene = course.scenes.find(s => s.sceneType === 'ai-verify')
  if (!scene) throw new Error('测试夹具未产出 ai-verify 幕,检查 misconceptions 输入是否够数')
  return scene
}

describe('pickAiVerifyMaster · 母版选择', () => {
  it('合并幕(细分槽 N≥2)权重优先找茬清单式,但不锁死——同课多条合并幕仍能开出别的母版', () => {
    const course = compileConceptualWithMisconceptions([
      '海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见', '大陆漂移只发生在过去,现在已经停止',
    ])
    const verify = findAiVerify(course)
    expect(misconceptionSourcesOf(verify).length).toBeGreaterThanOrEqual(2)

    // 真实建课数据显示几乎所有课的 ai-verify 幕都是合并态(误区标注常年≥3条),
    // 若给清单式 100% 概率会让全库 ai-verify 幕重新变回清一色同款——本轮扩容
    // 要根治的正是这个病灶,所以合并态也必须留其余三个母版的份额。
    const tally: Record<string, number> = {}
    const SAMPLE_SIZE = 60
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const clonedCourse = structuredClone(course)
      const clonedVerify = structuredClone(verify)
      clonedCourse.id = `course-merge-${i}`
      clonedVerify.id = `scene-merge-${i}`
      const master = pickAiVerifyMaster(clonedCourse, clonedVerify)
      tally[master] = (tally[master] ?? 0) + 1
    }
    const entries = Object.entries(tally)
    // 清单式必须是命中最多的候选(权重优先),但至少还要有一个别的母版出现过。
    const [topMaster, topCount] = entries.reduce((a, b) => (b[1] > a[1] ? b : a))
    expect(topMaster).toBe('checklist')
    expect(topCount).toBeLessThan(SAMPLE_SIZE)
    expect(entries.length).toBeGreaterThan(1)
  })

  it('单条误区(sourcesCount=1)时只在①对照/②审讯式/④便签钉板式之间轮换,不落到③清单式', () => {
    const course = compileConceptualWithMisconceptions(['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'])
    const verify = findAiVerify(course)
    expect(misconceptionSourcesOf(verify).length).toBe(1)

    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const clonedCourse = structuredClone(course)
      const clonedVerify = structuredClone(verify)
      clonedCourse.id = `course-single-${i}`
      clonedVerify.id = `scene-single-${i}`
      const master = pickAiVerifyMaster(clonedCourse, clonedVerify)
      expect(master).not.toBe('checklist')
      seen.add(master)
    }
    // 真正轮换:24 个不同 id 里至少要覆盖 2 种以上母版,不能全部落到同一个。
    expect(seen.size).toBeGreaterThan(1)
  })

  it('同一 (course.id, scene.id) 组合选择结果稳定(确定性哈希,不是随机数)', () => {
    const course = compileConceptualWithMisconceptions(['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'])
    const verify = findAiVerify(course)
    const first = pickAiVerifyMaster(course, verify)
    for (let i = 0; i < 5; i++) expect(pickAiVerifyMaster(course, verify)).toBe(first)
  })

  it('母版清单本身无重复项(不许魔数散落导致同一母版重复登记)', () => {
    expect(new Set(AI_VERIFY_MASTERS).size).toBe(AI_VERIFY_MASTERS.length)
    expect(AI_VERIFY_MASTERS.length).toBe(4)
  })
})

describe('pickAiInquiryMaster · 母版选择', () => {
  it('三母版之间按哈希轮换,覆盖①对照/②瀑布式/③对话流式', () => {
    const course = GOLDEN_MAINLINE_COURSES[0]!
    const scene = course.scenes[0]!
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const clonedCourse = structuredClone(course)
      const clonedScene = structuredClone(scene)
      clonedCourse.id = `course-inquiry-${i}`
      clonedScene.id = `scene-inquiry-${i}`
      seen.add(pickAiInquiryMaster(clonedCourse, clonedScene))
    }
    expect(seen.size).toBeGreaterThan(1)
    for (const master of seen) expect(AI_INQUIRY_MASTERS).toContain(master)
  })

  it('同一 (course.id, scene.id) 组合选择结果稳定', () => {
    const course = GOLDEN_MAINLINE_COURSES[0]!
    const scene = course.scenes[0]!
    const first = pickAiInquiryMaster(course, scene)
    for (let i = 0; i < 5; i++) expect(pickAiInquiryMaster(course, scene)).toBe(first)
  })

  it('母版清单本身无重复项', () => {
    expect(new Set(AI_INQUIRY_MASTERS).size).toBe(AI_INQUIRY_MASTERS.length)
    expect(AI_INQUIRY_MASTERS.length).toBe(3)
  })
})

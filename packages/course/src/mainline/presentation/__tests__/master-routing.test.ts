import { describe, expect, it } from 'vitest'
import type { GradeBand, SubjectId } from '../../domain.js'
import { compositionFor } from '../composition.js'
import { MASTER_IDS, SCENE_TYPES } from '../layout-form-registry.js'
import {
  aiMasterFactor,
  MASTER_TRAITS,
  masterBucketsFor,
  masterWeightFor,
  pickMasterRouted,
  subjectFamilyOf,
  WEIGHT_FLOOR,
  type RoutedSceneType,
  type SubjectFamily,
} from '../master-routing.js'

/**
 * 学段学科表现路由测试(2026-07-22,docs/design-refresh/2026-07-22-k12-presentation-space.md 方向一)
 *
 * 四个承诺:①登记完备(每母版必有气质登记,与 layout-form-registry 同一命名
 * 空间)②倾斜不锁死(权重地板)③倾斜真实生效(学段单调性 + 学科亲缘 + 落点
 * 分布)④确定性(同 course+scene 永远同签)。
 */

const ROUTED: readonly RoutedSceneType[] = ['source-reading', 'concept-build', 'worked-example', 'practice', 'recap', 'contrast', 'ai-collab', 'visual-observation']
const ALL_BANDS: readonly GradeBand[] = ['lower-primary', 'upper-primary', 'middle-school', 'high-school']
const ALL_FAMILIES: readonly SubjectFamily[] = ['reasoning', 'literary', 'nature', 'language', 'general']
const ALL_SUBJECTS: readonly SubjectId[] = ['chinese', 'math', 'science', 'english', 'history', 'politics', 'geography', 'physics', 'chemistry', 'biology', 'general']

describe('气质登记完备性', () => {
  it('五个路由幕型的登记条数与母版 id 与 layout-form-registry 的 MASTER_IDS 逐一对齐', () => {
    for (const sceneType of ROUTED) {
      const traits = MASTER_TRAITS[sceneType]
      expect(traits.map(t => t.id)).toEqual([...MASTER_IDS[sceneType]])
    }
  })

  it('每个学科都有学科族归属(新增 SubjectId 未登记会在这里断掉)', () => {
    for (const subject of ALL_SUBJECTS) {
      expect(ALL_FAMILIES).toContain(subjectFamilyOf(subject))
    }
  })
})

describe('倾斜不锁死:权重地板', () => {
  it('任何母版在任何学段×学科族下权重 ≥ WEIGHT_FLOOR,整数桶 ≥1', () => {
    for (const sceneType of ROUTED) {
      for (const band of ALL_BANDS) {
        for (const traits of MASTER_TRAITS[sceneType]) {
          for (const family of ALL_FAMILIES) {
            expect(masterWeightFor(traits, band, family)).toBeGreaterThanOrEqual(WEIGHT_FLOOR)
          }
        }
        for (const subject of ALL_SUBJECTS) {
          for (const bucket of masterBucketsFor({ gradeBand: band, subject }, sceneType)) {
            expect(bucket).toBeGreaterThanOrEqual(1)
          }
        }
      }
    }
  })
})

describe('倾斜真实生效:学段单调性与学科亲缘', () => {
  it('playful+airy 母版(practice 居中放大式)低学段权重高于高中,austere+dense 母版(practice 棋盘式)反向', () => {
    const centered = MASTER_TRAITS.practice[1]!
    const checkerboard = MASTER_TRAITS.practice[3]!
    expect(masterWeightFor(centered, 'lower-primary', 'general')).toBeGreaterThan(masterWeightFor(centered, 'high-school', 'general'))
    expect(masterWeightFor(checkerboard, 'high-school', 'general')).toBeGreaterThan(masterWeightFor(checkerboard, 'lower-primary', 'general'))
  })

  it('白为主母版层禁整页深底(2026-07-23 拍板):全部登记母版 ground 均为 paper', () => {
    // dark-ground 母版已全部转白底(concept-build 全出血/聚光、recap Focus/断点、
    // 新增引进的深底款)。这条守卫编码「母版层禁深底」法则,防未来母版又登记 dark。
    for (const sceneType of Object.keys(MASTER_TRAITS) as (keyof typeof MASTER_TRAITS)[]) {
      for (const traits of MASTER_TRAITS[sceneType]) {
        expect(traits.ground, `${sceneType}/${traits.id}`).toBe('paper')
      }
    }
  })

  it('学段因子仍作用于密度/正式度(以棋盘 dense 高中升权、玩心低学段升权为例)', () => {
    const matrix = MASTER_TRAITS['concept-build'][4]! // dense/austere
    expect(masterWeightFor(matrix, 'high-school', 'general')).toBeGreaterThan(masterWeightFor(matrix, 'lower-primary', 'general'))
    const playful = MASTER_TRAITS.practice[1]! // airy/playful
    expect(masterWeightFor(playful, 'lower-primary', 'general')).toBeGreaterThan(masterWeightFor(playful, 'high-school', 'general'))
  })

  it('学科亲缘:纵嵌推导式亲数理,注疏式亲文史,时间线式亲文史,勘辨式亲文史', () => {
    const stacked = MASTER_TRAITS['worked-example'][1]!
    const annotation = MASTER_TRAITS['concept-build'][1]!
    const timeline = MASTER_TRAITS.recap[1]!
    const errata = MASTER_TRAITS.contrast[2]!
    expect(masterWeightFor(stacked, 'middle-school', 'reasoning')).toBeGreaterThan(masterWeightFor(stacked, 'middle-school', 'literary'))
    expect(masterWeightFor(annotation, 'middle-school', 'literary')).toBeGreaterThan(masterWeightFor(annotation, 'middle-school', 'reasoning'))
    expect(masterWeightFor(timeline, 'middle-school', 'literary')).toBeGreaterThan(masterWeightFor(timeline, 'middle-school', 'reasoning'))
    expect(masterWeightFor(errata, 'middle-school', 'literary')).toBeGreaterThan(masterWeightFor(errata, 'middle-school', 'reasoning'))
  })
})

describe('落点分布(演示样本命中核对的机器版)', () => {
  function tallyOf(gradeBand: GradeBand, subject: SubjectId, sceneType: RoutedSceneType): Record<number, number> {
    const tally: Record<number, number> = {}
    for (let i = 0; i < 80; i++) {
      const master = pickMasterRouted({ id: `route-fake-${gradeBand}-${subject}-${i}`, gradeBand, subject }, { id: `scene-${i}` }, sceneType)
      tally[master] = (tally[master] ?? 0) + 1
    }
    return tally
  }

  it('小学低段 practice 命中最多的是低负荷玩心款(airy+playful),且不锁死(≥2 种母版出现)', () => {
    // Wave2 扩充后 practice 有 10 母版,低负荷玩心款不止 #1(如 #8 印章气泡也是 airy/playful);
    // 断言从"具体索引 #1"改为"命中最多者气质=airy+playful",对增删母版稳健、意图不变。
    const tally = tallyOf('lower-primary', 'general', 'practice')
    const top = Number(Object.entries(tally).reduce((a, b) => (b[1] > a[1] ? b : a))[0])
    const topTraits = MASTER_TRAITS.practice[top]!
    expect(topTraits.density, `top=#${top}`).toBe('airy')
    expect(topTraits.formality, `top=#${top}`).toBe('playful')
    expect(Object.keys(tally).length).toBeGreaterThan(1)
  })

  it('高中语文 concept-build 命中最多的是注疏式(#1),且不锁死', () => {
    const tally = tallyOf('high-school', 'chinese', 'concept-build')
    const top = Number(Object.entries(tally).reduce((a, b) => (b[1] > a[1] ? b : a))[0])
    expect(top).toBe(1)
    expect(Object.keys(tally).length).toBeGreaterThan(1)
  })

  it('初中数学 worked-example 命中最多的是纵嵌推导式(#1)——演示课「三角形中线」即此档', () => {
    const tally = tallyOf('middle-school', 'math', 'worked-example')
    const top = Number(Object.entries(tally).reduce((a, b) => (b[1] > a[1] ? b : a))[0])
    expect(top).toBe(1)
    expect(Object.keys(tally).length).toBeGreaterThan(1)
  })

  it('同学段同学科下不同幕型不是同一张权重表(路由是幕型级,不是课级换皮)', () => {
    const a = masterBucketsFor({ gradeBand: 'high-school', subject: 'physics' }, 'worked-example')
    const b = masterBucketsFor({ gradeBand: 'high-school', subject: 'physics' }, 'recap')
    expect(a).not.toEqual(b)
  })
})

describe('学习时期因子(方向三 v1)', () => {
  it('缺省/new 时期 = 现行为零回退(权重与不传 phase 完全一致)', () => {
    for (const sceneType of ROUTED) {
      for (const traits of MASTER_TRAITS[sceneType]) {
        expect(masterWeightFor(traits, 'middle-school', 'general', 'new')).toBe(masterWeightFor(traits, 'middle-school', 'general'))
      }
    }
  })

  it('考前时期高密度检核形态升权、玩心降权(practice 棋盘 vs 居中放大)', () => {
    const checkerboard = MASTER_TRAITS.practice[3]!
    const centered = MASTER_TRAITS.practice[1]!
    expect(masterWeightFor(checkerboard, 'middle-school', 'general', 'exam-prep')).toBeGreaterThan(masterWeightFor(checkerboard, 'middle-school', 'general', 'new'))
    expect(masterWeightFor(centered, 'middle-school', 'general', 'exam-prep')).toBeLessThan(masterWeightFor(centered, 'middle-school', 'general', 'new'))
  })

  it('时期因子进选择:同课同幕在考前档可能换签,且权重表确与新授不同', () => {
    const base = { gradeBand: 'middle-school' as GradeBand, subject: 'math' as SubjectId }
    expect(masterBucketsFor({ ...base, lessonPhase: 'exam-prep' }, 'practice')).not.toEqual(masterBucketsFor(base, 'practice'))
  })
})

describe('确定性', () => {
  it('同 (course.id, scene.id) 多次选择结果稳定', () => {
    const course = { id: 'stable-course', gradeBand: 'upper-primary' as GradeBand, subject: 'biology' as SubjectId }
    const scene = { id: 'stable-scene' }
    const first = pickMasterRouted(course, scene, 'concept-build')
    for (let i = 0; i < 5; i++) expect(pickMasterRouted(course, scene, 'concept-build')).toBe(first)
  })
})

describe('ai 幕型学段学科因子', () => {
  it('中学基线因子全为 1(既有 ai-verify/ai-inquiry 行为零回退锚点)', () => {
    const course = { gradeBand: 'middle-school' as GradeBand, subject: 'geography' as SubjectId }
    for (const master of ['comparison', 'interrogation', 'checklist', 'sticky-note']) {
      expect(aiMasterFactor('ai-verify', master, course)).toBe(1)
    }
  })

  it('低学段英语的对话流因子高于中学通识(playful × language 亲缘)', () => {
    const primary = aiMasterFactor('ai-inquiry', 'chat', { gradeBand: 'lower-primary' as GradeBand, subject: 'english' as SubjectId })
    const middle = aiMasterFactor('ai-inquiry', 'chat', { gradeBand: 'middle-school' as GradeBand, subject: 'general' as SubjectId })
    expect(primary).toBeGreaterThan(middle)
  })

  it('未登记的母版 id 因子回退 1,不炸', () => {
    expect(aiMasterFactor('ai-verify', 'no-such-master', { gradeBand: 'middle-school' as GradeBand, subject: 'math' as SubjectId })).toBe(1)
  })
})

describe('四轴合成接入 K12 路由(compositionFor 加权)', () => {
  // 用 contrast 作路由加权的样本幕型:visual-observation 的四轴「合成」仍锁定 band-top
  // (见 composition.ts IMAGE_FORM_FIT),无 cover-full/rail-cards 形态分布,无法体现
  // compositionFor 的学段加权差异;contrast 的池仍含二者。(观察幕的多样性走的是另一根轴——
  // Wave3 起 visual-slide.tsx 的 5 母版 pickMasterRouted,不经 compositionFor,见其独立测试。)
  function imageScene(id: string) {
    return {
      id,
      sceneType: 'contrast',
      imageUrl: '/x.png',
      dialogueLayout: 'corner-avatar',
      contentSlots: {},
      boardText: [],
    } as never
  }

  function tallyOf(gradeBand: GradeBand): { coverFull: number; railCards: number } {
    let coverFull = 0
    let railCards = 0
    for (let i = 0; i < 120; i++) {
      const c = compositionFor(imageScene(`vo-scene-${i}`), `course-${i}`, { gradeBand, subject: 'general' })
      if (c.image === 'cover-full') coverFull++
      if (c.text === 'rail-cards') railCards++
    }
    return { coverFull, railCards }
  }

  it('低学段偏满幅沉浸大图,高中偏批注侧栏——同一批幕在两学段分布显著不同', () => {
    const primary = tallyOf('lower-primary')
    const high = tallyOf('high-school')
    expect(primary.coverFull).toBeGreaterThan(high.coverFull)
    expect(high.railCards).toBeGreaterThan(primary.railCards)
  })

  it('不传 routing 时保持均匀轮换(既有行为零回退)', () => {
    const a = compositionFor(imageScene('legacy-scene'), 'legacy-course')
    const b = compositionFor(imageScene('legacy-scene'), 'legacy-course')
    expect(a.id).toBe(b.id)
  })
})

describe('与 layout-form-registry 的命名空间一致性', () => {
  it('路由幕型全部在 SCENE_TYPES 内', () => {
    for (const sceneType of ROUTED) expect(SCENE_TYPES).toContain(sceneType)
  })
})

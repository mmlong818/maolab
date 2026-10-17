import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import type { MainlineCourse } from '../../domain.js'
import { rehearseCourse } from '../engine.js'

/**
 * 排练引擎测试。重点不是「跑得出报告」,而是锁住 v5 §7/§10 的两条红线:
 * **每条反应可溯源** 与 **无依据时宁可少产出**。这两条一旦松掉,排练场就退化成
 * 「AI 模拟课堂」玩具,教师看到的问题不可信,整个 M3 的价值归零。
 */

const MISCONCEPTIONS = ['以为二力平衡要求两个力作用在不同物体上']

function courseWith(opts: { misconceptions?: string[]; withContrast?: boolean } = {}): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
  const course = compileLessonFromKps({
    kps: [{
      id: 'kp-1',
      canonicalName: '二力平衡',
      knowledgeType: opts.withContrast === false ? 'procedural' : 'conceptual',
      ...(opts.misconceptions ? { misconceptions: opts.misconceptions } : {}),
    }],
    gradeBand: 'middle-school',
    subject: 'physics',
    preset,
  })
  return course
}

/** 薄弱学情(低于 isWeakMastery 阈值)。 */
const WEAK = new Map([['kp-1', 0.35]])
const VERY_WEAK = new Map([['kp-1', 0.1]])
const SOLID = new Map([['kp-1', 0.9]])
const NO_RECORD = new Map<string, number>()

describe('红线一 · 每条反应必须可溯源', () => {
  it('所有 reaction 与 weakness 都带 evidence,且 kpId 非空', () => {
    const report = rehearseCourse(courseWith({ misconceptions: MISCONCEPTIONS }), WEAK)
    expect(report.reactions.length).toBeGreaterThan(0)
    for (const r of report.reactions) {
      expect(r.evidence).toBeDefined()
      expect(r.evidence.kpId).toBe('kp-1')
    }
    for (const w of report.weaknesses) {
      expect(w.evidence).toBeDefined()
      expect(w.evidence.kpId.length).toBeGreaterThan(0)
    }
  })

  it('犯错的内容逐字等于教材标注原文,不是引擎自己编的错法', () => {
    const report = rehearseCourse(courseWith({ misconceptions: MISCONCEPTIONS }), WEAK)
    const errors = report.reactions.filter(r => r.evidence.from === 'misconception')
    expect(errors.length).toBeGreaterThan(0)
    for (const e of errors) {
      expect(e.evidence.from).toBe('misconception')
      if (e.evidence.from === 'misconception') expect(MISCONCEPTIONS).toContain(e.evidence.text)
      expect(e.utterance).toContain(MISCONCEPTIONS[0]!)
    }
  })
})

describe('红线二 · 无依据时宁可少产出', () => {
  it('没有学情记录 → 零反应(不拿默认值当薄弱)', () => {
    const report = rehearseCourse(courseWith({ misconceptions: MISCONCEPTIONS }), NO_RECORD)
    expect(report.reactions).toEqual([])
    expect(report.weaknesses).toEqual([])
  })

  it('掌握度良好 → 零反应', () => {
    expect(rehearseCourse(courseWith({ misconceptions: MISCONCEPTIONS }), SOLID).reactions).toEqual([])
  })

  it('薄弱但无标注误区 → 只提问/走神,绝不产出 error(不替教材发明错法)', () => {
    const report = rehearseCourse(courseWith(), WEAK)
    expect(report.reactions.length).toBeGreaterThan(0)
    expect(report.reactions.some(r => r.kind === 'error')).toBe(false)
    for (const r of report.reactions) expect(r.evidence.from).toBe('mastery')
  })

  it('教材索引明确没有误区时不混回课程里的旧溯源字段', () => {
    const course = courseWith({ misconceptions: MISCONCEPTIONS })
    const currentTextbook = new Map<string, readonly string[]>([['kp-1', []]])
    const report = rehearseCourse(course, WEAK, 'teacher', currentTextbook)

    expect(report.reactions).toHaveLength(1)
    expect(report.reactions[0]!.evidence.from).toBe('mastery')
    expect(report.weaknesses.some(weakness => weakness.kind === 'unanswered-question')).toBe(false)
  })

  it('课程没有学生卡司时由陪读同学兜底,反应仍必须带证据', () => {
    // C-1'' 起排练场会按上下文补一位陪读同学,所以「无学生卡司」不再等于「零反应」。
    // 红线守的是**证据**不是人数:补人不等于编造,反应照样必须溯源。
    // 「无学情 → 零反应」那条红线由上面的用例单独守。
    const course = courseWith({ misconceptions: MISCONCEPTIONS })
    const noStudents = { ...course, castProfiles: course.castProfiles.filter(c => c.role === 'teacher') }
    const report = rehearseCourse(noStudents, WEAK)
    expect(report.students.length).toBe(1)
    for (const r of report.reactions) expect(r.evidence.kpId).toBe('kp-1')
  })

  it('契约里声明但尚无数据支撑的 fragile-analogy 不产出(不编造)', () => {
    const report = rehearseCourse(courseWith({ misconceptions: MISCONCEPTIONS }), WEAK)
    expect(report.weaknesses.some(w => w.kind === 'fragile-analogy')).toBe(false)
  })
})

/**
 * 多学生 + 多误区的 fixture。
 * **必须用它测确定性**:现行卡司预设只给 1 名学生,单学生时「随机分配」与
 * 「确定性分配」结果相同,测试会失去判别力(2026-07-27 反证时发现:把分配换成
 * Math.random 后 14/14 照样通过)。
 */
const MANY_MISCONCEPTIONS = ['误区甲:以为合力一定更大', '误区乙:以为平衡力作用在两个物体上', '误区丙:以为静止就没有受力']

function courseWithFourStudents(): MainlineCourse {
  const course = courseWith({ misconceptions: MANY_MISCONCEPTIONS })
  const seed = course.castProfiles.find(c => c.role === 'student')!
  const extra = [1, 2, 3].map(i => ({ ...seed, id: `${seed.id}-x${i}`, displayName: `同学${i}` }))
  return { ...course, castProfiles: [...course.castProfiles, ...extra] }
}

describe('确定性 · 复排必须可比对', () => {
  it('同课同学情跑两次,报告完全一致(多学生多误区,分配真的有变数)', () => {
    const course = courseWithFourStudents()
    const report = rehearseCourse(course, WEAK)
    expect(report.students.length).toBeGreaterThan(1) // 守住 fixture 本身的判别力
    expect(new Set(report.reactions.map(r => r.studentId)).size).toBeGreaterThan(1)
    expect(report).toEqual(rehearseCourse(course, WEAK))
  })

  it('同课同学情跑两次,报告完全一致', () => {
    const course = courseWith({ misconceptions: MISCONCEPTIONS })
    expect(rehearseCourse(course, WEAK)).toEqual(rehearseCourse(course, WEAK))
  })

  it('学情变化时报告随之变化(不是写死的)', () => {
    const course = courseWith({ misconceptions: MISCONCEPTIONS })
    expect(rehearseCourse(course, SOLID).reactions.length)
      .not.toBe(rehearseCourse(course, WEAK).reactions.length)
  })

  it('反应落到真实存在的学生身上', () => {
    const course = courseWith({ misconceptions: MISCONCEPTIONS })
    const report = rehearseCourse(course, WEAK)
    const ids = new Set(report.students.map(s => s.id))
    for (const r of report.reactions) expect(ids.has(r.studentId)).toBe(true)
  })
})

describe('反应节奏 · 同一证据不能在全课重复表演', () => {
  it('每条教材误区全课只复现一次，并确定性分散到可反应页面', () => {
    const course = courseWith({ misconceptions: MANY_MISCONCEPTIONS })
    const report = rehearseCourse(course, WEAK)
    const misconceptionReactions = report.reactions.filter(reaction => reaction.evidence.from === 'misconception')

    expect(misconceptionReactions).toHaveLength(MANY_MISCONCEPTIONS.length)
    for (const misconception of MANY_MISCONCEPTIONS) {
      expect(misconceptionReactions.filter(reaction => (
        reaction.evidence.from === 'misconception' && reaction.evidence.text === misconception
      ))).toHaveLength(1)
    }
    const sceneOrder = course.scenes.map(scene => scene.id)
    const reactionOrder = report.reactions.map(reaction => sceneOrder.indexOf(reaction.sceneId))
    expect(reactionOrder).toEqual([...reactionOrder].sort((left, right) => left - right))
    expect(report).toEqual(rehearseCourse(course, WEAK))
  })

  it('薄弱但没有教材误区时，同一知识点全课只出现一次没跟上或掉队', () => {
    const report = rehearseCourse(courseWith(), WEAK)
    expect(report.reactions).toHaveLength(1)
    expect(report.reactions[0]).toMatchObject({ kind: 'question', evidence: { from: 'mastery', kpId: 'kp-1', score: 0.35 } })
  })
})

describe('C-3 · AI 原住民时刻', () => {
  it('把一条误区反应改写成「我问 AI」,证据完全不变(不需要新数据)', () => {
    const report = rehearseCourse(courseWithFourStudents(), WEAK)
    const ai = report.reactions.filter(r => r.kind === 'ai-native-challenge')
    expect(ai.length).toBe(1)
    expect(ai[0]!.utterance).toContain('我问 AI')
    expect(ai[0]!.evidence.from).toBe('misconception')
    if (ai[0]!.evidence.from === 'misconception') {
      expect(MANY_MISCONCEPTIONS).toContain(ai[0]!.evidence.text)
      expect(ai[0]!.utterance).toContain(ai[0]!.evidence.text)
    }
  })

  it('全课至多一次——它是一个时刻,不是某个学生的性格', () => {
    const report = rehearseCourse(courseWithFourStudents(), WEAK)
    expect(report.reactions.filter(r => r.kind === 'ai-native-challenge').length).toBeLessThanOrEqual(1)
  })

  it('没有误区可依托时不产出 AI 质疑(同样受可溯源约束)', () => {
    const report = rehearseCourse(courseWith(), WEAK)
    expect(report.reactions.some(r => r.kind === 'ai-native-challenge')).toBe(false)
  })

  it('改写只换 kind 与措辞,不吞掉任何一条误区反应', () => {
    const report = rehearseCourse(courseWithFourStudents(), WEAK)
    const fromMisconception = report.reactions.filter(r => r.evidence.from === 'misconception')
    const errors = fromMisconception.filter(r => r.kind === 'error').length
    const ai = fromMisconception.filter(r => r.kind === 'ai-native-challenge').length
    expect(errors + ai).toBe(fromMisconception.length)
    expect(ai).toBe(1)
  })

  it('每条弱点的证据都能在同一幕的反应里找到(报告自洽,不引用不存在的依据)', () => {
    const course = courseWith({ withContrast: false })
    const target = course.scenes.find(scene => scene.sceneType === 'practice' || scene.sceneType === 'worked-example')!
    const unaddressed: MainlineCourse = {
      ...course,
      scenes: course.scenes.map(scene => scene.id === target.id
        ? { ...scene, kpId: 'kp-1', misconceptionSources: MISCONCEPTIONS }
        : scene),
    }
    const report = rehearseCourse(unaddressed, WEAK)
    expect(report.weaknesses.length).toBeGreaterThan(0)
    for (const w of report.weaknesses) {
      const sameScene = report.reactions.filter(r => r.sceneId === w.sceneId)
      expect(sameScene.some(r => JSON.stringify(r.evidence) === JSON.stringify(w.evidence)), w.detail).toBe(true)
    }
  })
})

describe('同学人数 · 用户拍板 1–2 人', () => {
  it('至多 2 名同学参与排练(颗粒小,4 人会互相稀释)', () => {
    const report = rehearseCourse(courseWithFourStudents(), WEAK)
    expect(report.students.length).toBeLessThanOrEqual(2)
  })
})

describe('学情分档', () => {
  it('极低掌握度走神,中度薄弱提问', () => {
    const course = courseWith()
    expect(rehearseCourse(course, VERY_WEAK).reactions.every(r => r.kind === 'distracted')).toBe(true)
    expect(rehearseCourse(course, WEAK).reactions.every(r => r.kind === 'question')).toBe(true)
  })
})

describe('弱点推导', () => {
  it('误区无任何辨析幕/找茬幕处理 → 报 unanswered-question', () => {
    // procedural 骨架无 contrast 步骤;不给 misconceptions 编课则也不会有 ai-verify 幕,
    // 因此手工把误区溯源挂到一个非处理型幕上,构造「有误区、无人处理」
    const course = courseWith({ withContrast: false })
    const target = course.scenes.find(s => s.sceneType === 'practice' || s.sceneType === 'worked-example')!
    const patched: MainlineCourse = {
      ...course,
      scenes: course.scenes.map(s => s.id === target.id
        ? { ...s, kpId: 'kp-1', misconceptionSources: MISCONCEPTIONS }
        : s),
    }
    const report = rehearseCourse(patched, WEAK)
    expect(report.weaknesses.some(w => w.kind === 'unanswered-question')).toBe(true)
  })

  it('有辨析幕处理该误区 → 不报 unanswered-question', () => {
    const report = rehearseCourse(courseWith({ misconceptions: MISCONCEPTIONS }), WEAK)
    expect(report.weaknesses.some(w => w.kind === 'unanswered-question')).toBe(false)
  })

  it('教材标注刷新后措辞整体漂移 → 报核对档,不误报「全课无幕处理」', () => {
    // 课程辨析幕绑定生成期措辞,教材索引随后整批改写:两边零命中。
    // 引擎不做语义模糊匹配,既不能谎报「未处理」,也不能静默当「已处理」。
    const course = courseWith({ misconceptions: MISCONCEPTIONS })
    const reworded = MISCONCEPTIONS.map(text => `改写后的表述:${text}`)
    const textbookMisconceptions = new Map<string, readonly string[]>([['kp-1', reworded]])

    const report = rehearseCourse(course, WEAK, 'teacher', textbookMisconceptions)
    const driftTexts = report.weaknesses.flatMap(w => (
      w.kind === 'misconception-wording-drift' && w.evidence.from === 'misconception' ? [w.evidence.text] : []
    ))
    expect(driftTexts).toEqual(expect.arrayContaining(reworded))
    expect(report.weaknesses.some(w => w.kind === 'unanswered-question')).toBe(false)
  })

  it('同一知识点只处理部分误区时逐条报告，补齐处理页后复排通过', () => {
    const compiled = courseWith({ misconceptions: MANY_MISCONCEPTIONS })
    const verify = compiled.scenes.find(scene => scene.sceneType === 'ai-verify')!
    const contrast = compiled.scenes.find(scene => scene.sceneType === 'contrast')!
    const contrastSources = contrast.misconceptionSources ?? [contrast.misconceptionSource!]
    const textbookMisconceptions = new Map<string, readonly string[]>([['kp-1', MANY_MISCONCEPTIONS]])

    // 模拟存量课只保留了处理首条误区的辨析页。其余误区已从课程幕里整条漏掉，
    // 但仍存在于当前教材索引；排练必须据此复现并暴露，而不能因课程没写就看不见。
    const partiallyAddressed: MainlineCourse = {
      ...compiled,
      scenes: compiled.scenes.filter(scene => scene.id !== verify.id),
    }
    const before = rehearseCourse(partiallyAddressed, WEAK, 'teacher', textbookMisconceptions)
    const beforeTexts = before.weaknesses.flatMap(weakness => (
      weakness.kind === 'unanswered-question' && weakness.evidence.from === 'misconception'
        ? [weakness.evidence.text]
        : []
    ))

    expect(beforeTexts).not.toContain(contrastSources[0])
    expect(beforeTexts).toEqual(expect.arrayContaining(MANY_MISCONCEPTIONS.slice(1)))
    expect(before.scenesToFix.length).toBeGreaterThan(0)

    // 教师补回逐条处理剩余误区的找茬页后，使用同一份学情复排，未处理弱点消失。
    const repaired: MainlineCourse = {
      ...partiallyAddressed,
      scenes: [...partiallyAddressed.scenes, verify],
    }
    const after = rehearseCourse(repaired, WEAK, 'teacher', textbookMisconceptions)
    expect(after.weaknesses.some(weakness => weakness.kind === 'unanswered-question')).toBe(false)
    expect(after.scenesToFix).toEqual([])
  })

  it('scenesToFix 顺序与幕序一致,且每条都有理由', () => {
    const course = courseWith({ withContrast: false })
    const target = course.scenes.find(s => s.sceneType === 'practice' || s.sceneType === 'worked-example')!
    const patched: MainlineCourse = {
      ...course,
      scenes: course.scenes.map(s => s.id === target.id
        ? { ...s, kpId: 'kp-1', misconceptionSources: MISCONCEPTIONS }
        : s),
    }
    const report = rehearseCourse(patched, WEAK)
    const order = patched.scenes.map(s => s.id)
    const idx = report.scenesToFix.map(f => order.indexOf(f.sceneId))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    for (const f of report.scenesToFix) expect(f.reason.length).toBeGreaterThan(0)
  })
})

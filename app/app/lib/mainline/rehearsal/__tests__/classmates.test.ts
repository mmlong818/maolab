import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import type { GradeBand, MainlineCourse, SubjectId } from '../../domain.js'
import { CLASSMATE_POOL, pickCompanion } from '../classmates.js'
import { rehearseCourse } from '../engine.js'

/**
 * 同学选型路由测试。三条规则各自锁一遍,外加两条铁律:
 * 确定性(同课同场景恒定)与互补而非最优。
 */

function courseOf(gradeBand: GradeBand, subject: SubjectId, misconceptions?: string[]): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand, subject })
  return compileLessonFromKps({
    kps: [{
      id: 'kp-1', canonicalName: '测试知识点', knowledgeType: 'conceptual',
      ...(misconceptions ? { misconceptions } : {}),
    }],
    gradeBand, subject, preset,
  })
}

const NO_MASTERY = new Map<string, number>()
const WEAK = new Map([['kp-1', 0.3]])

describe('规则一 · 硬过滤', () => {
  it('不可担主陪读的候选出局(persona-library 明写小渔「不用她讲主线」)', () => {
    // 这条 fixture 构造成「若无该过滤则小渔必胜」:带两条误区 → 生成 ai-verify 幕
    // → divergent 得 +2;无学情 → 沉默型拿不到 weakMastery 加分。
    // (单条误区会被 contrast 吃掉、不生成 ai-verify,故必须两条)
    const course = courseOf('middle-school', 'physics', ['误区甲', '误区乙'])
    expect(course.scenes.some(s => s.sceneType === 'ai-verify')).toBe(true)
    expect(pickCompanion(course, NO_MASTERY, 'teacher')?.id).not.toBe('student-joker')
  })

  it('学段不匹配的候选出局:高中课选不到只到初中的林小满', () => {
    // 教师场景 + 薄弱学情本会让林小满以 +3 胜出,高中课仍必须落到阿哲身上,
    // 挡住她的只能是学段过滤。
    expect(pickCompanion(courseOf('middle-school', 'physics'), WEAK, 'teacher')?.id).toBe('student-zero')
    expect(pickCompanion(courseOf('high-school', 'physics'), WEAK, 'teacher')?.id).toBe('student-thinker')
  })

  it('无任何合适候选时返回 null,不塞学段不对的人进来', () => {
    expect(pickCompanion(courseOf('lower-primary', 'chinese'), NO_MASTERY, 'teacher')).toBeNull()
  })

  it('候选已在课程卡司里则不重复选入', () => {
    const course = courseOf('middle-school', 'physics')
    const withZero: MainlineCourse = {
      ...course,
      castProfiles: [...course.castProfiles, { ...course.castProfiles[0]!, id: 'student-zero', role: 'peer' }],
    }
    expect(pickCompanion(withZero, NO_MASTERY, 'teacher')?.id).not.toBe('student-zero')
  })
})

describe('规则二 + 三 · 互补与教学需要', () => {
  it('教师场景偏好沉默掉队者(看不见的才危险)', () => {
    expect(pickCompanion(courseOf('middle-school', 'physics'), WEAK, 'teacher')?.displayName).toBe('林小满')
  })

  it('自学场景偏好会当场自我纠错的同学(Bandura:相似但略微领先)', () => {
    expect(pickCompanion(courseOf('middle-school', 'physics'), WEAK, 'self-study')?.displayName).toBe('阿哲')
  })

  it('同一门课两种场景可以选出不同的人——这正是按场景选的意义', () => {
    const course = courseOf('middle-school', 'physics')
    const teacher = pickCompanion(course, WEAK, 'teacher')
    const selfStudy = pickCompanion(course, WEAK, 'self-study')
    expect(teacher?.id).not.toBe(selfStudy?.id)
  })
})

describe('铁律 · 确定性与互补', () => {
  it('同课 + 同场景 → 恒定选同一位(否则复排时同学换人,报告没法比对)', () => {
    const course = courseOf('middle-school', 'physics')
    const first = pickCompanion(course, WEAK, 'teacher')
    for (let i = 0; i < 5; i++) {
      expect(pickCompanion(course, WEAK, 'teacher')?.id).toBe(first?.id)
    }
  })

  it('选出的同学与课程已有同学在气质上不同(互补而非同类叠加)', () => {
    const chosen = pickCompanion(courseOf('middle-school', 'physics'), WEAK, 'teacher')
    const traits = CLASSMATE_POOL.find(c => c.id === chosen?.id)!
    // 现行预设的同学定位是 中/vocal/convergent
    const differing = (traits.skill !== 'mid' ? 1 : 0) + (traits.expression !== 'vocal' ? 1 : 0) + (traits.thinking !== 'convergent' ? 1 : 0)
    expect(differing).toBeGreaterThan(0)
  })

  it('陪读同学不写回课程卡司(排练场专用,不改已验收的课堂形态)', () => {
    const course = courseOf('middle-school', 'physics')
    const before = course.castProfiles.length
    rehearseCourse(course, WEAK, 'teacher')
    expect(course.castProfiles.length).toBe(before)
  })
})

describe('立绘解析(Codex 真检:阿哲被选中却只显示灰底「阿」字)', () => {
  /** 上课时才会写入 castAssetSelection,编课产物没有,故测试里显式给。 */
  function withAssets(course: MainlineCourse): MainlineCourse {
    return { ...course, castAssetSelection: { schoolStage: 'middle', season: 'autumn', resolvedAt: 0 } }
  }

  it('陪读同学随报告带出立绘路径(它不在 castProfiles 里,页面查不到)', () => {
    const course = withAssets(courseOf('middle-school', 'physics', ['误区甲', '误区乙']))
    const companion = pickCompanion(course, WEAK, 'teacher')!
    const student = rehearseCourse(course, WEAK, 'teacher').students.find(s => s.id === companion.id)!
    expect(student.avatarSrc).toBeDefined()
    // 季节由 withClassTimeMainlineCastAssets 按**当前日期**重算,不取课程里存的值,
    // 故只断言学段与角色 id,不写死季节(2026-07-28 实测:7 月解析为 summer)。
    expect(student.avatarSrc).toMatch(/\/cast\/base\/middle\/(summer|autumn)\//)
    expect(student.avatarSrc).toContain(companion.id)
  })

  it('课程自带的同学也一并带出,页面统一读 report.students 即可', () => {
    const course = withAssets(courseOf('middle-school', 'physics', ['误区甲', '误区乙']))
    for (const s of rehearseCourse(course, WEAK, 'teacher').students) {
      expect(s.avatarSrc, s.name).toBeDefined()
    }
  })

  it('课程缺 castAssetSelection 时,陪读同学不猜路径,留空让页面回退首字', () => {
    // 课程自带的同学不受影响——预设本身就带 assetRefs,与本次解析无关。
    const course = courseOf('middle-school', 'physics', ['误区甲', '误区乙'])
    expect(course.castAssetSelection).toBeUndefined()
    const companion = pickCompanion(course, WEAK, 'teacher')!
    const student = rehearseCourse(course, WEAK, 'teacher').students.find(s => s.id === companion.id)!
    expect(student.avatarSrc).toBeUndefined()
  })

  it('解析立绘不污染课程卡司(只在临时副本上跑)', () => {
    const course = withAssets(courseOf('middle-school', 'physics', ['误区甲', '误区乙']))
    const before = course.castProfiles.map(c => c.id).join(',')
    rehearseCourse(course, WEAK, 'teacher')
    expect(course.castProfiles.map(c => c.id).join(',')).toBe(before)
  })
})

describe('接入引擎', () => {
  it('排练时同学从 1 位变为 2 位', () => {
    const course = courseOf('middle-school', 'physics', ['误区甲', '误区乙'])
    const own = course.castProfiles.filter(c => c.role === 'student' || c.role === 'peer').length
    expect(own).toBe(1)
    expect(rehearseCourse(course, WEAK, 'teacher').students.length).toBe(2)
  })

  it('第三参可缺省,既有调用点行为不变(默认 teacher)', () => {
    const course = courseOf('middle-school', 'physics', ['误区甲', '误区乙'])
    expect(rehearseCourse(course, WEAK)).toEqual(rehearseCourse(course, WEAK, 'teacher'))
  })

  it('仍不越过 1–2 人上限', () => {
    const course = courseOf('middle-school', 'physics', ['误区甲', '误区乙'])
    expect(rehearseCourse(course, WEAK, 'self-study').students.length).toBeLessThanOrEqual(2)
  })
})

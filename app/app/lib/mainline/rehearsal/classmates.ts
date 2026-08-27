/**
 * rehearsal/classmates · 同学选型路由(C-1'',2026-07-28)
 *
 * 排练场的第 2 位同学**按上下文选**,不是全局常量——与母版走 pickMasterRouted、
 * 卡司走 pickCastPreset 同一个思路:适配课程、用户与教学需要。
 *
 * 候选来自 `docs/persona-library.md` 已有的三位同学草案(林小满/阿哲/小渔),
 * **不新造人设**;立绘已在 cast 矩阵齐备(各 24 张,3 学段 × 2 季节 × 4 表情,
 * 2026-07-28 核查零缺口)。
 *
 * 三条规则,刻意不做 master-routing 那样的加权乘法表:
 * 候选只有 3 个、槽位只有 1 个,上加权机器是 B-4 那张票的错误重演
 * (为 0–2% 的问题推翻已验收设计)。候选池扩到 5+ 或规则开始互相打架时再升级。
 *
 * 铁律两条:
 * - **确定性**:同课 + 同场景 → 同一位同学。否则教师复排时同学换人,报告没法比对。
 * - **互补而非最优**:选的是「这门课还缺的那种同学」,不是「最好的同学」。
 */

import type { CastProfile, GradeBand, LessonScene, MainlineCourse } from '../domain.js'
import { isWeakMastery } from '../mastery.js'

/** 排练场景。一期只按场景分,不按人——§12 拍板不做账号体系,系统看不到「这个学生是谁」。 */
export type RehearsalScenario = 'teacher' | 'self-study'

/** 同学气质。轴取自 persona-library 的 student_profile schema,不另发明维度。 */
export interface ClassmateTraits {
  /** cast 矩阵角色 id,同时是立绘键 */
  id: string
  name: string
  /** 学力档:persona-library `skill_level` */
  skill: 'weak' | 'mid' | 'strong'
  /** 表达方式:举手发问 vs 内心戏多但不出声 */
  expression: 'vocal' | 'quiet'
  /** 思维方式:收敛分析 / 自我纠错 / 跨域联想 */
  thinking: 'convergent' | 'metacognitive' | 'divergent'
  gradeFit: readonly GradeBand[]
  /**
   * 是否可担任**整场排练的主陪读**。
   * persona-library 对小渔写明「会有失控风险,所以只在开头 + 跨学科类比环节调度她,
   * 不用她讲主线」——排练场目前只有一个全程陪读位,让她坐上去就是违反该约束。
   * 登记在册但不参与选型,等排练场支持「分环节调度」再启用。
   */
  mainlineEligible: boolean
  /** 人设出处,便于回查口头禅与语气 */
  personaRef: string
}

/** 候选池。新增候选时在此登记气质,不改选型逻辑。 */
export const CLASSMATE_POOL: readonly ClassmateTraits[] = [
  {
    id: 'student-zero',
    name: '林小满',
    skill: 'mid',
    expression: 'quiet',
    thinking: 'convergent',
    gradeFit: ['upper-primary', 'middle-school'],
    mainlineEligible: true,
    // 库里的产品价值:「在 worked-example 里不是讲解者,是同时听讲的人」
    // ——给学生一个「代为提问」的代理人。
    personaRef: 'persona-library.md · 林小满(笨拙但坚持型,最像普通学生的镜像;卡在概念的「为什么」)',
  },
  {
    id: 'student-thinker',
    name: '阿哲',
    skill: 'mid',
    expression: 'vocal',
    thinking: 'metacognitive',
    gradeFit: ['middle-school', 'high-school'],
    mainlineEligible: true,
    // 库里的产品价值:「半范例环节由他来填」,示范差一点的同学怎么补完最后那步。
    personaRef: 'persona-library.md · 阿哲(领跑型,稍快一点的够得着榜样;想得快但容易跳步,会自己发现并回去补)',
  },
  {
    id: 'student-joker',
    name: '小渔',
    skill: 'mid',
    expression: 'vocal',
    thinking: 'divergent',
    gradeFit: ['lower-primary', 'upper-primary', 'middle-school'],
    mainlineEligible: false,
    personaRef: 'persona-library.md · 小渔(跳跃型,激发联想的搭档;库中明确「不用她讲主线」)',
  },
]

/** 课程已有同学的气质推断——用于算互补度。卡司里没登记气质,按其人设定位近似。 */
function existingTraitsOf(course: MainlineCourse): Pick<ClassmateTraits, 'skill' | 'expression' | 'thinking'>[] {
  return course.castProfiles
    .filter(c => c.role === 'student' || c.role === 'peer')
    // 现行预设的同学都是「中等学力 / 主动举手 / 收敛分析」定位(承担 questioner +
    // misconception),故统一按此近似。将来预设登记了气质就改读登记值。
    .map(() => ({ skill: 'mid' as const, expression: 'vocal' as const, thinking: 'convergent' as const }))
}

/** 规则二:与已有同学的轴差异数(0–3),越大越互补。 */
function complementScore(candidate: ClassmateTraits, existing: readonly Pick<ClassmateTraits, 'skill' | 'expression' | 'thinking'>[]): number {
  if (existing.length === 0) return 0
  return Math.min(...existing.map(e =>
    (candidate.skill !== e.skill ? 1 : 0)
    + (candidate.expression !== e.expression ? 1 : 0)
    + (candidate.thinking !== e.thinking ? 1 : 0)))
}

/** 本课的教学信号,用于规则三。 */
interface TeachingSignals {
  /** 掌握度普遍薄弱 → 需要有人把「沉默的掉队」演出来 */
  weakMastery: boolean
  /** 有 AI 找茬幕 → 需要有人能从别的角度质疑 */
  hasAiVerify: boolean
  /** KP 以程序性为主 → 需要有人示范「想错了怎么办」 */
  proceduralHeavy: boolean
}

function signalsOf(course: MainlineCourse, mastery: ReadonlyMap<string, number>): TeachingSignals {
  const scored = [...mastery.values()]
  const procedural = course.learningFragments.filter(f => f.skeletonId?.includes('procedural')).length
  return {
    weakMastery: scored.length > 0 && scored.filter(isWeakMastery).length * 2 >= scored.length,
    hasAiVerify: course.scenes.some((s: LessonScene) => s.sceneType === 'ai-verify'),
    proceduralHeavy: procedural * 2 >= course.learningFragments.length && procedural > 0,
  }
}

/**
 * 规则三 + 场景倾向的加分。
 *
 * 场景为什么要分:教师排练与学生自学的诉求相反。
 * - teacher:要**暴露风险**。看不见的才危险,所以偏好沉默掉队者。
 * - self-study:要**陪伴 + 替代性学习**。Bandura 的榜样效应要求榜样「相似但略微
 *   领先」——会当场说「诶我刚才想错了」的那位,把挣扎与突破演给学习者看,
 *   比一个全对的学霸有用。
 */
function needScore(candidate: ClassmateTraits, signals: TeachingSignals, scenario: RehearsalScenario): number {
  let score = 0

  // 掌握度普遍薄弱——**同一信号在两种场景下指向不同的人**,这是场景分野的核心。
  // 教师侧:要暴露「沉默的掉队」,举手的看得见、不出声的看不见。
  // 自学侧:学习者本人就弱,再来一个同样弱的同伴只是同病相怜;按 Bandura,
  //   **应对型榜样**(coping model,会出错然后自己纠正)对低信心学习者比
  //   熟练型榜样更有效——所以该来会说「诶我刚才想错了」的那位。
  if (signals.weakMastery) {
    if (scenario === 'teacher' && candidate.expression === 'quiet') score += 3
    if (scenario === 'self-study' && candidate.thinking === 'metacognitive') score += 3
  }

  // 有 AI 找茬幕 → 需要有人能从别的角度质疑(两种场景同向)。
  // ⚠️ **当前池中此加分不可能生效**:唯一的 divergent 候选是小渔,而她
  // mainlineEligible: false(库中「不用她讲主线」),在规则一就被过滤掉了。
  // 保留而不删,是因为它记录的是选型意图——等排练场支持分环节调度、小渔可上场,
  // 或池中进来别的 divergent 候选,这条立即生效。删了下次还得重新想一遍。
  // (2026-07-28 Codex 复审指出该规则当前为惰性,此处显式标注避免被误读为生效逻辑。)
  if (signals.hasAiVerify && candidate.thinking === 'divergent') score += 2
  // 程序性为主 → 需要有人示范「想错了怎么办」(两种场景同向)
  if (signals.proceduralHeavy && candidate.thinking === 'metacognitive') score += 2

  // 无教学信号时的场景默认倾向
  score += scenario === 'teacher'
    ? (candidate.expression === 'quiet' ? 1 : 0)
    : (candidate.thinking === 'metacognitive' ? 1 : 0)
  return score
}

/** 确定性平局裁决:同课同场景恒定。 */
function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * 为本次排练挑一位陪读同学。无合适候选(如学段全不匹配)返回 null——
 * 宁可只有一位同学,也不塞一个学段不对的人进来。
 */
export function pickCompanion(
  course: MainlineCourse,
  mastery: ReadonlyMap<string, number>,
  scenario: RehearsalScenario,
): CastProfile | null {
  const taken = new Set(course.castProfiles.map(c => c.id))
  // 规则一:硬过滤——不能担主陪读、学段不匹配、或该角色已在卡司里,直接出局
  const eligible = CLASSMATE_POOL.filter(c =>
    c.mainlineEligible && c.gradeFit.includes(course.gradeBand) && !taken.has(c.id))
  if (eligible.length === 0) return null

  const existing = existingTraitsOf(course)
  const signals = signalsOf(course, mastery)

  // 规则二 + 规则三。**教学需要与场景是主导,互补度只作次级偏好**——
  // 用户的原话是「挑选适合的,和课程、用户、教学需要」,互补是配对手法不是目的;
  // 互补若压过教学需要,场景就永远翻不动选择,按场景选也就失去意义(实现时踩到)。
  const ranked = [...eligible].sort((a, b) => {
    const sa = complementScore(a, existing) + needScore(a, signals, scenario)
    const sb = complementScore(b, existing) + needScore(b, signals, scenario)
    if (sa !== sb) return sb - sa
    return hashOf(`${course.id}::${a.id}`) - hashOf(`${course.id}::${b.id}`)
  })

  const chosen = ranked[0]!
  return {
    id: chosen.id,
    role: 'peer',
    displayName: chosen.name,
    identity: chosen.personaRef,
    gradeFit: [...chosen.gradeFit],
    subjectFit: [course.subject],
    visualIdentity: chosen.personaRef,
    expressionSet: ['neutral', 'thinking', 'happy', 'surprised'],
  }
}

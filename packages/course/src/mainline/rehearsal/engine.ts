/**
 * rehearsal/engine · v5 M3 排练引擎(C-1 模拟学生 + C-2 误概念驱动犯错,2026-07-27)
 *
 * 「进教室前先把课上一遍」的模拟侧。四名虚拟学生按**真实学情档案**的掌握度分布
 * 反应,并当场犯出**教材标注的**那个错。
 *
 * 三条设计约束,都是 v5 方案的明文红线:
 * 1. **可溯源**(§7):每条反应带 `evidence`,由类型系统强制。无学情、无标注误区时
 *    宁可少产出,绝不编造(§10 风险表「排练场模拟学生失真」对策)。
 * 2. **确定性**:同一门课 + 同一份学情 → 同一份排练报告。用 (course.id, scene.id,
 *    studentId) 哈希分配,不用 RNG——否则教师复排时看到的问题会漂移,报告失去意义。
 *    这与 master-hash / pickMasterRouted 的确定性理由同源。
 * 3. **单档案**(§12 拍板):学情不做账号体系,mastery 是课级 KP → 分数,不是每个学生
 *    各自一份。学生之间的差异来自确定性分配,不是各自的学情。
 *
 * 纯函数,不依赖 React 与 DB;排练页(Codex)按 types.ts 契约消费。
 */

import { misconceptionSourcesOf, type CastProfile, type LessonScene, type MainlineCourse } from '../domain.js'
import { withClassTimeMainlineCastAssets } from '../cast-asset-runtime.js'
import { isWeakMastery } from '../mastery.js'
import { pickCompanion, type RehearsalScenario } from './classmates.js'
import type {
  RehearsalEvidence,
  RehearsalReaction,
  RehearsalReport,
  RehearsalWeakness,
} from './types.js'

/**
 * 参与排练的同学上限。
 *
 * 2026-07-28 用户拍板 **1–2 人**,不是 v5 §4 原写的 4 人:课程颗粒小,4 个同学会
 * 互相稀释,每个人的反应都失去分量。这也与 `docs/persona-library.md` 的分期一致
 * ——「第一阶段:中文区猫叔 + 一位同学,跑通模板;之后再扩」。
 *
 * 同时用户明确排练场**不只是教师工具,也是学生自学的地点**,虚拟同学要营造
 * 真实上课氛围。这不是排场:persona-library 记的是替代性学习(Bandura)——
 * 看见另一个「学生」挣扎和突破,比看老师演示更容易代入。
 */
const MAX_STUDENTS = 2

/** 31 乘法哈希,与 master-hash 同法:确定性分配,同课稳定、跨课错开。 */
function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * 参加本次排练的同学 = 课程卡司里的同学 + 一位按上下文选出的陪读同学。
 *
 * 陪读同学**只存在于排练场,不写回课程卡司**——排练是教师侧/自学侧的场,
 * 正式课堂的卡司形态已验收,不为排练需要改动它(v5 §9 非目标)。
 */
function studentsOf(
  course: MainlineCourse,
  mastery: ReadonlyMap<string, number>,
  scenario: RehearsalScenario,
): CastProfile[] {
  const own = course.castProfiles.filter(cast => cast.role === 'student' || cast.role === 'peer')
  if (own.length >= MAX_STUDENTS) return own.slice(0, MAX_STUDENTS)
  const companion = pickCompanion(course, mastery, scenario)
  return (companion ? [...own, companion] : own).slice(0, MAX_STUDENTS)
}

/**
 * 按 KP 汇总教材标注的误区原文。与 fact-audit / prep-brief 同源:
 * 读幕上的溯源字段(compile-lesson 保证逐字来自 SkeletonKpInput.misconceptions),
 * 不回查 DB,引擎保持可脱库单测。
 */
function misconceptionsByKp(
  course: MainlineCourse,
  knownMisconceptions?: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()

  // 教材索引是当前权威来源。只要某个 KP 的元数据查得到（即使明确为空），就不再
  // 把课程里可能已经过时的溯源字段混回去；查不到时才退回课程自身，保持脱库可用。
  if (knownMisconceptions) {
    for (const [kpId, sources] of knownMisconceptions) {
      map.set(kpId, [...new Set(sources.map(text => text.trim()).filter(Boolean))])
    }
  }

  for (const scene of course.scenes) {
    if (!scene.kpId) continue
    if (knownMisconceptions?.has(scene.kpId)) continue
    const sources = misconceptionSourcesOf(scene)
    if (sources.length === 0) continue
    const bucket = map.get(scene.kpId) ?? []
    for (const text of sources) if (!bucket.includes(text)) bucket.push(text)
    map.set(scene.kpId, bucket)
  }
  return map
}

/**
 * 本课被辨析幕/找茬幕实际处理过的误区原文。
 *
 * 不能只记 KP id：同一知识点常有多条教材误区，任意一页覆盖其中一条，不代表
 * 其余条目也已处理。逐条保留溯源原文，复排时才能准确判断教师修正是否闭环。
 */
function addressedMisconceptionsByKp(course: MainlineCourse): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const scene of course.scenes) {
    if (!scene.kpId) continue
    if (scene.sceneType !== 'contrast' && scene.sceneType !== 'ai-verify') continue
    const sources = misconceptionSourcesOf(scene)
    if (sources.length === 0) continue
    const covered = map.get(scene.kpId) ?? new Set<string>()
    for (const source of sources) covered.add(source)
    map.set(scene.kpId, covered)
  }
  return map
}

/** 学生只在「讲授/练习」类幕上产生反应——开场扉页与收束幕不制造掉队。 */
const REACTIVE_SCENE_TYPES: readonly LessonScene['sceneType'][] = [
  'concept-build', 'worked-example', 'practice', 'visual-observation',
]

/** 掉队到什么程度才走神(比 isWeakMastery 更低一档,避免一薄弱就满屏走神)。 */
const DISTRACTED_THRESHOLD = 0.25

function reactiveScenesByKp(course: MainlineCourse): Map<string, LessonScene[]> {
  const grouped = new Map<string, LessonScene[]>()
  for (const scene of course.scenes) {
    if (!scene.kpId || !REACTIVE_SCENE_TYPES.includes(scene.sceneType)) continue
    grouped.set(scene.kpId, [...(grouped.get(scene.kpId) ?? []), scene])
  }
  return grouped
}

/**
 * 同一误区全课只表演一次。多个误区从一个稳定起点按页面轮转，既避免全部挤在
 * 第一页，也避免用 RNG 让教师复排时问题漂移。
 */
function sceneForReaction(
  course: MainlineCourse,
  kpId: string,
  scenes: readonly LessonScene[],
  index: number,
): LessonScene | undefined {
  if (scenes.length === 0) return undefined
  const start = hashOf(`${course.id}::${kpId}::reaction-scene`) % scenes.length
  return scenes[(start + index) % scenes.length]
}

function reactionsForKp(
  course: MainlineCourse,
  kpId: string,
  scenes: readonly LessonScene[],
  students: readonly CastProfile[],
  mastery: ReadonlyMap<string, number>,
  misconceptions: ReadonlyMap<string, string[]>,
): RehearsalReaction[] {
  const score = mastery.get(kpId)
  // 无学情记录 = 无依据,不产出反应(宁可少犯错,禁编造)
  if (score === undefined || !isWeakMastery(score) || scenes.length === 0) return []

  const known = misconceptions.get(kpId) ?? []
  if (known.length > 0) {
    const studentStart = hashOf(`${course.id}::${kpId}::reaction-student`) % students.length
    return known.flatMap((text, index) => {
      const scene = sceneForReaction(course, kpId, scenes, index)
      if (!scene) return []
      const student = students[(studentStart + index) % students.length]
      if (!student) return []
      return [{
        sceneId: scene.id,
        studentId: student.id,
        studentName: student.displayName,
        kind: 'error',
        utterance: `我是这么理解的：${text}`,
        evidence: { from: 'misconception', kpId, text },
      } satisfies RehearsalReaction]
    })
  }

  // 没有教材误区时只能依据掌握度提问/走神，且同一 KP 全课至多一次。
  const scene = sceneForReaction(course, kpId, scenes, 0)
  const student = scene ? students[hashOf(`${course.id}::${scene.id}::q`) % students.length] : undefined
  if (!scene || !student) return []
  return [{
    sceneId: scene.id,
    studentId: student.id,
    studentName: student.displayName,
    kind: score < DISTRACTED_THRESHOLD ? 'distracted' : 'question',
    utterance: score < DISTRACTED_THRESHOLD
      ? '（走神了，没跟上这一段）'
      : '老师，这一步我没跟上，可以再讲一遍吗？',
    evidence: { from: 'mastery', kpId, score },
  }]
}

/**
 * C-3 · AI 原住民时刻:把**一条**误区反应改写成「我问 AI,它说……」。
 *
 * 这里不给它单独一个人设。原设想是四人中专设一个 AI 原住民,但用户拍板同学只留
 * 1–2 人,再劈一个专属角色就把本就稀薄的班级切碎了。改为**行为而非角色**:
 * 「学生拿 AI 的答案来质疑」本质上就是把某条误区换个来源说出来,证据完全相同,
 * 所以不需要新数据也不需要新人设——这正是 evidence 模型撑得住的地方。
 *
 * 全课至多一次:这是一个训练教师应对的**时刻**,不是学生的性格。每幕都来一次,
 * 既不真实,也会把「AI 说的不一定对」这个 AI 素养点讲油。
 * 取第一条误区反应(顺序已由幕序 + 确定性分配定死,故本身也是确定的)。
 */
function withAiNativeMoment(reactions: readonly RehearsalReaction[]): RehearsalReaction[] {
  const index = reactions.findIndex(r => r.kind === 'error' && r.evidence.from === 'misconception')
  if (index < 0) return [...reactions]
  const target = reactions[index]!
  if (target.evidence.from !== 'misconception') return [...reactions]
  const rewritten: RehearsalReaction = {
    ...target,
    kind: 'ai-native-challenge',
    utterance: `可是我问 AI，它说「${target.evidence.text}」，那到底谁对？`,
  }
  return reactions.map((r, i) => (i === index ? rewritten : r))
}

/**
 * 解析同学立绘。陪读同学不在 course.castProfiles 里,页面查不到头像只能显示灰底首字
 * (2026-07-28 Codex 真检:阿哲被选中却只显示「阿」字)。
 *
 * 复用 mainline 既有的 `withClassTimeMainlineCastAssets` 而不是自己拼路径——
 * 路径格式一旦在两处各写一遍就会漂移。做法是**在一份临时副本上**跑解析,
 * 原课程对象不被改动(排练场不污染课程卡司这条不变)。
 */
function withResolvedAvatars(course: MainlineCourse, students: readonly CastProfile[]): CastProfile[] {
  if (!course.castAssetSelection) return [...students]
  const ids = new Set(students.map(s => s.id))
  const resolved = withClassTimeMainlineCastAssets({ ...course, castProfiles: [...students] })
  return students.map(s => resolved.castProfiles.find(c => c.id === s.id && ids.has(c.id)) ?? s)
}

/** 同一幕里 ≥3 条反应 = 多名学生同时掉队,节奏塌了。 */
const PACE_COLLAPSE_THRESHOLD = 3

function weaknessesFrom(
  course: MainlineCourse,
  reactions: readonly RehearsalReaction[],
  addressedMisconceptions: ReadonlyMap<string, ReadonlySet<string>>,
  misconceptions: ReadonlyMap<string, readonly string[]>,
): RehearsalWeakness[] {
  const out: RehearsalWeakness[] = []

  const bySceneId = new Map<string, RehearsalReaction[]>()
  for (const reaction of reactions) {
    bySceneId.set(reaction.sceneId, [...(bySceneId.get(reaction.sceneId) ?? []), reaction])
  }

  // 按幕序输出,报告顺序与课一致
  for (const scene of course.scenes) {
    const list = bySceneId.get(scene.id)
    if (!list || list.length === 0) continue

    if (list.length >= PACE_COLLAPSE_THRESHOLD) {
      out.push({
        sceneId: scene.id,
        kind: 'pace-collapse',
        detail: `本幕集中触发 ${list.length} 条可溯源反应，信息密度或讲授节奏可能过高。`,
        evidence: list[0]!.evidence,
      })
    }

    // 学生犯了教材标注的错,而全课没有任何辨析幕/找茬幕处理这个 KP
    for (const reaction of list) {
      if (reaction.evidence.from !== 'misconception') continue
      const covered = addressedMisconceptions.get(reaction.evidence.kpId)
      if (covered?.has(reaction.evidence.text)) continue
      // 有辨析幕在管这个 KP,但幕上措辞与当前标注**整体零命中**——这是标注在
      // 课程生成后被刷新的典型症状,判「未处理」是误报(教师会去重复补辨析),
      // 判「已处理」又可能放过真漂移,拆成核对档。若两边有部分精确命中,
      // 则未命中的条目是真漏处理,仍走 unanswered-question(见部分覆盖回归测试)。
      const currentTexts = misconceptions.get(reaction.evidence.kpId) ?? []
      const anyExactHit = currentTexts.some(text => covered?.has(text))
      if (covered && covered.size > 0 && !anyExactHit) {
        out.push({
          sceneId: scene.id,
          kind: 'misconception-wording-drift',
          detail: `本知识点有辨析幕在处理误区,但幕上绑定的措辞与当前教材标注不一致——请核对是否同一误区,确认后同步措辞或补辨析。`,
          evidence: reaction.evidence,
        })
        continue
      }
      out.push({
        sceneId: scene.id,
        kind: 'unanswered-question',
        detail: `学生犯的这个错是教材标注误区,但全课没有任何一幕处理它。`,
        evidence: reaction.evidence,
      })
    }
  }

  return out
}

/**
 * 排练一门课。同一门课 + 同一份学情 → 完全相同的报告(确定性,便于复排比对)。
 *
 * `fragile-analogy` 弱点类型已在契约中声明但**本版不产出**——它需要隐喻白名单
 * 数据,当前课程对象里没有。宁可不产出,不编造(见文件头约束 1)。
 */
export function rehearseCourse(
  course: MainlineCourse,
  mastery: ReadonlyMap<string, number>,
  /**
   * 排练场景。默认 teacher,故既有调用点无需改动。
   * 两者诉求相反:教师要暴露风险(偏好沉默掉队者,看不见的才危险),
   * 学生自学要陪伴与替代性学习(Bandura:榜样相似但略微领先)。
   */
  scenario: RehearsalScenario = 'teacher',
  /**
   * 当前教材索引中的误区原文。页面能访问数据库时应传入；纯函数测试或离线使用
   * 可省略，此时退回课程幕上的溯源字段。这样既能发现“整条漏编”的误区，又不
   * 把数据库依赖塞进排练引擎。
   */
  knownMisconceptions?: ReadonlyMap<string, readonly string[]>,
): RehearsalReport {
  const students = studentsOf(course, mastery, scenario)
  const misconceptions = misconceptionsByKp(course, knownMisconceptions)
  const addressedMisconceptions = addressedMisconceptionsByKp(course)
  const reactiveScenes = reactiveScenesByKp(course)

  const unorderedRaw = students.length === 0
    ? []
    : [...reactiveScenes].flatMap(([kpId, scenes]) => (
      reactionsForKp(course, kpId, scenes, students, mastery, misconceptions)
    ))
  const sceneOrder = new Map(course.scenes.map((scene, index) => [scene.id, index]))
  const raw = unorderedRaw.sort((left, right) => (
    (sceneOrder.get(left.sceneId) ?? Number.MAX_SAFE_INTEGER)
      - (sceneOrder.get(right.sceneId) ?? Number.MAX_SAFE_INTEGER)
  ))
  // AI 原住民改写必须在**报告与弱点共用的同一份数组**上做,否则页面看到的反应
  // 与弱点依据会对不上(2026-07-28 首版只包了弱点侧,测试当场抓到)
  const reactions = withAiNativeMoment(raw)

  const weaknesses = weaknessesFrom(course, reactions, addressedMisconceptions, misconceptions)

  const scenesToFix: RehearsalReport['scenesToFix'] = []
  for (const scene of course.scenes) {
    const hit = weaknesses.filter(w => w.sceneId === scene.id)
    if (hit.length === 0) continue
    scenesToFix.push({ sceneId: scene.id, reason: hit.map(w => w.detail).join(' ') })
  }

  return {
    courseId: course.id,
    reactions,
    weaknesses,
    scenesToFix,
    students: withResolvedAvatars(course, students).map(s => ({
      id: s.id,
      name: s.displayName,
      ...(s.assetRefs?.[0]?.src ? { avatarSrc: s.assetRefs[0].src } : {}),
    })),
  }
}

/**
 * rehearsal/types · v5 M3 排练场的对外契约(C-0,2026-07-27)
 *
 * 这是 Claude(引擎)与 Codex(排练页/报告视图)并行开发的接口边界。
 * **契约变更须双方信箱确认后再改**,不许单方面改字段。
 *
 * 设计上的一条硬约束(v5 §7 反同质化红线):
 * 排练场 ≠「AI 模拟课堂」玩具。模拟学生犯的每一个错都必须可溯源到**学情档案**
 * 或**教材标注误概念**,禁随机 persona 闲聊。这里让**类型系统**保证这件事——
 * `evidence` 是必填字段而不是可选,产不出证据的反应在类型上就写不出来。
 */

/** 反应的证据来源。缺它即为噪音,引擎不得产出。 */
export type RehearsalEvidence =
  | { from: 'misconception'; kpId: string; text: string }
  | { from: 'mastery'; kpId: string; score: number }

export type RehearsalReactionKind =
  /** 当场犯出教材标注的那个错 */
  | 'error'
  /** 没听懂,提问 */
  | 'question'
  /** 走神(掌握度过低且本幕无对应处理) */
  | 'distracted'
  /** AI 原住民:「可是我问 AI,它说……」(C-3) */
  | 'ai-native-challenge'

export interface RehearsalReaction {
  sceneId: string
  /** 取自 course.castProfiles 的学生 id */
  studentId: string
  studentName: string
  kind: RehearsalReactionKind
  /** 学生说出来的话,进舞台字幕 */
  utterance: string
  evidence: RehearsalEvidence
}

export type RehearsalWeaknessKind =
  /** 同一幕里多名学生同时掉队 */
  | 'pace-collapse'
  /** 学生问了,但全课没有任何一幕处理这个误区 */
  | 'unanswered-question'
  /**
   * 该 KP 有辨析幕/找茬幕在处理误区,但幕上绑定的措辞与当前教材标注对不上
   * (标注在课程生成后被刷新过的典型症状)。不是「未处理」——引擎不做语义
   * 模糊匹配,把「是否同一误区」留给教师核对,不谎报也不静默放行。
   */
  | 'misconception-wording-drift'
  /** 比喻会被高认知学生戳穿(需隐喻白名单数据,当前引擎尚未产出) */
  | 'fragile-analogy'

export interface RehearsalWeakness {
  sceneId: string
  kind: RehearsalWeaknessKind
  detail: string
  /** 报告里每一条都要能点回证据 */
  evidence: RehearsalEvidence
}

export interface RehearsalReport {
  courseId: string
  reactions: RehearsalReaction[]
  weaknesses: RehearsalWeakness[]
  /** 供 C-6 回改跳转:按幕聚合的待改清单,顺序与幕序一致 */
  scenesToFix: { sceneId: string; reason: string }[]
  /**
   * 本次排练用到的学生(便于页面渲染名牌);顺序稳定。
   *
   * `avatarSrc`:陪读同学**不在 course.castProfiles 里**(排练场专用,不污染课程卡司),
   * 页面按 castProfiles 查头像会查不到、只能显示灰底首字。故由引擎解析好立绘路径
   * 随报告给出;课程自带的同学也一并给,页面统一读这里即可。
   * 课程缺 castAssetSelection 时为 undefined——不猜路径,让页面回退首字。
   */
  students: { id: string; name: string; avatarSrc?: string }[]
}

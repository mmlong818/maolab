/**
 * ShowScript — 课堂导演场本（S1）
 *
 * 解决师生割裂感：讲稿(老师独白)、beats(per-atom 即兴互动)、学生插话(实时旁挂)
 * 三层各自生成、互不知情，导致角色没有连续性、互动没有戏剧功能、全课没有节奏弧线。
 *
 * 场本插在 Rundown 审批之后、讲稿生成之前，是讲稿与 beats 的"导演蓝本"：
 *   Rundown(讲什么) → ShowScript(谁说/起什么作用/发生什么) → 多角色讲稿 → atoms → beats
 *
 * 见 docs/classroom-script-design.md。
 */

import type { Rundown } from './rundown.js'

/** 同学在本课领取的戏剧任务（一人一任务，覆盖不同教学功能） */
export type DramaticRole =
  | 'misconception-bearer'  // 犯错担当：在指定段落犯真实学情高频混淆，后续被纠正（错误→纠正→巩固）
  | 'questioner'            // 提问担当：在概念引入处问出学生心里的"为什么"
  | 'comic-relief'          // 接梗担当：在认知负荷高峰后释放，常衔接媒体节点
  | 'summarizer'            // 示范担当：在收束段说出正确总结，替代老师重复

/** 场本中的"演员"：老师固定在场，另选 2-3 位同学出场 */
export interface CastMember {
  /** 同学 id（PRESET_STUDENTS_LIST.agent.id），如 student-zero */
  studentId: string
  /** 同学名（Zero / 小陈 / 段子K / 小美） */
  studentName: string
  /** 本课领取的戏剧任务 */
  dramaticRole: DramaticRole
  /** 这位同学这节课的成长线（一句话，如"从把十万千万搞混 → 结尾能自己说对进率"） */
  arc: string
}

/** 段落在全课叙事中的戏剧定位 */
export type DramaticFunction = 'setup' | 'rising' | 'climax' | 'resolution'

/** 场本事件类型 */
export type ShowEventType =
  | 'misconception'   // 某同学犯错（必须有 payoff 纠正）
  | 'key-question'    // 关键提问，推进剧情而非单纯测验
  | 'comic-relief'    // 调节气氛 / 释放认知负荷
  | 'demonstrate'     // 老师或示范担当演示
  | 'media-moment'    // 落在 media-interlude 节点的媒体时刻
  | 'summarize'       // 归纳总结（常为 misconception 的最终回收）

/** 一个戏剧事件：谁、在哪、做什么、推进什么 */
export interface ShowEvent {
  /** 稳定 id */
  id: string
  type: ShowEventType
  /** 行动者：同学 id 或 'teacher' */
  actorId: string
  /** 落点 rundown 节点 id（事件发生在哪一页） */
  atNodeId: string
  /** 这个事件推进什么（"暴露进率混淆，为闯关做铺垫"） */
  intent: string
  /** 前置铺垫要求（可选） */
  setup?: string
  /** 回收要求：错误如何被纠正、伏笔如何被回收（可选） */
  payoff?: string
  /** 若本事件是对某个先前事件（通常是 misconception）的回收，指向那个事件 id */
  resolvesEventId?: string
}

export interface ShowScriptSegment {
  /** = RundownSegment.id / MethodSegment.id */
  segmentId: string
  /** 本段戏剧定位 */
  dramaticFunction: DramaticFunction
  /** 节奏要求（"此段已连续 3 页讲解，最后一页必须互动"） */
  paceNote: string
  /** 本段事件序列（按发生顺序） */
  events: ShowEvent[]
}

export interface ShowScript {
  /** = courseId */
  id: string
  /** 出场角色表 */
  cast: CastMember[]
  /** 全课弧线一句话（"从对大数的畏惧 → 掌握分级读法的自信"） */
  arcSummary: string
  /** 按 segment 的事件规划 */
  segments: ShowScriptSegment[]
  meta: {
    generatedAt: number
    approvedAt?: number
    editedByUser: boolean
    revision: number
  }
}

export type ShowScriptStatus = 'draft' | 'editing' | 'approved' | 'rejected'

/** 场本校验问题 */
export interface ShowScriptValidationIssue {
  severity: 'error' | 'warning'
  rule:
    | 'misconception-without-payoff'  // 犯错事件没有任何回收
    | 'cast-without-events'           // 出场同学未分配任何事件
    | 'pace-too-many-passive'         // 连续被动节点过多（无事件、无互动）
    | 'arc-incomplete'                // 犯错担当在结尾段没有回收/正确发言
    | 'event-node-not-found'          // 事件落点节点在 rundown 中不存在
  eventId?: string
  segmentId?: string
  message: string
}

/** 连续被动节点（无场本事件、非互动）的告警阈值 */
export const SHOWSCRIPT_MAX_PASSIVE_RUN = 3

/**
 * 校验场本：错误必有回收、出场必有戏、节奏不憋、角色弧完整、事件落点有效。
 * 纯函数，不依赖 LLM；生成器据此重试或告警。
 */
export function validateShowScript(script: ShowScript, rundown: Rundown): ShowScriptValidationIssue[] {
  const issues: ShowScriptValidationIssue[] = []

  // 节点 id → 是否互动节点 的索引
  const nodeInteractive = new Map<string, boolean>()
  const nodeOrder: string[] = []
  for (const seg of rundown.segments) {
    for (const n of seg.nodes) {
      nodeInteractive.set(n.id, n.interaction.hasInteraction)
      nodeOrder.push(n.id)
    }
  }

  const allEvents = script.segments.flatMap(s => s.events)

  // 1. 事件落点必须存在
  for (const ev of allEvents) {
    if (!nodeInteractive.has(ev.atNodeId)) {
      issues.push({ severity: 'error', rule: 'event-node-not-found', eventId: ev.id, message: `事件 ${ev.id} 落点节点 ${ev.atNodeId} 不在 rundown 中` })
    }
  }

  // 2. misconception 必须有回收：要么自身带 payoff，要么有别的事件 resolvesEventId 指向它
  const resolvedIds = new Set(allEvents.map(e => e.resolvesEventId).filter(Boolean))
  for (const ev of allEvents) {
    if (ev.type === 'misconception' && !ev.payoff && !resolvedIds.has(ev.id)) {
      issues.push({ severity: 'error', rule: 'misconception-without-payoff', eventId: ev.id, message: `犯错事件 ${ev.id} 没有任何纠正/回收` })
    }
  }

  // 3. 出场同学都要有戏
  const actorIds = new Set(allEvents.map(e => e.actorId))
  for (const c of script.cast) {
    if (!actorIds.has(c.studentId)) {
      issues.push({ severity: 'warning', rule: 'cast-without-events', message: `出场同学 ${c.studentName}(${c.studentId}) 未分配任何事件` })
    }
  }

  // 4. 角色弧：犯错担当必须在 resolution 段有回收或正确发言
  const resolutionSegIds = new Set(script.segments.filter(s => s.dramaticFunction === 'resolution').map(s => s.segmentId))
  for (const c of script.cast) {
    if (c.dramaticRole !== 'misconception-bearer') continue
    const hasClosure = script.segments.some(s =>
      resolutionSegIds.has(s.segmentId) &&
      s.events.some(e => e.actorId === c.studentId && (e.type === 'summarize' || e.resolvesEventId)),
    )
    if (!hasClosure) {
      issues.push({ severity: 'warning', rule: 'arc-incomplete', message: `犯错担当 ${c.studentName} 在收束段没有回收/正确发言，成长弧不完整` })
    }
  }

  // 5. 节奏：连续被动节点（无事件且非互动）不得超过阈值
  const eventNodeIds = new Set(allEvents.map(e => e.atNodeId))
  let run = 0
  for (const nodeId of nodeOrder) {
    const passive = !eventNodeIds.has(nodeId) && !nodeInteractive.get(nodeId)
    run = passive ? run + 1 : 0
    if (run === SHOWSCRIPT_MAX_PASSIVE_RUN + 1) {
      issues.push({ severity: 'warning', rule: 'pace-too-many-passive', message: `连续超过 ${SHOWSCRIPT_MAX_PASSIVE_RUN} 个被动节点（无事件、无互动），节奏过于平淡` })
    }
  }

  return issues
}

/**
 * 隐喻注册表 · v4 M1(docs/v4-master-plan-2026-07-13.md §3.1)
 *
 * 白名单机制:命中注册概念的课,生成期只允许使用 APPROVED 隐喻,且正文必须
 * 主动复述 knownLimits(拆穿比喻在哪里失灵——这是防误概念叠加的灵魂字段);
 * BANNED 隐喻作为负面约束注入 prompt,并给出替代讲法。
 *
 * 新隐喻(LLM 自创、不在注册表内)不自动否决——记 PENDING 走人审队列(M1 暂
 * 以真检人工过目代替,队列表落 db 是 M1 后续项)。
 */

import type { PedagogySubject } from './misconceptions.js'

export type MetaphorStatus = 'approved' | 'banned'

export interface MetaphorEntry {
  id: string
  subjects: PedagogySubject[]
  conceptKeywords: string[]
  /** 隐喻本体(如"封闭水管中的水流") */
  metaphor: string
  status: MetaphorStatus
  /** approved 必填:概念↔隐喻的映射关系 */
  mapping?: string
  /** approved 必填:比喻在哪里失灵、会诱发什么误概念——正文必须复述 */
  knownLimits?: string
  /** banned 必填:为什么禁 + 用什么讲法替代 */
  reason?: string
  replacement?: string
  /** 限定可用学段(缺省=全学段);如"原子=太阳系"只许小学用 */
  allowedGradeBands?: readonly string[]
}

export const METAPHOR_REGISTRY: readonly MetaphorEntry[] = [
  {
    id: 'MET-001',
    subjects: ['physics', 'science'],
    conceptKeywords: ['电流', '电压', '电阻', '电路', '欧姆'],
    metaphor: '封闭水管中的水流',
    status: 'approved',
    mapping: '电压=水压差,电阻=管道粗细,电流=流量',
    knownLimits: '导线里的"水"早已装满:合上开关灯立刻亮,不是电子从电池"跑"到灯泡;电流不会被"用光",消耗的是电能。讲这个比喻必须同时把这两点说破。',
  },
  {
    id: 'MET-002',
    subjects: ['physics', 'science'],
    conceptKeywords: ['升力', '机翼', '飞机', '伯努利'],
    metaphor: '机翼"等时说"(上表面路程长所以流速快)',
    status: 'banned',
    reason: '经典错误解释,已被 NASA 等机构专门辟谣——两股气流并不会同时到达后缘。',
    replacement: '以"机翼形状与迎角使气流向下偏转 + 牛顿第三定律"为主线,压强差作辅助描述。',
  },
  {
    id: 'MET-003',
    subjects: ['physics', 'science'],
    conceptKeywords: ['引力', '万有引力', '时空弯曲'],
    metaphor: '蹦床上的保龄球压出凹陷',
    status: 'approved',
    mapping: '大质量物体=保龄球,时空=蹦床面,行星轨道=沿凹陷滚动的小球',
    knownLimits: '这是可视化不是机制:演示本身借用了地球引力(循环论证),且真实弯曲发生在四维时空、没有"下方"。必须明说"这是帮助想象的图像"。',
  },
  {
    id: 'MET-004',
    subjects: ['chemistry', 'physics', 'science'],
    conceptKeywords: ['原子', '原子结构', '核外电子'],
    metaphor: '原子=迷你太阳系',
    status: 'approved',
    allowedGradeBands: ['lower-primary', 'upper-primary'],
    mapping: '原子核=太阳,电子=行星',
    knownLimits: '仅小学可用。电子并没有行星那样的固定轨道,只有出现概率的区域;初中起讲原子必须改用能量层级表述,为电子云铺路。',
  },
  {
    id: 'MET-005',
    subjects: ['biology', 'science'],
    conceptKeywords: ['细胞', '细胞结构', '细胞器'],
    metaphor: '细胞=一座工厂',
    status: 'approved',
    mapping: '细胞核=厂长办公室(图纸),线粒体=发电车间,细胞膜=门卫与围墙',
    knownLimits: '工厂有统一指挥,细胞内多数过程是分子层面自发进行、没有"谁在下命令";比喻只用于记结构-功能对应,不用于解释调控机制。',
  },
]

export interface MetaphorMatch {
  approved: MetaphorEntry[]
  banned: MetaphorEntry[]
}

/** 命中检索:按学科 + 学段 + KP 关键词返回本课可用/禁用隐喻。 */
export function metaphorsFor(
  subject: string,
  gradeBand: string,
  kpTitles: readonly string[],
): MetaphorMatch {
  const haystack = kpTitles.join(' ')
  const hits = METAPHOR_REGISTRY.filter(entry =>
    entry.subjects.includes(subject as PedagogySubject) &&
    entry.conceptKeywords.some(keyword => haystack.includes(keyword)),
  )
  return {
    approved: hits.filter(entry =>
      entry.status === 'approved' &&
      (!entry.allowedGradeBands || entry.allowedGradeBands.includes(gradeBand)),
    ),
    // 超出 allowedGradeBands 的 approved 条目对本学段等同禁用(如中学用"迷你太阳系")
    banned: hits.filter(entry =>
      entry.status === 'banned' ||
      (entry.status === 'approved' && entry.allowedGradeBands && !entry.allowedGradeBands.includes(gradeBand)),
    ),
  }
}

/**
 * 学段语气路由 · v4 M1(docs/v4-master-plan-2026-07-13.md §3.1)
 *
 * 每个学段一套语气契约:生成期作为 prompt 硬约束注入,审核期作为禁词闸门复查。
 * 依据 ACPF 学段心理分析(tasks/STRATEGIC-REVIEW-2026-07-ACPF.md):
 * 低段要具象玩乐,高段前期最忌低幼(Anti-Cringe),中学忌说教与废话。
 *
 * 与 mainline domain.ts 的 GradeBand 字面量保持一致(结构兼容,不引依赖)。
 */

export type PedagogyGradeBand = 'lower-primary' | 'upper-primary' | 'middle-school' | 'high-school'

export interface BannedPhrase {
  /** 命中即报;用短语而非单字,避免误伤正常内容 */
  phrase: string
  /** blocking = 出现即课堂事故;warning = 品质问题,提示修正 */
  severity: 'blocking' | 'warning'
  reason: string
}

export interface ToneRules {
  gradeBand: PedagogyGradeBand
  /** 注入 fill-scenes system prompt 的语气指令(一段话) */
  voice: string
  banned: BannedPhrase[]
}

const TONE_RULES: Record<PedagogyGradeBand, ToneRules> = {
  'lower-primary': {
    gradeBand: 'lower-primary',
    voice: '低年级语气:具象、短句(单句≤20字)、多用看得见摸得着的例子;禁抽象定义式表述,概念一律落到具体物体或动作上;热情但不做作。',
    banned: [
      { phrase: '成正比', severity: 'blocking', reason: '低段禁抽象数学术语' },
      { phrase: '系数', severity: 'blocking', reason: '低段禁抽象数学术语' },
      { phrase: '宏观', severity: 'blocking', reason: '低段禁成人抽象词' },
      { phrase: '综上所述', severity: 'blocking', reason: '低段禁书面总结腔' },
    ],
  },
  'upper-primary': {
    gradeBand: 'upper-primary',
    voice: '高年级前期(Anti-Cringe)语气:把学生当能干的合作者,专业、机智、尊重智商;讲机制不讲魔法;禁一切哄小孩措辞与说教腔。',
    banned: [
      { phrase: '小朋友', severity: 'blocking', reason: '5-6 年级极度反感被当小孩(Anti-Cringe 红线)' },
      { phrase: '魔法小精灵', severity: 'blocking', reason: '低幼拟人,损伤可信度' },
      { phrase: '神奇之旅', severity: 'blocking', reason: '低幼套话' },
      { phrase: '神奇的魔法', severity: 'blocking', reason: '该学段禁用魔法解释任何机制' },
      { phrase: '让我们一起', severity: 'warning', reason: '哄小孩式号召,改为直接给任务' },
    ],
  },
  'middle-school': {
    gradeBand: 'middle-school',
    voice: '中学语气:严谨、冷峻、信息密度高(《新科学家》风格);直接讲内容,禁课堂仪式性废话与心灵鸡汤。',
    banned: [
      { phrase: '小朋友', severity: 'blocking', reason: '中学禁低幼称呼' },
      { phrase: '综上所述', severity: 'warning', reason: '无信息量填充词' },
      { phrase: '众所周知', severity: 'warning', reason: '无信息量填充词' },
      { phrase: '本节课我们学习了', severity: 'warning', reason: '课堂仪式性废话' },
    ],
  },
  'high-school': {
    gradeBand: 'high-school',
    voice: '高中语气:学术、精确、可以引入术语但每个术语首次出现必须给操作性定义;论证链完整,不跳步。',
    banned: [
      { phrase: '小朋友', severity: 'blocking', reason: '高中禁低幼称呼' },
      { phrase: '同学们', severity: 'warning', reason: '广播腔,直接对"你"讲' },
      { phrase: '综上所述', severity: 'warning', reason: '无信息量填充词' },
      { phrase: '众所周知', severity: 'warning', reason: '无信息量填充词' },
    ],
  },
}

export function toneRulesFor(gradeBand: string): ToneRules {
  return TONE_RULES[gradeBand as PedagogyGradeBand] ?? TONE_RULES['middle-school']
}

export interface ToneViolation {
  phrase: string
  severity: 'blocking' | 'warning'
  reason: string
}

/** 审核期禁词扫描:对讲稿/板书/槽位拼接文本逐条比对本学段禁词表。 */
export function findToneViolations(text: string, gradeBand: string): ToneViolation[] {
  const rules = toneRulesFor(gradeBand)
  return rules.banned
    .filter(item => text.includes(item.phrase))
    .map(item => ({ phrase: item.phrase, severity: item.severity, reason: item.reason }))
}

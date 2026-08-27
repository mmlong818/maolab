/**
 * 误概念库 · v4 M1(docs/v4-master-plan-2026-07-13.md §3.1)
 *
 * 教育研究中记录充分的高频误概念。两个用途:
 * 1. 生成期:命中本课 KP 时注入 contrast 幕 prompt——误区必须用库内真实误概念,
 *    不许 LLM 现编稻草人;
 * 2. 审核期:bannedPhrasings 作为闸门正则,课程文本命中即 blocking
 *    (错误讲法本身出现在讲稿/板书里,是事实事故不是风格问题)。
 *
 * 维护规则:宁缺毋滥;每条须有教育研究或权威机构背书;人审通过才入库。
 */

export type PedagogySubject =
  | 'chinese' | 'math' | 'science' | 'physics' | 'chemistry' | 'biology'
  | 'history' | 'geography' | 'english' | 'general'

export interface MisconceptionEntry {
  id: string
  subjects: PedagogySubject[]
  /** KP 标题/课程主题关键词,命中任一即认为本课相关 */
  conceptKeywords: string[]
  /** 学生视角的误区表述(第一人称,可直接喂给 contrast 幕的 misconception 槽参考) */
  misconception: string
  /** 正确讲法指引(喂给 correction 槽参考) */
  correction: string
  /** 为什么危险 */
  risk: string
  /** 课程文本中出现即 blocking 的错误讲法(正则源串,运行期编译) */
  bannedPhrasings?: string[]
}

/** 冷启动十条:均为教育研究经典条目(ACPF 误概念清单采纳,tasks/STRATEGIC-REVIEW-2026-07-ACPF.md §3)。 */
export const MISCONCEPTION_REGISTRY: readonly MisconceptionEntry[] = [
  {
    id: 'MIS-001',
    subjects: ['physics', 'science'],
    conceptKeywords: ['升力', '机翼', '飞机', '伯努利'],
    misconception: '我觉得机翼上表面路程长,空气要同时到达后缘,所以上面流速快、压强小,飞机就被托起来了。',
    correction: '升力主线是机翼形状与迎角使气流向下偏转,由牛顿第三定律获得向上的反作用力;压强差只作辅助描述。"等时到达"这个前提本身是错的。',
    risk: '"等时说"是被 NASA 等机构专门辟谣的经典错误解释。',
    bannedPhrasings: ['(路程|路径)(更|较)?长[^。]{0,10}(流速|速度)(更|较)?快[^。]{0,15}(同时|等时)', '(同时|等时)[^。]{0,10}到达[^。]{0,12}(后缘|机翼后)'],
  },
  {
    id: 'MIS-002',
    subjects: ['physics', 'science'],
    conceptKeywords: ['电流', '电路', '电压', '欧姆'],
    misconception: '我觉得电流从电池出发,跑到灯泡就被用光了,所以后面的导线里没有电。',
    correction: '电流=水流的比喻必须同时声明边界:导线里的"水"早就装满,合上开关灯立刻亮;电流处处相等,不会被"用光",消耗的是电能不是电流。',
    risk: '不加限定的水流比喻会诱发"电流耗尽"误概念,是电学最高频错误之一。',
    // 间隔守卫 (?:(?!不)[^。]) 防"电流不会被用光"误伤(round09);
    // 前置 lookbehind 防"而非电流被用光"误伤(round10)
    bannedPhrasings: ['(?<![而并]非)(?<!不是)电流(?:(?!不)[^。]){0,8}(被)?(用光|耗尽|用完)', '电流(?:(?!不)[^。]){0,6}越来越(小|少)[^。]{0,10}(经过|通过)'],
  },
  {
    id: 'MIS-003',
    subjects: ['physics', 'science'],
    conceptKeywords: ['圆周运动', '离心', '旋转', '转弯'],
    misconception: '我觉得转弯时有一个离心力把我往外甩。',
    correction: '惯性系中不存在"离心力"这个真实的力——身体想沿直线走(惯性),是车壁/座椅给你向心力拉你转弯。低学段可用"身体想走直线"表述。',
    risk: '把虚拟力当真实力,妨碍后续受力分析。',
  },
  {
    id: 'MIS-004',
    subjects: ['physics', 'science'],
    conceptKeywords: ['引力', '重力', '万有引力', '时空'],
    misconception: '蹦床上保龄球压出凹陷、小球绕着滚,这就是引力的原理。',
    correction: '蹦床演示只能作为"可视化"并明说局限:它用地球引力解释引力(循环论证),且暗示弯曲只发生在"下方"。必须标注"这是帮助想象的图像,不是机制本身"。',
    risk: '循环论证 + 空间方向误导。',
  },
  {
    id: 'MIS-005',
    subjects: ['chemistry', 'physics', 'science'],
    conceptKeywords: ['原子', '电子', '原子结构', '核外电子'],
    misconception: '我觉得原子就是一个迷你太阳系,电子像行星一样沿固定轨道绕原子核转。',
    correction: '小学可用该图像;初中起必须标注局限:电子没有确定轨道,只有出现概率的区域(为后续"电子云"铺路),"轨道"只是能量层级的示意。',
    risk: '固定轨道图像会阻碍高中电子云概念的建立。',
  },
  {
    id: 'MIS-006',
    subjects: ['biology', 'science'],
    conceptKeywords: ['进化', '自然选择', '适应', '长颈鹿'],
    misconception: '我觉得长颈鹿是为了够到高处的树叶,把脖子越伸越长,一代代传下来。',
    correction: '禁目的论措辞。正确表述:脖子长短本来就有差异,碰巧脖子长的在食物短缺时更容易活下来并留下后代——变异在先,选择在后,没有"为了"。',
    risk: '拉马克式目的论是进化论第一高频误概念。',
    bannedPhrasings: ['(?<!不是)(?<!并非)(?<!不)为了(?:(?!不)[^。]){0,15}(而)?(进化出|变长|变高|长出|演化出)'],
  },
  {
    id: 'MIS-007',
    subjects: ['biology', 'science'],
    conceptKeywords: ['细菌', '微生物', '病毒', '菌群'],
    misconception: '我觉得细菌都是坏东西,要把它们全部消灭干净。',
    correction: '必须配平衡表述:多数细菌无害或有益(肠道菌群助消化、发酵造酸奶),致病的是少数;"全部消灭"既做不到也有害。',
    risk: '阻碍理解菌群、生态与免疫。',
    bannedPhrasings: ['细菌(都|全)是(坏|有害)'],
  },
  {
    id: 'MIS-008',
    subjects: ['math'],
    conceptKeywords: ['乘法', '乘数', '积', '分数乘法', '小数乘法'],
    misconception: '我觉得乘法总是让数变大,除法总是让数变小。',
    correction: '引入乘法时就埋预防针:乘以大于 1 的数变大,乘以 1 不变,乘以小于 1 的数变小——用"倍数缩放"图像而不是"重复相加会更多"的直觉。',
    risk: '该直觉在分数/小数乘法处整体崩塌,是中段数学最大断层之一。',
    bannedPhrasings: ['(?<![而并]非)(?<!不是)乘法(?:(?!不)[^。]){0,8}(总|一定|肯定)[^。]{0,4}(变大|更大)'],
  },
  {
    id: 'MIS-009',
    subjects: ['history'],
    conceptKeywords: ['战争', '条约', '变法', '革命', '兴衰', '灭亡'],
    misconception: '我觉得这件事发生就是因为那一个原因,一句话就能解释。',
    correction: '禁单因叙事:历史事件必须给出至少两条并行原因(如经济/制度/技术/人物决策),并用不同立场角色的视角配平,不做单一因果链灌输。',
    risk: '"落后就要挨打"式单因叙事压制多因分析能力。',
  },
  {
    id: 'MIS-010',
    subjects: ['geography', 'science'],
    conceptKeywords: ['季节', '四季', '公转', '太阳直射'],
    misconception: '我觉得夏天热是因为地球离太阳更近。',
    correction: '讲季节必须主动拆弹:季节由地轴倾斜导致的太阳直射角与昼长变化决定;北半球夏季时地球其实位于远日点附近。',
    risk: '距离说是季节成因第一高频直觉误概念。',
    bannedPhrasings: ['(夏天|夏季)(?:(?!不)[^。]){0,10}(离太阳|距离太阳|太阳)[^。]{0,4}近[^。]{0,6}(所以|才|就)?(热|温度高)'],
  },
]

/** 命中检索:按学科 + KP 标题/主题关键词返回本课相关误概念。 */
export function misconceptionsFor(
  subject: string,
  kpTitles: readonly string[],
): MisconceptionEntry[] {
  const haystack = kpTitles.join(' ')
  return MISCONCEPTION_REGISTRY.filter(entry =>
    entry.subjects.includes(subject as PedagogySubject) &&
    entry.conceptKeywords.some(keyword => haystack.includes(keyword)),
  )
}

export interface PhrasingViolation {
  entryId: string
  pattern: string
  risk: string
}

/** 审核期错误讲法扫描:只扫本学科条目,避免跨学科误伤。 */
export function findBannedPhrasings(text: string, subject: string): PhrasingViolation[] {
  const violations: PhrasingViolation[] = []
  for (const entry of MISCONCEPTION_REGISTRY) {
    if (!entry.subjects.includes(subject as PedagogySubject) || !entry.bannedPhrasings) continue
    for (const source of entry.bannedPhrasings) {
      if (new RegExp(source).test(text)) {
        violations.push({ entryId: entry.id, pattern: source, risk: entry.risk })
      }
    }
  }
  return violations
}

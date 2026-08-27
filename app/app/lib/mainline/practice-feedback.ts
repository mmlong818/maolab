const SEGMENT_SPLIT = /[。；;！!？?\n]+/
const QUESTION_WORD_PATTERN = /(多少|哪(?:个|项|一)|什么|为何|为什么|是否|如何|怎么)/
const EXPLICIT_ANSWER_PATTERN = /(?:答案|正确答案|结果|结论)(?:是|为|等于)|(?:所以|因此|故而|故选|可得|解得|算得|应选|应为|应是|即为|由此可知)/
const CHAINED_EQUATION_PATTERN = /(?:[A-Za-z][A-Za-z0-9_{}\\]*\s*[=＝≈]\s*){2,}|[A-Za-z][A-Za-z0-9_{}\\]*\s*[=＝≈][^，,。；;]{0,24}[=＝≈]\s*[-+]?\d/
const DIRECTION_RESULT_PATTERN = /(?:竖直|垂直|水平|斜向|沿[^，,。；;]{0,8})(?:向|朝)?(?:上|下|左|右|内|外|东|南|西|北)/
const VERDICT_RESULT_PATTERN = /(?:判断|说法|选项|命题|结论)?[^，,。；;]{0,8}(?:正确|错误|成立|不成立|相等|不相等)/
const GIVEN_PREFIX_PATTERN = /^(?:已知|若|设|假设|给定|其中|题设)/
const PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i
const INLINE_OPTION_PATTERN = /(?:^|[\n；;])\s*(?:[A-FＡ-Ｆ][.、:：)]|[①②③④⑤⑥]|[一二三四五六]\s*[、.])/g
const BLANK_MARKER_PATTERN = /_{2,}|＿{2,}|\(\s*\)|（\s*）|□+|【\s*】/
const FEEDBACK_BASIS_PATTERN = /(?:答案|结果|结论|正确|错误|成立|不成立|相等|不相等|因为|理由|依据|所以|故|可得|得到|应(?:选|为|是)|须|必须|符合|不符合|对应|第一|第二|第三|步骤|条件|错|漏|缺|不规范)/
const FEEDBACK_CORRECTION_PATTERN = /(?:若|如果|否则|错在|易错|常见错|检查|核对|订正|修正|回到|重新|再算|注意|避免|不要|不应|应(?:先|改|选|为|是)|须|必须|漏|缺)/
const GENERIC_FEEDBACK_PATTERN = /^(?:(?:做得|回答得)?很好|继续努力|请(?:核对|检查)(?:一下)?(?:答案)?|认真检查|注意(?:易错点|细节))+$/

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s，,。；;：:！!？?、（）()【】\[\]「」『』“”"'`]/g, '')
    .replace(/＝/g, '=')
}

function resultFacts(text: string): Set<string> {
  const facts = new Set<string>()
  const patterns = [
    /[-+]?\d+(?:\.\d+)?\s*(?:%|°|度|年|元|米|厘米|毫米|千米|秒|分钟|小时|克|千克|牛|帕|伏|安|欧姆|[a-zA-Z]+(?:\s*\/\s*[a-zA-Z]+)?)/gi,
    /(?:竖直|垂直|水平|斜向|沿[^，,。；;]{0,8})(?:向|朝)?(?:上|下|左|右|内|外|东|南|西|北)/g,
    /(?:选|答案为|答案是)\s*[A-DＡ-Ｄ]/gi,
    /(?:正确|错误|成立|不成立|相等|不相等)/g,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = normalize(match[0])
      if (value) facts.add(value)
    }
  }
  return facts
}

function isSolutionSegment(segment: string): boolean {
  const trimmed = segment.trim()
  if (!trimmed || QUESTION_WORD_PATTERN.test(trimmed)) return false
  if (EXPLICIT_ANSWER_PATTERN.test(trimmed) || CHAINED_EQUATION_PATTERN.test(trimmed)) return true
  if (GIVEN_PREFIX_PATTERN.test(trimmed)) return false
  return DIRECTION_RESULT_PATTERN.test(trimmed) && VERDICT_RESULT_PATTERN.test(trimmed)
}

function isRepeatedConclusion(segment: string, feedback: string): boolean {
  const segmentNorm = normalize(segment)
  if (segmentNorm.length < 10) return false
  const feedbackNorm = normalize(feedback)
  if (feedbackNorm.includes(segmentNorm)) return true

  return feedback
    .split(SEGMENT_SPLIT)
    .map(normalize)
    .some(part => part.length >= 10 && (segmentNorm.includes(part) || part.includes(segmentNorm)))
}

/**
 * 判断练习题面是否把本应在反馈阶段揭示的结果提前写了出来。
 *
 * 题面和反馈共享题设、术语或选项是正常的，因此这里只检查“解答式语段”：明确
 * 的答案连接词、连续等式，或同时带方向与正误结论的陈述。随后再要求它与反馈
 * 共享完整结论或可辨识结果，避免把「已知 m=4kg，求重力」误判成泄题。
 */
export function practiceAnswerLeakReasons(task: string, feedback: string): string[] {
  if (!task.trim() || !feedback.trim()) return []

  const feedbackFacts = resultFacts(feedback)
  const reasons: string[] = []
  const solutionSegments = task.split(SEGMENT_SPLIT).filter(isSolutionSegment)

  for (const segment of solutionSegments) {
    if (isRepeatedConclusion(segment, feedback)) {
      reasons.push('题面包含反馈阶段才应揭示的完整结论')
      continue
    }

    const sharedFacts = [...resultFacts(segment)].filter(fact => feedbackFacts.has(fact))
    const hasExplicitAnswer = EXPLICIT_ANSWER_PATTERN.test(segment)
    if ((hasExplicitAnswer && sharedFacts.length >= 1) || sharedFacts.length >= 2) {
      reasons.push(`题面提前给出反馈中的结果事实：${sharedFacts.join('、')}`)
    }
  }

  return [...new Set(reasons)]
}

export function practiceTaskLeaksFeedback(task: string, feedback: string): boolean {
  return practiceAnswerLeakReasons(task, feedback).length > 0
}

function hasInlineMaterial(task: string): boolean {
  const enumerated = task.match(INLINE_OPTION_PATTERN)?.length ?? 0
  if (enumerated >= 2) return true
  const lines = task.split('\n').map(line => line.trim()).filter(Boolean)
  return lines.length >= 3
}

/**
 * 检查作答前可见的 task 是否真的包含它所引用的材料。
 *
 * 课堂首次进入练习页时只显示 task，专业图表、板书和 feedback 都会隐藏。因此
 * “判断屏幕上三条说法”“重排给定语段”若未把具体内容写进 task，学生实际无题可答。
 */
export function practiceTaskMaterialReasons(task: string): string[] {
  const trimmed = task.trim()
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) return []

  const reasons: string[] = []
  const inlineMaterial = hasInlineMaterial(trimmed)

  if (!inlineMaterial && /(?:屏幕上|图中|表中|下列|以下|下面)(?:的)?(?:\s|这|各|哪|一|两|三|四|五|六|\d|条|项|段|幅|张|个|组|则){0,8}(?:说法|选项|材料|句子|语段|文本|方程式|光路|图|表)/.test(trimmed)) {
    reasons.push('题面引用了屏幕、图表或下列材料，但 task 中没有列出实际作答材料')
  }

  if (!inlineMaterial && /(?:判断|选择|比较|找出|指出)[^。；;]{0,28}(?:[两三四五六]|\d+)\s*(?:条|项|段|幅|张|个|组)[^。；;]{0,8}(?:候选|说法|选项|材料|句子|语段|方程式|光路|图)/.test(trimmed)) {
    reasons.push('题面要求在多项候选中作答，但 task 中没有列出候选内容')
  }

  if (!inlineMaterial && /给定一(?:则|段|组|幅|张)(?:[^。；;]{0,16})(?:材料|消息|语段|文本|短文|图|表)/.test(trimmed)) {
    reasons.push('题面要求处理给定材料，但 task 中没有给出可处理的具体内容')
  }

  if (/(?:句子|短文|语段|空格|横线)[^。；;]{0,18}(?:空缺|填空|填入|补全)/.test(trimmed) && !BLANK_MARKER_PATTERN.test(trimmed)) {
    reasons.push('题面要求填空或补全，但 task 中没有显示待填写的句子和空缺位置')
  }

  return [...new Set(reasons)]
}

/**
 * 反馈至少要同时提供“按什么判断”和“答错后怎么修”。纯鼓励、只说核对或只报
 * 一个最终答案都不足以支持学生定位错误规则，也无法形成下一次可执行的改进。
 */
export function practiceFeedbackQualityReasons(feedback: string): string[] {
  const trimmed = feedback.trim()
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) return []

  if (GENERIC_FEEDBACK_PATTERN.test(normalize(trimmed))) {
    return [
      'feedback 没有给出可核对的答案、判别依据、步骤或完成标准',
      'feedback 没有指出常见错误或答错后的具体修正动作',
    ]
  }

  const reasons: string[] = []
  const hasResultFact = resultFacts(trimmed).size > 0
  if (!hasResultFact && !FEEDBACK_BASIS_PATTERN.test(trimmed)) {
    reasons.push('feedback 没有给出可核对的答案、判别依据、步骤或完成标准')
  }
  if (!FEEDBACK_CORRECTION_PATTERN.test(trimmed)) {
    reasons.push('feedback 没有指出常见错误或答错后的具体修正动作')
  }
  return reasons
}

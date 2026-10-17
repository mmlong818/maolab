import type { LessonScene } from './domain.js'

export type AssessmentActionKind =
  | 'explain'
  | 'recall'
  | 'discriminate'
  | 'construct'
  | 'calculate'
  | 'apply'
  | 'complete-task'
  | 'perform'

export interface PracticeAlignmentResult {
  expected: readonly AssessmentActionKind[]
  demonstrated: readonly AssessmentActionKind[]
  missing: readonly AssessmentActionKind[]
  inspectable: boolean
}

const PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i

const ACTION_PATTERNS: Omit<Record<AssessmentActionKind, RegExp>, 'apply' | 'complete-task'> = {
  // 标签叫「解释或表述」,词表此前却不认「表述/表达」(2026-08-26 物理练习页实撞)
  explain: /用自己的话|说明|解释|描述|表述|表达(?!式)|概括|概述|叙述|陈述|阐述|总结|分析|评价|论证|推理|为什么|关系|原因|含义|意义|作用|时机/,
  recall: /说出|写出|列出|列举|复述|回答|举出|举例|猜出|背诵|默写|命名|认读(?!方法|策略|能力)/,
  discriminate: /判断|辨别|辨认|区分|识别|比较|对比|选择|找出|指出|圈出|归类|分类|(?:能够|能|会)发现/,
  construct: /画出|绘制|作图|标出|标注|连线|制作|设计|搭建|排序|排列|重排|改写|订正|书写(?!规则|规范|要求|方法|顺序)|临写|描写|拼写|用[^，。；\n]{0,12}表示/,
  calculate: /计算|求出|算出|数出|运算|列式|解方程|推导/,
  // 「(能|会)用」是工具操作类行为(会用直尺量/会用圆规画),不是迁移;量出/测出/度量是其题面形态
  perform: /朗读|跟读|跟唱|听读|诵读|拼读(?!方法|规则|技巧|过程)|读出|发出[^，。；\n]{0,12}(?:音|声)|阅读(?!兴趣|能力|方法|策略|习惯)|翻阅|展示|演示|操作|测量|量出|测出|度量|实验|观察并记录|表演|演奏|(?:能够|能|会)用(?!自己的话)/,
}

// 「(能|会)用」分支已删:它把「会用直尺量出」「会用有向线段表示」这类**工具使用**
// 误判为迁移期望,而具体题面「用直尺量」无「会」前缀不被认可——两门数学练习页
// 15+ 次生成全被拒死(2026-08-26 实撞)。真·迁移由下列词兜底。
const APPLY_PATTERN = /应用|运用|迁移|解决|新情境|情境中|情境里|新例子/
const COMPLETE_TASK_PATTERN = /同型任务|(?:独立)?完成(?:一|1)(?:道|个|项)?[^，。；\n]{0,24}(?:任务|练习|题)/
const SELF_EXPLANATION_PATTERN = /用自己的话\s*(?:说出|写出|表达|描述|概括|解释|说明)?/g

export const ASSESSMENT_ACTION_LABELS: Record<AssessmentActionKind, string> = {
  explain: '解释或表述',
  recall: '提取或列举',
  discriminate: '判断或辨析',
  construct: '作图、标注或制作',
  calculate: '计算或推导',
  apply: '迁移或应用',
  'complete-task': '独立完成一道完整任务',
  perform: '朗读、实验或操作',
}

function normalizeAssessmentText(text: string): string {
  // “用自己的话说出”是一次解释性表述，不应再额外算作机械提取。
  return text.replace(SELF_EXPLANATION_PATTERN, '解释')
}

function baseActionKindsIn(text: string): AssessmentActionKind[] {
  const normalized = normalizeAssessmentText(text)
  return (Object.keys(ACTION_PATTERNS) as Exclude<AssessmentActionKind, 'apply' | 'complete-task'>[])
    .filter(kind => ACTION_PATTERNS[kind as Exclude<AssessmentActionKind, 'apply' | 'complete-task'>].test(normalized))
}

export function assessmentActionKindsIn(text: string): AssessmentActionKind[] {
  const kinds = baseActionKindsIn(text)
  // 「迁移到新情境」与「独立完成一道同型任务」是两种要求:前者题面必须真给新情境,
  // 后者一道具体可作答的完整题本身就是达成方式(2026-08-26:旧判定把两者都归 apply,
  // 导致「完成同型任务」类成功信号要求具体题面含「应用/迁移」元话语——具体题目
  // 天然不含这些词,数学练习页 12 连败)。
  if (APPLY_PATTERN.test(text)) kinds.push('apply')
  if (COMPLETE_TASK_PATTERN.test(text)) kinds.push('complete-task')
  return kinds
}

function demonstratedActionKindsIn(task: string, studentAction: string): AssessmentActionKind[] {
  const kinds = baseActionKindsIn(`${task}\n${studentAction}`)
  // 真·迁移仍严判:题面本身要给出新情境/应用表述,studentAction 的流程文案不算。
  if (APPLY_PATTERN.test(task)) kinds.push('apply')
  // 完成整题:题面是一道具体可作答的题(已证至少一种作答行为)即为达成——
  // 不要求具体题面复述「完成一道任务」这类元话语(2026-08-26:旧判定致数学练习页 12 连败)。
  if (APPLY_PATTERN.test(task) || COMPLETE_TASK_PATTERN.test(task) || kinds.length > 0) kinds.push('complete-task')
  return kinds
}

/**
 * 练习首次呈现时只有 task 与 studentAction 可见；feedback、讲稿和板书不能冒充
 * 学生已经完成的证据。这里因此只用作答前文本核对成功信号的行为要求。
 */
export function practiceAlignment(
  successSignal: string,
  task: string,
  studentAction: string,
): PracticeAlignmentResult {
  const expected = assessmentActionKindsIn(successSignal)
  const inspectable = Boolean(task.trim()) && !PLACEHOLDER_PATTERN.test(task)
  const demonstrated = inspectable ? demonstratedActionKindsIn(task, studentAction) : []
  const demonstratedSet = new Set(demonstrated)
  return {
    expected,
    demonstrated,
    missing: expected.filter(kind => !demonstratedSet.has(kind)),
    inspectable,
  }
}

export function practiceSceneAlignment(successSignal: string, scene: LessonScene): PracticeAlignmentResult {
  return practiceAlignment(successSignal, scene.contentSlots.task ?? '', scene.studentAction)
}

export function practiceAlignmentReasons(
  successSignal: string,
  task: string,
  studentAction: string,
): string[] {
  const result = practiceAlignment(successSignal, task, studentAction)
  if (!result.inspectable || result.expected.length === 0 || result.missing.length === 0) return []
  return [`task 与 studentAction 未要求学生完成成功信号中的：${result.missing.map(kind => ASSESSMENT_ACTION_LABELS[kind]).join('、')}`]
}

import type { SceneType } from './domain.js'

/**
 * 只有学生留下了可被教师或系统看见的回答、标注、作品或判断，课堂动作才算学习证据。
 * “观察、阅读、思考、拖动、确认”本身仍有价值，但不能单独证明学生形成了理解。
 */
const OBSERVABLE_EVIDENCE_PATTERN = /(?:写(?:出|下|在|一|好|完|明|清|成|上|入|到|答案|理由|结论|过程|步骤|公式|句子|词语|段落|作品)|记录|标(?:出|注|记|在)|画(?:出|下|一|好|完|图|线|箭头|示意)|作图|圈(?:出|画)|勾(?:选)?|选(?:出|择)?|判断|回答|答出|说出|说说|口述|复述|解释|说明|举例|列出|找出|指出|纠正|改写|计算|算出|求出|定位|分类|排序|重排|匹配|连线|提交|展示|演示|预测|猜想|提出(?:问题|疑问)|提问|设计|评价|质疑|反驳|朗读|跟读|读出|抄(?:写|录)?|填写|自评)/

const WORKED_EXAMPLE_REASON_PATTERN = /(?:依据|理由|为什么|原因|解释|说明|因为|所以|成立|合理)/

export const WORKED_EXAMPLE_SELF_EXPLANATION_CUE = '核对后圈出一个关键步骤，用“因为…所以…”解释为什么这样做'

const EVIDENCE_CLAUSE: Record<SceneType, string> = {
  'source-reading': '并写下一个预测和理由',
  'visual-observation': '再说出一条观察结论和画面依据',
  'concept-build': '再用自己的话解释关键关系',
  'worked-example': '并写出下一步及依据',
  contrast: '再记录一处差异和判断依据',
  practice: '并提交答案和一步理由',
  recap: '再用新例子解释结论',
  'ai-verify': '并指出结论及依据',
  'ai-inquiry': '并写出更有效的追问及理由',
  'ai-collab': '并提交提示词和核验记录',
}

export function studentActionLeavesEvidence(studentAction: string): boolean {
  return OBSERVABLE_EVIDENCE_PATTERN.test(studentAction)
}

/** 完整例题的学习证据必须包含“做了什么”和“为什么这样做”，不能只抄过程。 */
export function workedExampleActionHasSelfExplanation(studentAction: string): boolean {
  return studentActionLeavesEvidence(studentAction) && WORKED_EXAMPLE_REASON_PATTERN.test(studentAction)
}

export function ensureWorkedExampleSelfExplanation(studentAction: string): string {
  const action = studentAction.trim()
  if (workedExampleActionHasSelfExplanation(action)) return action
  const base = action.replace(/[，,。；;！!？?]+$/g, '')
  return base
    ? `${base}，${WORKED_EXAMPLE_SELF_EXPLANATION_CUE}`
    : WORKED_EXAMPLE_SELF_EXPLANATION_CUE
}

/**
 * 保留模型生成的观察或操作，只补上最小的外显回答，不替换原有教学动作。
 */
export function ensureStudentActionEvidence(sceneType: SceneType, studentAction: string): string {
  const action = studentAction.trim()
  if (sceneType === 'worked-example') return ensureWorkedExampleSelfExplanation(action)
  if (studentActionLeavesEvidence(action)) return action

  const base = action.replace(/[，,。；;！!？?]+$/g, '')
  return base ? `${base}，${EVIDENCE_CLAUSE[sceneType]}` : EVIDENCE_CLAUSE[sceneType]
}

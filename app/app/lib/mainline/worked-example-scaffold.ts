import type { LessonScene } from './domain.js'
import { practiceAnswerLeakReasons } from './practice-feedback.js'

export const WORKED_EXAMPLE_COMPLETION_SLOT = 'completionPrompt' as const
export const WORKED_EXAMPLE_GAP_MARKER = '【待补】' as const

const REASON_CUE_PATTERN = /(?:依据|理由|为什么|原因|说明|解释|根据)/
// 「已知/已给出/题面给出」是中文题面写已给信息的标准措辞,与「已有/已经写出」同义,
// 不认它们会把正当完成题拦死(2026-08-25 真实 fill 连续撞死于此)。
const GIVEN_STEP_PATTERN = /(?:已有|已知|已(?:经)?给出|(?:题面|题目|题中|图中|图上)(?:已)?(?:给出|标出|画出|写出|列出|求得)|已经[^。；\n]{0,60}(?:写出|画出|标出|列出|求得|得到|判断|确定)|已(?:写出|画出|标出|列出|求得|得到|判断|确定|选定|找出)|前(?:一|两|几|\d+)步|第一步|先(?:写出|画出|标出|列出|求得|得到|判断|确定))/
const EXPLICIT_GAP_ANSWER_PATTERN = /(?:答案|正确(?:答案|步骤)|应(?:填|写|选|为|是)|填入|写入)[^。；\n]{0,20}【待补】|【待补】[^。；\n]{0,20}(?:答案|正确(?:答案|步骤)|应(?:填|写|选|为|是)|填入|写入)/
const POST_GAP_REVEAL_PATTERN = /(?:答案|正确(?:答案|步骤)|结果|结论)(?:是|为|等于|：|:)|(?:所以|因此|可得|解得|应选|应为|应是)/

export function workedExampleCompletionPrompt(scene: Pick<LessonScene, 'contentSlots'>): string | null {
  const prompt = scene.contentSlots[WORKED_EXAMPLE_COMPLETION_SLOT]?.trim()
  return prompt || null
}

/**
 * 完成题只撤掉一个关键步骤：学生直接看到题面已经给出的信息或步骤，但看不到空缺答案，
 * 并且必须说明依据。这样才能在完整示范与下一页独立练习之间形成真正的支架渐退。
 */
export function workedExampleScaffoldProblems(
  scene: Pick<LessonScene, 'contentSlots'>,
): string[] {
  const prompt = workedExampleCompletionPrompt(scene)
  if (!prompt) return [`缺少 contentSlots.${WORKED_EXAMPLE_COMPLETION_SLOT}，无法形成例题完成题`]

  const gaps = prompt.split(WORKED_EXAMPLE_GAP_MARKER).length - 1
  const problems: string[] = []
  if (gaps !== 1) {
    problems.push(`${WORKED_EXAMPLE_COMPLETION_SLOT} 必须且只能保留一个 ${WORKED_EXAMPLE_GAP_MARKER} 空缺`)
  }
  if (!GIVEN_STEP_PATTERN.test(prompt)) {
    problems.push(`${WORKED_EXAMPLE_COMPLETION_SLOT} 必须直接写出题面已经给出的信息或步骤`)
  }
  if (!REASON_CUE_PATTERN.test(prompt)) {
    problems.push(`${WORKED_EXAMPLE_COMPLETION_SLOT} 必须要求学生说明补步依据`)
  }
  if (EXPLICIT_GAP_ANSWER_PATTERN.test(prompt)) {
    problems.push(`${WORKED_EXAMPLE_COMPLETION_SLOT} 在空缺附近提前写出了待补答案`)
  }

  const steps = scene.contentSlots.steps?.trim() ?? ''
  if (steps.includes(WORKED_EXAMPLE_GAP_MARKER)) {
    problems.push('steps 必须给出完整示范，不能继续保留【待补】空缺')
  }
  const afterGap = prompt.split(WORKED_EXAMPLE_GAP_MARKER)[1]?.trim() ?? ''
  if (steps && (POST_GAP_REVEAL_PATTERN.test(afterGap) || practiceAnswerLeakReasons(afterGap, steps).length > 0)) {
    problems.push(`${WORKED_EXAMPLE_COMPLETION_SLOT} 在空缺之后提前泄露了完整示范中的结果`)
  }
  return problems
}

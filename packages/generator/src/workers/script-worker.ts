import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type {
  OutlineItem,
  KnowledgeProfile,
  TeachingPlan,
  AgentConfig,
  ScriptDoc,
  ScriptLine,
} from '@maolab/shared-types'
import { getTeachingMode, estimateScriptDurationSec } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

/** LLM 输出 schema: 行级讲稿 + 引用（放宽限制以提升首跑成功率） */
const ScriptLineSchema = z.object({
  text: z.string().min(4).max(220),  // 放宽：4 字以上即可（避免 LLM 偶尔短句被拒）；220 上限给客户端截断兜底
  mediaRef: z.string().min(1).optional(),
  interactionRef: z
    .object({
      id: z.string().min(1),
      prompt: z.string().min(1).max(200),
      timeoutSec: z.number().int().positive().max(300).optional(),
    })
    .optional(),
  pauseAfterSec: z.number().min(0).max(15).optional(),
})

const ScriptDocOutputSchema = z.object({
  lines: z.array(ScriptLineSchema).min(1).max(20),  // 放宽：1 行也可（极简场景）；最多 20 行
  feedback: z
    .object({
      correctDefaults: z.array(z.string().min(1).max(120)).min(1).max(8),
      incorrectDefaults: z.array(z.string().min(1).max(120)).min(1).max(8),
    })
    .optional(),
})

export interface ScriptWorkerOptions {
  callLLM: (user: string, system: string) => Promise<string>
  retryOptions?: RetryOptions
}

/**
 * 生成 ScriptDoc：行级讲稿 + 画面/互动引用 + 反馈台词池
 *
 * 与旧 generateScript 的差别：
 * - 输出 ScriptDoc 而非 raw string
 * - 每行 ≤ 180 字（适合 TTS 单段合成）
 * - 每行可标 mediaRef（运行时高亮画面元素）、interactionRef（暂停等学生）
 * - 附带 feedback 默认池（C3 策略）
 */
export async function generateScriptDoc(
  item: OutlineItem,
  profile: KnowledgeProfile,
  plan: TeachingPlan,
  teacher: AgentConfig,
  callLLM: (user: string, system: string) => Promise<string>,
  retryOptions: RetryOptions = { maxRetries: 2, baseDelay: 0 },
  learnerName?: string,
): Promise<ScriptDoc> {
  const objectivesText = item.learningObjectives?.join('\n') ?? item.objective
  const teachingMode = item.teachingModeId
    ? getTeachingMode(item.teachingModeId)
    : undefined
  const modeHint = teachingMode
    ? `教学方法：${teachingMode.label}（${teachingMode.description}）\n媒介：${teachingMode.media}\n学生参与：${teachingMode.participation}`
    : `场景类型：${item.sceneType}`

  const catchphraseRule = teacher.catchphrase
    ? `⚠️ 老师"${teacher.name}"有口头禅"${teacher.catchphrase}"。**绝对不要**在讲解 lines.text 中写口头禅，它只在学生作答后的反馈时使用（由系统自动注入 feedback 字段，无需你写在 lines 里）。`
    : ''
  const wrapupRule = teacher.wrapup
    ? `老师常用收尾问句"${teacher.wrapup}"，可仅在最后一行自然结尾时使用 1 次。`
    : ''

  const vars: Record<string, string> = {
    teacherName: teacher.name,
    teacherPersona: teacher.persona,
    title: item.title,
    objective: item.objective,
    learningObjectives: objectivesText,
    gradeLevel: plan.gradeLevel ?? 'not specified',
    topic: plan.topic,
    domain: profile.domain,
    difficulty: plan.difficulty,
    language: plan.language,
    teachingModeHint: modeHint,
    catchphraseRule,
    wrapupRule,
    learnerName: learnerName ?? '',
    learnerHint: learnerName
      ? `请在合适处自然称呼学生"${learnerName}"（整篇 1~2 次）。`
      : '',
  }

  const { system, user } = buildPrompt(PROMPT_IDS.SCRIPT, vars)

  let output: z.infer<typeof ScriptDocOutputSchema>
  try {
    output = await validatedGenerate(
      user,
      ScriptDocOutputSchema,
      (u) => callLLM(u, system),
      retryOptions,
    )
  } catch (err) {
    console.error('[ScriptDoc] LLM/schema 校验失败，走 fallback。原因：', String(err).slice(0, 500))
    // 降级：用口语化的"老师开场白"，绝不暴露"场景目标是..."这类元话语给学生
    const openHook = item.title?.endsWith('？') || item.title?.endsWith('?')
      ? item.title
      : `今天咱们一起聊聊：${item.title}`
    return {
      outlineItemId: item.id,
      teachingModeId: item.teachingModeId ?? 'lecture-image',
      teacherId: teacher.id,
      lines: [
        {
          id: randomUUID(),
          text: openHook,
          pauseAfterSec: 1,
        },
        {
          id: randomUUID(),
          text: `看屏幕里的内容，慢慢看，看完告诉我你想到了什么。`,
        },
      ],
      estimatedDurationSec: 10,
      feedback: defaultFeedback(),
    }
  }

  const lines: ScriptLine[] = output.lines.map((l) => {
    const line: ScriptLine = {
      id: randomUUID(),
      text: l.text,
    }
    if (l.mediaRef) line.mediaRef = l.mediaRef
    if (l.interactionRef) {
      const iref: ScriptLine['interactionRef'] = {
        id: l.interactionRef.id,
        prompt: l.interactionRef.prompt,
      }
      if (l.interactionRef.timeoutSec !== undefined) iref!.timeoutSec = l.interactionRef.timeoutSec
      line.interactionRef = iref
    }
    if (l.pauseAfterSec !== undefined) line.pauseAfterSec = l.pauseAfterSec
    return line
  })

  // 反馈池：把老师口头禅注入，让"对对对"等只在学生作答后出现
  const feedback = output.feedback
    ? { ...output.feedback, llmEnhance: true }
    : defaultFeedback()
  if (teacher.catchphrase) {
    // 把口头禅排到 correctDefaults 第一位（运行时优先用）
    feedback.correctDefaults = [
      teacher.catchphrase,
      ...feedback.correctDefaults.filter((s) => !s.includes(teacher.catchphrase!)),
    ].slice(0, 5)
  }

  const doc: ScriptDoc = {
    outlineItemId: item.id,
    teachingModeId: item.teachingModeId ?? 'lecture-image',
    teacherId: teacher.id,
    lines,
    estimatedDurationSec: 0,
    feedback,
  }
  doc.estimatedDurationSec = estimateScriptDurationSec(doc)
  return doc
}

function defaultFeedback() {
  return {
    correctDefaults: [
      '对！就是这样～',
      '嗯，看得很准！',
      '答对啦，棒！',
      '没错，你抓住关键了。',
    ],
    incorrectDefaults: [
      '嗯，再仔细看看～',
      '差一点哦，我们一起回想一下。',
      '没关系，再试一次。',
      '思路是对的，再校对一下细节。',
    ],
    llmEnhance: true,
  }
}

/**
 * 旧 API 兼容层：返回拼接后的 raw script（其他地方仍调用此函数时不会立刻崩）
 * 新代码请用 generateScriptDoc。
 */
export async function generateScript(
  item: OutlineItem,
  profile: KnowledgeProfile,
  plan: TeachingPlan,
  teacher: AgentConfig,
  slideContent: string,
  callLLM: (user: string, system: string) => Promise<string>,
  retryOptions: RetryOptions = { maxRetries: 2, baseDelay: 0 },
  learnerName?: string,
): Promise<string> {
  void slideContent
  const doc = await generateScriptDoc(item, profile, plan, teacher, callLLM, retryOptions, learnerName)
  return doc.lines.map((l) => l.text).join('\n\n')
}

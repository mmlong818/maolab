/**
 * Beat — atom 内部演出时间轴
 *
 * 一个 atom = slots(可视元素仓库) + beats(逐个揭示+讲解+反问的时间轴)
 * 老师按 beat 节奏推进，学生可在任何 beat 举手打断。
 */

export type BeatKind =
  | 'reveal'    // 让一个 slot 出现/高亮
  | 'narrate'   // 老师说一段话
  | 'ask'       // 老师反问
  | 'await'     // 等学生输入
  | 'react'     // 反馈学生答案(运行时由 LLM 生成台词)

export interface RevealBeat {
  id: string
  kind: 'reveal'
  /** 指向 atom.slots 里的某个 key */
  slot: string
  /** 视觉效果 */
  effect?: 'fade' | 'slide-up' | 'highlight' | 'pop'
  /** 揭示后停留毫秒(0 表示立即进下一 beat) */
  holdMs?: number
}

/** TTS 情绪(MiniMax voice_setting.emotion 合法值) */
export type SpeechEmotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'

export interface NarrateBeat {
  id: string
  kind: 'narrate'
  /** 台词 30-120 字 */
  script: string
  /** 发言人: 缺省为老师; 学生插话时填学生 id (如 student-zero), 渲染层解析人设+音色 */
  speakerId?: string
  /** 这句台词的情绪(按人设和剧情, 缺省 neutral) */
  emotion?: SpeechEmotion
  /** 可选关键词高亮(出现在 script 中的子串) */
  emphasize?: string
  /** 讲完是否需手动 → 才进下一 beat (默认 true,教学模式可改为自动) */
  pauseAfter?: boolean
}

export interface AskBeat {
  id: string
  kind: 'ask'
  /** 老师问的话 */
  question: string
  /** 期待答案类型 */
  expectKind: 'mcq' | 'free-text' | 'pick-slot'
  /** 快慢思考: fast=直觉检查题, slow=需纸笔推理 */
  thinkMode?: 'fast' | 'slow'
  /** mcq 时的选项 */
  options?: string[]
  /** 正确答案(mcq=索引, free-text=参考答案文本) */
  expectedAnswer?: string | number
  /** free-text 评估时希望命中的关键点(LLM 用) */
  keyPoints?: string[]
}

export interface AwaitBeat {
  id: string
  kind: 'await'
  /** 超过这个秒数自动给提示并继续 */
  timeoutSec?: number
  /** 超时提示 */
  hint?: string
}

export interface ReactBeat {
  id: string
  kind: 'react'
  /** 对应的 ask beat id,运行时拉取学生答案 + LLM 生成反馈台词 */
  branchOn: string
}

export type Beat = RevealBeat | NarrateBeat | AskBeat | AwaitBeat | ReactBeat

/** 评估学生作答的结果 */
export interface AnswerEvaluation {
  verdict: 'correct' | 'partial' | 'incorrect' | 'off-topic'
  /** 教师人设语气的反馈,40-150 字 */
  feedback: string
  /** 可选的继续思考提示 */
  nextHint?: string
}

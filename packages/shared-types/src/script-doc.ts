/**
 * ScriptDoc — 讲稿数据结构（替换之前 raw string 讲稿）
 *
 * 设计原则（用户口述需求）：
 * - 真实老师备课式：讲稿先于画面/互动
 * - 每行 ≤ 180 字（DashScope CosyVoice 安全长度，避免 418）
 * - 每行可引用画面元素 id（mediaRef），运行时高亮
 * - 每行可标注互动点（interactionRef），运行时暂停 TTS 等学生
 * - 每行可声明朗读后停顿（pauseAfterSec）
 */

/** 单行讲稿 */
export interface ScriptLine {
  /** 行 id，稳定（用于 audio 文件命名 + 运行时引用） */
  id: string
  /** 老师朗读的台词，≤ 180 字 */
  text: string
  /** 关联的节目单节点 id，用于内容页生成时按节点取对应讲稿 */
  nodeId?: string
  /** 引用画面元素 id，运行时高亮（如 'pizza-1-half' / 'cell-membrane'） */
  mediaRef?: string
  /** 互动点：朗读到这一行后暂停 TTS，等学生完成 interactionId 描述的操作 */
  interactionRef?: {
    /** 互动 id（与 SceneContent 中互动元素对应） */
    id: string
    /** 提示文案（"请把 1/2 拖到 等分一栏"） */
    prompt: string
    /** 等待最长时间（秒），超时后自动继续 */
    timeoutSec?: number
  }
  /** 朗读完这行后停顿秒数（节奏控制，0=立即下一行） */
  pauseAfterSec?: number
  /** S2 多角色：说话者（teacher 或同学 agent id），缺省 teacher。TTS 按角色匹配音色 */
  speaker?: string
}

/** 整场景讲稿 */
export interface ScriptDoc {
  /** 场景所属 outline 项 id */
  outlineItemId: string
  /** 教学方法 id（来自 TEACHING_MODES） */
  teachingModeId: string
  /** 老师 id（用于声音音色匹配） */
  teacherId: string
  /** 讲稿台词行（按顺序） */
  lines: ScriptLine[]
  /** 估算总时长（秒），≈ sum(line.text.length / 4) + sum(pauseAfterSec) */
  estimatedDurationSec: number
  /** 互动反馈策略（C3：预生成默认 + LLM 异步增强） */
  feedback?: {
    /** 学生做对时的默认台词池（≥3 句，随机选播） */
    correctDefaults: string[]
    /** 学生做错时的默认引导台词池 */
    incorrectDefaults: string[]
    /** 是否启用 LLM 异步增强（默认 true） */
    llmEnhance?: boolean
  }
}

/** 估算单行 TTS 时长（中文按字数粗算，约 4 字/秒） */
export function estimateLineDurationSec(line: Pick<ScriptLine, 'text' | 'pauseAfterSec'>): number {
  return line.text.length / 4 + (line.pauseAfterSec ?? 0)
}

/** 估算整 doc 时长 */
export function estimateScriptDurationSec(doc: Pick<ScriptDoc, 'lines'>): number {
  return doc.lines.reduce((sum, l) => sum + estimateLineDurationSec(l), 0)
}

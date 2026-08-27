/**
 * SceneAtom — v2 不可分割的"一页一语义"原子（Sprint 0）
 *
 * 北极星：一个 Atom 只承载一个语义单元。
 * 多题、多结论、多例子同页 → 校验层拒收，自动拆成 N 个 Atom。
 *
 * 与旧 Scene 的关系：
 * - 旧 Scene 含 multi-slide / quiz.questions[]，是复合容器
 * - 新 SceneAtom 是叶子节点，由 ScriptLine 触发生成
 * - 迁移：旧 Scene 在加载时被 splitter 拆成 atoms（Sprint 6 实现批量重整）
 */

/** Atom 类型枚举 — 严格闭集 */
export type AtomType =
  | 'image-caption'      // 一张图 + 一段说明文字
  | 'single-claim'       // 一句核心论断 / 知识点陈述
  | 'single-question'    // 一道题（选择/判断/简答）
  | 'single-example'     // 一个具体案例
  | 'dialogue-turn'      // 一轮师生对话
  | 'derivation-step'    // 一步推导（数学/逻辑）
  | 'demonstration'      // 一次操作演示（动画/视频/代码运行）
  | 'recap-bullet'       // 一条总结要点
  | 'worked-example'     // 一道带步骤的范例题（problem → steps → conclusion）
  | 'media-interlude'    // 课内媒体节点（知识歌/漫画等，整体为一个语义单元）

/**
 * 教学内容类型 (C01 概念定义 / C02 概念对比 / C03 关系结构 / C04 公式规律 /
 * C05 流程步骤 / C06 方法策略 / C07 例题示范 / C08 纠错 / C09 情境应用 /
 * C10 记忆提取 / C11 审美感受 / C12 价值理解 / C13 实验观察 / C14 图表读取 /
 * C15 综合任务)。规格详情见 app teaching-taxonomy。
 * 生成期由 LLM 显式标注, 渲染端凭它选择承载模板, 不再靠关键词正则事后猜。
 */
export type TeachingContentTypeId =
  | 'C01' | 'C02' | 'C03' | 'C04' | 'C05'
  | 'C06' | 'C07' | 'C08' | 'C09' | 'C10'
  | 'C11' | 'C12' | 'C13' | 'C14' | 'C15'

export type VisualSpec =
  | {
      kind: 'concept-map'
      subject: string
      nodes: Array<{ id: string; label: string; role?: string }>
      links: Array<{ from: string; to: string; label?: string }>
      focus?: string
    }
  | {
      kind: 'math-model'
      model: 'number-line' | 'coordinate' | 'ratio-bar' | 'geometry'
      values: Record<string, unknown>
      focus?: string
    }
  | {
      kind: 'experiment-board'
      objects: string[]
      conditions: string[]
      observations: string[]
      conclusion?: string
      focus?: 'objects' | 'conditions' | 'observations' | 'conclusion'
    }
  | {
      kind: 'data-chart'
      chart: 'bar' | 'line' | 'table'
      data: Array<Record<string, string | number>>
      focus?: string
      conclusion?: string
    }
  | {
      kind: 'worked-example-board'
      problem: string
      known: string[]
      goal: string
      steps: Array<{ stepNum: number; action: string; explanation?: string }>
      check?: string
      focusStepNum?: number
    }
  | {
      kind: 'supporting-illustration'
      decorKind: string
      cue: string
      style: string
    }

/** 共享的 Atom 元数据 */
export interface AtomBase {
  /** 稳定 id */
  id: string
  /** 所属 Rundown.segment.id */
  rundownSegmentId: string
  /** 关联的 ScriptLine.id（每 atom 由一行讲稿触发） */
  scriptLineId?: string
  /** 关联 TeachingPlan.objectives 的 id 列表 */
  objectiveIds: string[]
  /** 是否允许学生跳过 */
  skippable: boolean
  /** 生成元信息 */
  meta: {
    generatedAt: number
    revision: number
    /** 若由 splitter 从旧 Scene 拆出，记录来源 */
    derivedFromSceneId?: string
  }
  /** 呈现预设(KP 驱动): concept-anchor/comparison-table/cause-chain/lab-bench 等;
   *  缺省按 atom type 映射呈现器 */
  presentation?: string
  /** v3 演出层:可视元素仓库,由 reveal beat 逐个揭示 */
  slots?: Record<string, unknown>
  /** v3 演出层:beat 时间轴,有则走 BeatStage,无则走旧 AtomRenderer */
  beats?: import('./beat.js').Beat[]
  /**
   * 教学图示规格。精确知识先生成结构化规格，再由播放页/视频页渲染。
   * 生图只负责 supporting-illustration，不承载公式、单位、数据和答案。
   */
  visualSpec?: VisualSpec
  /**
   * 教学内容类型 — 生成期由 LLM 显式标注(_contentType)。
   * 渲染端(ConceptVisual 派发/反馈脚本选择/片段 designNotes)优先用它,
   * 缺省(存量课程)才回落关键词正则推断。
   */
  contentType?: TeachingContentTypeId
  /** B-6/D-3: 此 atom 内容是否为 AI 拓展(无教学设计 baseline 支撑) */
  isExtension?: boolean
  /** P0-1 差异化教学: 当前 payload 对应的难度等级 (默认 standard) */
  difficultyLevel?: 'basic' | 'standard' | 'advanced'
  /** P0-1 差异化教学: 同一节点的其他难度版本 payload (按需生成,UI 可切换) */
  payloadVariants?: {
    basic?: Record<string, unknown>
    advanced?: Record<string, unknown>
  }
  /**
   * PR3a 知识图谱: atom 起源的教材叶子节点 id (chapter_node_id).
   * 可选, 用于"学情→KP→cluster"反查的懒回填 (kp-cluster-mapper 第二条路径).
   * 来源: 由 rundown 节点透传; 当前 rundown schema 尚未携带 leaf id,
   *       新生成的 atom 暂为 undefined, 待 rundown schema 升级后回填.
   */
  sourceLeafId?: string
}

/** 难度等级 */
export type DifficultyLevel = 'basic' | 'standard' | 'advanced'

export interface ImageCaptionAtom extends AtomBase {
  type: 'image-caption'
  payload: {
    imageUrl: string
    /** 视障可访问性：简短描述图里是什么（≤ 120 字，不直接展示给学生） */
    imageAlt: string
    /**
     * 旧字段：兼容存量数据。新生成内容请优先填 studentCaption。
     * 渲染时优先级：studentCaption > caption。
     */
    caption: string
    /**
     * 新字段：给学生看的图注（必须经过分龄写作约束）。
     * 例如一年级版："🌤 抬头看「天」～"；高中版："光合作用速率受光强度限制的反应"。
     */
    studentCaption?: string
    /**
     * 新字段：给画图 AI 看的详细视觉描述（可以长、可以细），学生看不到。
     * 等价于旧的 prompt 字段（保留 prompt 仅为向后兼容）。
     */
    imagePrompt?: string
    /** 生成时的 prompt（旧字段，与 imagePrompt 同义，按存量数据保留） */
    prompt?: string
  }
}

export interface SingleClaimAtom extends AtomBase {
  type: 'single-claim'
  payload: {
    /** 核心论断（≤ 40 字） */
    claim: string
    /** 可选支持理由（≤ 80 字） */
    support?: string
  }
}

export interface SingleQuestionAtom extends AtomBase {
  type: 'single-question'
  payload: {
    /** 题干 */
    stem: string
    /** 题型 */
    kind: 'mcq' | 'true-false' | 'short-answer' | 'fill-blank'
    /** 选项（mcq / true-false 必填） */
    options?: string[]
    /** 正确答案（mcq=选项 index；true-false=true/false；short=参考答案；fill=词组数组） */
    answer: number | boolean | string | string[]
    /** 答对反馈 */
    onCorrect: string
    /** 答错反馈（含解析） */
    onIncorrect: string
    /** 是否允许重试 */
    allowRetry: boolean
  }
}

export interface SingleExampleAtom extends AtomBase {
  type: 'single-example'
  payload: {
    /** 案例标题 */
    title: string
    /**
     * 旧字段：兼容存量数据。新生成内容请使用 studentVisible。
     * 渲染优先级：studentVisible > body。
     */
    body: string
    /**
     * 新字段：真正展示给学生的案例正文（经分龄约束；不含"教师指图…"这类老师视角）。
     * ≤ 200 字。
     */
    studentVisible?: string
    /**
     * 新字段：仅供后台/教师查看的执行备注（不展示给学生）。
     * 例如 "教师同步抬头示意，引导学生模仿"。
     */
    teacherNote?: string
    /** 可选配图 */
    imageUrl?: string
  }
}

export interface DialogueTurnAtom extends AtomBase {
  type: 'dialogue-turn'
  payload: {
    /** 说话方 */
    speaker: 'teacher' | 'student' | 'narrator'
    /** 台词 */
    line: string
    /** 是否暂停等学生反应 */
    pausesForStudent: boolean
  }
}

export interface DerivationStepAtom extends AtomBase {
  type: 'derivation-step'
  payload: {
    /** 这一步的"为什么" */
    motivation: string
    /** 表达式或公式（支持 LaTeX） */
    expression: string
    /** 这一步用了什么规则 */
    justification: string
  }
}

export interface DemonstrationAtom extends AtomBase {
  type: 'demonstration'
  payload: {
    /** 展示形式 */
    medium: 'animation' | 'video' | 'code-exec' | 'diagram'
    /** 资源 url 或 inline 数据（视觉描述，供生图器使用） */
    src: string
    /** 教师同步旁白 */
    narration: string
    /** 由 worker 后注入的静态代表图 URL（动画引擎集成前的临时方案） */
    imageUrl?: string
  }
}

export interface RecapBulletAtom extends AtomBase {
  type: 'recap-bullet'
  payload: {
    /** 总结条目（≤ 30 字） */
    bullet: string
    /** 关联回 plan.objective */
    refObjectiveId?: string
  }
}

export interface WorkedExampleAtom extends AtomBase {
  type: 'worked-example'
  payload: {
    /** 题面陈述 */
    problemStatement: string
    /** 解题步骤序列 */
    steps: Array<{
      stepNum: number
      action: string
      explanation: string
    }>
    /** 结论 / 答案 */
    conclusion: string
  }
}

export interface MediaInterludeAtom extends AtomBase {
  type: 'media-interlude'
  payload: {
    /** 媒体标题（"分数口诀歌"） */
    title: string
    /** 覆盖的 KP id（可追溯，防媒介化编造知识） */
    kpIds: string[]
    /** 媒体内容（与原 MediaForm.payload 同构，复用 SongPlayer/ComicPlayer 渲染） */
    media: import('./course.js').SongPayload | import('./course.js').ComicPayload
  }
}

export type SceneAtom =
  | ImageCaptionAtom
  | SingleClaimAtom
  | SingleQuestionAtom
  | SingleExampleAtom
  | DialogueTurnAtom
  | DerivationStepAtom
  | DemonstrationAtom
  | RecapBulletAtom
  | WorkedExampleAtom
  | MediaInterludeAtom

/** 守门校验：检查 atom 是否违反"一页一语义" */
export interface AtomValidationIssue {
  atomId: string
  severity: 'error' | 'warning'
  rule:
    | 'multiple-questions-detected'
    | 'multiple-claims-detected'
    | 'compound-image-with-question'
    | 'over-length'
    | 'missing-payload'
  message: string
}

/**
 * 迁移 helper：把旧 atom 的 caption / body 字段同步到新字段，保证渲染兼容。
 * 不原地改写，返回新副本（遵循不可变性）。
 *
 * - image-caption: 若无 studentCaption, 用 caption 填充; 若无 imagePrompt, 用 prompt 填充
 * - single-example: 若无 studentVisible, 用 body 填充
 */
export function migrateAtomFields(atom: SceneAtom): SceneAtom {
  if (atom.type === 'image-caption') {
    const p = atom.payload
    if (p.studentCaption && p.imagePrompt) return atom
    return {
      ...atom,
      payload: {
        ...p,
        studentCaption: p.studentCaption ?? p.caption,
        ...((p.imagePrompt ?? p.prompt) ? { imagePrompt: p.imagePrompt ?? p.prompt } : {}),
      },
    }
  }
  if (atom.type === 'single-example') {
    const p = atom.payload
    if (p.studentVisible) return atom
    return {
      ...atom,
      payload: {
        ...p,
        studentVisible: p.body,
      },
    }
  }
  return atom
}

/** 给生成器看的硬限制 */
export const ATOM_LIMITS = {
  claim_max_chars: 80,
  support_max_chars: 160,
  example_body_max_chars: 400,
  recap_bullet_max_chars: 60,
  /** 任何 atom 不允许内嵌 question option 超过 4 个 */
  question_option_max: 4,
} as const

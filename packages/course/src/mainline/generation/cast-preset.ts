/**
 * 卡司预设 · P2 compile-lesson
 *
 * 从 3 门黄金样板课直接抽出 castProfiles / voiceProfiles / teacherSubjectProfile /
 * peerRoleProfile / gradeAdaptationProfile 作为(gradeBand × subject)组合的预设。
 *
 * 好处:样板课的 profile 已经过闸门(≥4 张半身透明立绘、老师-学科-年级三向绑定一致),
 * 复用比重新组装更稳。**这是"精美立绘"的技术粘合点:P2 生成的新课默认自带样板课
 * 同款卡司**,不是随机凑一份。
 */

import type {
  CastProfile,
  CharacterExpressionAsset,
  GradeBand,
  PeerRoleProfile,
  SubjectId,
  SubjectTeachingMode,
  TeacherSubjectProfile,
  VoiceProfile,
  GradeAdaptationProfile,
} from '../domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { resolveMainlineTtsVoiceId } from '../tts-cast.js'

const BASE_MIDDLE_SUMMER = '/generated-images/cast/base/middle/summer'
function midAsset(id: string, expression: string): CharacterExpressionAsset {
  return {
    expression,
    src: `${BASE_MIDDLE_SUMMER}/${id}-${expression}.png`,
    kind: 'half-body-cutout',
    transparentBackground: true,
  }
}
function midExpressionSet(id: string): CharacterExpressionAsset[] {
  return ['neutral', 'thinking', 'happy', 'surprised'].map(e => midAsset(id, e))
}

/** 按学科选择老师的核心讲法模式;compile-lesson 与 pickCastPreset 共用。 */
export function subjectMode(subject: SubjectId): SubjectTeachingMode {
  if (subject === 'chinese' || subject === 'history' || subject === 'english') return 'text-close-reading'
  if (subject === 'math' || subject === 'physics' || subject === 'chemistry') return 'step-derivation'
  if (subject === 'science' || subject === 'biology') return 'experiment-observation'
  if (subject === 'geography') return 'spatial-reasoning'
  return 'general-explanation'
}

export interface CastPreset {
  key: string
  gradeBand: GradeBand
  subject: SubjectId
  selectedTeacher: string
  teacherSubjectProfile: TeacherSubjectProfile
  peerRoleProfile: PeerRoleProfile
  castProfiles: CastProfile[]
  voiceProfiles: VoiceProfile[]
  gradeAdaptationProfile: GradeAdaptationProfile
}

interface SubjectCastContext {
  label: string
  teachingIdentity: string
  boardStyle: string
  voiceNotes: string
}

const SUBJECT_CAST_CONTEXT: Record<SubjectId, SubjectCastContext> = {
  chinese: {
    label: '语文',
    teachingIdentity: '重视朗读、文本证据与表达',
    boardStyle: '原文或语料居中，关键词、证据与表达路径分层呈现。',
    voiceNotes: '语言亲切清楚，朗读处留停顿，证据词与关键句重读。',
  },
  math: {
    label: '数学',
    teachingIdentity: '重视定义、表示、推理与变式',
    boardStyle: '条件、表示、推理步骤与结论分区，公式和图形保持一一对应。',
    voiceNotes: '条件与符号读清楚，关键推理放慢，结论后留出自检时间。',
  },
  science: {
    label: '科学',
    teachingIdentity: '重视观察、证据、假设与验证',
    boardStyle: '现象、证据、解释和验证步骤分区，不把结论提前写进观察区。',
    voiceNotes: '先描述可见现象，再解释原因；提出假设后留出观察和判断时间。',
  },
  english: {
    label: '英语',
    teachingIdentity: '重视语境、形式、意义与真实运用',
    boardStyle: '语境、语言形式、意义和例句并列，避免脱离语境罗列规则。',
    voiceNotes: '目标表达自然清晰，例句先整体听读，再突出结构和语用差异。',
  },
  history: {
    label: '历史',
    teachingIdentity: '重视时空背景、史料证据与因果解释',
    boardStyle: '时间、人物、事件、证据与影响分层，因果链不与时间线混写。',
    voiceNotes: '年代和转折点重读，史实与解释分开说，因果判断前留出证据核对。',
  },
  politics: {
    label: '道德与法治',
    teachingIdentity: '重视真实情境、规则依据、价值判断与公共参与',
    boardStyle: '情境事实、规则依据、观点理由和行动选择分层，避免用口号代替论证。',
    voiceNotes: '先辨清事实和规则，再讨论价值选择；结论前留出理由比较时间。',
  },
  geography: {
    label: '地理',
    teachingIdentity: '重视地图、尺度、空间关系与综合分析',
    boardStyle: '地图分区、方位、尺度与因果箭头配合，避免用长段文字替代空间关系。',
    voiceNotes: '方位、尺度和区域名称重读，读图时按固定空间顺序推进。',
  },
  physics: {
    label: '物理',
    teachingIdentity: '重视现象、模型、量纲与推理',
    boardStyle: '对象、已知量、模型图、公式和单位对齐，图示方向与计算符号一致。',
    voiceNotes: '先界定研究对象，再读量和单位；模型假设与关键推理放慢。',
  },
  chemistry: {
    label: '化学',
    teachingIdentity: '重视宏观现象、微观解释与符号表达',
    boardStyle: '宏观现象、微观粒子和化学符号分层对应，条件与计量关系单独标明。',
    voiceNotes: '现象先于解释，化学式和反应条件读清楚，宏观与微观切换时停顿。',
  },
  biology: {
    label: '生物',
    teachingIdentity: '重视结构、功能、实验与机制',
    boardStyle: '结构层级、功能关系、实验变量与机制链分区，避免把相关性写成因果。',
    voiceNotes: '结构名称读准，机制按先后关系讲，实验结论前先核对变量和证据。',
  },
  general: {
    label: '综合',
    teachingIdentity: '重视问题拆解、证据判断与迁移应用',
    boardStyle: '问题、证据、方法和结论分区，每一步只保留必要线索。',
    voiceNotes: '先说清任务和证据，再给方法；关键选择后留出解释时间。',
  },
}

const GRADE_LABEL: Record<GradeBand, string> = {
  'lower-primary': '小学低年级',
  'upper-primary': '小学高年级',
  'middle-school': '初中',
  'high-school': '高中',
}

const TEACHER_DISPLAY_NAMES: Partial<Record<string, string>> = {
  'teacher-professor': '陈老师',
  'teacher-young': '小李老师',
}

function presetKey(gradeBand: GradeBand, subject: SubjectId): string {
  return `${gradeBand}::${subject}`
}

function fromSample(id: string): CastPreset {
  const c = GOLDEN_MAINLINE_COURSES.find(x => x.id === id)
  if (!c) throw new Error(`sample course not found: ${id}`)
  return {
    key: presetKey(c.gradeBand, c.subject),
    gradeBand: c.gradeBand,
    subject: c.subject,
    selectedTeacher: c.selectedTeacher,
    teacherSubjectProfile: c.teacherSubjectProfile,
    peerRoleProfile: c.peerRoleProfile,
    castProfiles: c.castProfiles,
    voiceProfiles: c.voiceProfiles,
    gradeAdaptationProfile: c.gradeAdaptationProfile,
  }
}

/** round06 决策 1:为初中地理专门扩预设,不再借用文学学者陈教授。
 * 老师=龙老师(稳重、有讲课手势,气质"能指点江山"),
 * 学生=苏同学(手持笔记本、举手提问型,适合承担 misconception)。 */
const GEO_MIDDLE_PRESET: CastPreset = {
  key: 'middle-school::geography',
  gradeBand: 'middle-school',
  subject: 'geography',
  selectedTeacher: 'teacher-longlaoshi',
  teacherSubjectProfile: {
    teacherId: 'teacher-longlaoshi',
    subject: 'geography',
    teachingMode: 'spatial-reasoning',
    boardStyle: '地图分区 + 简称对照表 + 时空箭头,不堆密集文字。',
    techniquePreference: ['static-board', 'path-tracing', 'comparison-slider', 'step-replay'],
    voiceNotes: '稳重、语速中等;涉及口诀时明显放慢并抑扬,方位词(东/南/西/北)重读。',
  },
  peerRoleProfile: {
    peerId: 'student-steady',
    allowedFunctions: ['questioner', 'misconception', 'peer-restate'],
    nonGoals: ['不做地理无关的插科打诨', '不替代老师给出结论'],
  },
  castProfiles: [
    {
      id: 'teacher-longlaoshi',
      role: 'teacher',
      displayName: '龙老师',
      identity: '初中地理老师,擅长用地图分区、口诀助记与时空关联组织教学。',
      gradeFit: ['middle-school', 'high-school'],
      subjectFit: ['geography', 'history'],
      visualIdentity: '稳重中年男老师,眼镜 + 浅蓝短袖 + 皮带,常带讲解手势,像能"指点江山"的一线地理教师。',
      expressionSet: ['neutral', 'thinking', 'happy', 'surprised'],
      assetRefs: midExpressionSet('teacher-longlaoshi'),
    },
    {
      id: 'student-steady',
      role: 'student',
      displayName: '苏同学',
      identity: '初中学生,分析型,常带笔记本举手提问,负责典型地名/位置混淆疑问。',
      gradeFit: ['middle-school'],
      subjectFit: ['geography', 'history', 'chinese'],
      visualIdentity: '扎马尾女学生,白色校服 + 深色百褶裙,常抱笔记本举一根手指。',
      expressionSet: ['neutral', 'thinking', 'happy', 'surprised'],
      assetRefs: midExpressionSet('student-steady'),
    },
  ],
  voiceProfiles: [
    {
      castId: 'teacher-longlaoshi',
      voiceId: 'zhipu:longlaoshi-middle-geo',
      pace: 'medium',
      emotionRange: ['calm', 'analytical', 'emphatic'],
      stabilityRule: '龙老师同课全程使用同一稳重男声,口诀时明显放慢、方位词重读,不能中途变声。',
    },
    {
      castId: 'student-steady',
      voiceId: 'zhipu:middle-school-girl-steady',
      pace: 'medium',
      emotionRange: ['questioning', 'thinking', 'restating'],
      stabilityRule: '苏同学只承担提问、误区暴露、复述,不替老师做长讲解。',
    },
  ],
  gradeAdaptationProfile: {
    gradeBand: 'middle-school',
    languageDensity: 'medium',
    boardDensity: 'medium',
    interactionDensity: 'medium',
    teacherPace: 'medium',
    roleMaturity: 'balanced',
  },
}

const PRESETS: CastPreset[] = [
  fromSample('golden-primary-jingyesi'),
  fromSample('golden-middle-tianjingsha'),
  fromSample('golden-middle-refraction'),
  GEO_MIDDLE_PRESET,
]

/**
 * 学段家族:相邻学段互借远优于跨断层回兜底(小初之间卡司气质/语言密度是断层——
 * 真检发现小学数学课落到「初中文学教授」就是没有家族层导致的)。
 */
const GRADE_FAMILY: Record<GradeBand, readonly GradeBand[]> = {
  'lower-primary': ['upper-primary'],
  'upper-primary': ['lower-primary'],
  'middle-school': ['high-school'],
  'high-school': ['middle-school'],
}

function teacherOf(p: CastPreset): CastProfile | undefined {
  return p.castProfiles.find(c => c.id === p.selectedTeacher)
}

function adaptFallbackCastProfiles(
  raw: CastPreset,
  gradeBand: GradeBand,
  subject: SubjectId,
): CastProfile[] {
  const context = SUBJECT_CAST_CONTEXT[subject]
  const gradeLabel = GRADE_LABEL[gradeBand]
  return raw.castProfiles.map(cast => {
    if (cast.id === raw.selectedTeacher) {
      return {
        ...cast,
        displayName: TEACHER_DISPLAY_NAMES[cast.id] ?? cast.displayName,
        identity: `${gradeLabel}${context.label}教师，${context.teachingIdentity}。`,
        visualIdentity: `${gradeLabel}课堂教师形象；保留角色既有外观，画面道具与学科符号服从${context.label}内容，不用服装替代专业性。`,
        gradeFit: [gradeBand],
        subjectFit: [subject],
      }
    }
    if (cast.id === raw.peerRoleProfile.peerId) {
      return {
        ...cast,
        identity: `${gradeLabel}学生，负责提出${context.label}学习中的典型疑问、尝试解释并复述依据。`,
        visualIdentity: `${gradeLabel}同龄学生形象；保留角色既有外观，以提问、尝试和复述动作支持${context.label}学习。`,
        gradeFit: [gradeBand],
        subjectFit: [subject],
      }
    }
    return cast
  })
}

function adaptFallbackVoiceProfiles(
  raw: CastPreset,
  castProfiles: readonly CastProfile[],
  context: SubjectCastContext,
): VoiceProfile[] {
  const nameById = new Map(castProfiles.map(cast => [cast.id, cast.displayName]))
  return raw.voiceProfiles.map(voice => {
    const isTeacher = voice.castId === raw.selectedTeacher
    return {
      ...voice,
      stabilityRule: isTeacher
        ? `${nameById.get(voice.castId) ?? '老师'}同课全程使用同一声线；${context.label}术语读准，关键证据和推理处放慢，不中途变声。`
        : `${nameById.get(voice.castId) ?? '同学'}只承担提问、尝试、误区暴露和依据复述，不替老师做长讲解。`,
    }
  })
}

function runnableVoiceProfiles(
  voiceProfiles: readonly VoiceProfile[],
  castProfiles: readonly CastProfile[],
  gradeBand: GradeBand,
): VoiceProfile[] {
  const castById = new Map(castProfiles.map(cast => [cast.id, cast]))
  return voiceProfiles.map(voice => ({
    ...voice,
    voiceId: resolveMainlineTtsVoiceId({
      castId: voice.castId,
      role: castById.get(voice.castId)?.role,
      gradeBand,
      configuredVoiceId: voice.voiceId,
    }),
  }))
}

/**
 * 挑选卡司预设,按匹配质量逐级回落:
 * 1. exact:gradeBand × subject 精确命中
 * 2. grade-only:同学段异学科
 * 3. grade-family:相邻学段互借——**老师立绘档案 gradeFit 覆盖目标学段才可借**
 *    (小美老师 gradeFit 含 upper-primary,小学高年级借静夜思卡司而非跨到初中)
 * 4. default:兜底 tianjingsha 的资产外形
 *
 * 非精确命中只借用立绘、音色和基础互动密度；老师/同学的学科身份、板书方式、
 * 讲述节奏和角色边界必须按目标学段与学科重新建立，不能把“文学老师讲数学”
 * 作为允许授课的 warning 留给教师收拾。
 */
export function pickCastPreset(input: { gradeBand: GradeBand; subject: SubjectId }): {
  preset: CastPreset
  matched: 'exact' | 'grade-only' | 'grade-family' | 'default'
} {
  const exact = PRESETS.find(p => p.key === presetKey(input.gradeBand, input.subject))
  // exact 命中直接返回:preset 已经是精确定义(subject/gradeBand/teachingMode/立绘全对),
  // 不需要动态改写(否则会把 preset 精心定的 teachingMode 覆盖成 subjectMode 通用值)。
  if (exact) {
    return {
      preset: {
        ...exact,
        voiceProfiles: runnableVoiceProfiles(exact.voiceProfiles, exact.castProfiles, exact.gradeBand),
      },
      matched: 'exact',
    }
  }

  const family = GRADE_FAMILY[input.gradeBand]
  const borrowable = PRESETS.filter(p =>
    family.includes(p.gradeBand) && (teacherOf(p)?.gradeFit ?? []).includes(input.gradeBand),
  )
  const raw = PRESETS.find(p => p.gradeBand === input.gradeBand)
    ?? borrowable.find(p => p.subject === input.subject)
    ?? borrowable[0]
    ?? PRESETS[1]!
  const matched: 'grade-only' | 'grade-family' | 'default' =
    raw.gradeBand === input.gradeBand ? 'grade-only' : borrowable.includes(raw) ? 'grade-family' : 'default'

  const context = SUBJECT_CAST_CONTEXT[input.subject]
  const castProfiles = adaptFallbackCastProfiles(raw, input.gradeBand, input.subject)

  // fallback 才动态改写:保证 course 和 profile 一致(闸门要求)。
  // preset 只提供"卡司立绘 + 音色 + 语言/交互密度"这些静态资产；学科身份
  // 与教学表达必须在这里适配，不能把样板课的人文/理科文案带进目标课程。
  // 扩预设是长期方向,让 exact 命中越多、fallback 越少。
  const preset: CastPreset = {
    ...raw,
    key: presetKey(input.gradeBand, input.subject),
    gradeBand: input.gradeBand,
    subject: input.subject,
    teacherSubjectProfile: {
      ...raw.teacherSubjectProfile,
      subject: input.subject,
      teachingMode: subjectMode(input.subject),
      boardStyle: context.boardStyle,
      voiceNotes: context.voiceNotes,
    },
    peerRoleProfile: {
      ...raw.peerRoleProfile,
      nonGoals: ['不替老师直接给出完整答案', '不制造与本课学习无关的笑点'],
    },
    castProfiles,
    voiceProfiles: runnableVoiceProfiles(
      adaptFallbackVoiceProfiles(raw, castProfiles, context),
      castProfiles,
      input.gradeBand,
    ),
    gradeAdaptationProfile: {
      ...raw.gradeAdaptationProfile,
      gradeBand: input.gradeBand,
    },
  }
  return { preset, matched }
}

export function listPresetCoverage(): Array<{ gradeBand: GradeBand; subject: SubjectId }> {
  return PRESETS.map(p => ({ gradeBand: p.gradeBand, subject: p.subject }))
}

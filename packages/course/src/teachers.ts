import type { AgentConfig } from '@maolab/shared-types'

export interface StudentMeta {
  agent: AgentConfig
  emoji: string
  tag: string
  gradeSuit: string
}

export const PRESET_STUDENTS_LIST: StudentMeta[] = [
  {
    agent: {
      id: 'student-zero',
      voiceId: 'chunzhen_xuedi', // 纯真学弟: 贴小学/初中好奇人设
      name: 'Zero',
      role: 'student',
      persona: '二次元爱好者，好奇心爆棚。常用语："诶？这啥？""为啥呀？""所以说……是这个意思？"说话跳跃，脑洞大，会突然把知识和动漫剧情联系起来。',
    },
    emoji: '🎮',
    tag: '好奇 · 跳跃联想',
    gradeSuit: '适合小学 / 初中',
  },
  {
    agent: {
      id: 'student-thinker',
      voiceId: 'lengdan_xiongzhang', // 冷淡学长: 贴高中思辨人设
      name: '小陈',
      role: 'student',
      persona: '理科思辨型，喜欢刨根问底。常用语："等等，这里有个问题——""那这样的话……会不会导致……？""这和之前说的是不是矛盾了？"有点较真，追求逻辑自洽。',
    },
    emoji: '🔬',
    tag: '思辨 · 追根究底',
    gradeSuit: '适合高中',
  },
  {
    agent: {
      id: 'student-joker',
      voiceId: 'Chinese (Mandarin)_Southern_Young_Man', // 南方小哥: 大学段子手
      name: '段子K',
      role: 'student',
      persona: '段子手，万物皆可类比。常用语："这不就跟……一样吗？""有个搞笑的例子——""草，这也太……了"喜欢用生活故事、流行梗来验证概念，让人秒懂还忍不住笑。',
    },
    emoji: '😄',
    tag: '幽默 · 故事类比',
    gradeSuit: '适合大学',
  },
  {
    agent: {
      id: 'student-steady',
      voiceId: 'danya_xuejie', // 淡雅学姐: 贴踏实归纳人设
      name: '小美',
      role: 'student',
      persona: '踏实认真，喜欢归纳整理。常用语："所以总结起来就是……？""这个和上面那个有什么关联？""老师再说一遍，我记一下。"帮大家梳理重点，确认理解无误。',
    },
    emoji: '📝',
    tag: '踏实 · 归纳整理',
    gradeSuit: '通用',
  },
]

export function getStudentById(studentId?: string): AgentConfig {
  const found = PRESET_STUDENTS_LIST.find((s) => s.agent.id === studentId)
  return found?.agent ?? PRESET_STUDENTS_LIST[3]!.agent
}

// 向后兼容
export const PRESET_STUDENT: AgentConfig = PRESET_STUDENTS_LIST[3]!.agent

/* ── 学段适配: 同学是学习者的同龄人 ──
 * 4 个人设原型不变(好奇/思辨/类比/踏实), 按学段切换声音年龄和语言风格。 */

type StageBand = 'primary' | 'middle' | 'high'

const STAGE_STUDENT_VOICES: Record<StageBand, Record<string, string>> = {
  primary: { // 童声组
    'student-zero': 'cute_boy',           // 可爱男童
    'student-thinker': 'clever_boy',      // 聪明男童
    'student-joker': 'lovely_girl',       // 萌萌女童
    'student-steady': 'tianxin_xiaoling', // 甜心小玲
  },
  middle: { // 少年组
    'student-zero': 'chunzhen_xuedi',        // 纯真学弟
    'student-thinker': 'lengdan_xiongzhang', // 冷淡学长
    'student-joker': 'qiaopi_mengmei',       // 俏皮萌妹
    'student-steady': 'danya_xuejie',        // 淡雅学姐
  },
  high: { // 青年组
    'student-zero': 'Chinese (Mandarin)_Unrestrained_Young_Man', // 不羁青年
    'student-thinker': 'Chinese (Mandarin)_Gentle_Youth',        // 温润青年
    'student-joker': 'Chinese (Mandarin)_Southern_Young_Man',    // 南方小哥
    'student-steady': 'Chinese (Mandarin)_Sweet_Lady',           // 甜美女声
  },
}

const STAGE_TONE: Record<StageBand, string> = {
  primary: '说话像小学生：句子短、用词简单、多用"哇/诶/呀"语气词，类比用动画片和玩具。',
  middle: '说话像初中生：口语化、偶尔用流行语，类比用游戏和日常生活。',
  high: '说话像高中生：表达成熟，可以用学科术语，类比可以抽象一些。',
}

function toStageBand(stage?: string): StageBand {
  if (stage === 'primary' || stage === '小学') return 'primary'
  if (stage === 'high' || stage === 'college' || stage === 'adult' || stage === '高中') return 'high'
  return 'middle'
}

/** 按学段取同学名册: 音色换成同龄声线, persona 附加语言风格约束。 */
export function getStudentsForStage(stage?: string): StudentMeta[] {
  const band = toStageBand(stage)
  return PRESET_STUDENTS_LIST.map(s => ({
    ...s,
    agent: {
      ...s.agent,
      voiceId: STAGE_STUDENT_VOICES[band][s.agent.id] ?? s.agent.voiceId ?? 'danya_xuejie',
      persona: `${s.agent.persona}${STAGE_TONE[band]}`,
    },
  }))
}

export const TTS_VOICES: { id: string; label: string }[] = [
  { id: 'longxiaochun_v3', label: '龙小淳（女）' },
  { id: 'longxiaoxia_v3', label: '龙小夏（女）' },
  { id: 'longshuo_v3', label: '龙硕（男）' },
  { id: 'longhua_v3', label: '龙华（男）' },
  { id: 'longyuan_v3', label: '龙远（男）' },
]

/** 当前产品会主动请求的老师与各学段同学音色，供 TTS 边界统一校验。 */
export const BUILT_IN_TTS_VOICE_IDS: readonly string[] = Object.freeze([
  ...new Set([
    ...TTS_VOICES.map(voice => voice.id),
    ...Object.values(STAGE_STUDENT_VOICES).flatMap(voices => Object.values(voices)),
  ]),
])

export const PRESET_TEACHERS: AgentConfig[] = [
  {
    id: 'teacher-longlaoshi',
    name: '龙老师',
    role: 'teacher',
    persona: '严谨务实的男性教师。爱用物理现象和日常生活类比，讲到关键概念时会突然放慢语速、加重语气。不喜欢绕圈子，问题问得很直接。',
    catchphrase: '这里要注意——',
    wrapup: '明白了吗？有没有问题？',
    voiceId: 'longshuo_v3',
  },
  {
    id: 'teacher-xiaomei',
    name: '晓梅老师',
    role: 'teacher',
    persona: '亲切温暖的女性教师。习惯用小故事和身边的人引入概念。语气像朋友聊天，让人放松，不怕犯错。',
    catchphrase: '对对对！就是这个感觉——',
    wrapup: '听起来怎么样？',
    voiceId: 'longxiaochun_v3',
  },
  {
    id: 'teacher-professor',
    name: '陈教授',
    role: 'teacher',
    persona: '大学教授，严谨中藏包袱。开场常带一个冷知识或反直觉结论，先让学生困惑，再徐徐揭晓。严肃中带几分玩味。',
    catchphrase: '有意思，非常有意思——',
    wrapup: '这个想清楚了吗？',
    voiceId: 'longhua_v3',
  },
  {
    id: 'teacher-young',
    name: '小李老师',
    role: 'teacher',
    persona: '年轻活力型教师，Z世代语感。用流行文化、游戏、短视频梗解释概念，节奏快，互动多。让学习没有压迫感。',
    catchphrase: 'OMG这个知识点绝了——',
    wrapup: '你们猜猜看？',
    voiceId: 'longxiaoxia_v3',
  },
]

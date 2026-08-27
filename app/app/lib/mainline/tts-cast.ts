import {
  BUILT_IN_TTS_VOICE_IDS,
  PRESET_TEACHERS,
  getStudentsForStage,
} from '../teachers.js'
import type { CastProfile, GradeBand, MainlineCourse } from './domain.js'

const DEFAULT_TEACHER_VOICE = 'longxiaochun_v3'
const BUILT_IN_VOICE_SET = new Set(BUILT_IN_TTS_VOICE_IDS)
const LEGACY_SEMANTIC_VOICE = /^(?:zhipu|minimax):/i

type StudentArchetypeId = 'student-zero' | 'student-thinker' | 'student-joker' | 'student-steady'

export interface MainlineTtsVoiceInput {
  castId: string | undefined
  role: CastProfile['role'] | undefined
  gradeBand: GradeBand
  configuredVoiceId?: string
}

function stageOf(gradeBand: GradeBand): 'primary' | 'middle' | 'high' {
  if (gradeBand === 'lower-primary' || gradeBand === 'upper-primary') return 'primary'
  if (gradeBand === 'high-school') return 'high'
  return 'middle'
}

function stableIndex(value: string, size: number): number {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % size
}

function studentArchetypeFor(identity: string): StudentArchetypeId | undefined {
  const value = identity.toLowerCase()
  if (/steady|归纳|踏实/.test(value)) return 'student-steady'
  if (/question|think|student-chen|思辨/.test(value)) return 'student-thinker'
  if (/girl|female|student-mei|小米/.test(value)) return 'student-joker'
  if (/student-k|curious|attempt|confused|好奇/.test(value)) return 'student-zero'
  return undefined
}

function stageStudentVoice(gradeBand: GradeBand, identity: string): string {
  const roster = getStudentsForStage(stageOf(gradeBand))
  const archetype = studentArchetypeFor(identity)
  const student = archetype
    ? roster.find(item => item.agent.id === archetype)
    : roster[stableIndex(identity, roster.length)]
  return student?.agent.voiceId ?? 'danya_xuejie'
}

/**
 * 将课程卡司解析为可请求的真实音色。
 * 老版本 zhipu:/minimax: 值只是设计期语义别名，不能直接发给提供商；其余显式配置
 * 原样保留，由 /api/tts 的服务端白名单决定是否允许自定义或克隆音色。
 */
export function resolveMainlineTtsVoiceId(input: MainlineTtsVoiceInput): string {
  const configured = input.configuredVoiceId?.trim()
  if (configured && (BUILT_IN_VOICE_SET.has(configured) || !LEGACY_SEMANTIC_VOICE.test(configured))) {
    return configured
  }

  const teacher = PRESET_TEACHERS.find(item => item.id === input.castId)
  if (teacher?.voiceId) return teacher.voiceId

  if (input.role === 'student' || input.role === 'peer') {
    return stageStudentVoice(
      input.gradeBand,
      `${configured ?? ''} ${input.castId ?? ''}`,
    )
  }

  return DEFAULT_TEACHER_VOICE
}

export function voiceForMainlineCast(course: MainlineCourse, castId: string | undefined): string {
  const cast = course.castProfiles.find(item => item.id === castId)
  const configuredVoice = course.voiceProfiles.find(item => item.castId === castId)?.voiceId
  return resolveMainlineTtsVoiceId({
    castId,
    role: cast?.role,
    gradeBand: course.gradeBand,
    ...(configuredVoice ? { configuredVoiceId: configuredVoice } : {}),
  })
}

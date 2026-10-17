import type { LessonScene, MainlineCourse } from './domain.js'
import { teacherScriptForSpeech } from './speech-text.js'

const HAN_CHARACTERS_PER_SECOND = 4
const LATIN_WORDS_PER_SECOND = 2.5
const NUMERIC_TOKEN_SECONDS = 0.45
const SENTENCE_PAUSE_SECONDS = 0.35
const CLAUSE_PAUSE_SECONDS = 0.16
const EXPLICIT_SCENE_TALK_SHARE = 0.8

const PACE_RATE: Record<LessonScene['voiceCue']['pace'], number> = {
  slow: 0.92,
  medium: 1,
  fast: 1.08,
}

export type SceneDurationSource = 'scene' | 'fragment-estimate' | 'missing'

export interface SceneDurationResolution {
  seconds: number
  source: SceneDurationSource
}

export interface TeacherScriptLoad {
  spokenText: string
  estimatedSpeechSec: number
  sceneDurationSec: number
  speechBudgetSec: number
  reservedStudentSec: number
  durationSource: SceneDurationSource
  overBudget: boolean
}

export interface TeacherScriptPromptBudget {
  estimatedSpeechBudgetSec: number
  suggestedMinCharacters: number
  suggestedMaxCharacters: number
}

/**
 * 新课直接使用逐幕时长；存量课缺字段时沿用备课简报的片段均摊语义，
 * 只用于提醒，不在读取时补写数据库。
 */
export function resolveSceneDuration(course: MainlineCourse, scene: LessonScene): SceneDurationResolution {
  if (scene.durationTargetSec !== undefined) {
    return Number.isFinite(scene.durationTargetSec) && scene.durationTargetSec > 0
      ? { seconds: scene.durationTargetSec, source: 'scene' }
      : { seconds: 0, source: 'missing' }
  }

  const fragment = course.learningFragments.find(item => item.sceneIds.includes(scene.id))
  if (!fragment) return { seconds: 0, source: 'missing' }

  const fragmentScenes = fragment.sceneIds
    .map(id => course.scenes.find(candidate => candidate.id === id))
    .filter((candidate): candidate is LessonScene => Boolean(candidate))
  const explicitDuration = fragmentScenes.reduce((sum, candidate) => {
    const duration = candidate.durationTargetSec
    return sum + (duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : 0)
  }, 0)
  const missingCount = fragmentScenes.filter(candidate => candidate.durationTargetSec === undefined).length
  if (missingCount === 0) return { seconds: 0, source: 'missing' }

  const estimate = Math.max(fragment.durationTargetSec - explicitDuration, 0) / missingCount
  return estimate > 0
    ? { seconds: estimate, source: 'fragment-estimate' }
    : { seconds: 0, source: 'missing' }
}

/**
 * 估算的是口语化后真正会送入 TTS 的文本，而不是含 LaTeX 控制符的源码长度。
 * 中文、英文词、数字和标点分别计时，并按逐幕语速修正。
 */
export function estimateTeacherScriptSeconds(
  teacherScript: string,
  pace: LessonScene['voiceCue']['pace'] = 'medium',
): number {
  const spokenText = teacherScriptForSpeech(teacherScript)
  const hanCount = spokenText.match(/[\p{Script=Han}]/gu)?.length ?? 0
  const latinWordCount = spokenText.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length ?? 0
  const numericTokenCount = spokenText.match(/\d+(?:\.\d+)?/g)?.length ?? 0
  const sentencePauseCount = spokenText.match(/[。！？!?]/g)?.length ?? 0
  const clausePauseCount = spokenText.match(/[，、；;：:]/g)?.length ?? 0

  const residue = spokenText
    .replace(/[\p{Script=Han}]/gu, '')
    .replace(/[A-Za-z]+(?:['-][A-Za-z]+)*/g, '')
    .replace(/\d+(?:\.\d+)?/g, '')
    .replace(/[\s，、；;：:。！？!?.,()[\]{}「」『』《》“”‘’/\\|+*=<>-]/g, '')
  const residualVisibleCount = Array.from(residue).length

  const baseSeconds = hanCount / HAN_CHARACTERS_PER_SECOND
    + latinWordCount / LATIN_WORDS_PER_SECOND
    + numericTokenCount * NUMERIC_TOKEN_SECONDS
    + residualVisibleCount / HAN_CHARACTERS_PER_SECOND
    + sentencePauseCount * SENTENCE_PAUSE_SECONDS
    + clausePauseCount * CLAUSE_PAUSE_SECONDS

  return baseSeconds / PACE_RATE[pace]
}

/**
 * 新课有明确逐页时长时，最多把 80% 留给讲解，至少保留 20% 给观察、书写或回应。
 * 存量课只有片段均摊值，精度不足，因此只拦“讲稿本身已超过整页”的确定问题。
 */
export function teacherScriptLoadFor(
  course: MainlineCourse,
  scene: LessonScene,
  teacherScript = scene.teacherScript,
): TeacherScriptLoad {
  const duration = resolveSceneDuration(course, scene)
  const estimatedSpeechSec = estimateTeacherScriptSeconds(teacherScript, scene.voiceCue.pace)
  const speechBudgetSec = duration.source === 'scene'
    ? duration.seconds * EXPLICIT_SCENE_TALK_SHARE
    : duration.seconds

  return {
    spokenText: teacherScriptForSpeech(teacherScript),
    estimatedSpeechSec,
    sceneDurationSec: duration.seconds,
    speechBudgetSec,
    reservedStudentSec: Math.max(duration.seconds - speechBudgetSec, 0),
    durationSource: duration.source,
    overBudget: duration.source !== 'missing' && estimatedSpeechSec > speechBudgetSec,
  }
}

export function teacherScriptLoadProblems(
  course: MainlineCourse,
  scene: LessonScene,
  teacherScript = scene.teacherScript,
): string[] {
  const load = teacherScriptLoadFor(course, scene, teacherScript)
  if (!load.overBudget) return []

  const speechSeconds = Math.ceil(load.estimatedSpeechSec)
  const budgetSeconds = Math.floor(load.speechBudgetSec)
  if (load.durationSource === 'scene') {
    return [
      `teacherScript 预计口播 ${speechSeconds} 秒，超过本页可用讲解时间 ${budgetSeconds} 秒；本页 ${Math.round(load.sceneDurationSec)} 秒至少要给学生保留 ${Math.ceil(load.reservedStudentSec)} 秒观察、书写或回应。`,
    ]
  }
  return [
    `teacherScript 预计口播 ${speechSeconds} 秒，超过按片段均摊估算的整页 ${Math.round(load.sceneDurationSec)} 秒；即使不留学生回应也放不下。`,
  ]
}

/** 给生成提示使用的近似字数范围；最终验收仍以真实口语化秒数为准。 */
export function teacherScriptPromptBudget(course: MainlineCourse, scene: LessonScene): TeacherScriptPromptBudget {
  const load = teacherScriptLoadFor(course, scene, '')
  const budgetSec = load.durationSource === 'missing' ? 45 : load.speechBudgetSec
  // 2026-08-25 用户裁决「老师讲稿过于简化」:上限 180→260,让讲授页与揭晓页讲稿能展开讲透+分层跟进
  const suggestedMaxCharacters = Math.max(60, Math.min(260, Math.floor(budgetSec * 3.6)))
  return {
    estimatedSpeechBudgetSec: budgetSec,
    suggestedMinCharacters: Math.min(60, suggestedMaxCharacters),
    suggestedMaxCharacters,
  }
}

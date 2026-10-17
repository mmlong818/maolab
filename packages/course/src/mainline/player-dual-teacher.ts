import type { LessonScene } from './domain.js'
import { sceneExecutor } from './domain.js'

/**
 * v5 M2 WP7:播放器「双师模式」纯逻辑层(教师上课模式,设计草案 §3)。
 * 抽成纯函数只为可测——渲染层(StageCanvas)只消费结果,不重复判断规则。
 */

/** 开关按钮的可见性:课程内只要有一幕不是纯 AI 演出(teacher/co)就显示开关。 */
export function courseHasDualTeacherOption(scenes: Pick<LessonScene, 'executor'>[]): boolean {
  return scenes.some(scene => sceneExecutor(scene) !== 'ai')
}

export interface DualTeacherSceneBehavior {
  /** 是否切到大板书层(隐藏立绘/对白框,显示 boardText 满幅 + 教师提词器)。 */
  showBigBoard: boolean
  /** 是否静默 TTS(教师亲自开口,AI 不代讲)。 */
  silenceTts: boolean
}

/**
 * 双师模式关闭时行为完全不变——所有幕都走原有 AI 演出流程。
 * 开启后:teacher 幕整体让位给真人教师;ai 幕不变;co 幕仍由 AI 正常演出到底
 * (「下一幕」本就是手动推进,播完自然停下等教师推进,不需要额外的打断逻辑)。
 */
export function dualTeacherSceneBehavior(
  scene: Pick<LessonScene, 'executor'>,
  dualModeOn: boolean,
): DualTeacherSceneBehavior {
  if (!dualModeOn) return { showBigBoard: false, silenceTts: false }
  const isTeacherLed = sceneExecutor(scene) === 'teacher'
  return { showBigBoard: isTeacherLed, silenceTts: isTeacherLed }
}

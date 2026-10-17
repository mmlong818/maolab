import type { VoiceCue } from './domain.js'

/** 模型输出的理想单页讲稿长度；确定性教学提示仍可在此后补入。 */
export const TEACHER_SCRIPT_TARGET_MAX = 180

/** 单页最终口播硬上限；超过后会在备课质检中提示拆分教学动作。 */
export const TEACHER_SCRIPT_HARD_MAX = 220

/**
 * 课堂语音按“本次课堂会话”授权，而不是按浏览器偏好自动恢复。
 * TTS 会产生外部请求与费用，因此每次进入课堂都必须先由教师显式启动。
 */
export type VoiceSessionState = 'idle' | 'active'

export const INITIAL_VOICE_SESSION_STATE: VoiceSessionState = 'idle'

export function nextVoiceSessionState(current: VoiceSessionState): VoiceSessionState {
  return current === 'active' ? 'idle' : 'active'
}

export function voiceSessionAllowsSynthesis(state: VoiceSessionState): boolean {
  return state === 'active'
}

const SCENE_PACE_RATE: Record<VoiceCue['pace'], number> = {
  slow: 0.92,
  medium: 1,
  fast: 1.08,
}

const SCENE_PACE_LABEL: Record<VoiceCue['pace'], string> = {
  slow: '慢速',
  medium: '常速',
  fast: '快速',
}

/** 把课程节奏元数据转成克制的浏览器播放倍率，不改变语音供应商与音色。 */
export function scenePlaybackRate(pace: VoiceCue['pace']): number {
  return SCENE_PACE_RATE[pace]
}

/** 给备课与课堂控制条使用的人类可读语速，不暴露浏览器倍率。 */
export function voicePaceLabel(pace: VoiceCue['pace']): string {
  return SCENE_PACE_LABEL[pace]
}

/** 从自然语言停顿规则提取控制条短标签；完整规则仍由教师展开查看。 */
export function voicePauseTimingLabel(pauseRule: string): string {
  const timings = Array.from(pauseRule.matchAll(/(\d{2,5})\s*(?:ms|毫秒)/gi), match => `${match[1]}ms`)
  const uniqueTimings = [...new Set(timings)]
  if (uniqueTimings.length === 0) return '停顿提示'
  if (uniqueTimings.length <= 2) return `停顿 ${uniqueTimings.join(' / ')}`
  return '多段停顿'
}

/** 用户全局速度与本幕教学速度相乘，并限制在浏览器可理解的范围。 */
export function effectivePlaybackRate(userRate: number, sceneRate: number): number {
  const safeUserRate = Number.isFinite(userRate) && userRate > 0 ? userRate : 1
  const safeSceneRate = Number.isFinite(sceneRate) && sceneRate > 0 ? sceneRate : 1
  return Math.min(2, Math.max(0.5, safeUserRate * safeSceneRate))
}

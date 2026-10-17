/**
 * Feature flags — Sprint 0 引入
 *
 * MAOLAB_V2: 当为 '1' 时，新创建的课程走 v2 管线（Course + Plan + MethodPlan + Rundown + Atoms）
 *            读取时旧课件仍走旧表，由 v2 状态字段区分
 */

export function isV2Enabled(): boolean {
  if (typeof process === 'undefined') return false
  const v = process.env?.MAOLAB_V2
  return v === '1' || v === 'true'
}

export const FEATURE_FLAGS = {
  v2Pipeline: 'MAOLAB_V2',
} as const

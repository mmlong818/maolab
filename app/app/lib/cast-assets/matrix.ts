import type { CastSchoolStage, CastSeason } from '@maolab/shared-types'

export type { CastSchoolStage, CastSeason } from '@maolab/shared-types'

/**
 * 立绘资产矩阵规格 · 造图脚本与矩阵完整性测试共用
 *
 * 矩阵目录：public/generated-images/cast/base|subject。
 * 主线卡司不再做运行时风格匹配（旧 lib/v2/ip-style-library 已删），
 * 只由 lib/mainline/generation/cast-preset.ts 显式消费矩阵切片；
 * 这里仅保留"资产该有哪些"的规格，供 scripts/generate-cast-asset-matrix.ts
 * 造图与 __tests__/cast-asset-matrix.test.ts 做实物完整性闸门。
 */

export type IpExpression = 'neutral' | 'happy' | 'thinking' | 'surprised'

export const CAST_SCHOOL_STAGES: CastSchoolStage[] = ['primary', 'middle', 'high']
export const CAST_SEASONS: CastSeason[] = ['summer', 'autumn']
export const CAST_EXPRESSIONS: IpExpression[] = ['neutral', 'happy', 'thinking', 'surprised']

/** 基础卡司 8 位角色 id（4 老师 + 4 同学），与 cast/base 矩阵文件名一致。 */
export const CAST_CHARACTER_IDS = [
  'teacher-longlaoshi',
  'teacher-xiaomei',
  'teacher-professor',
  'teacher-young',
  'student-zero',
  'student-thinker',
  'student-joker',
  'student-steady',
]

/** 已启用学科立绘目录（cast/subject/<id>）。 */
export const CAST_SUBJECT_IDS = [
  'math',
  'physics',
  'biology',
  'geography',
  'chinese',
  'english',
  'chemistry',
  'history',
]

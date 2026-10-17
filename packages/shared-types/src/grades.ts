export const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一', '高二', '高三'] as const
export type GradeLevel = (typeof GRADES)[number]
export const GENDERS = ['male', 'female', 'unspecified'] as const
export type LearnerGender = (typeof GENDERS)[number]

export function isGrade(value: unknown): value is GradeLevel {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value)
}

/** 提示词用的学习语言难度文案，按年级粗分年龄段。 */
export function ageBandFor(grade: GradeLevel): string {
  const index = GRADES.indexOf(grade)
  const from = 6 + index
  return `约 ${from}–${from + 1} 岁的学习语言难度`
}

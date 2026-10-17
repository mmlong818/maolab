/**
 * mastery store（3a 改写自 maolab 同名文件）。
 *
 * 原件把练习作答与掌握度写在本机 SQLite（单用户档案、排练种子）。新架构里老师看不到任何学生学情
 * （spec 1.2 不做老师看学生学情；9.3 排练种子不迁），读写函数全部删除，只保留迁入代码仍引用的类型。
 */

export interface KpMistakeEvidence {
  kpId: string
  /** 当次题目快照(服务端确认版本),供复习课生成变式时对照,不得原题复用。 */
  task: string
  /** 学生揭晓前原答。 */
  attemptText: string
  /** 揭晓后的错因订正。 */
  reflectionText: string
  /** 揭晓前把握度:high+incorrect=高把握误答,复习课优先修正其错误规则。 */
  confidence: string
  submittedAt: number
}

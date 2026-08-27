import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('课程结束界面接线', () => {
  it('最后一页用证据契约替换无意义的禁用下一页按钮', () => {
    const stageCanvas = readFileSync(new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url), 'utf8')

    expect(stageCanvas).toContain('classroomLessonCanComplete(')
    expect(stageCanvas).toContain('safeSceneIndex === presentationPages.length - 1')
    expect(stageCanvas).toContain('<LessonCompletion')
    expect(stageCanvas).toContain("onComplete={() => setLessonCompleted(true)}")
    expect(stageCanvas).toContain("!openingReviewComplete")
  })

  it('完成面板明确区分过程闭环与掌握度判断', () => {
    const completion = readFileSync(new URL('../../../components/mainline/LessonCompletion.tsx', import.meta.url), 'utf8')

    expect(completion).toContain('先完成收束')
    expect(completion).toContain('结束本课')
    expect(completion).toContain('本课已完成')
    expect(completion).toContain('返回课程库')
    expect(completion).toContain('不替代教师评价或掌握度判定')
    expect(completion).toContain('aria-modal="true"')
  })

  it('刷新恢复的结束确认必须结合服务端练习证据重新核验', () => {
    const hook = readFileSync(new URL('../../../components/mainline/useClassroomSessionProgress.ts', import.meta.url), 'utf8')

    expect(hook).toContain("restored?.lessonCompleted === true && classroomLessonCanComplete(")
    expect(hook).toContain('saved,')
    expect(hook).toContain('restoredRecapTransfer,')
    expect(hook).toContain('recapTransferAttempts,')
    expect(hook).toContain('...(lessonCompleted ? { lessonCompleted: true as const } : {})')
  })

  it('具体迁移题在收束页留下会话证据，缺失时不能结束本课', () => {
    const stageCanvas = readFileSync(new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url), 'utf8')
    const checkIn = readFileSync(new URL('../../../components/mainline/RecapTransferCheckIn.tsx', import.meta.url), 'utf8')
    const completion = readFileSync(new URL('../../../components/mainline/LessonCompletion.tsx', import.meta.url), 'utf8')

    expect(stageCanvas).toContain('<RecapTransferCheckIn')
    expect(stageCanvas).toContain('请先完成收束页迁移挑战')
    expect(stageCanvas).toContain('recapTransferAttempts,')
    expect(checkIn).toContain('写出你的判断或结果，以及依据、条件或关键步骤')
    expect(checkIn).toContain('完成初答后对照成功标准')
    expect(checkIn).toContain('这不是标准答案')
    expect(checkIn).toContain('原答可保留')
    expect(checkIn).toContain('原答需修正')
    expect(checkIn).toContain('readOnly={reviewRevealed}')
    expect(checkIn).toContain('paperReviewComplete')
    expect(checkIn).toContain('仅保存于本次课堂会话')
    expect(checkIn).toContain('系统不自动判定掌握')
    expect(completion).toContain('收束迁移题已完成')
  })
})

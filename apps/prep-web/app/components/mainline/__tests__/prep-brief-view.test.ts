import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('备课简报学习证据', () => {
  it('教师能核对题目、原答、反馈、订正、成功标准和校准结果', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/mainline/workbench/PrepBriefView.tsx'),
      'utf8',
    )

    expect(source).toContain('kp.mastery.latestEvidence && <MasteryEvidenceDetails')
    expect(source).toContain('查看最近一次作答证据')
    expect(source).toContain('作答时题目')
    expect(source).toContain('{evidence.practiceSnapshot.task}')
    expect(source).toContain('揭晓前原答')
    expect(source).toContain('{evidence.attemptText}')
    expect(source).toContain('反馈内容')
    expect(source).toContain('{evidence.practiceSnapshot.feedback}')
    expect(source).toContain('反馈后依据或订正')
    expect(source).toContain('{evidence.reflectionText}')
    expect(source).toContain('{criterion.successSignal}')
    expect(source).toContain('揭晓前把握度')
    expect(source).toContain('校准：')
  })

  it('把课堂应变展示为可定位的证据分支，缺练习时明确停用', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/mainline/workbench/PrepBriefView.tsx'),
      'utf8',
    )

    expect(source).toContain('课堂应变 · {plan.moves.length} 条分支')
    expect(source).toContain('判断标准：{plan.successSignal}')
    expect(source).toContain('定位处理页 →')
    expect(source).toContain('返回独立练习 →')
    expect(source).toContain('课堂应变暂不可用')
    expect(source).toContain('{plan.missingReason}')
  })
})

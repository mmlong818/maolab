import { describe, expect, it, vi } from 'vitest'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import {
  configuredFactRepairMaxAttempts,
  mergeFactAuditAfterRepair,
  repairFactIssues,
  repairFactIssuesUntilStable,
  type FactRepairCall,
} from '../fact-repair.js'
import type { FillLLMCall } from '../fill-scenes.js'
import type { QualityIssue } from '../../quality-gates.js'
import type { FactAuditResult } from '../fact-audit.js'

function courseFixture() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'history' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-history', canonicalName: '张骞出使西域' }],
    gradeBand: 'middle-school',
    subject: 'history',
    preset,
  })
}

function issueFor(sceneId: string, severity: QualityIssue['severity'] = 'warning'): QualityIssue {
  return {
    id: `fact-${sceneId}`,
    gate: 'pedagogy',
    severity,
    targetType: 'scene',
    targetId: sceneId,
    message: '断言把后续设官写成张骞直接促成',
    impact: '事件相隔多年，直接因果会误导学生',
    fix: '改为为后来设官奠定基础',
    autoFixable: false,
  }
}

function factResult(
  issues: QualityIssue[],
  auditedSceneIds: string[],
  unverifiedSceneIds: string[] = [],
): FactAuditResult {
  return {
    issues,
    fatalCount: issues.filter(issue => issue.severity === 'blocking').length,
    auditedSceneCount: auditedSceneIds.length,
    auditedSceneIds,
    requiredSceneIds: [...new Set([...auditedSceneIds, ...unverifiedSceneIds])],
    unverifiedSceneIds,
    consistencyAuditedSceneIds: auditedSceneIds,
    consistencyConflictCount: issues.filter(issue => issue.id.includes(':consistency-')).length,
  }
}

const repairedOutput = {
  contentSlots: { statement: '张骞出使加强了汉朝与西域的联系', example: '为后来经略西域奠定基础' },
  visualFocus: '出使影响的时间边界',
  narrationAnchor: '奠定基础',
  boardText: ['加强汉朝与西域联系', '为后续经略奠定基础'],
  teacherScript: '张骞出使加强了汉朝与西域之间的联系，但不能把数十年后的制度变化说成由一次出使直接促成。更准确的说法是，两次出使带回信息并推动往来，为后来持续经略西域「奠定基础」。请用“直接结果”和“后续影响”两个层次重新表述。',
  studentAction: '区分出使的直接结果与后续影响',
  evidenceOnScreen: ['直接结果', '后续影响', '奠定基础'],
}

describe('repairFactIssues', () => {
  it('把同一幕的事实问题合并进一次重写，并保留场景结构', async () => {
    const course = courseFixture()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const prompts: string[] = []
    const llm: FillLLMCall = async ({ user }) => {
      prompts.push(user)
      return repairedOutput
    }

    const result = await repairFactIssues(course, [
      issueFor(target.id),
      { ...issueFor(target.id), id: 'fact-second', message: '断言遗漏时间差' },
    ], { llm })

    expect(result.attemptedSceneIds).toEqual([target.id])
    expect(result.repairedSceneIds).toEqual([target.id])
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('事实核查回修要求')
    expect(prompts[0]).toContain('断言把后续设官写成张骞直接促成')
    expect(prompts[0]).toContain('断言遗漏时间差')
    const repaired = result.course.scenes.find(scene => scene.id === target.id)!
    expect(repaired.sceneType).toBe(target.sceneType)
    expect(repaired.visualLayout).toBe(target.visualLayout)
    expect(repaired.contentSlots.statement).toContain('加强了汉朝与西域的联系')
  })

  it('默认不覆盖教师手改页', async () => {
    const course = courseFixture()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    target.editedByTeacher = true
    const result = await repairFactIssues(course, [issueFor(target.id)], {
      llm: async () => repairedOutput,
    })

    expect(result.attemptedSceneIds).toEqual([])
    expect(result.repairedSceneIds).toEqual([])
    expect(result.skipped).toEqual([{ sceneId: target.id, reason: 'teacher-edit-protected' }])
    expect(result.course.scenes.find(scene => scene.id === target.id)).toBe(target)
  })

  it('跨幕冲突不自动猜测重写哪一页，保留给教材依据或教师确认', async () => {
    const course = courseFixture()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const result = await repairFactIssues(course, [{
      ...issueFor(target.id, 'blocking'),
      id: `pedagogy:scene:${target.id}:consistency-1`,
      message: '跨幕一致性核查 FATAL:两页答案冲突',
    }], { llm: async () => repairedOutput })

    expect(result.attemptedSceneIds).toEqual([])
    expect(result.repairedSceneIds).toEqual([])
  })

  it('定向复核只替换已修幕的问题，保留其他幕结论', () => {
    const firstScene = 'scene-a'
    const secondScene = 'scene-b'
    const original = {
      issues: [issueFor(firstScene), issueFor(secondScene, 'blocking')],
      fatalCount: 1,
      auditedSceneCount: 6,
      auditedSceneIds: ['scene-a', 'scene-b', 'scene-c', 'scene-d', 'scene-e', 'scene-f'],
      requiredSceneIds: ['scene-a', 'scene-b', 'scene-c', 'scene-d', 'scene-e', 'scene-f'],
      unverifiedSceneIds: [],
      consistencyAuditedSceneIds: ['scene-a', 'scene-b', 'scene-c', 'scene-d', 'scene-e', 'scene-f'],
      consistencyConflictCount: 0,
    }
    const rechecked = {
      issues: [],
      fatalCount: 0,
      auditedSceneCount: 1,
      auditedSceneIds: [firstScene],
      requiredSceneIds: [firstScene],
      unverifiedSceneIds: [],
      consistencyAuditedSceneIds: [firstScene],
      consistencyConflictCount: 0,
    }
    const merged = mergeFactAuditAfterRepair(original, rechecked, [firstScene])

    expect(merged.issues.map(issue => issue.targetId)).toEqual([secondScene])
    expect(merged.fatalCount).toBe(1)
    expect(merged.auditedSceneCount).toBe(6)
    expect(merged.auditedSceneIds).toEqual(['scene-b', 'scene-c', 'scene-d', 'scene-e', 'scene-f', 'scene-a'])
  })

  it('重写较早页面后会替换与其关联的跨页旧冲突，不受主要 targetId 在后一页影响', () => {
    const conflict = {
      ...issueFor('scene-b', 'blocking'),
      id: 'pedagogy:scene:scene-b:consistency-1',
      relatedTargetIds: ['scene-a', 'scene-b'],
      message: '跨幕一致性核查 FATAL:第 1 页与第 2 页答案冲突',
    }
    const original = factResult([conflict], ['scene-a', 'scene-b'])
    const rechecked = factResult([], ['scene-a'])

    const merged = mergeFactAuditAfterRepair(original, rechecked, ['scene-a'])

    expect(merged.issues).toEqual([])
    expect(merged.fatalCount).toBe(0)
  })

  it('定向复核失败时保留原阻断，不把“未验证”冒充修正通过', () => {
    const sceneId = 'scene-a'
    const unverifiedIssue = {
      ...issueFor(sceneId, 'info'),
      id: 'unverified',
      message: '事实核查未完成(核查服务失败),本幕断言未经验证。',
    }
    const original = factResult([issueFor(sceneId, 'blocking'), unverifiedIssue], [sceneId])
    const unverified = factResult([unverifiedIssue], [], [sceneId])

    const merged = mergeFactAuditAfterRepair(original, unverified, [sceneId])

    expect(merged.fatalCount).toBe(1)
    expect(merged.issues.map(issue => issue.id)).toEqual([`fact-${sceneId}`, 'unverified'])
    expect(merged.auditedSceneIds).toEqual([])
    expect(merged.unverifiedSceneIds).toEqual([sceneId])
  })
})

describe('repairFactIssuesUntilStable', () => {
  it('首轮仍有 fatal 时继续第二轮，复核通过后停止并留下两轮轨迹', async () => {
    const course = courseFixture()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const blocking = issueFor(target.id, 'blocking')
    const repair: FactRepairCall = vi.fn(async current => ({
      course: current,
      attemptedSceneIds: [target.id],
      repairedSceneIds: [target.id],
      skipped: [],
      failed: [],
    }))
    const audit = vi
      .fn()
      .mockResolvedValueOnce(factResult([blocking], [target.id]))
      .mockResolvedValueOnce(factResult([], [target.id]))

    const result = await repairFactIssuesUntilStable(
      course,
      factResult([blocking], [target.id]),
      { maxAttempts: 2, repair, audit },
    )

    expect(repair).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(2)
    expect(result.fact.fatalCount).toBe(0)
    expect(result.trace.stoppedReason).toBe('no-blocking-issues')
    expect(result.trace.attempts).toHaveLength(2)
    expect(result.trace.attempts.map(attempt => attempt.scope)).toEqual([
      'blocking-and-warning',
      'blocking-only',
    ])
  })

  it('fatal 持续存在时严格停在上限，课程仍保留阻断与可查轨迹', async () => {
    const course = courseFixture()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const blocking = issueFor(target.id, 'blocking')
    const repair: FactRepairCall = vi.fn(async current => ({
      course: current,
      attemptedSceneIds: [target.id],
      repairedSceneIds: [target.id],
      skipped: [],
      failed: [],
    }))
    const audit = vi.fn(async () => factResult([blocking], [target.id]))

    const result = await repairFactIssuesUntilStable(
      course,
      factResult([blocking], [target.id]),
      { maxAttempts: 2, repair, audit },
    )

    expect(repair).toHaveBeenCalledTimes(2)
    expect(audit).toHaveBeenCalledTimes(2)
    expect(result.fact.fatalCount).toBe(1)
    expect(result.trace).toMatchObject({ maxAttempts: 2, stoppedReason: 'max-attempts' })
    expect(result.trace.attempts.map(attempt => attempt.remainingBlockingCount)).toEqual([1, 1])
  })

  it('教师手改页被保护时不覆盖，立即停止并记录跳过原因', async () => {
    const course = courseFixture()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    target.editedByTeacher = true
    const blocking = issueFor(target.id, 'blocking')
    const audit = vi.fn()

    const result = await repairFactIssuesUntilStable(
      course,
      factResult([blocking], [target.id]),
      { maxAttempts: 2, audit },
    )

    expect(audit).not.toHaveBeenCalled()
    expect(result.fact.fatalCount).toBe(1)
    expect(result.trace.stoppedReason).toBe('no-progress')
    expect(result.trace.attempts[0]!.skipped).toEqual([
      { sceneId: target.id, reason: 'teacher-edit-protected' },
    ])
  })

  it('配置异常时回落默认值，并把成本上限锁在三轮', () => {
    expect(configuredFactRepairMaxAttempts(undefined)).toBe(2)
    expect(configuredFactRepairMaxAttempts('not-a-number')).toBe(2)
    expect(configuredFactRepairMaxAttempts('-5')).toBe(0)
    expect(configuredFactRepairMaxAttempts('99')).toBe(3)
  })
})

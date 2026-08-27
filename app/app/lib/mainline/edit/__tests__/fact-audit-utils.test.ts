import { describe, expect, it } from 'vitest'
import type { FactAuditRecord } from '../../domain.js'
import {
  clearSceneFromFactAudit,
  invalidateSceneFactAudit,
  mergeSceneIntoFactAudit,
} from '../fact-audit-utils.js'

const record = (over: Partial<FactAuditRecord> = {}): FactAuditRecord => ({
  auditedAt: '2026-07-20T00:00:00.000Z',
  auditedSceneIds: ['s-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7'],
  requiredSceneIds: ['s-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7'],
  unverifiedSceneIds: [],
  consistencyAuditedSceneIds: ['s-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7'],
  pendingSceneIds: [],
  auditedSceneCount: 7,
  fatalCount: 0,
  issues: [],
  ...over,
})

describe('mergeSceneIntoFactAudit', () => {
  it('同幕反复重生成时按精确集合计数，不会虚增', () => {
    let audit: FactAuditRecord | undefined = record()
    for (let index = 0; index < 3; index++) {
      audit = mergeSceneIntoFactAudit(audit, 's-3', [], true, 7, true)
    }
    expect(audit.auditedSceneCount).toBe(7)
    expect(audit.auditedSceneIds).toHaveLength(7)
  })

  it('未核查过的幕正常加入精确覆盖集合', () => {
    const audit = mergeSceneIntoFactAudit(record({
      auditedSceneCount: 3,
      auditedSceneIds: ['s-1', 's-2', 's-3'],
    }), 's-4', [], true, 7, true)
    expect(audit.auditedSceneCount).toBe(4)
    expect(audit.auditedSceneIds).toContain('s-4')
  })

  it('未真实完成核查时保留 pending，且不冒充已核查页', () => {
    const audit = mergeSceneIntoFactAudit(record({
      auditedSceneCount: 2,
      auditedSceneIds: ['s-1', 's-2'],
      pendingSceneIds: ['s-4'],
    }), 's-4', [], false, 7, false)
    expect(audit.pendingSceneIds).toEqual(['s-4'])
    expect(audit.auditedSceneCount).toBe(2)
    expect(audit.auditedSceneIds).not.toContain('s-4')
  })

  it('单页重试成功后同时清除 pending 与未验证状态', () => {
    const audit = mergeSceneIntoFactAudit(record({
      auditedSceneIds: ['s-1', 's-2'],
      auditedSceneCount: 2,
      pendingSceneIds: ['s-4'],
      unverifiedSceneIds: ['s-4'],
    }), 's-4', [], true, 7, true)

    expect(audit.pendingSceneIds).toEqual([])
    expect(audit.unverifiedSceneIds).toEqual([])
    expect(audit.auditedSceneIds).toContain('s-4')
  })

  it('单页复核不会抹掉整课生成时的自动修正轨迹', () => {
    const repairTrace: NonNullable<FactAuditRecord['repairTrace']> = {
      maxAttempts: 2,
      stoppedReason: 'max-attempts',
      attempts: [],
    }
    const audit = mergeSceneIntoFactAudit(record({ repairTrace }), 's-3', [], true, 7, true)

    expect(audit.repairTrace).toBe(repairTrace)
  })

  it('单页核查失败时保留该页旧阻断，不能用“未验证”覆盖已知问题', () => {
    const oldBlocking = {
      id: 'pedagogy:scene:s-3:fact-1',
      severity: 'blocking' as const,
      targetId: 's-3',
      message: '断言核查 FATAL:旧问题',
      impact: '已知事实错误',
      fix: '按教材修正',
    }
    const unverified = {
      id: 'pedagogy:scene:s-3:fact-2',
      severity: 'info' as const,
      targetId: 's-3',
      message: '事实核查未完成',
      impact: '本幕未验证',
      fix: '重试',
    }
    const audit = mergeSceneIntoFactAudit(record({ fatalCount: 1, issues: [oldBlocking] }), 's-3', [unverified], false, 7, true)

    expect(audit.pendingSceneIds).toEqual(['s-3'])
    expect(audit.unverifiedSceneIds).toEqual(['s-3'])
    expect(audit.fatalCount).toBe(1)
    expect(audit.issues).toEqual(expect.arrayContaining([oldBlocking, unverified]))
  })

  it('复核冲突的较早页面时会替换关联的跨页旧结论，而不是只按主 targetId 留下陈旧阻断', () => {
    const oldConflict = {
      id: 'pedagogy:scene:s-3:consistency-1',
      severity: 'blocking' as const,
      targetId: 's-3',
      relatedTargetIds: ['s-2', 's-3'],
      message: '跨幕一致性核查 FATAL:第 2 页与第 3 页答案冲突',
      impact: '同题出现两个答案',
      fix: '统一答案',
    }

    const audit = mergeSceneIntoFactAudit(
      record({ fatalCount: 1, issues: [oldConflict] }),
      's-2',
      [],
      true,
      7,
      true,
    )

    expect(audit.issues).toEqual([])
    expect(audit.fatalCount).toBe(0)
  })
})

describe('invalidateSceneFactAudit', () => {
  it('事实内容手改后撤回旧覆盖和旧结论，并进入待核查', () => {
    const audit = invalidateSceneFactAudit(record({
      fatalCount: 1,
      issues: [{ id: 'a', severity: 'blocking', targetId: 's-3', message: '', impact: '', fix: '' }],
    }), 's-3')

    expect(audit.auditedSceneIds).not.toContain('s-3')
    expect(audit.requiredSceneIds).toContain('s-3')
    expect(audit.unverifiedSceneIds).not.toContain('s-3')
    expect(audit.consistencyAuditedSceneIds).not.toContain('s-3')
    expect(audit.auditedSceneCount).toBe(6)
    expect(audit.pendingSceneIds).toEqual(['s-3'])
    expect(audit.issues).toEqual([])
    expect(audit.fatalCount).toBe(0)
  })

  it('手改跨页冲突任一关联页都会撤回旧冲突，等待用新内容重新比较', () => {
    const audit = invalidateSceneFactAudit(record({
      fatalCount: 1,
      issues: [{
        id: 'pedagogy:scene:s-3:consistency-1',
        severity: 'blocking',
        targetId: 's-3',
        relatedTargetIds: ['s-2', 's-3'],
        message: '跨幕一致性核查 FATAL:第 2 页与第 3 页答案冲突',
        impact: '同题出现两个答案',
        fix: '统一答案',
      }],
    }), 's-2')

    expect(audit.issues).toEqual([])
    expect(audit.fatalCount).toBe(0)
    expect(audit.pendingSceneIds).toEqual(['s-2'])
  })

  it('没有旧核查记录时也建立待核查，不能让手工填页绕过核查', () => {
    const audit = invalidateSceneFactAudit(undefined, 's-new')
    expect(audit.auditedAt).toBeUndefined()
    expect(audit.auditedSceneCount).toBe(0)
    expect(audit.requiredSceneIds).toEqual(['s-new'])
    expect(audit.unverifiedSceneIds).toEqual([])
    expect(audit.pendingSceneIds).toEqual(['s-new'])
  })
})

describe('clearSceneFromFactAudit', () => {
  it('删除页时同时清除覆盖、pending 和旧 issue', () => {
    const audit = clearSceneFromFactAudit(record({
      pendingSceneIds: ['s-2'],
      fatalCount: 1,
      issues: [
        { id: 'a', severity: 'blocking', targetId: 's-1', message: '', impact: '', fix: '' },
        { id: 'b', severity: 'warning', targetId: 's-2', message: '', impact: '', fix: '' },
      ],
    }), 's-2')

    expect(audit?.auditedSceneIds).not.toContain('s-2')
    expect(audit?.requiredSceneIds).not.toContain('s-2')
    expect(audit?.unverifiedSceneIds).not.toContain('s-2')
    expect(audit?.consistencyAuditedSceneIds).not.toContain('s-2')
    expect(audit?.auditedSceneCount).toBe(6)
    expect(audit?.pendingSceneIds).toEqual([])
    expect(audit?.issues.map(issue => issue.id)).toEqual(['a'])
    expect(audit?.fatalCount).toBe(1)
  })
})

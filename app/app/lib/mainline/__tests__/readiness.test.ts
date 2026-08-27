import { describe, expect, it } from 'vitest'
import type { MainlineCourse, QualityIssue } from '../index.js'
import { courseReleaseReadinessFromIssues, courseReleaseReason } from '../readiness.js'

function course(
  qualityStatus: MainlineCourse['qualityStatus'],
  factAudit?: MainlineCourse['factAudit'],
): MainlineCourse {
  return { id: 'course-1', qualityStatus, ...(factAudit ? { factAudit } : {}) } as MainlineCourse
}

function blocker(id = 'issue-1'): QualityIssue {
  return {
    id,
    gate: 'pedagogy',
    severity: 'blocking',
    targetType: 'scene',
    targetId: 'scene-1',
    message: '当前规则发现阻断问题。',
    impact: '不能发布。',
    fix: '修正内容。',
    autoFixable: true,
  }
}

describe('course release readiness', () => {
  it('keeps a clean persisted pass ready', () => {
    const result = courseReleaseReadinessFromIssues(course('passed'), [])

    expect(result).toMatchObject({ status: 'passed', ready: true, stalePassed: false, blockingCount: 0 })
    expect(courseReleaseReason(result)).toBeUndefined()
  })

  it('downgrades a stale persisted pass when a current deterministic gate blocks', () => {
    const result = courseReleaseReadinessFromIssues(course('passed'), [blocker()])

    expect(result).toMatchObject({ storedStatus: 'passed', status: 'blocked', ready: false, stalePassed: true, blockingCount: 1 })
    expect(result.blockers[0]).toMatchObject({ source: 'quality-gate', targetId: 'scene-1' })
    expect(courseReleaseReason(result)).toContain('上次记录为已通过')
  })

  it('blocks a persisted pass for fact issues and pending teacher edits', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 1,
      fatalCount: 1,
      pendingSceneIds: ['scene-2', 'scene-2'],
      issues: [{
        id: 'fact-1', severity: 'blocking', targetId: 'scene-1',
        message: '事实错误。', impact: '误导学生。', fix: '核对教材。',
      }],
    }), [])

    expect(result.blockingCount).toBe(2)
    expect(result.blockers.map(item => item.source)).toEqual(['fact-audit', 'fact-audit-pending'])
  })

  it('honors legacy fatalCount even when old issue details are absent', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 1,
      fatalCount: 2,
      issues: [],
    }), [])

    expect(result).toMatchObject({ status: 'blocked', blockingCount: 2 })
    expect(result.blockers[0]?.message).toContain('2 个未展开')
  })

  it('按当前发布语义阻断存量 warning 形式的 MISLEADING，不要求先批量改库', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 1,
      fatalCount: 0,
      issues: [{
        id: 'legacy-misleading', severity: 'warning', targetId: 'scene-1',
        message: '断言核查 MISLEADING:「只看端点数量」',
        impact: '会把折线误判成线段。', fix: '补齐三个判据。',
      }],
    }), [])

    expect(result).toMatchObject({ status: 'blocked', stalePassed: true, blockingCount: 1 })
    expect(result.blockers[0]).toMatchObject({ source: 'fact-audit', targetId: 'scene-1' })
  })

  it('核查服务失败的页面阻断发布，并与同页 pending 合并为一个阻断', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 0,
      requiredSceneIds: ['scene-2'],
      unverifiedSceneIds: ['scene-2'],
      pendingSceneIds: ['scene-2'],
      fatalCount: 0,
      issues: [{
        id: 'unverified', severity: 'info', targetId: 'scene-2',
        message: '事实核查未完成(核查服务失败),本幕断言未经验证。',
        impact: '错误断言可能未被发现。', fix: '重新核查。',
      }],
    }), [])

    expect(result).toMatchObject({ status: 'blocked', stalePassed: true, blockingCount: 1 })
    expect(result.blockers.map(item => item.source)).toEqual(['fact-audit-unverified'])
  })

  it('never upgrades persisted blocked or draft state while reading', () => {
    const blocked = courseReleaseReadinessFromIssues(course('blocked'), [])
    const draft = courseReleaseReadinessFromIssues(course('draft'), [])

    expect(blocked).toMatchObject({ status: 'blocked', ready: false, blockingCount: 1 })
    expect(blocked.blockers[0]?.source).toBe('persisted-status')
    expect(draft).toMatchObject({ status: 'draft', ready: false, blockingCount: 0 })
  })
})

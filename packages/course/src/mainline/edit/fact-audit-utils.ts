/**
 * fact-audit-utils · 单页编辑后的事实核查覆盖状态。
 *
 * 问题清单不是核查覆盖清单。一个“没有问题”的幕也可能已核查，所以新记录保存
 * auditedSceneIds；教师改动事实内容时把该幕从已核查集合移入 pendingSceneIds，
 * 直到单页核查或重生成真正完成后才能再次放行。
 */

import type { FactAuditRecord } from '../domain.js'

function unique(ids: Iterable<string>): string[] {
  return [...new Set(ids)]
}

function issueTouchesScene(issue: FactAuditRecord['issues'][number], sceneId: string): boolean {
  return issue.targetId === sceneId || issue.relatedTargetIds?.includes(sceneId) === true
}

function withoutSceneIssues(record: FactAuditRecord, sceneId: string): FactAuditRecord['issues'] {
  return record.issues.filter(issue => !issueTouchesScene(issue, sceneId))
}

function isConsistencyIssue(issue: FactAuditRecord['issues'][number]): boolean {
  return issue.id.includes(':consistency-')
}

function consistencyConflictCountOf(issues: FactAuditRecord['issues']): number {
  return issues.filter(issue => isConsistencyIssue(issue) && issue.severity !== 'info').length
}

function uniqueIssues(issues: FactAuditRecord['issues']): FactAuditRecord['issues'] {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = `${issue.id}|${issue.severity}|${issue.targetId}|${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fatalCountOf(issues: FactAuditRecord['issues']): number {
  return issues.filter(issue => issue.severity === 'blocking').length
}

/** 删除或换骨架时彻底移除该幕的核查覆盖、待核查状态和旧结论。 */
export function clearSceneFromFactAudit(
  factAudit: FactAuditRecord | undefined,
  sceneId: string,
): FactAuditRecord | undefined {
  if (!factAudit) return undefined
  const issues = withoutSceneIssues(factAudit, sceneId)
  const exactIds = factAudit.auditedSceneIds?.filter(id => id !== sceneId)
  const requiredSceneIds = factAudit.requiredSceneIds?.filter(id => id !== sceneId)
  const unverifiedSceneIds = factAudit.unverifiedSceneIds?.filter(id => id !== sceneId)
  const consistencyIds = factAudit.consistencyAuditedSceneIds?.filter(id => id !== sceneId)
  const pendingSceneIds = (factAudit.pendingSceneIds ?? []).filter(id => id !== sceneId)
  const hadSceneIssue = issues.length !== factAudit.issues.length
  const auditedSceneCount = exactIds
    ? exactIds.length
    : Math.max(0, factAudit.auditedSceneCount - (hadSceneIssue ? 1 : 0))

  return {
    ...factAudit,
    ...(exactIds ? { auditedSceneIds: exactIds } : {}),
    ...(requiredSceneIds ? { requiredSceneIds } : {}),
    ...(unverifiedSceneIds ? { unverifiedSceneIds } : {}),
    ...(consistencyIds ? { consistencyAuditedSceneIds: consistencyIds } : {}),
    pendingSceneIds,
    auditedSceneCount,
    consistencyConflictCount: consistencyConflictCountOf(issues),
    fatalCount: fatalCountOf(issues),
    issues,
  }
}

/** 批量版 clearSceneFromFactAudit——换骨架替换一整个片段时使用。 */
export function clearScenesFromFactAudit(
  factAudit: FactAuditRecord | undefined,
  sceneIds: Iterable<string>,
): FactAuditRecord | undefined {
  let current = factAudit
  for (const id of sceneIds) current = clearSceneFromFactAudit(current, id)
  return current
}

/**
 * 教师改动事实承载字段：旧结论作废、覆盖数撤回、加入待核查。
 * 没有旧记录时也建立待核查记录，避免“手工填完一页就绕过事实核查”。
 */
export function invalidateSceneFactAudit(
  factAudit: FactAuditRecord | undefined,
  sceneId: string,
): FactAuditRecord {
  if (!factAudit) {
    return {
      auditedSceneIds: [],
      requiredSceneIds: [sceneId],
      unverifiedSceneIds: [],
      consistencyAuditedSceneIds: [],
      pendingSceneIds: [sceneId],
      auditedSceneCount: 0,
      fatalCount: 0,
      issues: [],
    }
  }

  const issues = withoutSceneIssues(factAudit, sceneId)
  const exactIds = factAudit.auditedSceneIds?.filter(id => id !== sceneId)
  const requiredSceneIds = unique([...(factAudit.requiredSceneIds ?? []), sceneId])
  const unverifiedSceneIds = (factAudit.unverifiedSceneIds ?? []).filter(id => id !== sceneId)
  const consistencyIds = factAudit.consistencyAuditedSceneIds?.filter(id => id !== sceneId)
  return {
    ...factAudit,
    ...(exactIds ? { auditedSceneIds: exactIds } : {}),
    requiredSceneIds,
    unverifiedSceneIds,
    ...(consistencyIds ? { consistencyAuditedSceneIds: consistencyIds } : {}),
    pendingSceneIds: unique([...(factAudit.pendingSceneIds ?? []), sceneId]),
    auditedSceneCount: exactIds
      ? exactIds.length
      : Math.max(0, factAudit.auditedSceneCount - 1),
    fatalCount: fatalCountOf(issues),
    consistencyConflictCount: consistencyConflictCountOf(issues),
    issues,
  }
}

/** 把单页最新核查结论合并回课程；只有真实完成核查时才移除待核查状态。 */
export function mergeSceneIntoFactAudit(
  factAudit: FactAuditRecord | undefined,
  sceneId: string,
  freshIssues: FactAuditRecord['issues'],
  factAuditedThisScene: boolean,
  totalScenes: number,
  consistencyAuditedThisScene: boolean,
): FactAuditRecord {
  const hadSceneIssue = Boolean(factAudit?.issues.some(issue => issueTouchesScene(issue, sceneId)))
  const wasPending = Boolean(factAudit?.pendingSceneIds?.includes(sceneId))
  const previousIssues = factAudit?.issues ?? []
  const preservedSceneIssues = previousIssues.filter(issue => issueTouchesScene(issue, sceneId) && (
    isConsistencyIssue(issue) ? !consistencyAuditedThisScene : !factAuditedThisScene
  ))
  const issues = uniqueIssues([
    ...previousIssues.filter(issue => !issueTouchesScene(issue, sceneId)),
    ...preservedSceneIssues,
    ...freshIssues,
  ])
  const previousPendingSceneIds = factAudit?.pendingSceneIds ?? []
  const auditComplete = factAuditedThisScene && (totalScenes < 2 || consistencyAuditedThisScene)
  const pendingSceneIds = auditComplete
    ? previousPendingSceneIds.filter(id => id !== sceneId)
    : unique([...previousPendingSceneIds, sceneId])

  let auditedSceneIds: string[] | undefined
  let auditedSceneCount: number
  if (factAudit?.auditedSceneIds) {
    auditedSceneIds = unique([
      ...factAudit.auditedSceneIds.filter(id => id !== sceneId),
      ...(factAuditedThisScene ? [sceneId] : []),
    ])
    auditedSceneCount = auditedSceneIds.length
  } else if (!factAudit) {
    auditedSceneIds = factAuditedThisScene ? [sceneId] : []
    auditedSceneCount = auditedSceneIds.length
  } else {
    // 旧记录没有精确集合：待核查失效时已经撤回过一次；有旧 issue 则在替换时撤回。
    const baseCount = Math.max(0, factAudit.auditedSceneCount - (!wasPending && hadSceneIssue ? 1 : 0))
    auditedSceneCount = Math.min(baseCount + (factAuditedThisScene ? 1 : 0), totalScenes)
  }

  const consistencyAuditedSceneIds = unique([
    ...(factAudit?.consistencyAuditedSceneIds ?? []).filter(id => id !== sceneId),
    ...(consistencyAuditedThisScene ? [sceneId] : []),
  ])
  const requiredSceneIds = unique([...(factAudit?.requiredSceneIds ?? []), sceneId])
  const unverifiedSceneIds = factAuditedThisScene
    ? (factAudit?.unverifiedSceneIds ?? []).filter(id => id !== sceneId)
    : unique([...(factAudit?.unverifiedSceneIds ?? []), sceneId])

  return {
    ...(factAudit?.repairTrace ? { repairTrace: factAudit.repairTrace } : {}),
    ...(auditComplete
      ? { auditedAt: new Date().toISOString() }
      : factAudit?.auditedAt
        ? { auditedAt: factAudit.auditedAt }
        : {}),
    ...(auditedSceneIds ? { auditedSceneIds } : {}),
    requiredSceneIds,
    unverifiedSceneIds,
    consistencyAuditedSceneIds,
    pendingSceneIds,
    auditedSceneCount,
    consistencyConflictCount: consistencyConflictCountOf(issues),
    fatalCount: fatalCountOf(issues),
    issues,
  }
}

/** 课程是否仍有教师改后未核查的页面。所有放行路径统一调用，避免只看 FATAL。 */
export function hasPendingFactAudit(factAudit: FactAuditRecord | undefined): boolean {
  return (factAudit?.pendingSceneIds?.length ?? 0) > 0
}

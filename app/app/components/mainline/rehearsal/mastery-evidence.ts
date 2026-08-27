import type { MasteryEvidenceStatus } from '@/lib/mainline/mastery'

export interface RehearsalMasteryCoverage {
  used: number
  total: number
  statusByKp: Record<string, MasteryEvidenceStatus>
}

export function statusKpIds(
  coverage: RehearsalMasteryCoverage,
  status: MasteryEvidenceStatus,
): Set<string> {
  return new Set(Object.entries(coverage.statusByKp).flatMap(([kpId, value]) => (
    value === status ? [kpId] : []
  )))
}

export function rehearsalMasteryEvidenceText(
  score: number,
  status: MasteryEvidenceStatus | undefined,
): string {
  const percent = Math.round(score * 100) + '%'
  if (status === 'seeded-demo') return '演示种子掌握度 · ' + percent + '（教材误区推导，非真实作答）'
  if (status === 'provisional-self-assessment') return '暂定自评掌握度 · ' + percent + '（反馈后自评，未验证）'
  if (status === 'verified') return '已验证作答掌握度 · ' + percent
  return '来源未确认的历史掌握度 · ' + percent
}

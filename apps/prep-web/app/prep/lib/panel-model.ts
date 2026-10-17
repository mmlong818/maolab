// 面板的视图模型（纯函数）：任务轮询、导出链接、整课审查被拦时的逐条处理建议（3c 终审后的 audit-blocked details）、单知识点提示、验收按钮是否可用。
export interface PrepJob { jobId: string; kind: string; pageId: string | null; status: string; attempts: number; error: { code: string; message: string } | null; result: { url?: string | null; filename?: string | null; expiresAt?: number | null; blocked?: unknown; skipped?: unknown } | null; createdAt: number; finishedAt: number | null }
export interface PrepWorkbench { course: Record<string, unknown>; summary: Record<string, unknown>; teachingAudit: { status: string; state: 'current' | 'stale'; findings: unknown } | null; unacceptedPageIds: string[]; auditBlocked: unknown; exportReady: { ok: true; pageCount: number; filename: string } | { ok: false; message: string; blockers: unknown } }

export const needsPolling = (jobs: readonly PrepJob[]): boolean => jobs.some((j) => j.status === 'queued' || j.status === 'running')

export function latestExport(jobs: readonly PrepJob[]): { href: string; filename: string; expiresAt: number | null } | { pending: true } | { failed: string } | null {
  const latest = [...jobs].filter((j) => j.kind === 'export-pptx').sort((a, b) => b.createdAt - a.createdAt)[0]
  if (!latest) return null
  if (latest.status === 'queued' || latest.status === 'running') return { pending: true }
  if (latest.status === 'succeeded' && latest.result?.url) return { href: latest.result.url, filename: latest.result.filename ?? '课件.pptx', expiresAt: latest.result.expiresAt ?? null }
  return { failed: latest.error?.message ?? '导出没有完成。' }
}

export const ACTION_LABELS = {
  'repair-page': '修改这一页',
  'add-source': '缺权威来源：需要补课标或教材原文，修页解决不了',
  'rerun-audit': '直接重新审查',
} as const

type Item = { pageId?: unknown; impact?: unknown; message?: unknown; fix?: unknown; action?: unknown }
// details 可能是 null，各列表可能是空数组或 null（Note for T12：记录不是当前版本时给空列表）：一律按"没有"处理
const listOf = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function auditBlockedView(details: unknown): { advice: string; items: Array<{ pageId: string | null; text: string; action: string }>; auditError?: string; unverified: number } {
  const d = (details && typeof details === 'object' ? details : {}) as { advice?: unknown; findings?: unknown; factIssues?: unknown; unverifiedPageIds?: unknown; auditError?: unknown }
  const items = [...listOf<Item>(d.findings), ...listOf<Item>(d.factIssues)].filter((i) => i && typeof i === 'object').map((i) => {
    const head = String(i.impact ?? i.message ?? '')
    const fix = typeof i.fix === 'string' && i.fix ? `（${i.fix}）` : ''
    const action = Object.prototype.hasOwnProperty.call(ACTION_LABELS, String(i.action)) ? ACTION_LABELS[i.action as keyof typeof ACTION_LABELS] : ACTION_LABELS['repair-page']
    return { pageId: typeof i.pageId === 'string' ? i.pageId : null, text: `${head}${fix}`, action }
  })
  return { advice: typeof d.advice === 'string' ? d.advice : '', ...(typeof d.auditError === 'string' ? { auditError: d.auditError } : {}), unverified: listOf(d.unverifiedPageIds).length, items }
}

export function teachingAuditNote(workbench: Pick<PrepWorkbench, 'teachingAudit'>, kpCount: number): string | undefined {
  if (workbench.teachingAudit?.status !== 'insufficient-evidence') return undefined
  return kpCount <= 1
    ? 'AI 教学审查判为依据不足：单知识点课程目前几乎无法通过（审查要同时有教材原文与课标原文）。可以在对话里让备课助理补充相关知识点后重建，或等待产品裁定。'
    : 'AI 教学审查判为依据不足：课程来源里缺少权威的课标或教材原文，修页解决不了，需要补充来源。'
}

/**
 * 验收（逐页、整课）只在计划确认、有生成会话之后提供（Note for T12）：草稿课程没有 generationSession，
 * 逐页验收 api 回 404 not-found、整课验收回 422，面板不显示这两个按钮。
 */
export function canAccept(workbench: Pick<PrepWorkbench, 'course'>): boolean {
  const session = (workbench.course as { generationSession?: unknown } | null | undefined)?.generationSession
  return Boolean(session) && typeof session === 'object'
}

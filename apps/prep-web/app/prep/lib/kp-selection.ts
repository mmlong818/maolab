export interface KpChoice { kpId: string; canonicalName: string; subject: string }
// Ruling [T11] F1：上限 6，与 api（POST /api/prep/courses）、course schema、3c 工具一致
export const MAX_KPS = 6
// 3c 需用户裁定第 2 条的缺省（c）：不强制，只提示
export const SINGLE_KP_WARNING = '只选一个知识点的课，目前几乎通不过整课 AI 教学审查（审查要同时找到教材原文与课标原文），建议至少选两个相关的知识点。'

export function toggleKp(selected: readonly KpChoice[], kp: KpChoice): { selected: KpChoice[]; warning?: string } {
  const exists = selected.some((s) => s.kpId === kp.kpId)
  if (!exists && selected.length >= MAX_KPS) return { selected: [...selected], warning: `一节课最多选 ${MAX_KPS} 个知识点。` }
  const next = exists ? selected.filter((s) => s.kpId !== kp.kpId) : [...selected, kp]
  return next.length === 1 ? { selected: next, warning: SINGLE_KP_WARNING } : { selected: next }
}

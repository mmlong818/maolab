// 面板视图的纯逻辑（Task 12 fix round 1）：中文标签对照课程包的真实枚举、计划可编辑判定、整课验收判定、
// 给老师看的下一步与审查建议（工具返回给模型的文案不变，这里只转显示）、"改为讲解页"的两步操作、换课与下载过期判定。
import type { CourseRevisionStatus, LessonPagePurpose } from '@/lib/mainline/planning/page-contract'
import type { GenerationSessionStatus, PageGenerationJobStatus } from '@/lib/mainline/generation-session'
import { PrepApiError } from '../lib/api'
import { ACTION_LABELS, type PrepWorkbench } from '../lib/panel-model'
import { errorText } from '../errors'

export const PLAN_STATUS_LABEL = {
  planning: '计划待确认',
  'plan-approved': '计划已确认',
  generating: '生成中',
  review: '审查中',
  ready: '已就绪',
  archived: '已归档',
} satisfies Record<CourseRevisionStatus, string>

// qualityStatus：MainlineCourse['qualityStatus']
export const QUALITY_STATUS_LABEL = { draft: '质量未通过检查', blocked: '质量有阻断', passed: '质量已通过' } satisfies Record<'draft' | 'blocked' | 'passed', string>

export const SESSION_STATUS_LABEL = {
  generating: '逐页生成中',
  rendering: '截图检查中',
  'course-audit': '整课审查中',
  'awaiting-teacher-acceptance': '待老师验收',
  ready: '已验收',
  failed: '生成失败',
  cancelled: '生成已取消',
} satisfies Record<GenerationSessionStatus, string>

// summary.pages[].status：生成任务状态，没有任务时为 not-started
export const PAGE_STATUS_LABEL = {
  'not-started': '未开始',
  queued: '待生成',
  running: '生成中',
  'content-ready': '待截图',
  blocked: '被拦下',
  passed: '已通过',
  cancelled: '已取消',
} satisfies Record<PageGenerationJobStatus | 'not-started', string>

export const PAGE_PURPOSE_LABEL = {
  orient: '导入',
  structure: '课程结构',
  source: '阅读材料',
  observe: '观察',
  explain: '讲解',
  question: '提问',
  answer: '揭晓答案',
  'worked-step': '例题步骤',
  practice: '练习',
  feedback: '反馈',
  recap: '小结',
  transfer: '迁移应用',
} satisfies Record<LessonPagePurpose, string>

export const AUDIT_STATUS_LABEL: Record<string, string> = { passed: '通过', blocked: '有阻断问题', 'insufficient-evidence': '依据不足' }

/** 已知值给中文；未知的新取值原样显示（不吞掉信息），空值给空串 */
export function labelOf(map: Record<string, string>, value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  return Object.prototype.hasOwnProperty.call(map, value) ? map[value]! : value
}
export const purposeLabel = (purpose: unknown) => labelOf(PAGE_PURPOSE_LABEL, purpose)

export function courseStatusText(row: { planStatus: string | null; qualityStatus: string; sessionStatus?: string | null }): string {
  const progress = row.sessionStatus ? labelOf(SESSION_STATUS_LABEL, row.sessionStatus) : labelOf(PLAN_STATUS_LABEL, row.planStatus)
  return [progress, labelOf(QUALITY_STATUS_LABEL, row.qualityStatus)].filter(Boolean).join(' · ')
}

/** 计划只在 planning 时可改、可确认、可做结构操作（saveDraftPlan / approveDraftPlan / editDraftPlanStructure 同一判据） */
export const planEditable = (status: unknown): boolean => status === 'planning'

export const sessionStatusOf = (workbench: Pick<PrepWorkbench, 'summary'>): string | null => {
  const s = workbench.summary.sessionStatus
  return typeof s === 'string' ? s : null
}

/** 整课验收只在会话待验收、逐页都验完、还没有最终签名时可点（acceptCourse 同一判据） */
export function canAcceptCourse(workbench: Pick<PrepWorkbench, 'summary' | 'unacceptedPageIds'>): boolean {
  const acceptance = workbench.summary.acceptance as { finalSignature?: string | null } | null | undefined
  return sessionStatusOf(workbench) === 'awaiting-teacher-acceptance' && workbench.unacceptedPageIds.length === 0 && !acceptance?.finalSignature
}

/** 给老师的下一步（对应 prep-facade 的 NEXT_STEP_BY_STATUS，那份是写给模型的） */
export const NEXT_STEP_TEXT = {
  generating: '页面还在逐页生成：在对话里让备课助理继续生成。',
  rendering: '页面已全部生成，下一步是截图检查：在"质量"里点"送截图"。',
  'course-audit': '截图都已通过，下一步是整课审查：在对话里让备课助理做整课审查。',
  'awaiting-teacher-acceptance': '整课审查已通过：请逐页验收，再整课验收。',
  ready: '课程已验收，可以导出 PPTX。',
  failed: '这次生成失败了：在对话里让备课助理重新开始生成。',
  cancelled: '这次生成已取消：在对话里让备课助理重新开始生成。',
} satisfies Record<GenerationSessionStatus, string>
export const nextStepText = (sessionStatus: string | null): string => labelOf(NEXT_STEP_TEXT, sessionStatus)

export function acceptErrorText(e: unknown, sessionStatus: string | null): string {
  if (e instanceof PrepApiError && e.status === 422) {
    if (e.reason === 'pages-not-accepted') return '还有页面没有按当前版本验收：请先逐页验收，再整课验收。'
    if (e.reason === 'session-not-ready') {
      return sessionStatus ? `现在还不能整课验收。${nextStepText(sessionStatus) || `当前进度：${sessionStatus}。`}` : '计划还没确认，也还没有生成页面，现在不能验收。'
    }
  }
  return errorText(e, '没有完成，请稍后重试。')
}

/** render 接口没有投新任务时的 note 是给模型的（带工具名）：换成老师的下一步 */
export function renderNoteText(note: string | undefined, sessionStatus: string | null): string {
  const next = nextStepText(sessionStatus)
  if (next) return `没有需要截图的页。${next}`
  return note && !/[a-z]+_[a-z]+/.test(note) ? note : '没有需要截图的页。'
}

type RawItem = { pageId?: unknown; impact?: unknown; message?: unknown; fix?: unknown; action?: unknown }
const listOf = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/**
 * 整课审查被拦时给老师的建议（details 与 audit_course 返回的同形；其中 advice 是写给模型的，这里不用它）。
 * 有条目、未核实页、待核查页或审查输出错误时才显示；各列表都空时 show=false（Note for T12：什么也不多显示）。
 */
export function teacherAuditAdvice(details: unknown, pageLabel: (pageId: string) => string): { show: boolean; lines: string[]; items: Array<{ text: string; action: string }>; auditError?: string } {
  const d = (details && typeof details === 'object' ? details : {}) as { findings?: unknown; factIssues?: unknown; unverifiedPageIds?: unknown; pendingPageIds?: unknown; auditError?: unknown }
  const raw = [...listOf<RawItem>(d.findings), ...listOf<RawItem>(d.factIssues)].filter((i) => i && typeof i === 'object')
  const unverified = listOf(d.unverifiedPageIds).length
  const pending = listOf(d.pendingPageIds).length
  const auditError = typeof d.auditError === 'string' && d.auditError ? d.auditError : undefined
  const actionOf = (a: unknown): keyof typeof ACTION_LABELS => (typeof a === 'string' && Object.prototype.hasOwnProperty.call(ACTION_LABELS, a) ? a as keyof typeof ACTION_LABELS : 'repair-page')
  const items = raw.map((i) => {
    const where = typeof i.pageId === 'string' && i.pageId ? `${pageLabel(i.pageId)}：` : ''
    const head = String(i.impact ?? i.message ?? '')
    const fix = typeof i.fix === 'string' && i.fix ? `（建议：${i.fix}）` : ''
    return { text: `${where}${head}${fix}`, action: ACTION_LABELS[actionOf(i.action)] }
  })
  const lines: string[] = []
  if (unverified > 0) {
    lines.push(auditError
      ? `事实核查没有完成（${unverified} 页未经核实）：是审查输出本身没有通过校验，不是页面内容的问题。在对话里让备课助理重新做整课审查即可。`
      : `事实核查没有完成（${unverified} 页未经核实），不是页面内容的问题：在对话里让备课助理重新做整课审查。`)
  } else if (pending > 0) {
    lines.push(`有 ${pending} 页在等待重新核查：在对话里让备课助理重新做整课审查。`)
  }
  const actions = new Set(raw.map((i) => actionOf(i.action)))
  if (actions.has('repair-page')) lines.push('标为"修改这一页"的问题：在对话里让备课助理按建议修改对应页面，重新截图后再做整课审查。')
  if (actions.has('add-source')) lines.push('标为"缺权威来源"的问题：课程缺少课标或教材原文，改页面解决不了，需要补充来源（例如补充相关知识点后重新建课）。')
  if (actions.has('rerun-audit')) lines.push('标为"直接重新审查"的问题：是审查输出不完整，不是页面内容的问题，在对话里让备课助理重新做整课审查。')
  const show = items.length > 0 || unverified > 0 || pending > 0 || Boolean(auditError)
  return { show, lines, items, ...(auditError ? { auditError } : {}) }
}

type UpdatePlan = (courseId: string, command: { action: 'structure'; operation: unknown }) => Promise<unknown>

/**
 * 图像页"改为讲解页"：api 没有原子的替换操作，分两步（先在原页后插入讲解页，再删原页）。
 * inserted=true 表示上一次已经插入成功、只差删除：这次只删，不再插第二张。删除失败时如实说明两张都在。
 */
export async function replaceWithExplanation(
  updatePlan: UpdatePlan,
  courseId: string,
  page: { id: string; purpose: string; learningAction: string; newInformation: string },
  inserted: boolean,
): Promise<{ inserted: boolean; done: boolean; message: string }> {
  if (!inserted) {
    const learningAction = (page.learningAction.trim() || purposeLabel(page.purpose) || '讲解').slice(0, 240)
    const newInformation = (page.newInformation.trim() || purposeLabel(page.purpose) || '讲解').slice(0, 360)
    try {
      await updatePlan(courseId, { action: 'structure', operation: { type: 'insert-explanation', afterPageId: page.id, learningAction, newInformation } })
    } catch (e) {
      return { inserted: false, done: false, message: `没有改成：${errorText(e, '请稍后重试。')}` }
    }
  }
  try {
    await updatePlan(courseId, { action: 'structure', operation: { type: 'delete', pageId: page.id } })
    return { inserted: true, done: true, message: '已改为讲解页。' }
  } catch (e) {
    return { inserted: true, done: false, message: `已插入讲解页，但原图像页还在（${errorText(e, '删除没有完成')}）。再点一次"删除原图像页"只会删掉原页，不会再插入。` }
  }
}

/** 面板数据带着它所属的课程：换课当次渲染（effect 还没清空前）不用旧课程的数据 */
export function viewFor<T extends { courseId: string }>(data: T | null, courseId: string | null): T | null {
  return data && courseId && data.courseId === courseId ? data : null
}

export function downloadState(latest: { expiresAt: number | null }, now: number): 'available' | 'expired' {
  return latest.expiresAt !== null && latest.expiresAt <= now ? 'expired' : 'available'
}

interface PlanPageLike { id: string; order?: number; purpose: string; visualSpec?: { required?: boolean; form?: string } }

/**
 * 终审修复（T12 M2）："改为讲解页"是否已经插入了讲解页、只差删原页——从计划数据推断，不靠组件内状态
 * （切标签、换课、刷新后仍然对，再点只删不再插）。插入的讲解页紧跟在原页后面，id 以 :manual:<n> 结尾（plan-structure-editor），
 * 用途是讲解、不要求教学图像。
 */
export function explanationInsertedAfter(pages: readonly PlanPageLike[], pageId: string): boolean {
  const ordered = [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const index = ordered.findIndex((p) => p.id === pageId)
  const next = index >= 0 ? ordered[index + 1] : undefined
  return Boolean(next && /:manual:\d+$/.test(next.id) && next.purpose === 'explain' && !(next.visualSpec?.required && next.visualSpec.form === 'instructional-image'))
}

/**
 * 终审修复（T15 走查第 4 条）：质量表的"最近诊断"只给当前仍被拦下的页。summary 的 lastDiagnostic 是生成任务里最后一条诊断，
 * 页修好、重新通过（或重新排队、待截图）之后它就过期了，不再显示。
 */
export function currentDiagnostic(row: { status: string; lastDiagnostic: string | null }): string | null {
  return row.status === 'blocked' && row.lastDiagnostic ? row.lastDiagnostic : null
}

/** 长文字收起：超过 max 个字符时给前 max 个字符加"…"，其余放进可展开的部分 */
export function clipText(text: string, max = 60): { short: string; full?: string } {
  const chars = [...text]
  return chars.length <= max ? { short: text } : { short: `${chars.slice(0, max).join('')}…`, full: text }
}

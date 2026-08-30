import {
  PAGE_PLAN_SCHEMA_VERSION,
  type CoursePlanningState,
  type LessonPagePlan,
  type LessonPagePurpose,
  type PageContentSpec,
} from './page-contract.js'

export interface PagePlanIssue {
  code: string
  severity: 'blocking' | 'warning'
  pageId?: string
  message: string
}

const PURPOSE_CONTENT_KIND: Record<LessonPagePurpose, PageContentSpec['kind']> = {
  orient: 'course-orientation',
  structure: 'course-structure',
  source: 'source-material',
  observe: 'observation',
  explain: 'explanation',
  question: 'question',
  answer: 'answer',
  'worked-step': 'worked-step',
  practice: 'practice',
  feedback: 'feedback',
  recap: 'recap',
  transfer: 'transfer',
}

const INTERNAL_TEXT = /待\s*(?:LLM|AI)\s*填充|contentSlots|sceneType|执行器|生成链路|内部字段|下一张真实投影片|后续真实投影片|页面计划|debug|schema/i

export function auditCoursePlanningState(planning: CoursePlanningState): PagePlanIssue[] {
  const issues: PagePlanIssue[] = []
  const issue = (code: string, message: string, pageId?: string, severity: PagePlanIssue['severity'] = 'blocking') => {
    issues.push({ code, severity, message, ...(pageId ? { pageId } : {}) })
  }

  if (planning.schemaVersion !== PAGE_PLAN_SCHEMA_VERSION) {
    issue('schema-version', `页面规划版本必须是 ${PAGE_PLAN_SCHEMA_VERSION}。`)
  }
  if (!planning.courseId.trim()) issue('course-id', '页面规划缺少课程 ID。')
  if (!planning.planRevisionId.trim()) issue('revision-id', '页面规划缺少版本 ID。')
  if (planning.arc.courseId !== planning.courseId) issue('arc-course', '学习进程与页面规划不属于同一门课程。')
  if (!planning.arc.id.trim()) issue('arc-id', '学习进程缺少 ID。')
  if (planning.arc.steps.length === 0) issue('empty-arc', '学习进程不能为空。')
  if (planning.pages.length === 0) issue('empty-plan', '页面规划不能为空。')

  const pageIds = new Set<string>()
  const arcStepIds = new Set<string>()
  const pairMap = new Map<string, LessonPagePlan[]>()
  const duplicateKeys = new Map<string, string>()

  planning.arc.steps.forEach((step, index) => {
    if (arcStepIds.has(step.id)) issue('duplicate-arc-step-id', `学习步骤 ID 重复：${step.id}`)
    arcStepIds.add(step.id)
    if (step.order !== index + 1) issue('arc-order', `学习步骤顺序应为 ${index + 1}，实际为 ${step.order}。`)
    if (!step.fragmentId.trim()) issue('arc-fragment', `学习步骤 ${step.id} 缺少片段归属。`)
    if (!step.role.trim() || !step.focus.trim()) issue('arc-purpose', `学习步骤 ${step.id} 缺少教学作用或学习焦点。`)
    if (step.pagePurposes.length === 0) issue('arc-pages', `学习步骤 ${step.id} 没有规划真实投影片。`)
  })

  planning.pages.forEach((page, index) => {
    if (pageIds.has(page.id)) issue('duplicate-page-id', `页面 ID 重复：${page.id}`, page.id)
    pageIds.add(page.id)
    if (page.order !== index + 1) issue('page-order', `页面顺序应为 ${index + 1}，实际为 ${page.order}。`, page.id)
    const expectedPrevious = index === 0 ? undefined : planning.pages[index - 1]?.id
    if (page.previousPageId !== expectedPrevious) issue('previous-page', '页面的前序引用与真实顺序不一致。', page.id)
    if (page.audience !== 'student') issue('audience', '真实投影片只能声明为学生可见。', page.id)
    if (!page.learningAction.trim()) issue('learning-action', '页面缺少学生学习动作。', page.id)
    if (!page.newInformation.trim()) issue('new-information', '页面缺少相对前页新增的信息。', page.id)
    if (!arcStepIds.has(page.arcStepId)) issue('arc-step', '页面没有指向有效的学习步骤。', page.id)
    if (page.contentSpec.kind !== PURPOSE_CONTENT_KIND[page.purpose]) {
      issue('content-kind', `页面目的 ${page.purpose} 与内容类型 ${page.contentSpec.kind} 不匹配。`, page.id)
    }
    if (page.visualSpec.required && (!page.visualSpec.reason.trim() || page.visualSpec.form === 'none')) {
      issue('required-visual', '必需视觉页面必须声明视觉形式和教学原因。', page.id)
    }
    const studentText = JSON.stringify({
      learningAction: page.learningAction,
      newInformation: page.newInformation,
      contentSpec: page.contentSpec,
    })
    if (INTERNAL_TEXT.test(studentText)) issue('internal-text', '页面规划含有不能给学生看的内部生成文字。', page.id)

    const duplicateKey = normalize(`${page.fragmentId}|${page.purpose}|${page.newInformation}|${page.learningAction}`)
    const duplicateOf = duplicateKeys.get(duplicateKey)
    if (duplicateOf) issue('semantic-duplicate', `页面与 ${duplicateOf} 没有新的教学作用。`, page.id)
    else duplicateKeys.set(duplicateKey, page.id)

    if (page.pairId) {
      const pair = pairMap.get(page.pairId) ?? []
      pair.push(page)
      pairMap.set(page.pairId, pair)
    } else if (page.pairRole) {
      issue('pair-id', '成对页面声明了角色但没有 pairId。', page.id)
    }
  })

  for (const step of planning.arc.steps) {
    const actualPurposes = planning.pages
      .filter(page => page.arcStepId === step.id)
      .map(page => page.purpose)
    if (actualPurposes.length !== step.pagePurposes.length
      || actualPurposes.some((purpose, index) => purpose !== step.pagePurposes[index])) {
      issue('arc-page-contract', `学习步骤 ${step.id} 的真实投影片与骨架约定不一致。`)
    }
  }

  for (const [pairId, pairPages] of pairMap) {
    const prompts = pairPages.filter(page => page.pairRole === 'prompt')
    const responses = pairPages.filter(page => page.pairRole === 'response')
    if (prompts.length !== 1 || responses.length !== 1) {
      issue('pair-cardinality', `页面对 ${pairId} 必须且只能包含一张提问页和一张回应页。`)
      continue
    }
    const prompt = prompts[0]!
    const response = responses[0]!
    if (response.order !== prompt.order + 1) issue('pair-order', '回应页必须是提问页之后的下一张真实投影片。', response.id)
    if (prompt.id === response.id) issue('pair-page-id', '提问和回应不能使用同一个页面 ID。', prompt.id)
    if (prompt.layoutGroupId !== response.layoutGroupId) issue('layout-group', '增量页面必须共享稳定的版式组。', response.id)
    if (prompt.contentSpec.kind === 'question' || prompt.contentSpec.kind === 'practice' || prompt.contentSpec.kind === 'transfer') {
      if (prompt.contentSpec.responsePageId !== response.id) issue('response-link', '提问页没有指向实际回应页。', prompt.id)
    }
    if (response.contentSpec.kind === 'answer' || response.contentSpec.kind === 'worked-step' || response.contentSpec.kind === 'feedback') {
      if (response.contentSpec.questionPageId !== prompt.id) issue('question-link', '回应页没有指向实际提问页。', response.id)
    }
  }

  for (const contract of planning.learningContracts) {
    const evidencePages = planning.pages.filter(page => (
      page.knowledgePointIds.includes(contract.kpId) && page.evidenceExpected?.trim()
    ))
    if (evidencePages.length === 0) issue('missing-evidence', `知识点 ${contract.kpId} 没有可观察学习证据页面。`)
    if (!contract.learningGoal.trim() || !contract.successEvidence.trim()) {
      issue('learning-contract', `知识点 ${contract.kpId} 的学习目标或成功证据为空。`)
    }
  }

  return issues
}

export function blockingPagePlanIssues(planning: CoursePlanningState): PagePlanIssue[] {
  return auditCoursePlanningState(planning).filter(issue => issue.severity === 'blocking')
}

export function assertValidCoursePlanningState(planning: CoursePlanningState): void {
  const blocking = blockingPagePlanIssues(planning)
  if (blocking.length === 0) return
  throw new Error(`页面规划未通过：${blocking.map(issue => `${issue.code}:${issue.message}`).join('；')}`)
}

function normalize(value: string): string {
  return value.replace(/[\s，。；：、,.!！?？“”"'（）()【】\[\]]/g, '').toLowerCase()
}

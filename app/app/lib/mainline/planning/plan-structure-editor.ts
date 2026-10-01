import type { MainlineCourse } from '../domain.js'
import type { CoursePlanningState, LessonPagePlan } from './page-contract.js'
import { assertValidCoursePlanningState } from './page-audit.js'

export type PlanStructureOperation =
  | { type: 'move'; pageId: string; direction: 'up' | 'down' }
  | { type: 'delete'; pageId: string }
  | { type: 'insert-explanation'; afterPageId: string; learningAction: string; newInformation: string }
  | {
      type: 'split-explanation'
      pageId: string
      firstLearningAction: string
      firstNewInformation: string
      secondLearningAction: string
      secondNewInformation: string
    }

export function editDraftPlanStructure(
  course: MainlineCourse,
  operation: PlanStructureOperation,
): MainlineCourse {
  const planning = course.planning
  if (!planning) throw new Error('课程缺少页面规划。')
  if (planning.status !== 'planning') throw new Error('只有待确认的课程结构可以调整页面。')

  const units = pageUnits(planning.pages)
  const targetPageId = operation.type === 'insert-explanation' ? operation.afterPageId : operation.pageId
  const unitIndex = units.findIndex(unit => unit.some(page => page.id === targetPageId))
  if (unitIndex < 0) throw new Error(`课程结构中不存在页面 ${targetPageId}。`)
  const unit = units[unitIndex]!
  let nextPages: LessonPagePlan[]

  if (operation.type === 'insert-explanation') {
    const anchor = planning.pages.find(page => page.id === operation.afterPageId)!
    const inserted = explanationPage(planning, anchor, operation.learningAction, operation.newInformation)
    const anchorIndex = planning.pages.findIndex(page => page.id === anchor.id)
    nextPages = [...planning.pages.slice(0, anchorIndex + 1), inserted, ...planning.pages.slice(anchorIndex + 1)]
  } else if (operation.type === 'split-explanation') {
    const original = planning.pages.find(page => page.id === operation.pageId)!
    if (original.purpose !== 'explain' || original.contentSpec.kind !== 'explanation' || original.pairId) {
      throw new Error('只有独立的概念讲解页可以使用通用拆页。')
    }
    const first = {
      ...original,
      learningAction: required(operation.firstLearningAction, '拆分后第一页的学生任务不能为空。'),
      newInformation: required(operation.firstNewInformation, '拆分后第一页的新增信息不能为空。'),
      contentSpec: { ...original.contentSpec, focus: operation.firstNewInformation.trim() },
    }
    const second = explanationPage(planning, original, operation.secondLearningAction, operation.secondNewInformation)
    const originalIndex = planning.pages.findIndex(page => page.id === original.id)
    nextPages = [...planning.pages.slice(0, originalIndex), first, second, ...planning.pages.slice(originalIndex + 1)]
  } else if (operation.type === 'delete') {
    nextPages = planning.pages.filter(page => !unit.some(member => member.id === page.id))
    if (nextPages.length === 0) throw new Error('课程至少需要保留一张投影片。')
  } else {
    const targetIndex = operation.direction === 'up' ? unitIndex - 1 : unitIndex + 1
    if (targetIndex < 0 || targetIndex >= units.length) return course
    const target = units[targetIndex]!
    if (target[0]?.arcStepId !== unit[0]?.arcStepId) {
      throw new Error('页面只能在同一个教学步骤内调整顺序；跨步骤调整需要重新规划学习进程。')
    }
    const reordered = [...units]
    reordered[unitIndex] = target
    reordered[targetIndex] = unit
    nextPages = reordered.flat()
  }

  const nextPlanning = normalizePlanning(planning, nextPages)
  assertValidCoursePlanningState(nextPlanning)
  return { ...course, planning: nextPlanning }
}

function explanationPage(
  planning: CoursePlanningState,
  anchor: LessonPagePlan,
  learningAction: string,
  newInformation: string,
): LessonPagePlan {
  const sequence = planning.pages.reduce((max, page) => {
    const match = page.id.match(/:manual:(\d+)$/)
    return Math.max(max, match ? Number(match[1]) : 0)
  }, 0) + 1
  return {
    id: `${planning.planRevisionId}:manual:${sequence}`,
    order: 0,
    fragmentId: anchor.fragmentId,
    knowledgePointIds: [...anchor.knowledgePointIds],
    purpose: 'explain',
    audience: 'student',
    learningAction: required(learningAction, '新增页的学生任务不能为空。'),
    newInformation: required(newInformation, '新增页的新信息不能为空。'),
    sourceRefs: [...anchor.sourceRefs],
    contentSpec: { kind: 'explanation', focus: newInformation.trim(), requiredElements: ['概念', '依据'] },
    visualSpec: { required: false, form: 'none', reason: '教师尚未要求使用图像。', sourceAssetPolicy: 'none' },
    teacherCompanion: { scriptGoal: '讲清本页新增内容。', teachingMove: '先让学生表达，再核对概念与依据。', pace: 'normal' },
    arcStepId: anchor.arcStepId,
  }
}

function required(value: string, message: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(message)
  return normalized
}

function pageUnits(pages: readonly LessonPagePlan[]): LessonPagePlan[][] {
  const units: LessonPagePlan[][] = []
  const consumed = new Set<string>()
  for (const page of pages) {
    if (consumed.has(page.id)) continue
    const unit = page.pairId ? pages.filter(candidate => candidate.pairId === page.pairId) : [page]
    unit.forEach(member => consumed.add(member.id))
    units.push(unit)
  }
  return units
}

function normalizePlanning(
  planning: CoursePlanningState,
  pages: readonly LessonPagePlan[],
): CoursePlanningState {
  const normalizedPages = pages.map((page, index) => {
    const { previousPageId: _previousPageId, ...rest } = page
    return {
      ...rest,
      order: index + 1,
      ...(index === 0 ? {} : { previousPageId: pages[index - 1]!.id }),
    }
  })
  const activeStepIds = new Set(normalizedPages.map(page => page.arcStepId))
  const steps = planning.arc.steps
    .filter(step => activeStepIds.has(step.id))
    .map((step, index) => ({
      ...step,
      order: index + 1,
      pagePurposes: normalizedPages.filter(page => page.arcStepId === step.id).map(page => page.purpose),
    }))
  return { ...planning, arc: { ...planning.arc, steps }, pages: normalizedPages }
}

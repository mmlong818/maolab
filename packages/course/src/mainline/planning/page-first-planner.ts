import type { KnowledgeType } from '@maolab/shared-types'
import type { LessonGoal, SourceMaterialRef, SubjectId } from '../domain.js'
import {
  PAGE_PLAN_SCHEMA_VERSION,
  type CoursePlanningState,
  type LearningContract,
  type LessonArcPlan,
  type LessonArcStep,
  type LessonPagePlan,
  type TeacherCompanion,
  type VisualContract,
} from './page-contract.js'
import { pageSkeletonStepsFor } from './page-skeleton-library.js'
import {
  sourceMaterialByReference,
  sourceReferenceFor,
  sourceReferencesForKnowledgePoint,
} from './source-reference.js'

const COURSE_STRUCTURE_PAGE_CAPACITY = 5

export interface BuildCoursePlanningInput {
  courseId: string
  topic: string
  subject: SubjectId
  goals: readonly LessonGoal[]
  kps: ReadonlyArray<{
    id: string
    canonicalName: string
    knowledgeType?: KnowledgeType
    misconceptions?: readonly string[]
    learningObjectives?: readonly string[]
    needsReinforcement?: boolean
  }>
  sourceMaterial: readonly SourceMaterialRef[]
  planRevisionId?: string
  basedOnPlanRevisionId?: string
}

interface AddPageInput extends Omit<LessonPagePlan, 'id' | 'order' | 'audience' | 'previousPageId'> {
  id?: string
}

type AddPage = (page: AddPageInput) => LessonPagePlan

export function buildCoursePlanningState(input: BuildCoursePlanningInput): CoursePlanningState {
  const planRevisionId = input.planRevisionId ?? `${input.courseId}:plan:1`
  const learningContracts = buildLearningContracts(input)
  const arc = buildLessonArcPlan(input, learningContracts, planRevisionId)
  const pages = expandArcToPages(input, arc)

  return {
    schemaVersion: PAGE_PLAN_SCHEMA_VERSION,
    courseId: input.courseId,
    planRevisionId,
    status: 'planning',
    ...(input.basedOnPlanRevisionId ? { basedOnPlanRevisionId: input.basedOnPlanRevisionId } : {}),
    learningContracts,
    arc,
    pages,
  }
}

export function buildLessonArcPlan(
  input: BuildCoursePlanningInput,
  contracts: readonly LearningContract[],
  planRevisionId = input.planRevisionId ?? `${input.courseId}:plan:1`,
): LessonArcPlan {
  const steps: LessonArcStep[] = []
  const addStep = (step: Omit<LessonArcStep, 'id' | 'order'>): LessonArcStep => {
    const order = steps.length + 1
    const next: LessonArcStep = {
      ...step,
      id: `arc-${String(order).padStart(3, '0')}-${step.action}`,
      order,
    }
    steps.push(next)
    return next
  }

  addStep({
    fragmentId: 'fragment:course-opening',
    knowledgePointIds: [],
    goalIds: input.goals.map(goal => goal.id),
    action: 'orient',
    role: '提出学习问题',
    focus: input.topic,
    contentOutline: [input.topic],
    pagePurposes: ['orient'],
    sourceRefs: [],
  })

  const structureItems: Array<{ title: string; goalId?: string }> = [
    { title: '提出学习问题' },
    ...input.kps.flatMap(kp => {
      const contract = contracts.find(candidate => candidate.kpId === kp.id)
      if (!contract) return []
      return [{
        title: learningTaskLabel(contract.learningGoal),
        goalId: contract.goalId,
      }]
    }),
    { title: '迁移应用并修正' },
  ]
  for (let index = 0; index < structureItems.length; index += COURSE_STRUCTURE_PAGE_CAPACITY) {
    const group = structureItems.slice(index, index + COURSE_STRUCTURE_PAGE_CAPACITY)
    addStep({
      fragmentId: 'fragment:course-opening',
      knowledgePointIds: group.flatMap(item => {
        if (!item.goalId) return []
        const contract = contracts.find(candidate => candidate.goalId === item.goalId)
        return contract ? [contract.kpId] : []
      }),
      goalIds: group.flatMap(item => item.goalId ? [item.goalId] : []),
      action: 'map-course',
      role: `课程结构 ${Math.floor(index / COURSE_STRUCTURE_PAGE_CAPACITY) + 1}`,
      focus: group.map(item => item.title).join('、'),
      contentOutline: group.map(item => item.title),
      pagePurposes: ['structure'],
      sourceRefs: [],
    })
  }

  input.sourceMaterial.forEach((source, index) => {
    if (!source.excerpt?.trim()) return
    const ref = sourceReferenceFor(source, index)
    addStep({
      fragmentId: source.kpId ? fragmentIdForKp(source.kpId) : 'fragment:course-source',
      knowledgePointIds: source.kpId ? [source.kpId] : [],
      goalIds: contracts.flatMap(contract => contract.kpId === source.kpId ? [contract.goalId] : []),
      action: 'study-source',
      role: '阅读完整材料',
      focus: source.title,
      contentOutline: [source.title],
      pagePurposes: ['source'],
      sourceRefs: [ref],
      evidenceExpected: '学生能指出材料中的原文证据。',
    })
  })

  for (const kp of input.kps) {
    const contract = contracts.find(candidate => candidate.kpId === kp.id)
    if (!contract) throw new Error(`buildLessonArcPlan: 知识点 ${kp.id} 没有学习契约`)
    const misconceptions = normalizeStrings(kp.misconceptions ?? [])
    const objectives = [contract.learningGoal]
    let misconceptionIndex = 0
    let practiceIndex = 0
    for (const template of pageSkeletonStepsFor(kp)) {
      let focus = objectiveForStep(template.action, objectives, kp.canonicalName, practiceIndex)
      if (template.role.startsWith('误区核查')) {
        focus = misconceptions[misconceptionIndex] ?? `${kp.canonicalName}的典型错误说法`
        misconceptionIndex += 1
      } else if (template.role === '比较提问') {
        focus = `${kp.canonicalName}：浅问与追问的差别`
      } else if (template.action === 'practice-and-revise') {
        practiceIndex += 1
        if (practiceIndex > 1) focus = `${kp.canonicalName}（第 ${practiceIndex} 次练习）`
      }
      addStep({
        fragmentId: fragmentIdForKp(kp.id),
        knowledgePointIds: [kp.id],
        goalIds: [contract.goalId],
        action: template.action,
        role: template.role,
        focus,
        contentOutline: [learningTaskLabel(focus)],
        pagePurposes: [...template.pagePurposes],
        sourceRefs: [...contract.sourceEvidence],
        evidenceExpected: successEvidenceForStep(template.action, focus, contract.successEvidence),
      })
    }
  }

  addStep({
    fragmentId: 'fragment:course-closing',
    knowledgePointIds: input.kps.map(kp => kp.id),
    goalIds: input.goals.map(goal => goal.id),
    action: 'recap',
    role: '整理概念、证据和方法',
    focus: input.topic,
    contentOutline: contracts.map(contract => contract.learningGoal),
    pagePurposes: ['recap'],
    sourceRefs: input.sourceMaterial.flatMap((source, index) => (
      source.excerpt?.trim() ? [sourceReferenceFor(source, index)] : []
    )),
    evidenceExpected: '学生能说明至少一条结论及其依据。',
  })
  addStep({
    fragmentId: 'fragment:course-closing',
    knowledgePointIds: input.kps.map(kp => kp.id),
    goalIds: input.goals.map(goal => goal.id),
    action: 'transfer-and-revise',
    role: '完成迁移并修正',
    focus: input.topic,
    contentOutline: contracts.map(contract => contract.transferTarget),
    pagePurposes: ['transfer', 'feedback'],
    sourceRefs: [],
    evidenceExpected: '学生能在新材料或新情境中完成任务，并依据反馈修正。',
  })

  return { id: `${planRevisionId}:arc`, courseId: input.courseId, steps }
}

function buildLearningContracts(input: BuildCoursePlanningInput): LearningContract[] {
  return input.kps.map(kp => {
    const goal = input.goals.find(candidate => candidate.kpId === kp.id)
    if (!goal) throw new Error(`buildCoursePlanningState: 知识点 ${kp.id} 没有学习目标`)
    return {
      kpId: kp.id,
      goalId: goal.id,
      learningGoal: goal.statement,
      successEvidence: goal.successSignal,
      prerequisites: [],
      misconceptions: normalizeStrings(kp.misconceptions ?? []),
      sourceEvidence: sourceReferencesForKnowledgePoint(input.sourceMaterial, kp.id),
      transferTarget: `把“${learningTaskLabel(goal.statement)}”的方法用于一则新的同类材料。`,
    }
  })
}

function expandArcToPages(input: BuildCoursePlanningInput, arc: LessonArcPlan): LessonPagePlan[] {
  const pages: LessonPagePlan[] = []
  const addPage: AddPage = page => {
    const order = pages.length + 1
    const previousPage = pages.at(-1)
    const next: LessonPagePlan = {
      ...page,
      id: page.id ?? `lp-${String(order).padStart(3, '0')}-${page.purpose}`,
      order,
      audience: 'student',
      ...(previousPage ? { previousPageId: previousPage.id } : {}),
    }
    pages.push(next)
    return next
  }

  for (const step of arc.steps) {
    switch (step.action) {
      case 'orient':
        addPage({
          ...basePage(step),
          purpose: 'orient',
          learningAction: '明确本课学习问题，并先形成自己的初步判断。',
          newInformation: `呈现本课主题“${input.topic}”和学习问题。`,
          contentSpec: {
            kind: 'course-orientation',
            topic: input.topic,
            goalIds: [...step.goalIds],
            goalStatements: input.goals.map(goal => goal.statement),
          },
          visualSpec: visual('none', false, '开场只建立学习方向，不使用装饰性配图。'),
          teacherCompanion: companion('说明本课要解决的问题，不提前讲结论。', '收集学生的初步判断。', 'brief'),
        })
        break
      case 'map-course':
        addPage({
          ...basePage(step),
          purpose: 'structure',
          learningAction: '看清本课将依次完成的学习任务。',
          newInformation: `呈现课程结构：${step.contentOutline.join('、')}。`,
          contentSpec: { kind: 'course-structure', items: step.contentOutline.map(title => ({ title })) },
          visualSpec: visual('diagram', false, '使用顺序结构组织真实学习任务，不使用装饰图。'),
          teacherCompanion: companion('简要说明学习顺序，不解释生成过程。', '建立整堂课的学习预期。', 'brief'),
        })
        break
      case 'study-source': {
        const ref = step.sourceRefs[0]
        const source = ref ? sourceMaterialByReference(input.sourceMaterial, ref) : undefined
        if (!ref || !source) throw new Error(`expandArcToPages: 材料步骤 ${step.id} 缺少有效来源`)
        addPage({
          ...basePage(step),
          purpose: 'source',
          learningAction: '完整阅读材料，标出与本课问题有关的原文证据。',
          newInformation: `完整呈现“${source.title}”的学习材料。`,
          contentSpec: { kind: 'source-material', title: source.title, sourceRef: ref, preserveFullText: true },
          visualSpec: visual('source-text', true, '材料本身就是后续判断的证据，必须完整可读。', 'grounded-only'),
          teacherCompanion: companion('引导学生先读材料，不先给解释。', '确认学生已经定位原文证据。', 'deliberate'),
        })
        break
      }
      case 'observe': {
        const hasGroundedSource = step.sourceRefs.length > 0
        addPage({
          ...basePage(step),
          purpose: 'observe',
          learningAction: `围绕“${learningTaskLabel(step.focus)}”，圈画并记录可直接核对的证据。`,
          newInformation: hasGroundedSource
            ? `呈现完成“${learningTaskLabel(step.focus)}”所需的原文、材料或图像证据。`
            : `呈现完成“${learningTaskLabel(step.focus)}”所需的课堂材料或图像证据。`,
          contentSpec: {
            kind: 'observation',
            focus: learningTaskLabel(step.focus),
            requiredEvidence: hasGroundedSource
              ? '至少一条可指认的原文、材料或图像证据。'
              : '至少一条可指认的课堂材料或图像证据。',
          },
          visualSpec: observationVisual(input.subject, hasGroundedSource, step.focus),
          teacherCompanion: companion('只追问学生看见了什么，不提前归纳概念。', '收集可核对的观察证据。', 'deliberate'),
        })
        break
      }
      case 'explain':
        addPage({
          ...basePage(step),
          purpose: 'explain',
          learningAction: `用前页证据${explanationAction(step.focus)}。`,
          newInformation: `给出“${learningTaskLabel(step.focus)}”的核心结论、对应证据和适用边界。`,
          contentSpec: { kind: 'explanation', focus: learningTaskLabel(step.focus), requiredElements: ['核心表述', '对应证据', '适用边界'] },
          visualSpec: visual('diagram', false, '只有结构关系确实帮助理解时才使用图示。'),
          teacherCompanion: companion('把解释逐项指回学生已经看过的证据。', '形成可复述且有依据的核心解释。', 'deliberate'),
        })
        break
      case 'judge-and-revise':
        addQuestionAnswerPair(step, addPage)
        break
      case 'study-worked-example':
        addWorkedExamplePair(step, addPage, input.subject)
        break
      case 'practice-and-revise':
        addPracticeFeedbackPair(step, addPage, input.subject)
        break
      case 'recap':
        addPage({
          ...basePage(step),
          purpose: 'recap',
          learningAction: '用概念、证据和方法整理本课结论。',
          newInformation: '把各知识点的结论和依据组织成可迁移的整体。',
          contentSpec: { kind: 'recap', goalIds: [...step.goalIds], requiredElements: ['concept', 'evidence', 'method'] },
          visualSpec: visual('summary', false, '只在关系确实存在时使用结构图。'),
          teacherCompanion: companion('要求学生解释关系，不照读总结文字。', '收束概念、证据和方法。', 'normal'),
        })
        break
      case 'transfer-and-revise':
        addTransferFeedbackPair(step, addPage, input.subject)
        break
    }
  }
  return pages
}

function addQuestionAnswerPair(step: LessonArcStep, addPage: AddPage): void {
  const pairId = `${step.id}:pair`
  const promptGoal = step.role === '比较提问'
    ? `比较“${step.focus}”，先写出自己的判断依据。`
    : `判断“${step.focus}”是否成立，并引用本课证据。`
  const prompt = addPage({
    ...basePage(step), purpose: 'question', learningAction: promptGoal,
    newInformation: `只呈现“${step.focus}”的待判断问题，不显示结论。`,
    evidenceExpected: '学生先写下独立判断和依据。',
    contentSpec: { kind: 'question', promptGoal, answerPolicy: 'separate-following-page', responsePageId: '', materialRefs: [...step.sourceRefs] },
    visualSpec: visual('comparison', false, '问题页保留判断空间，不使用会暗示答案的视觉编码。'),
    teacherCompanion: companion('只确认学生已经作答，不评价对错。', '记录学生是否写出判断依据。', 'normal'),
    pairId, pairRole: 'prompt', layoutGroupId: pairId,
  })
  const response = addPage({
    ...basePage(step), purpose: 'answer', learningAction: '对照结论和证据，修正自己的判断。',
    newInformation: `给出“${step.focus}”的判断结论、可引用证据和纠错说明。`,
    contentSpec: { kind: 'answer', questionPageId: prompt.id, requiredElements: ['conclusion', 'evidence', 'correction'] },
    visualSpec: visual('comparison', false, '沿用问题页版位，原位增加结论和依据。'),
    teacherCompanion: companion('用可检查证据解释结论，不只报答案。', '让学生完成核对与修正。', 'deliberate'),
    pairId, pairRole: 'response', layoutGroupId: pairId,
  })
  if (prompt.contentSpec.kind === 'question') prompt.contentSpec.responsePageId = response.id
}

function addWorkedExamplePair(step: LessonArcStep, addPage: AddPage, subject: SubjectId): void {
  const pairId = `${step.id}:pair`
  const promptVisual = taskVisual(subject, step.focus, 'worked-example', '题面只显示完成任务所需的已知信息，不编码答案。')
  const responseVisual = promptVisual.required
    ? visual('instructional-image', true, '沿用问题页同一教学图，原位增加过程与依据。')
    : visual('worked-example', false, '沿用题目版位，逐步增加过程与依据。')
  const prompt = addPage({
    ...basePage(step), purpose: 'question', learningAction: '读清完整题面，先写出第一步判断或操作。',
    newInformation: `完整呈现“${step.focus}”的题面和作答要求，不显示过程答案。`,
    evidenceExpected: '学生能独立确定解题起点。',
    contentSpec: { kind: 'question', promptGoal: `完整呈现“${step.focus}”的题目，并要求学生先完成第一步。`, answerPolicy: 'separate-following-page', responsePageId: '', materialRefs: [...step.sourceRefs] },
    visualSpec: promptVisual,
    teacherCompanion: companion('确认学生理解题意并已形成第一步。', '记录学生采用的第一步。', 'normal'),
    pairId, pairRole: 'prompt', layoutGroupId: pairId,
  })
  const response = addPage({
    ...basePage(step), purpose: 'worked-step', learningAction: '逐步核对操作、依据和结果。',
    newInformation: `给出“${step.focus}”的完整分步过程，每一步都包含操作、依据和结果。`,
    contentSpec: { kind: 'worked-step', questionPageId: prompt.id, focus: step.focus, requiredElements: ['step', 'reason', 'result'] },
    visualSpec: responseVisual,
    teacherCompanion: companion('每一步先说依据，再显示结果。', '示范完整、可复查的过程。', 'deliberate'),
    pairId, pairRole: 'response', layoutGroupId: pairId,
  })
  if (prompt.contentSpec.kind === 'question') prompt.contentSpec.responsePageId = response.id
}

function addPracticeFeedbackPair(step: LessonArcStep, addPage: AddPage, subject: SubjectId): void {
  const pairId = `${step.id}:pair`
  const taskGoal = step.contentOutline[0] ?? learningTaskLabel(step.focus)
  const promptVisual = taskVisual(subject, taskGoal, 'practice-space', '只提供完成任务所需材料和充足作答空间。')
  const responseVisual = promptVisual.required
    ? visual('instructional-image', true, '沿用练习页同一教学图，原位增加反馈和修正依据。')
    : visual('practice-space', false, '沿用练习版位，原位增加反馈和修正依据。')
  const prompt = addPage({
    ...basePage(step), purpose: 'practice', learningAction: '独立完成任务，写下答案和依据。',
    newInformation: `呈现一道用于检验“${taskGoal}”的独立练习，不显示答案或反馈。`,
    evidenceExpected: `学生能完成“${taskGoal}”，写出可核对的答案和依据。`,
    contentSpec: { kind: 'practice', taskGoal, answerPolicy: 'separate-following-page', responsePageId: '', materialRefs: [...step.sourceRefs] },
    visualSpec: promptVisual,
    teacherCompanion: companion('等待学生完成，不用口头提示答案。', '记录学生是否写出答案和依据。', 'normal'),
    pairId, pairRole: 'prompt', layoutGroupId: pairId,
  })
  const response = addPage({
    ...basePage(step), purpose: 'feedback', learningAction: `依据“${taskGoal}”的成功标准核对答案，并写出需要修正的位置。`,
    newInformation: `给出“${taskGoal}”的成功标准、参考结论、证据和修改建议。`,
    contentSpec: { kind: 'feedback', questionPageId: prompt.id, requiredElements: ['success-criteria', 'conclusion', 'evidence', 'revision-action'] },
    visualSpec: responseVisual,
    teacherCompanion: companion('让学生逐条对照成功标准并完成修正。', '形成可追踪的反馈证据。', 'deliberate'),
    pairId, pairRole: 'response', layoutGroupId: pairId,
  })
  if (prompt.contentSpec.kind === 'practice') prompt.contentSpec.responsePageId = response.id
}

function addTransferFeedbackPair(step: LessonArcStep, addPage: AddPage, subject: SubjectId): void {
  const pairId = `${step.id}:pair`
  const promptVisual = taskVisual(subject, step.focus, 'practice-space', '只呈现完成迁移任务需要的新材料。')
  const responseVisual = promptVisual.required
    ? visual('instructional-image', true, '沿用迁移页同一教学图，原位增加结论和依据。')
    : visual('practice-space', false, '沿用迁移任务版位，原位增加结论和依据。')
  const prompt = addPage({
    ...basePage(step), purpose: 'transfer', learningAction: '面对新材料或新情境，独立完成同类判断或任务。',
    newInformation: '呈现与本课目标同型但材料不同的迁移任务，不显示答案。',
    evidenceExpected: '学生提交迁移任务的答案和依据。',
    contentSpec: { kind: 'transfer', taskGoal: step.contentOutline.join('；'), answerPolicy: 'separate-following-page', responsePageId: '', materialRefs: [...step.sourceRefs] },
    visualSpec: promptVisual,
    teacherCompanion: companion('不提示与例题的对应位置。', '收集独立迁移证据。', 'normal'),
    pairId, pairRole: 'prompt', layoutGroupId: pairId,
  })
  const response = addPage({
    ...basePage(step), purpose: 'feedback', learningAction: '依据结论和证据核对迁移任务，并修正原答案。',
    newInformation: '给出迁移任务的成功标准、参考结论、证据和修改建议。',
    contentSpec: { kind: 'feedback', questionPageId: prompt.id, requiredElements: ['success-criteria', 'conclusion', 'evidence', 'revision-action'] },
    visualSpec: responseVisual,
    teacherCompanion: companion('用成功标准组织反馈，要求学生说明修正原因。', '完成迁移任务闭环。', 'deliberate'),
    pairId, pairRole: 'response', layoutGroupId: pairId,
  })
  if (prompt.contentSpec.kind === 'transfer') prompt.contentSpec.responsePageId = response.id
}

function basePage(step: LessonArcStep): Pick<LessonPagePlan, 'fragmentId' | 'knowledgePointIds' | 'sourceRefs' | 'arcStepId'> & { evidenceExpected?: string } {
  return {
    fragmentId: step.fragmentId,
    knowledgePointIds: [...step.knowledgePointIds],
    sourceRefs: [...step.sourceRefs],
    arcStepId: step.id,
    ...(step.evidenceExpected ? { evidenceExpected: step.evidenceExpected } : {}),
  }
}

function visual(
  form: VisualContract['form'], required: boolean, reason: string,
  sourceAssetPolicy: VisualContract['sourceAssetPolicy'] = required ? 'grounded-or-generate' : 'none',
): VisualContract {
  return { required, form, reason, sourceAssetPolicy }
}

function observationVisual(subject: SubjectId, hasGroundedSource: boolean, focus: string): VisualContract {
  if (subject === 'chinese' || subject === 'english') {
    return hasGroundedSource
      ? visual('source-text', true, '语言学习的观察对象是本页可直接圈画和核对的原文或语料。', 'grounded-only')
      : visual('source-text', true, '没有可用教材原文时，使用明确标注的课堂自编短语料作为观察对象。', 'grounded-or-generate')
  }
  if (hasGroundedSource) {
    return visual('source-text', true, '教材原文或数据材料本身就是学生需要直接核查的对象。', 'grounded-only')
  }
  if (requiresPictorialEvidence(focus)) {
    return visual('instructional-image', true, '任务依赖形状、位置、方向或画面细节，必须提供可检查图像。')
  }
  return visual('source-text', true, '使用本页完整呈现的短材料或数据记录作为可核查对象。', 'grounded-or-generate')
}

function taskVisual(
  subject: SubjectId,
  focus: string,
  fallbackForm: VisualContract['form'],
  fallbackReason: string,
): VisualContract {
  if (requiresPictorialEvidence(focus)) {
    return visual('instructional-image', true, `${subject}任务依赖形状、位置、方向或画面细节，必须提供可检查图像。`)
  }
  return visual(fallbackForm, false, fallbackReason)
}

function requiresPictorialEvidence(focus: string): boolean {
  return /(?:图示|读图|图中|下图|地图|经纬网|坐标图|函数图像|几何图形|受力图|力的示意图|显微镜下|形态|结构图|分形)/.test(focus)
}

function companion(scriptGoal: string, teachingMove: string, pace: TeacherCompanion['pace']): TeacherCompanion {
  return { scriptGoal, teachingMove, pace }
}

function titleForKp(input: BuildCoursePlanningInput, kpId: string, fallback: string): string {
  return input.sourceMaterial.find(source => source.kpId === kpId)?.title
    ?? input.kps.find(kp => kp.id === kpId)?.canonicalName
    ?? fallback
}

function objectiveForStep(
  action: LessonArcStep['action'],
  objectives: readonly string[],
  fallback: string,
  practiceIndex: number,
): string {
  if (objectives.length === 0) return fallback
  if (action === 'observe') return objectives[0] ?? fallback
  if (action === 'explain') return objectives[Math.min(1, objectives.length - 1)] ?? fallback
  if (action === 'practice-and-revise') {
    return objectives[Math.min(practiceIndex + 2, objectives.length - 1)] ?? fallback
  }
  return objectives[0] ?? fallback
}

function learningTaskLabel(objective: string): string {
  const normalized = objective.trim().replace(/^能(?=[\p{Script=Han}A-Za-z0-9《“'"])/u, '')
  return normalized || objective.trim()
}

function explanationAction(objective: string): string {
  const target = learningTaskLabel(objective)
  if (/^理解/.test(target)) return `说明${target.slice(2)}`
  if (/^(?:解释|说明|分析|比较|概括|判断)/.test(target)) return target
  return `解释“${target}”`
}

function successEvidenceForStep(
  action: LessonArcStep['action'],
  focus: string,
  fallback: string,
): string {
  const target = learningTaskLabel(focus)
  switch (action) {
    case 'observe':
      return `学生能圈画并指出完成“${target}”所需的至少一处原文或材料证据。`
    case 'explain':
      return `学生能引用前页证据${explanationAction(target)}。`
    case 'judge-and-revise':
      return '学生能判断该说法是否成立，引用本课证据说明理由，并修正原判断。'
    case 'study-worked-example':
      return `学生能按操作、依据和结果完整说明“${target}”的过程。`
    case 'practice-and-revise':
      return `学生能完成“${target}”，写出可核对的依据，并根据反馈修正。`
    default:
      return fallback
  }
}

function fragmentIdForKp(kpId: string): string {
  return `fragment:${kpId}`
}

function normalizeStrings(values: readonly string[]): string[] {
  return values.map(value => value.trim()).filter(Boolean)
}

export const PAGE_PLAN_SCHEMA_VERSION = 'mainline-page-v2' as const

export type CourseRevisionStatus =
  | 'planning'
  | 'plan-approved'
  | 'generating'
  | 'review'
  | 'ready'
  | 'archived'

export type LessonPagePurpose =
  | 'orient'
  | 'structure'
  | 'source'
  | 'observe'
  | 'explain'
  | 'question'
  | 'answer'
  | 'worked-step'
  | 'practice'
  | 'feedback'
  | 'recap'
  | 'transfer'

export type LessonArcAction =
  | 'orient'
  | 'map-course'
  | 'study-source'
  | 'observe'
  | 'explain'
  | 'judge-and-revise'
  | 'study-worked-example'
  | 'practice-and-revise'
  | 'recap'
  | 'transfer-and-revise'

export interface LearningContract {
  kpId: string
  goalId: string
  learningGoal: string
  successEvidence: string
  prerequisites: string[]
  misconceptions: string[]
  sourceEvidence: string[]
  transferTarget: string
}

export interface LessonArcStep {
  id: string
  order: number
  fragmentId: string
  knowledgePointIds: string[]
  goalIds: string[]
  action: LessonArcAction
  role: string
  focus: string
  contentOutline: string[]
  pagePurposes: LessonPagePurpose[]
  sourceRefs: string[]
  evidenceExpected?: string
}

export interface LessonArcPlan {
  id: string
  courseId: string
  steps: LessonArcStep[]
}

export interface VisualContract {
  required: boolean
  form:
    | 'none'
    | 'source-text'
    | 'instructional-image'
    | 'diagram'
    | 'comparison'
    | 'worked-example'
    | 'practice-space'
    | 'summary'
  reason: string
  sourceAssetPolicy: 'none' | 'prefer-grounded' | 'grounded-or-generate' | 'grounded-only'
}

export interface TeacherCompanion {
  scriptGoal: string
  teachingMove: string
  pace: 'brief' | 'normal' | 'deliberate'
}

export interface CourseOrientationSpec {
  kind: 'course-orientation'
  topic: string
  goalIds: string[]
  goalStatements?: string[]
}

export interface CourseStructureSpec {
  kind: 'course-structure'
  items: Array<{ title: string; goalId?: string }>
}

export interface SourceMaterialSpec {
  kind: 'source-material'
  title: string
  sourceRef: string
  preserveFullText: true
}

export interface ObservationSpec {
  kind: 'observation'
  focus: string
  requiredEvidence: string
}

export interface ExplanationSpec {
  kind: 'explanation'
  focus: string
  requiredElements: string[]
}

export interface QuestionSpec {
  kind: 'question'
  promptGoal: string
  answerPolicy: 'separate-following-page'
  responsePageId: string
  materialRefs: string[]
}

export interface AnswerSpec {
  kind: 'answer'
  questionPageId: string
  requiredElements: Array<'conclusion' | 'evidence' | 'correction'>
}

export interface WorkedStepSpec {
  kind: 'worked-step'
  questionPageId: string
  focus: string
  requiredElements: Array<'step' | 'reason' | 'result'>
}

export interface PracticeSpec {
  kind: 'practice'
  taskGoal: string
  answerPolicy: 'separate-following-page'
  responsePageId: string
  materialRefs: string[]
}

export interface FeedbackSpec {
  kind: 'feedback'
  questionPageId: string
  requiredElements: Array<'success-criteria' | 'conclusion' | 'evidence' | 'revision-action'>
}

export interface RecapSpec {
  kind: 'recap'
  goalIds: string[]
  requiredElements: Array<'concept' | 'evidence' | 'method'>
}

export interface TransferSpec {
  kind: 'transfer'
  taskGoal: string
  answerPolicy: 'separate-following-page'
  responsePageId: string
  materialRefs: string[]
}

export type PageContentSpec =
  | CourseOrientationSpec
  | CourseStructureSpec
  | SourceMaterialSpec
  | ObservationSpec
  | ExplanationSpec
  | QuestionSpec
  | AnswerSpec
  | WorkedStepSpec
  | PracticeSpec
  | FeedbackSpec
  | RecapSpec
  | TransferSpec

export interface LessonPagePlan {
  id: string
  order: number
  fragmentId: string
  knowledgePointIds: string[]
  purpose: LessonPagePurpose
  audience: 'student'
  learningAction: string
  newInformation: string
  evidenceExpected?: string
  sourceRefs: string[]
  contentSpec: PageContentSpec
  visualSpec: VisualContract
  teacherCompanion: TeacherCompanion
  arcStepId: string
  pairId?: string
  pairRole?: 'prompt' | 'response'
  layoutGroupId?: string
  previousPageId?: string
}

export interface CoursePlanningState {
  schemaVersion: typeof PAGE_PLAN_SCHEMA_VERSION
  courseId: string
  planRevisionId: string
  status: CourseRevisionStatus
  basedOnPlanRevisionId?: string
  learningContracts: LearningContract[]
  arc: LessonArcPlan
  pages: LessonPagePlan[]
}

/**
 * 阶段 A 先建立版本契约。后续阶段会让四个消费端共同读取这里的 pages，
 * 而不是各自在展示层拆页。
 */
export interface CourseRevision<TPage = LessonPagePlan> {
  courseId: string
  revisionId: string
  planRevisionId: string
  status: CourseRevisionStatus
  basedOnRevisionId?: string
  pages: TPage[]
}

import { z } from 'zod'

const title = z.string().trim().min(2).max(80)
const shortText = z.string().trim().min(2).max(240)
const bodyText = z.string().trim().min(1).max(12_000)

function boundedText(max: number) {
  return z.string().trim().min(2).max(max)
}

function boundedList(
  minItems: number,
  maxItems: number,
  maxItemLength: number,
  maxTotalLength?: number,
): z.ZodType<string[]> {
  const schema = z.array(boundedText(maxItemLength)).min(minItems).max(maxItems)
  return maxTotalLength === undefined
    ? schema
    : schema.refine(items => items.reduce((sum, item) => sum + item.length, 0) <= maxTotalLength, {
        message: `列表文字合计不能超过 ${maxTotalLength} 字`,
      })
}

function boundedEvidence(maxItems: number, maxTextLength: number) {
  return z.array(z.object({
    text: boundedText(maxTextLength),
    sourceRef: z.string().trim().min(1).optional(),
  }).strict()).min(1).max(maxItems)
}

export const PageEvidenceSchema = z.object({
  text: shortText,
  sourceRef: z.string().trim().min(1).optional(),
}).strict()

export const TeacherCompanionContentSchema = z.object({
  script: z.string().trim().min(20).max(800),
  notes: z.array(shortText).max(3),
}).strict()

export const CourseOrientationContentSchema = z.object({
  kind: z.literal('course-orientation'),
  title,
  learningQuestion: z.string().trim().min(4).max(160),
  goals: z.array(shortText).min(1).max(8),
}).strict()

export const CourseStructureContentSchema = z.object({
  kind: z.literal('course-structure'),
  title,
  items: z.array(shortText).min(1).max(5),
}).strict()

export const SourceMaterialContentSchema = z.object({
  kind: z.literal('source-material'),
  title,
  body: bodyText,
  citation: z.string().trim().min(1).max(240).optional(),
}).strict()

export const ObservationContentSchema = z.object({
  kind: z.literal('observation'),
  title,
  prompt: z.string().trim().min(4).max(240),
  materialCaption: shortText.optional(),
  evidenceLabels: z.array(shortText).min(1).max(4),
}).strict()

export const ExplanationContentSchema = z.object({
  kind: z.literal('explanation'),
  title,
  coreStatement: z.string().trim().min(8).max(360),
  evidence: z.array(PageEvidenceSchema).min(1).max(5),
  boundary: z.string().trim().min(4).max(240),
}).strict()

export const QuestionContentSchema = z.object({
  kind: z.literal('question'),
  title,
  prompt: z.string().trim().min(6).max(90),
  materials: boundedList(0, 3, 140, 140),
  responseInstruction: z.string().trim().min(4).max(40),
}).strict()

export const AnswerContentSchema = z.object({
  kind: z.literal('answer'),
  title,
  conclusion: z.string().trim().min(4).max(60),
  evidence: boundedEvidence(2, 45),
  correction: z.string().trim().min(4).max(50),
}).strict()

export const WorkedStepContentSchema = z.object({
  kind: z.literal('worked-step'),
  title,
  steps: z.array(z.object({
    step: z.string().trim().min(2).max(240),
    reason: z.string().trim().min(2).max(240),
    result: z.string().trim().min(1).max(240),
  }).strict()).min(1).max(6),
}).strict()

export const PracticeContentSchema = z.object({
  kind: z.literal('practice'),
  title,
  prompt: z.string().trim().min(6).max(90),
  materials: boundedList(0, 3, 140, 140),
  responseInstruction: z.string().trim().min(4).max(40),
}).strict()

export const FeedbackContentSchema = z.object({
  kind: z.literal('feedback'),
  title,
  successCriteria: boundedList(1, 2, 18),
  conclusion: z.string().trim().min(4).max(70),
  evidence: boundedEvidence(3, 40),
  revisionAction: z.string().trim().min(4).max(35),
}).strict()

export const RecapContentSchema = z.object({
  kind: z.literal('recap'),
  title,
  concepts: boundedList(1, 3, 35),
  evidence: boundedEvidence(3, 35),
  methods: boundedList(1, 3, 35),
}).strict()

export const TransferContentSchema = z.object({
  kind: z.literal('transfer'),
  title,
  prompt: z.string().trim().min(6).max(90),
  materials: boundedList(1, 3, 140, 140),
  responseInstruction: z.string().trim().min(4).max(40),
}).strict()

export const VisiblePageContentSchema = z.discriminatedUnion('kind', [
  CourseOrientationContentSchema,
  CourseStructureContentSchema,
  SourceMaterialContentSchema,
  ObservationContentSchema,
  ExplanationContentSchema,
  QuestionContentSchema,
  AnswerContentSchema,
  WorkedStepContentSchema,
  PracticeContentSchema,
  FeedbackContentSchema,
  RecapContentSchema,
  TransferContentSchema,
])

export const PAGE_CONTENT_SCHEMAS = {
  'course-orientation': CourseOrientationContentSchema,
  'course-structure': CourseStructureContentSchema,
  'source-material': SourceMaterialContentSchema,
  observation: ObservationContentSchema,
  explanation: ExplanationContentSchema,
  question: QuestionContentSchema,
  answer: AnswerContentSchema,
  'worked-step': WorkedStepContentSchema,
  practice: PracticeContentSchema,
  feedback: FeedbackContentSchema,
  recap: RecapContentSchema,
  transfer: TransferContentSchema,
} as const

function unwrapProviderPage(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const page = (value as Record<string, unknown>).page
  return page && typeof page === 'object' && !Array.isArray(page) ? page : value
}

export function pageFillOutputSchema(kind: keyof typeof PAGE_CONTENT_SCHEMAS) {
  return z.preprocess(unwrapProviderPage, z.object({
    content: PAGE_CONTENT_SCHEMAS[kind],
    teacherCompanion: TeacherCompanionContentSchema,
  }).strict())
}

export const TeacherOnlyFillOutputSchema = z.preprocess(value => {
  const unwrapped = unwrapProviderPage(value)
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return unwrapped
  const teacherCompanion = (unwrapped as Record<string, unknown>).teacherCompanion
  return { teacherCompanion }
}, z.object({
  teacherCompanion: TeacherCompanionContentSchema,
}).strict())

import { describe, expect, it } from 'vitest'
import type { GradeBand, LessonPhase, SubjectId } from '../../domain.js'
import { auditMainlineCourse, blockingQualityIssues } from '../../quality-gates.js'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import type { SkeletonKpInput } from '../skeleton-library.js'

const GRADE_BANDS: readonly GradeBand[] = [
  'lower-primary',
  'upper-primary',
  'middle-school',
  'high-school',
]

const SUBJECTS: readonly SubjectId[] = [
  'chinese',
  'math',
  'science',
  'english',
  'history',
  'geography',
  'physics',
  'chemistry',
  'biology',
  'general',
]

const KNOWLEDGE_TYPES = ['factual', 'conceptual', 'procedural', 'metacognitive'] as const
const LESSON_PHASES: readonly LessonPhase[] = ['new', 'review', 'exam-prep']
const MISCONCEPTION_COUNTS = [0, 1, 3] as const
const REINFORCEMENT_STATES = [false, true] as const

function compileMatrixCourse(input: {
  sequence: number
  gradeBand: GradeBand
  subject: SubjectId
  lessonPhase: LessonPhase
  kps: SkeletonKpInput[]
}) {
  const { preset } = pickCastPreset(input)
  const groundingByKp = Object.fromEntries(input.kps.map(kp => [
    kp.id,
    {
      citation: `课程目录来源 pep-cn，节点 leaf-${kp.id}`,
      provenance: {
        source: 'pep-cn',
        externalId: `leaf-${kp.id}`,
        evidenceStatus: 'curriculum-metadata' as const,
      },
    },
  ]))

  return compileLessonFromKps({
    courseId: `matrix-course-${input.sequence}`,
    gradeBand: input.gradeBand,
    subject: input.subject,
    lessonPhase: input.lessonPhase,
    preset,
    kps: input.kps,
    groundingByKp,
  })
}

function blockingMessages(course: ReturnType<typeof compileMatrixCourse>): string[] {
  return blockingQualityIssues(auditMainlineCourse(course)).map(issue =>
    `${issue.targetType}:${issue.targetId}:${issue.message}`,
  )
}

describe('deterministic course generation matrix', () => {
  it('all grade, subject, knowledge-type, phase, misconception and reinforcement combinations compile without blockers', () => {
    let sequence = 0
    const failures: string[] = []
    const nonBlockingExamples = new Map<string, string[]>()

    for (const gradeBand of GRADE_BANDS) {
      for (const subject of SUBJECTS) {
        for (const knowledgeType of KNOWLEDGE_TYPES) {
          for (const lessonPhase of LESSON_PHASES) {
            for (const misconceptionCount of MISCONCEPTION_COUNTS) {
              for (const needsReinforcement of REINFORCEMENT_STATES) {
                sequence += 1
                const kpId = `kp-${sequence}`
                const misconceptions = Array.from(
                  { length: misconceptionCount },
                  (_, index) => `${knowledgeType} 教材误区 ${index + 1}`,
                )
                const course = compileMatrixCourse({
                  sequence,
                  gradeBand,
                  subject,
                  lessonPhase,
                  kps: [{
                    id: kpId,
                    canonicalName: `${subject} ${knowledgeType} 示例`,
                    knowledgeType,
                    ...(misconceptions.length > 0 ? { misconceptions } : {}),
                    ...(needsReinforcement ? { needsReinforcement: true } : {}),
                  }],
                })
                const issues = auditMainlineCourse(course)
                const messages = blockingQualityIssues(issues).map(issue =>
                  `${issue.targetType}:${issue.targetId}:${issue.message}`,
                )
                for (const issue of issues) {
                  if (issue.severity === 'blocking') continue
                  const key = `${issue.severity}:${issue.message}`
                  const examples = nonBlockingExamples.get(key) ?? []
                  if (examples.length < 3) {
                    const sceneType = course.scenes.find(scene => scene.id === issue.targetId)?.sceneType
                    examples.push([
                      gradeBand,
                      subject,
                      knowledgeType,
                      lessonPhase,
                      `misconceptions=${misconceptionCount}`,
                      `reinforcement=${needsReinforcement}`,
                      sceneType ?? issue.targetType,
                    ].join('/'))
                    nonBlockingExamples.set(key, examples)
                  }
                }
                if (messages.length > 0) {
                  failures.push([
                    gradeBand,
                    subject,
                    knowledgeType,
                    lessonPhase,
                    `misconceptions=${misconceptionCount}`,
                    `reinforcement=${needsReinforcement}`,
                    messages.join(' | '),
                  ].join(' / '))
                }
              }
            }
          }
        }
      }
    }

    expect(sequence).toBe(2_880)
    expect(failures).toEqual([])
    const expectedNonBlocking = new Set([
      'info:这节课全部幕都是「教师+AI 协同」执教,没有用到双师人机分工。',
      'info:课程只有教材目录定位，没有权威原文摘录。',
    ])
    expect([...nonBlockingExamples].filter(([message]) => !expectedNonBlocking.has(message))).toEqual([])
  })

  it('mixed four-knowledge-type courses compile across every grade, subject and phase without blockers', () => {
    let sequence = 10_000
    const failures: string[] = []

    for (const gradeBand of GRADE_BANDS) {
      for (const subject of SUBJECTS) {
        for (const lessonPhase of LESSON_PHASES) {
          sequence += 1
          const kps: SkeletonKpInput[] = KNOWLEDGE_TYPES.map((knowledgeType, index) => ({
            id: `mixed-${sequence}-${index}`,
            canonicalName: `${subject} ${knowledgeType} 混合知识点`,
            knowledgeType,
            misconceptions: [
              `${knowledgeType} 教材误区 1`,
              `${knowledgeType} 教材误区 2`,
              `${knowledgeType} 教材误区 3`,
            ],
            ...(index % 2 === 0 ? { needsReinforcement: true } : {}),
          }))
          const course = compileMatrixCourse({ sequence, gradeBand, subject, lessonPhase, kps })
          const messages = blockingMessages(course)
          if (messages.length > 0) {
            failures.push(`${gradeBand} / ${subject} / ${lessonPhase} / ${messages.join(' | ')}`)
          }
        }
      }
    }

    expect(failures).toEqual([])
  })
})

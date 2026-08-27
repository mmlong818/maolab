import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { createEmptyCard } from 'ts-fsrs'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import { buildReferenceMaterial } from '../pipeline/find-chapter.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan, QuizQuestion, QuizQuestionFsrs, QuizQuestionIRT } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const QuizOutputSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    type: z.enum(['multiple_choice', 'short_answer']),
    stem: z.string().min(1),
    options: z.array(z.string()).optional(),
    correctAnswers: z.array(z.string()),
    explanation: z.string(),
    concepts: z.array(z.string()),
  })).min(1).refine(
    questions => questions.every(q =>
      q.type !== 'multiple_choice' || (Array.isArray(q.options) && q.options.length >= 2),
    ),
    { message: 'multiple_choice questions must have at least 2 options' },
  ),
})

export class QuizWorker implements ContentWorker {
  readonly type = 'quiz' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const objectivesText = item.learningObjectives && item.learningObjectives.length > 0
      ? item.learningObjectives.map((o, i) => `${i + 1}. ${o}`).join('\n')
      : item.objective

    const { system, user } = buildPrompt(PROMPT_IDS.QUIZ, {
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      gradeLevel: plan.gradeLevel ?? 'not specified',
      learningObjectives: objectivesText,
      topic: profile.topic,
      domain: profile.domain,
      difficulty: profile.difficulty,
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      misconceptions: profile.misconceptions.join('; '),
      emphasizedConcepts: profile.emphasizedConcepts.join(', ') || 'none',
      teachingMethod: plan.teachingMethod,
      language: plan.language,
    })

    const reference = buildReferenceMaterial(item, plan)
    const finalUser = reference ? user + reference : user

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const output = await validatedGenerate(finalUser, QuizOutputSchema, boundCall, this.retryOptions)

    const questions: QuizQuestion[] = output.questions.map(q => {
      const card = createEmptyCard()
      const fsrs: QuizQuestionFsrs = {
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        ...(card.last_review !== undefined && { last_review: card.last_review.toISOString() }),
      }
      const irt: QuizQuestionIRT = {
        a: 1,
        b: 0,
        c: q.type === 'multiple_choice' ? 0.25 : 0,
      }
      const base: QuizQuestion = {
        id: q.id,
        type: q.type,
        stem: q.stem,
        correctAnswers: q.correctAnswers,
        explanation: q.explanation,
        concepts: q.concepts,
        fsrs,
        irt,
      }
      if (q.options !== undefined) {
        base.options = q.options
      }
      return base
    })

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'quiz',
      title: item.title,
      content: {
        type: 'quiz',
        questions,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}

import type { MainlineCourse } from './domain.js'
import {
  attachGenerationSession,
  cancelGenerationSession,
  createGenerationSession,
  failPageGeneration,
  markCourseAuditPassed,
  markTeacherAccepted,
  recoverInterruptedGeneration,
  resumeBlockedPage,
  startPageGeneration,
  type GenerationFailureKind,
  type GenerationSession,
} from './generation-session.js'
import { findMainlineCourse, saveMainlineCourse } from './store.js'

export type GenerationSessionCommand =
  | { action: 'create'; sessionId: string }
  | { action: 'start-page'; expectedUpdatedAt: string; pageId: string; inputHash: string }
  | { action: 'fail-page'; expectedUpdatedAt: string; pageId: string; kind: GenerationFailureKind; message: string }
  | { action: 'resume-page'; expectedUpdatedAt: string; pageId: string }
  | { action: 'recover'; expectedUpdatedAt: string }
  | { action: 'cancel'; expectedUpdatedAt: string }
  | { action: 'course-audit-passed'; expectedUpdatedAt: string }
  | { action: 'teacher-accepted'; expectedUpdatedAt: string }

export interface GenerationSessionPersistence {
  find(courseId: string): Promise<MainlineCourse | undefined>
  save(course: MainlineCourse): Promise<void>
}

export class GenerationSessionCommandError extends Error {
  constructor(
    readonly code: 'COURSE_NOT_FOUND' | 'SESSION_NOT_FOUND' | 'SESSION_CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationSessionCommandError'
  }
}

export interface GenerationSessionService {
  find(courseId: string): Promise<GenerationSession | undefined>
  execute(courseId: string, command: GenerationSessionCommand, now?: string): Promise<GenerationSession>
}

export function createGenerationSessionService(
  persistence: GenerationSessionPersistence,
): GenerationSessionService {
  const queues = new Map<string, Promise<void>>()

  async function serialized<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(courseId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current)
    queues.set(courseId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (queues.get(courseId) === tail) queues.delete(courseId)
    }
  }

  return {
    async find(courseId) {
      return (await persistence.find(courseId))?.generationSession
    },

    async execute(courseId, command, now = new Date().toISOString()) {
      return serialized(courseId, async () => {
        const course = await persistence.find(courseId)
        if (!course) {
          throw new GenerationSessionCommandError('COURSE_NOT_FOUND', `课程不存在：${courseId}`)
        }

        let session: GenerationSession
        if (command.action === 'create') {
          const existing = course.generationSession
          if (existing?.id === command.sessionId && existing.planRevisionId === course.planning?.planRevisionId) {
            return existing
          }
          if (existing && existing.status !== 'cancelled' && existing.status !== 'failed') {
            throw new GenerationSessionCommandError('SESSION_CONFLICT', '当前课程已有活动中的生成会话。')
          }
          session = createGenerationSession(course, command.sessionId, now)
        } else {
          const existing = course.generationSession
          if (!existing) {
            throw new GenerationSessionCommandError('SESSION_NOT_FOUND', '当前课程没有生成会话。')
          }
          if (existing.updatedAt !== command.expectedUpdatedAt) {
            throw new GenerationSessionCommandError(
              'SESSION_CONFLICT',
              '生成状态已被其他请求更新，请重新读取后再操作。',
            )
          }
          session = applyCommand(existing, command, now)
        }

        await persistence.save(attachGenerationSession(course, session))
        return session
      })
    },
  }
}

function applyCommand(
  session: GenerationSession,
  command: Exclude<GenerationSessionCommand, { action: 'create' }>,
  now: string,
): GenerationSession {
  switch (command.action) {
    case 'start-page':
      return startPageGeneration(session, command.pageId, command.inputHash, now)
    case 'fail-page':
      return failPageGeneration(session, command.pageId, command.kind, command.message, now)
    case 'resume-page':
      return resumeBlockedPage(session, command.pageId, now)
    case 'recover':
      return recoverInterruptedGeneration(session, now)
    case 'cancel':
      return cancelGenerationSession(session, now)
    case 'course-audit-passed':
      return markCourseAuditPassed(session, now)
    case 'teacher-accepted':
      return markTeacherAccepted(session, now)
  }
}

export const generationSessionService = createGenerationSessionService({
  find: findMainlineCourse,
  save: saveMainlineCourse,
})

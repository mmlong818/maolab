/**
 * Course store helper — Sprint 1
 *
 * 在 coursesV2 表上做读写 + 状态机守门。
 */

import { createDb, createCoursesV2Repository } from '@maolab/db'
import {
  canTransition,
  type CourseV2,
  type CourseStatusV2,
} from '@maolab/shared-types'

let _repo: ReturnType<typeof createCoursesV2Repository> | null = null

function getRepo() {
  if (_repo) return _repo
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  const dbPath = url.replace(/^file:/, '')
  const db = createDb(dbPath)
  _repo = createCoursesV2Repository(db)
  return _repo
}

export async function findCourse(id: string): Promise<CourseV2 | undefined> {
  return getRepo().find(id)
}

export async function saveCourse(course: CourseV2): Promise<void> {
  return getRepo().save({ ...course, updatedAt: Date.now() })
}

export async function listCourses(opts?: { status?: CourseStatusV2; limit?: number }) {
  return getRepo().list(opts)
}

export async function deleteCourse(id: string): Promise<void> {
  return getRepo().delete(id)
}

/** 状态推进守门 */
export async function transitionCourse(
  id: string,
  to: CourseStatusV2,
  mutator?: (c: CourseV2) => CourseV2,
): Promise<CourseV2> {
  const current = await findCourse(id)
  if (!current) throw new Error(`Course ${id} not found`)
  if (!canTransition(current.status, to)) {
    throw new Error(`Illegal transition: ${current.status} → ${to}`)
  }
  const next: CourseV2 = mutator ? mutator({ ...current, status: to }) : { ...current, status: to }
  await saveCourse(next)
  return next
}

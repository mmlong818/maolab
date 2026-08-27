/**
 * mainline course store — 重启主线 P1（server-only）
 *
 * 落库/取回 MainlineCourse。复用 courses_v2 表 + schemaKind 信封（见
 * @maolab/db mainline-course.sqlite）。
 *
 * ⚠️ 本文件依赖 DB，禁止从 `@/lib/mainline` barrel（index.ts）导出——否则会被
 * client 组件（StageCanvas 等）间接打进浏览器包。请直接 import '@/lib/mainline/store'。
 */

import { createDb, createMainlineCourseRepository, type MainlineCourseRepository } from '@maolab/db'
import type { MainlineCourse } from './domain.js'

let _repo: MainlineCourseRepository | null = null

function getRepo(): MainlineCourseRepository {
  if (_repo) return _repo
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _repo = createMainlineCourseRepository(createDb(url))
  return _repo
}

export async function findMainlineCourse(id: string): Promise<MainlineCourse | undefined> {
  const record = await getRepo().find(id)
  return record ? (record.payload as MainlineCourse) : undefined
}

export async function saveMainlineCourse(course: MainlineCourse): Promise<void> {
  await getRepo().save({
    id: course.id,
    title: course.topic,
    status: course.qualityStatus,
    payload: course,
  })
}

export interface ListedMainlineCourse {
  course: MainlineCourse
  /** 首次生成时间(ms) */
  createdAt: number | null
}

export async function listMainlineCourses(): Promise<ListedMainlineCourse[]> {
  const records = await getRepo().list()
  return records.map(record => ({ course: record.payload as MainlineCourse, createdAt: record.createdAt ?? null }))
}

export async function deleteMainlineCourse(id: string): Promise<void> {
  await getRepo().delete(id)
}

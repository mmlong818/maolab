/**
 * mainline course store（3a 改写自 maolab 同名文件与 season-store.ts）。
 *
 * 原件按 DATABASE_URL 打开 SQLite，复用 courses_v2 表的 schemaKind 信封；这里包一层已绑定 owner 的文档端口
 * （托管形态由 @maolab/domain 的 PgCourseDocuments.forOwner(owner) 提供，测试用 createMemoryCourseDocuments）。
 * 函数名与语义沿用原件：find / snapshot / save / CAS save / list / delete；课程季并入同一个仓储。
 */
import type { CourseDocumentStore } from '../ports.js'
import type { MainlineCourse } from './domain.js'
import type { Season } from './season.js'

export interface MainlineCourseSnapshot {
  course: MainlineCourse
  updatedAt: number
}

export interface ListedMainlineCourse {
  course: MainlineCourse
  /** 首次生成时间(ms) */
  createdAt: number | null
}

export interface MainlineCourseStore {
  findMainlineCourse(id: string): Promise<MainlineCourse | undefined>
  findMainlineCourseSnapshot(id: string): Promise<MainlineCourseSnapshot | undefined>
  saveMainlineCourse(course: MainlineCourse): Promise<void>
  saveMainlineCourseIfUnchanged(course: MainlineCourse, expectedUpdatedAt: number): Promise<boolean>
  listMainlineCourses(): Promise<ListedMainlineCourse[]>
  deleteMainlineCourse(id: string): Promise<void>
  findSeason(id: string): Promise<Season | undefined>
  saveSeason(season: Season): Promise<void>
  listSeasons(): Promise<Season[]>
}

/** 返回的对象方法不依赖 this，可以拆开传给迁入代码的 persistence 参数 */
export function createMainlineCourseStore(documents: CourseDocumentStore): MainlineCourseStore {
  const courseDocument = (course: MainlineCourse) => ({ id: course.id, title: course.topic, status: course.qualityStatus, payload: course })
  return {
    async findMainlineCourse(id) {
      const record = await documents.find('course', id)
      return record ? (record.payload as MainlineCourse) : undefined
    },
    async findMainlineCourseSnapshot(id) {
      const record = await documents.find('course', id)
      return record ? { course: record.payload as MainlineCourse, updatedAt: record.updatedAt } : undefined
    },
    async saveMainlineCourse(course) {
      await documents.save('course', courseDocument(course))
    },
    saveMainlineCourseIfUnchanged(course, expectedUpdatedAt) {
      return documents.saveIfUnchanged('course', courseDocument(course), expectedUpdatedAt)
    },
    async listMainlineCourses() {
      return (await documents.list('course')).map((record) => ({ course: record.payload as MainlineCourse, createdAt: record.createdAt }))
    },
    async deleteMainlineCourse(id) {
      await documents.delete('course', id)
    },
    async findSeason(id) {
      const record = await documents.find('season', id)
      return record ? (record.payload as Season) : undefined
    },
    async saveSeason(season) {
      await documents.save('season', { id: season.id, title: season.title, status: 'active', payload: season })
    },
    async listSeasons() {
      return (await documents.list('season')).map((record) => record.payload as Season)
    },
  }
}

/**
 * CAS 写入时课程已被其他写者更新（3a 终审）。课程会被多个写者同时写（3b 渲染 worker、3c 工具、3d 接口，可能在不同进程），
 * 生成服务的持久化一律按读到的版本 CAS（services/generation.ts），冲突时抛这个错误而不是覆盖。
 */
export class MainlineCourseWriteConflictError extends Error {
  readonly code = 'WRITE_CONFLICT'
  constructor(readonly courseId: string, message: string) {
    super(message)
    this.name = 'MainlineCourseWriteConflictError'
  }
}

/** 写冲突的有限重试次数：只用于"重读后重新合并"可安全重放的写（单页正文、失败记录、截图证据） */
export const COURSE_WRITE_CONFLICT_ATTEMPTS = 3

/** operation 必须自己重读课程、重新校验再写；写冲突时最多重放 COURSE_WRITE_CONFLICT_ATTEMPTS 次，仍冲突则抛出最后一次的冲突错误 */
export async function retryOnCourseWriteConflict<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof MainlineCourseWriteConflictError) || attempt >= COURSE_WRITE_CONFLICT_ATTEMPTS) throw error
    }
  }
}

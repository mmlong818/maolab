// 3d：api 运行时加载 @maolab/course（计划"已定事实"：api 自己持门面做轻操作，不经 harness）。
// api 本身由 tsx 运行（start 脚本与镜像 CMD），tsx 能处理迁入代码的参数属性与 ./x.js → .ts；说明符用变量，tsc 不把迁入源码拉进 api 的类型检查，
// 类型只取零 import 的 prep-facade-types（同 bundle）。只加载一次并缓存；并发的首次调用共用同一个加载，失败不缓存（同 bundle 的 cachedLoader）。
// 后备（实测不通时）：照 packages/bundle/src/prep/course-loader.ts 改用 tsx/esm/api 的 tsImport。
import type { PrepFacade, PrepFacadeDeps } from '@maolab/course/services/prep-facade-types'

export interface CourseApi {
  createPrepFacade(deps: PrepFacadeDeps): PrepFacade
  /** 4b：上课会话的课程大纲（packages/course 的 services/lesson-outline） */
  lessonOutlineOf(snapshot: unknown): { title: string; pageCount: number; text: string }
}

const COURSE_ENTRY: string = '@maolab/course'

/** 把一次性的异步加载包成"只加载一次"：进行中的加载被并发调用共用；失败后清掉缓存，下一次调用重新加载 */
export function cachedLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined
  return () => {
    if (!loading) {
      // async 包一层：load 同步抛错也变成被拒绝的 Promise，同样不缓存
      const attempt = (async () => load())()
      loading = attempt
      attempt.catch(() => { if (loading === attempt) loading = undefined })
    }
    return loading
  }
}

export const loadCourseApi: () => Promise<CourseApi> = cachedLoader(async () => (await import(COURSE_ENTRY)) as CourseApi)

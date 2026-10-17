// 运行时加载 @maolab/course（3c）。迁入的 maolab 代码有参数属性与 `./x.js` 指向 .ts 的导入，宿主的 --experimental-strip-types 吃不下；
// 这里用 tsx 的 tsImport 只对这一棵模块树做转换，不改全局 NODE_OPTIONS。只加载一次并缓存：
// runWithCourseRuntime 的 AsyncLocalStorage 必须与门面是同一份模块实例。并发的首次调用共用同一个加载；失败不缓存，下次重试。
// 何时加载由调用方决定：3c 裁决 F4 要求懒加载（首个备课工具调用时），service.ts 的 apply() 不加载。
// 类型只取零 import 的 prep-facade-types，不让 tsc 把迁入源码拉进 bundle 的类型检查。
import { tsImport } from 'tsx/esm/api'
import type { PrepDocumentStore, PrepFacade, PrepFacadeDeps } from '@maolab/course/services/prep-facade-types'

export interface CourseApi {
  createPrepFacade(deps: PrepFacadeDeps): PrepFacade
  createMemoryCourseDocuments(): PrepDocumentStore
}

const COURSE_ENTRY = '@maolab/course'

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

/** 只加载一次（同一份模块实例） */
export const loadCourseApi: () => Promise<CourseApi> = cachedLoader(() => tsImport(COURSE_ENTRY, import.meta.url) as Promise<CourseApi>)

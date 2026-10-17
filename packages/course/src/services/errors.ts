import type { EducationResourceBundle } from '../education-resources/catalog.js'
import type { MainlineCourseStore } from '../mainline/store.js'
import type { CourseKnowledgePort } from '../ports.js'

export type CourseServiceErrorCode = 'INVALID_INPUT' | 'UNKNOWN_KP' | 'UNKNOWN_SEASON' | 'SEASON_MISMATCH' | 'COURSE_NOT_FOUND' | 'PLAN_CONFLICT'

/** 3d 的 HTTP 映射：INVALID_INPUT/UNKNOWN_KP/UNKNOWN_SEASON/SEASON_MISMATCH → 400，COURSE_NOT_FOUND → 404，PLAN_CONFLICT → 409（同 maolab 路由） */
export class CourseServiceError extends Error {
  readonly code: CourseServiceErrorCode
  readonly details: Record<string, unknown> | undefined
  constructor(code: CourseServiceErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CourseServiceError'
    this.code = code
    this.details = details
  }
}

export interface CourseServiceDeps {
  /** 已绑定当前 owner 的仓储（owner 只来自已鉴权身份） */
  store: MainlineCourseStore
  knowledge: CourseKnowledgePort
  /** 授权教育资源包；缺省视为不可用（用户裁决 D9 前不部署），建课按 maolab 原有降级只舍弃配图候选 */
  loadResourceBundle?: () => Promise<EducationResourceBundle>
  /** 测试用：固定新课程 id */
  newId?: () => string
}

export function resourceBundleLoader(deps: Pick<CourseServiceDeps, 'loadResourceBundle'>): () => Promise<EducationResourceBundle> {
  return deps.loadResourceBundle ?? (async () => { throw new Error('教育资源包未配置') })
}

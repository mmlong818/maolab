/**
 * apps/web 渲染页与 workers/render 之间的约定（3b）。本文件不 import 任何模块：渲染页（浏览器）与 worker（Node）都直接用它。
 * - 渲染页只从 projectionRenderDataPath(courseId) 取 { contract, course }；生产上没有这个接口，worker 在浏览器里拦截它并按任务 owner 供数。
 * - 页面里的产物图片地址统一为 /api/prep/artifacts/<id>（3d 实现按 owner 鉴权的下载；worker 同样在浏览器里拦截供数）。
 * contract 变化时（数据形状变了）加 1：渲染页与 worker 版本不一致会在页面上显式报错，而不是截出错误的画面。
 */
export const PROJECTION_RENDER_CONTRACT = 1
export const PROJECTION_RENDER_PAGE_PATH = '/prep/render/'
export const PROJECTION_RENDER_DATA_PREFIX = '/api/prep/render/'
/** 与 @maolab/domain 的 COURSE_ARTIFACT_URL_PREFIX 同值（tests/projection.test.ts 校验） */
export const COURSE_ARTIFACT_PREFIX = '/api/prep/artifacts/'

export interface ProjectionRenderData {
  contract: number
  course: unknown
}

export function projectionRenderUrl(origin: string, courseId: string, pageNumber: number): string {
  const params = new URLSearchParams({ course: courseId, page: String(pageNumber), export: '1' })
  return `${origin.replace(/\/+$/, '')}${PROJECTION_RENDER_PAGE_PATH}?${params.toString()}`
}

export function projectionRenderDataPath(courseId: string): string {
  return `${PROJECTION_RENDER_DATA_PREFIX}${encodeURIComponent(courseId)}/`
}

export function parseProjectionRenderDataPath(pathname: string): string | undefined {
  const match = /^\/api\/prep\/render\/([^/]+)\/?$/.exec(pathname)
  if (!match) return undefined
  try {
    const id = decodeURIComponent(match[1]!)
    return id.trim() ? id : undefined
  } catch {
    return undefined
  }
}

export function courseArtifactUrl(artifactId: string): string {
  return `${COURSE_ARTIFACT_PREFIX}${artifactId}`
}

export function parseCourseArtifactPath(pathname: string): string | undefined {
  return /^\/api\/prep\/artifacts\/(ar_[0-9a-f]{40})\/?$/.exec(pathname)?.[1]
}

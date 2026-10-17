// 任务错误分类（3b 已定事实"render-page 的语义"）：可重试的回到队列，不可重试的直接失败。内部错误不带原文（可能含路径），只记错误名。
import { GenerationRenderRunError, MainlineCourseWriteConflictError, ProjectionExportNotReadyError } from '@maolab/course'
import { ArtifactRejectedError, type RenderJobError } from '@maolab/domain'
import { ProjectionPageError } from './capture.ts'

/**
 * worker 自己定义的任务错误（不在渲染契约里）：
 * - PAGE_NOT_NEXT（Ruling [T8/T9/T12]）：任务点名的页还在等截图，但不是会话里下一张待截的页；可重试，退避后再领
 * - PAGE_NOT_FOUND（终审 I1）：任务缺 pageId，或会话里没有这页（如计划修订后的旧任务）；不可重试
 * - RENDER_DATA_FAILED：采集期间拦截供数的数据源抛错（拦截层回了 500）；页面看到的是坏图或取数失败，
 *   截图与度量都不可信，不写证据，按存储异常可重试
 */
export class RenderWorkerError extends Error {
  readonly code: 'PAGE_NOT_NEXT' | 'PAGE_NOT_FOUND' | 'RENDER_DATA_FAILED'
  readonly retryable: boolean
  readonly details: unknown

  constructor(code: RenderWorkerError['code'], message: string, retryable: boolean, details?: unknown) {
    super(message)
    this.name = 'RenderWorkerError'
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}

export function classifyRenderError(error: unknown): RenderJobError {
  if (error instanceof RenderWorkerError) return { code: error.code, message: error.message, retryable: error.retryable, ...(error.details === undefined ? {} : { details: error.details }) }
  if (error instanceof ProjectionExportNotReadyError) return { code: 'NOT_READY', message: error.message, retryable: false, details: { blockers: error.blockers } }
  if (error instanceof GenerationRenderRunError) return { code: error.code, message: error.message, retryable: false }
  if (error instanceof MainlineCourseWriteConflictError) return { code: 'WRITE_CONFLICT', message: '课程在截图期间被其他写入更新，稍后重试。', retryable: true }
  if (error instanceof ProjectionPageError) return { code: error.code, message: error.message, retryable: error.code === 'RENDER_TIMEOUT' }
  if (error instanceof ArtifactRejectedError) return { code: error.code, message: error.message, retryable: false }
  // 导航阶段的网络错误（Playwright 抛普通 Error，消息含 net::ERR_*，如页面源暂时不可达）：可重试，只留错误名，不留含内网地址的原文
  const net = error instanceof Error ? /net::(ERR_[A-Z0-9_]+)/.exec(error.message)?.[1] : undefined
  if (net) return { code: 'RENDER_NAVIGATION_FAILED', message: '渲染页打不开（页面源网络错误），将重试。', retryable: true, details: { net } }
  return { code: 'RENDER_INTERNAL', message: '渲染 worker 内部错误（浏览器或存储异常），将重试。', retryable: true, details: { name: error instanceof Error ? error.name : typeof error } }
}

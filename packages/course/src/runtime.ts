/**
 * 备课域的模型与图像通道（3a）。
 *
 * 迁入的 maolab 代码在模块顶层调用 callLLMJson / generateImage；托管形态里每次调用都必须用"当前老师的会话凭证"，
 * 不能有进程级的全局密钥（spec 11 第 3 条）。这里用 AsyncLocalStorage 把通道绑定到一次调用链上：
 * 调用方在 runWithCourseRuntime 里执行 fn，fn 内（含其中的 await 与并发分支）取到的都是这次给的通道。
 * 没有通道就抛 CourseRuntimeMissingError，不读环境变量、不出网。
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface LlmJsonRequest {
  system?: string
  user: string
  temperature: number
  timeoutMs: number
  signal: AbortSignal
  attempt: number
}

export interface CourseLlmTransport {
  /** 返回助手消息正文（期望是 JSON 文本）。HTTP 失败抛错，错误消息里带 `HTTP <status>`，callLLMJson 据此决定退避时长。 */
  completeJson(request: LlmJsonRequest): Promise<string>
}

export interface CourseImageRequest {
  size: string
}

export interface CourseImageTransport {
  /** 返回可显示的图片地址（3b 起为产物存储地址） */
  generate(prompt: string, request: CourseImageRequest): Promise<string>
}

export interface CourseAssetInput {
  bytes: Uint8Array
  contentType: string
  /** 建议文件名（只作记录与排查，不决定存放位置） */
  name: string
}

/** 产物存储写入口（3b）：3c 的工具用 @maolab/domain 的 courseAssetSinkFor(owner 的产物仓储, courseId) 实现，返回可显示地址 */
export interface CourseAssetSink {
  put(input: CourseAssetInput): Promise<string>
}

export interface CourseRuntime {
  llm?: CourseLlmTransport
  image?: CourseImageTransport
  assets?: CourseAssetSink
  /** 重试退避的等待；测试注入立即返回的实现 */
  sleep?: (ms: number) => Promise<void>
}

export type CourseRuntimeMissingCode = 'COURSE_LLM_MISSING' | 'COURSE_IMAGE_MISSING' | 'COURSE_ASSETS_MISSING'

const MISSING_MESSAGES: Record<CourseRuntimeMissingCode, string> = {
  COURSE_LLM_MISSING: '备课模型通道未配置：必须在 runWithCourseRuntime 内调用，不回退到任何全局密钥。',
  COURSE_IMAGE_MISSING: '备课图像通道未配置。',
  COURSE_ASSETS_MISSING: '备课产物存储未配置。',
}

export class CourseRuntimeMissingError extends Error {
  readonly code: CourseRuntimeMissingCode
  constructor(code: CourseRuntimeMissingCode) {
    super(MISSING_MESSAGES[code])
    this.name = 'CourseRuntimeMissingError'
    this.code = code
  }
}

const storage = new AsyncLocalStorage<CourseRuntime>()

export function runWithCourseRuntime<T>(runtime: CourseRuntime, fn: () => Promise<T>): Promise<T> {
  return storage.run(runtime, fn)
}

export function currentCourseRuntime(): CourseRuntime | undefined {
  return storage.getStore()
}

export function requireCourseLlm(): CourseLlmTransport {
  const llm = storage.getStore()?.llm
  if (!llm) throw new CourseRuntimeMissingError('COURSE_LLM_MISSING')
  return llm
}

export function requireCourseImage(): CourseImageTransport {
  const image = storage.getStore()?.image
  if (!image) throw new CourseRuntimeMissingError('COURSE_IMAGE_MISSING')
  return image
}

export function requireCourseAssets(): CourseAssetSink {
  const assets = storage.getStore()?.assets
  if (!assets) throw new CourseRuntimeMissingError('COURSE_ASSETS_MISSING')
  return assets
}

export function courseSleep(ms: number): Promise<void> {
  const sleep = storage.getStore()?.sleep
  return sleep ? sleep(ms) : new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * v2 LLM helper（3a 改写自 maolab app/app/lib/v2/llm.ts）。
 *
 * 原样保留：调用签名、JSON 抽取、schema 校验与 answer 包装解开、校验失败时把错误附在下一次提示后、
 * 429/5xx 长退避与普通错误短退避、单次超时。
 * 改动：模型通道改为 runWithCourseRuntime 注入（没有通道抛 CourseRuntimeMissingError，不重试、不出网）；
 * 删除按环境变量选择提供方与密钥的配置、命令行订阅路径、失败原文写入 logs/ 的调试落盘；
 * 正文一律先 extractJsonFromText 再解析（原 HTTP 路径直接 JSON.parse，命令行路径先抽取，见 3a 报告）。
 */
import { z } from 'zod'
import { courseSleep, CourseRuntimeMissingError, requireCourseLlm } from '../runtime.js'

function extractJsonFromText(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed
  // 去掉 ```json fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim()
  // 退一步：找第一个 { 或 [ 起到最后一个 } 或 ]
  const firstObj = trimmed.indexOf('{')
  const firstArr = trimmed.indexOf('[')
  const start = (firstObj === -1) ? firstArr : (firstArr === -1 ? firstObj : Math.min(firstObj, firstArr))
  if (start < 0) return trimmed
  const lastObj = trimmed.lastIndexOf('}')
  const lastArr = trimmed.lastIndexOf(']')
  const end = Math.max(lastObj, lastArr)
  if (end <= start) return trimmed
  return trimmed.slice(start, end + 1)
}

function retryPrompt(user: string, feedback: string): string {
  if (!feedback) return user
  return [
    user,
    '',
    '上一版输出未通过 JSON 结构校验。',
    `校验结果：${feedback}`,
    '请重新输出完整对象并严格匹配要求。不要解释错误，不要沿用错误字段，不要省略必填字段。',
  ].join('\n')
}

function schemaFeedback(error: unknown): string {
  if (!(error instanceof z.ZodError)) return '输出不是合法 JSON，请检查字符串引号、转义符、逗号和括号。'
  return error.issues
    .slice(0, 6)
    .map(issue => `${issue.path.join('.') || 'output'}：${issue.message}`)
    .join('；')
    .slice(0, 800)
}

function parseStructuredOutput<T>(schema: z.ZodSchema, parsed: unknown): T {
  const direct = schema.safeParse(parsed)
  if (direct.success) return direct.data as T

  // Some OpenAI-compatible providers wrap JSON mode output in a single
  // `answer` object even when the prompt asks for the schema at the top level.
  // Only unwrap that exact shape, so schemas that legitimately contain an
  // `answer` field keep their original semantics.
  if (
    parsed !== null
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && Object.keys(parsed).length === 1
    && 'answer' in parsed
  ) {
    const wrapped = schema.safeParse((parsed as { answer: unknown }).answer)
    if (wrapped.success) return wrapped.data as T
  }

  throw direct.error
}

export interface CallLLMOptions {
  /** 系统提示（可选） */
  system?: string
  /** 用户提示（必填） */
  user: string
  /** 期望 JSON schema（必填）— 用 Zod 校验 + 失败重试 */
  schema: z.ZodSchema
  /** 重试次数（含首次） */
  maxAttempts?: number
  /** 温度 */
  temperature?: number
  /** 超时秒 */
  timeoutSec?: number
}

export async function callLLMJson<T>(opts: CallLLMOptions): Promise<T> {
  const transport = requireCourseLlm()
  const maxAttempts = opts.maxAttempts ?? 3
  const timeoutMs = (opts.timeoutSec ?? 90) * 1000
  const temperature = opts.temperature ?? 0.4

  let lastErr: unknown
  let validationFeedback = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const content = await transport.completeJson({
        ...(opts.system ? { system: opts.system } : {}),
        user: retryPrompt(opts.user, validationFeedback),
        temperature,
        timeoutMs,
        signal: controller.signal,
        attempt,
      })
      if (!content) throw new Error('Empty LLM response')
      let parsed: unknown
      try { parsed = JSON.parse(extractJsonFromText(content)) }
      catch (e) {
        validationFeedback = schemaFeedback(e)
        throw e
      }
      try { return parseStructuredOutput<T>(opts.schema, parsed) }
      catch (e) {
        validationFeedback = schemaFeedback(e)
        throw e
      }
    } catch (err) {
      if (err instanceof CourseRuntimeMissingError) throw err
      lastErr = err
      if (attempt < maxAttempts) {
        // 429/5xx 限流退避要够长(QPM 窗口按分钟计), 普通错误短等
        const rateLimited = /HTTP (429|5\d\d)/.test(String(err))
        await courseSleep(rateLimited ? 20_000 * attempt : 1000 * attempt)
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`callLLMJson failed after ${maxAttempts} attempts: ${String(lastErr)}`)
}

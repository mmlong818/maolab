// 工具内的模型与图像通道（3c）：只用当前会话的云一凭证，没有站点密钥（spec 11 第 3 条，用户裁决 D7）。
// 模型：经 dsh 的 llm 运行时走 yunyi 适配器并显式带 sessionId（空 sessionId 直接报错，不让适配器退回 ALS 发起者）——
//   凭证与 preset 预算都由适配器按会话解析：reasoning_effort 一定生效；
//   max_tokens 这里不传，但 dsh-llm 的 LlmRuntime.adapterStream 在 maxTokens 缺省时先填入 resolveModel 的 defaultMaxTokens
//   （dsh-llm lib/index.js resolveCallWithInfo），适配器见到等于全局缺省的值再换成 preset 的 max_tokens（llm-yunyi.ts:196-201），
//   按源码 preset 的 max_tokens 也会套上——与 3c 裁决 F5 的说法相反，以 Task 9 假网关记录的 maxTokens 实测为准。
//   用量以 usage 块回传；无凭证时适配器在发请求前抛 MISSING_CREDENTIAL（apps/harness/src/llm-yunyi.ts:183-186）。
//   工具层在此之前还会先判凭证（service.ts 的 runtime() 返回 undefined），这里是第二道。
// 传输失败（审查 I2 与修复轮）：超时、取消、网络/网关不可用、认证失败分别抛 PrepModelTimeoutError、AbortError、
//   PrepModelNetworkError、PrepModelAuthError，消息一律以 "[prep-transport:<kind>] " 开头。迁入的生成器把模型异常吞成闸门理由、
//   只留下文案，门面（packages/course/src/services/prep-facade.ts 的 TRANSPORT_MARKER）靠这个前缀认出传输失败；两边的字面量要一起改。
//   认证失败后同一通道不再出网；已取消时的尝试直接短路；短路的尝试不计入用量。
// 图像：适配器只有对话接口，图像请求用网关登记表里本会话的凭证直接发 /images/generations；只收 b64_json，不替网关去拉外链图片；
//   响应有大小上限、请求有超时，认不出格式（含空数据）一律拒绝。
//   没有配置图像模型时图像不可用（用户裁决 D3 缺省），门面在调用前已挡住；这里再抛一次明确的错误。
import type { PrepAssetInput, PrepLlmRequest, PrepRuntime } from '@maolab/course/services/prep-facade-types'

export interface ModelMeter {
  calls: number
  failures: number
  ms: number
  inputTokens: number
  outputTokens: number
  imageCalls: number
}

export function newModelMeter(): ModelMeter {
  return { calls: 0, failures: 0, ms: 0, inputTokens: 0, outputTokens: 0, imageCalls: 0 }
}

export interface LlmStreamOptions {
  provider: string
  model: string
  sessionId: string
  system?: string
  messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>
  temperature?: number
  signal?: AbortSignal
}

export interface LlmStreamChunk {
  type: string
  text?: string
  usage?: { inputTokens?: number; outputTokens?: number }
  reason?: { kind?: string; failure?: unknown }
}

/** ctx.llm 的最小结构（dsh-llm 的 LlmRuntime.stream） */
export interface LlmStreamer {
  stream(options: LlmStreamOptions): AsyncIterable<LlmStreamChunk>
}

export const PREP_IMAGES_UNAVAILABLE = '备课图像通道不可用：云一网关没有配置图像模型（YUNYI_PREP_IMAGE_MODEL 为空）。'
export const PREP_IMAGE_NO_CREDENTIAL = '备课图像通道不可用：当前会话没有云一凭证。'

export type PrepTransportKind = 'timeout' | 'abort' | 'network' | 'auth'

const TRANSPORT_ERROR_NAMES: Record<PrepTransportKind, string> = {
  timeout: 'PrepModelTimeoutError',
  abort: 'AbortError',
  network: 'PrepModelNetworkError',
  auth: 'PrepModelAuthError',
}

/** 传输失败：name 按种类区分，message 带 "[prep-transport:<kind>] " 前缀（门面按前缀识别） */
export class PrepTransportError extends Error {
  readonly kind: PrepTransportKind
  constructor(kind: PrepTransportKind, detail: string, options?: { cause?: unknown }) {
    super(`[prep-transport:${kind}] ${detail}`, options)
    this.kind = kind
    this.name = TRANSPORT_ERROR_NAMES[kind]
  }
}

function failureText(failure: unknown): string {
  if (failure instanceof Error) return failure.message
  const message = (failure as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : JSON.stringify(failure ?? null)
}

function failureCode(failure: unknown): unknown {
  return ((failure ?? {}) as { code?: unknown }).code
}

function failureStatus(failure: unknown): number {
  const status = ((failure ?? {}) as { status?: unknown }).status
  return typeof status === 'number' ? status : Number(/HTTP (\d{3})/.exec(failureText(failure))?.[1] ?? NaN)
}

/** 网关或网络不可用：dsh 的 NETWORK 码、408/429/5xx（400 这类请求错误不算） */
function unavailable(failure: unknown): boolean {
  if (failureCode(failure) === 'NETWORK') return true
  const status = failureStatus(failure)
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
}

/** 认证失败：401/403、会话没有凭证、会话与发起者身份不一致（llm-yunyi.ts 的 AUTH、MISSING_CREDENTIAL、IDENTITY_MISMATCH） */
const AUTH_CODES: ReadonlySet<unknown> = new Set(['AUTH', 'MISSING_CREDENTIAL', 'IDENTITY_MISMATCH', 'INVALID_CREDENTIAL'])

function authFailure(failure: unknown): boolean {
  if (AUTH_CODES.has(failureCode(failure))) return true
  const status = failureStatus(failure)
  return status === 401 || status === 403
}

/**
 * 被中止时区分：工具被取消（exec.signal）记 abort；只有本次尝试的超时信号触发记 timeout；
 * 两个信号都没触发（dsh 自己中止，如关停）不是老师取消，记 network（审查 B）
 */
function abortError(tool: AbortSignal, attempt: AbortSignal, cause?: unknown): PrepTransportError {
  if (tool.aborted) return new PrepTransportError('abort', '模型调用已取消。', { cause })
  if (attempt.aborted) return new PrepTransportError('timeout', '模型调用超时。', { cause })
  return new PrepTransportError('network', '模型调用被运行时中止。', { cause })
}

/**
 * callLLMJson 两次尝试之间的退避（PrepRuntime.sleep，service 的 runtime() 用 exec.signal 接上）：工具被取消时立即结束（审查 A）。
 * 结束而不是抛错——退避在 callLLMJson 的 catch 里，抛错会盖掉原来的失败；下一次尝试会因信号已中止直接短路
 */
export function sessionSleep(signal: AbortSignal): (ms: number) => Promise<void> {
  return (ms) => new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export function sessionCourseLlm(input: { llm: LlmStreamer; sessionId: string; model: string; signal: AbortSignal; meter: ModelMeter; now?: () => number }): NonNullable<PrepRuntime['llm']> {
  if (!input.sessionId.trim()) throw new Error('sessionCourseLlm: sessionId 不能为空（空值会让适配器退回 ALS 发起者）。')
  const now = input.now ?? Date.now
  // 认证失败后同一工具调用里不再出网：callLLMJson 照样会再试，直接抛同一个错误（修复轮裁决：auth 不重试）
  let authFailed: PrepTransportError | undefined
  return {
    async completeJson(request: PrepLlmRequest): Promise<string> {
      // 短路的尝试不出网，也不计 calls、failures（审查 C）
      if (authFailed) throw authFailed
      if (input.signal.aborted || request.signal.aborted) throw abortError(input.signal, request.signal)
      const started = now()
      input.meter.calls += 1
      let text = ''
      try {
        const options: LlmStreamOptions = {
          provider: 'yunyi',
          model: input.model,
          sessionId: input.sessionId,
          messages: [{ role: 'user', content: [{ type: 'text', text: request.user }] }],
          temperature: request.temperature,
          // callLLMJson 每次尝试自带超时信号；工具被取消（exec.signal）时同样中止
          signal: AbortSignal.any([request.signal, input.signal]),
          ...(request.system ? { system: request.system } : {}),
        }
        try {
          for await (const chunk of input.llm.stream(options)) {
            if (chunk.type === 'text-delta' && chunk.text) text += chunk.text
            else if (chunk.type === 'usage') {
              input.meter.inputTokens += chunk.usage?.inputTokens ?? 0
              input.meter.outputTokens += chunk.usage?.outputTokens ?? 0
            } else if (chunk.type === 'finish' && chunk.reason?.kind === 'aborted') {
              // 3c 裁决 F16：中止不是空响应
              throw abortError(input.signal, request.signal, chunk.reason.failure)
            } else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
              const failure = chunk.reason.failure
              const message = `模型调用失败：${failureText(failure)}`
              if (authFailure(failure)) {
                authFailed = new PrepTransportError('auth', message, { cause: failure })
                throw authFailed
              }
              throw unavailable(failure) ? new PrepTransportError('network', message, { cause: failure }) : new Error(message, { cause: failure })
            }
          }
        } catch (error) {
          if (error instanceof PrepTransportError) throw error
          if (input.signal.aborted || request.signal.aborted) throw abortError(input.signal, request.signal, error)
          // 中间件或流本身抛出（dsh 只把适配器的失败转成 finish 块）：按网络失败处理
          if (!(error instanceof Error) || error.message.startsWith('模型调用失败：')) throw error
          throw new PrepTransportError('network', `模型调用失败：${error.message}`, { cause: error })
        }
        // callLLMJson 按"Empty LLM response"与错误文案里的 HTTP 状态码决定是否、多久重试（packages/course/src/v2/llm.ts）
        if (!text.trim()) throw new Error('Empty LLM response')
        return text
      } catch (error) {
        input.meter.failures += 1
        throw error
      } finally {
        input.meter.ms += now() - started
      }
    },
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 按文件头判断图像格式（D3 实测只确认了返回 b64_json，没有记录格式）；认不出（含空数据）返回 undefined，调用方拒绝（审查 D） */
function imageType(bytes: Uint8Array): { contentType: string; extension: string } | undefined {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return { contentType: 'image/png', extension: 'png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: 'image/jpeg', extension: 'jpg' }
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  if (riff && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { contentType: 'image/webp', extension: 'webp' }
  return undefined
}

/** 图像响应上限（审查 E）：一张 b64 编码的 1024 图约数 MB，20MB 足够 */
export const PREP_IMAGE_MAX_RESPONSE_BYTES = 20 * 1024 * 1024
/** 单次图像请求超时（审查 F） */
export const PREP_IMAGE_TIMEOUT_MS = 120_000

/** 按上限读响应正文：声明的 content-length 超限直接拒绝；边读边计数，超限即取消 */
async function readLimited(res: Response, limit: number): Promise<string> {
  const tooLarge = () => new Error(`图像响应超过上限 ${limit} 字节。`)
  const declared = Number(res.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function sessionImage(input: { baseUrl: string; credential: string | undefined; model: string; signal: AbortSignal; meter: ModelMeter; assets: NonNullable<PrepRuntime['assets']>; fetchImpl?: typeof fetch; maxResponseBytes?: number; timeoutMs?: number }): NonNullable<PrepRuntime['image']> {
  const doFetch = input.fetchImpl ?? fetch
  const base = input.baseUrl.replace(/\/+$/, '')
  const limit = input.maxResponseBytes ?? PREP_IMAGE_MAX_RESPONSE_BYTES
  const timeoutMs = input.timeoutMs ?? PREP_IMAGE_TIMEOUT_MS
  return {
    async generate(prompt, request) {
      if (!input.model) throw new Error(PREP_IMAGES_UNAVAILABLE)
      if (!input.credential) throw new Error(PREP_IMAGE_NO_CREDENTIAL)
      input.meter.imageCalls += 1
      const timeout = AbortSignal.timeout(timeoutMs)
      try {
        const res = await doFetch(`${base}/images/generations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${input.credential}` },
          body: JSON.stringify({ model: input.model, prompt, size: request.size, n: 1, response_format: 'b64_json' }),
          signal: AbortSignal.any([input.signal, timeout]),
        })
        if (!res.ok) {
          await res.body?.cancel().catch(() => undefined)
          throw new Error(`图像生成 HTTP ${res.status}`)
        }
        const body = JSON.parse(await readLimited(res, limit)) as { data?: Array<{ b64_json?: string; url?: string }> }
        const b64 = body.data?.[0]?.b64_json
        // 空串是"给了内联数据但为空"，交给下面的格式检查拒绝
        if (typeof b64 !== 'string') throw new Error('图像网关没有返回内联图片：只接受 b64_json，不拉取外链。')
        const bytes = Buffer.from(b64, 'base64')
        const type = imageType(bytes)
        if (!type) throw new Error('图像格式无法识别：只接受 png、jpeg、webp，空数据也拒绝。')
        const asset: PrepAssetInput = { bytes, contentType: type.contentType, name: `prep-image-${Date.now()}.${type.extension}` }
        return await input.assets.put(asset)
      } catch (error) {
        input.meter.failures += 1
        if (timeout.aborted && !input.signal.aborted) throw new Error(`图像生成超时（${timeoutMs} ms）。`, { cause: error })
        throw error
      }
    },
  }
}

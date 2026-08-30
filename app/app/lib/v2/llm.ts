/**
 * v2 LLM helper — Sprint 1
 *
 * 与现有 setup 包一致的调用模式（兼容 DashScope / OpenAI），
 * 但暴露纯函数 + Zod schema 校验，方便三关端点复用。
 */

import { z } from 'zod'
import { join } from 'node:path'
import { runClaudeCli } from '@maolab/llm-shared'

interface LLMConfig {
  apiKey: string
  model: string
  baseURL: string
}

function isClaudeCliMode(): boolean {
  if (process.env.LLM_PROVIDER === 'claude-cli') return true
  const model = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? ''
  return model.startsWith('claude-cli:')
}

function loadConfig(): LLMConfig {
  // LLM_API_KEY 优先(与 LLM_MODEL/LLM_BASE_URL 配套, 便于整体切 provider, 如智谱 GLM)
  const apiKey = process.env.LLM_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('[v2 llm] Missing LLM_API_KEY / DASHSCOPE_API_KEY / OPENAI_API_KEY')
  }
  const model = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'qwen-plus'
  const baseURL =
    process.env.LLM_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  return { apiKey, model, baseURL }
}

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
  const maxAttempts = opts.maxAttempts ?? 3
  const timeoutMs = (opts.timeoutSec ?? 90) * 1000

  // ===== Claude CLI 订阅路径 =====
  if (isClaudeCliMode()) {
    const model = process.env.LLM_MODEL ?? 'claude-cli:sonnet'
    const systemSuffix = '\n\n严格只输出一个合法 JSON 对象,不要使用 markdown 代码块,不要任何解释文字。'
    const system = (opts.system ?? '') + systemSuffix
    let lastErr: unknown
    let validationFeedback = ''
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const raw = await runClaudeCli({ system, user: retryPrompt(opts.user, validationFeedback), model, timeoutMs })
        const jsonText = extractJsonFromText(raw)
        let parsed: unknown
        try { parsed = JSON.parse(jsonText) }
        catch (e) {
          console.error('[callLLMJson:cli] JSON.parse failed, raw (first 500):', raw.slice(0, 500))
          validationFeedback = schemaFeedback(e)
          throw e
        }
        try { return opts.schema.parse(parsed) as T }
        catch (e) {
          validationFeedback = schemaFeedback(e)
          if (attempt === maxAttempts) {
            console.error('[callLLMJson:cli] schema parse failed, raw (first 800):', raw.slice(0, 800))
          }
          throw e
        }
      } catch (err) {
        lastErr = err
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000 * attempt))
          continue
        }
      }
    }
    throw new Error(`callLLMJson (claude-cli) failed after ${maxAttempts} attempts: ${String(lastErr)}`)
  }

  // ===== OpenAI 兼容 HTTP 路径 =====
  const cfg = loadConfig()
  const temperature = opts.temperature ?? 0.4

  let lastErr: unknown
  let validationFeedback = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${cfg.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
            { role: 'user', content: retryPrompt(opts.user, validationFeedback) },
          ],
          temperature,
          response_format: { type: 'json_object' },
          // GLM-5 默认开深度思考(thinking), 结构化生成不需要且拖慢数倍; 置 LLM_THINKING=on 可开
          ...(cfg.model.startsWith('glm') && process.env.LLM_THINKING !== 'on'
            ? { thinking: { type: 'disabled' } }
            : {}),
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        // 诊断: HTTP 错误也落盘(429 限流在 beats 批量期高发)
        try {
          const { appendFileSync, mkdirSync } = await import('node:fs')
          mkdirSync(join(process.cwd(), 'logs'), { recursive: true })
          appendFileSync(join(process.cwd(), 'logs', 'llm-http-fail.log'), `${new Date().toISOString()} HTTP ${res.status} attempt=${attempt}
`)
        } catch { /* ignore */ }
        throw new Error(`LLM HTTP ${res.status}`)
      }
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
      const content = data.choices[0]?.message?.content
      if (!content) throw new Error('Empty LLM response')
      let parsed: unknown
      try { parsed = JSON.parse(content) }
      catch (e) {
        console.error('[callLLMJson] JSON.parse failed, raw content (first 500):', content.slice(0, 500))
        validationFeedback = schemaFeedback(e)
        throw e
      }
      try { return opts.schema.parse(parsed) as T }
      catch (e) {
        validationFeedback = schemaFeedback(e)
        if (attempt === maxAttempts) {
          console.error('[callLLMJson] schema parse failed, raw content (first 800):', content.slice(0, 800))
          // 调试落盘: server console 不可见时从文件取原始输出
          try {
            const { appendFileSync, mkdirSync } = await import('node:fs')
            mkdirSync(join(process.cwd(), 'logs'), { recursive: true })
            appendFileSync(join(process.cwd(), 'logs', 'llm-schema-fail.log'), `\n===== ${new Date().toISOString()}\n${content.slice(0, 2000)}\n`)
          } catch { /* 调试日志失败不影响主流程 */ }
        }
        throw e
      }
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        // 429/5xx 限流退避要够长(QPM 窗口按分钟计), 普通错误短等
        const rateLimited = /HTTP (429|5\d\d)/.test(String(err))
        await new Promise(r => setTimeout(r, rateLimited ? 20_000 * attempt : 1000 * attempt))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`callLLMJson failed after ${maxAttempts} attempts: ${String(lastErr)}`)
}

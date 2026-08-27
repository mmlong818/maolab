/**
 * Claude CLI Provider — 走用户 Claude Pro/Max/Enterprise 订阅，不消耗 API key 额度
 *
 * 通过 spawn `claude -p` 子进程实现 LLMCaller 契约。每次调用：
 *   - stdin 喂 user prompt
 *   - --append-system-prompt 注入 system prompt
 *   - --output-format json 返回结构化 wrapper，取 .result 字段为模型输出
 *   - --tools "" / --disable-slash-commands / --setting-sources "" 关掉工具/技能/项目设置，减小 cache cost
 *
 * 模型字符串约定（在 annotator.model 中）：
 *   "claude-cli:haiku"          → --model haiku
 *   "claude-cli:sonnet"         → --model sonnet
 *   "claude-cli:claude-haiku-4-5-20251001"  → --model claude-haiku-4-5-20251001
 *
 * 注意：
 *   - Windows 下 claude 是 .cmd，使用 shell: true
 *   - CLI 启动开销约 6-12 s/次（含 6k 默认 system cache），建议 concurrency<=3
 *   - 订阅有 5h 滚动窗口限额，全量 9106 叶子前需评估
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LLMCaller } from './annotation-pipeline.js'

export interface ClaudeCliProviderOptions {
  /** 命令名，默认平台自适应 */
  command?: string
  /** 单次调用超时（毫秒），默认 120s */
  timeoutMs?: number
  /** 是否打印 stderr 调试信息 */
  debug?: boolean
}

const IS_WINDOWS = process.platform === 'win32'

function resolveCommand(opt?: string): string {
  if (opt) return opt
  return IS_WINDOWS ? 'claude.cmd' : 'claude'
}

/**
 * 从 model 字符串中提取要传给 --model 的部分
 * "claude-cli:haiku" → "haiku"；非 claude-cli: 前缀的原样返回
 */
export function parseCliModel(model: string): string {
  const colon = model.indexOf(':')
  if (colon < 0) return model
  const prefix = model.slice(0, colon)
  if (prefix === 'claude-cli') return model.slice(colon + 1)
  return model
}

interface CliUsage {
  input_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface CliJsonResult {
  type: string
  subtype: string
  is_error: boolean
  result?: string
  api_error_status?: unknown
  usage?: CliUsage
}

/** 全局 token 计数器，供外部读取 */
export const tokenAccumulator = {
  input: 0,
  cacheCreation: 0,
  cacheRead: 0,
  calls: 0,
  total(): number { return this.input + this.cacheCreation + this.cacheRead },
  reset(): void { this.input = 0; this.cacheCreation = 0; this.cacheRead = 0; this.calls = 0 },
}

export function createClaudeCliCaller(opts: ClaudeCliProviderOptions = {}): LLMCaller {
  const command = resolveCommand(opts.command)
  const timeoutMs = opts.timeoutMs ?? 120_000

  return async function claudeCliCall(args: {
    prompt: string
    system: string
    model: string
    apiKey: string
    baseURL?: string
  }): Promise<string> {
    const cliModel = parseCliModel(args.model)

    // Windows 上 spawn .cmd 必须 shell:true，但这会把 args 重新拼接到 cmd.exe 命令行；
    // 系统 prompt 中带空格/引号/中文标点会被 cmd 解析破坏。
    // 把 system prompt 写临时文件，用 --append-system-prompt-file 追加到默认 system prompt。
    // (--system-prompt-file 替换会破坏 claude-cli tool-use 框架，导致模型输出 0 KP，不可用)
    const tmpDir = await mkdtemp(join(tmpdir(), 'claude-cli-sys-'))
    const sysFile = join(tmpDir, 'system.txt')
    await writeFile(sysFile, args.system, 'utf8')

    // --setting-sources= 阻止加载项目 CLAUDE.md / 全局 rules / memory / skills，
    // 避免每次调用额外带 ~27k token 的项目 context。
    const cliArgs = [
      '-p',
      `--model=${cliModel}`,
      '--output-format=json',
      `--append-system-prompt-file=${sysFile}`,
      '--disable-slash-commands',
      '--setting-sources=',
    ]

    const cleanup = async (): Promise<void> => {
      try { await rm(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }

    return await new Promise<string>((resolve, reject) => {
      const child = spawn(command, cliArgs, {
        shell: IS_WINDOWS,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const finish = (err: Error | null, value?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void cleanup().then(() => {
          if (err) reject(err)
          else resolve(value ?? '')
        })
      }

      const timer = setTimeout(() => {
        if (settled) return
        try { child.kill('SIGTERM') } catch { /* ignore */ }
        finish(new Error(`Claude CLI 调用超时 (${timeoutMs}ms)`))
      }, timeoutMs)

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { stdout += chunk })
      child.stderr.on('data', (chunk: string) => { stderr += chunk })

      child.on('error', (err) => {
        finish(new Error(`Claude CLI spawn 失败: ${err.message}`))
      })

      child.on('close', (code) => {
        if (opts.debug && stderr) {
          // eslint-disable-next-line no-console
          console.error('[claude-cli stderr]', stderr.slice(0, 500))
        }
        if (code !== 0) {
          finish(new Error(`Claude CLI 退出码 ${code}: ${stderr.slice(0, 300)}`))
          return
        }
        try {
          const wrapper = JSON.parse(stdout) as CliJsonResult
          if (wrapper.is_error || !wrapper.result) {
            finish(new Error(`Claude CLI 返回 error: ${JSON.stringify(wrapper).slice(0, 300)}`))
            return
          }
          // 累计 token 消耗
          if (wrapper.usage) {
            tokenAccumulator.input += wrapper.usage.input_tokens ?? 0
            tokenAccumulator.cacheCreation += wrapper.usage.cache_creation_input_tokens ?? 0
            tokenAccumulator.cacheRead += wrapper.usage.cache_read_input_tokens ?? 0
            tokenAccumulator.calls++
          }
          finish(null, wrapper.result)
        } catch (e) {
          finish(new Error(`Claude CLI 输出无法解析为 JSON: ${stdout.slice(0, 300)} (parse err: ${String(e)})`))
        }
      })

      // 把 user prompt 喂给 stdin
      child.stdin.end(args.prompt, 'utf8')
    })
  }
}

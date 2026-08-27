/**
 * Claude CLI Runner — 通过 spawn `claude -p` 走用户 Claude Pro/Max 订阅，不消耗 API key
 *
 * 模型字符串约定（与 textbook-index/claude-cli-provider 一致）：
 *   "claude-cli:haiku"   → --model haiku
 *   "claude-cli:sonnet"  → --model sonnet
 *   "claude-cli:<完整 id>" → --model <完整 id>
 *
 * 注意：
 *   - Windows 下 claude 是 .cmd，使用 shell: true
 *   - CLI 启动开销约 6-12 s/次
 *   - 订阅 5h 滚动窗口限额
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const IS_WINDOWS = process.platform === 'win32'

export interface ClaudeCliRunOptions {
  /** user prompt（喂 stdin） */
  user: string
  /** system prompt（写入临时文件，--append-system-prompt-file） */
  system?: string
  /** 模型字符串，支持 "claude-cli:xxx" 或裸 "haiku"/"sonnet" */
  model: string
  /** 命令名，默认 win=claude.cmd / 其他=claude */
  command?: string
  /** 超时（毫秒），默认 120s */
  timeoutMs?: number
  /** 打印 stderr 调试 */
  debug?: boolean
}

export type ClaudeCliRunner = (opts: ClaudeCliRunOptions) => Promise<string>

interface CliJsonResult {
  type: string
  subtype: string
  is_error: boolean
  result?: string
}

export function parseCliModel(model: string): string {
  const colon = model.indexOf(':')
  if (colon < 0) return model
  const prefix = model.slice(0, colon)
  if (prefix === 'claude-cli') return model.slice(colon + 1)
  return model
}

function resolveCommand(opt?: string): string {
  if (opt) return opt
  return IS_WINDOWS ? 'claude.cmd' : 'claude'
}

export async function runClaudeCli(opts: ClaudeCliRunOptions): Promise<string> {
  const command = resolveCommand(opts.command)
  const timeoutMs = opts.timeoutMs ?? 120_000
  const cliModel = parseCliModel(opts.model)

  const tmpDir = await mkdtemp(join(tmpdir(), 'claude-cli-sys-'))
  const sysFile = join(tmpDir, 'system.txt')
  await writeFile(sysFile, opts.system ?? '', 'utf8')

  const cliArgs = [
    '-p',
    `--model=${cliModel}`,
    '--output-format=json',
    `--append-system-prompt-file=${sysFile}`,
    '--disable-slash-commands',
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
        finish(null, wrapper.result)
      } catch (e) {
        finish(new Error(`Claude CLI 输出无法解析为 JSON: ${stdout.slice(0, 300)} (parse err: ${String(e)})`))
      }
    })

    child.stdin.end(opts.user, 'utf8')
  })
}

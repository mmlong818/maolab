// 双 Agent 协作简报：把 LOCKS + 对方信箱汇总成一段文本。
// 无参数 → 输出 Claude Code SessionStart hook 的 JSON（注入上下文）
// --text  → 输出纯文本，人或 Codex 可以直接 `node .collab/brief.mjs --text` 看
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => {
  try {
    return readFileSync(join(root, rel), 'utf8').trim()
  } catch {
    return `(读取失败：${rel} 不存在)`
  }
}

const brief = [
  '【双 Agent 协作 · 开工前必读】',
  '本仓库同时被 Claude Code 和 Codex 编辑，共享同一个工作树。协议全文见 .collab/README.md。',
  '',
  '=== .collab/LOCKS.md —— 已认领的路径，锁住的不要碰 ===',
  read('.collab/LOCKS.md'),
  '',
  '=== .collab/mailbox-codex.md —— Codex 的信箱（只读，不要编辑）===',
  read('.collab/mailbox-codex.md'),
  '',
  '动手前往 LOCKS.md 追加一行认领；收工后只更新 .collab/mailbox-claude.md（自己的信箱）。',
].join('\n')

if (process.argv.includes('--text')) {
  process.stdout.write(brief + '\n')
} else {
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: brief },
    })
  )
}

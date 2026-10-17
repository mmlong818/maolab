// 生产模式下没有 YUNYI_PG_URL 时，profile 会退回 jsonl，私密会话因此会写到磁盘。宿主必须拒绝启动。
import { expect, test } from 'vitest'
import { runHostToExit } from './helpers/host.ts'

test('in production the host refuses to start without YUNYI_PG_URL', async () => {
  const { code, stderr } = await runHostToExit({ NODE_ENV: 'production', YUNYI_PG_URL: '' }, { timeoutMs: 120_000 })
  expect(code, stderr.slice(-2000)).not.toBe(0)
  expect(stderr).toContain('YUNYI_PG_URL is required')
}, 150_000)

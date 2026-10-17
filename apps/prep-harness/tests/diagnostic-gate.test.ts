import { expect, test } from 'vitest'
import { PREP_TOOLS, withWhoami } from './helpers/whitelist.ts'
import { startHost } from './helpers/host.ts'

const run = Date.now().toString(36)
const toolNames = async (h: Awaited<ReturnType<typeof startHost>>, preset: string, id: string): Promise<string[]> => {
  expect((await h.api('POST', '/sessions', { sessionId: id, owner: 'owner-gate', preset, provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const tools = await h.api('GET', `/sessions/${id}/tools`)
  expect(tools.status).toBe(200)
  return [...(tools.json as { names: string[] }).names].sort()
}

// whoami 的门控依赖 preset 子条目上的 `disabled: !!js`：变量缺省时 prep 不得暴露 whoami，设为 1 时要有。
test('whoami is hidden from prep unless YUNYI_DIAGNOSTIC_TOOLS=1', async () => {
  const off = await startHost({ YUNYI_DIAGNOSTIC_TOOLS: '' }, { readyTimeoutMs: 120_000 })
  const on = await startHost({ YUNYI_DIAGNOSTIC_TOOLS: '1' }, { readyTimeoutMs: 120_000 })
  try {
    expect(await toolNames(off, 'prep', `s-gate-off-prep-${run}`)).toEqual([...PREP_TOOLS])
    expect(await toolNames(on, 'prep', `s-gate-on-prep-${run}`)).toEqual(withWhoami(PREP_TOOLS))
  } finally {
    await off.stop()
    await on.stop()
  }
}, 300_000)

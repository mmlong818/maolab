import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost, type EventFrame } from './helpers/host.ts'

const hostDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(hostDir, '..', '..')
const dshSkills = path.join(hostDir, '.dsh-home', 'skills', 'leak-probe')
const agentsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'maolab-agents-'))
const leak = (name: string) => `---\nname: ${name}\ndescription: 不应出现的用户目录 skill\n---\n泄漏正文 ${name}\n`
let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let host: Awaited<ReturnType<typeof startHost>>
const run = Date.now().toString(36)
// .dsh-home/skills 若本来不存在，由本测试创建，结束时只删自己建的东西
let createdSkillsRoot = false

beforeAll(async () => {
  createdSkillsRoot = !fs.existsSync(path.dirname(dshSkills))
  fs.mkdirSync(dshSkills, { recursive: true })
  fs.writeFileSync(path.join(dshSkills, 'SKILL.md'), leak('leak-probe'))
  fs.mkdirSync(path.join(agentsHome, 'skills', 'agents-probe'), { recursive: true })
  fs.writeFileSync(path.join(agentsHome, 'skills', 'agents-probe', 'SKILL.md'), leak('agents-probe'))
  fake = await startFakeOpenAI()
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, DSH_AGENTS_HOME: agentsHome }, { readyTimeoutMs: 120_000 })
}, 150_000)
afterAll(async () => {
  await host?.stop(); await fake?.close()
  fs.rmSync(dshSkills, { recursive: true, force: true })
  if (createdSkillsRoot) try { fs.rmdirSync(path.dirname(dshSkills)) } catch { /* 目录非空：留给其他内容 */ }
  fs.rmSync(agentsHome, { recursive: true, force: true })
})

async function turn(preset: string, label: string, text: string, steps: Parameters<typeof fake.queueScript>[0]): Promise<EventFrame[]> {
  const id = `s-sk-${label}-${run}`
  expect((await host.api('POST', '/sessions', { sessionId: id, owner: 'owner-sk', preset, provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const s = host.events(id)
  fake.queueScript(steps)
  await host.api('POST', `/sessions/${id}/prompt`, { text })
  await s.waitFor((e) => e.type === 'turn/end')
  await s.close()
  return s.received
}
/** 本会话模型可见的工具名：用来证明 "unknown" 来自 skill 查找，而不是 skill 工具本身不存在 */
async function toolsOf(preset: string, label: string): Promise<string[]> {
  const id = `s-sk-tools-${label}-${run}`
  expect((await host.api('POST', '/sessions', { sessionId: id, owner: 'owner-sk', preset, provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const res = await host.api('GET', `/sessions/${id}/tools`)
  expect(res.status).toBe(200)
  return (res.json as { names: string[] }).names
}
/** tool/result 的文本内容 */
const resultText = (frames: EventFrame[]): string => {
  const data = frames.find((e) => e.type === 'tool/result')?.data as { message?: { content?: Array<{ type?: string; text?: string }> } } | undefined
  return (data?.message?.content ?? []).map((b) => b.text ?? '').join('')
}
const catalogOf = (frames: EventFrame[]) => {
  const m = frames.find((e) => e.type === 'user/message' && ((e.data as { message?: { source?: { kind?: string } } })?.message?.source?.kind ?? (e.data as { source?: { kind?: string } })?.source?.kind) === 'skill-catalog')
  const src = ((m?.data as { message?: { source?: unknown } })?.message?.source ?? (m?.data as { source?: unknown })?.source) as { entries?: Array<{ name: string }> } | undefined
  return (src?.entries ?? []).map((e) => e.name).sort()
}

test('each preset lists exactly its configured skills; user/agents homes never leak', async () => {
  // 两个 preset 都挂了 skill 工具：probe-other 的空目录不是"没有 skill 工具所以没发目录"
  for (const preset of ['prep', 'probe-other']) expect(await toolsOf(preset, preset), preset).toContain('skill')
  expect(catalogOf(await turn('prep', 'cat-p', 'hello', [{ text: '好。' }]))).toEqual(['prep-quality-contract', 'prep-review-standards'])
  expect(catalogOf(await turn('probe-other', 'cat-o', 'hello', [{ text: '好。' }]))).toEqual([])
})

test('prep loads its skill; the result carries no host path; other presets and user dirs get unknown', async () => {
  const loaded = await turn('prep', 'load', '审查前先看标准', [{ tool: 'skill', args: { name: 'prep-review-standards' } }, { text: '好。' }])
  const result = JSON.stringify(loaded.find((e) => e.type === 'tool/result')?.data)
  expect(result).toContain('CQ-01')
  expect(result).not.toContain('Base directory')
  expect(result).not.toContain(repoRoot.replaceAll('\\', '\\\\'))
  expect(result).not.toContain(repoRoot)
  for (const [preset, name] of [
    ['probe-other', 'prep-review-standards'], ['prep', 'leak-probe'], ['prep', 'agents-probe'], ['prep', 'visual-guide'],
    ['probe-other', 'leak-probe'], ['probe-other', 'agents-probe'],
  ] as const) {
    const frames = await turn(preset, `deny-${preset}-${name}`, 'x', [{ tool: 'skill', args: { name } }, { text: '好。' }])
    // dsh-tool-skill 的原文；不能被 `unknown tool "skill"`（工具不存在）冒充
    expect(resultText(frames), `${preset}/${name}`).toContain(`skill "${name}" is unknown or no longer available`)
  }
})

test('a teacher typing /prep-review-standards does not inject the skill body', async () => {
  const frames = await turn('prep', 'slash', '/prep-review-standards 帮我审一下', [{ text: '好。' }])
  expect(frames.some((e) => JSON.stringify(e.data ?? '').includes('skill-invocation'))).toBe(false)
  expect(fake.requests.at(-1)?.allText).not.toContain('<skill_content name="prep-review-standards">')
  expect(fake.requests.at(-1)?.allText).not.toContain('insufficient-evidence')
})

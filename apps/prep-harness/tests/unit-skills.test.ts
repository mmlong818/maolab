import { expect, test } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadSkill, parseSkillFile, SKILLS_DIR } from '@maolab/prep-bundle/skills'
import { apply as applyPrepTools, PREP_TOOL_REASONS } from '@maolab/prep-bundle/tools-prep'

test('the bundle ships only the two prep skills; each parses and matches its directory', () => {
  expect(readdirSync(SKILLS_DIR).sort()).toEqual(['prep-quality-contract', 'prep-review-standards'])
  for (const name of ['prep-quality-contract', 'prep-review-standards']) {
    const s = loadSkill(name)
    expect(s.name).toBe(name)
    expect(s.description.length).toBeGreaterThan(5)
    expect(s.content).not.toMatch(/<!--/)
  }
})
test('malformed frontmatter is refused', () => {
  expect(() => parseSkillFile('no frontmatter')).toThrow()
  expect(() => parseSkillFile('---\nname: Bad Name\ndescription: x\n---\nbody')).toThrow()
  expect(() => parseSkillFile('---\nname: ok-name\n---\nbody')).toThrow()
})
test('prep skills distil the maolab quality contract and review standards, and leave anti-patterns to code', () => {
  const contract = loadSkill('prep-quality-contract').content
  for (const heading of ['内容的唯一口径', '五个品质维度', 'AI 能力边界', '出品验收证据']) expect(contract).toContain(heading)
  const standards = loadSkill('prep-review-standards').content
  for (const id of ['CQ-01', 'CQ-02', 'CQ-03', 'CQ-04', 'CQ-05', 'CQ-06', 'CQ-07']) expect(standards).toContain(id)
  for (const phrase of ['insufficient-evidence', '课标与教材核对方法', '结论措辞']) expect(standards).toContain(phrase)
  // 呈现反模式只在代码里（presentation-antipatterns.ts），skill 不复述（总览不一致第 10 条）
  for (const content of [contract, standards]) expect(content).not.toMatch(/反模式|antipattern/i)
  // 失败原因表模型看不到（3c T7 M3）：skill 要点名主要原因；整课审查阻断按 findings/factIssues 修页
  for (const reason of ['audit-blocked', 'model-channel-missing', 'model-unavailable', 'missing-credential', 'page-blocked', 'pages-not-accepted', 'render-evidence-missing', 'images-unavailable', 'plan-conflict', 'not-ready']) expect(contract).toContain(reason)
  for (const field of ['findings', 'factIssues', 'unverifiedPageIds', 'pendingPageIds', 'advice']) expect(standards).toContain(field)
})
test('prep-quality-contract names every PREP_TOOL_REASONS key (keeps the skill in sync with the reason table)', () => {
  const contract = loadSkill('prep-quality-contract').content
  for (const reason of Object.keys(PREP_TOOL_REASONS)) expect(contract, reason).toMatch(new RegExp(String.raw`(?<![\w-])${reason}(?![\w-])`))
})

test('final I2: no guidance tells the model to re-review or re-accept an accepted course (4b: changes go through revise_course)', () => {
  const tools = new Map<string, { description: string }>()
  applyPrepTools({ tools: { register: (t: unknown) => { tools.set((t as { name: string }).name, t as { description: string }) } }, yunyiPrep: {} as never })
  const texts = {
    skill: loadSkill('prep-quality-contract').content,
    revise: tools.get('revise_course')!.description,
    reasons: JSON.stringify(PREP_TOOL_REASONS),
  }
  for (const [name, text] of Object.entries(texts)) {
    expect(text, name).not.toMatch(/改完并重新整课验收|重新(整课)?审查与验收|重新验收(后)?再发布|修改后重新验收|会发布新版本|重新截图与验收/)
  }
  for (const name of ['skill', 'revise'] as const) expect(texts[name], name).not.toMatch(/不能改版|修订入口后续提供|修订入口会在后续/)
  expect(texts.skill).toMatch(/revise_course/)
  expect(PREP_TOOL_REASONS['not-ready']).toMatch(/不要.*(audit_course|accept_course)/)
})

test('the prep host has no publish or recall tool and the skill does not mention the public library (S3: publishing becomes course-package export in S4)', () => {
  const names: string[] = []
  applyPrepTools({ tools: { register: (t: unknown) => { names.push((t as { name: string }).name) } }, yunyiPrep: {} as never })
  expect(names).not.toContain('publish_course')
  expect(names).not.toContain('recall_course')
  for (const name of ['prep-quality-contract', 'prep-review-standards']) expect(loadSkill(name).content, name).not.toMatch(/publish_course|recall_course|公共库/)
  expect(JSON.stringify(PREP_TOOL_REASONS)).not.toMatch(/公共库|发布/)
})

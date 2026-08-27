# Maolab Plan 08: Interactive Scene Worker (Two-Pass Generation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `InteractiveWorker`，通过两轮 LLM 调用生成交互式 HTML 场景：第一轮提取科学模型（结构化 JSON），第二轮基于科学模型生成可运行的 HTML。

**Architecture:** 两步流水线——Pass 1 调用 `validatedGenerate` 将课程内容提炼为 `ScientificModel`（含公式、机制、约束、禁止错误）；Pass 2 调用 `callLLM` 将 `ScientificModel` + 上下文注入 HTML 生成 prompt，输出 raw HTML 字符串（带空值校验重试）。依赖 Plan 07 的 `buildPrompt` 和 Plan 06 的双参数 `callLLM`，`InteractiveContent { type: 'interactive', html: string }` 在 shared-types 中已存在。

**Tech Stack:** TypeScript 5、Zod、Vitest、已有的 `validatedGenerate`、`buildPrompt`（Plan 07 产出）

**依赖：** Plan 06（multi-provider callLLM）和 Plan 07（buildPrompt prompt 系统）必须先完成。

---

## 文件结构

```
packages/generator/
└── src/
    ├── prompts/
    │   └── templates/
    │       ├── interactive-model/
    │       │   ├── system.md          # 新建：科学模型提取系统提示
    │       │   └── user.md            # 新建：科学模型提取用户提示
    │       └── interactive-html/
    │           ├── system.md          # 新建：HTML 生成系统提示
    │           └── user.md            # 新建：HTML 生成用户提示
    ├── workers/
    │   └── interactive-worker.ts      # 新建：两轮生成 worker
    ├── __tests__/
    │   └── interactive-worker.test.ts # 新建：单元测试
    └── index.ts                       # 修改：注册 InteractiveWorker，导出
```

---

### Task 1: 新建 prompt 模板文件

**Files:**
- Create: `packages/generator/src/prompts/templates/interactive-model/system.md`
- Create: `packages/generator/src/prompts/templates/interactive-model/user.md`
- Create: `packages/generator/src/prompts/templates/interactive-html/system.md`
- Create: `packages/generator/src/prompts/templates/interactive-html/user.md`

- [ ] **Step 1: 创建 interactive-model/system.md**

```bash
mkdir -p E:/CC/code/maolab/packages/generator/src/prompts/templates/interactive-model
```

内容写入 `packages/generator/src/prompts/templates/interactive-model/system.md`：

```markdown
You are a science education expert. Extract the core scientific model from the given teaching content.

Output ONLY valid JSON matching this schema — no markdown, no explanation:
{
  "core_formulas": ["string"],
  "mechanism": ["string"],
  "constraints": ["string"],
  "forbidden_errors": ["string"]
}

Rules:
- core_formulas: key equations or mathematical relationships (use plain text, e.g. "F = ma")
- mechanism: step-by-step causal chain explaining how/why the phenomenon works
- constraints: boundary conditions, assumptions, or limits of applicability
- forbidden_errors: common misconceptions or mistakes students must avoid
- Each array must have at least 1 item
- All strings in the target language: {{language}}
```

- [ ] **Step 2: 创建 interactive-model/user.md**

内容写入 `packages/generator/src/prompts/templates/interactive-model/user.md`：

```markdown
Topic: {{topic}}
Domain: {{domain}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Analogies: {{analogies}}

Extract the scientific model for this teaching scene.
```

- [ ] **Step 3: 创建 interactive-html/system.md**

```bash
mkdir -p E:/CC/code/maolab/packages/generator/src/prompts/templates/interactive-html
```

内容写入 `packages/generator/src/prompts/templates/interactive-html/system.md`：

```markdown
You are an expert in educational interactive simulations. Generate a single self-contained HTML page that lets a student explore the given scientific model interactively.

Requirements:
- Output ONLY the raw HTML — no markdown, no code fences, no explanation
- Must be a complete HTML document starting with <!DOCTYPE html>
- Use vanilla JavaScript only (no external CDN dependencies)
- Include inline CSS for a clean, readable layout
- Implement at least one interactive element (slider, input, button, or animation)
- The simulation must faithfully respect the scientific model's constraints and forbidden errors
- Display values and results clearly with units
- Target language: {{language}}
- Teaching style: {{teachingMethod}}
- Difficulty: {{difficulty}}
```

- [ ] **Step 4: 创建 interactive-html/user.md**

内容写入 `packages/generator/src/prompts/templates/interactive-html/user.md`：

```markdown
Scene title: {{title}}
Learning objective: {{objective}}
Duration hint: {{durationHint}} minutes

Scientific model:
- Core formulas: {{coreFormulas}}
- Mechanism: {{mechanism}}
- Constraints: {{constraints}}
- Forbidden errors (must not be reinforced): {{forbiddenErrors}}

Generate the interactive HTML simulation for this scene.
```

- [ ] **Step 5: 验证目录结构**

```bash
ls E:/CC/code/maolab/packages/generator/src/prompts/templates/
```

Expected: 列出 `interactive-model/` 和 `interactive-html/` 以及已有的 `slide/`、`quiz/`、`extract-knowledge/`（Plan 07 创建后）。

> **注意：** 这些模板目录在 Plan 07 执行后才会与 `buildPrompt` 配合工作。如果 Plan 07 尚未执行，Task 2 中的测试会 mock `buildPrompt`，不依赖实际文件存在。

- [ ] **Step 6: 提交**

```bash
git -C E:/CC/code/maolab add packages/generator/src/prompts/templates/interactive-model packages/generator/src/prompts/templates/interactive-html
git -C E:/CC/code/maolab commit -m "feat(generator): add interactive scene prompt templates"
```

---

### Task 2: 写失败测试

**Files:**
- Create: `packages/generator/src/__tests__/interactive-worker.test.ts`

- [ ] **Step 1: 写测试文件**

写入 `packages/generator/src/__tests__/interactive-worker.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InteractiveWorker } from '../workers/interactive-worker.js'
import type { OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'

// Mock buildPrompt so tests don't need template files on disk
vi.mock('../prompts/loader.js', () => ({
  buildPrompt: vi.fn().mockReturnValue({
    system: 'mock system prompt',
    user: 'mock user prompt',
  }),
  PROMPT_IDS: {
    SLIDE: 'slide',
    QUIZ: 'quiz',
    EXTRACT_KNOWLEDGE: 'extract-knowledge',
    INTERACTIVE_MODEL: 'interactive-model',
    INTERACTIVE_HTML: 'interactive-html',
  },
}))

const mockOutlineItem: OutlineItem = {
  id: 'item-1',
  title: 'Newton\'s Second Law',
  objective: 'Understand F = ma relationship',
  durationHint: 10,
  sceneType: 'interactive',
  order: 1,
}

const mockProfile: KnowledgeProfile = {
  topic: 'Classical Mechanics',
  domain: 'Physics',
  difficulty: 'intermediate',
  coreConcepts: [{ name: 'Force', desc: 'F = ma' }],
  analogies: ['pushing a shopping cart'],
  narrativeHooks: ['why heavier objects are harder to accelerate'],
}

const mockPlan: TeachingPlan = {
  teachingMethod: 'inquiry-based',
  language: 'zh-CN',
  outlineItems: [mockOutlineItem],
}

const mockScientificModel = {
  core_formulas: ['F = ma'],
  mechanism: ['Apply force → object accelerates proportionally'],
  constraints: ['Assumes constant mass', 'Valid at non-relativistic speeds'],
  forbidden_errors: ['Confusing force with velocity'],
}

describe('InteractiveWorker', () => {
  let callLLM: ReturnType<typeof vi.fn>

  beforeEach(() => {
    callLLM = vi.fn()
  })

  it('returns a scene with type interactive and non-empty html', async () => {
    // Pass 1: returns scientific model JSON
    callLLM.mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    // Pass 2: returns HTML
    callLLM.mockResolvedValueOnce('<!DOCTYPE html><html><body><h1>Newton</h1></body></html>')

    const worker = new InteractiveWorker(callLLM)
    const scene = await worker.generate(mockOutlineItem, mockProfile, mockPlan)

    expect(scene.type).toBe('interactive')
    expect(scene.content.type).toBe('interactive')
    expect((scene.content as { type: 'interactive'; html: string }).html).toContain('<!DOCTYPE html>')
    expect(scene.generationStatus).toBe('done')
    expect(scene.outlineItemId).toBe('item-1')
    expect(scene.durationHint).toBe(10)
  })

  it('calls LLM twice (model extraction then html generation)', async () => {
    callLLM.mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    callLLM.mockResolvedValueOnce('<!DOCTYPE html><html><body></body></html>')

    const worker = new InteractiveWorker(callLLM)
    await worker.generate(mockOutlineItem, mockProfile, mockPlan)

    expect(callLLM).toHaveBeenCalledTimes(2)
  })

  it('retries html pass when LLM returns empty string', async () => {
    callLLM.mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    // First HTML attempt: empty
    callLLM.mockResolvedValueOnce('')
    // Second HTML attempt: valid
    callLLM.mockResolvedValueOnce('<!DOCTYPE html><html><body>ok</body></html>')

    const worker = new InteractiveWorker(callLLM, { maxRetries: 3, baseDelay: 0 })
    const scene = await worker.generate(mockOutlineItem, mockProfile, mockPlan)

    expect(callLLM).toHaveBeenCalledTimes(3) // 1 model + 2 html
    expect((scene.content as { type: 'interactive'; html: string }).html).toContain('<!DOCTYPE html>')
  })

  it('throws LLMOutputValidationError after maxRetries empty html responses', async () => {
    callLLM.mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    callLLM.mockResolvedValue('') // all HTML attempts return empty

    const worker = new InteractiveWorker(callLLM, { maxRetries: 2, baseDelay: 0 })
    await expect(worker.generate(mockOutlineItem, mockProfile, mockPlan)).rejects.toThrow(
      'HTML generation failed',
    )
  })

  it('propagates error when scientific model extraction fails validation', async () => {
    // Missing required fields
    callLLM.mockResolvedValueOnce(JSON.stringify({ core_formulas: [] }))
    callLLM.mockResolvedValue(JSON.stringify({ core_formulas: [] })) // all retries fail

    const worker = new InteractiveWorker(callLLM, { maxRetries: 2, baseDelay: 0 })
    await expect(worker.generate(mockOutlineItem, mockProfile, mockPlan)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd E:/CC/code/maolab
pnpm --filter @maolab/generator test
```

Expected: FAIL — `Cannot find module '../workers/interactive-worker.js'`

---

### Task 3: 实现 InteractiveWorker

**Files:**
- Create: `packages/generator/src/workers/interactive-worker.ts`

- [ ] **Step 1: 创建 interactive-worker.ts**

```typescript
// packages/generator/src/workers/interactive-worker.ts
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate, LLMOutputValidationError } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const ScientificModelSchema = z.object({
  core_formulas: z.array(z.string()).min(1),
  mechanism: z.array(z.string()).min(1),
  constraints: z.array(z.string()).min(1),
  forbidden_errors: z.array(z.string()).min(1),
})

type ScientificModel = z.infer<typeof ScientificModelSchema>

export class InteractiveWorker implements ContentWorker {
  readonly type = 'interactive' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const model = await this.extractScientificModel(item, profile, plan)
    const html = await this.generateHtml(item, profile, plan, model)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'interactive',
      title: item.title,
      content: {
        type: 'interactive',
        html,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }

  private async extractScientificModel(
    item: OutlineItem,
    profile: KnowledgeProfile,
    plan: TeachingPlan,
  ): Promise<ScientificModel> {
    const { system, user } = buildPrompt(PROMPT_IDS.INTERACTIVE_MODEL, {
      language: plan.language,
      topic: profile.topic,
      domain: profile.domain,
      title: item.title,
      objective: item.objective,
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      analogies: profile.analogies.join('; '),
    })

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    return validatedGenerate(user, ScientificModelSchema, boundCall, this.retryOptions)
  }

  private async generateHtml(
    item: OutlineItem,
    profile: KnowledgeProfile,
    plan: TeachingPlan,
    model: ScientificModel,
  ): Promise<string> {
    const { system, user } = buildPrompt(PROMPT_IDS.INTERACTIVE_HTML, {
      language: plan.language,
      teachingMethod: plan.teachingMethod,
      difficulty: profile.difficulty,
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      coreFormulas: model.core_formulas.join(' | '),
      mechanism: model.mechanism.join(' → '),
      constraints: model.constraints.join('; '),
      forbiddenErrors: model.forbidden_errors.join('; '),
    })

    let lastRaw = ''
    for (let attempt = 0; attempt < this.retryOptions.maxRetries; attempt++) {
      lastRaw = await this.callLLM(user, system)
      if (lastRaw.trim().length > 0) return lastRaw.trim()
      if (this.retryOptions.baseDelay > 0) {
        await new Promise(r => setTimeout(r, this.retryOptions.baseDelay * Math.pow(2, attempt)))
      }
    }

    throw new LLMOutputValidationError(
      `HTML generation failed after ${this.retryOptions.maxRetries} retries`,
      lastRaw,
      this.retryOptions.maxRetries,
    )
  }
}
```

- [ ] **Step 2: 运行测试，确认通过**

```bash
cd E:/CC/code/maolab
pnpm --filter @maolab/generator test
```

Expected: `interactive-worker.test.ts` 中 5 个测试全部 PASS，其他已有测试不受影响。

- [ ] **Step 3: 提交**

```bash
git -C E:/CC/code/maolab add packages/generator/src/workers/interactive-worker.ts packages/generator/src/__tests__/interactive-worker.test.ts
git -C E:/CC/code/maolab commit -m "feat(generator): add InteractiveWorker with two-pass LLM generation"
```

---

### Task 4: 注册 InteractiveWorker 并更新 index.ts

**Files:**
- Modify: `packages/generator/src/index.ts`

- [ ] **Step 1: 读取当前 index.ts**

读取 `packages/generator/src/index.ts` 确认现有内容。

- [ ] **Step 2: 更新 index.ts**

在 `createGenerationPipeline` 中注册 `InteractiveWorker`，并导出：

```typescript
// packages/generator/src/index.ts
import { createDb, createStageRepository } from '@maolab/db'
import { callLLM } from './llm/client.js'
import { KnowledgeProfileExtractor } from './knowledge/extractor.js'
import { WorkerRegistry } from './workers/registry.js'
import { SlideWorker } from './workers/slide-worker.js'
import { QuizWorker } from './workers/quiz-worker.js'
import { InteractiveWorker } from './workers/interactive-worker.js'
import { GenerationPipeline } from './pipeline/generation-pipeline.js'
import type { GeneratorConfig } from './types.js'
import type { RetryOptions } from './llm/validated-generate.js'

export { GenerationPipeline } from './pipeline/generation-pipeline.js'
export { WorkerRegistry } from './workers/registry.js'
export { KnowledgeProfileExtractor } from './knowledge/extractor.js'
export { SlideWorker } from './workers/slide-worker.js'
export { QuizWorker } from './workers/quiz-worker.js'
export { InteractiveWorker } from './workers/interactive-worker.js'
export { callLLM } from './llm/client.js'
export { validatedGenerate, LLMOutputValidationError } from './llm/validated-generate.js'
export type { GeneratorConfig } from './types.js'
export type { LLMConfig, LLMCallOptions } from './llm/client.js'
export type { ContentWorker } from './workers/types.js'
export type { GenerationEvent, EventHandler, PipelineOptions } from './pipeline/generation-pipeline.js'

const DEFAULT_RETRY: RetryOptions = { maxRetries: 3, baseDelay: 500 }

export function createGenerationPipeline(db: ReturnType<typeof createDb>, config: GeneratorConfig): GenerationPipeline {
  const stageRepo = createStageRepository(db)

  const boundCallLLM = (userPrompt: string, systemPrompt?: string) =>
    callLLM(userPrompt, config.llm, { jsonMode: true, ...(systemPrompt ? { systemPrompt } : {}) })

  const retryOpts = { ...DEFAULT_RETRY, ...config.retryOptions }

  const extractor = new KnowledgeProfileExtractor(boundCallLLM, retryOpts)

  const registry = new WorkerRegistry()
  registry.register(new SlideWorker(boundCallLLM, retryOpts))
  registry.register(new QuizWorker(boundCallLLM, retryOpts))
  registry.register(new InteractiveWorker(boundCallLLM, retryOpts))

  return new GenerationPipeline(stageRepo, registry, extractor, {
    ...(config.concurrency !== undefined ? { concurrency: config.concurrency } : {}),
  })
}
```

> **注意：** 这里 `boundCallLLM` 的签名从 `(prompt: string)` 扩展为 `(userPrompt: string, systemPrompt?: string)`，与 Plan 07 中 worker 调用方式保持一致。Plan 06 的 `callLLM` 支持 `options.systemPrompt`，所以此处可以正确转发。

- [ ] **Step 3: 运行全部测试**

```bash
cd E:/CC/code/maolab
pnpm --filter @maolab/generator test
```

Expected: 全部测试通过（包含 interactive-worker、slide、quiz、pipeline、extractor）。

- [ ] **Step 4: TypeScript 类型检查**

```bash
cd E:/CC/code/maolab/packages/generator
pnpm tsc --noEmit
```

Expected: 0 类型错误。

- [ ] **Step 5: 提交**

```bash
git -C E:/CC/code/maolab add packages/generator/src/index.ts
git -C E:/CC/code/maolab commit -m "feat(generator): register InteractiveWorker in pipeline factory"
```

---

## 自检清单

- [x] `InteractiveContent { type: 'interactive', html: string }` 已存在于 shared-types，无需修改
- [x] Pass 1 使用 `validatedGenerate` + `ScientificModelSchema`（Zod 验证）
- [x] Pass 2 带空值校验重试，超出 maxRetries 抛 `LLMOutputValidationError`
- [x] `callLLM` 签名兼容 Plan 07 的双参数 `(userPrompt, systemPrompt?)` 形式
- [x] `buildPrompt` 和 `PROMPT_IDS` 由 Plan 07 提供，测试中 mock 掉
- [x] 全部单元测试覆盖：正常两轮、调用次数验证、空值重试、重试耗尽、模型提取失败
- [x] TypeScript 0 错误
- [x] `createGenerationPipeline` 自动注册 `InteractiveWorker`，使用方无需改动

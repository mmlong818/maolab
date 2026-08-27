# Maolab: 音频重叠修复 + PPT主题 + 三步确认流程

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 TTS 音频重叠 bug，替换 PPT 幻灯片配色系统，并将快速开始流程改为「知识识别 → 教学内容 → 上课」三步确认向导。

**Architecture:**
- 音频修复：在 ClassroomClient / TeachClient 添加 generation counter，fetch 完成后校验是否仍有效，无效丢弃
- PPT 主题：新建 `slideThemes.ts` 定义两套高质量 token（暖光 light / 深夜 dark），4 个布局组件从 token 读取，不再硬编码
- 三步向导：快速开始页拆分为「填写信息 + AI 分析」两阶段，分析调用现有 `CurriculumDesigner`；generator 页生成完成后展示大纲 + 确认按钮替代自动跳转；pre-class 页添加步骤标头

**Tech Stack:** Next.js 14, React, TypeScript, Zod, @maolab/setup (CurriculumDesigner), existing DB layer

---

## 文件映射

| 文件 | 动作 | 说明 |
|------|------|------|
| `app/app/(classroom)/classroom/[stageId]/ClassroomClient.tsx` | 修改 | 添加 ttsGenRef，修复音频重叠 |
| `app/app/(classroom)/teach/[stageId]/TeachClient.tsx` | 修改 | 同上 |
| `app/app/(classroom)/classroom/[stageId]/slideThemes.ts` | 新建 | SlideThemeTokens 类型 + 两套主题 |
| `app/app/(classroom)/classroom/[stageId]/layouts/BulletsLayout.tsx` | 修改 | 使用 SlideThemeTokens |
| `app/app/(classroom)/classroom/[stageId]/layouts/StatementLayout.tsx` | 修改 | 使用 SlideThemeTokens |
| `app/app/(classroom)/classroom/[stageId]/layouts/FormulaLayout.tsx` | 修改 | 使用 SlideThemeTokens |
| `app/app/(classroom)/classroom/[stageId]/layouts/ProcessLayout.tsx` | 修改 | 使用 SlideThemeTokens |
| `app/app/(classroom)/classroom/[stageId]/SlideView.tsx` | 修改 | 解析 theme → token，传给各 Layout |
| `app/components/StepWizard.tsx` | 新建 | 三步进度条组件 |
| `app/lib/actions/setup.ts` | 修改 | 添加 `analyzeAndSave` server action |
| `app/app/(setup)/setup/quick/page.tsx` | 修改 | 两阶段 UI（填写 → 知识卡确认） |
| `app/app/(generator)/generator/[planId]/page.tsx` | 修改 | 完成后展示大纲 + 确认按钮 |
| `app/app/(classroom)/pre-class/[stageId]/PreClassClient.tsx` | 修改 | 顶部添加步骤 3 标头 |

---

## Task 1: 修复 ClassroomClient TTS 音频重叠

**Files:**
- Modify: `app/app/(classroom)/classroom/[stageId]/ClassroomClient.tsx`

**根因：** `playTTS` 调用 `fetchTTSUrl`（网络请求），在 fetch 飞行期间若场景切换，旧 fetch 完成后仍会 `new Audio().play()`，与新场景音频重叠。

- [ ] **Step 1: 在 ClassroomClient 添加 `ttsGenRef`**

在 `audioRef` 附近添加一行：

```typescript
const ttsGenRef = useRef(0)
```

- [ ] **Step 2: 场景切换时递增 generation**

在 `useEffect(..., [sceneId])` 块（第 73-85 行），在 `lastSpokenSceneRef.current = null` 之后添加：

```typescript
ttsGenRef.current += 1
```

slideIndex 变化时也需要递增（新增一个 effect）：

```typescript
useEffect(() => {
  ttsGenRef.current += 1
}, [slideIndex])
```

- [ ] **Step 3: `playTTS` 内校验 generation**

将 `playTTS` 改为：

```typescript
const playTTS = useCallback(async (text: string, onEnded: () => void) => {
  const gen = ttsGenRef.current
  setTtsLoading(true)
  try {
    const url = await fetchTTSUrl(text, voice)
    if (ttsGenRef.current !== gen) {
      URL.revokeObjectURL(url)
      setTtsLoading(false)
      return
    }
    ttsUrlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = onEnded
    audio.onerror = onEnded
    setTtsLoading(false)
    await audio.play()
  } catch {
    setTtsLoading(false)
    if (ttsGenRef.current === gen) onEnded()
  }
}, [voice])
```

- [ ] **Step 4: 验证逻辑正确**

快速思维验证：
- 场景 A 播放 → fetch 飞行中 → 用户点击下一节 → `sceneId` 变化 → `ttsGenRef.current` 从 0 → 1
- 旧 fetch 完成 → `gen === 0` ≠ `ttsGenRef.current === 1` → URL revoke，不播放 ✓
- 新场景的 `playTTS` 调用时 `gen === 1` → fetch 完成后 `ttsGenRef.current === 1` → 正常播放 ✓

- [ ] **Step 5: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/ClassroomClient.tsx
git commit -m "fix(classroom): prevent stale TTS fetch from playing after scene change"
```

---

## Task 2: 修复 TeachClient TTS 音频重叠

**Files:**
- Modify: `app/app/(classroom)/teach/[stageId]/TeachClient.tsx`

TeachClient 与 ClassroomClient 结构相同，同样有 `playTTS` + `audioRef` + `lastSpokenSceneRef`。

- [ ] **Step 1: 添加 `ttsGenRef`**

在 `audioRef` 声明之后添加：

```typescript
const ttsGenRef = useRef(0)
```

- [ ] **Step 2: 场景切换时递增**

在 `useEffect(..., [sceneId])` 块末尾（在 `lastSpokenSceneRef.current = null` 之后）：

```typescript
ttsGenRef.current += 1
```

在 `slideIndex` 的 `useEffect`（如果存在）或紧跟 `sceneId` effect 之后新增：

```typescript
useEffect(() => {
  ttsGenRef.current += 1
}, [slideIndex])
```

- [ ] **Step 3: `playTTS` 内校验 generation**

```typescript
const playTTS = useCallback(async (text: string, onEnded: () => void) => {
  const gen = ttsGenRef.current
  setTtsLoading(true)
  try {
    const url = await fetchTTSUrl(text, voice)
    if (ttsGenRef.current !== gen) {
      URL.revokeObjectURL(url)
      setTtsLoading(false)
      return
    }
    ttsUrlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = onEnded
    audio.onerror = onEnded
    setTtsLoading(false)
    await audio.play()
  } catch {
    setTtsLoading(false)
    if (ttsGenRef.current === gen) onEnded()
  }
}, [voice])
```

- [ ] **Step 4: Commit**

```bash
git add app/app/\(classroom\)/teach/\[stageId\]/TeachClient.tsx
git commit -m "fix(teach): prevent stale TTS fetch from playing after scene change"
```

---

## Task 3: 新建幻灯片主题 token 系统

**Files:**
- Create: `app/app/(classroom)/classroom/[stageId]/slideThemes.ts`

- [ ] **Step 1: 创建 `slideThemes.ts`**

```typescript
export interface SlideThemeTokens {
  bg: string
  surface: string
  border: string
  text: string
  muted: string
  accent: string
  tagBg: string
  tagText: string
  fontDisplay: string
  fontBody: string
  radius: number
  accentLine: string
}

export const SLIDE_THEMES: Record<'dark' | 'light', SlideThemeTokens> = {
  dark: {
    bg: '#0d1117',
    surface: '#161b22',
    border: '#21262d',
    text: '#f0f6fc',
    muted: '#c9d1d9',
    accent: '#58a6ff',
    tagBg: '#1f2d3d',
    tagText: '#58a6ff',
    fontDisplay: "'Segoe UI', system-ui, -apple-system, sans-serif",
    fontBody: "'Segoe UI', system-ui, -apple-system, sans-serif",
    radius: 6,
    accentLine: '#58a6ff',
  },
  light: {
    bg: '#faf8f5',
    surface: '#f0ece6',
    border: '#ddd8cf',
    text: '#2d2926',
    muted: '#6b6258',
    accent: '#c0533a',
    tagBg: '#fdf0eb',
    tagText: '#c0533a',
    fontDisplay: "'Georgia', 'Times New Roman', serif",
    fontBody: "'Segoe UI', system-ui, -apple-system, sans-serif",
    radius: 6,
    accentLine: '#c0533a',
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/slideThemes.ts
git commit -m "feat(slides): add SlideThemeTokens system with dark/light presets"
```

---

## Task 4: 将主题 token 应用到布局组件

**Files:**
- Modify: `app/app/(classroom)/classroom/[stageId]/layouts/BulletsLayout.tsx`
- Modify: `app/app/(classroom)/classroom/[stageId]/layouts/StatementLayout.tsx`
- Modify: `app/app/(classroom)/classroom/[stageId]/layouts/FormulaLayout.tsx`
- Modify: `app/app/(classroom)/classroom/[stageId]/layouts/ProcessLayout.tsx`
- Modify: `app/app/(classroom)/classroom/[stageId]/SlideView.tsx`

- [ ] **Step 1: 更新 BulletsLayout**

将现有的 `DARK` / `LIGHT` 常量删除，改为接受 `tokens` prop：

```typescript
import type { SlideThemeTokens } from '../slideThemes'
import type { SlideData } from '@maolab/shared-types'

interface Props {
  slide: SlideData
  tokens: SlideThemeTokens
}

export default function BulletsLayout({ slide, tokens: c }: Props) {
  const bullets = slide.body
    .split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)

  return (
    <div style={{
      background: c.bg,
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      border: `1px solid ${c.border}`,
      fontFamily: c.fontBody,
    }}>
      <div style={{
        padding: '4% 6% 3%',
        borderBottom: `1px solid ${c.border}`,
        flexShrink: 0,
        background: c.surface,
      }}>
        <div style={{
          fontSize: '1.1vw',
          color: c.tagText,
          background: c.tagBg,
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: c.radius,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: 'uppercase' as const,
          marginBottom: 8,
          fontFamily: c.fontBody,
        }}>
          {slide.visualHint}
        </div>
        <div style={{
          fontSize: '2.8vw',
          color: c.text,
          fontWeight: 800,
          lineHeight: 1.1,
          fontFamily: c.fontDisplay,
        }}>
          {slide.title}
        </div>
      </div>

      <div style={{
        flex: 1,
        padding: '3% 6%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2%',
      }}>
        {bullets.map((bullet, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '2%',
            padding: '2% 3%',
            background: c.surface,
            borderRadius: c.radius,
            borderLeft: `3px solid ${c.accentLine}`,
          }}>
            <span style={{
              fontSize: '1.4vw',
              fontWeight: 900,
              color: c.accent,
              flexShrink: 0,
              minWidth: '3%',
              fontFamily: c.fontBody,
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{
              fontSize: '1.4vw',
              color: c.muted,
              lineHeight: 1.4,
              fontFamily: c.fontBody,
            }}>
              {bullet}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 更新 StatementLayout**

读取 `StatementLayout.tsx` 现有结构（行数较短），将 `DARK`/`LIGHT` 常量删除，改为：

```typescript
import type { SlideThemeTokens } from '../slideThemes'
import type { SlideData } from '@maolab/shared-types'

interface Props {
  slide: SlideData
  tokens: SlideThemeTokens
}
```

内部将所有 `c.bg` / `c.text` 等引用替换，与 BulletsLayout 模式保持一致。具体替换时 **read the file first** 再编辑，保留原有布局结构，仅替换 token 来源。

- [ ] **Step 3: 更新 FormulaLayout**

同 Step 2 操作模式，read → 替换常量引用 → tokens prop。

- [ ] **Step 4: 更新 ProcessLayout**

同 Step 2。

- [ ] **Step 5: 更新 SlideView.tsx — 在此解析 theme → tokens**

```typescript
'use client'

import { motion } from 'motion/react'
import type { SlideContent } from '@maolab/shared-types'
import { SLIDE_THEMES } from './slideThemes'
import BulletsLayout from './layouts/BulletsLayout'
import FormulaLayout from './layouts/FormulaLayout'
import StatementLayout from './layouts/StatementLayout'
import ProcessLayout from './layouts/ProcessLayout'

interface Props {
  content: SlideContent
  theme: 'dark' | 'light'
  currentStep?: number
  currentSlide?: number
}

export default function SlideView({ content, theme, currentStep, currentSlide }: Props) {
  const slide = content.slides[currentSlide ?? 0]
  if (!slide) return <div style={{ color: '#888', padding: 40 }}>No slide content</div>

  const tokens = SLIDE_THEMES[theme]
  const layout = slide.layout ?? 'bullets'

  const motionStyle = {
    width: '100%' as const,
    aspectRatio: '16 / 9' as const,
    overflow: 'hidden' as const,
    borderRadius: 8,
  }
  const motionAnim = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 },
    style: motionStyle,
  }

  if (layout === 'formula') {
    return <motion.div key={currentSlide} {...motionAnim}><FormulaLayout slide={slide} tokens={tokens} /></motion.div>
  }
  if (layout === 'statement') {
    return <motion.div key={currentSlide} {...motionAnim}><StatementLayout slide={slide} tokens={tokens} /></motion.div>
  }
  if (layout === 'process') {
    return <motion.div key={currentSlide} {...motionAnim}><ProcessLayout slide={slide} tokens={tokens} {...(currentStep !== undefined ? { currentStep } : {})} /></motion.div>
  }
  return <motion.div key={currentSlide} {...motionAnim}><BulletsLayout slide={slide} tokens={tokens} /></motion.div>
}
```

- [ ] **Step 6: 类型检查**

```bash
cd app && pnpm typecheck 2>&1 | head -30
```

预期：无错误（仅 slideThemes token 相关改动，接口完全对齐）

- [ ] **Step 7: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/slideThemes.ts \
        app/app/\(classroom\)/classroom/\[stageId\]/SlideView.tsx \
        app/app/\(classroom\)/classroom/\[stageId\]/layouts/
git commit -m "feat(slides): apply theme token system to all layout components"
```

---

## Task 5: 创建 StepWizard 共享组件

**Files:**
- Create: `app/app/components/StepWizard.tsx`

注意：`app/components/` 目录不存在，创建在 `app/app/components/` 下（与 Next.js app 目录同级）。

- [ ] **Step 1: 创建目录并写组件**

```typescript
// app/app/components/StepWizard.tsx
interface Step {
  label: string
  sublabel?: string
}

interface Props {
  steps: Step[]
  currentStep: number  // 0-indexed
}

export default function StepWizard({ steps, currentStep }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      padding: '0 0 32px',
      userSelect: 'none',
    }}>
      {steps.map((step, i) => {
        const done = i < currentStep
        const active = i === currentStep
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: done ? '#16a34a' : active ? '#2563eb' : '#e5e7eb',
                color: done || active ? '#fff' : '#9ca3af',
                transition: 'all 0.2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '0.78rem',
                  fontWeight: active ? 700 : 500,
                  color: active ? '#1d4ed8' : done ? '#15803d' : '#6b7280',
                }}>
                  {step.label}
                </div>
                {step.sublabel && (
                  <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
                    {step.sublabel}
                  </div>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 64,
                height: 2,
                background: i < currentStep ? '#16a34a' : '#e5e7eb',
                margin: '0 8px',
                marginBottom: 24,
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/app/components/StepWizard.tsx
git commit -m "feat(ui): add StepWizard component for 3-phase wizard"
```

---

## Task 6: 添加 `analyzeAndSave` server action

**Files:**
- Modify: `app/lib/actions/setup.ts`

此 action 调用 `CurriculumDesigner.design(topic, targetAudience)` —— 这个类已存在于 `@maolab/setup`，它会同时输出 `knowledgeAnalysis` 和 `outline`。将结果保存为 TeachingPlan，返回 `{ planId, design }` 给前端展示知识卡。

- [ ] **Step 1: 确认 CurriculumDesigner 已从 @maolab/setup 导出**

```bash
grep -n "CurriculumDesigner" E:/CC/code/maolab/packages/setup/src/index.ts
```

预期输出包含：`export { CurriculumDesigner }` 或类似行。若没有，继续 Step 2 前先添加导出。

- [ ] **Step 2: 在 `setup.ts` 顶部添加导入**

在现有 import 行之后：

```typescript
import { CurriculumDesigner, TeachingPlanBuilder } from '@maolab/setup'
import type { CurriculumDesignResult } from '@maolab/setup'
```

注意：`TeachingPlanBuilder` 已被导入（用于 `quickDecideAndSave`）。仅补充 `CurriculumDesigner` 和 `CurriculumDesignResult`。

- [ ] **Step 3: 添加 `analyzeAndSave` 函数**

在文件末尾添加：

```typescript
export interface KnowledgeProfileForUI {
  planId: string
  topic: string
  audienceSummary: string
  bloomsLevel: string
  primaryType: string
  learningObjectives: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  reasoning: string
  outlinePreview: Array<{ title: string; sceneType: string; objective: string }>
}

const BLOOM_ZH: Record<string, string> = {
  remember: 'L1 记忆',
  understand: 'L2 理解',
  apply: 'L3 应用',
  analyze: 'L4 分析',
  evaluate: 'L5 评价',
  create: 'L6 创造',
}

const PRIMARY_TYPE_ZH: Record<string, string> = {
  factual: '事实性知识',
  conceptual: '概念性知识',
  procedural: '程序性知识',
  metacognitive: '元认知知识',
}

export async function analyzeAndSave(
  topic: string,
  gradeLevel: string | undefined,
  audienceState: string,
): Promise<KnowledgeProfileForUI> {
  const topicParsed = z.string().min(1).max(200).parse(topic)
  const audienceParsed = z.string().min(1).max(500).parse(audienceState)

  const targetAudience = gradeLevel
    ? `${gradeLevel}学生。${audienceParsed}`
    : audienceParsed

  const llm = getLLMConfig()
  const designer = new CurriculumDesigner(llm)

  const profile = await designer.design(topicParsed, targetAudience, 'zh-CN')

  // Map CurriculumDesignResult → QuickDecisionResult shape for plan builder
  const quickResult = {
    topic: profile.topic,
    style: 'lecture' as const,
    language: profile.language,
    difficulty: profile.difficulty,
    agentCount: 2,
    outline: profile.outline.map(item => ({
      title: item.title,
      sceneType: item.sceneType as 'slide' | 'quiz' | 'interactive' | 'hotspot' | 'comparison' | 'drag-drop' | 'cloze' | 'animation' | 'branching',
      objective: item.objective,
      durationHint: item.durationHint,
    })),
    reasoning: profile.reasoning,
  }

  const userSvc = createUserProfileService(getDbUrl())
  const mastery = await userSvc.listConceptMastery()
  const weakConcepts = mastery.filter(m => m.score < 0.6).map(m => m.conceptId)

  const plan = TeachingPlanBuilder.fromQuickDecision(quickResult, weakConcepts, gradeLevel)

  const db = getDb()
  const planRepo = createTeachingPlanRepository(db)
  await planRepo.save(plan)

  return {
    planId: plan.id,
    topic: profile.topic,
    audienceSummary: profile.targetAudience,
    bloomsLevel: BLOOM_ZH[profile.knowledgeAnalysis.bloomsLevel ?? 'understand'] ?? 'L2 理解',
    primaryType: PRIMARY_TYPE_ZH[profile.knowledgeAnalysis.primaryType] ?? profile.knowledgeAnalysis.primaryType,
    learningObjectives: profile.outline.slice(0, 4).map(item => item.objective),
    difficulty: profile.difficulty,
    reasoning: profile.reasoning,
    outlinePreview: profile.outline.map(item => ({
      title: item.title,
      sceneType: item.sceneType,
      objective: item.objective,
    })),
  }
}
```

- [ ] **Step 4: 检查 @maolab/setup 的 index.ts 是否导出 CurriculumDesigner**

```bash
grep "CurriculumDesigner" E:/CC/code/maolab/packages/setup/src/index.ts
```

若未导出，在 `index.ts` 中添加：

```typescript
export { CurriculumDesigner } from './curriculum-designer.js'
export type { CurriculumDesignResult } from './types.js'
```

- [ ] **Step 5: 类型检查**

```bash
cd app && pnpm typecheck 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add app/lib/actions/setup.ts packages/setup/src/index.ts
git commit -m "feat(setup): add analyzeAndSave action using CurriculumDesigner"
```

---

## Task 7: 重设计快速开始页为两阶段向导

**Files:**
- Modify: `app/app/(setup)/setup/quick/page.tsx`

将原来的单页（填写 → 直接生成）改为两阶段：
- Phase A（`step === 'form'`）：填写主题、学段、授课对象现状
- Phase B（`step === 'profile'`）：展示 AI 知识卡 + 大纲预览，用户确认后跳转 generator

- [ ] **Step 1: 写新的 `quick/page.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { analyzeAndSave } from '@/lib/actions/setup'
import type { KnowledgeProfileForUI } from '@/lib/actions/setup'
import StepWizard from '@/app/components/StepWizard'

const GRADE_OPTIONS = [
  { value: '', label: '不指定' },
  { value: '小学', label: '小学' },
  { value: '初中', label: '初中' },
  { value: '高中', label: '高中' },
  { value: '大学', label: '大学 / 成人' },
]

const SCENE_TYPE_ICON: Record<string, string> = {
  slide: '📊', quiz: '✅', animation: '🎬', hotspot: '🔍',
  comparison: '⚖️', 'drag-drop': '🎯', cloze: '✏️',
  interactive: '🔬', branching: '🌿',
}

const DIFFICULTY_ZH: Record<string, string> = {
  beginner: '入门', intermediate: '中级', advanced: '进阶',
}

const WIZARD_STEPS = [
  { label: '知识识别', sublabel: 'AI 分析授课对象' },
  { label: '教学内容', sublabel: '生成课程场景' },
  { label: '上课', sublabel: '选择老师开始' },
]

export default function QuickSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'form' | 'profile'>('form')
  const [topic, setTopic] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [audienceState, setAudienceState] = useState('')
  const [profile, setProfile] = useState<KnowledgeProfileForUI | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim() || !audienceState.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await analyzeAndSave(topic.trim(), gradeLevel || undefined, audienceState.trim())
        setProfile(result)
        setStep('profile')
      } catch (err) {
        setError(err instanceof Error ? err.message : '分析失败，请重试')
      }
    })
  }

  function handleConfirm() {
    if (!profile) return
    router.push(`/generator/${profile.planId}`)
  }

  return (
    <main className="mx-auto max-w-2xl py-10 px-4">
      <StepWizard steps={WIZARD_STEPS} currentStep={0} />

      {step === 'form' && (
        <form onSubmit={handleAnalyze} className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold mb-1">知识识别</h1>
            <p className="text-sm text-gray-500">描述你的授课对象，AI 将分析认知起点并设计课程目标。</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">教学主题 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="例如：牛顿三定律、光合作用、二战起因"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">学段 / 年级</label>
            <div className="flex gap-2 flex-wrap">
              {GRADE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGradeLevel(opt.value)}
                  disabled={isPending}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    gradeLevel === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              授课对象现状 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={audienceState}
              onChange={e => setAudienceState(e.target.value)}
              placeholder="例如：高中生，已学过基础力学，对向量概念模糊，喜欢直观例子，不擅长纯数学推导"
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              disabled={isPending}
            />
            <p className="text-xs text-gray-400 mt-1">描述学生的已有知识、薄弱点、学习风格等</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending || !topic.trim() || !audienceState.trim()}
            className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            {isPending ? 'AI 分析中…' : '分析授课对象 →'}
          </button>
        </form>
      )}

      {step === 'profile' && profile && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">知识识别结果</h1>
            <p className="text-sm text-gray-500">AI 已分析授课对象，请确认课程设计方向。</p>
          </div>

          {/* 知识卡 */}
          <div className="border rounded-xl p-5 bg-blue-50 border-blue-200 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold bg-blue-600 text-white px-2 py-0.5 rounded">{profile.bloomsLevel}</span>
              <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{profile.primaryType}</span>
              <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded">{DIFFICULTY_ZH[profile.difficulty] ?? profile.difficulty}</span>
            </div>
            <p className="text-sm text-gray-700">{profile.audienceSummary}</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">学习目标</p>
              <ul className="space-y-1">
                {profile.learningObjectives.map((obj, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-500 italic">{profile.reasoning}</p>
          </div>

          {/* 大纲预览 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">课程大纲预览（{profile.outlinePreview.length} 个场景）</p>
            <div className="space-y-1.5">
              {profile.outlinePreview.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="shrink-0 text-base">{SCENE_TYPE_ICON[item.sceneType] ?? '📄'}</span>
                  <div>
                    <span className="font-medium text-gray-800">{item.title}</span>
                    <span className="text-gray-400 text-xs ml-2">{item.objective}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('form')}
              className="px-4 py-2.5 rounded-lg border text-sm text-gray-600 hover:bg-gray-50"
            >
              ← 重新填写
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              确认，生成课程内容 →
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: 类型检查**

```bash
cd app && pnpm typecheck 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/app/\(setup\)/setup/quick/page.tsx app/app/components/StepWizard.tsx
git commit -m "feat(setup): redesign quick setup as 2-phase knowledge recognition wizard"
```

---

## Task 8: 更新 Generator 页面 — 完成后展示大纲 + 确认按钮

**Files:**
- Modify: `app/app/(generator)/generator/[planId]/page.tsx`

当前问题：生成完成后 1.8s 自动跳转，用户看不到大纲。
目标：完成后展示场景列表（来自 stageId），用户点击「确认，开始选课准备」才跳转。

- [ ] **Step 1: 添加获取 stage scenes 的 server action**

在 `app/lib/actions/setup.ts` 末尾添加：

```typescript
export interface ScenePreview {
  id: string
  title: string
  type: string
}

export async function getStageScenes(stageId: string): Promise<ScenePreview[]> {
  const stageIdParsed = z.string().uuid().parse(stageId)
  const db = getDb()
  // Stage scenes 存储在 DB 中，通过 stageRepo 获取
  // 注意：需要 import createStageRepository from @maolab/db
  const { createStageRepository } = await import('@maolab/db')
  const stageRepo = createStageRepository(db)
  const stage = await stageRepo.findById(stageIdParsed)
  if (!stage) return []
  return stage.scenes.map(s => ({
    id: s.id,
    title: s.title,
    type: s.content.type,
  }))
}
```

**注意**：先 `grep -n "createStageRepository\|StageRepository" E:/CC/code/maolab/packages/db/src/index.ts` 确认导出名称，如名称不同则相应调整。

- [ ] **Step 2: 更新 generator/[planId]/page.tsx**

删除自动跳转 `useEffect`（第 133-137 行），在 `state === 'done'` 区块添加大纲展示：

新增状态：
```typescript
const [scenes, setScenes] = useState<Array<{ id: string; title: string; type: string }>>([])
```

在 `stage_done` 事件处理后（state 设为 done 后），加载 scenes：
```typescript
// 在 useEffect 里，state === 'done' && stageId 时调用
useEffect(() => {
  if (state !== 'done' || !stageId) return
  void getStageScenes(stageId).then(setScenes)
}, [state, stageId])
```

将 `state === 'done'` 区块替换为：

```tsx
{state === 'done' && (
  <div className="space-y-4">
    <StepWizard
      steps={[
        { label: '知识识别', sublabel: '已完成' },
        { label: '教学内容', sublabel: '确认大纲' },
        { label: '上课', sublabel: '选择老师' },
      ]}
      currentStep={1}
    />

    <div>
      <p className="text-green-600 font-semibold text-lg mb-1">✓ 课程内容已生成</p>
      <p className="text-sm text-gray-600">共 {sceneDoneCount} 个场景{sceneErrorCount > 0 ? `，${sceneErrorCount} 个失败` : ''}</p>
    </div>

    {scenes.length > 0 && (
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">教学内容大纲</p>
        <div className="space-y-1.5">
          {scenes.map((scene, i) => (
            <div key={scene.id} className="flex items-center gap-2.5 text-sm py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-gray-400 text-xs w-5 text-right shrink-0">{i + 1}</span>
              <span className="font-medium text-gray-800">{scene.title}</span>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{scene.type}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="flex gap-3 pt-2">
      <Link href="/history" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
        查看历史
      </Link>
      {stageId && (
        <button
          onClick={() => router.push(`/pre-class/${stageId}`)}
          className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
        >
          确认，开始选课准备 →
        </button>
      )}
    </div>
  </div>
)}
```

在文件顶部添加 import：
```typescript
import { getStageScenes } from '@/lib/actions/setup'
import StepWizard from '@/app/components/StepWizard'
```

- [ ] **Step 3: 类型检查**

```bash
cd app && pnpm typecheck 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add app/app/\(generator\)/generator/\[planId\]/page.tsx app/lib/actions/setup.ts
git commit -m "feat(generator): show outline on completion, require user confirmation before pre-class"
```

---

## Task 9: 在 PreClassClient 添加第三步标头

**Files:**
- Modify: `app/app/(classroom)/pre-class/[stageId]/PreClassClient.tsx`

- [ ] **Step 1: 在 PreClassClient 顶部插入 StepWizard（步骤 3）**

在 `return (` 之后、`<div className="min-h-screen...">` 的第一个子元素位置插入：

```tsx
import StepWizard from '@/app/components/StepWizard'

// 在 return 内容顶部，<div className="text-center"> 之前：
<StepWizard
  steps={[
    { label: '知识识别' },
    { label: '教学内容' },
    { label: '上课', sublabel: '选择老师开始' },
  ]}
  currentStep={2}
/>
```

- [ ] **Step 2: 类型检查 + Commit**

```bash
cd app && pnpm typecheck 2>&1 | grep -E "error|Error" | head -10
git add app/app/\(classroom\)/pre-class/\[stageId\]/PreClassClient.tsx
git commit -m "feat(pre-class): add step 3 indicator to pre-class page"
```

---

## Task 10: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd app && pnpm dev
```

- [ ] **Step 2: 验证音频修复**

访问任意课程 → 开始播放 → 快速连续点击「下一节」多次 → 确认音频不重叠（只有最后一节的音频播放）

- [ ] **Step 3: 验证 PPT 主题**

进入课堂 → 找到幻灯片类型场景 → 切换深色/浅色主题 → 确认：
- 浅色：暖米白背景，衬线标题字体，砖红 accent
- 深色：暗蓝背景，蓝色 accent，现代感

- [ ] **Step 4: 验证三步流程**

访问 `/setup/quick` →
1. 填写主题、学段、授课对象现状 → 点击「分析授课对象」
2. 看到知识卡（布鲁姆层级、知识类型、大纲预览）→ 点击「确认，生成课程内容」
3. 跳转 generator，看到生成进度 → 完成后看到大纲列表 → 点击「确认，开始选课准备」
4. 跳转 pre-class → 顶部看到步骤 3 高亮

- [ ] **Step 5: 最终 commit**

```bash
git status
# 确认无遗漏文件
```

---

## 自检结果

**Spec 覆盖检查：**
- ✅ 音频重叠修复 → Task 1, 2
- ✅ PPT 色彩排版改善 → Task 3, 4
- ✅ 知识识别步骤（AI分析授课对象 + curriculum-design-methodology） → Task 6, 7
- ✅ 教学内容步骤确认 → Task 8
- ✅ 上课步骤标头 → Task 9
- ✅ 步骤指示组件 → Task 5

**接口一致性：**
- `SlideThemeTokens` 在 Task 3 定义，Task 4 所有组件使用同一类型
- `StepWizard` 在 Task 5 定义，Task 7, 8, 9 引用路径均为 `@/app/components/StepWizard`
- `KnowledgeProfileForUI` 在 Task 6 定义并导出，Task 7 导入使用
- `getStageScenes` 在 Task 8 Step 1 定义并导出，同 step 引用

# Slide Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 slide 场景从纯文字渲染升级为具有 4 种布局模板、明暗主题切换和 process 布局步骤自动推进能力的真正幻灯片。

**Architecture:** 在 `shared-types` 中扩展 `SlideData` 增加 `layout` 和 `steps` 字段；前端 `SlideView` 作为分发器根据 layout 渲染对应布局组件；`ClassroomClient` 持有 `theme` state 和 `stepIndex` state，通过 props 逐层传递；计时器在 playing + process 布局时按 `durationHint / steps.length` 间隔推进步骤。

**Tech Stack:** React, TypeScript, CSS container queries (cqw), Zustand, Vitest, Next.js 15, pnpm workspace monorepo

---

## File Map

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/shared-types/src/stage.ts` | Modify | 增加 `SlideLayout` 类型，扩展 `SlideData` |
| `app/app/(classroom)/classroom/[stageId]/SlideView.tsx` | Rewrite | 改为分发器，接收 theme/currentStep props |
| `app/app/(classroom)/classroom/[stageId]/layouts/BulletsLayout.tsx` | Create | 要点列表布局 |
| `app/app/(classroom)/classroom/[stageId]/layouts/FormulaLayout.tsx` | Create | 公式主导布局 |
| `app/app/(classroom)/classroom/[stageId]/layouts/StatementLayout.tsx` | Create | 冲击陈述布局 |
| `app/app/(classroom)/classroom/[stageId]/layouts/ProcessLayout.tsx` | Create | 过程推进布局（有步骤动画） |
| `app/app/(classroom)/classroom/[stageId]/SceneRenderer.tsx` | Modify | 透传 theme/currentStep props |
| `app/app/(classroom)/classroom/[stageId]/ClassroomClient.tsx` | Modify | 增加 theme state、stepIndex state、计时器、切换按钮 |
| `packages/generator/src/prompts/templates/slide/system.md` | Modify | 追加布局选择规则 |
| `packages/generator/src/prompts/templates/slide/user.md` | Modify | 增加 layout/steps 字段说明 |
| `packages/classroom/src/__tests__/playback-engine.test.ts` | No change | 现有测试无需改动 |

---

## Task 1: 扩展 shared-types — SlideLayout + steps

**Files:**
- Modify: `packages/shared-types/src/stage.ts`

- [ ] **Step 1: 在 `stage.ts` 中增加 `SlideLayout` 类型并扩展 `SlideData`**

将文件中 `SlideData` 接口（第 8-13 行）替换为：

```typescript
export type SlideLayout =
  | 'formula'
  | 'bullets'
  | 'compare'
  | 'statement'
  | 'summary'
  | 'process'

export interface SlideData {
  title: string
  layout: SlideLayout
  body: string
  steps?: string[]
  speakerNote: string
  visualHint: string
}
```

- [ ] **Step 2: 验证类型编译通过**

```bash
cd E:/CC/code/maolab
pnpm --filter @maolab/shared-types build
```

Expected: 无错误输出，`packages/shared-types/dist/` 文件更新。

- [ ] **Step 3: 检查 monorepo 其他包是否受影响**

```bash
pnpm typecheck 2>&1 | head -50
```

Expected: 没有新的 TS 错误（旧 slide 数据中 layout 为可选字段，但类型声明是必填的——这没关系，因为向后兼容在 SlideView 层处理，新生成的数据会有 layout 字段）。

如果出现 "Property 'layout' is missing" 错误，在 `SlideData` 中将 layout 改为可选：`layout?: SlideLayout`，然后 SlideView 中用 `?? 'bullets'` 回退即可。

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/stage.ts
git commit -m "feat(shared-types): add SlideLayout type and steps field to SlideData"
```

---

## Task 2: BulletsLayout 组件

**Files:**
- Create: `app/app/(classroom)/classroom/[stageId]/layouts/BulletsLayout.tsx`

- [ ] **Step 1: 创建 `layouts/` 目录并写 BulletsLayout**

创建文件 `app/app/(classroom)/classroom/[stageId]/layouts/BulletsLayout.tsx`：

```tsx
'use client'

import type { SlideData } from '@maolab/shared-types'

const DARK = {
  bg: '#0d1117', surface: '#161b22', border: '#21262d',
  text: '#f0f6fc', muted: '#c9d1d9', accent: '#3b82f6',
  tag: '#3b82f6', footerText: '#484f58',
}
const LIGHT = {
  bg: '#ffffff', surface: '#f3f4f6', border: '#e5e7eb',
  text: '#111827', muted: '#374151', accent: '#2563eb',
  tag: '#2563eb', footerText: '#9ca3af',
}

interface Props {
  slide: SlideData
  theme: 'dark' | 'light'
}

export default function BulletsLayout({ slide, theme }: Props) {
  const c = theme === 'dark' ? DARK : LIGHT
  const bullets = slide.body
    .split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)

  return (
    <div style={{
      background: c.bg, display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      border: theme === 'light' ? `1px solid ${c.border}` : 'none',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '4% 6% 3%', borderBottom: `1px solid ${c.border}`,
        flexShrink: 0,
        background: theme === 'light' ? '#f9fafb' : c.bg,
      }}>
        <div style={{ fontSize: '1.1vw', color: c.tag, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          {slide.visualHint}
        </div>
        <div style={{ fontSize: '2.8vw', color: c.text, fontWeight: 800, lineHeight: 1.1 }}>
          {slide.title}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '3% 6%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2%' }}>
        {bullets.map((bullet, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '2%',
            padding: '2% 3%', background: c.surface, borderRadius: 6,
            borderLeft: `3px solid ${c.accent}`,
          }}>
            <span style={{ fontSize: '1.6vw', fontWeight: 900, color: c.accent, flexShrink: 0, minWidth: '3%' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ fontSize: '1.4vw', color: c.muted, lineHeight: 1.3 }}>{bullet}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '2% 6%', borderTop: `1px solid ${c.border}`,
        fontSize: '.9vw', color: c.footerText, flexShrink: 0,
        background: theme === 'light' ? '#f9fafb' : c.bg,
      }}>
        {slide.speakerNote}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证 TS 编译**

```bash
cd E:/CC/code/maolab
pnpm typecheck 2>&1 | grep -i "BulletsLayout\|error" | head -20
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/layouts/BulletsLayout.tsx
git commit -m "feat(classroom): add BulletsLayout slide component"
```

---

## Task 3: FormulaLayout 组件

**Files:**
- Create: `app/app/(classroom)/classroom/[stageId]/layouts/FormulaLayout.tsx`

- [ ] **Step 1: 创建 FormulaLayout**

```tsx
'use client'

import type { SlideData } from '@maolab/shared-types'

const DARK = {
  bg: '#000', border: '#1f2937', text: '#fff',
  accent: '#3b82f6', desc: '#8b949e', descBold: '#f0f6fc',
  note: '#3a4a5a', tag: '#3b82f6',
}
const LIGHT = {
  bg: '#f8fafc', border: '#e2e8f0', text: '#111827',
  accent: '#2563eb', desc: '#6b7280', descBold: '#111827',
  note: '#9ca3af', tag: '#2563eb',
}

interface Props {
  slide: SlideData
  theme: 'dark' | 'light'
}

export default function FormulaLayout({ slide, theme }: Props) {
  const c = theme === 'dark' ? DARK : LIGHT

  return (
    <div style={{
      background: c.bg, display: 'flex', width: '100%', height: '100%',
      border: theme === 'light' ? `1px solid ${c.border}` : 'none',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Blue stripe */}
      <div style={{ width: 5, flexShrink: 0, background: c.accent }} />

      {/* Left: formula zone — uses containerType for cqw scaling */}
      <div style={{
        width: '60%', flexShrink: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '6% 5%',
        borderRight: `1px solid ${c.border}`, gap: '6%',
        containerType: 'inline-size',
      } as React.CSSProperties}>
        <div style={{ fontSize: '1vw', color: c.tag, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {slide.visualHint}
        </div>
        <div style={{
          fontSize: '20cqw', fontWeight: 900, color: c.text,
          fontFamily: 'Georgia, serif', lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          {slide.title}
        </div>
      </div>

      {/* Right: description */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6% 4%', gap: '6%' }}>
        <div style={{ fontSize: '1.3vw', color: c.desc, lineHeight: 1.9 }}>
          {slide.body}
        </div>
        <div style={{ fontSize: '.9vw', color: c.note, paddingTop: '5%', borderTop: `1px solid ${c.border}` }}>
          {slide.speakerNote}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck 2>&1 | grep "FormulaLayout\|error" | head -20
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/layouts/FormulaLayout.tsx
git commit -m "feat(classroom): add FormulaLayout slide component with cqw formula scaling"
```

---

## Task 4: StatementLayout 组件

**Files:**
- Create: `app/app/(classroom)/classroom/[stageId]/layouts/StatementLayout.tsx`

- [ ] **Step 1: 创建 StatementLayout**

```tsx
'use client'

import type { SlideData } from '@maolab/shared-types'

const DARK = { bg: '#0f172a', text: '#f8fafc', accent: '#3b82f6', source: '#475569' }
const LIGHT = { bg: '#eff6ff', text: '#1e3a8a', accent: '#2563eb', source: '#64748b', border: '#bfdbfe' }

interface Props {
  slide: SlideData
  theme: 'dark' | 'light'
}

export default function StatementLayout({ slide, theme }: Props) {
  const c = theme === 'dark' ? DARK : LIGHT

  return (
    <div style={{
      background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%',
      border: theme === 'light' ? `1px solid ${(c as typeof LIGHT).border}` : 'none',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{ textAlign: 'center', padding: '0 10%' }}>
        <div style={{ fontSize: '3.2vw', fontWeight: 900, color: c.text, lineHeight: 1.4 }}>
          {slide.title}
        </div>
        <div style={{ width: 60, height: 4, background: c.accent, margin: '3% auto', borderRadius: 2 }} />
        <div style={{ fontSize: '1.8vw', color: c.text, lineHeight: 1.6, marginBottom: '3%' }}>
          {slide.body}
        </div>
        {slide.speakerNote && (
          <div style={{ fontSize: '1.1vw', color: c.source }}>
            — {slide.speakerNote}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck 2>&1 | grep "StatementLayout\|error" | head -20
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/layouts/StatementLayout.tsx
git commit -m "feat(classroom): add StatementLayout slide component"
```

---

## Task 5: ProcessLayout 组件

**Files:**
- Create: `app/app/(classroom)/classroom/[stageId]/layouts/ProcessLayout.tsx`

- [ ] **Step 1: 创建 ProcessLayout**

```tsx
'use client'

import type { SlideData } from '@maolab/shared-types'

const DARK = {
  bg: '#0d1117', surface: '#161b22', border: '#21262d',
  text: '#f0f6fc', muted: '#8b949e', accent: '#3b82f6',
  done: '#1a4a2e', doneBorder: '#2ea043', doneText: '#3fb950',
  footerText: '#484f58',
}
const LIGHT = {
  bg: '#ffffff', surface: '#f3f4f6', border: '#e5e7eb',
  text: '#111827', muted: '#6b7280', accent: '#2563eb',
  done: '#dbeafe', doneBorder: '#93c5fd', doneText: '#1d4ed8',
  footerText: '#9ca3af',
}

interface Props {
  slide: SlideData
  theme: 'dark' | 'light'
  currentStep?: number
}

export default function ProcessLayout({ slide, theme, currentStep = -1 }: Props) {
  const c = theme === 'dark' ? DARK : LIGHT
  const steps = slide.steps ?? slide.body.split('\n').map(l => l.replace(/^[-*\d.]\s*/, '').trim()).filter(Boolean)

  return (
    <div style={{
      background: c.bg, display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      border: theme === 'light' ? `1px solid ${c.border}` : 'none',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: '4% 6% 3%', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: '1.1vw', color: c.accent, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          {slide.visualHint}
        </div>
        <div style={{ fontSize: '2.8vw', color: c.text, fontWeight: 800, lineHeight: 1.1 }}>
          {slide.title}
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, padding: '3% 6%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2%' }}>
        {steps.map((step, i) => {
          const revealed = i <= currentStep
          const isCurrent = i === currentStep
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '2%',
              padding: '2% 3%', borderRadius: 6,
              background: revealed ? c.done : c.surface,
              border: `1px solid ${revealed ? c.doneBorder : c.border}`,
              opacity: revealed ? 1 : 0.35,
              transition: 'all 0.4s ease',
            }}>
              <span style={{
                width: '2.4vw', height: '2.4vw', borderRadius: '50%',
                background: isCurrent ? c.accent : revealed ? c.doneBorder : c.border,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1vw', fontWeight: 900, color: '#fff', flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: '1.4vw', color: revealed ? c.doneText : c.muted, lineHeight: 1.3 }}>
                {step}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '2% 6%', borderTop: `1px solid ${c.border}`, fontSize: '.9vw', color: c.footerText, flexShrink: 0 }}>
        {slide.speakerNote}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck 2>&1 | grep "ProcessLayout\|error" | head -20
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/layouts/ProcessLayout.tsx
git commit -m "feat(classroom): add ProcessLayout slide component with step reveal"
```

---

## Task 6: 重写 SlideView 为分发器

**Files:**
- Rewrite: `app/app/(classroom)/classroom/[stageId]/SlideView.tsx`

当前 `SlideView` 是简单文字列表渲染，需要改成：按场景中当前显示哪张 slide（`currentSlideIndex`）渲染对应布局组件，并根据 `layout` 字段分发到对应组件。

- [ ] **Step 1: 重写 SlideView.tsx**

```tsx
'use client'

import type { SlideContent } from '@maolab/shared-types'
import BulletsLayout from './layouts/BulletsLayout'
import FormulaLayout from './layouts/FormulaLayout'
import StatementLayout from './layouts/StatementLayout'
import ProcessLayout from './layouts/ProcessLayout'

interface Props {
  content: SlideContent
  theme: 'dark' | 'light'
  currentStep?: number
}

export default function SlideView({ content, theme, currentStep }: Props) {
  const slide = content.slides[0]
  if (!slide) return <div style={{ color: '#888', padding: 40 }}>No slide content</div>

  const layout = slide.layout ?? 'bullets'

  const wrapStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    borderRadius: 8,
  }

  if (layout === 'formula') {
    return <div style={wrapStyle}><FormulaLayout slide={slide} theme={theme} /></div>
  }
  if (layout === 'statement') {
    return <div style={wrapStyle}><StatementLayout slide={slide} theme={theme} /></div>
  }
  if (layout === 'process') {
    return <div style={wrapStyle}><ProcessLayout slide={slide} theme={theme} currentStep={currentStep} /></div>
  }
  // bullets / compare / summary all fall back to bullets
  return <div style={wrapStyle}><BulletsLayout slide={slide} theme={theme} /></div>
}
```

注意：每个 scene 的 `SlideContent.slides` 数组中每个元素对应一张 slide。当前实现渲染 `slides[0]`。如果需要多张 slide 翻页，可在后续迭代处理。本次实现先渲染第一张。

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck 2>&1 | grep "SlideView\|error" | head -30
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/SlideView.tsx
git commit -m "feat(classroom): rewrite SlideView as layout dispatcher"
```

---

## Task 7: SceneRenderer 透传 theme 和 currentStep

**Files:**
- Modify: `app/app/(classroom)/classroom/[stageId]/SceneRenderer.tsx`

- [ ] **Step 1: 修改 SceneRenderer 接受并传递 theme/currentStep**

```tsx
'use client'

import type { Scene } from '@maolab/shared-types'
import SlideView from './SlideView'
import QuizView from './QuizView'
import InteractiveView from './InteractiveView'

interface Props {
  scene: Scene
  theme: 'dark' | 'light'
  currentStep?: number
}

export default function SceneRenderer({ scene, theme, currentStep }: Props) {
  const { content } = scene

  if (content.type === 'slide') {
    return <SlideView content={content} theme={theme} currentStep={currentStep} />
  }

  if (content.type === 'quiz') {
    return <QuizView content={content} />
  }

  if (content.type === 'interactive') {
    return <InteractiveView content={content} />
  }

  return (
    <div className="scene-placeholder">
      <p>Scene type &ldquo;{content.type}&rdquo; is not yet supported in the viewer.</p>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck 2>&1 | grep "SceneRenderer\|error" | head -30
```

Expected: 无错误（ClassroomClient 还没更新，会有一个类型错误，下一个 Task 修复）。

- [ ] **Step 3: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/SceneRenderer.tsx
git commit -m "feat(classroom): thread theme and currentStep through SceneRenderer"
```

---

## Task 8: ClassroomClient — 主题切换 + 步骤计时器

**Files:**
- Modify: `app/app/(classroom)/classroom/[stageId]/ClassroomClient.tsx`

这是最复杂的一步。需要：
1. 增加 `theme` state (`'dark' | 'light'`, 默认 `'dark'`)
2. 增加 `stepIndex` state (number, 默认 -1)
3. 在 header controls 区域增加主题切换按钮
4. 向 SceneRenderer 传递 `theme` 和 `currentStep`
5. 增加 `useEffect` 计时器：当 `state.status === 'playing'` 且当前 scene 是 process 布局时，按间隔推进 `stepIndex`

- [ ] **Step 1: 重写 ClassroomClient.tsx**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { Stage } from '@maolab/shared-types'
import { usePlayback } from './usePlayback'
import SceneRenderer from './SceneRenderer'
import AgentPanel from './AgentPanel'

interface Props {
  stage: Stage
}

export default function ClassroomClient({ stage }: Props) {
  const { init, play, pause, resume, nextScene, state } = usePlayback()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [stepIndex, setStepIndex] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    init(stage.scenes)
  }, [stage.scenes, init])

  // Reset stepIndex when scene changes
  const sceneId = state?.currentScene?.id
  useEffect(() => {
    setStepIndex(-1)
  }, [sceneId])

  // Step-level timer for process slides
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    if (!state || state.status !== 'playing') return

    const scene = state.currentScene
    if (!scene || scene.content.type !== 'slide') return

    const slide = scene.content.slides[0]
    if (!slide || (slide.layout ?? 'bullets') !== 'process') return

    const steps = slide.steps ?? []
    if (steps.length === 0) return

    const stepInterval = (scene.durationHint * 1000) / steps.length

    timerRef.current = setInterval(() => {
      setStepIndex(prev => {
        const next = prev + 1
        if (next >= steps.length) {
          if (timerRef.current) clearInterval(timerRef.current)
          nextScene()
          return -1
        }
        return next
      })
    }, stepInterval)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sceneId, state?.status, nextScene])

  if (!state) return <div>Loading...</div>

  return (
    <div className="classroom-layout">
      <header className="classroom-header">
        <h1>Classroom</h1>
        <div className="controls">
          {state.status === 'idle' && (
            <button onClick={play}>Start</button>
          )}
          {state.status === 'playing' && (
            <>
              <button onClick={pause}>Pause</button>
              <button onClick={nextScene}>Next</button>
            </>
          )}
          {state.status === 'paused' && (
            <button onClick={resume}>Resume</button>
          )}
          {state.status === 'ended' && (
            <p>Course complete!</p>
          )}
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '切换浅色' : '切换深色'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="progress">
          Scene {state.currentIndex + 1} / {state.scenes.length}
        </div>
      </header>

      <div className="classroom-body">
        <main className="classroom-main">
          {state.currentScene ? (
            <SceneRenderer
              scene={state.currentScene}
              theme={theme}
              currentStep={stepIndex}
            />
          ) : (
            <p>No scene selected.</p>
          )}
        </main>

        <AgentPanel agents={stage.agents} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: 无 TypeScript 错误。

- [ ] **Step 3: 运行现有测试确认未破坏 playback engine**

```bash
cd E:/CC/code/maolab
pnpm --filter @maolab/classroom test
```

Expected: All tests pass (playback-engine 测试全部绿色).

- [ ] **Step 4: Commit**

```bash
git add app/app/\(classroom\)/classroom/\[stageId\]/ClassroomClient.tsx
git commit -m "feat(classroom): add theme toggle and process slide step timer"
```

---

## Task 9: 更新 AI Prompt — 布局选择规则

**Files:**
- Modify: `packages/generator/src/prompts/templates/slide/system.md`
- Modify: `packages/generator/src/prompts/templates/slide/user.md`

- [ ] **Step 1: 在 system.md 末尾追加布局规则**

将文件内容改为：

```markdown
You are an expert instructional designer creating slide content for an educational scene.
Output valid JSON only. No prose, no markdown fences.

## 布局选择规则

每页 slide 必须包含 `layout` 字段，根据内容选择：
- `"formula"`   → 核心是一个公式、定理或方程式
- `"bullets"`   → 核心是 3-5 条并列要点（默认选项）
- `"compare"`   → 需要对比两个概念、方案或现象
- `"statement"` → 需要用一句话冲击性陈述核心观点
- `"summary"`   → 章节结尾的总结归纳
- `"process"`   → 内容描述一个有先后顺序的过程或变化

选择 `"process"` 时，必须同时生成 `steps` 数组，每个元素是一个步骤的简短描述（15字以内），数组长度 3-6 个。其他布局不生成 `steps`。

对于 `"formula"` 布局，`title` 字段填写公式本身（如 "F = ma"），`body` 字段填写对公式各项的解释。
对于 `"statement"` 布局，`title` 字段填写核心陈述句（简短有力），`body` 字段填写补充说明。
对于 `"bullets"` 布局，`body` 字段使用 markdown 列表格式（每行以 "- " 开头）。
```

- [ ] **Step 2: 更新 user.md 的 output format，增加 layout/steps 字段**

将文件末尾的 output format 部分替换为：

```markdown
**Outline Item:**
- Title: {{title}}
- Objective: {{objective}}
- Duration hint: {{durationHint}} minutes

**Knowledge Profile:**
- Topic: {{topic}}
- Domain: {{domain}}
- Difficulty: {{difficulty}}
- Core Concepts: {{coreConcepts}}
- Analogies: {{analogies}}
- Narrative Hooks: {{narrativeHooks}}

**Teaching Method:** {{teachingMethod}}
**Language:** {{language}}

Generate 3–5 slides for this scene. Each slide must have:
- `layout`: one of "formula" | "bullets" | "compare" | "statement" | "summary" | "process"
- `title`: slide heading (short, punchy; for formula layout, use the formula itself)
- `body`: main content (for bullets layout, use markdown list with "- " prefix; for formula layout, explain each term)
- `steps`: array of 3-6 step strings, ONLY for "process" layout (omit for all other layouts)
- `speakerNote`: what the teacher says during this slide (2–4 sentences)
- `visualHint`: brief label for the slide context (e.g. "力学基础 · 第2课")

Also provide:
- `conceptIds`: list of concept names from the core concepts that this scene covers

Output format:
{
  "slides": [
    {
      "layout": "bullets",
      "title": "string",
      "body": "string",
      "speakerNote": "string",
      "visualHint": "string"
    }
  ],
  "conceptIds": ["string"]
}

For process layout, include "steps":
{
  "layout": "process",
  "title": "string",
  "body": "string",
  "steps": ["步骤1", "步骤2", "步骤3"],
  "speakerNote": "string",
  "visualHint": "string"
}
```

- [ ] **Step 3: 验证文件内容正确**

```bash
cat E:/CC/code/maolab/packages/generator/src/prompts/templates/slide/system.md
cat E:/CC/code/maolab/packages/generator/src/prompts/templates/slide/user.md
```

Expected: 两个文件都包含新增的 layout 字段说明。

- [ ] **Step 4: Commit**

```bash
git add packages/generator/src/prompts/templates/slide/system.md
git add packages/generator/src/prompts/templates/slide/user.md
git commit -m "feat(generator): add layout selection rules to slide prompt"
```

---

## Task 10: 验证端到端正常工作

- [ ] **Step 1: 启动开发服务器**

```bash
cd E:/CC/code/maolab/app
pnpm dev
```

Expected: 服务器启动在 http://localhost:3000（或 3001）。

- [ ] **Step 2: 进入一个已有课程的 classroom 页面，验证 slide 可以渲染**

访问 http://localhost:3000，创建一个快速课程，进入 classroom，检查：
- slide scene 显示正常（不报错）
- 旧数据（无 layout 字段）自动回退到 bullets 布局
- 页面右上角有 ☀️/🌙 切换按钮
- 点击按钮主题切换正常

- [ ] **Step 3: 生成一个新课程，验证 AI 生成的 slide 带 layout 字段**

创建新课程 → 等待生成完成 → 进入 classroom → 检查是否出现不同布局。

在浏览器 Network 面板 / 控制台中检查生成的 JSON 是否包含 `layout` 字段。

- [ ] **Step 4: 最终 typecheck**

```bash
pnpm typecheck
```

Expected: 无错误。

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: slide upgrade complete — 4 layouts, dark/light theme, process step timer"
```

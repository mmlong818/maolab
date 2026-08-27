# Slide 场景升级 — 实现计划

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** 将 maolab 课堂的 slide 场景从纯文字渲染升级为具有布局模板、明暗主题和步骤推进能力的真正幻灯片。

**Architecture:** AI 生成时自动选择 6 种布局之一并可选生成步骤序列；前端按布局类型分发到对应 React 组件；课堂级明暗主题一键切换；步骤推进由现有计时器驱动，无需用户交互。

**Tech Stack:** React, TypeScript, CSS container queries (cqw), maolab monorepo (shared-types / generator / app)

---

## 1. 数据结构

### 1.1 SlideLayout 类型

```typescript
// packages/shared-types/src/stage.ts

export type SlideLayout =
  | 'formula'    // 公式主导：左区大公式 + 右区说明
  | 'bullets'    // 要点列表：顶部标题 + 3-5 条要点
  | 'compare'    // 左右对比：两列并排
  | 'statement'  // 冲击陈述：全版单句话
  | 'summary'    // 章节总结：标题 + 概念标签
  | 'process'    // 过程推进：有 steps 的渐进展示
```

### 1.2 SlideData 扩展

```typescript
export interface SlideData {
  title: string
  layout: SlideLayout        // 新增：布局类型，AI 自动选
  body: string
  steps?: string[]           // 新增：process 布局的步骤序列（可选）
  speakerNote: string
  visualHint: string
}
```

`steps` 存在时为自动步进模式；步骤间隔 = `durationHint / steps.length`。

---

## 2. 布局组件

### 2.1 文件结构

```
app/app/(classroom)/classroom/[stageId]/
├── SlideView.tsx                 // 分发器：根据 layout 选组件 + 注入 theme
└── layouts/
    ├── FormulaLayout.tsx
    ├── BulletsLayout.tsx
    ├── CompareLayout.tsx
    ├── StatementLayout.tsx
    ├── SummaryLayout.tsx
    └── ProcessLayout.tsx
```

### 2.2 主题 Token

每个布局组件内部定义，不用 Context：

```typescript
const THEME = {
  dark: {
    bg: '#0d1117', surface: '#161b22', border: '#21262d',
    text: '#f0f6fc', muted: '#8b949e', accent: '#3b82f6',
    footerBg: '#0d1117', footerText: '#484f58',
  },
  light: {
    bg: '#ffffff', surface: '#f3f4f6', border: '#e5e7eb',
    text: '#111827', muted: '#6b7280', accent: '#2563eb',
    footerBg: '#f9fafb', footerText: '#9ca3af',
  },
}
```

### 2.3 公式字号方案

formula 布局左区使用 CSS 容器查询防止溢出：

```css
.formula-left { container-type: inline-size; width: 60%; }
.formula-text { font-size: 20cqw; white-space: nowrap; }
```

### 2.4 布局组件接口

```typescript
interface LayoutProps {
  slide: SlideData
  theme: 'dark' | 'light'
  currentStep?: number   // process 布局使用
}
```

---

## 3. 步骤推进（process 布局）

### 3.1 计时器扩展

`ClassroomClient` 维护 `stepIndex` 状态。场景切换逻辑：

```
当前 scene 是 slide 且有 steps：
  stepInterval = scene.durationHint * 1000 / steps.length
  每隔 stepInterval 毫秒 stepIndex++
  stepIndex >= steps.length 时 → 跳下一个 scene，重置 stepIndex = 0

当前 scene 是 slide 无 steps，或其他类型：
  维持现有按 durationHint 整体推进的逻辑
```

### 3.2 手动干预

现有暂停/跳过按钮无需改动，暂停时 stepIndex 冻结，跳过时直接切到下一 scene。

---

## 4. 明暗切换

### 4.1 切换按钮

在现有 `.classroom-header .controls` 区域追加按钮：

```tsx
<button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
  {theme === 'dark' ? '☀️' : '🌙'}
</button>
```

### 4.2 状态传递

`ClassroomClient` → `SceneRenderer` → `SlideView` → 各布局组件，通过 props 传递，不用 Context。其他场景类型（quiz、interactive）的外壳容器也接收 `theme` 以保持视觉一致性。

---

## 5. AI Prompt 更新

在 `packages/generator/src/prompts/templates/slide/system.md` 末尾追加：

```markdown
## 布局选择规则

每页 slide 必须包含 `layout` 字段，根据内容选择：
- `"formula"`   → 核心是一个公式、定理或方程式
- `"bullets"`   → 核心是 3-5 条并列要点
- `"compare"`   → 需要对比两个概念、方案或现象
- `"statement"` → 需要用一句话冲击性陈述核心观点
- `"summary"`   → 章节结尾的总结归纳
- `"process"`   → 内容描述一个有先后顺序的过程或变化

选择 `"process"` 时，必须同时生成 `steps` 数组，每个元素是一个步骤的简短描述（15字以内），
数组长度 3-6 个。其他布局不生成 `steps`。
```

---

## 6. 向后兼容

现有数据库中已存 slide 数据没有 `layout` 字段。`SlideView` 在 `layout` 为 undefined 时回退到 `'bullets'` 布局，保证已生成内容不报错。

---

## 不在本次范围内

- PPT/PDF 导出
- 布局编辑器
- 自定义主题色
- compare / summary 两种布局的视觉设计（本次实现 formula、bullets、statement、process 四种）

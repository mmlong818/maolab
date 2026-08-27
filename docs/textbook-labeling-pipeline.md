# 教材章节 Annotation Pipeline · 设计与实施记录

> **重点：这不是一次性 knowledgeType 打标脚本，而是反复使用的可扩展标注引擎。**
> 未来还会加：difficulty / prerequisites / examWeight / estimatedMinutes / crossSubjectLinks / ...
> 每加一种标注，只需写一个 `Annotator` 实现，复用并发/checkpoint/重试/备份/skip-existing/version 控制。
>
> 状态：架构完成 · Schema 完成 · Mock 端到端跑通 · typecheck 通过 · 待 API key 跑真实样本
> 更新：2026-05-24

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────┐
│   annotation-pipeline.ts (通用引擎，与具体标注类型解耦)    │
│   - runPipeline(opts)                                    │
│   - 学科/学段推断、叶子抽取、国家课反查                    │
│   - 并发 / 重试 / .bak 备份 / checkpoint                  │
│   - skip-existing（按 annotator.name + version）          │
│   - dry-run / sampleN / force                            │
└──────────────────────────────────────────────────────────┘
            ▲                          ▲
            │ 注册                      │ 注册
┌───────────┴──────────┐    ┌──────────┴───────────────┐
│ annotators/          │    │ annotators/             │
│   knowledge-type.ts  │    │   difficulty.ts (未来)   │
│   - prompt v1.0.0    │    │   prerequisites.ts ...   │
│   - zod schema       │    │                         │
└──────────────────────┘    └─────────────────────────┘
```

加新 annotator 的 4 步：
1. 在 `ChapterAnnotations` interface 加一个 optional 字段（`tree-types.ts`）
2. 写 `createXxxAnnotator()`，返回 `Annotator<T>`
3. 在 `scripts/label-knowledge-types.ts` 的 `ANNOTATOR_REGISTRY` 注册
4. 跑 `pnpm annotate --annotator=xxx`

## 2. Schema：通用 annotation 容器

`packages/textbook-index/src/tree-types.ts`：

```ts
export interface Annotation<T> {
  value: T
  source: 'llm' | 'human' | 'human-verified'
  confidence?: number      // [0,1]
  labeledAt: number        // ms timestamp
  annotatorName: string    // e.g. "knowledge-type"
  annotatorVersion: string // e.g. "v1.0.0" — bump 触发重打
  model?: string           // "anthropic:claude-haiku-4-5-20251001"
  reasoning?: string       // ≤500 字
}

export interface ChapterAnnotations {
  knowledgeType?: Annotation<KnowledgeType>
  difficulty?: Annotation<number>           // 占位
  prerequisites?: Annotation<string[]>      // 占位
  examWeight?: Annotation<number>           // 占位
  estimatedMinutes?: Annotation<number>     // 占位
  crossSubjectLinks?: Annotation<string[]>  // 占位
}

export interface ChapterNode {
  // ... 原字段
  annotations?: ChapterAnnotations
}
```

`KnowledgeType` 暂时内联在 `tree-types.ts`，TODO 留待 `@maolab/shared-types/knowledge-type-rules` 落地后改 import。

## 3. Annotator 接口

```ts
export interface Annotator<T> {
  key: AnnotationKey                  // 写到 annotations 容器哪个字段
  name: string                        // 日志/checkpoint 标识
  version: string                     // bump → 重打
  model: string                       // LLM 模型字符串
  shouldRun?(node): boolean           // 默认：版本不一致 → 跑
  annotate(ctx, deps): Promise<{ annotation: Annotation<T>; stats: { promptChars; completionChars } }>
}
```

### 默认 shouldRun
```ts
existing = node.annotations?.[key]
if (!existing) return true
return existing.annotatorVersion !== annotator.version
```

→ 升级 prompt（bump version）会自动触发重打，旧版本的标注被覆盖；
→ 不 bump version 重跑，已标过的全部 skip。

## 4. 文件清单

```
packages/textbook-index/
  src/
    tree-types.ts                       ← +Annotation/ChapterAnnotations/KnowledgeType
    annotation-pipeline.ts              ← 新增：通用引擎
    annotators/
      knowledge-type.ts                 ← 新增：第一个具体 annotator
    label-knowledge-types.ts            ← 重写：兼容层，re-export 新 API
    index.ts                            ← 更新 export
  scripts/
    label-knowledge-types.ts            ← 重写：CLI（多 annotator + ANNOTATOR_REGISTRY）
    estimate-label-cost.ts              ← 新增：全量成本估算（不调 LLM）
    test-label-with-mock.ts             ← 新增：mock 端到端 + 版本-skip 验证
  package.json                          ← +zod, 改 scripts
docs/
  textbook-labeling-pipeline.md         ← 本文件
```

## 5. CLI 用法

支持两种 provider：
- **`--provider=claude-cli`（默认）**：通过 spawn 本机 `claude` CLI 子进程走用户的 **Claude Pro/Max/Enterprise 订阅**，不消耗按量计费的 API key 额度。要求本机已登录 `claude auth login`。每次调用启动开销约 6-12s，建议 `--concurrency<=3`。
- **`--provider=anthropic-sdk`**：使用 `ANTHROPIC_API_KEY`（或 `--provider=openai-sdk` + `OPENAI_API_KEY`），按 token 计费但并发更高。

```bash
# 验证 prompt（无 API key 即可）
pnpm annotate --annotator=knowledge-type --tree=<id> --dry-run

# 真实小样本（走订阅 CLI，默认 provider）
pnpm annotate --annotator=knowledge-type --tree=<id1>,<id2>,<id3> --concurrency=2

# 显式指定 provider
pnpm annotate --annotator=knowledge-type --tree=<id> --sample=2 --provider=claude-cli
pnpm annotate --annotator=knowledge-type --tree=<id> --sample=2 --provider=anthropic-sdk

# 抽样
pnpm annotate --annotator=knowledge-type --tree=<id> --sample=10

# 全量（等用户拍板）
pnpm annotate --annotator=knowledge-type --all --concurrency=5

# 重打已标过的（bump 了 version 时自动；或显式 force）
pnpm annotate --annotator=knowledge-type --tree=<id> --force

# 未来：多 annotator 串跑
pnpm annotate --annotator=knowledge-type,difficulty --tree=<id>

# 成本估算（不调 LLM，仅扫所有树构造 prompt 字符）
pnpm annotate:estimate

# Mock 端到端
pnpm annotate:test-mock
```

环境变量：
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`
- `LABEL_LLM_MODEL`（覆盖 annotator 默认模型）
- `LABEL_BASE_URL`（OpenAI 兼容代理）

## 6. KnowledgeTypeAnnotator v1.0.0 细节

- **System prompt**：Anderson & Krathwohl (2001) 修订版布鲁姆四象限的中文权威定义 + 7 条判断启发式 + JSON 契约
- **User prompt**：学科 / 学段 / 章节路径 / 章节标题 / 关联国家课标题
- **输出 zod schema**：`{ knowledgeType, confidence ∈ [0,1], reasoning ≤500 字 }`
- **默认模型**：`anthropic:claude-haiku-4-5-20251001`
- **重试**：3 次指数退避 (200/600/1800 ms)
- **temperature**：0.1（分类任务，越低越稳）

边界处理：标题极短（"复习/单元小结"）→ system prompt 显式要求"factual + 低置信度"。

## 7. 测试结果

### 7.1 Mock LLM 端到端（已通过）
- 36 个叶子的小学语文教材，sample=8
- ✅ 叶子识别（8/8 成功）
- ✅ `annotations.knowledgeType` 字段正确写回
- ✅ `.bak` 自动生成
- ✅ 分布统计正确（mock 均匀 → 每类 2 个）
- ✅ 平均置信度计算正确（0.8125）
- ✅ **第二次跑：相同 version → 全部 skip（alreadyDone=8, toRun=0）**

### 7.2 CLI dry-run（已通过）
打印前 2 个章节的 annotator 摘要，不调 LLM，不写文件。

### 7.3 Typecheck
`pnpm typecheck` 全绿（含 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`）

### 7.4 真实 LLM 小样本
**未执行**：环境变量中无任何 LLM API key（`.env.local` 不存在，仅 `.env.example` 占位）。
脚本和 prompt 已就绪，key 就位后单条命令即可跑。

## 8. 全量成本估算（基于真实 prompt 字符扫描）

扫描 490 棵树（9,106 个叶子）后统计：

| 指标 | 值 |
|---|---|
| Trees | 490 |
| 总叶子节点 | **9,106** |
| 有国家课关联 | 5,023 (55.2%) |
| 平均 prompt 字符 | 915（含 system 830） |
| 估算 input tokens（中文 1.7 chars/token） | 4,898,706 |
| 估算 output tokens | 428,518 |

**各模型成本**（USD，全量一遍）：

| 模型 | input/M | output/M | **全量成本** |
|---|---|---|---|
| deepseek-v4-flash | $0.14 | $0.28 | **$0.81** |
| gpt-5.4-mini | $0.15 | $0.60 | **$0.99** |
| **claude-haiku-4-5** | $1.00 | $5.00 | **$7.04** ← 推荐 |
| gpt-5.4 | $2.50 | $10.00 | $16.53 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $21.12 |

**时长**（按单次 ~2s，含网络抖动）：
- 并发 5 → ~61 分钟
- 并发 10 → ~30 分钟
- 并发 20 → ~15 分钟（注意 rate limit）

## 9. 推荐打标策略

| 阶段 | 范围 | 成本 (haiku) | 备注 |
|---|---|---|---|
| 1. 样本验证 | 3 棵 (~90 叶子) | $0.07 | 拉个手动复核样本 |
| 2. 高价值学科 | 语数英+物化生+史地政 (~5,000 叶子) | $3.5 | Phase A B 路线优先用到 |
| 3. 剩余 | 音/美/体/艺 (~4,000 叶子) | $3.5 | 全 |
| 4. 复核低置信 | confidence < 0.6 用 sonnet 复打 | ~$5 | 可选；用 force + bump version |

**准确率梯度**：
- 不打标：0%，下游每次备课重判
- haiku v1.0.0 一遍：预期 80-90%（待样本验证）
- haiku + sonnet 复核低置信度：90-95%
- haiku + 人工 5% 抽检纠错：95%

## 10. 待用户决策

| # | 决策点 | 选项 / 默认 |
|---|---|---|
| **D1** | 选哪个模型 | A. claude-haiku-4-5（推荐）/ B. deepseek-v4-flash / C. gpt-5.4-mini |
| **D2** | 是否先样本验证 | A. 3 棵样本 → 人工 20 条 → 拍板（推荐） / B. 直接全量 |
| **D3** | 是否二阶段复核 | A. 不复核 / B. confidence<0.6 用 sonnet 复打 |
| **D4** | API key 怎么提供 | 当前 `.env.local` 不存在；需要用户填 ANTHROPIC_API_KEY 等到 `.env.local` |
| **D5** | 下一个 annotator 顺序 | difficulty / prerequisites / examWeight 哪个先做？ |

## 11. 真实样本执行命令

### 11.1 走订阅（推荐，无需 API key）

```bash
cd packages/textbook-index
# 先确认 claude 已登录订阅账号
claude auth status

# 小样本（concurrency 建议 ≤3，CLI 子进程冷启动较慢）
pnpm annotate --annotator=knowledge-type \
  --tree=<id> --sample=2 \
  --provider=claude-cli --concurrency=2

# 多棵
pnpm annotate --annotator=knowledge-type \
  --tree=<id1>,<id2>,<id3> \
  --provider=claude-cli --concurrency=3
```

订阅有 5 小时滚动窗口配额，全量 9106 叶子前应分批 + 观察 `claude auth status` 的用量。

### 11.2 走 API Key（按量计费）

```bash
cd packages/textbook-index
export ANTHROPIC_API_KEY=sk-ant-...

# 3 棵样本
pnpm annotate --annotator=knowledge-type \
  --tree=4bf136c9-43cc-4005-8c8b-b21d21bad96f \
  --tree=2400a73c-0da9-4536-804c-cb01f99f03fb \
  --tree=12eed579-1883-4b7c-b543-3bac585a4f16 \
  --provider=anthropic-sdk --concurrency=5

# 单引号是 PowerShell 写法用 backtick；多 tree 改成
# --tree=4bf136c9-...,2400a73c-...,12eed579-...

# 看报告
ls data/textbook-trees/.label-reports/

# 人工抽样 20 条（脚本未自动化，可用 node -e ... 提取 annotations.knowledgeType）
```

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 标题极短 LLM 误判 | system prompt 显式要求 factual + 低置信度；confidence<0.5 触发人工复核 |
| 跨学科教材学科错判 | `inferSubject` 命中第一个匹配，覆盖率高；可在 v1.1 prompt 加学科二次校准 |
| LLM 输出非 JSON | `extractJSON` 容忍 markdown fence；zod 校验失败触发 3 次重试 |
| 中断恢复 | tree 级 checkpoint + 叶子级幂等（version-based skip） |
| Rate limit | concurrency=5 稳妥；anthropic haiku ≥ 50 RPS 余量充足 |
| 备份膨胀 | `.bak` 仅生成一次，重跑不覆盖；如需清理手动 rm |
| 版本切换 | annotator.version bump → 自动重打；不 bump 重跑全部 skip |

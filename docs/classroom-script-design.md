# 课堂导演场本（ShowScript）设计

**日期**：2026-06-13
**状态**：草案待确认（P2 前置）
**需求来源**（用户原话）：
> 目前课程中，老师讲课和学生参与会有割裂感，并没有相对完整的设计过。你需要像拍电视剧一样先有剧本，谁说什么、起到什么作用要有计划，过程中发生什么也要有规划，否则内容会很混乱。

这是「资源生产前先全局规划」原则（先导演场本，再逐单元生产）在课堂层的应用。

## 1. 割裂感的技术根源（诊断）

现状是**三层各自生成、互不知情**：

| 层 | 生成方式 | 问题 |
|----|---------|------|
| 讲稿（script-worker） | 按 segment 独立生成 | 纯老师独白，不知道学生角色存在 |
| 演出 beats（beats-worker） | 按 atom 独立生成 | 互动是 atom 局部即兴，ask/react 没有戏剧上下文 |
| 学生插话（useStudyCompanion） | 课中实时触发 | 旁挂系统，与讲稿剧情完全无关 |

结果：角色没有连续性（Zero 上一页犯的错下一页就忘了）、互动没有功能定位（提问只是「测一下」而不是剧情推进）、全课没有节奏弧线（可能连续 5 页独白后突然 5 道题）。

## 2. 方案：在 rundown 与讲稿之间插入「导演场本」层

```
/rundown 审批 → 【ShowScript 导演场本】 → /script 讲稿(多角色) → /atoms → beats(按场本事件)
```

场本回答三个问题（正是用户要求的三件事）：

### 谁说什么、起什么作用 —— 角色出场表（cast）

每课从 4 位同学人设中选 2-3 位出场，**每人领一个戏剧任务**：

- **犯错担当**：负责在指定段落犯「真实学情中的高频混淆」（从 diagnose-gap/KP misconceptions 取材，不是编的错）——错误必须在后续被纠正，形成「错误→纠正→巩固」事件链
- **提问担当**：在概念引入段问出学生心里的那个「为什么」
- **接梗担当**（段子K）：在认知负荷高的段落后负责释放，连接媒体节点
- **示范担当**：在收束段说出正确总结，替代老师重复

### 过程中发生什么 —— 事件规划（events）

每个 segment 在场本里有戏剧定位与事件清单：

```ts
interface ShowScriptSegment {
  segmentId: string                 // 对应 RundownSegment
  dramaticFunction: 'setup' | 'rising' | 'climax' | 'resolution'
  events: Array<{
    type: 'misconception' | 'key-question' | 'comic-relief' | 'demonstrate' | 'media-moment'
    actor: string                   // 人设 id
    atNodeId: string                // 落点 rundown 节点
    intent: string                  // 这个事件推进什么（"暴露进率混淆，为闯关做铺垫"）
    setup?: string                  // 前置铺垫要求
    payoff?: string                 // 后续回收要求（错误必须被纠正）
  }>
  paceNote: string                  // 节奏要求（"此段已连续 3 页讲解，第 4 页必须互动"）
}
```

### 全课弧线 —— 角色弧与节奏曲线

- 角色弧：犯错担当在课程结尾要「学会」（最后一次出场说对），完成微型成长叙事
- 节奏强制规则（代码层校验，不靠 LLM 自觉）：连续讲解 ≤3 节点必须有互动/事件；climax 段安排在第 60-75% 进度；媒体节点优先放在认知负荷高峰后

## 3. 下游改造

| 模块 | 现状 | 场本接入后 |
|------|------|-----------|
| script-worker | 老师独白 | 按场本写**多角色讲稿**（line 带 speaker + 事件标记），媒体节点过渡语已先行 |
| beats-worker | per-atom 即兴 | narrate beat 的 speaker/情绪、ask 的位置由场本事件决定；非事件节点保持现状 |
| useStudyCompanion | 实时旁挂 | 实时插话只落在场本预留的「插话槽」，与剧本错误不撞车 |
| 数据 | — | `course.showScript`，在 rundown 审批后异步生成，可在 UI 审阅/编辑（与 plan/method/rundown 同级的审批步） |

## 4. 实施分期（建议并入 P2，先于排版语法）

- **S1** ShowScript 类型 + 生成器 + 审阅 UI（谁出场/什么事件一屏看完）— 约 1 周
- **S2** script-worker 多角色讲稿改造（speaker 字段 + TTS 按角色音色）— 3-4 天
- **S3** beats-worker 接场本事件 + 节奏强制器 — 3-4 天
- **S4** 真检验收：同一课「有场本 vs 无场本」对比走查，验「割裂感」是否消除

## 5. 与现有设计的关系

- 是 `classroom-experience-design.md` Phase 2「广播剧乐谱」的全课统筹层（乐谱解决了单 atom 的演出，场本解决全课的戏剧结构）
- `presentation-system-design.md` 的「意图层」（B 方向）与场本互补：意图管呈现形式，场本管谁说什么——两者都在 analyze 后置入，可共用一次 LLM 规划调用

## 待确认

1. 场本是否需要用户审批步（像 rundown 一样可编辑），还是自动生成不打扰？建议：默认自动 + 可选展开编辑
2. S1-S4 是否提到 P2 最前（先于排版语法系统）？割裂感是体验主诉，建议优先

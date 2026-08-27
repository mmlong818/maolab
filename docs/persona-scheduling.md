# Persona 调度规则（伪代码）

> 状态：v0.1 · 2026-05-24
> 用途：给阶段 B 工程实现做准备；把 persona 库里的 triggers / handoff_to / flaws.mitigation 字段转化为可执行的调度逻辑。

---

## 1. 数据输入

调度器在每个 atom 开始前接收：

```typescript
interface SchedulerInput {
  atom: {
    type: AtomType;              // hook / worked-example / quiz / reflection / ...
    role: AtomRole;              // 备课层 role（hook/develop/recap/...）
    subject: string;             // 物理 / 美术 / 历史 / ...
    knowledgeType: KnowledgeType; // 事实/程序/概念/判断
    objectiveIds: string[];
    estimatedDurationSec: number;
  };
  studentState: {
    grade: 'primary' | 'middle' | 'high';
    recentResponses: Response[];  // 最近 5 题作答
    masteryByObjective: Map<string, number>; // 0-1
    emotionalSignal: 'normal' | 'struggling' | 'bored' | 'frustrated';
  };
  sessionState: {
    activePersonas: string[];     // 当前在场的 persona id
    lastSwitch: { from: string; to: string; atIndex: number } | null;
    switchCount: number;
  };
}

interface SchedulerOutput {
  primary: string;              // 主 persona id（讲述者）
  supporting: string[];         // 副 persona ids（同学最多 2 位）
  reason: string;               // 调度原因，写入 insights 日志
}
```

---

## 2. 主 persona 选择（teacher）

```
function selectPrimaryTeacher(input):
    candidates = allTeachers.filter(t => t.status == 'active')

    # 第一轮过滤：avoid 列表
    for t in candidates:
        if input.atom.subject in t.triggers.avoid_subjects:
            candidates.remove(t)
        if input.atom.type in t.triggers.avoid_atoms:
            candidates.remove(t)

    # 第二轮加分：prefer 列表
    for t in candidates:
        score = 0
        if input.atom.subject in t.triggers.prefer_subjects: score += 3
        if input.atom.type in t.triggers.prefer_atoms: score += 2
        t.score = score

    # 边界情况
    if candidates.empty:
        return defaultTeacher  # 应急 fallback
    if all candidates have score == 0:
        return defaultTeacher  # 当前 atom 不在任何老师强项
    
    return candidates.maxBy(t => t.score)
```

**当前阶段（猫叔为唯一老师）**：
- 美术 / 影视 / 历史 / 跨学科 / 概念理解 → 猫叔
- 应试类 / 严格定义类 / 记忆类 → fallback 兜底（暂时仍走猫叔，输出退化模板）
- 后续补 `理科严谨老师` 和 `应试型老师` 后填空

---

## 3. 副 persona（同学）选择

```
function selectSupportingClassmates(input, primary):
    candidates = allClassmates.filter(c => c.status == 'active')
    selected = []

    # 规则 1：atom 类型驱动
    switch input.atom.type:
        case 'hook' or 'cross-discipline-analogy':
            selected.add(xiaoyu)  # 跳跃型
        case 'worked-example':
            selected.add(linxiaoman)  # 镜像 - 代为提问
            if input.atom.knowledgeType == '程序':
                selected.add(azhe)  # 领跑 - 补半范例
        case 'reflection':
            selected.add(zhouyu)  # 稳锚 - 示范反思
        case 'exam-tactics' or 'key-point-recap':
            selected.add(liusong)  # 应试 - 务实代言
        case 'socratic':
            selected.add(linxiaoman)
            if random() < 0.3:
                selected.add(azhe)  # 偶尔加入领跑同学

    # 规则 2：情绪信号优先（覆盖上面的选择）
    if input.studentState.emotionalSignal == 'struggling':
        selected = [linxiaoman]  # 镜像优先 - 让学生看到"和我一样卡的人"
        if input.studentState.recentResponses 连续错 3+ 题:
            selected.add(zhouyu)  # 稳锚 - 平复焦虑
    
    if input.studentState.emotionalSignal == 'bored':
        selected = [xiaoyu]  # 跳跃 - 激活注意
    
    if input.studentState.emotionalSignal == 'frustrated':
        # 强情绪 - 完全切换
        selected = [zhouyu]
        # 同时降低主 persona 出场感（让学生喘一下）

    # 规则 3：化学反应约束
    # 猫叔 + 小渔 = 双跑题大王，仅在 hook atom 允许同台
    if primary == 'maoshu' and 'xiaoyu' in selected:
        if input.atom.type != 'hook':
            selected.remove('xiaoyu')

    # 规则 4：在场人数上限
    selected = selected[:2]  # 最多 2 位同学

    return selected
```

---

## 4. 切换规则

调度器不仅在 atom 开始时调度，atom 进行中也可能触发切换。

```
function midAtomSwitch(currentState):
    
    # 触发器 1：atom 超时（猫叔讲超过设定时长 20%）
    if currentAtom.elapsedSec > currentAtom.estimatedDurationSec * 1.2:
        if primary == 'maoshu' and 'linxiaoman' in supporting:
            # 林小满代为打断
            inject(speech="猫叔猫叔，那这道题...", from='linxiaoman')
        elif primary == 'maoshu' and 'liusong' in supporting:
            # 柳颂催进度
            inject(speech="猫叔，那考点是...", from='liusong')
        else:
            # narrator 系统提示
            inject(speech="嗯，我们继续。", from='narrator')
    
    # 触发器 2：连续答错 2 题
    if studentState.recentResponses.lastN(2).allWrong():
        # 先插入具名肯定（情感支持 E2）
        inject(speech=generateNamedAffirmation(studentState), from=primary)
        # 切换到补救 atom（worked-example 形式）
        switchToRemediation(primary, supporting=['linxiaoman'])
    
    # 触发器 3：超速跳过（连续秒答 3 题）
    if studentState.recentResponses.lastN(3).allFast() and allCorrect():
        # 询问学生而非偷偷调整
        inject(speech="看起来这部分对你很轻松——想跳到挑战题，还是先把基础走完？", from=primary)
    
    # 切换次数硬上限
    if sessionState.switchCount >= 2:
        # 一节课内主 persona 不切换超过 2 次，保护沉浸感
        return no_switch
```

---

## 5. 调度日志（写入 insights）

每次调度决策必须写入 `delivery_decision_log`：

```typescript
interface DeliveryDecisionLog {
  courseId: string;
  atomIndex: number;
  decisionType: 'initial' | 'mid_atom_switch';
  primary: string;
  supporting: string[];
  reason: string;           // 人类可读
  triggers: string[];       // 触发的规则 id（如 'rule.1.worked-example'）
  signals: {                // 当时的学情快照
    emotionalSignal?: string;
    recentAccuracy?: number;
    lastResponseTimeMs?: number;
  };
  timestamp: Date;
}
```

**用途**：
- 在 insights 页面展示"今天为什么这样上课"
- 调度规则的离线评估和迭代
- 用户反馈"我不喜欢这个同学"时定位是哪条规则触发的

---

## 6. 边界与降级

### 6.1 单 persona 不可用
- 老师 persona 加载失败 → fallback 到 `maoshu`（创始默认）
- 同学 persona 加载失败 → 静默移除该位，不影响主流程

### 6.2 化学反应冲突
- 当多条规则结论冲突（如情绪信号要切稳锚 vs atom 类型要跳跃）：**情绪信号永远优先**

### 6.3 全球化语境
- 不同 cultural_context 的 persona 不能混搭出场（避免"中国猫叔 + 美国同学"违和）
- 学生选定语境后，调度器只在该语境的 persona 子集中选择

---

## 7. 实现 checklist（给 B 阶段工程）

- [ ] `packages/persona/src/scheduler.ts` 实现 `selectPrimaryTeacher` / `selectSupportingClassmates` / `midAtomSwitch`
- [ ] `packages/persona/src/prompt-injector.ts` 把选中 persona 的 yaml 注入所有文案生成 prompt
- [ ] 新表 `delivery_decision_log`（migration）
- [ ] `AtomRenderer` 接受 `assignedPersonas` prop，传给文案生成层
- [ ] insights 页面增加"调度日志"标签页
- [ ] 单测覆盖：每条调度规则一组案例

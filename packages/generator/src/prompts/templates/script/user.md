**教师信息：**
- 姓名：{{teacherName}}
- 风格：{{teacherPersona}}

**场景信息：**
- 标题：{{title}}
- 教学目标：{{objective}}
- 学习目标：{{learningObjectives}}
- 年级：{{gradeLevel}}
- 语言：{{language}}

**知识背景：**
- 主题：{{topic}}
- 领域：{{domain}}
- 难度：{{difficulty}}

**教学方法（决定本场景节奏与互动）：**
{{teachingModeHint}}

{{catchphraseRule}}
{{wrapupRule}}
{{learnerHint}}

请以{{teacherName}}的风格，撰写**行级 ScriptDoc**：把这个场景的整段讲解拆成 4-10 行老师台词。每行就是 TTS 朗读的一段。

# 严格规则

1. **每行 text 严格 ≤ 180 字**（中文）。超过会导致 TTS 合成失败。
2. **每行短小精悍**：一行讲清一个点或抛一个问句，不写长段。
3. **如果该行老师"指着画面某元素讲"**，加 `mediaRef`（字符串 id，将由后续 ContentWorker 落实）。
4. **如果该行老师"提问/请学生操作"**，加 `interactionRef`：
   - `id`：互动 id（如 "drag-half", "quiz-q1"）
   - `prompt`：屏幕给学生的提示
   - `timeoutSec`：等待秒数（默认 30）
5. **节奏控制**：朗读后需要停顿让学生思考时，加 `pauseAfterSec`（0-8 秒）。
6. **教学方法决定节奏**：
   - `lecture-*`：1 行场景介绍 → 2-3 行核心讲解（mediaRef 指画面）→ 1 行收尾问句
   - `interactive-drag` / `interactive-quiz`：1-2 行引入 → 1 行布置任务（interactionRef）→ 1 行收尾
   - `socratic-dialogue`：每行 1 个追问 + interactionRef 等学生答
7. **mediaRef 命名约定**：英文短词，如 `pizza-1-half` / `cell-membrane` / `q1-option-a`，让 ContentWorker 知道要画/标什么。
8. **附 feedback 字段**：给一组互动后反馈的默认台词池（运行时随机选播）。

# Output 严格 JSON，无 markdown，无注释

```json
{
  "lines": [
    {
      "text": "≤ 180 字的一行老师台词",
      "mediaRef": "可选 - 引用画面元素 id",
      "interactionRef": {
        "id": "interaction-id",
        "prompt": "给学生看的提示文字",
        "timeoutSec": 30
      },
      "pauseAfterSec": 0
    }
  ],
  "feedback": {
    "correctDefaults": ["对！...", "嗯，很准！", "答对了～"],
    "incorrectDefaults": ["再仔细看看", "差一点，再想想", "没关系，再试一次"]
  }
}
```

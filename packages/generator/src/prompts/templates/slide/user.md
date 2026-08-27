**Outline Item:**
- Title: {{title}}
- Objective: {{objective}}
- Duration hint: {{durationHint}} minutes
- Grade level: {{gradeLevel}}

**Learning Objectives for this scene:**
{{learningObjectives}}

**Knowledge Profile:**
- Topic: {{topic}}
- Domain: {{domain}}
- Difficulty: {{difficulty}}
- Core Concepts: {{coreConcepts}}
- Analogies: {{analogies}}
- Narrative Hooks: {{narrativeHooks}}

**Teaching Method:** {{teachingMethod}}
**Language:** {{language}}

Generate 3–5 slides for this scene. MIX at least 2 different layouts to create visual rhythm. Each slide must have:
- `layout`: one of "cover" | "statement" | "argument" | "data" | "checklist" | "compare" | "timeline" | "quote" | "table" | "causality" | "question" | "matrix-2x2" | "case-study" | "kpi-board" | "persona" | "chart-bar" | "roadmap" | "quadrant" | "cta" | "diagram" | "formula" | "bullets" | "process" | "summary"
- `title`: slide heading (for formula → the formula; for statement → the core sentence; for cover → the chapter title)
- `body`: optional / main content (for bullets → markdown list with "- " prefix; for formula → term explanations; may be empty for cover / statement / argument / data / checklist / compare when richer fields are filled)
- `speakerNote`: what the teacher says during this slide (2–4 sentences)
- `visualHint`: brief context label for this slide, MUST be in the same language as `{{language}}` (e.g. for zh-CN use "力学 · 动能定理" — never use English when language is Chinese)

Layout-specific extra fields (omit when not applicable):
- cover:     `eyebrow` (chapter label), `highlight` (substring of title to accent), `subtitle?`
- statement: `highlights` (string[] of words to accent inside title), `subtitle?`
- argument:  `eyebrow?`, `highlight?`, `points` (2-4 supporting bullets)
- data:      `eyebrow?`, `stats` (1-3 of `{value, label, source?}`; use "—" + `"需引用：[来源]"` when no real data)
- checklist: `eyebrow?`, `points` (2-6 items)
- compare:   `eyebrow?`, `left: {title, items[]}`, `right: {title, items[]}` (right column = emphasised side)
- timeline:  `eyebrow?`, `events: [{time, title, desc?}]` (3-6 chronological items)
- quote:     `eyebrow?`, `quote: {text, source, highlight?}` (real attributed citation)
- table:     `eyebrow?`, `columns: [{id, label, align?}]` (2-5), `rows: [{cells:{colId:value}, emphasis?}]` (2-6), `highlightColumn?`
- causality: `eyebrow?`, `chain: [{cause, because?}]` (3-5 links), `conclusion?`
- question:  `eyebrow?`, `question` (MUST end with ? or ？), `hints?` (0-3), `invitation?`
- matrix-2x2:`eyebrow?`, `axes: {x:{low,high}, y:{low,high}}`, `cells` (exactly 4: TL/TR/BL/BR each {label, desc?, emphasis?}), `takeaway?`
- case-study:`eyebrow?`, `client`, `clientMeta?`, `context` (≤60), `challenge` (≤60), `approach` (≤60), `results` (1-3 {metric, value, delta?}), `quote?`+`quoteAttribution?`
- kpi-board: `eyebrow?`, `period`, `kpis` (exactly 4 or 6 {label, value, delta?, deltaTone? pos/neg/flat, hint?}), `takeaway?`
- persona:   `eyebrow?`, `personaName` (≤12), `role` (≤20), `attributes?` (0-4 {label,value}), `quote?` (inner voice), `needs?` (1-3), `pains?` (0-3)
- chart-bar: `eyebrow?`, `unit`, `bars` (4-8 {label, value:number, note?}), `highlight?` (bar.label to emphasise), `source?`
- roadmap:   `eyebrow?`, `periods` (3-4 strings), `lanes` (2-4 {name, items: [{period, span?, label, emphasis?}]}), `legend?`
- quadrant:  `eyebrow?`, `scatterAxes: {x:{label,low,high}, y:{label,low,high}}`, `quadrantPoints` (5-10 {id, label, gridX 0-4 int, gridY 0-4 int}), `highlightPoint?`
- cta:       `eyebrow?`, `newAction`, `oldQuestion?` (struck through), `highlight?`, `subtitle?`
- diagram:   `eyebrow?`, `hint` (descriptive placeholder)
- process:   `steps` (3-6 step strings, ≤15 Chinese chars each)

The slides must directly teach the learning objectives listed above. Do NOT include examples (no parentheses, no "e.g.", no "such as") in learning-objective-focused content.

Also provide:
- `conceptIds`: list of concept names from the core concepts that this scene covers

Output format (mixed example):
{
  "slides": [
    {
      "layout": "cover",
      "title": "光合作用：植物如何把阳光变成食物",
      "highlight": "阳光",
      "eyebrow": "Chapter 01 · 生物 · 能量流动",
      "subtitle": "一节从叶子开始的能量课",
      "body": "",
      "speakerNote": "今天我们要从一片叶子开始,看植物是怎么把阳光变成糖的。",
      "visualHint": "生物 · 光合作用"
    },
    {
      "layout": "argument",
      "title": "光反应必须在类囊体上发生",
      "highlight": "类囊体",
      "points": ["类囊体膜上嵌着叶绿素和电子传递链", "膜内外可建立质子梯度", "ATP 合酶就嵌在这层膜上"],
      "body": "",
      "speakerNote": "为什么必须在类囊体?因为这三件事缺一不可。",
      "visualHint": "光反应 · 膜结构"
    },
    {
      "layout": "data",
      "title": "全球光合作用每年固定约 1200 亿吨碳",
      "stats": [
        {"value": "1200亿吨", "label": "每年全球固碳量", "source": "需引用:[IPCC 2023]"},
        {"value": "50%", "label": "由海洋藻类贡献"},
        {"value": "0.3%", "label": "实际转化率"}
      ],
      "body": "",
      "speakerNote": "数字背后,光合作用是地球上规模最大的化学反应。",
      "visualHint": "数据 · 全球尺度"
    }
  ],
  "conceptIds": ["光合作用", "类囊体", "光反应"]
}

// ─── 版式注册中心 ────────────────────────────────────────────────────────────
//
// 扩展新版式 = 三步：
//   1. 在 lib/types.ts 加 LayoutType 与 Slide 接口
//   2. 在 pptx-service/converter/layouts/<name>.py 实现转换器（输出 PPTist 元素）
//   3. 在本文件 LAYOUTS 注册元数据（AI prompt 用）
//
// AI 系统提示词会读取 LAYOUT_SCHEMAS（自动同步），所以新版式立刻可被 AI 选用。
// 渲染由 PPTist iframe 接管，前端不再实现版式组件。

import type { LayoutType } from '../types';

export interface LayoutDefinition {
  type: LayoutType;
  /** 中文标签 */
  label: string;
  /** 何时使用（写给 AI 的 hint） */
  whenToUse: string;
  /** 字段 schema 文档 */
  fieldsDoc: string;
  /** 示例 JSON（写给 AI 看的 few-shot） */
  example: string;
}

export const LAYOUTS: Record<LayoutType, LayoutDefinition> = {
  cover: {
    type: 'cover',
    label: '封面',
    whenToUse: '首页 / 章节起始；一句核心主张 + 副标题',
    fieldsDoc: 'title (string), subtitle? (string), highlight? (string，title 中要 accent 色高亮的子串), eyebrow? (string)',
    example: `{ "type": "cover", "eyebrow": "A TALK · 2026", "title": "如果 AI 已经会做所有作业，我们为什么还在教孩子做作业？", "highlight": "教孩子做作业", "subtitle": "一场关于教育的紧急对话" }`,
  },
  statement: {
    type: 'statement',
    label: '单句冲击',
    whenToUse: '核心结论 / 转折宣言；全页只一句话，字号极大；整篇 ≤ 3 张',
    fieldsDoc: 'title (string), highlight? (string[]，可多个高亮片段), align? ("center" | "left")',
    example: `{ "type": "statement", "title": "我们正在惩罚孩子使用工具，然后用同一个工具养活自己。", "highlight": ["惩罚", "养活"] }`,
  },
  process: {
    type: 'process',
    label: '流程',
    whenToUse: '3-5 个步骤；每步标题 + 一句说明',
    fieldsDoc: 'eyebrow?, heading (string), steps (Array<{ title, desc? }>)',
    example: `{ "type": "process", "eyebrow": "推进路径", "heading": "四步推进，每一步都可衡量", "steps": [{"title":"诊断","desc":"识别真正的问题"},{"title":"拆解","desc":"分解为可执行单元"},{"title":"执行","desc":"小步快跑"},{"title":"复盘","desc":"提炼可复用经验"}] }`,
  },
  data: {
    type: 'data',
    label: '数据',
    whenToUse: '1-3 个大数字；无源数据用 "—" + source 注明"需引用：[来源]"',
    fieldsDoc: 'eyebrow?, heading (string), stats (Array<{ value, label, source? }>)',
    example: `{ "type": "data", "eyebrow": "这不是个例", "heading": "我们在演出一种已经过时的教育", "stats": [{"value":"—","label":"中小学课堂禁用 AI 的比例","source":"需引用：教育部门 / 第三方调研"}] }`,
  },
  compare: {
    type: 'compare',
    label: '左右对比',
    whenToUse: 'before/after, A vs B；左暗右亮制造倾向',
    fieldsDoc: 'eyebrow?, heading (string), left ({ title, items[] }), right ({ title, items[] })',
    example: `{ "type": "compare", "heading": "课堂里的两个世界", "left": {"title":"学校教的","items":["把信息装进脑子","一个人独自答题","标准答案得高分"]}, "right": {"title":"世界要的","items":["把问题问得更好","与 AI 协作产出","判断哪个答案值得用"]} }`,
  },
  timeline: {
    type: 'timeline',
    label: '时间轴',
    whenToUse: '历史 / 路线图 / 里程碑',
    fieldsDoc: 'eyebrow?, heading, events (Array<{ time, title, desc? }>)',
    example: `{ "type": "timeline", "heading": "六年三个里程碑", "events": [{"time":"2020","title":"种子轮"},{"time":"2022","title":"首款产品"},{"time":"2024","title":"盈亏平衡"},{"time":"2026","title":"海外拓展"}] }`,
  },
  argument: {
    type: 'argument',
    label: '论点',
    whenToUse: '观点句标题 + 2-4 条支撑证据；非固定 3 条',
    fieldsDoc: 'eyebrow?, heading (string，可含 highlight 子串), highlight? (string), points (string[])',
    example: `{ "type": "argument", "heading": "不是难——是没意义", "highlight": "没意义", "points": ["当一道题 AI 三秒能答，孩子知道这道题已经死了","当一篇范文 AI 一键生成，孩子知道写它是在表演","当排名比好奇心更重要，孩子学会了关闭自己"] }`,
  },
  quote: {
    type: 'quote',
    label: '引言',
    whenToUse: '故事开场 / 名人金句 / 学生原话；source 字段必填',
    fieldsDoc: 'quote (string), source (string), highlight? (string)',
    example: `{ "type": "quote", "quote": "我数学考 98 分，可我不知道我学这些干什么。可那时候，工作可能都没了。", "source": "上海某重点初中学生，2026 年 3 月", "highlight": "可那时候，工作可能都没了" }`,
  },
  diagram: {
    type: 'diagram',
    label: '图示',
    whenToUse: '生态位 / 关系 / 维恩图；先写文字描述，后期用户可替换',
    fieldsDoc: 'eyebrow?, heading, hint (string，描述图示内容)',
    example: `{ "type": "diagram", "heading": "生态位置一目了然", "hint": "三个圆相交的维恩图：技术能力、市场认知、用户体验，交集中心写 \\"我们在这里\\"" }`,
  },
  cta: {
    type: 'cta',
    label: '行动号召',
    whenToUse: '收尾倒数第二张；明确具体行动；可用旧问法划掉 → 新问法',
    fieldsDoc: 'eyebrow?, oldQuestion? (string，会被划掉), newAction (string), highlight? (string)',
    example: `{ "type": "cta", "eyebrow": "从今晚开始", "oldQuestion": "今天考了多少分？", "newAction": "今天你问了什么好问题？", "highlight": "好问题" }`,
  },
  checklist: {
    type: 'checklist',
    label: '清单',
    whenToUse: '总结 / 贡献页 / 收尾盘点；2-5 条，每条一句',
    fieldsDoc: 'eyebrow?, heading (string), items (string[])',
    example: `{ "type": "checklist", "heading": "我们今天做到了什么", "items": ["梳理了 6 套主流演讲框架","抽离了 11 种通用版式","打通了 coach → slide 链路"] }`,
  },
  'matrix-2x2': {
    type: 'matrix-2x2',
    label: '二维矩阵',
    whenToUse: '4 个对象按两个维度分类（重要 × 紧急、成本 × 价值）；至多 2 张/deck',
    fieldsDoc: 'eyebrow?, heading, axes ({ x:{low,high}, y:{low,high} }), cells (固定 4 个 [TL,TR,BL,BR]: { label, desc?, emphasis? }), takeaway?',
    example: `{ "type": "matrix-2x2", "heading": "Q3 资源应该投在哪里", "axes": { "x":{"low":"影响小","high":"影响大"}, "y":{"low":"投入低","high":"投入高"} }, "cells": [{"label":"重投入低回报","desc":"立即砍掉"},{"label":"战略投资","desc":"高优持续投入","emphasis":true},{"label":"维持现状","desc":"不增不减"},{"label":"速赢机会","desc":"本季度内拿下"}], "takeaway":"把 70% 团队带宽压到右上格" }`,
  },
  'chart-bar': {
    type: 'chart-bar',
    label: '横向柱状对比',
    whenToUse: '4-8 项类目数值对比（区域营收、用户量、市占率）；对比项 1-3 用 data，> 8 用 table',
    fieldsDoc: 'eyebrow?, heading, unit (string), bars (4-8 个 { label, value:number, note? }), highlight? (要强调的 label), source?',
    example: `{ "type": "chart-bar", "heading": "华东独大，西南增速最快", "unit": "万元", "bars": [{"label":"华东","value":5610,"note":"+18% YoY"},{"label":"华北","value":4820,"note":"+9%"},{"label":"华南","value":3150,"note":"+12%"},{"label":"西南","value":1720,"note":"+47%"},{"label":"东北","value":2940,"note":"-3%"}], "highlight":"西南", "source":"需引用：[内部 BI]" }`,
  },
  'chart-line': {
    type: 'chart-line',
    label: '折线图',
    whenToUse: '时间序列 / 趋势演变（3-12 个时间点，1-3 条 series）；单点数字对比用 data，构成比例用 chart-pie',
    fieldsDoc: 'eyebrow?, heading, xLabels (3-12 个时间标签), series (1-3 个 { name, values: number[] }), unit?, highlight? (要强调的 series.name), source?',
    example: `{ "type": "chart-line", "heading": "我们的复购率正在脱离行业均线", "unit": "%", "xLabels": ["1月","2月","3月","4月","5月","6月"], "series": [{"name":"我们","values":[62,65,68,72,76,81]},{"name":"行业","values":[58,58,59,59,60,61]}], "highlight":"我们", "source":"内部统计 vs 行业报告" }`,
  },
  'chart-pie': {
    type: 'chart-pie',
    label: '饼图',
    whenToUse: '2-6 个部分的构成比例（收入来源、用户结构）；时序对比用 chart-line，数值对比用 chart-bar',
    fieldsDoc: 'eyebrow?, heading, slices (2-6 个 { label, value:number, note? }), centerLabel? (中心标注), highlight? (要强调的 slice.label), source?',
    example: `{ "type": "chart-pie", "heading": "企业级订阅成为压舱石", "slices": [{"label":"企业订阅","value":60},{"label":"广告分成","value":25},{"label":"专业服务","value":15}], "centerLabel":"$2.4M", "highlight":"企业订阅" }`,
  },
  'chart-area': {
    type: 'chart-area',
    label: '堆叠面积图',
    whenToUse: '随时间累计构成的变化（用户结构演变、收入来源演变）；单序列用 chart-line，固定时间点用 chart-pie',
    fieldsDoc: 'eyebrow?, heading, xLabels (3-12 个时间标签), series (1-3 个 { name, values: number[] }), unit?, highlight?, source?',
    example: `{ "type": "chart-area", "heading": "社交推荐正在改写用户来源", "unit":"万人", "xLabels":["Q1","Q2","Q3","Q4"], "series":[{"name":"直营","values":[12,14,18,22]},{"name":"搜索","values":[8,9,11,14]},{"name":"社交","values":[4,5,7,12]}], "highlight":"社交" }`,
  },
  'kpi-board': {
    type: 'kpi-board',
    label: 'KPI 看板',
    whenToUse: '汇报 4 或 6 个核心指标 + 同环比 + 趋势；指标 1-3 用 data，> 6 用 table',
    fieldsDoc: 'eyebrow?, heading, period (报告期), kpis (必须 4 或 6 个 { label, value (含单位的字符串), delta?, deltaTone? "pos"|"neg"|"flat", hint? }), takeaway?',
    example: `{ "type": "kpi-board", "heading": "毛利改善但获客成本同步抬升", "period": "2026 Q1", "kpis": [{"label":"营收","value":"¥18.4亿","delta":"+12.3%","deltaTone":"pos","hint":"符合指引上沿"},{"label":"毛利率","value":"47.2%","delta":"+3.1pt","deltaTone":"pos"},{"label":"获客成本","value":"¥312","delta":"+18%","deltaTone":"neg","hint":"渠道竞价加剧"},{"label":"MAU","value":"2,140万","delta":"+6.8%","deltaTone":"pos"}], "takeaway":"增长健康但成本与留存曲线开始背离" }`,
  },
  roadmap: {
    type: 'roadmap',
    label: '季度路线',
    whenToUse: '2-4 条并行赛道在 3-4 个时段（季度/月份）的关键里程碑；单线时序用 timeline',
    fieldsDoc: 'eyebrow?, heading, periods (3-4 个时段名), lanes (2-4 条 { name, items: [{ period (须在 periods 中), span?: 1-4 跨段, label, emphasis? }] }), legend?',
    example: `{ "type": "roadmap", "heading": "三条线并行推进，Q3 集中冲刺", "periods": ["Q1","Q2","Q3","Q4"], "lanes": [{"name":"产品","items":[{"period":"Q1","span":2,"label":"核心引擎重构"},{"period":"Q3","label":"Beta 上线","emphasis":true}]},{"name":"增长","items":[{"period":"Q2","span":2,"label":"三大渠道铺设"}]}], "legend":"实心条=自有；空心=外协" }`,
  },
  'case-study': {
    type: 'case-study',
    label: '案例研究',
    whenToUse: '完整客户/项目故事：背景 + 挑战 + 方法 + 量化结果；介绍单人用 persona，无量化结果用 quote',
    fieldsDoc: 'eyebrow?, client (客户名), clientMeta? (副信息), context (≤60字), challenge (≤60字), approach (≤60字), results (1-3 个 { metric, value, delta? }), quote?, quoteAttribution?',
    example: `{ "type": "case-study", "eyebrow": "客户案例 #2", "client": "山姆会员店", "clientMeta": "零售 · 年营收百亿级", "context": "全国 48 家门店，鲜食损耗占总损耗 60%。", "challenge": "新店长培养 6 个月，定货误差直接侵蚀利润。", "approach": "搭建鲜食预测模型，门店 App 给定货建议。", "results": [{"metric":"鲜食损耗率","value":"4.2%","delta":"-3.1pt"},{"metric":"单店日均利润","value":"+¥1,840","delta":"+18%"}], "quote": "现在新店长第一周就敢自己拍板了。", "quoteAttribution": "华东大区运营总监" }`,
  },
  table: {
    type: 'table',
    label: '紧凑表格',
    whenToUse: '3-5 列 × 3-6 行的结构化对比（产品参数、方案对比）；二元对比用 compare，4 格用 matrix-2x2',
    fieldsDoc: 'eyebrow?, heading, columns (3-5 个 { id, label, align? "left"|"right"|"center" }), rows (3-6 个 { cells: { [column.id]: string }, emphasis? }), highlightColumn? (column.id), source?',
    example: `{ "type": "table", "heading": "方案 B 在速度和成本上最优", "columns": [{"id":"feat","label":"特性","align":"left"},{"id":"a","label":"方案 A","align":"right"},{"id":"b","label":"方案 B","align":"right"},{"id":"c","label":"方案 C","align":"right"}], "rows": [{"cells":{"feat":"上线时间","a":"8 周","b":"4 周","c":"12 周"}},{"cells":{"feat":"首年成本","a":"¥80万","b":"¥60万","c":"¥120万"}},{"cells":{"feat":"可扩展性","a":"高","b":"中","c":"极高"}}], "highlightColumn":"b" }`,
  },
  causality: {
    type: 'causality',
    label: '因果链',
    whenToUse: '3-5 节"因为 A 所以 B"的推理链；单纯时序用 process，单论点带支撑用 argument',
    fieldsDoc: 'eyebrow?, heading, chain (3-5 节 { cause, because? }), conclusion?',
    example: `{ "type": "causality", "heading": "新增渠道质量下滑直接拖垮 30 日留存", "chain": [{"cause":"Q2 转向低价投放","because":"为追 GMV 降 CPA"},{"cause":"用户首日意图变弱","because":"薅羊毛比例升至 40%"},{"cause":"7 日活跃骤降","because":"次日流失从 35% → 58%"},{"cause":"30 日留存腰斩"}], "conclusion": "问题在源头不在产品" }`,
  },
  persona: {
    type: 'persona',
    label: '人物画像',
    whenToUse: '介绍一个具体人物（典型用户、决策者、团队成员）；多人对比拆多页或用 compare',
    fieldsDoc: 'eyebrow?, name (≤12字), role (≤20字), attributes? (0-4 个 { label, value }), quote? (内心独白 ≤50字), needs? (1-3 条诉求), pains? (0-3 条痛点)',
    example: `{ "type": "persona", "eyebrow": "用户画像 #2", "name": "李雯", "role": "上海连锁餐饮品牌运营总监", "attributes": [{"label":"年龄","value":"34"},{"label":"门店","value":"26 家"}], "quote": "我不缺工具，缺一个不用我反复教的工具。", "needs": ["周一 9 点前看到全门店流水","异常门店自动标红","导出格式直接给老板"], "pains": ["现在 5 个表手工拼 2 小时","新人上手要 3 周"] }`,
  },
  quadrant: {
    type: 'quadrant',
    label: '散点象限',
    whenToUse: '5-10 个对象按两个维度的相对定位（竞品格局、产品矩阵）；4 个固定分类用 matrix-2x2',
    fieldsDoc: 'eyebrow?, heading, axes ({ x:{label,low,high}, y:{label,low,high} }), points (5-10 个 { id, label ≤8字, gridX 整数 0-4, gridY 整数 0-4 }), highlight? (point.id), source?',
    example: `{ "type": "quadrant", "heading": "我们处在生态成熟度和速度的最佳交点", "axes": { "x":{"label":"上市速度","low":"慢","high":"快"}, "y":{"label":"生态成熟度","low":"弱","high":"强"} }, "points": [{"id":"us","label":"我们","gridX":3,"gridY":3},{"id":"a","label":"巨头 A","gridX":1,"gridY":4},{"id":"b","label":"新秀 B","gridX":4,"gridY":1},{"id":"c","label":"老牌 C","gridX":1,"gridY":3},{"id":"d","label":"创业 D","gridX":4,"gridY":0}], "highlight":"us" }`,
  },
  question: {
    type: 'question',
    label: '开放提问',
    whenToUse: '抛给观众思考的问题；自问自答用 statement；整篇 ≤ 1 张',
    fieldsDoc: 'eyebrow?, question (必以 ? 或 ？结尾), hints? (0-3 条思考提示), invitation? (互动邀请)',
    example: `{ "type": "question", "eyebrow": "停一下", "question": "如果明年只能保留团队的一项能力，你会留哪个？", "hints": ["想想你创业第 1 年最依赖什么","想想客户最常因什么续约","答案可能不是你最自豪的那个"] }`,
  },
};

/** 给 AI 看的版式列表 markdown */
export function layoutSchemasForPrompt(): string {
  return Object.values(LAYOUTS)
    .filter((l) => l.type !== 'diagram')
    .map((l) => `### \`${l.type}\` · ${l.label}
- 何时用: ${l.whenToUse}
- 字段: ${l.fieldsDoc}
- 示例: ${l.example}`).join('\n\n');
}

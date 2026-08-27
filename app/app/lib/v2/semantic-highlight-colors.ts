// 设计总纲 §5：颜色只表达教学语义，不得随机装饰，且同一语义在任何页面必须用同一颜色。
// 此前 14 个 *-rules.ts 各自按数组槽位上色（槽1蓝/槽2紫/槽3绿/槽4橙），导致同一语义跨页变色、
// 同一颜色跨页承载多种互不相关的语义。这里建立全局唯一的「语义 role → 5 语义色」映射，
// 各规则模块统一从此取色（spread highlightStyleForRole(role)），不再各写字面色值。

export type SemanticCategory = 'known' | 'conclusion' | 'operation' | 'error' | 'aesthetic'

export interface SemanticHighlightStyle {
  color: string
  background: string
  border: string
}

// 5 种语义色（总纲 §5 建议语义色）：
// 已知条件/概念主体=蓝，结论/正确方向=绿，操作步骤/推导动作=橙，错误/风险=红，审美感受/诗句语言=紫。
export const SEMANTIC_COLORS: Record<SemanticCategory, SemanticHighlightStyle> = {
  known: { color: '#2563eb', background: 'rgba(37, 99, 235, 0.10)', border: 'rgba(37, 99, 235, 0.34)' },
  conclusion: { color: '#059669', background: 'rgba(5, 150, 105, 0.11)', border: 'rgba(5, 150, 105, 0.34)' },
  operation: { color: '#d97706', background: 'rgba(217, 119, 6, 0.12)', border: 'rgba(217, 119, 6, 0.36)' },
  error: { color: '#dc2626', background: 'rgba(220, 38, 38, 0.10)', border: 'rgba(220, 38, 38, 0.34)' },
  aesthetic: { color: '#7c3aed', background: 'rgba(124, 58, 237, 0.10)', border: 'rgba(124, 58, 237, 0.32)' },
}

// 每个语义 role 固定归入一个语义类别。归类原则：
// - 已知/主体/对象/条件/数据/变量/情境/记忆目标/比较标准/知识分工 → known(蓝)
// - 结论/目标/正确方向/相同点/公式关系/修正动作/验证通过/产出物/价值判断 → conclusion(绿)
// - 步骤/动作/顺序/检查/路径/提取/连接关系/趋势读取/辅助线/迁移/合成 → operation(橙)
// - 错误本身/错因/适用边界(易混风险) → error(红)
// - 审美感受/诗句语言/表达出口 → aesthetic(紫)
export const SEMANTIC_CATEGORY_BY_ROLE: Record<string, SemanticCategory> = {
  // 概念定义 C01
  'concept-subject': 'known',
  'concept-relation': 'operation',
  'concept-conclusion': 'conclusion',
  'concept-boundary': 'error',
  // 概念辨析 C02
  'comparison-object': 'known',
  'comparison-standard': 'known',
  'comparison-similarity': 'conclusion',
  'comparison-boundary': 'error',
  // 关系结构 C03
  'structure-subject': 'known',
  'structure-node': 'known',
  'structure-link': 'operation',
  'structure-conclusion': 'conclusion',
  // 公式 C04
  'formula-rate': 'known',
  'formula-distance': 'known',
  'formula-time': 'known',
  'formula-unit': 'known',
  'formula-expression': 'conclusion',
  // 过程流程 C05
  'process-step': 'operation',
  'process-order': 'operation',
  'process-check': 'operation',
  'process-goal': 'conclusion',
  // 方法策略 C06
  'strategy-task': 'known',
  'strategy-cue': 'operation',
  'strategy-path': 'operation',
  'strategy-action': 'operation',
  // 范例 C07
  'example-given': 'known',
  'example-goal': 'conclusion',
  'example-operation': 'operation',
  'example-check': 'operation',
  // 纠错 C08
  'error-wrong': 'error',
  'error-cause': 'error',
  'error-fix': 'conclusion',
  'error-verify': 'conclusion',
  // 情境应用 C09
  'application-knowledge': 'known',
  'application-problem': 'known',
  'application-situation': 'known',
  'application-transfer': 'operation',
  // 记忆提取 C10
  'memory-target': 'known',
  'memory-cue': 'operation',
  'memory-retrieval': 'operation',
  'memory-correction': 'conclusion',
  // 审美 C11
  'aesthetic-voice': 'aesthetic',
  'aesthetic-line': 'aesthetic',
  'aesthetic-image': 'aesthetic',
  'aesthetic-feeling': 'aesthetic',
  // 价值理解 C12
  'value-evidence': 'known',
  'value-reason': 'known',
  'value-judgment': 'conclusion',
  'value-expression': 'aesthetic',
  // 实验观察 C13
  'experiment-object': 'known',
  'experiment-condition': 'known',
  'experiment-phenomenon': 'operation',
  'experiment-conclusion': 'conclusion',
  // 图表读取 C14
  'chart-data': 'known',
  'chart-structure': 'known',
  'chart-pattern': 'operation',
  'chart-conclusion': 'conclusion',
  // 综合任务 C15
  'task-standard': 'known',
  'task-knowledge-role': 'known',
  'task-product': 'conclusion',
  'task-synthesis-step': 'operation',
  'task-checklist': 'operation',
  // 几何证明（PresentMode 内置）
  'geometry-condition': 'known',
  'geometry-auxiliary': 'operation',
  'geometry-congruence': 'conclusion',
  'geometry-conclusion': 'conclusion',
}

export function semanticCategoryForRole(role: string): SemanticCategory {
  return SEMANTIC_CATEGORY_BY_ROLE[role] ?? 'known'
}

export function highlightStyleForRole(role: string): SemanticHighlightStyle {
  return SEMANTIC_COLORS[semanticCategoryForRole(role)]
}

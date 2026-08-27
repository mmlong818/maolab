export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'

/**
 * Bloom's Taxonomy verb dictionary — Chinese and English keywords per level.
 * Keys are BloomLevel values; values are lowercase match strings.
 */
export const BLOOM_VERBS: Record<BloomLevel, readonly string[]> = {
  remember: [
    'recall', 'recognize', 'list', 'identify', 'name', 'define', 'match', 'memorize', 'repeat', 'retrieve',
    '记忆', '识别', '列举', '背诵', '认出', '命名', '辨认', '复述',
  ],
  understand: [
    'explain', 'describe', 'summarize', 'interpret', 'classify', 'compare', 'paraphrase', 'discuss',
    'illustrate', 'translate', 'understand',
    '解释', '描述', '总结', '概括', '分类', '比较', '理解', '举例说明', '阐述',
  ],
  apply: [
    'apply', 'use', 'demonstrate', 'execute', 'implement', 'solve', 'calculate', 'operate', 'practice',
    'carry out', 'perform',
    '应用', '使用', '操作', '执行', '计算', '解决', '演示', '实施', '实践',
  ],
  analyze: [
    'analyze', 'differentiate', 'distinguish', 'examine', 'break down', 'deconstruct', 'relate', 'organize',
    'attribute', 'infer',
    '分析', '区分', '检查', '拆解', '推断', '归因', '比较区别', '解构',
  ],
  evaluate: [
    'evaluate', 'judge', 'critique', 'justify', 'assess', 'defend', 'argue', 'prioritize', 'recommend',
    'appraise', 'rate',
    '评估', '评价', '判断', '论证', '评判', '辩护', '推荐', '鉴定',
  ],
  create: [
    'create', 'design', 'construct', 'produce', 'generate', 'plan', 'compose', 'formulate', 'develop',
    'build', 'invent', 'devise',
    '创建', '设计', '构建', '制作', '生成', '规划', '编写', '开发', '发明', '创作',
  ],
}

const BLOOM_ORDER: Record<BloomLevel, number> = {
  remember: 1, understand: 2, apply: 3, analyze: 4, evaluate: 5, create: 6,
}

export interface BloomProgressionIssue {
  type: 'cliff_jump' | 'missing_foundation' | 'missing_higher_order'
  message: string
}

export function validateBloomProgression(
  levels: BloomLevel[],
  difficulty: 'beginner' | 'intermediate' | 'advanced',
): BloomProgressionIssue[] {
  const issues: BloomProgressionIssue[] = []
  const nums = levels.map(l => BLOOM_ORDER[l])

  for (let i = 1; i < nums.length; i++) {
    const jump = Math.abs((nums[i] ?? 0) - (nums[i - 1] ?? 0))
    if (jump > 2) {
      issues.push({
        type: 'cliff_jump',
        message: `Scene ${i}: Bloom jump from ${levels[i - 1]} to ${levels[i]} exceeds 2 levels (self-efficacy risk)`,
      })
    }
  }

  const hasL1 = levels.some(l => l === 'remember')
  const hasL2 = levels.some(l => l === 'understand')
  const hasL3 = levels.some(l => l === 'apply')
  if (!hasL1 || !hasL2 || !hasL3) {
    issues.push({
      type: 'missing_foundation',
      message: `Outline must cover Remember + Understand + Apply (L1–L3); missing: ${[!hasL1 && 'remember', !hasL2 && 'understand', !hasL3 && 'apply'].filter(Boolean).join(', ')}`,
    })
  }

  if (difficulty === 'advanced') {
    const hasHigher = levels.some(l => BLOOM_ORDER[l] >= 4)
    if (!hasHigher) {
      issues.push({
        type: 'missing_higher_order',
        message: 'Advanced course must include at least one L4+ scene (analyze/evaluate/create)',
      })
    }
  }

  return issues
}

/**
 * Classify an objective string to a Bloom level by keyword matching.
 * Falls back to 'understand' when no keyword matches.
 */
export function classifyBloomLevel(objective: string): BloomLevel {
  const lower = objective.toLowerCase()
  const levels: BloomLevel[] = ['create', 'evaluate', 'analyze', 'apply', 'remember', 'understand']
  for (const level of levels) {
    for (const verb of BLOOM_VERBS[level]) {
      if (lower.includes(verb)) {
        return level
      }
    }
  }
  return 'understand'
}

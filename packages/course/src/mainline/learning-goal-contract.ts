import {
  assessmentActionKindsIn,
  type AssessmentActionKind,
} from './assessment-alignment.js'

const UNOBSERVABLE_CLAUSE_PATTERN = /(?:^|[，,；;。]|并且?|且|以及|然后)\s*(?:学生|学习者)?\s*(?:能够|能|会)?\s*(?:了解|理解|知道|认识|熟悉|掌握|识记)/

const ACTION_PRIORITY: Record<AssessmentActionKind, number> = {
  explain: 3,
  recall: 2,
  discriminate: 3,
  construct: 4,
  calculate: 4,
  apply: 5,
  'complete-task': 4,
  perform: 4,
}

function normalizedText(text: string): string {
  return text.trim().replace(/[。；;，,]+$/g, '')
}

export function learningGoalStatementProblems(statement: string): string[] {
  const text = normalizedText(statement)
  const problems: string[] = []
  if (!text) return ['目标句为空']
  if (UNOBSERVABLE_CLAUSE_PATTERN.test(text)) {
    problems.push('目标句包含无法直接观察的“理解/掌握”类要求')
  }
  if (assessmentActionKindsIn(text).length === 0) {
    problems.push('目标句没有可观察、可检核的学生行为')
  }
  return problems
}

export function learningGoalContractProblems(statement: string, successSignal: string): string[] {
  const problems = learningGoalStatementProblems(statement)
  const successText = normalizedText(successSignal)
  if (!successText) return [...problems, '成功信号为空']
  if (UNOBSERVABLE_CLAUSE_PATTERN.test(successText)) {
    problems.push('成功信号包含无法直接观察的“理解/掌握”类要求')
  }

  const statementActions = assessmentActionKindsIn(statement)
  const successActions = assessmentActionKindsIn(successText)
  if (successActions.length === 0) {
    problems.push('成功信号没有可观察、可检核的学生行为')
  } else {
    const successActionSet = new Set(successActions)
    if (statementActions.some(action => !successActionSet.has(action))) {
      problems.push('成功信号没有覆盖目标句要求的全部学习行为')
    }
  }
  return [...new Set(problems)]
}

export function observableObjectiveScore(objective: string): number {
  if (learningGoalStatementProblems(objective).length > 0) return -1
  const actions = assessmentActionKindsIn(objective)
  return Math.max(...actions.map(action => ACTION_PRIORITY[action])) + Math.min(actions.length, 2)
}

function observableObjectiveVariant(objective: string): string | undefined {
  const text = normalizedText(objective)
  if (learningGoalStatementProblems(text).length === 0) return text

  const observableClauses = text
    .split(/[，,；;。]|并(?=(?:能够|能|会))/)
    .map(clause => normalizedText(clause))
    .filter(clause => clause.length > 0 && learningGoalStatementProblems(clause).length === 0)
  return observableClauses.length > 0 ? observableClauses.join('，') : undefined
}

export function selectObservableObjective(objectives: readonly string[] | undefined): string | undefined {
  return objectives
    ?.map((objective, index) => ({ objective: observableObjectiveVariant(objective), index }))
    .filter((candidate): candidate is { objective: string; index: number } => Boolean(candidate.objective))
    .map(candidate => ({ ...candidate, score: observableObjectiveScore(candidate.objective) }))
    .filter(candidate => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]
    ?.objective
}

export function successSignalFromObjective(objective: string): string {
  const text = normalizedText(objective)
  const withSubject = /^学生/.test(text)
    ? text
    : /^(?:能够|能|会)/.test(text)
      ? `学生${text}`
      : `学生能${text}`
  return `${withSubject}，结果可按本课标准核对。`
}

import type { QuizQuestion } from '@maolab/shared-types'

export interface IRTParams {
  a: number
  b: number
  c: number
}

export interface IRTResponse {
  question: QuizQuestion
  correct: boolean
}

// 3PL item response function: P(correct | theta, a, b, c)
function irf(params: IRTParams, theta: number): number {
  return params.c + (1 - params.c) / (1 + Math.exp(-params.a * (theta - params.b)))
}

// Normal distribution PDF (standard, μ=0, σ=1)
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

// EAP (Expected A Posteriori) ability estimator
// Reference: Bock & Aitkin 1981, equation 14
export function estimateAbility(responses: IRTResponse[]): number {
  const answerable = responses.filter(r => r.question.irt !== undefined)
  if (answerable.length === 0) return 0

  let num = 0
  let denom = 0

  for (let theta = -4; theta <= 4; theta += 0.2) {
    let likelihood = 1
    for (const r of answerable) {
      const p = irf(r.question.irt as IRTParams, theta)
      likelihood *= r.correct ? p : 1 - p
    }
    const weight = likelihood * normalPDF(theta)
    num += theta * weight
    denom += weight
  }

  return denom === 0 ? 0 : num / denom
}

export function expectedCorrectProbability(theta: number, params: IRTParams): number {
  return irf(params, theta)
}

export function selectByDifficulty(
  questions: QuizQuestion[],
  theta: number,
  targetProbability = 0.7,
): QuizQuestion | undefined {
  const withIrt = questions.filter(q => q.irt !== undefined)
  if (withIrt.length === 0) return questions[0]

  let best = withIrt[0]!
  let bestDiff = Infinity

  for (const q of withIrt) {
    const p = expectedCorrectProbability(theta, q.irt as IRTParams)
    const diff = Math.abs(p - targetProbability)
    if (diff < bestDiff) {
      bestDiff = diff
      best = q
    }
  }

  return best
}

// text-readability-ts is a CJS package; the default export is a Readability instance
import readabilityDefault from 'text-readability-ts'
const readability = readabilityDefault as unknown as { fleschKincaidGrade(text: string): number }
import type { Difficulty } from '@maolab/shared-types'

export interface ReadabilityResult {
  grade: number
  fits: boolean
  message?: string
}

const GRADE_RANGES: Record<Difficulty, { min: number; max: number }> = {
  beginner:     { min: 1, max: 7 },
  intermediate: { min: 5, max: 11 },
  advanced:     { min: 9, max: 20 },
}

function isMostlyAscii(text: string): boolean {
  const asciiCount = [...text].filter(c => c.charCodeAt(0) < 128).length
  return asciiCount / text.length > 0.6
}

export function checkReadability(text: string, difficulty: Difficulty): ReadabilityResult {
  if (!isMostlyAscii(text) || text.split(/\s+/).length < 6) {
    return { grade: -1, fits: true }
  }

  const grade = readability.fleschKincaidGrade(text)
  const { min, max } = GRADE_RANGES[difficulty]
  const fits = grade >= min - 2 && grade <= max + 2

  if (!fits) {
    const direction = grade < min ? 'too simple' : 'too complex'
    return {
      grade,
      fits: false,
      message: `Readability grade ${grade.toFixed(1)} is ${direction} for ${difficulty} (expected ${min}–${max})`,
    }
  }

  return { grade, fits: true }
}

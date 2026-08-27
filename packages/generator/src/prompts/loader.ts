import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const PROMPT_IDS = {
  SLIDE: 'slide',
  QUIZ: 'quiz',
  EXTRACT_KNOWLEDGE: 'extract-knowledge',
  INTERACTIVE_MODEL: 'interactive-model',
  INTERACTIVE_HTML: 'interactive-html',
  OBJECTIVES: 'objectives',
  SCRIPT: 'script',
  HOTSPOT: 'hotspot',
  COMPARISON: 'comparison',
  DRAG_DROP: 'drag-drop',
  CLOZE: 'cloze',
  ANIMATION_META: 'animation-meta',
  ANIMATION_FRAME: 'animation-frame',
  BRANCHING: 'branching',
  MODEL3D: 'model3d',
} as const

type PromptId = typeof PROMPT_IDS[keyof typeof PROMPT_IDS]

const KNOWN_IDS: ReadonlySet<string> = new Set(Object.values(PROMPT_IDS))

const templateCache = new Map<string, { rawSystem: string; rawUser: string }>()

function loadTemplate(promptId: string): { rawSystem: string; rawUser: string } {
  const cached = templateCache.get(promptId)
  if (cached) return cached
  const base = join(__dirname, 'templates', promptId)
  const result = {
    rawSystem: readFileSync(join(base, 'system.md'), 'utf-8'),
    rawUser: readFileSync(join(base, 'user.md'), 'utf-8'),
  }
  templateCache.set(promptId, result)
  return result
}

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`)
}

export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, string>,
): { system: string; user: string } {
  if (!KNOWN_IDS.has(promptId)) {
    throw new Error(`Unknown prompt id: "${promptId}". Known: ${[...KNOWN_IDS].join(', ')}`)
  }
  const { rawSystem, rawUser } = loadTemplate(promptId)
  return {
    system: interpolate(rawSystem, variables),
    user: interpolate(rawUser, variables),
  }
}

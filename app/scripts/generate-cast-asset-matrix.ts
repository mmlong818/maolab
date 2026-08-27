import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile as execFileCb } from 'node:child_process'
import { generateOpenAIImage, generateOpenAIImageEdit } from '../../packages/generator/src/llm/openai-image.js'
import {
  CAST_EXPRESSIONS,
  CAST_SCHOOL_STAGES,
  CAST_SEASONS,
  type CastSchoolStage,
  type CastSeason,
  type IpExpression,
} from '../app/lib/cast-assets/matrix.js'

const execFile = promisify(execFileCb)

type Quality = 'low' | 'medium' | 'high' | 'auto'
type JobKind = 'base' | 'subject'
type CharacterRole = 'teacher' | 'student'

interface CharacterSpec {
  id: string
  legacyFile: string
  role: CharacterRole
  displayName: string
  identity: string
  referenceFiles: string[]
}

interface SubjectSpec {
  id: string
  label: string
  visualCue: string
  propCue: string
  greenHeavy?: boolean
}

interface CastJob {
  kind: JobKind
  character: CharacterSpec
  schoolStage: CastSchoolStage
  season: CastSeason
  expression: IpExpression
  subject?: SubjectSpec
}

interface CliOptions {
  kind: 'all' | JobKind
  dryRun: boolean
  force: boolean
  limit: number
  offset: number
  concurrency: number
  attempts: number
  quality: Quality
  python: string
  characters?: Set<string>
  subjects?: Set<string>
  stages?: Set<CastSchoolStage>
  seasons?: Set<CastSeason>
  expressions?: Set<IpExpression>
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const appDir = join(repoRoot, 'app')
const publicDir = join(appDir, 'public')
const castDir = join(publicDir, 'generated-images', 'cast')
const logDir = join(appDir, 'logs', 'cast-generation')
const rawDir = join(logDir, 'raw')
const eventsFile = join(logDir, 'events.jsonl')
const latestSummaryFile = join(logDir, 'latest-summary.json')
const chromaHelper = join(
  process.env.CODEX_HOME ?? join(process.env.USERPROFILE ?? '', '.codex'),
  'skills',
  '.system',
  'imagegen',
  'scripts',
  'remove_chroma_key.py',
)

const CHARACTERS: CharacterSpec[] = [
  {
    id: 'teacher-longlaoshi',
    legacyFile: 'teacher-longlaoshi',
    role: 'teacher',
    displayName: 'Long teacher',
    identity:
      'a rigorous, pragmatic male teacher around 40, short hair, calm authority, practical classroom presence, explains key ideas with structure and pressure when needed',
    referenceFiles: ['base/middle/summer/teacher-longlaoshi-neutral.png'],
  },
  {
    id: 'teacher-xiaomei',
    legacyFile: 'teacher-xiaomei',
    role: 'teacher',
    displayName: 'Xiaomei teacher',
    identity:
      'a warm female teacher around 30, gentle short or shoulder-length hair, encouraging expression, approachable classroom guide who helps students try and correct mistakes',
    referenceFiles: ['base/middle/summer/teacher-xiaomei-neutral.png'],
  },
  {
    id: 'teacher-professor',
    legacyFile: 'teacher-professor',
    role: 'teacher',
    displayName: 'Professor Chen',
    identity:
      'a scholarly male professor around 50, refined, serious but lightly humorous, thin-frame glasses, bookish posture, good at counterintuitive explanations',
    referenceFiles: ['base/middle/summer/teacher-professor-neutral.png'],
  },
  {
    id: 'teacher-young',
    legacyFile: 'teacher-young',
    role: 'teacher',
    displayName: 'Young teacher Li',
    identity:
      'a young energetic teacher in his late 20s, clean and lively, fast-paced but reliable, comfortable using popular culture as classroom analogy',
    referenceFiles: ['base/middle/summer/teacher-young-neutral.png'],
  },
  {
    id: 'student-zero',
    legacyFile: 'student-zero',
    role: 'student',
    displayName: 'Zero',
    identity:
      'a curious student, bright eyes, open posture, often asks follow-up questions and connects ideas through imagination',
    referenceFiles: ['base/middle/summer/student-zero-neutral.png'],
  },
  {
    id: 'student-thinker',
    legacyFile: 'student-chen',
    role: 'student',
    displayName: 'Xiao Chen',
    identity:
      'an analytical student, neat appearance, thoughtful eyes, asks precise skeptical questions and looks for evidence',
    referenceFiles: ['base/middle/summer/student-thinker-neutral.png'],
  },
  {
    id: 'student-joker',
    legacyFile: 'student-k',
    role: 'student',
    displayName: 'K',
    identity:
      'a humorous energetic student, lively expression, quick gestures, uses funny comparisons while still caring about the lesson',
    referenceFiles: ['base/middle/summer/student-joker-neutral.png'],
  },
  {
    id: 'student-steady',
    legacyFile: 'student-mei',
    role: 'student',
    displayName: 'Xiao Mei',
    identity:
      'a steady student, calm and organized, good at summarizing steps and restating the key point in simple words',
    referenceFiles: ['base/middle/summer/student-steady-neutral.png'],
  },
]

const SUBJECTS: SubjectSpec[] = [
  {
    id: 'chinese',
    label: 'Chinese language arts',
    visualCue: 'literary ink-wash temperament, scrolls, brush, book margins, restrained warm paper colors',
    propCue: 'a slim book, brush, bookmark, or folded annotation slip',
  },
  {
    id: 'math',
    label: 'mathematics',
    visualCue: 'clean geometric reasoning mood, ruler, compass, coordinate grid hints, precise blue-gray accents',
    propCue: 'a ruler, compass, small notebook, geometric card, or chalk marker',
  },
  {
    id: 'english',
    label: 'English',
    visualCue: 'clear language-learning mood, listening and speaking classroom, modest navy and white accents',
    propCue: 'a vocabulary notebook, headset, small phrase card without readable text, or dictionary silhouette',
  },
  {
    id: 'physics',
    label: 'physics',
    visualCue: 'experiment-room mood, optics, circuits, magnetism, controlled science-blue accents',
    propCue: 'goggles, prism, simple circuit board, magnet, or lab notebook',
  },
  {
    id: 'chemistry',
    label: 'chemistry',
    visualCue: 'safe lab mood, glassware silhouettes, molecule motifs, clean teal and amber accents',
    propCue: 'safety goggles, conical flask, molecule model, or lab notebook',
  },
  {
    id: 'biology',
    label: 'biology',
    visualCue: 'natural observation mood, microscope, leaves, specimens, soft botanical details',
    propCue: 'microscope slide, hand lens, specimen card, leaf, or field notebook',
    greenHeavy: true,
  },
  {
    id: 'history',
    label: 'history',
    visualCue: 'classic humanities mood, archival documents, map fragments, bronze and parchment accents',
    propCue: 'old map, timeline card without readable text, archive folder, or museum tag shape without text',
  },
  {
    id: 'geography',
    label: 'geography',
    visualCue: 'map and fieldwork mood, compass, terrain contour hints, earth tones and field-jacket details',
    propCue: 'map, compass, field notebook, or globe silhouette',
    greenHeavy: true,
  },
]

const STAGE_CUES: Record<CastSchoolStage, { label: string; teacher: string; student: string }> = {
  primary: {
    label: 'primary-school',
    teacher:
      'teaches younger children; friendlier silhouette, softer gestures, simple approachable outfit details, still clearly an adult teacher',
    student:
      'looks like a primary-school student; smaller body proportion, softer rounder features, innocent curiosity, age-appropriate clothing',
  },
  middle: {
    label: 'middle-school',
    teacher:
      'teaches early teenagers; balanced professional presence, classroom credibility, clear gestures and slightly sharper styling',
    student:
      'looks like a middle-school student; early-teen proportion, more self-aware expression, simple uniform or casual school outfit',
  },
  high: {
    label: 'high-school',
    teacher:
      'teaches older teenagers; more academically mature presence, restrained gestures, precise and credible outfit details',
    student:
      'looks like a high-school student; older teen proportion, calmer posture, more mature school outfit while keeping the same archetype',
  },
}

const SEASON_CUES: Record<CastSeason, string> = {
  summer:
    'summer outfit: light breathable layers, short sleeves or thin shirt, clean classroom colors, no heavy coat',
  autumn:
    'autumn outfit: layered cardigan, light jacket, vest, scarf, or warmer fabric; still neat and not bulky',
}

const EXPRESSION_CUES: Record<IpExpression, string> = {
  neutral: 'neutral explaining expression, focused eyes, slight calm smile, natural teaching/listening posture',
  happy: 'happy encouraging expression, clearly warm smile, confident and supportive energy, not exaggerated',
  thinking: 'thinking expression, slightly narrowed focus, one hand near chin or holding a pen, guiding a careful rethink',
  surprised: 'surprised expression, raised brows and bright eyes, a mild cognitive-conflict moment, not comic panic',
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    kind: 'all',
    dryRun: false,
    force: false,
    limit: Number.POSITIVE_INFINITY,
    offset: 0,
    concurrency: 1,
    attempts: 3,
    quality: (process.env.OPENAI_IMAGE_QUALITY as Quality | undefined) ?? 'medium',
    python: process.env.PYTHON ?? 'python',
  }

  for (const raw of argv) {
    const [name, value = ''] = raw.split('=', 2)
    switch (name) {
      case '--kind':
        if (!['all', 'base', 'subject'].includes(value)) throw new Error('--kind must be all, base, or subject')
        options.kind = value as CliOptions['kind']
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--force':
        options.force = true
        break
      case '--limit':
        options.limit = Number(value)
        if (!Number.isFinite(options.limit) || options.limit < 1) throw new Error('--limit must be a positive number')
        break
      case '--offset':
        options.offset = Number(value)
        if (!Number.isFinite(options.offset) || options.offset < 0) throw new Error('--offset must be zero or positive')
        break
      case '--concurrency':
        options.concurrency = Number(value)
        if (!Number.isFinite(options.concurrency) || options.concurrency < 1) throw new Error('--concurrency must be positive')
        break
      case '--attempts':
        options.attempts = Number(value)
        if (!Number.isFinite(options.attempts) || options.attempts < 1) throw new Error('--attempts must be positive')
        break
      case '--quality':
        if (!['low', 'medium', 'high', 'auto'].includes(value)) throw new Error('--quality must be low, medium, high, or auto')
        options.quality = value as Quality
        break
      case '--python':
        options.python = value
        break
      case '--characters':
        options.characters = toSet(value)
        break
      case '--subjects':
        options.subjects = toSet(value)
        break
      case '--stages':
        options.stages = toTypedSet<CastSchoolStage>(value, CAST_SCHOOL_STAGES, '--stages')
        break
      case '--seasons':
        options.seasons = toTypedSet<CastSeason>(value, CAST_SEASONS, '--seasons')
        break
      case '--expressions':
        options.expressions = toTypedSet<IpExpression>(value, CAST_EXPRESSIONS, '--expressions')
        break
      default:
        throw new Error(`Unknown argument: ${raw}`)
    }
  }

  return options
}

function toSet(value: string): Set<string> {
  return new Set(value.split(',').map(v => v.trim()).filter(Boolean))
}

function toTypedSet<T extends string>(value: string, allowed: readonly T[], name: string): Set<T> {
  const set = toSet(value)
  for (const item of set) {
    if (!allowed.includes(item as T)) throw new Error(`${name} contains unsupported value: ${item}`)
  }
  return set as Set<T>
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

async function loadLocalEnv() {
  const envFile = join(appDir, '.env.local')
  try {
    const text = await readFile(envFile, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const pair = parseEnvLine(line)
      if (!pair) continue
      const [key, value] = pair
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // The script also supports externally provided environment variables.
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function passesFilters(job: CastJob, options: CliOptions): boolean {
  if (options.kind !== 'all' && job.kind !== options.kind) return false
  if (options.characters && !options.characters.has(job.character.id) && !options.characters.has(job.character.legacyFile)) {
    return false
  }
  if (options.subjects && (!job.subject || !options.subjects.has(job.subject.id))) return false
  if (options.stages && !options.stages.has(job.schoolStage)) return false
  if (options.seasons && !options.seasons.has(job.season)) return false
  if (options.expressions && !options.expressions.has(job.expression)) return false
  return true
}

function buildJobs(options: CliOptions): CastJob[] {
  const all: CastJob[] = []
  for (const character of CHARACTERS) {
    for (const schoolStage of CAST_SCHOOL_STAGES) {
      for (const season of CAST_SEASONS) {
        for (const expression of CAST_EXPRESSIONS) {
          all.push({ kind: 'base', character, schoolStage, season, expression })
        }
      }
    }
  }

  for (const subject of SUBJECTS) {
    for (const character of CHARACTERS) {
      for (const schoolStage of CAST_SCHOOL_STAGES) {
        for (const season of CAST_SEASONS) {
          all.push({ kind: 'subject', subject, character, schoolStage, season, expression: 'neutral' })
        }
      }
    }
  }

  return all
    .filter(job => passesFilters(job, options))
    .slice(options.offset, Number.isFinite(options.limit) ? options.offset + options.limit : undefined)
}

function keyColorFor(job: CastJob): string {
  if (job.subject?.greenHeavy) return '#ff00ff'
  return '#00ff00'
}

function targetPaths(job: CastJob) {
  const file = job.kind === 'base'
    ? `${job.character.id}-${job.expression}.png`
    : `${job.character.id}.png`
  const meta = file.replace(/\.png$/, '.json')
  const finalDir = job.kind === 'base'
    ? join(castDir, 'base', job.schoolStage, job.season)
    : join(castDir, 'subject', job.subject!.id, job.schoolStage, job.season)
  const rawFile = job.kind === 'base'
    ? `${job.kind}-${job.schoolStage}-${job.season}-${job.character.id}-${job.expression}.png`
    : `${job.kind}-${job.subject!.id}-${job.schoolStage}-${job.season}-${job.character.id}.png`
  return {
    finalDir,
    finalPath: join(finalDir, file),
    metaPath: join(finalDir, meta),
    rawPath: join(rawDir, rawFile),
    publicPath: job.kind === 'base'
      ? `/generated-images/cast/base/${job.schoolStage}/${job.season}/${file}`
      : `/generated-images/cast/subject/${job.subject!.id}/${job.schoolStage}/${job.season}/${file}`,
  }
}

function stageCue(job: CastJob): string {
  const cue = STAGE_CUES[job.schoolStage]
  return job.character.role === 'teacher' ? cue.teacher : cue.student
}

function promptFor(job: CastJob): string {
  const keyColor = keyColorFor(job)
  const subjectLines = job.subject
    ? [
      `Subject theme: ${job.subject.label}; ${job.subject.visualCue}.`,
      `Subject prop guidance: include at most one subtle subject cue such as ${job.subject.propCue}; do not make the prop dominate the portrait.`,
      'Expression requirement: neutral only for subject portraits; subject portraits are atmosphere assets, not dialogue expression assets.',
    ]
    : [
      'Subject theme: none; this is a reusable base dialogue portrait, not a course-cover illustration.',
      `Expression requirement: ${EXPRESSION_CUES[job.expression]}.`,
    ]

  return [
    'Use case: illustration-story',
    'Asset type: recurring transparent half-body RPG visual-novel portrait for a 1920x1080 education course dialogue layer.',
    `Primary request: create exactly one ${job.character.role} character portrait for ${job.character.displayName}.`,
    `Character identity: ${job.character.identity}.`,
    `School stage adaptation: ${STAGE_CUES[job.schoolStage].label}; ${stageCue(job)}.`,
    `Season outfit: ${SEASON_CUES[job.season]}.`,
    ...subjectLines,
    'Continuity: if reference images are provided, preserve the same face silhouette, hairstyle direction, body type, personality, and character role; adapt only age-read, outfit, prop, and expression requested here.',
    'Style/medium: polished Chinese K-12 educational RPG dialogue portrait, refined anime-adjacent illustration, clean linework, soft watercolor texture, professional classroom taste, not chibi, not photorealistic.',
    'Composition/framing: waist-up to upper-thigh half-body portrait, full head visible, shoulders and torso readable, character uses roughly 72-82% of canvas height, centered with generous padding, no cropped head, no tiny full-body figure.',
    'Background-removal requirement: place the character on a perfectly flat solid chroma-key background.',
    `The entire background must be exactly ${keyColor}, uniform edge to edge, with no shadow, gradient, paper texture, floor plane, reflection, scenery, or lighting variation.`,
    `Do not use ${keyColor} anywhere in the character, clothing, props, hair, eyes, or line art.`,
    'Constraints: one character only, transparent-cutout friendly edges, no speech bubble, no dialogue box, no classroom UI, no readable text, no Chinese characters, no English letters, no numbers, no watermark, no logo, no black border.',
  ].join('\n')
}

async function referencePathsFor(character: CharacterSpec): Promise<string[]> {
  const paths: string[] = []
  for (const rel of character.referenceFiles) {
    const path = join(castDir, rel)
    if (await exists(path)) paths.push(path)
  }
  return paths.slice(0, 2)
}

async function appendEvent(event: Record<string, unknown>) {
  await mkdir(logDir, { recursive: true })
  await appendFile(eventsFile, `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`, 'utf8')
}

async function removeChromaKey(input: string, output: string, options: CliOptions) {
  const args = [
    chromaHelper,
    '--input', input,
    '--out', output,
    '--auto-key', 'border',
    '--soft-matte',
    '--transparent-threshold', '12',
    '--opaque-threshold', '220',
    '--despill',
    '--force',
  ]
  await execFile(options.python, args, { maxBuffer: 1024 * 1024 * 4 })
}

async function validateAlpha(path: string, options: CliOptions) {
  const code = [
    'from PIL import Image',
    'import json, sys',
    'path=sys.argv[1]',
    'im=Image.open(path).convert("RGBA")',
    'w,h=im.size',
    'alpha=im.getchannel("A")',
    'corners=[alpha.getpixel((0,0)), alpha.getpixel((w-1,0)), alpha.getpixel((0,h-1)), alpha.getpixel((w-1,h-1))]',
    'bbox=alpha.getbbox()',
    'transparent=sum(1 for v in alpha.getdata() if v < 8)',
    'partial=sum(1 for v in alpha.getdata() if 8 <= v < 248)',
    'total=w*h',
    'result={"size":[w,h],"corners":corners,"bbox":bbox,"transparentRatio":transparent/total,"partialRatio":partial/total}',
    'print(json.dumps(result))',
    'ok=(w,h)==(1024,1536) and max(corners) < 12 and bbox is not None and 0.15 < result["transparentRatio"] < 0.9',
    'raise SystemExit(0 if ok else 2)',
  ].join(';')
  try {
    const { stdout } = await execFile(options.python, ['-c', code, path], { maxBuffer: 1024 * 1024 })
    return JSON.parse(stdout.trim()) as Record<string, unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`alpha validation failed for ${path}: ${message}`)
  }
}

async function generateJob(job: CastJob, options: CliOptions) {
  const paths = targetPaths(job)
  const prompt = promptFor(job)
  if (!options.force && await exists(paths.finalPath) && await exists(paths.metaPath)) {
    await appendEvent({ event: 'skip-existing', job: jobId(job), finalPath: paths.publicPath })
    console.log(`skip ${jobId(job)}`)
    return 'skipped'
  }

  if (!process.env.OPENAI_IMAGE_API_KEY) {
    throw new Error('OPENAI_IMAGE_API_KEY is not configured')
  }

  await mkdir(paths.finalDir, { recursive: true })
  await mkdir(rawDir, { recursive: true })

  await appendEvent({ event: 'start', job: jobId(job), finalPath: paths.publicPath })
  const references = await referencePathsFor(job.character)
  const imageConfig = {
    apiKey: process.env.OPENAI_IMAGE_API_KEY,
    ...(process.env.OPENAI_IMAGE_MODEL ? { model: process.env.OPENAI_IMAGE_MODEL } : {}),
    ...(process.env.OPENAI_IMAGE_BASE_URL ? { baseURL: process.env.OPENAI_IMAGE_BASE_URL } : {}),
    size: '1024x1536' as const,
    quality: options.quality,
    outputDir: rawDir,
    publicPrefix: '/generated-images/cast/_raw',
  }
  const result = references.length
    ? await generateOpenAIImageEdit(prompt, references, imageConfig)
    : await generateOpenAIImage(prompt, imageConfig)

  const generatedPath = join(rawDir, result.filename)
  await rm(paths.rawPath, { force: true })
  await rename(generatedPath, paths.rawPath)
  await removeChromaKey(paths.rawPath, paths.finalPath, options)
  const alpha = await validateAlpha(paths.finalPath, options)
  await writeFile(paths.metaPath, JSON.stringify({
    kind: job.kind,
    characterId: job.character.id,
    legacyFile: job.character.legacyFile,
    role: job.character.role,
    schoolStage: job.schoolStage,
    season: job.season,
    expression: job.expression,
    subject: job.subject?.id ?? null,
    model: process.env.OPENAI_IMAGE_MODEL ?? 'provider-default',
    quality: options.quality,
    finalFile: paths.publicPath,
    rawFile: relative(repoRoot, paths.rawPath).replace(/\\/g, '/'),
    keyColor: keyColorFor(job),
    references: references.map(path => relative(repoRoot, path).replace(/\\/g, '/')),
    alpha,
    prompt,
    generatedAt: new Date().toISOString(),
  }, null, 2), 'utf8')
  await appendEvent({ event: 'generated', job: jobId(job), finalPath: paths.publicPath, alpha })
  console.log(`generated ${jobId(job)}`)
  return 'generated'
}

async function generateJobWithRetry(job: CastJob, options: CliOptions) {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await generateJob(job, options)
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : String(err)
      await appendEvent({ event: 'attempt-failed', job: jobId(job), attempt, attempts: options.attempts, error: message })
      if (attempt >= options.attempts) break
      const delayMs = Math.min(60_000, 5_000 * attempt * attempt)
      console.warn(`retry ${jobId(job)} in ${Math.round(delayMs / 1000)}s after attempt ${attempt}: ${message}`)
      await sleep(delayMs)
    }
  }
  throw lastError
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function jobId(job: CastJob): string {
  return job.kind === 'base'
    ? `base/${job.schoolStage}/${job.season}/${job.character.id}/${job.expression}`
    : `subject/${job.subject!.id}/${job.schoolStage}/${job.season}/${job.character.id}`
}

async function runQueue(jobs: CastJob[], options: CliOptions) {
  const summary = { total: jobs.length, generated: 0, skipped: 0, failed: 0, startedAt: new Date().toISOString() }
  for (let i = 0; i < jobs.length; i += options.concurrency) {
    const batch = jobs.slice(i, i + options.concurrency)
    const results = await Promise.allSettled(batch.map(job => generateJobWithRetry(job, options)))
    for (let j = 0; j < results.length; j++) {
      const result = results[j]!
      const job = batch[j]!
      if (result.status === 'fulfilled') {
        if (result.value === 'generated') summary.generated += 1
        if (result.value === 'skipped') summary.skipped += 1
      } else {
        summary.failed += 1
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
        await appendEvent({ event: 'failed', job: jobId(job), error: message })
        console.error(`failed ${jobId(job)}: ${message}`)
      }
    }
    await writeFile(latestSummaryFile, JSON.stringify({ ...summary, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
  }
  return summary
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnv()
  const jobs = buildJobs(options)
  await mkdir(logDir, { recursive: true })
  console.log(`cast asset jobs: ${jobs.length}`)
  console.log(`kind=${options.kind} quality=${options.quality} concurrency=${options.concurrency} attempts=${options.attempts} force=${options.force}`)
  if (options.dryRun) {
    console.log(jobs.slice(0, 20).map(jobId).join('\n'))
    if (jobs.length > 20) console.log(`... ${jobs.length - 20} more`)
    await writeFile(latestSummaryFile, JSON.stringify({
      dryRun: true,
      total: jobs.length,
      sample: jobs.slice(0, 20).map(jobId),
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
    return
  }
  const summary = await runQueue(jobs, options)
  if (summary.failed > 0) process.exitCode = 1
}

void main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})

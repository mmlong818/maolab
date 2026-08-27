import React from 'react'
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import type { CourseV2, SceneAtom } from '@maolab/shared-types'

export const COURSE_VIDEO_WIDTH = 1920
export const COURSE_VIDEO_HEIGHT = 1080
export const COURSE_VIDEO_FPS = 30
export const DEFAULT_SECONDS_PER_ATOM = 8

export type CourseVideoRenderProps = {
  course: CourseV2
  secondsPerAtom?: number
  mode?: 'lecture' | 'present'
}

export const EMPTY_COURSE_VIDEO_PROPS: CourseVideoRenderProps = {
  course: {
    id: 'empty',
    title: 'Untitled course',
    origin: 'one-line',
    rawInput: { text: '', materials: [] },
    status: 'ready',
    atoms: [],
    createdAt: 0,
    updatedAt: 0,
  },
}

export function courseVideoDurationInFrames(props: CourseVideoRenderProps): number {
  const atomCount = Math.max(1, props.course.atoms?.length ?? 0)
  const secondsPerAtom = normalizeSecondsPerAtom(props.secondsPerAtom)
  return Math.ceil(atomCount * secondsPerAtom * COURSE_VIDEO_FPS)
}

export function CourseVideo({ course, secondsPerAtom = DEFAULT_SECONDS_PER_ATOM }: CourseVideoRenderProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const atoms = course.atoms ?? []
  const atomFrames = Math.max(1, Math.round(normalizeSecondsPerAtom(secondsPerAtom) * fps))
  const atomIndex = Math.min(Math.floor(frame / atomFrames), Math.max(0, atoms.length - 1))
  const atom = atoms[atomIndex]
  const localFrame = frame - atomIndex * atomFrames
  const progress = Math.min(1, Math.max(0, localFrame / atomFrames))
  const fade = interpolate(localFrame, [0, Math.min(18, atomFrames / 3)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, "Microsoft YaHei", system-ui, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0 2px, transparent 2px 42px)' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', padding: 76, boxSizing: 'border-box', opacity: fade }}>
        {atom ? (
          <AtomVideoStage
            atom={atom}
            narration={course.narrations?.[atom.id]}
            courseTitle={course.title}
            atomIndex={atomIndex}
            atomCount={atoms.length}
            progress={progress}
          />
        ) : (
          <EmptyStage title={course.title} />
        )}
      </div>
    </AbsoluteFill>
  )
}

function normalizeSecondsPerAtom(secondsPerAtom?: number): number {
  return Math.max(3, secondsPerAtom ?? DEFAULT_SECONDS_PER_ATOM)
}

function AtomVideoStage({
  atom,
  narration,
  courseTitle,
  atomIndex,
  atomCount,
  progress,
}: {
  atom: SceneAtom
  narration?: string | undefined
  courseTitle: string
  atomIndex: number
  atomCount: number
  progress: number
}) {
  const label = atomTypeLabel(atom)
  const title = titleOf(atom)
  const body = bodyOf(atom, narration)
  const image = imageOf(atom)
  const video = videoOf(atom)

  if (atom.type === 'dialogue-turn') {
    return <DialogueVideoStage atom={atom} courseTitle={courseTitle} atomIndex={atomIndex} atomCount={atomCount} progress={progress} />
  }

  if (atom.type === 'single-question') {
    return <QuestionVideoStage atom={atom} body={body} atomIndex={atomIndex} atomCount={atomCount} progress={progress} />
  }

  if (atom.type === 'recap-bullet') {
    return <RecapVideoStage atom={atom} atomIndex={atomIndex} atomCount={atomCount} progress={progress} />
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: image || video ? '1.08fr 0.92fr' : '0.88fr 1.12fr', gap: 48, alignItems: 'center' }}>
      <section style={{ display: 'grid', gap: 22, alignContent: 'center' }}>
        <StagePill>{label}</StagePill>
        <h1 style={{ margin: 0, maxWidth: 900, fontSize: fitFont(title, 64, 52, 40), lineHeight: 1.12, fontWeight: 950, letterSpacing: 0 }}>
          {title}
        </h1>
        {body && (
          <div style={{ borderLeft: '7px solid #2563eb', paddingLeft: 24, maxWidth: 820, fontSize: fitFont(body, 31, 26, 22), lineHeight: 1.55, fontWeight: 760, color: '#1e293b', whiteSpace: 'pre-wrap' }}>
            {body}
          </div>
        )}
      </section>
      <section style={{ minHeight: 610, borderRadius: 32, background: '#ffffffdd', border: '1px solid rgba(100,116,139,0.2)', boxShadow: '0 28px 86px rgba(15,23,42,0.12)', padding: 30, boxSizing: 'border-box', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {video ? (
          <OffthreadVideo src={assetSrc(video)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} muted />
        ) : image ? (
          <Img src={assetSrc(image)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <VisualFallback atom={atom} progress={progress} />
        )}
      </section>
      <Footer atomIndex={atomIndex} atomCount={atomCount} />
    </div>
  )
}

function QuestionVideoStage({ atom, body, atomIndex, atomCount, progress }: { atom: Extract<SceneAtom, { type: 'single-question' }>; body: string; atomIndex: number; atomCount: number; progress: number }) {
  const options = atom.payload.options ?? []
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'center' }}>
      <section style={{ display: 'grid', gap: 24 }}>
        <StagePill>互动判断</StagePill>
        <h1 style={{ margin: 0, fontSize: fitFont(atom.payload.stem, 58, 48, 38), lineHeight: 1.16, fontWeight: 950 }}>{atom.payload.stem}</h1>
        <div style={{ fontSize: 24, lineHeight: 1.5, color: '#64748b', fontWeight: 760 }}>{body}</div>
      </section>
      <section style={{ display: 'grid', gap: 18 }}>
        {options.map((option, index) => (
          <div key={`${option}-${index}`} style={{ borderRadius: 22, background: index === 0 ? '#fff7ed' : '#eff6ff', border: `2px solid ${index === 0 ? '#f59e0b55' : '#2563eb38'}`, padding: '24px 28px', display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: 18, alignItems: 'center', opacity: progress > index * 0.18 ? 1 : 0.18 }}>
            <span style={{ width: 58, height: 58, borderRadius: 18, background: index === 0 ? '#f59e0b' : '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: 23 }}>{String.fromCharCode(65 + index)}</span>
            <span style={{ fontSize: fitFont(option, 29, 25, 21), lineHeight: 1.42, fontWeight: 850 }}>{option}</span>
          </div>
        ))}
      </section>
      <Footer atomIndex={atomIndex} atomCount={atomCount} />
    </div>
  )
}

function DialogueVideoStage({ atom, courseTitle, atomIndex, atomCount, progress }: { atom: Extract<SceneAtom, { type: 'dialogue-turn' }>; courseTitle: string; atomIndex: number; atomCount: number; progress: number }) {
  const isTeacher = atom.payload.speaker === 'teacher'
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '70px 90px 300px', borderRadius: 36, background: 'linear-gradient(135deg, #eff6ff, #fff7ed)', border: '1px solid rgba(100,116,139,0.18)', display: 'grid', placeItems: 'center' }}>
        <div style={{ fontSize: 46, fontWeight: 930, color: '#1e293b' }}>{courseTitle}</div>
      </div>
      <div style={{ position: 'absolute', left: 118, right: 118, bottom: 116, minHeight: 238, borderRadius: 28, background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.78))', color: '#fff', boxShadow: '0 30px 90px rgba(15,23,42,0.3)', padding: '44px 52px', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', top: -32, left: isTeacher ? 40 : undefined, right: isTeacher ? undefined : 40, minWidth: 190, borderRadius: 16, background: isTeacher ? '#2563eb' : '#d97706', padding: '14px 24px', fontSize: 28, fontWeight: 950 }}>{isTeacher ? '老师' : atom.payload.speaker === 'student' ? '同学' : '旁白'}</div>
        <div style={{ opacity: progress > 0.05 ? 1 : 0, fontSize: fitFont(atom.payload.line, 46, 38, 31), lineHeight: 1.52, fontWeight: 760 }}>{atom.payload.line}</div>
      </div>
      <Footer atomIndex={atomIndex} atomCount={atomCount} />
    </div>
  )
}

function RecapVideoStage({ atom, atomIndex, atomCount, progress }: { atom: Extract<SceneAtom, { type: 'recap-bullet' }>; atomIndex: number; atomCount: number; progress: number }) {
  const parts = atom.payload.bullet.split(/[;；,，。]/).map(part => part.trim()).filter(Boolean).slice(0, 4)
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 52, alignItems: 'center' }}>
      <section style={{ display: 'grid', gap: 24 }}>
        <StagePill>回顾要点</StagePill>
        <h1 style={{ margin: 0, fontSize: fitFont(atom.payload.bullet, 66, 54, 42), lineHeight: 1.14, fontWeight: 950 }}>{atom.payload.bullet}</h1>
      </section>
      <section style={{ display: 'grid', gap: 18, padding: 34, borderRadius: 32, background: '#ffffffdd', boxShadow: '0 28px 86px rgba(15,23,42,0.12)' }}>
        {(parts.length ? parts : [atom.payload.bullet]).map((part, index) => (
          <div key={`${part}-${index}`} style={{ borderRadius: 22, background: index % 3 === 0 ? '#eff6ff' : index % 3 === 1 ? '#fff7ed' : '#ecfdf5', padding: '26px 30px', display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', alignItems: 'center', gap: 20, opacity: progress > index * 0.18 ? 1 : 0.18 }}>
            <span style={{ width: 58, height: 58, borderRadius: 18, background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: 22 }}>{index + 1}</span>
            <strong style={{ fontSize: 35, lineHeight: 1.2 }}>{part}</strong>
          </div>
        ))}
      </section>
      <Footer atomIndex={atomIndex} atomCount={atomCount} />
    </div>
  )
}

function EmptyStage({ title }: { title: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <h1 style={{ fontSize: 72, fontWeight: 950 }}>{title}</h1>
    </div>
  )
}

function VisualFallback({ atom, progress }: { atom: SceneAtom; progress: number }) {
  const size = interpolate(progress, [0, 1], [0.72, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ width: '82%', height: '68%', transform: `scale(${size})`, borderRadius: 28, background: 'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(245,158,11,0.1))', border: '2px dashed rgba(37,99,235,0.28)', display: 'grid', placeItems: 'center', color: '#475569', fontSize: 28, fontWeight: 850 }}>
      {atomTypeLabel(atom)}
    </div>
  )
}

function Footer({ atomIndex, atomCount }: { atomIndex: number; atomCount: number }) {
  return (
    <div style={{ position: 'absolute', left: 44, right: 44, bottom: 30, color: '#94a3b8', fontSize: 18, display: 'flex', justifyContent: 'space-between' }}>
      <span>{atomIndex + 1} / {Math.max(1, atomCount)}</span>
      <span>maolab course video</span>
    </div>
  )
}

function StagePill({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'inline-flex', width: 'fit-content', padding: '10px 18px', borderRadius: 999, background: '#0f172a', color: '#fff', fontSize: 17, letterSpacing: 3, fontWeight: 950 }}>{children}</div>
}

function atomTypeLabel(atom: SceneAtom): string {
  switch (atom.type) {
    case 'image-caption': return '图像讲解'
    case 'single-claim': return '课堂结论'
    case 'single-question': return '互动题'
    case 'single-example': return '案例'
    case 'dialogue-turn': return '对话'
    case 'derivation-step': return '推导'
    case 'demonstration': return '演示'
    case 'recap-bullet': return '回顾'
    case 'worked-example': return '范例题'
    case 'media-interlude': return '媒体'
  }
}

function titleOf(atom: SceneAtom): string {
  switch (atom.type) {
    case 'image-caption': return atom.payload.studentCaption ?? atom.payload.caption
    case 'single-claim': return atom.payload.claim
    case 'single-question': return atom.payload.stem
    case 'single-example': return atom.payload.title
    case 'dialogue-turn': return atom.payload.speaker === 'teacher' ? '老师讲解' : atom.payload.speaker === 'student' ? '学生提问' : '旁白'
    case 'derivation-step': return atom.payload.expression
    case 'demonstration': return atom.payload.src
    case 'recap-bullet': return atom.payload.bullet
    case 'worked-example': return atom.payload.problemStatement
    case 'media-interlude': return atom.payload.title
  }
}

function bodyOf(atom: SceneAtom, narration?: string): string {
  if (narration) return narration
  switch (atom.type) {
    case 'image-caption': return atom.payload.studentCaption ?? atom.payload.caption
    case 'single-claim': return atom.payload.support ?? ''
    case 'single-question': return atom.payload.onIncorrect
    case 'single-example': return atom.payload.studentVisible ?? atom.payload.body
    case 'dialogue-turn': return atom.payload.line
    case 'derivation-step': return [atom.payload.motivation, atom.payload.justification].filter(Boolean).join('\n')
    case 'demonstration': return atom.payload.narration
    case 'recap-bullet': return atom.payload.bullet
    case 'worked-example': return [...atom.payload.steps.map(step => `${step.stepNum}. ${step.action}`), atom.payload.conclusion].join('\n')
    case 'media-interlude': return mediaSummary(atom)
  }
}

function mediaSummary(atom: Extract<SceneAtom, { type: 'media-interlude' }>): string {
  const media = atom.payload.media
  if ('lines' in media) return media.lines.map(line => line.text).join('\n')
  if ('panels' in media) return media.panels.map(panel => panel.narration ?? panel.scene ?? '').filter(Boolean).join('\n')
  return ''
}

function imageOf(atom: SceneAtom): string | undefined {
  const payload = atom.payload as Record<string, unknown>
  return typeof payload.imageUrl === 'string' ? payload.imageUrl : undefined
}

function videoOf(atom: SceneAtom): string | undefined {
  if (atom.type !== 'demonstration') return undefined
  const src = atom.payload.src
  return atom.payload.medium === 'video' || /\.(mp4|webm)$/i.test(src) ? src : undefined
}

function assetSrc(src: string): string {
  if (/^(https?:|data:|blob:)/i.test(src)) return src
  if (src.startsWith('/')) return staticFile(src.slice(1))
  return src
}

function fitFont(text: string, max: number, mid: number, min: number): number {
  const size = Array.from(text ?? '').reduce((sum, ch) => sum + (/[\u4e00-\u9fff]/.test(ch) ? 2 : 1), 0)
  if (size <= 24) return max
  if (size <= 56) return mid
  return min
}

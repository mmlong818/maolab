'use client'

import { useRef, useState } from 'react'
import type { SceneAtom } from '@maolab/shared-types'
import MathOrText from '../../../components/MathOrText.js'
import { highlightStyleForRole } from '../../../lib/v2/semantic-highlight-colors.js'
import ConceptVisual, { shouldUseConceptVisual, visualPolicyFor } from '../../../components/ConceptVisual.js'
import EducationalVisual, { buildWorkedExampleVisualSpec } from '../../../components/EducationalVisual.js'
import SongPlayer from './media/SongPlayer.js'
import ComicPlayer from './media/ComicPlayer.js'

// MathOrText 复用 components/MathOrText（单一实现，支持 **加粗** + 数学公式），
// 避免课堂渲染层与放映层各自维护副本而行为漂移（放映层早已用共享实现）。
export { MathOrText }

/**
 * AtomRenderer — Sprint 2.4
 *
 * 针对 8 种 atom type 各一个内联 React 组件。
 * 设计原则：一页一语义。每个组件只显示一个语义单元，垂直居中，留白舒展。
 */

type Variant = 'default' | 'lecture'

interface RendererProps {
  atom: SceneAtom
  onComplete?: (() => void) | undefined
  variant?: Variant
  /** Sprint A2.1: 单题答题结果上报, 供 ClassroomV2Client 计算 consecutiveErrors */
  onSingleQuestionResult?: ((correct: boolean, pickedIdx?: number) => void) | undefined
}

/** AtomRenderer 假定外层已 mount MathJaxContext（见 ClassroomV2Client） */
export default function AtomRenderer({ atom, onComplete, variant = 'default', onSingleQuestionResult }: RendererProps) {
  switch (atom.type) {
    case 'image-caption':    return <ImageCaptionView atom={atom} onComplete={onComplete} variant={variant} />
    case 'single-claim':     return <SingleClaimView atom={atom} onComplete={onComplete} variant={variant} />
    case 'single-question':  return <SingleQuestionView atom={atom} onComplete={onComplete} variant={variant} onSingleQuestionResult={onSingleQuestionResult} />
    case 'single-example':   return <SingleExampleView atom={atom} onComplete={onComplete} variant={variant} />
    case 'dialogue-turn':    return <DialogueTurnView atom={atom} onComplete={onComplete} variant={variant} />
    case 'derivation-step':  return <DerivationStepView atom={atom} onComplete={onComplete} variant={variant} />
    case 'demonstration':    return <DemonstrationView atom={atom} onComplete={onComplete} variant={variant} />
    case 'recap-bullet':     return <RecapBulletView atom={atom} onComplete={onComplete} variant={variant} />
    case 'worked-example':   return <WorkedExampleView atom={atom} onComplete={onComplete} variant={variant} />
    case 'media-interlude':  return <MediaInterludeView atom={atom} onComplete={onComplete} variant={variant} />
  }
}

/** P1 媒体节点: 课内知识歌/教学漫画, 复用媒体播放器 + 推进按钮 */
function MediaInterludeView({ atom, onComplete, variant }: ViewProps<'media-interlude'>) {
  const m = atom.payload.media
  return (
    <div style={{ width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#fafaf7', padding: variant === 'lecture' ? '1vh 2vw' : '2vh 3vw', boxSizing: 'border-box', gap: 8 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {m.kind === 'song'
          ? <SongPlayer payload={m} title={atom.payload.title} />
          : <ComicPlayer payload={m} title={atom.payload.title} />}
      </div>
      {onComplete && (
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <NextBtn onComplete={onComplete} />
        </div>
      )}
    </div>
  )
}

function stageStyle(v: Variant): React.CSSProperties {
  return {
    width: '100%',
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: v === 'lecture' ? '2vh 3vw' : '3vh 4vw',
    background: '#fafaf7',
    color: '#1c1917',
    gap: v === 'lecture' ? 24 : 22,
  }
}

interface ViewProps<T extends SceneAtom['type']> {
  atom: Extract<SceneAtom, { type: T }>
  onComplete?: (() => void) | undefined
  variant: Variant
}

function NextBtn({ onComplete, label = '继续 →' }: { onComplete?: (() => void) | undefined; label?: string }) {
  if (!onComplete) return null
  return (
    <button
      type="button"
      onClick={onComplete}
      style={{
        marginTop: 40,
        padding: '12px 32px',
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function ImageCaptionView({ atom, onComplete, variant }: ViewProps<'image-caption'>) {
  const { payload } = atom
  const isLec = variant === 'lecture'
  const captionSize = isLec ? 22 : 'clamp(16px, 1.4vw, 22px)'
  const visualInput = {
    caption: payload.studentCaption ?? payload.caption,
    alt: payload.imageAlt,
    prompt: payload.imagePrompt ?? payload.prompt,
  }
  const policy = visualPolicyFor(visualInput)
  const unverifiedGeneratedImage = isUnverifiedGeneratedImageUrl(payload.imageUrl)
  const placeholderSupportImage = isPlaceholderSupportImageUrl(payload.imageUrl)
  const missingGeneratedImage = (!payload.imageUrl || placeholderSupportImage) && policy.mode !== 'structured' && Boolean(payload.imagePrompt ?? payload.prompt)
  const structured = policy.mode === 'structured' || unverifiedGeneratedImage || placeholderSupportImage
  const hasUsableImage = isUsableImageUrl(payload.imageUrl)
  return (
    <div style={stageStyle(variant)}>
      <div style={{ width: '100%', flex: '1 1 auto', maxHeight: isLec ? '72vh' : '70vh', minHeight: 280, background: '#e5e7eb', borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {structured ? (
          <ConceptVisual compact={isLec} input={visualInput} />
        ) : hasUsableImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={payload.imageUrl} alt={payload.imageAlt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>等待图像生成…</span>
        )}
      </div>
      <div style={{ marginTop: isLec ? 0 : 8, fontSize: captionSize, lineHeight: 1.6, maxWidth: '70ch', textAlign: 'center', color: '#374151', fontWeight: isLec ? 500 : 400 }}>
        {payload.studentCaption ?? payload.caption}
      </div>
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function isUnverifiedGeneratedImageUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\/image\.pollinations\.ai\//i.test(url)
}

function isUsableImageUrl(url: string | undefined): url is string {
  return typeof url === 'string'
    && url.trim().length > 0
    && !isUnverifiedGeneratedImageUrl(url)
    && !isPlaceholderSupportImageUrl(url)
}

function isPlaceholderSupportImageUrl(url: string | undefined): boolean {
  if (typeof url !== 'string' || !url.startsWith('data:image/svg+xml')) return false
  const text = safeDecodeDataUrl(url)
  return (
    text.includes('viewBox="0 0 720 420"')
    && text.includes('M150 272 L218 132 L292 272')
    && text.includes('M456 174 h60 M486 144 v60')
  ) || (
    text.includes('viewBox="0 0 420 420"')
    && text.includes('ellipse cx="218" cy="324"')
    && text.includes('M286 156 c42 18 60 48 54 88')
  )
}

function safeDecodeDataUrl(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

function SingleClaimView({ atom, onComplete, variant }: ViewProps<'single-claim'>) {
  const { claim, support } = atom.payload
  const isLec = variant === 'lecture'
  return (
    <div style={stageStyle(variant)}>
      <div style={{ fontSize: isLec ? 'clamp(40px, 5vw, 72px)' : 'clamp(28px, 4vw, 64px)', fontWeight: 800, textAlign: 'center', maxWidth: '30ch', lineHeight: 1.3, letterSpacing: '0.01em' }}>
        <MathOrText>{claim}</MathOrText>
      </div>
      {support && (
        <div style={{ marginTop: isLec ? 8 : 24, fontSize: isLec ? 22 : 18, color: '#6b7280', textAlign: 'center', maxWidth: isLec ? 1100 : 700, lineHeight: 1.6 }}>
          <MathOrText>{support}</MathOrText>
        </div>
      )}
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function SingleQuestionView({ atom, onComplete, onSingleQuestionResult }: ViewProps<'single-question'> & { onSingleQuestionResult?: ((correct: boolean, pickedIdx?: number) => void) | undefined }) {
  const { stem, kind, options, answer, onCorrect, onIncorrect } = atom.payload
  const [picked, setPicked] = useState<number | string | boolean | null>(null)
  const [judged, setJudged] = useState<'correct' | 'incorrect' | null>(null)
  const [textValue, setTextValue] = useState('')
  const startedAtRef = useRef(Date.now())

  function reportResponse(response: unknown, isCorrect: boolean) {
    try {
      // pathname: /v2/{courseId}/... 或 /(classroom)/v2/{courseId}/
      const m = typeof window !== 'undefined' ? /\/v2\/([0-9a-f-]+)/.exec(window.location.pathname) : null
      const courseId = m?.[1]
      if (!courseId) return
      const timeSpentMs = Date.now() - startedAtRef.current
      void fetch('/api/v2/student-response', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          courseId,
          atomId: atom.id,
          atomType: 'single-question',
          response,
          correct: isCorrect,
          timeSpentMs,
          objectiveIds: atom.objectiveIds,
          difficultyLevel: atom.difficultyLevel ?? 'standard',
          ...(atom.sourceLeafId ? { atomSourceLeafId: atom.sourceLeafId } : {}),
        }),
      }).catch(() => { /* fire-and-forget */ })
    } catch { /* swallow */ }
  }

  function submit() {
    if (picked === null || judged) return
    const isCorrect = JSON.stringify(picked) === JSON.stringify(answer)
    setJudged(isCorrect ? 'correct' : 'incorrect')
    reportResponse(picked, isCorrect)
    onSingleQuestionResult?.(isCorrect, typeof picked === 'number' ? picked : undefined)
  }

  return (
    <div style={stageStyle('default')}>
      <div style={{ fontSize: 24, fontWeight: 600, maxWidth: 820, lineHeight: 1.6, marginBottom: 32, textAlign: 'center' }}>
        {stem}
      </div>
      {(kind === 'mcq' || kind === 'true-false') && options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 600 }}>
          {options.map((opt, i) => {
            const isCorrectOpt = i === answer
            const isPickedOpt = i === picked
            const label = String.fromCharCode(65 + i)
            const cleaned = String(opt).replace(/^\s*[A-Da-d]\s*[.、)）:：]\s*/, '')
            const bg =
              judged && isPickedOpt ? (judged === 'correct' ? '#dcfce7' : '#fee2e2') :
              judged && isCorrectOpt ? '#dcfce7' :
              isPickedOpt ? '#eff6ff' :
              '#fff'
            const border =
              judged && isPickedOpt ? (judged === 'correct' ? '#16a34a' : '#dc2626') :
              judged && isCorrectOpt ? '#16a34a' :
              isPickedOpt ? '#2563eb' :
              '#d1d5db'
            const dotBg =
              judged && isPickedOpt ? (judged === 'correct' ? '#16a34a' : '#dc2626') :
              judged && isCorrectOpt ? '#16a34a' :
              isPickedOpt ? '#2563eb' :
              '#e5e7eb'
            const dotFg = ((judged && (isPickedOpt || isCorrectOpt)) || (!judged && isPickedOpt)) ? '#fff' : '#6b7280'
            return (
              <button
                key={i}
                type="button"
                disabled={judged !== null}
                onClick={() => setPicked(i)}
                style={{ padding: '14px 20px', textAlign: 'left', fontSize: 16, background: bg, border: `2px solid ${border}`, borderRadius: 10, cursor: judged ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: dotBg, color: dotFg, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{label}</span>
                <span style={{ flex: 1 }}>{cleaned}</span>
              </button>
            )
          })}
          {!judged && (
            <button
              type="button"
              onClick={submit}
              disabled={picked === null}
              style={{ marginTop: 16, alignSelf: 'center', padding: '12px 32px', background: picked === null ? '#e5e7eb' : '#2563eb', color: picked === null ? '#9ca3af' : '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: picked === null ? 'not-allowed' : 'pointer' }}
            >
              提交答案
            </button>
          )}
        </div>
      )}
      {(kind === 'short-answer' || kind === 'fill-blank') && (
        <div style={{ width: '100%', maxWidth: 600 }}>
          <input
            type="text"
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            disabled={judged !== null}
            style={{ width: '100%', padding: '14px 18px', fontSize: 16, border: '2px solid #d1d5db', borderRadius: 10 }}
            placeholder="写下你的答案…"
          />
          {!judged && (
            <button
              type="button"
              onClick={() => {
                setPicked(textValue)
                const isCorrect = JSON.stringify(textValue) === JSON.stringify(answer)
                setJudged(isCorrect ? 'correct' : 'incorrect')
                reportResponse(textValue, isCorrect)
                onSingleQuestionResult?.(isCorrect, typeof picked === 'number' ? picked : undefined)
              }}
              style={{ marginTop: 12, padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600 }}
            >
              提交
            </button>
          )}
        </div>
      )}
      {judged && (
        <div style={{ marginTop: 32, padding: '16px 24px', background: judged === 'correct' ? '#f0fdf4' : '#fff7ed', border: `1px solid ${judged === 'correct' ? '#86efac' : '#fdba74'}`, borderRadius: 10, maxWidth: 700, fontSize: 16, lineHeight: 1.6 }}>
          {judged === 'correct' ? onCorrect : onIncorrect}
        </div>
      )}
      {judged && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function SingleExampleView({ atom, onComplete, variant }: ViewProps<'single-example'>) {
  const { title, body, studentVisible, imageUrl } = atom.payload
  const displayBody = studentVisible ?? body
  const isLec = variant === 'lecture'
  const isIntro = atom.id === 'atom-intro-objectives'
  const labelText = isIntro ? '今日目标' : '案例'
  const labelColor = isIntro ? '#0d9488' : '#9333ea'
  return (
    <div style={stageStyle(variant)}>
      <div style={{ fontSize: isLec ? 13 : 11, color: labelColor, letterSpacing: '0.2em', fontWeight: 700 }}>
        {labelText}
      </div>
      <div style={{ fontSize: isLec ? 'clamp(32px, 3.4vw, 52px)' : 'clamp(26px, 2.6vw, 44px)', fontWeight: 800, textAlign: 'center', maxWidth: '35ch', lineHeight: 1.3 }}>{title}</div>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" style={{ maxWidth: isLec ? '60%' : '70%', maxHeight: isLec ? '46vh' : '40vh', objectFit: 'contain', borderRadius: 10 }} />
      )}
      <div style={{ fontSize: isLec ? 22 : 'clamp(15px, 1.2vw, 20px)', lineHeight: 1.85, maxWidth: '75ch', textAlign: isIntro ? 'left' : 'center', color: '#374151', whiteSpace: 'pre-wrap' }}>
        {displayBody}
      </div>
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function DialogueTurnView({ atom, onComplete, variant }: ViewProps<'dialogue-turn'>) {
  const { speaker, line } = atom.payload
  const bg = speaker === 'teacher' ? '#eef2ff' : speaker === 'student' ? '#f0fdf4' : '#f9fafb'
  const fg = speaker === 'teacher' ? '#4338ca' : speaker === 'student' ? '#15803d' : '#525252'
  const role = speaker === 'teacher' ? '老师' : speaker === 'student' ? '同学' : '旁白'
  const isLec = variant === 'lecture'
  return (
    <div style={stageStyle(variant)}>
      <div style={{ background: bg, padding: isLec ? '48px 56px' : '32px 40px', borderRadius: 20, maxWidth: isLec ? 1200 : 760, width: '100%' }}>
        <div style={{ fontSize: isLec ? 14 : 12, color: fg, fontWeight: 700, marginBottom: isLec ? 16 : 12, letterSpacing: '0.1em' }}>{role}</div>
        <div style={{ fontSize: isLec ? 'clamp(26px, 2.4vw, 36px)' : 22, lineHeight: 1.55, color: '#111827', fontWeight: 500 }}>{line}</div>
      </div>
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function DerivationStepView({ atom, onComplete, variant }: ViewProps<'derivation-step'>) {
  const { motivation, expression, justification } = atom.payload
  const isLec = variant === 'lecture'
  const hasMotivation = motivation && motivation.trim().length > 0
  const hasJustification = justification && justification.trim().length > 0
  if (isGeometryDerivationText([motivation, expression, justification].filter(Boolean).join(' '))) {
    const rows = geometryDerivationRows(expression, justification)
    return (
      <div style={stageStyle(variant)}>
        <div style={{ fontSize: isLec ? 13 : 11, color: '#0891b2', letterSpacing: '0.2em', fontWeight: 700 }}>
          推导一步
        </div>
        {hasMotivation && (
          <div style={{ fontSize: isLec ? 22 : 18, color: '#6b7280', textAlign: 'center', maxWidth: isLec ? 1200 : 700, lineHeight: 1.6 }}>
            <MathOrText>{motivation}</MathOrText>
          </div>
        )}
        <div style={{ display: 'grid', gap: isLec ? 16 : 12, width: '100%', maxWidth: isLec ? 1040 : 760 }}>
          {rows.map(row => (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: isLec ? '150px minmax(0,1fr)' : '118px minmax(0,1fr)', gap: 14, alignItems: 'center', background: '#fff', border: `2px solid ${row.color}33`, borderRadius: 14, padding: isLec ? '18px 24px' : '14px 18px' }}>
              <div style={{ color: row.color, fontSize: isLec ? 17 : 14, fontWeight: 950 }}>{row.label}</div>
              <div style={{ color: '#0f172a', fontSize: row.primary ? (isLec ? 34 : 26) : (isLec ? 26 : 20), fontWeight: row.primary ? 900 : 760, lineHeight: 1.35 }}>
                <MathOrText>{row.text}</MathOrText>
              </div>
            </div>
          ))}
        </div>
        {!isLec && <NextBtn onComplete={onComplete} />}
      </div>
    )
  }
  return (
    <div style={stageStyle(variant)}>
      <div style={{ fontSize: isLec ? 13 : 11, color: '#0891b2', letterSpacing: '0.2em', fontWeight: 700 }}>
        推导一步
      </div>
      {hasMotivation && (
        <div style={{ fontSize: isLec ? 22 : 18, color: '#6b7280', textAlign: 'center', maxWidth: isLec ? 1200 : 700, lineHeight: 1.6 }}>
          <MathOrText>{motivation}</MathOrText>
        </div>
      )}
      <div style={{ fontSize: isLec ? 'clamp(32px, 3.4vw, 52px)' : 'clamp(22px, 2.6vw, 36px)', fontWeight: 700, padding: isLec ? '32px 56px' : '20px 32px', background: '#fff', border: '2px solid #0891b2', borderRadius: 14, textAlign: 'center', maxWidth: '90vw' }}>
        <MathOrText>{expression}</MathOrText>
      </div>
      {hasJustification && (
        <div style={{ fontSize: isLec ? 17 : 14, color: '#6b7280', maxWidth: isLec ? 1000 : 600, textAlign: 'center', lineHeight: 1.6 }}>
          <MathOrText>{justification}</MathOrText>
        </div>
      )}
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function isGeometryDerivationText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ')
  return /[\u25b3\u2220]|Rt|HL|\u224c|全等|对应角|公共边/.test(normalized)
}

function geometryDerivationRows(expression: string, justification?: string): Array<{ label: string; text: string; color: string; primary?: boolean }> {
  // 行配色按全局语义色（semantic-highlight-colors）取，保持与几何高亮跨页一致：
  // 已知条件=蓝、辅助线/直角/推理动作=橙、全等/结论=绿。
  const condition = highlightStyleForRole('geometry-condition').color
  const auxiliary = highlightStyleForRole('geometry-auxiliary').color
  const congruence = highlightStyleForRole('geometry-congruence').color
  const conclusion = highlightStyleForRole('geometry-conclusion').color
  if (/HL|斜边/.test(`${expression} ${justification ?? ''}`) && /90|直角/.test(expression) && /AB\s*=\s*AC/.test(expression) && /AD\s*=\s*AD/.test(expression)) {
    return [
      { label: '证据 1', text: '∠ADB = ∠ADC = 90°', color: auxiliary },
      { label: '证据 2', text: 'AB = AC（已知等腰）', color: condition },
      { label: '证据 3', text: 'AD = AD（公共边）', color: condition },
      { label: '判定结论', text: 'Rt△ABD ≌ Rt△ACD（HL）', color: congruence, primary: true },
    ]
  }
  if (/Rt△ABD\s*≌\s*Rt△ACD/.test(expression) && /∠B\s*=\s*∠C/.test(expression)) {
    return [
      { label: '已证全等', text: 'Rt△ABD ≌ Rt△ACD', color: congruence, primary: true },
      { label: '对应角', text: '全等三角形的对应角相等', color: auxiliary },
      { label: '得到结论', text: '∠B = ∠C', color: conclusion, primary: true },
    ]
  }
  return [
    { label: '表达式', text: expression, color: condition, primary: true },
    { label: '依据', text: justification || '说明这一步使用的几何理由。', color: auxiliary },
  ]
}

function DemonstrationView({ atom, onComplete, variant }: ViewProps<'demonstration'>) {
  const { medium, src, narration, imageUrl } = atom.payload
  const isLec = variant === 'lecture'
  const structured = medium === 'diagram' || shouldUseConceptVisual({ narration, src, ...(atom.visualSpec ? { visualSpec: atom.visualSpec } : {}) })
  const videoUrl = medium === 'video' || /\.(mp4|webm)$/i.test(src) ? src : undefined
  return (
    <div style={stageStyle(variant)}>
      <div style={{ fontSize: isLec ? 13 : 11, color: '#f59e0b', letterSpacing: '0.2em', fontWeight: 700 }}>
        演示 · {medium}
      </div>
      <div style={{ width: '100%', flex: '1 1 auto', maxHeight: isLec ? '72vh' : '74vh', minHeight: 320, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {videoUrl ? (
          <video src={videoUrl} controls muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0f172a' }} />
        ) : structured ? (
          <ConceptVisual compact={isLec} input={{ narration, src, ...(atom.visualSpec ? { visualSpec: atom.visualSpec } : {}), ...(atom.contentType ? { contentType: atom.contentType } : {}) }} />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={narration.slice(0, 80)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ padding: 24, fontSize: 13, color: '#6b7280', overflow: 'auto' }}>
            <code>{src}</code>
          </div>
        )}
      </div>
      <div style={{ fontSize: isLec ? 22 : 'clamp(15px, 1.2vw, 20px)', color: '#374151', maxWidth: '75ch', lineHeight: 1.6, textAlign: 'center', fontWeight: isLec ? 500 : 400 }}>
        {narration}
      </div>
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function WorkedExampleView({ atom, onComplete, variant }: ViewProps<'worked-example'>) {
  const { problemStatement, steps, conclusion } = atom.payload
  const isLec = variant === 'lecture'
  const workedExampleText = [problemStatement, ...steps.flatMap(step => [step.action, step.explanation]), conclusion].filter(Boolean).join(' ')
  // 有结构化范例板时优先用它（按真实题目/步骤/结论渲染）；否则几何文本才退回 ConceptVisual。
  // 防止泛几何正则把任意等腰范例题都套进角度写死(40°)的 application 图。
  const useConceptVisual = atom.visualSpec?.kind !== 'worked-example-board'
    && /(等腰三角形|等边对等角|底角|顶角|AB\s*=\s*AC|△ABC|∠[ABC]|内角和)/.test(workedExampleText)
  const visualSpec = atom.visualSpec ?? buildWorkedExampleVisualSpec({
    problem: problemStatement,
    steps,
    conclusion,
  })
  return (
    <div style={stageStyle(variant)}>
      <div style={{ fontSize: isLec ? 13 : 11, color: '#7c3aed', letterSpacing: '0.2em', fontWeight: 700 }}>
        范例题
      </div>
      <div style={{ width: '100%', maxWidth: isLec ? 1180 : 920, flex: '1 1 auto', minHeight: isLec ? 520 : 430 }}>
        {useConceptVisual ? (
          <ConceptVisual compact={isLec} input={{ caption: workedExampleText }} />
        ) : (
          <EducationalVisual spec={visualSpec} compact={isLec} />
        )}
      </div>
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

function RecapBulletView({ atom, onComplete, variant }: ViewProps<'recap-bullet'>) {
  const isLec = variant === 'lecture'
  return (
    <div style={stageStyle(variant)}>
      <div style={{ fontSize: isLec ? 14 : 11, color: '#16a34a', letterSpacing: '0.2em', fontWeight: 700 }}>
        要点
      </div>
      <div style={{ fontSize: isLec ? 'clamp(44px, 5.5vw, 80px)' : 'clamp(32px, 5vw, 72px)', fontWeight: 800, textAlign: 'center', maxWidth: '30ch', lineHeight: 1.3 }}>
        ✓ {atom.payload.bullet}
      </div>
      {!isLec && <NextBtn onComplete={onComplete} />}
    </div>
  )
}

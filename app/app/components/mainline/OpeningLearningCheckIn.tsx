'use client'

import { Brain, CheckCircle2, Gauge, Keyboard, NotebookPen, RotateCcw, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  lessonOpeningAttemptContract,
  normalizeOpeningAttemptText,
  OPENING_ATTEMPT_MAX_LENGTH,
  openingAttemptRevisionIsComplete,
  openingAttemptReviewIsComplete,
  type ChromeColors,
  type LessonOpeningAttempt,
  type LessonPhase,
  type OpeningConfidence,
  type OpeningResponseMode,
} from '@/lib/mainline'

interface OpeningLearningCheckInProps {
  mode: 'capture' | 'review'
  phase?: LessonPhase
  openingQuestion: string
  attempt?: LessonOpeningAttempt | undefined
  chrome: ChromeColors
  onChange: (attempt: LessonOpeningAttempt) => void
}

const CONFIDENCE_OPTIONS: ReadonlyArray<{ value: OpeningConfidence; label: string }> = [
  { value: 'low', label: '没把握' },
  { value: 'medium', label: '有些把握' },
  { value: 'high', label: '很有把握' },
]

/**
 * 开场先留下可回看的作答，收束再写修正。记录只属于本次课堂会话，
 * 不冒充个人学情或自动评分证据。
 */
export function OpeningLearningCheckIn({
  mode,
  phase,
  openingQuestion,
  attempt,
  chrome,
  onChange,
}: OpeningLearningCheckInProps) {
  const contract = lessonOpeningAttemptContract(phase)
  const [open, setOpen] = useState(false)
  const [response, setResponse] = useState(attempt?.response ?? '')
  const [revision, setRevision] = useState(attempt?.revision ?? '')
  const [confidence, setConfidence] = useState<OpeningConfidence | undefined>(attempt?.confidence)
  const [responseMode, setResponseMode] = useState<OpeningResponseMode>(attempt?.responseMode ?? 'typed')
  const [paperReviewConfirmed, setPaperReviewConfirmed] = useState(attempt?.paperReviewComplete === true)

  useEffect(() => {
    setResponse(attempt?.response ?? '')
    setRevision(attempt?.revision ?? '')
    setConfidence(attempt?.confidence)
    setResponseMode(attempt?.responseMode ?? 'typed')
    setPaperReviewConfirmed(attempt?.paperReviewComplete === true)
  }, [attempt?.confidence, attempt?.paperReviewComplete, attempt?.response, attempt?.responseMode, attempt?.revision, mode, openingQuestion, phase])

  if (mode === 'review' && !attempt) return null

  const normalizedResponse = normalizeOpeningAttemptText(response)
  const normalizedRevision = normalizeOpeningAttemptText(revision)
  const captureReady = Boolean(confidence && (responseMode === 'paper-or-oral' || normalizedResponse))
  const reviewReady = Boolean(attempt && (attempt.responseMode === 'paper-or-oral'
    ? paperReviewConfirmed
    : openingAttemptRevisionIsComplete(normalizedRevision)))
  const reviewComplete = openingAttemptReviewIsComplete(attempt)
  const label = mode === 'capture'
    ? attempt ? contract.capturedLabel : contract.captureLabel
    : reviewComplete ? '已完成开场修正' : contract.reviewLabel
  const completionVisible = mode === 'capture' ? Boolean(attempt) : reviewComplete

  function save() {
    if (mode === 'capture') {
      if (!captureReady || !confidence) return
      const unchanged = attempt?.responseMode === responseMode
        && attempt.confidence === confidence
        && (responseMode === 'paper-or-oral' || attempt.response === normalizedResponse)

      if (responseMode === 'paper-or-oral') {
        onChange({
          responseMode,
          confidence,
          ...(unchanged && attempt?.paperReviewComplete ? { paperReviewComplete: true } : {}),
        })
      } else {
        onChange({
          responseMode,
          response: normalizedResponse,
          confidence,
          ...(unchanged && attempt?.revision ? { revision: attempt.revision } : {}),
        })
      }
    } else {
      if (!attempt || !reviewReady) return
      if (attempt.responseMode === 'paper-or-oral') {
        onChange({ responseMode: attempt.responseMode, confidence: attempt.confidence, paperReviewComplete: true })
      } else {
        const originalResponse = normalizeOpeningAttemptText(attempt.response ?? '')
        if (!originalResponse) return
        onChange({
          responseMode: attempt.responseMode,
          response: originalResponse,
          confidence: attempt.confidence,
          revision: normalizedRevision,
        })
      }
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      {open && (
        <div
          role="dialog"
          aria-label={mode === 'capture' ? contract.captureTitle : contract.reviewTitle}
          className="absolute bottom-[calc(100%+12px)] left-0 z-50 w-[640px] max-w-[calc(100vw-48px)] rounded-[8px] border p-5 text-left shadow-2xl"
          style={{ borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[18px] font-semibold">
                {mode === 'capture' ? contract.captureTitle : contract.reviewTitle}
              </div>
              <p className="mt-1 text-[15px] leading-[1.55]" style={{ color: chrome.mutedText }}>
                {mode === 'capture' ? contract.capturePrompt : contract.reviewPrompt}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border"
              style={{ borderColor: chrome.chipBorder, color: chrome.mutedText }}
              aria-label="关闭开场学习记录"
            >
              <X aria-hidden size={17} />
            </button>
          </div>

          <div className="mt-4 border-l-2 pl-3 text-[15px] leading-[1.55]" style={{ borderColor: chrome.activeBorder }}>
            <span className="font-semibold">开场问题：</span>{openingQuestion}
          </div>

          {mode === 'review' && attempt?.responseMode === 'typed' && (
            <div className="mt-3 rounded-[8px] border p-3" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg }}>
              <div className="text-[13px] font-semibold" style={{ color: chrome.mutedText }}>揭晓前原答 · {confidenceLabel(attempt.confidence)}</div>
              <p className="mt-1 text-[16px] leading-[1.55]">{attempt.response}</p>
            </div>
          )}

          {mode === 'review' && attempt?.responseMode === 'paper-or-oral' && (
            <div className="mt-3 rounded-[8px] border p-3" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg }}>
              <div className="text-[13px] font-semibold" style={{ color: chrome.mutedText }}>纸面或口头原答 · {confidenceLabel(attempt.confidence)}</div>
              <p className="mt-1 text-[16px] leading-[1.55]">原答保留在学生自己的记录中，系统只记录了完成方式和揭晓前把握度。</p>
            </div>
          )}

          {mode === 'capture' && (
            <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
              {([
                { value: 'typed', label: '直接记录', icon: Keyboard },
                { value: 'paper-or-oral', label: '纸面或口头作答', icon: NotebookPen },
              ] as const).map(option => {
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setResponseMode(option.value)}
                    className="inline-flex h-12 items-center justify-center gap-2 border-r text-[15px] font-semibold transition last:border-r-0 hover:brightness-110"
                    style={responseMode === option.value
                      ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                      : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
                    aria-pressed={responseMode === option.value}
                  >
                    <Icon aria-hidden size={16} />
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}

          {(mode === 'review' ? attempt?.responseMode === 'typed' : responseMode === 'typed') ? (
            <div>
              <textarea
                autoFocus
                value={mode === 'capture' ? response : revision}
                maxLength={OPENING_ATTEMPT_MAX_LENGTH}
                onChange={event => mode === 'capture' ? setResponse(event.target.value) : setRevision(event.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-[8px] border bg-transparent px-3 py-2.5 text-[17px] leading-[1.55] outline-none focus:ring-2"
                style={{ borderColor: chrome.chipBorder }}
                placeholder={mode === 'capture' ? contract.capturePlaceholder : '我会保留……；需要修正……；依据是……'}
              />
              {mode === 'review' && !openingAttemptRevisionIsComplete(normalizedRevision) && (
                <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: chrome.mutedText }} aria-live="polite">
                  请同时写清保留或修正的判断，以及对应依据
                </p>
              )}
            </div>
          ) : mode === 'capture' ? (
            <div className="mt-3 rounded-[8px] border p-3 text-[15px] leading-[1.55]" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg }}>
              请先让学生独立完成，再由教师确认。这里不会保存或推测学生答案，只记录作答方式和揭晓前把握度。
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPaperReviewConfirmed(value => !value)}
              className="mt-3 flex w-full items-start gap-3 rounded-[8px] border p-3 text-left text-[15px] leading-[1.55] transition hover:brightness-110"
              style={paperReviewConfirmed
                ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
                : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              aria-pressed={paperReviewConfirmed}
            >
              <CheckCircle2 aria-hidden size={18} className="mt-0.5 shrink-0" />
              已让学生对照证据，在原纸面记录或口头表达中完成保留、修正和依据说明
            </button>
          )}

          {mode === 'capture' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: chrome.mutedText }}>
                <Gauge aria-hidden size={15} />作答时把握
              </span>
              <div className="inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
                {CONFIDENCE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConfidence(option.value)}
                    className="border-r px-4 py-2.5 text-[14px] font-semibold transition last:border-r-0 hover:brightness-110"
                    style={confidence === option.value
                      ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                      : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
                    aria-pressed={confidence === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-[13px]" style={{ color: chrome.mutedText }}>
              {(mode === 'review' ? attempt?.responseMode === 'typed' : responseMode === 'typed')
                ? `${(mode === 'capture' ? response : revision).length} / ${OPENING_ATTEMPT_MAX_LENGTH} · `
                : ''}
              本次课堂会话记录
            </div>
            <button
              type="button"
              disabled={mode === 'capture' ? !captureReady : !reviewReady}
              onClick={save}
              className="inline-flex h-11 items-center gap-2 rounded-[8px] border px-5 text-[15px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
            >
              <Save aria-hidden size={16} />
              {mode === 'capture' ? '保存并继续' : '保存修正'}
            </button>
          </div>
        </div>
      )}

      {/* 投影授课快捷:学生在纸面/口头完成,教师一击确认——capture 报把握度,
          review 确认回看修正已在纸面完成。不产生文字,与面板 paper-or-oral 等价。 */}
      {mode === 'capture' && !attempt && (
        <span className="mr-2 inline-flex items-center overflow-hidden rounded-[8px] border align-middle" style={{ borderColor: chrome.chipBorder }}>
          <span
            className="inline-flex h-12 items-center gap-1.5 border-r px-3 text-[14px] font-semibold"
            style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.mutedText }}
          >
            <NotebookPen aria-hidden size={16} />
            纸面已作答·把握
          </span>
          {CONFIDENCE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ responseMode: 'paper-or-oral', confidence: option.value })}
              className="h-12 border-r px-3.5 text-[15px] font-semibold transition last:border-r-0 hover:brightness-110"
              style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              title={`确认学生已在纸面或口头完成开场作答,把握度:${option.label}`}
            >
              {option.label.replace('把握', '')}
            </button>
          ))}
        </span>
      )}
      {mode === 'review' && attempt && !reviewComplete && attempt.responseMode === 'paper-or-oral' && (
        <button
          type="button"
          onClick={() => onChange({ responseMode: attempt.responseMode, confidence: attempt.confidence, paperReviewComplete: true })}
          className="mr-2 inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[15px] font-semibold transition hover:brightness-110"
          style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
          title="确认学生已在纸面或口头回看开场判断并完成保留/修正"
        >
          <NotebookPen aria-hidden size={17} />
          纸面已回看修正
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110"
        style={completionVisible
          ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
          : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
        aria-expanded={open}
      >
        {mode === 'capture'
          ? attempt ? <CheckCircle2 aria-hidden size={18} /> : <Brain aria-hidden size={18} />
          : reviewComplete ? <CheckCircle2 aria-hidden size={18} /> : <RotateCcw aria-hidden size={18} />}
        {label}
      </button>
    </div>
  )
}

function confidenceLabel(confidence: OpeningConfidence): string {
  return CONFIDENCE_OPTIONS.find(option => option.value === confidence)?.label ?? confidence
}

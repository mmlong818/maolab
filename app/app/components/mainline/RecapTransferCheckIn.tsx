'use client'

import { CheckCircle2, ClipboardCheck, Gauge, Keyboard, NotebookPen, RotateCcw, Save, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  RECAP_TRANSFER_RESPONSE_MAX_LENGTH,
  RECAP_TRANSFER_REVIEW_MAX_LENGTH,
  RECAP_TRANSFER_SUCCESS_CRITERIA,
  normalizeRecapTransferResponse,
  normalizeRecapTransferReview,
  recapTransferAttemptIsComplete,
  recapTransferResponseIsReady,
  recapTransferTaskProblems,
  type ChromeColors,
  type LessonScene,
  type RecapTransferAttempt,
  type RecapTransferConfidence,
  type RecapTransferReviewDecision,
} from '@/lib/mainline'

interface RecapTransferCheckInProps {
  scene: LessonScene
  attempt?: RecapTransferAttempt
  chrome: ChromeColors
  onChange: (attempt: RecapTransferAttempt) => void
}

const CONFIDENCE_OPTIONS: ReadonlyArray<{ value: RecapTransferConfidence; label: string }> = [
  { value: 'low', label: '没把握' },
  { value: 'medium', label: '有些把握' },
  { value: 'high', label: '很有把握' },
]

export function RecapTransferCheckIn({ scene, attempt, chrome, onChange }: RecapTransferCheckInProps) {
  const task = scene.contentSlots.transferTask?.trim() ?? ''
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RecapTransferAttempt['mode']>(attempt?.mode ?? 'typed')
  const [response, setResponse] = useState(attempt?.mode === 'typed' ? attempt.response : '')
  const [confidence, setConfidence] = useState<RecapTransferConfidence | undefined>(attempt?.confidence)
  const [paperComplete, setPaperComplete] = useState(attempt?.mode === 'paper-or-oral' && attempt.paperOrOralComplete === true)
  const [reviewRevealed, setReviewRevealed] = useState(Boolean(attempt))
  const [reviewDecision, setReviewDecision] = useState<RecapTransferReviewDecision | undefined>(
    attempt?.mode === 'typed' ? attempt.reviewDecision : undefined,
  )
  const [reviewNote, setReviewNote] = useState(attempt?.mode === 'typed' ? attempt.reviewNote : '')
  const [paperReviewComplete, setPaperReviewComplete] = useState(
    attempt?.mode === 'paper-or-oral' && attempt.paperReviewComplete === true,
  )

  useEffect(() => {
    setMode(attempt?.mode ?? 'typed')
    setResponse(attempt?.mode === 'typed' ? attempt.response : '')
    setConfidence(attempt?.confidence)
    setPaperComplete(attempt?.mode === 'paper-or-oral' && attempt.paperOrOralComplete === true)
    setReviewRevealed(Boolean(attempt))
    setReviewDecision(attempt?.mode === 'typed' ? attempt.reviewDecision : undefined)
    setReviewNote(attempt?.mode === 'typed' ? attempt.reviewNote : '')
    setPaperReviewComplete(attempt?.mode === 'paper-or-oral' && attempt.paperReviewComplete === true)
  }, [attempt])

  if (recapTransferTaskProblems(task).length > 0) return null

  const normalizedResponse = normalizeRecapTransferResponse(response)
  const normalizedReview = normalizeRecapTransferReview(reviewNote)
  const initialReady = Boolean(confidence) && (mode === 'typed'
    ? recapTransferResponseIsReady(normalizedResponse)
    : paperComplete)
  const draft: RecapTransferAttempt | undefined = confidence && reviewRevealed
    ? mode === 'typed'
      ? reviewDecision
        ? {
            mode,
            confidence,
            response: normalizedResponse ?? '',
            reviewDecision,
            reviewNote: normalizedReview ?? '',
          }
        : undefined
      : paperComplete && paperReviewComplete
        ? { mode, confidence, paperOrOralComplete: true, paperReviewComplete: true }
        : undefined
    : undefined
  const ready = recapTransferAttemptIsComplete(draft)
  const completed = recapTransferAttemptIsComplete(attempt)

  function save() {
    if (!draft || !ready) return
    onChange(draft)
    setOpen(false)
  }

  function changeMode(nextMode: RecapTransferAttempt['mode']) {
    setMode(nextMode)
    setReviewRevealed(false)
    setReviewDecision(undefined)
    setReviewNote('')
    setPaperReviewComplete(false)
  }

  return (
    <div className="relative">
      {open && (
        <div
          role="dialog"
          aria-label="完成迁移挑战"
          className="absolute bottom-[calc(100%+12px)] left-1/2 z-50 max-h-[calc(100vh-140px)] w-[680px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-y-auto rounded-[8px] border p-5 text-left shadow-2xl"
          style={{ borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[18px] font-semibold">
                <Sparkles aria-hidden size={18} />迁移挑战
              </div>
              <p className="mt-1 text-[14px] leading-[1.55]" style={{ color: chrome.mutedText }}>
                先独立完成，再对照成功标准保留或修正。系统不自动判定掌握。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border"
              style={{ borderColor: chrome.chipBorder, color: chrome.mutedText }}
              aria-label="关闭迁移挑战"
            >
              <X aria-hidden size={17} />
            </button>
          </div>

          <div className="mt-4 border-l-2 pl-3 text-[17px] font-semibold leading-[1.6]" style={{ borderColor: chrome.activeBorder }}>
            {task}
          </div>

          <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
            {([
              { value: 'typed', label: '直接记录', icon: Keyboard },
              { value: 'paper-or-oral', label: '纸面或口头作答', icon: NotebookPen },
            ] as const).map(option => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={reviewRevealed}
                  onClick={() => changeMode(option.value)}
                  className="inline-flex h-12 items-center justify-center gap-2 border-r text-[15px] font-semibold transition last:border-r-0 hover:brightness-110 disabled:cursor-not-allowed"
                  style={mode === option.value
                    ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                    : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
                  aria-pressed={mode === option.value}
                >
                  <Icon aria-hidden size={16} />{option.label}
                </button>
              )
            })}
          </div>

          {mode === 'typed' ? (
            <div>
              <textarea
                autoFocus
                value={response}
                maxLength={RECAP_TRANSFER_RESPONSE_MAX_LENGTH}
                readOnly={reviewRevealed}
                onChange={event => setResponse(event.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-[8px] border bg-transparent px-3 py-2.5 text-[17px] leading-[1.55] outline-none focus:ring-2"
                style={{ borderColor: chrome.chipBorder }}
                placeholder="写出你的判断或结果，以及依据、条件或关键步骤"
              />
              {response.trim() && !recapTransferAttemptIsComplete(draft) && (
                <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: chrome.mutedText }} aria-live="polite">
                  请写清判断或结果，并说明依据、条件或关键步骤
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={reviewRevealed}
              onClick={() => setPaperComplete(value => !value)}
              className="mt-3 flex w-full items-start gap-3 rounded-[8px] border p-3 text-left text-[15px] leading-[1.55] transition hover:brightness-110 disabled:cursor-not-allowed"
              style={paperComplete
                ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
                : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              aria-pressed={paperComplete}
            >
              <CheckCircle2 aria-hidden size={18} className="mt-0.5 shrink-0" />
              已让学生独立完成，并在纸面或口头回答中说明判断和依据
            </button>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: chrome.mutedText }}>
              <Gauge aria-hidden size={15} />作答时把握
            </span>
            <div className="inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
              {CONFIDENCE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  disabled={reviewRevealed}
                  onClick={() => setConfidence(option.value)}
                  className="border-r px-4 py-2.5 text-[14px] font-semibold transition last:border-r-0 hover:brightness-110 disabled:cursor-not-allowed"
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

          {!reviewRevealed ? (
            <button
              type="button"
              disabled={!initialReady}
              onClick={() => setReviewRevealed(true)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border text-[15px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
            >
              <ClipboardCheck aria-hidden size={17} />完成初答后对照成功标准
            </button>
          ) : (
            <div className="mt-4 rounded-[8px] border p-4" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  <ClipboardCheck aria-hidden size={16} />迁移题自检标准
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewRevealed(false)
                    setReviewDecision(undefined)
                    setReviewNote('')
                    setPaperReviewComplete(false)
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-semibold"
                  style={{ borderColor: chrome.chipBorder, color: chrome.mutedText }}
                >
                  <RotateCcw aria-hidden size={13} />重做初答
                </button>
              </div>
              <p className="mt-1 text-[13px] leading-[1.5]" style={{ color: chrome.mutedText }}>
                这不是标准答案。逐条核对后，说明原答保留还是需要修正。
              </p>
              <ol className="mt-3 space-y-2 text-[14px] leading-[1.5]">
                {RECAP_TRANSFER_SUCCESS_CRITERIA.map((criterion, index) => (
                  <li key={criterion} className="flex gap-2">
                    <span className="font-semibold" style={{ color: chrome.activeText }}>{index + 1}.</span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ol>

              {mode === 'typed' ? (
                <div>
                  <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
                    {([
                      { value: 'kept', label: '原答可保留' },
                      { value: 'revised', label: '原答需修正' },
                    ] as const).map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setReviewDecision(option.value)}
                        className="h-11 border-r text-[14px] font-semibold transition last:border-r-0 hover:brightness-110"
                        style={reviewDecision === option.value
                          ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                          : { borderColor: chrome.chipBorder, background: chrome.barBg, color: chrome.chipText }}
                        aria-pressed={reviewDecision === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewNote}
                    maxLength={RECAP_TRANSFER_REVIEW_MAX_LENGTH}
                    onChange={event => setReviewNote(event.target.value)}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-[8px] border bg-transparent px-3 py-2.5 text-[15px] leading-[1.55] outline-none focus:ring-2"
                    style={{ borderColor: chrome.chipBorder }}
                    placeholder={reviewDecision === 'revised'
                      ? '写出修正后的判断或结果，并说明依据'
                      : '指出原答符合哪些标准，并说明依据'}
                  />
                  {reviewNote.trim() && !recapTransferAttemptIsComplete(draft) && (
                    <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: chrome.mutedText }} aria-live="polite">
                      请先选择保留或修正，再写清具体依据或关键步骤
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPaperReviewComplete(value => !value)}
                  className="mt-4 flex w-full items-start gap-3 rounded-[8px] border p-3 text-left text-[14px] leading-[1.55] transition hover:brightness-110"
                  style={paperReviewComplete
                    ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
                    : { borderColor: chrome.chipBorder, background: chrome.barBg, color: chrome.chipText }}
                  aria-pressed={paperReviewComplete}
                >
                  <CheckCircle2 aria-hidden size={18} className="mt-0.5 shrink-0" />
                  已逐条对照成功标准，并让学生在纸面或口头说明保留或修正及其依据
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-[13px]" style={{ color: chrome.mutedText }}>
              {mode === 'typed' ? `${response.length} / ${RECAP_TRANSFER_RESPONSE_MAX_LENGTH} · ` : ''}仅保存于本次课堂会话
            </div>
            <button
              type="button"
              disabled={!ready}
              onClick={save}
              className="inline-flex h-11 items-center gap-2 rounded-[8px] border px-5 text-[15px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
            >
              <Save aria-hidden size={16} />保存自检记录
            </button>
          </div>
        </div>
      )}

      {/* 投影授课快捷:迁移题初答、对照与订正都留在纸面,教师一击确认+报把握度。 */}
      {!completed && (
        <span className="mr-2 inline-flex items-center overflow-hidden rounded-[8px] border align-middle" style={{ borderColor: chrome.chipBorder }}>
          <span
            className="inline-flex h-12 items-center gap-1.5 border-r px-3 text-[14px] font-semibold"
            style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.mutedText }}
          >
            <NotebookPen aria-hidden size={16} />
            纸面已完成并回看·把握
          </span>
          {([
            { value: 'low' as const, label: '没' },
            { value: 'medium' as const, label: '有些' },
            { value: 'high' as const, label: '很有' },
          ]).map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ mode: 'paper-or-oral', confidence: option.value, paperOrOralComplete: true, paperReviewComplete: true })}
              className="h-12 border-r px-3.5 text-[15px] font-semibold transition last:border-r-0 hover:brightness-110"
              style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              title={`确认学生已在纸面完成迁移初答、对照成功标准并保留或订正,把握度:${option.label}把握`}
            >
              {option.label}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110"
        style={completed
          ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
          : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
        aria-expanded={open}
      >
        {completed ? <CheckCircle2 aria-hidden size={18} /> : <Sparkles aria-hidden size={18} />}
        {completed ? '迁移挑战已记录' : '完成迁移挑战'}
      </button>
    </div>
  )
}

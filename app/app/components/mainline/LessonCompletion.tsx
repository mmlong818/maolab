'use client'

import { CheckCircle2, Library, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChromeColors } from '@/lib/mainline'

interface LessonCompletionProps {
  ready: boolean
  completed: boolean
  blockedReason?: string
  hasOpeningReview: boolean
  postRevealCount: number
  practiceSavedCount: number
  hasTransferEvidence: boolean
  chrome: ChromeColors
  onComplete: () => void
  onRestart: () => void
}

export function LessonCompletion({
  ready,
  completed,
  blockedReason,
  hasOpeningReview,
  postRevealCount,
  practiceSavedCount,
  hasTransferEvidence,
  chrome,
  onComplete,
  onRestart,
}: LessonCompletionProps) {
  const [open, setOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (!ready) setOpen(false)
  }, [ready])

  function showCompletion() {
    if (!ready) return
    if (!completed) onComplete()
    setOpen(true)
  }

  const evidenceItems = [
    ...(hasOpeningReview ? ['开场判断已回看并修正'] : []),
    ...(postRevealCount > 0 ? [`${postRevealCount} 次反馈后修正已确认`] : []),
    ...(practiceSavedCount > 0 ? [`${practiceSavedCount} 次正式练习已保存`] : []),
    ...(hasTransferEvidence ? ['收束迁移题已完成'] : []),
  ]

  return (
    <>
      <button
        type="button"
        onClick={showCompletion}
        disabled={!ready}
        className="inline-flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-[8px] border px-5 text-[16px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        style={completed
          ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
          : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
        aria-haspopup="dialog"
        title={!ready ? blockedReason : completed ? '查看本课收束记录' : '确认本次课堂已完成证据闭环'}
      >
        {completed && <CheckCircle2 size={18} aria-hidden />}
        {completed ? '本课已完成' : ready ? '结束本课' : '先完成收束'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 px-10"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-completion-title"
            className="relative w-full max-w-[760px] rounded-[8px] border px-12 py-10 shadow-2xl"
            style={{ borderColor: chrome.dialogueBorder, background: chrome.dialogueBg, color: chrome.dialogueText }}
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border transition hover:brightness-95"
              style={{ borderColor: chrome.dialogueBorder, color: chrome.dialogueText }}
              aria-label="关闭本课收束记录"
              title="关闭"
            >
              <X size={20} aria-hidden />
            </button>

            <CheckCircle2 size={36} aria-hidden style={{ color: chrome.activeBorder }} />
            <h2 id="lesson-completion-title" className="mt-5 text-[34px] font-semibold leading-[1.25]">本课完成</h2>
            <p className="mt-3 max-w-[620px] text-[19px] leading-[1.65] opacity-80">
              已完成本课要求的作答、反馈与修正，不只是看完了页面。
            </p>

            <div className="mt-8 border-y py-5" style={{ borderColor: chrome.dialogueBorder }}>
              {(evidenceItems.length > 0 ? evidenceItems : ['课程收束页已确认']).map(item => (
                <div key={item} className="flex items-center gap-3 py-2 text-[18px] leading-[1.5]">
                  <CheckCircle2 size={20} className="shrink-0" aria-hidden style={{ color: chrome.activeBorder }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <p className="mt-5 text-[14px] leading-[1.6] opacity-65">
              这是本次课堂的过程确认，不替代教师评价或掌握度判定。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/mainline"
                className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-5 text-[15px] font-semibold no-underline transition hover:brightness-105"
                style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
              >
                <Library size={18} aria-hidden />
                返回课程库
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center rounded-[8px] border px-5 text-[15px] font-semibold transition hover:brightness-95"
                style={{ borderColor: chrome.dialogueBorder, color: chrome.dialogueText }}
              >
                继续回看
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onRestart()
                }}
                className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-5 text-[15px] font-semibold transition hover:brightness-95"
                style={{ borderColor: chrome.dialogueBorder, color: chrome.dialogueText }}
              >
                <RotateCcw size={18} aria-hidden />
                从头回看
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

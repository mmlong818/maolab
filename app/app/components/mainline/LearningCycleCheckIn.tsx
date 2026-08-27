'use client'

import { CheckCircle2, Eye, Gauge, Keyboard, NotebookPen, PencilLine, Save, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import {
  stagedLearningConfig,
  stagedAttemptIsComplete,
  stagedCalibrationFeedback,
  stagedLearningStateKey,
  stagedPostRevealRecordIsComplete,
  stagedRevealAction,
  normalizeStagedAttemptText,
  STAGED_ATTEMPT_MAX_LENGTH,
  type ChromeColors,
  type LessonScene,
  type PracticeFeedbackDisplay,
  type StagedAttemptMode,
  type StagedComparison,
  type StagedConfidence,
  type StagedLearningAttempt,
  type StagedLearningConfig,
  type StagedPostRevealRecord,
} from '@/lib/mainline'
import {
  normalizePracticeEvidenceText,
  PRACTICE_EVIDENCE_MAX_LENGTH,
  practiceReflectionQualityReason,
  type PracticeCriterionAlignment,
  type PracticeConfidence,
  type PracticeOutcome,
} from '@/lib/mainline/mastery'

interface LearningCycleCheckInProps {
  courseId: string
  /** 真实投影片步骤键；AI 多条说法不能共用数据库场景键。 */
  stateKey?: string | undefined
  classroomSessionId?: string | undefined
  scene: LessonScene
  successSignal?: string | undefined
  criterionAlignment?: PracticeCriterionAlignment | undefined
  chrome: ChromeColors
  feedbackRevealed: boolean
  onReveal: () => void
  stagedAttempt?: StagedLearningAttempt | undefined
  onStagedAttempt: (attempt: StagedLearningAttempt) => void
  postRevealRecord?: StagedPostRevealRecord | undefined
  onPostRevealRecord: (record: StagedPostRevealRecord) => void
  practiceEvidenceSaved: boolean
  practiceFeedback?: PracticeFeedbackDisplay | undefined
  onPracticeEvidenceSaved: (feedback: PracticeFeedbackDisplay) => void
  /**
   * 投影授课下正式练习的纸面完成状态(仅本次课堂会话,不写掌握度、不写
   * student_responses)。教师确认全班已在纸面作答并对照反馈核对后过闸。
   */
  practicePaperComplete: boolean
  onPracticePaperComplete: () => void
}

type AttemptState = PracticeFeedbackDisplay | 'pending'

type EvidencePanel = 'attempt' | 'reflection' | 'session-attempt' | 'session-correction'

interface SessionAttemptDraft {
  mode: StagedAttemptMode
  responses: string[]
  paperOrOralComplete: boolean
  confidence?: StagedConfidence
  comparison?: StagedComparison
}

/**
 * 课堂检核的完整学习证据链：揭晓前保存原答和把握度，揭晓后保存判断依据
 * 或订正，再由服务端在同一事务内写作答证据与掌握度。
 */
export function LearningCycleCheckIn({
  courseId,
  stateKey,
  classroomSessionId,
  scene,
  successSignal,
  criterionAlignment,
  chrome,
  feedbackRevealed,
  onReveal,
  stagedAttempt,
  onStagedAttempt,
  postRevealRecord,
  onPostRevealRecord,
  practiceEvidenceSaved,
  practiceFeedback,
  onPracticeEvidenceSaved,
  practicePaperComplete,
  onPracticePaperComplete,
}: LearningCycleCheckInProps) {
  const [answered, setAnswered] = useState<Record<string, AttemptState>>({})
  const [confidenceByScene, setConfidenceByScene] = useState<Record<string, PracticeConfidence>>({})
  const [attemptByScene, setAttemptByScene] = useState<Record<string, string>>({})
  const [reflectionByScene, setReflectionByScene] = useState<Record<string, string>>({})
  const [outcomeByScene, setOutcomeByScene] = useState<Record<string, PracticeOutcome>>({})
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, SessionAttemptDraft | undefined>>({})
  const [postRevealDrafts, setPostRevealDrafts] = useState<Record<string, SessionAttemptDraft | undefined>>({})
  const [panelByScene, setPanelByScene] = useState<Record<string, EvidencePanel | undefined>>({})
  const [errorByScene, setErrorByScene] = useState<Record<string, string | undefined>>({})

  const resolvedConfig = stagedLearningConfig(scene)
  if (!resolvedConfig) return null
  const config = resolvedConfig

  const responseKey = stateKey ?? stagedLearningStateKey(courseId, scene.id)
  const state = answered[responseKey]
  const confidence = confidenceByScene[responseKey]
  const attemptText = attemptByScene[responseKey] ?? ''
  const reflectionText = reflectionByScene[responseKey] ?? ''
  const pendingOutcome = outcomeByScene[responseKey]
  const sessionAttempt = stagedAttempt
  const sessionDraft = sessionDrafts[responseKey] ?? emptySessionAttemptDraft(config.promptItems.length)
  const postRevealDraft = postRevealDrafts[responseKey] ?? emptySessionAttemptDraft(config.promptItems.length)
  const postRevealAction = stagedRevealAction(scene)
  const activePanel = panelByScene[responseKey]
  const error = errorByScene[responseKey]
  const normalizedAttempt = normalizePracticeEvidenceText(attemptText)
  const normalizedReflection = normalizePracticeEvidenceText(reflectionText)
  const reflectionIssue = pendingOutcome && normalizedReflection
    ? practiceReflectionQualityReason(pendingOutcome, normalizedReflection)
    : null

  function setPanel(panel: EvidencePanel | undefined) {
    setPanelByScene(current => ({ ...current, [responseKey]: panel }))
  }

  function openSessionAttempt() {
    setSessionDrafts(current => ({
      ...current,
      [responseKey]: sessionAttempt
        ? {
            mode: sessionAttempt.mode,
            confidence: sessionAttempt.confidence,
            responses: Array.from(
              { length: config.promptItems.length },
              (_, index) => sessionAttempt.responses?.[index] ?? '',
            ),
            paperOrOralComplete: sessionAttempt.paperOrOralComplete === true,
          }
        : current[responseKey] ?? emptySessionAttemptDraft(config.promptItems.length),
    }))
    setPanel('session-attempt')
  }

  function updateSessionDraft(update: (draft: SessionAttemptDraft) => SessionAttemptDraft) {
    setSessionDrafts(current => ({
      ...current,
      [responseKey]: update(current[responseKey] ?? emptySessionAttemptDraft(config.promptItems.length)),
    }))
  }

  /**
   * 投影授课快捷:学生在纸面/口头完成,教师只确认把握度——一击等价于面板里
   * 「纸面或口头作答」+把握度+保存。不产生答案文字,不写正式掌握度,与契约
   * 「投影课堂可以确认修正留在纸面或口头表达中,系统不得伪造文字证据」一致。
   */
  function quickPaperAttempt(quickConfidence: StagedConfidence) {
    onStagedAttempt({ mode: 'paper-or-oral', confidence: quickConfidence, paperOrOralComplete: true })
    setPanel(undefined)
  }

  function quickPaperPostReveal(comparison: StagedComparison) {
    onPostRevealRecord({ mode: 'paper-or-oral', comparison, paperOrOralComplete: true })
    setPanel(undefined)
  }

  function confirmSessionAttempt() {
    if (!sessionDraft.confidence) return
    const nextAttempt: StagedLearningAttempt = sessionDraft.mode === 'paper-or-oral'
      ? {
          mode: 'paper-or-oral',
          confidence: sessionDraft.confidence,
          ...(sessionDraft.paperOrOralComplete ? { paperOrOralComplete: true as const } : {}),
        }
      : {
          mode: 'typed',
          confidence: sessionDraft.confidence,
          responses: sessionDraft.responses.map(response => normalizeStagedAttemptText(response) ?? ''),
        }
    if (!stagedAttemptIsComplete(config, nextAttempt)) return
    onStagedAttempt(nextAttempt)
    setPanel(undefined)
  }

  function openPostRevealRecord() {
    setPostRevealDrafts(current => ({
      ...current,
      [responseKey]: postRevealRecord
        ? {
            mode: postRevealRecord.mode,
            comparison: postRevealRecord.comparison,
            responses: Array.from(
              { length: config.promptItems.length },
              (_, index) => postRevealRecord.responses?.[index] ?? '',
            ),
            paperOrOralComplete: postRevealRecord.paperOrOralComplete === true,
          }
        : current[responseKey] ?? emptySessionAttemptDraft(config.promptItems.length),
    }))
    setPanel('session-correction')
  }

  function updatePostRevealDraft(update: (draft: SessionAttemptDraft) => SessionAttemptDraft) {
    setPostRevealDrafts(current => ({
      ...current,
      [responseKey]: update(current[responseKey] ?? emptySessionAttemptDraft(config.promptItems.length)),
    }))
  }

  function confirmPostRevealRecord() {
    if (!postRevealDraft.comparison) return
    const nextRecord: StagedPostRevealRecord = postRevealDraft.mode === 'paper-or-oral'
      ? {
          mode: 'paper-or-oral',
          comparison: postRevealDraft.comparison,
          ...(postRevealDraft.paperOrOralComplete ? { paperOrOralComplete: true as const } : {}),
        }
      : {
          mode: 'typed',
          comparison: postRevealDraft.comparison,
          responses: postRevealDraft.responses.map(response => normalizeStagedAttemptText(response) ?? ''),
        }
    if (!stagedPostRevealRecordIsComplete(scene, nextRecord)) return
    onPostRevealRecord(nextRecord)
    setPanel(undefined)
  }

  function revealFeedback() {
    if (!confidence || !normalizedAttempt) return
    setPanel(undefined)
    onReveal()
  }

  function beginReflection(outcome: PracticeOutcome) {
    setOutcomeByScene(current => ({ ...current, [responseKey]: outcome }))
    setErrorByScene(current => ({ ...current, [responseKey]: undefined }))
    setPanel('reflection')
  }

  async function submit() {
    if (!classroomSessionId || !confidence || !normalizedAttempt || !normalizedReflection || !pendingOutcome || !scene.kpId) return
    setAnswered(current => ({ ...current, [responseKey]: 'pending' }))
    setErrorByScene(current => ({ ...current, [responseKey]: undefined }))
    try {
      const res = await fetch('/api/v2/mainline/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          sessionId: classroomSessionId,
          sceneId: scene.id,
          kpId: scene.kpId,
          practiceSnapshot: {
            task: scene.contentSlots.task?.trim() ?? '',
            feedback: scene.contentSlots.feedback?.trim() ?? '',
          },
          outcome: pendingOutcome,
          confidence,
          attemptText: normalizedAttempt,
          reflectionText: normalizedReflection,
        }),
      })
      const data = await res.json() as {
        error?: string
        calibration?: { label?: string; message?: string }
        followUp?: {
          label?: string
          message?: string
          basis?: 'student-reflection-and-success-criterion'
        }
        evidenceBasis?: 'self-assessed-after-feedback'
        scoreStatus?: 'provisional'
      }
      if (!res.ok) throw new Error(data.error ?? String(res.status))
      const followUp = data.followUp
      if (
        data.evidenceBasis !== 'self-assessed-after-feedback'
        || data.scoreStatus !== 'provisional'
        || followUp?.basis !== 'student-reflection-and-success-criterion'
      ) {
        throw new Error('practice response is missing self-assessment provenance')
      }
      const savedFeedback: PracticeFeedbackDisplay = {
        outcome: pendingOutcome,
        label: followUp.label ?? data.calibration?.label ?? (pendingOutcome === 'correct' ? '自评达到标准' : '自评需要再练'),
        message: followUp.message
          ? `按你的原答与订正：${followUp.message}`
          : data.calibration?.message
            ? `按本次自评：${data.calibration.message}`
            : '自评证据已保存，尚未经过教师或自动评分验证。',
      }
      setAnswered(current => ({ ...current, [responseKey]: savedFeedback }))
      onPracticeEvidenceSaved(savedFeedback)
      setPanel(undefined)
    } catch (caught) {
      setAnswered(current => { const next = { ...current }; delete next[responseKey]; return next })
      const message = caught instanceof Error && /[\u3400-\u9fff]/.test(caught.message)
        ? caught.message
        : '保存失败，请检查服务后重试。'
      setErrorByScene(current => ({ ...current, [responseKey]: message }))
    }
  }

  if (!feedbackRevealed) {
    if (!config.recordsMastery) {
      const attemptComplete = stagedAttemptIsComplete(config, sessionAttempt)
      return (
        <div className="relative flex flex-wrap items-center gap-2">
          {activePanel === 'session-attempt' && (
            <SessionAttemptPopover
              phase="attempt"
              scene={scene}
              config={config}
              draft={sessionDraft}
              onChange={updateSessionDraft}
              onClose={() => setPanel(undefined)}
              onConfirm={confirmSessionAttempt}
              chrome={chrome}
            />
          )}
          {!attemptComplete && (
            <div className="inline-flex items-center overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
              <span
                className="inline-flex h-12 items-center gap-1.5 border-r px-3 text-[14px] font-semibold"
                style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.mutedText }}
              >
                <NotebookPen aria-hidden size={16} />
                纸面已作答·把握
              </span>
              {([
                { value: 'low' as const, label: '没' },
                { value: 'medium' as const, label: '有些' },
                { value: 'high' as const, label: '很有' },
              ]).map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => quickPaperAttempt(option.value)}
                  className="h-12 border-r px-3.5 text-[15px] font-semibold transition last:border-r-0 hover:brightness-110"
                  style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
                  title={`确认学生已在纸面或口头完成作答,揭晓前把握度:${option.label}把握`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={openSessionAttempt}
            className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110"
            style={attemptComplete
              ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
              : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
            aria-expanded={activePanel === 'session-attempt'}
          >
            {sessionAttempt?.mode === 'paper-or-oral'
              ? <NotebookPen aria-hidden size={18} />
              : <PencilLine aria-hidden size={18} />}
            {attemptComplete
              ? sessionAttempt?.mode === 'paper-or-oral' ? '已确认纸面或口头作答' : '已记录揭晓前作答'
              : '键入记录'}
          </button>
          <button
            type="button"
            disabled={!attemptComplete}
            onClick={() => { setPanel(undefined); onReveal() }}
            className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
            title={attemptComplete ? undefined : '先记录文字作答，或确认学生已在纸面或口头完成'}
          >
            <Eye aria-hidden size={18} />
            {config.revealLabel}
          </button>
        </div>
      )
    }

    const options: ReadonlyArray<{ value: PracticeConfidence; label: string }> = [
      { value: 'low', label: '没把握' },
      { value: 'medium', label: '有些把握' },
      { value: 'high', label: '很有把握' },
    ]
    return (
      <div className="relative flex flex-wrap items-center gap-2">
        {activePanel === 'attempt' && (
          <EvidencePopover
            title="记录揭晓前原答"
            prompt="写下你的答案和判断依据。系统只在你看反馈之前记录这一版。"
            value={attemptText}
            onChange={value => setAttemptByScene(current => ({ ...current, [responseKey]: value }))}
            onClose={() => setPanel(undefined)}
            onConfirm={() => setPanel(undefined)}
            confirmLabel="暂存原答"
            chrome={chrome}
          />
        )}
        <button
          type="button"
          onClick={() => setPanel('attempt')}
          className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110"
          style={normalizedAttempt
            ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
            : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
          aria-expanded={activePanel === 'attempt'}
        >
          <PencilLine aria-hidden size={18} />
          {normalizedAttempt ? '已记录原答' : '记录原答'}
        </button>
        <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: chrome.mutedText }}>
          <Gauge aria-hidden size={17} />
          揭晓前把握
        </span>
        <div className="inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setConfidenceByScene(current => ({ ...current, [responseKey]: option.value }))}
              className="h-12 border-r px-3 text-[15px] font-semibold transition last:border-r-0 hover:brightness-110"
              style={confidence === option.value
                ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              aria-pressed={confidence === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!confidence || !normalizedAttempt}
          onClick={revealFeedback}
          className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
          title={!normalizedAttempt ? '先记录揭晓前原答' : !confidence ? '先选择揭晓前把握度' : undefined}
        >
          <Eye aria-hidden size={18} />
          {config.revealLabel}
        </button>
        {/* 投影授课直通:学生在纸面作答,系统不采集文字、不写掌握度——一击揭晓。 */}
        <button
          type="button"
          onClick={() => { setPanel(undefined); onReveal() }}
          className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[15px] font-semibold transition hover:brightness-110"
          style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
          title="全班已在纸面或口头完成作答,直接展开反馈。本页不写正式掌握度。"
        >
          <NotebookPen aria-hidden size={17} />
          纸面已作答·看反馈
        </button>
      </div>
    )
  }

  if (!config.recordsMastery && postRevealAction) {
    const postRevealComplete = stagedPostRevealRecordIsComplete(scene, postRevealRecord)
    const calibration = stagedCalibrationFeedback(sessionAttempt, postRevealRecord)
    const confidenceLabel = sessionAttempt ? stagedConfidenceLabel(sessionAttempt.confidence) : undefined
    const sessionEvidence = calibration
      ? `${calibration.label}：${calibration.message}`
      : sessionAttempt?.mode === 'typed'
        ? `揭晓前${confidenceLabel}；已保留 ${sessionAttempt.responses?.length ?? 0} 条文字作答，仅用于本次课堂。`
        : sessionAttempt?.mode === 'paper-or-oral'
          ? `揭晓前${confidenceLabel}；已确认纸面或口头作答，系统未生成答案文本。`
          : '本页反馈已经展开。'
    return (
      <div className="relative flex flex-wrap items-center gap-2">
        {activePanel === 'session-correction' && (
          <SessionAttemptPopover
            phase="correction"
            scene={scene}
            config={config}
            draft={postRevealDraft}
            onChange={updatePostRevealDraft}
            onClose={() => setPanel(undefined)}
            onConfirm={confirmPostRevealRecord}
            chrome={chrome}
          />
        )}
        <div className="max-w-[330px] rounded-[8px] border px-3 py-2" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <CheckCircle2 aria-hidden size={16} />
            {config.revealedLabel}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.45]" style={{ color: chrome.mutedText }}>{sessionEvidence}</div>
        </div>
        {!postRevealComplete && (
          <div className="inline-flex items-center overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
            <span
              className="inline-flex h-12 items-center gap-1.5 border-r px-3 text-[14px] font-semibold"
              style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.mutedText }}
            >
              <NotebookPen aria-hidden size={16} />
              纸面已核对
            </span>
            {([
              { value: 'matched' as const, label: '原判断一致' },
              { value: 'revised' as const, label: '需要修正' },
            ]).map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => quickPaperPostReveal(option.value)}
                className="h-12 border-r px-3.5 text-[15px] font-semibold transition last:border-r-0 hover:brightness-110"
                style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
                title={`确认学生已在纸面或口头完成核对与修正:${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={openPostRevealRecord}
          className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110"
          style={postRevealComplete
            ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
            : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
          aria-expanded={activePanel === 'session-correction'}
        >
          {postRevealRecord?.mode === 'paper-or-oral'
            ? <NotebookPen aria-hidden size={18} />
            : <PencilLine aria-hidden size={18} />}
          {postRevealComplete
            ? postRevealRecord?.mode === 'paper-or-oral' ? '已确认揭晓后核对' : '已记录揭晓后核对'
            : '键入记录'}
        </button>
      </div>
    )
  }

  if (!scene.kpId) {
    return (
      <div className="max-w-[360px] rounded-[8px] border px-3 py-2" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}>
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <CheckCircle2 aria-hidden size={16} />
          {config.revealedLabel}
        </div>
        <div className="mt-0.5 text-[12px] leading-[1.45]" style={{ color: chrome.mutedText }}>本页未关联知识点，不写入正式掌握度。</div>
      </div>
    )
  }

  const displayedFeedback = state && state !== 'pending'
    ? state
    : practiceEvidenceSaved ? practiceFeedback : undefined
  if (displayedFeedback) {
    return (
      <div className="max-w-[360px] rounded-[8px] border px-3 py-2" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}>
        <div className="text-[13px] font-semibold">已保存自评证据 · {displayedFeedback.label}</div>
        <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.45]" style={{ color: chrome.mutedText }}>{displayedFeedback.message}</div>
      </div>
    )
  }

  if (practiceEvidenceSaved) {
    return (
      <div className="max-w-[360px] rounded-[8px] border px-3 py-2" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}>
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <CheckCircle2 aria-hidden size={16} />
          已从服务端恢复学习记录
        </div>
        <div className="mt-0.5 text-[12px] leading-[1.45]" style={{ color: chrome.mutedText }}>题目、反馈与作答证据版本一致，可继续本次课堂。</div>
      </div>
    )
  }

  if (practicePaperComplete) {
    return (
      <div className="max-w-[360px] rounded-[8px] border px-3 py-2" style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}>
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <NotebookPen aria-hidden size={16} />
          已确认纸面核对完成
        </div>
        <div className="mt-0.5 text-[12px] leading-[1.45]" style={{ color: chrome.mutedText }}>本页作答与订正留在纸面或口头,不写入正式掌握度。</div>
      </div>
    )
  }

  return (
    <div className="relative flex items-center gap-2">
      {activePanel === 'reflection' && pendingOutcome && (
        <EvidencePopover
          title={pendingOutcome === 'correct' ? '写下关键依据' : '完成错因订正'}
          prompt={pendingOutcome === 'correct'
            ? '用自己的话写出答案成立的关键依据，确认不是只记住结果。'
            : '写出原判断从哪里开始偏离，并给出改正后的答案或关键步骤。'}
          criterion={successSignal}
          criterionAlignment={criterionAlignment}
          value={reflectionText}
          onChange={value => setReflectionByScene(current => ({ ...current, [responseKey]: value }))}
          onClose={() => setPanel(undefined)}
          onConfirm={() => void submit()}
          confirmLabel={state === 'pending' ? '保存中…' : '保存学习记录'}
          disabled={state === 'pending' || !classroomSessionId || Boolean(reflectionIssue)}
          error={error ?? reflectionIssue ?? undefined}
          chrome={chrome}
        />
      )}
      <span className="text-[15px] font-semibold" style={{ color: chrome.mutedText }}>对照成功标准后：</span>
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={() => beginReflection('correct')}
        className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-[#5b7350] bg-[#1c2416] px-4 text-[16px] font-semibold text-[#cfe3bd] transition hover:bg-[#26301d] disabled:opacity-40"
      >
        <CheckCircle2 aria-hidden size={18} />
        自评达标
      </button>
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={() => beginReflection('incorrect')}
        className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-[#7a4b3a] bg-[#251510] px-4 text-[16px] font-semibold text-[#ecc9b3] transition hover:bg-[#2f1c14] disabled:opacity-40"
      >
        <XCircle aria-hidden size={18} />
        自评需再练
      </button>
      {/* 投影授课:核对留在纸面/口头,一击过闸;不保存自评,不写掌握度。 */}
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={onPracticePaperComplete}
        className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[15px] font-semibold transition hover:brightness-110 disabled:opacity-40"
        style={{ borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
        title="全班已对照成功标准在纸面或口头完成核对与订正。本页不写正式掌握度。"
      >
        <NotebookPen aria-hidden size={17} />
        纸面核对完成·不记分
      </button>
    </div>
  )
}

function emptySessionAttemptDraft(responseCount: number): SessionAttemptDraft {
  return {
    mode: 'typed',
    responses: Array(responseCount).fill(''),
    paperOrOralComplete: false,
  }
}

function stagedConfidenceLabel(confidence: StagedConfidence): string {
  if (confidence === 'low') return '没把握'
  if (confidence === 'high') return '很有把握'
  return '有些把握'
}

function sessionResponseLabel(
  config: StagedLearningConfig,
  index: number,
  phase: 'attempt' | 'correction',
): string {
  if (config.promptItems.length > 1) {
    return phase === 'attempt'
      ? `说法 ${index + 1} 的判断与证据`
      : `说法 ${index + 1} 的正确改写与证据`
  }
  if (phase === 'correction') {
    switch (config.sceneType) {
      case 'worked-example': return '关键一步为什么成立'
      case 'contrast': return '正确表述与关键条件'
      case 'ai-verify': return '正确改写与本课证据'
      case 'practice': return '订正与依据'
    }
  }
  switch (config.sceneType) {
    case 'worked-example': return '补出的关键一步与依据'
    case 'contrast': return '你的判断与依据'
    case 'ai-verify': return '找出的错误与本课证据'
    case 'practice': return '揭晓前原答'
  }
}

function SessionAttemptPopover({
  phase,
  scene,
  config,
  draft,
  onChange,
  onClose,
  onConfirm,
  chrome,
}: {
  phase: 'attempt' | 'correction'
  scene: LessonScene
  config: StagedLearningConfig
  draft: SessionAttemptDraft
  onChange: (update: (draft: SessionAttemptDraft) => SessionAttemptDraft) => void
  onClose: () => void
  onConfirm: () => void
  chrome: ChromeColors
}) {
  const normalizedResponses = draft.responses.map(response => normalizeStagedAttemptText(response) ?? '')
  const attemptCandidate: StagedLearningAttempt | undefined = draft.confidence
    ? draft.mode === 'paper-or-oral'
      ? {
          mode: 'paper-or-oral',
          confidence: draft.confidence,
          ...(draft.paperOrOralComplete ? { paperOrOralComplete: true as const } : {}),
        }
      : { mode: 'typed', confidence: draft.confidence, responses: normalizedResponses }
    : undefined
  const correctionCandidate: StagedPostRevealRecord | undefined = draft.comparison
    ? draft.mode === 'paper-or-oral'
      ? {
          mode: 'paper-or-oral',
          comparison: draft.comparison,
          ...(draft.paperOrOralComplete ? { paperOrOralComplete: true as const } : {}),
        }
      : { mode: 'typed', comparison: draft.comparison, responses: normalizedResponses }
    : undefined
  const valid = phase === 'attempt'
    ? stagedAttemptIsComplete(config, attemptCandidate)
    : stagedPostRevealRecordIsComplete(scene, correctionCandidate)
  const responseCount = config.promptItems.length
  const revealAction = stagedRevealAction(scene)
  const title = phase === 'attempt' ? '记录揭晓前作答' : revealAction?.label ?? '记录揭晓后修正'

  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute bottom-[calc(100%+12px)] left-0 z-50 w-[680px] max-w-[calc(100vw-48px)] rounded-[8px] border p-5 text-left shadow-2xl"
      style={{ borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[18px] font-semibold">{title}</div>
          <p className="mt-1 text-[15px] leading-[1.55]" style={{ color: chrome.mutedText }}>
            {phase === 'correction'
              ? `${revealAction?.instruction ?? '对照反馈完成修正或解释。'} 记录只属于本次课堂，不写入正式掌握度。`
              : responseCount > 1
                ? `这 ${responseCount} 条说法需要逐条完成。记录只属于本次课堂，不写入正式掌握度。`
                : '先留下学生自己的思考，再展开示范或修正。记录只属于本次课堂，不写入正式掌握度。'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border"
          style={{ borderColor: chrome.chipBorder, color: chrome.mutedText }}
          aria-label={phase === 'attempt' ? '关闭作答记录' : '关闭修正记录'}
        >
          <X aria-hidden size={17} />
        </button>
      </div>

      <div className="mt-3 inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
        {([
          { mode: 'typed' as const, label: '直接记录', icon: Keyboard },
          { mode: 'paper-or-oral' as const, label: phase === 'attempt' ? '纸面或口头作答' : '纸面或口头完成', icon: NotebookPen },
        ]).map(option => {
          const Icon = option.icon
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onChange(current => ({ ...current, mode: option.mode }))}
              className="inline-flex h-12 items-center gap-2 border-r px-4 text-[15px] font-semibold last:border-r-0"
              style={draft.mode === option.mode
                ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              aria-pressed={draft.mode === option.mode}
            >
              <Icon aria-hidden size={16} />
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <div className="text-[14px] font-semibold" style={{ color: chrome.mutedText }}>
          {phase === 'attempt' ? '揭晓前把握度' : '对照反馈后的结果'}
        </div>
        <div className="mt-1.5 inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
          {(phase === 'attempt'
            ? [
                { value: 'low' as const, label: '没把握' },
                { value: 'medium' as const, label: '有些把握' },
                { value: 'high' as const, label: '很有把握' },
              ]
            : [
                { value: 'matched' as const, label: '原判断基本一致' },
                { value: 'revised' as const, label: '原判断需要修正' },
              ]
          ).map(option => {
            const selected = phase === 'attempt'
              ? draft.confidence === option.value
              : draft.comparison === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(current => phase === 'attempt'
                  ? { ...current, confidence: option.value as StagedConfidence }
                  : { ...current, comparison: option.value as StagedComparison })}
                className="h-11 border-r px-4 text-[14px] font-semibold last:border-r-0"
                style={selected
                  ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                  : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {draft.mode === 'typed' ? (
        <div className="mt-3 max-h-[min(46vh,380px)] space-y-3 overflow-y-auto pr-1">
          {config.promptItems.map((promptItem, index) => (
            <label key={`${index}-${promptItem}`} className="block">
              <span className="text-[15px] font-semibold">{sessionResponseLabel(config, index, phase)}</span>
              {responseCount > 1 && (
                <span className="mt-0.5 block line-clamp-2 text-[14px] leading-[1.5]" style={{ color: chrome.mutedText }}>
                  {promptItem}
                </span>
              )}
              <textarea
                autoFocus={index === 0}
                value={draft.responses[index] ?? ''}
                maxLength={STAGED_ATTEMPT_MAX_LENGTH}
                onChange={event => {
                  const value = event.target.value
                  onChange(current => {
                    const responses = [...current.responses]
                    responses[index] = value
                    return { ...current, responses }
                  })
                }}
                rows={responseCount > 1 ? 2 : 4}
                className="mt-1.5 w-full resize-none rounded-[8px] border bg-transparent px-3 py-2.5 text-[16px] leading-[1.55] outline-none focus:ring-2"
                style={{ borderColor: chrome.chipBorder }}
                placeholder={phase === 'correction'
                  ? responseCount > 1
                    ? '逐条写下核对结果、正确说法和一条本课证据…'
                    : draft.comparison === 'matched'
                      ? '说明原判断成立的关键依据，并检查适用条件…'
                      : '写下第一处偏离、正确表述和关键依据…'
                  : responseCount > 1 ? '写下具体错误和一条本课证据…' : '写下答案、依据或关键步骤…'}
              />
            </label>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChange(current => ({ ...current, paperOrOralComplete: !current.paperOrOralComplete }))}
          className="mt-3 flex w-full items-start gap-3 rounded-[8px] border p-4 text-left"
          style={draft.paperOrOralComplete
            ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
            : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
          aria-pressed={draft.paperOrOralComplete}
        >
          <CheckCircle2 aria-hidden size={18} className="mt-0.5 shrink-0" />
          <span>
            <span className="block text-[15px] font-semibold">
              {phase === 'correction'
                ? responseCount > 1 ? `已让学生逐条修正这 ${responseCount} 项` : '已让学生完成本项修正或解释'
                : responseCount > 1 ? `已让学生逐条完成这 ${responseCount} 项` : '已让学生独立完成本项作答'}
            </span>
            <span className="mt-0.5 block text-[14px] leading-[1.5]" style={{ color: chrome.mutedText }}>
              {phase === 'correction'
                ? '修正保留在学生纸面或口头表达中；系统只确认完成方式，不保存、推测或伪造修正文本。'
                : '答案保留在学生纸面或口头表达中；系统只确认完成方式，不保存、推测或伪造答案文本。'}
            </span>
          </span>
        </button>
      )}

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="text-[13px]" style={{ color: chrome.mutedText }}>
          {draft.mode === 'typed'
            ? `${phase === 'attempt' ? draft.confidence ? '已选把握度' : '未选把握度' : draft.comparison ? '已选核对结果' : '未选核对结果'} · 已完成 ${draft.responses.filter(response => normalizeStagedAttemptText(response)).length} / ${responseCount} 项`
            : draft.paperOrOralComplete ? '已确认完成' : '尚未确认完成'}
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={onConfirm}
          className="inline-flex h-11 items-center gap-2 rounded-[8px] border px-5 text-[15px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
        >
          <Save aria-hidden size={16} />
          {phase === 'attempt' ? '保存本次课堂作答' : '保存本次课堂核对'}
        </button>
      </div>
    </div>
  )
}

function EvidencePopover({
  title,
  prompt,
  criterion,
  criterionAlignment,
  value,
  onChange,
  onClose,
  onConfirm,
  confirmLabel,
  disabled = false,
  error,
  chrome,
}: {
  title: string
  prompt: string
  criterion?: string | undefined
  criterionAlignment?: PracticeCriterionAlignment | undefined
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
  confirmLabel: string
  disabled?: boolean
  error?: string | undefined
  chrome: ChromeColors
}) {
  const valid = Boolean(normalizePracticeEvidenceText(value))
  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute bottom-[calc(100%+12px)] left-0 z-50 w-[440px] max-w-[calc(100vw-48px)] rounded-[8px] border p-4 text-left shadow-2xl"
      style={{ borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          <p className="mt-1 text-[13px] leading-[1.5]" style={{ color: chrome.mutedText }}>{prompt}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border"
          style={{ borderColor: chrome.chipBorder, color: chrome.mutedText }}
          aria-label="关闭作答记录"
        >
          <X aria-hidden size={17} />
        </button>
      </div>
      {criterion && (
        <div className="mt-3 border-l-2 pl-3 text-[13px] leading-[1.5]" style={{ borderColor: chrome.activeBorder, color: chrome.chipText }}>
          <span className="font-semibold">
            {criterionAlignment === 'course-level-legacy' ? '本课成功标准（旧课总目标）：' : '本题成功标准：'}
          </span>
          {criterion}
        </div>
      )}
      <textarea
        autoFocus
        value={value}
        maxLength={PRACTICE_EVIDENCE_MAX_LENGTH}
        onChange={event => onChange(event.target.value)}
        rows={4}
        className="mt-3 w-full resize-none rounded-[8px] border bg-transparent px-3 py-2 text-[15px] leading-[1.55] outline-none focus:ring-2"
        style={{ borderColor: chrome.chipBorder }}
        placeholder="写下答案、依据或关键步骤…"
      />
      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="text-[12px]" style={{ color: error ? '#f6b7a0' : chrome.mutedText }}>
          {error ?? `${value.length} / ${PRACTICE_EVIDENCE_MAX_LENGTH}`}
        </div>
        <button
          type="button"
          disabled={!valid || disabled}
          onClick={onConfirm}
          className="inline-flex h-12 items-center gap-2 rounded-[8px] border px-4 text-[16px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }}
        >
          <Save aria-hidden size={18} />
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

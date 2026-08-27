'use client'

/**
 * SceneEditForm · 上课前修正本幕内容。
 *
 * 覆盖 EDITABLE_SCENE_FIELDS 里的全部内容字段。contentSlots 的键决定渲染结构，
 * 这里只允许改值、不允许改键，避免教师修正文案时破坏图表或学科渲染契约。
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AI_VERIFY_OVERLAP_THRESHOLD,
  aiVerifyTextOverlapRatio,
  misconceptionSourcesOf,
  type LessonScene,
  type VoiceCue,
} from '@/lib/mainline'
import type { ScenePatchInput } from './useWorkbenchActions'
import { contentSlotLabel, orderedContentSlotEntries } from './labels'

interface SceneEditFormProps {
  scene: LessonScene
  misconceptionOptions: readonly string[]
  requestedMisconception?: string
  saving: boolean
  onSave: (patch: ScenePatchInput) => Promise<boolean>
  onCancel: () => void
}

export function SceneEditForm({
  scene,
  misconceptionOptions,
  requestedMisconception,
  saving,
  onSave,
  onCancel,
}: SceneEditFormProps) {
  const canAssignMisconceptions = (scene.sceneType === 'contrast' || scene.sceneType === 'ai-verify')
    && misconceptionOptions.length > 0
  const initialMisconceptionSources = initialSourceSelection(scene, misconceptionOptions, requestedMisconception)
  const [visualFocus, setVisualFocus] = useState(scene.visualFocus)
  const [contentSlots, setContentSlots] = useState<Record<string, string>>(() => canAssignMisconceptions
    ? reconcileMisconceptionContent(scene, scene.contentSlots, misconceptionSourcesOf(scene), initialMisconceptionSources)
    : { ...scene.contentSlots })
  const [misconceptionSources, setMisconceptionSources] = useState<string[]>(initialMisconceptionSources)
  const [narrationAnchor, setNarrationAnchor] = useState(scene.narrationAnchor)
  const [teacherScript, setTeacherScript] = useState(scene.teacherScript)
  const [studentAction, setStudentAction] = useState(scene.studentAction)
  const [voicePace, setVoicePace] = useState<VoiceCue['pace']>(scene.voiceCue.pace)
  const [pauseRule, setPauseRule] = useState(scene.voiceCue.pauseRule)
  const [boardText, setBoardText] = useState(scene.boardText.join('\n'))
  const [evidenceOnScreen, setEvidenceOnScreen] = useState(scene.evidenceOnScreen.join('\n'))
  const [validationError, setValidationError] = useState<string | null>(null)

  async function handleSave() {
    const normalizedSlots = Object.fromEntries(
      Object.entries(contentSlots).map(([key, value]) => [key, value.trim()]),
    )
    const emptySlot = Object.entries(normalizedSlots).find(([, value]) => !value)
    const boardLines = boardText.split('\n').map(line => line.trim()).filter(Boolean)
    const evidenceLines = evidenceOnScreen.split('\n').map(line => line.trim()).filter(Boolean)
    if (!visualFocus.trim()) return setValidationError('画面标题不能为空。')
    if (Object.keys(normalizedSlots).length === 0) return setValidationError('画面核心内容不能为空。')
    if (emptySlot) return setValidationError(`画面内容「${contentSlotLabel(emptySlot[0])}」不能为空。`)
    if (boardLines.length === 0) return setValidationError('板书至少要留一行。')
    if (evidenceLines.length === 0) return setValidationError('画面证据至少要留一行。')
    if (!narrationAnchor.trim()) return setValidationError('讲解锚点不能为空。')
    if (!teacherScript.trim()) return setValidationError('老师讲稿不能为空。')
    if (!studentAction.trim()) return setValidationError('学生动作不能为空。')
    if (!pauseRule.trim()) return setValidationError('停顿与接续不能为空。')
    if (canAssignMisconceptions && misconceptionSources.length === 0) {
      return setValidationError('请明确选择本页正在处理的教材误区。')
    }
    // 必须以 canAssignMisconceptions 为前置:选项为空时选择器根本不渲染,
    // sources 恒为 [],无条件检查会把 contrast 页的一切编辑永久卡死(2026-08-26 code-review CONFIRMED)。
    if (canAssignMisconceptions && scene.sceneType === 'contrast' && misconceptionSources.length !== 1) {
      return setValidationError('一张辨析页一次只处理一条教材误区。')
    }
    if (scene.sceneType === 'ai-verify') {
      const multi = misconceptionSources.length > 1
      const weakClaimIndex = misconceptionSources.findIndex((source, index) => {
        const claimKey = multi ? `aiClaim${index + 1}` : 'aiClaim'
        return aiVerifyTextOverlapRatio(source, normalizedSlots[claimKey] ?? '') < AI_VERIFY_OVERLAP_THRESHOLD
      })
      if (weakClaimIndex >= 0) {
        return setValidationError(`第 ${weakClaimIndex + 1} 条错误说法需要紧扣所选教材误区，不能只改归属标签。`)
      }
    }
    setValidationError(null)

    const ok = await onSave({
      visualFocus: visualFocus.trim(),
      contentSlots: normalizedSlots,
      narrationAnchor: narrationAnchor.trim(),
      teacherScript: teacherScript.trim(),
      studentAction: studentAction.trim(),
      voiceCue: { ...scene.voiceCue, pace: voicePace, pauseRule: pauseRule.trim() },
      boardText: boardLines,
      evidenceOnScreen: evidenceLines,
      ...(canAssignMisconceptions ? { misconceptionSources } : {}),
    })
    if (ok) onCancel()
  }

  function selectMisconception(source: string) {
    const nextSources = scene.sceneType === 'contrast'
      ? [source]
      : misconceptionOptions.filter(option => option === source
        ? !misconceptionSources.includes(source)
        : misconceptionSources.includes(option))
    setContentSlots(current => reconcileMisconceptionContent(scene, current, misconceptionSources, nextSources))
    setMisconceptionSources(nextSources)
    setValidationError(null)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #dedbd4', borderRadius: 8, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#24262b' }}>修正本幕内容</div>
        <div style={{ fontSize: 12, color: '#7b7f87' }}>保存后重新检查课程</div>
      </div>

      <Field label="画面标题">
        <input
          value={visualFocus}
          onChange={e => setVisualFocus(e.target.value)}
          style={inputStyle}
        />
      </Field>

      {canAssignMisconceptions && (
        <fieldset style={misconceptionFieldsetStyle}>
          <legend style={{ padding: 0, fontSize: 12, fontWeight: 800, color: '#555a63' }}>
            本页明确处理的教材误区
          </legend>
          {requestedMisconception && misconceptionOptions.includes(requestedMisconception) && (
            <p style={{ margin: '7px 0 10px', fontSize: 12, lineHeight: 1.6, color: '#8b3427' }}>
              排练发现：{requestedMisconception}
            </p>
          )}
          <div style={{ display: 'grid', gap: 7 }}>
            {misconceptionOptions.map(source => {
              const checked = misconceptionSources.includes(source)
              return (
                <label key={source} style={misconceptionOptionStyle(checked)}>
                  <input
                    type={scene.sceneType === 'contrast' ? 'radio' : 'checkbox'}
                    name={scene.sceneType === 'contrast' ? `misconception-${scene.id}` : undefined}
                    checked={checked}
                    onChange={() => selectMisconception(source)}
                  />
                  <span>{source}</span>
                </label>
              )
            })}
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 11, lineHeight: 1.6, color: '#777b83' }}>
            {scene.sceneType === 'contrast'
              ? '选择后会把“错误想法”锁定为教材原文；请重新确认对应修正。'
              : '可逐条增减；每条错误说法和核查结论都必须与教材误区一一对应。'}
          </p>
        </fieldset>
      )}

      <div style={{ marginBottom: 14, padding: '12px 12px 2px', border: '1px solid #ebe8e1', borderRadius: 8, background: '#faf9f6' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#555a63', marginBottom: 10 }}>画面核心内容</div>
        {orderedContentSlotEntries({ ...scene, contentSlots }).map(([key, value]) => (
          <Field key={key} label={contentSlotLabel(key)} detail={key}>
            <AutoResizeTextarea
              value={value}
              onChange={nextValue => setContentSlots(current => ({ ...current, [key]: nextValue }))}
              minRows={value.length > 80 ? 4 : 2}
            />
          </Field>
        ))}
      </div>

      <Field label="讲解锚点">
        <input
          value={narrationAnchor}
          onChange={e => setNarrationAnchor(e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="老师讲稿">
        <AutoResizeTextarea value={teacherScript} onChange={setTeacherScript} minRows={5} />
      </Field>

      <Field label="学生动作">
        <AutoResizeTextarea value={studentAction} onChange={setStudentAction} minRows={2} />
      </Field>

      <Field label="讲述速度">
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="讲述速度">
          {PACE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={voicePace === option.value}
              onClick={() => setVoicePace(option.value)}
              style={paceButtonStyle(voicePace === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="停顿与接续">
        <AutoResizeTextarea value={pauseRule} onChange={setPauseRule} minRows={2} />
      </Field>

      <Field label={scene.sceneType === 'visual-observation'
        ? '投影片要点（一行一条；画面三层请修改上方标题和说明）'
        : '投影片要点（一行一条）'}>
        <AutoResizeTextarea value={boardText} onChange={setBoardText} minRows={4} />
      </Field>

      <Field label="画面证据（一行一条）">
        <AutoResizeTextarea value={evidenceOnScreen} onChange={setEvidenceOnScreen} minRows={3} />
      </Field>

      {validationError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{validationError}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} disabled={saving} style={secondaryButtonStyle}>
          取消
        </button>
        <button type="button" onClick={handleSave} disabled={saving} style={primaryButtonStyle(saving)}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, color: '#555a63', marginBottom: 5 }}>
        <span>{label}</span>
        {detail ? <code style={{ color: '#9a9da3', fontSize: 11 }}>{detail}</code> : null}
      </div>
      {children}
    </div>
  )
}

function initialSourceSelection(
  scene: LessonScene,
  options: readonly string[],
  requested: string | undefined,
): string[] {
  const current = misconceptionSourcesOf(scene).filter(source => options.includes(source))
  if (!requested || !options.includes(requested) || current.includes(requested)) return current
  if (scene.sceneType === 'contrast') return [requested]
  return options.filter(source => current.includes(source) || source === requested)
}

const INDEXED_AI_SLOT = /^(?:aiClaim|reveal)\d+$/

function reconcileMisconceptionContent(
  scene: LessonScene,
  contentSlots: Record<string, string>,
  previousSources: readonly string[],
  nextSources: readonly string[],
): Record<string, string> {
  if (scene.sceneType === 'contrast') {
    const nextSource = nextSources[0]
    if (!nextSource) return { ...contentSlots }
    return {
      ...contentSlots,
      misconception: nextSource,
      correction: nextSource === previousSources[0] ? contentSlots.correction ?? '' : '',
    }
  }
  if (scene.sceneType !== 'ai-verify') return { ...contentSlots }

  const previousPairs = new Map(previousSources.map((source, index) => {
    const multi = previousSources.length > 1
    return [source, {
      claim: contentSlots[multi ? `aiClaim${index + 1}` : 'aiClaim'] ?? directAiClaim(source),
      reveal: contentSlots[multi ? `reveal${index + 1}` : 'reveal'] ?? '',
    }] as const
  }))
  const pairs = nextSources.map(source => previousPairs.get(source) ?? { claim: directAiClaim(source), reveal: '' })
  const stable = Object.fromEntries(Object.entries(contentSlots).filter(([key]) => !INDEXED_AI_SLOT.test(key)))

  if (nextSources.length <= 1) {
    const pair = pairs[0]
    return {
      ...stable,
      aiClaim: pair?.claim ?? '',
      reveal: pair?.reveal ?? '',
    }
  }

  const indexed = Object.fromEntries(pairs.flatMap((pair, index) => [
    [`aiClaim${index + 1}`, pair.claim],
    [`reveal${index + 1}`, pair.reveal],
  ]))
  return {
    ...stable,
    aiClaim: pairs.map((pair, index) => `${index + 1}. ${pair.claim}`).join('\n'),
    reveal: pairs.map((pair, index) => `${index + 1}. ${pair.reveal}`).join('\n'),
    ...indexed,
  }
}

function directAiClaim(source: string): string {
  return source
}

function AutoResizeTextarea({ value, onChange, minRows }: { value: string; onChange: (value: string) => void; minRows: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={event => onChange(event.target.value)}
      rows={minRows}
      style={textareaStyle}
    />
  )
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
}
const textareaStyle: CSSProperties = {
  ...inputStyle, resize: 'none', overflowY: 'hidden', fontFamily: 'inherit', lineHeight: 1.5,
}
const secondaryButtonStyle: CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const misconceptionFieldsetStyle: CSSProperties = {
  margin: '0 0 14px',
  padding: '12px 0',
  border: 0,
  borderTop: '1px solid #e5e2db',
  borderBottom: '1px solid #e5e2db',
}

function misconceptionOptionStyle(checked: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '18px minmax(0, 1fr)',
    gap: 8,
    alignItems: 'start',
    padding: '8px 10px',
    borderLeft: `3px solid ${checked ? '#8b3427' : '#d8d6cf'}`,
    background: checked ? '#fff5f1' : '#faf9f6',
    color: '#34373e',
    fontSize: 13,
    lineHeight: 1.6,
    cursor: 'pointer',
  }
}
const PACE_OPTIONS: readonly { value: VoiceCue['pace']; label: string }[] = [
  { value: 'slow', label: '慢速' },
  { value: 'medium', label: '常速' },
  { value: 'fast', label: '快速' },
]

function paceButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 72,
    padding: '8px 12px',
    borderRadius: 7,
    border: `1px solid ${active ? '#111827' : '#d1d5db'}`,
    background: active ? '#111827' : '#fff',
    color: active ? '#fff' : '#374151',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  }
}
function primaryButtonStyle(saving: boolean): CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #111827',
    background: saving ? '#6b7280' : '#111827', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
  }
}

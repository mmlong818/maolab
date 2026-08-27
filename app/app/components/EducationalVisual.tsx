'use client'

import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { VisualSpec } from '@maolab/shared-types'
import MathOrText from './MathOrText.js'

type WorkedExampleStep = { stepNum: number; action: string; explanation?: string }

const roleColors = {
  known: '#2563eb',
  goal: '#059669',
  action: '#d97706',
  check: '#7c3aed',
  object: '#2563eb',
  condition: '#7c3aed',
  observation: '#d97706',
  conclusion: '#059669',
}

const wrap: CSSProperties = {
  overflowWrap: 'break-word',
  wordBreak: 'normal',
  lineBreak: 'strict',
  textWrap: 'pretty',
}

export function buildWorkedExampleVisualSpec(input: {
  problem: string
  steps?: WorkedExampleStep[]
  conclusion?: string
  focusStepNum?: number | undefined
}): Extract<VisualSpec, { kind: 'worked-example-board' }> {
  const known = extractKnown(input.problem)
  const focusStepNum = input.focusStepNum ?? input.steps?.[0]?.stepNum
  return {
    kind: 'worked-example-board',
    problem: input.problem.trim(),
    known,
    goal: extractGoal(input.problem),
    steps: [...(input.steps ?? [])].sort((a, b) => a.stepNum - b.stepNum),
    check: input.conclusion?.trim() || '把答案带回题目，检查问题和单位是否对应。',
    ...(focusStepNum !== undefined ? { focusStepNum } : {}),
  }
}

export function buildExperimentVisualSpec(text: string): Extract<VisualSpec, { kind: 'experiment-board' }> {
  const focus = focusExperimentPart(text)
  return {
    kind: 'experiment-board',
    objects: pickList(text, [
      /(?:观察对象|实验对象|对象)[:：]([^；。\n]+)/,
      /(两块方糖|两杯水|方糖|热水和冷水)/,
    ], ['两杯水中的方糖']),
    conditions: pickList(text, [
      /(?:操作条件|控制变量|条件)[:：]([^；。\n]+)/,
      /(一杯热水[^；。\n]*一杯冷水|热水|冷水|搅拌次数保持相同)/,
    ], ['一杯热水，一杯冷水，其他操作尽量保持相同']),
    observations: pickList(text, [
      /(?:可见现象|现象|观察到)[:：]([^；。\n]+)/,
      /(热水[^；。\n]*更快[^；。\n]*|方糖[^；。\n]*(?:变小|消失)[^；。\n]*)/,
    ], ['热水杯里的方糖更快变小或消失']),
    conclusion: pickOne(text, [
      /(?:证据结论|结论|说明)[:：]([^；。\n]+)/,
      /(水温会影响溶解快慢|热水中溶解更快)/,
    ], '从现象推出结论，而不是先猜答案。'),
    ...(focus !== undefined ? { focus } : {}),
  }
}

export function inferVisualSpecFromText(text: string): VisualSpec | undefined {
  if (/(实验|观察对象|可见现象|操作条件|控制变量|方糖|热水|冷水|溶解)/.test(text)) {
    return buildExperimentVisualSpec(text)
  }
  if (/(例题|示范|解题|已知|求|一共|花了|还剩|检查|验算)/.test(text)) {
    return buildWorkedExampleVisualSpec({
      problem: pickOne(text, [
        /(?:题目|题面|问题)[:：]([^；。\n]+)/,
        /^([^；。\n]{8,80})/,
      ], text.slice(0, 80)),
      steps: extractSteps(text),
      conclusion: pickOne(text, [/(?:答案|结论|检查)[:：]([^；。\n]+)/], ''),
    })
  }
  return undefined
}

// 播放层用它判断该 spec 是否有专用渲染器: 没有就换 ConceptVisual 等兜底,
// 不允许把「暂未接入渲染器」这类内部占位文案亮给学生。
export function canRenderEducationalVisual(spec: VisualSpec | undefined): spec is VisualSpec {
  return spec?.kind === 'worked-example-board'
    || spec?.kind === 'experiment-board'
    || spec?.kind === 'concept-map'
    || spec?.kind === 'data-chart'
    || spec?.kind === 'math-model'
}

export default function EducationalVisual({ spec, compact = false }: { spec: VisualSpec; compact?: boolean | undefined }) {
  if (spec.kind === 'worked-example-board') return <WorkedExampleBoard spec={spec} compact={compact} />
  if (spec.kind === 'experiment-board') return <ExperimentBoard spec={spec} compact={compact} />
  if (spec.kind === 'concept-map') return <ConceptMapBoard spec={spec} compact={compact} />
  if (spec.kind === 'data-chart') return <DataChartBoard spec={spec} compact={compact} />
  if (spec.kind === 'math-model') return <MathModelBoard spec={spec} compact={compact} />
  return (
    <Frame compact={compact} label="教学图示">
      <div style={{ color: '#64748b', fontSize: compact ? 16 : 20, fontWeight: 800 }}>
        当前图示规格暂未接入专用渲染器。
      </div>
    </Frame>
  )
}

function Frame({ label, compact, children }: { label: string; compact?: boolean | undefined; children: ReactNode }) {
  return (
    <div data-visual-role="structured-visual" aria-label={label} style={{
      ...wrap,
      width: '100%',
      height: '100%',
      minHeight: compact ? 240 : 420,
      display: 'grid',
      alignContent: 'center',
      gap: compact ? 14 : 22,
      padding: compact ? 18 : 32,
      boxSizing: 'border-box',
      borderRadius: 18,
      background: '#f8fafc',
      border: '1px solid #dbe4ee',
    }}>
      {children}
    </div>
  )
}

function WorkedExampleBoard({ spec, compact }: { spec: Extract<VisualSpec, { kind: 'worked-example-board' }>; compact?: boolean | undefined }) {
  const [selectedStepNum, setSelectedStepNum] = useState<number | undefined>(undefined)
  const activeStep = selectedStepNum ?? spec.focusStepNum ?? spec.steps[0]?.stepNum
  return (
    <Frame compact={compact} label="应用题图示">
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '0.95fr 1.05fr', gap: compact ? 14 : 20, alignItems: 'stretch' }}>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <RolePanel color={roleColors.known} title="题目常驻" body={spec.problem} compact={compact} strong />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 8 : 10 }}>
            <RolePanel color={roleColors.known} title="已知条件" body={spec.known.join('；') || '先圈出题目给了什么。'} compact={compact} />
            <RolePanel color={roleColors.goal} title="求什么" body={spec.goal} compact={compact} />
          </div>
          <RolePanel color={roleColors.check} title="回查答案" body={spec.check || '检查答案是否回答了题目。'} compact={compact} />
        </div>
        <div style={{ display: 'grid', gap: compact ? 8 : 10, alignContent: 'center' }}>
          {spec.steps.length > 0 ? spec.steps.map(step => (
            <StepRow key={step.stepNum} step={step} active={step.stepNum === activeStep} compact={compact} onSelect={() => setSelectedStepNum(step.stepNum)} />
          )) : (
            <RolePanel color={roleColors.action} title="解题动作" body="每一步都要说明使用了哪一个条件。" compact={compact} strong />
          )}
        </div>
      </div>
    </Frame>
  )
}

function ExperimentBoard({ spec, compact }: { spec: Extract<VisualSpec, { kind: 'experiment-board' }>; compact?: boolean | undefined }) {
  const [selectedFocus, setSelectedFocus] = useState<typeof spec.focus | undefined>(undefined)
  const activeFocus = selectedFocus ?? spec.focus
  return (
    <Frame compact={compact} label="实验观察图示">
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.05fr 0.95fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', minHeight: compact ? 170 : 270, borderRadius: 18, background: '#ffffff', border: '1px solid #dbeafe', overflow: 'hidden', padding: compact ? 16 : 24 }}>
          <ExperimentScene compact={compact} objects={spec.objects} />
          <div style={{ position: 'absolute', left: compact ? 16 : 24, top: compact ? 14 : 20, color: '#2563eb', fontSize: compact ? 13 : 18, fontWeight: 950, letterSpacing: 2 }}>实验对象一直在场</div>
          <div style={{ position: 'absolute', left: compact ? 16 : 24, right: compact ? 16 : 24, bottom: compact ? 14 : 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MiniTag color={roleColors.object} text={spec.objects.join('；')} />
            <MiniTag color={roleColors.condition} text={spec.conditions.join('；')} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 12 }}>
          <RolePanel color={roleColors.object} title="观察对象" body={spec.objects.join('；')} active={activeFocus === 'objects'} compact={compact} onSelect={() => setSelectedFocus('objects')} />
          <RolePanel color={roleColors.condition} title="操作条件" body={spec.conditions.join('；')} active={activeFocus === 'conditions'} compact={compact} onSelect={() => setSelectedFocus('conditions')} />
          <RolePanel color={roleColors.observation} title="可见现象" body={spec.observations.join('；')} active={activeFocus === 'observations'} compact={compact} onSelect={() => setSelectedFocus('observations')} />
          <RolePanel color={roleColors.conclusion} title="证据结论" body={spec.conclusion || '从现象推出结论。'} active={activeFocus === 'conclusion'} compact={compact} onSelect={() => setSelectedFocus('conclusion')} />
        </div>
      </div>
    </Frame>
  )
}

/** 概念关系图: 生成期 LLM 显式产出的 concept-map(节点+连接)。
 *  有 center 节点时用"外围要素 → 汇聚 → 中心"竖排布局(如燃烧三要素);
 *  无 center 时用节点药丸 + 关系清单, 布局纯 CSS 不会重叠或溢出。 */
function ConceptMapBoard({ spec, compact }: { spec: Extract<VisualSpec, { kind: 'concept-map' }>; compact?: boolean | undefined }) {
  const labelOf = (id: string) => spec.nodes.find(n => n.id === id)?.label ?? id
  const center = spec.nodes.find(n => n.role === 'center')
  const peripheral = spec.nodes.filter(n => n !== center)
  const centerLinkLabels = center
    ? [...new Set(spec.links.filter(l => l.to === center.id || l.from === center.id).map(l => l.label).filter(Boolean))] as string[]
    : []
  const otherLinks = spec.links.filter(l => !center || (l.to !== center.id && l.from !== center.id))
  const nodePill = (label: string, emphasized: boolean, key: string) => (
    <div key={key} style={{ ...wrap, background: emphasized ? '#2563eb' : '#fff', color: emphasized ? '#fff' : '#1e40af', border: `2px solid ${emphasized ? '#2563eb' : '#bfdbfe'}`, borderRadius: 999, padding: compact ? '9px 16px' : '13px 24px', fontSize: compact ? 15 : 20, fontWeight: 950, boxShadow: emphasized ? '0 12px 30px rgba(37,99,235,0.25)' : '0 6px 16px rgba(15,23,42,0.06)', maxWidth: compact ? 220 : 320, textAlign: 'center' }}>
      <MathOrText>{label}</MathOrText>
    </div>
  )
  return (
    <Frame compact={compact} label="概念关系图示">
      <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>{spec.subject}</div>
      {center ? (
        <div style={{ display: 'grid', gap: compact ? 10 : 16, justifyItems: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 10 : 16, justifyContent: 'center' }}>
            {peripheral.map(n => nodePill(n.label, false, n.id))}
          </div>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
            <div style={{ color: '#d97706', fontSize: compact ? 20 : 28, fontWeight: 950, lineHeight: 1 }}>↓</div>
            {centerLinkLabels.length > 0 && (
              <div style={{ color: '#d97706', fontSize: compact ? 13 : 18, fontWeight: 900 }}>{centerLinkLabels.join('；')}</div>
            )}
          </div>
          {nodePill(center.label, true, center.id)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 10 : 14, justifyContent: 'center' }}>
          {spec.nodes.map(n => nodePill(n.label, false, n.id))}
        </div>
      )}
      {otherLinks.length > 0 && (
        <div style={{ display: 'grid', gap: compact ? 6 : 8 }}>
          {otherLinks.slice(0, 6).map((l, i) => (
            <div key={`${l.from}-${l.to}-${i}`} style={{ ...wrap, display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'center', color: '#334155', fontSize: compact ? 13 : 18, fontWeight: 800 }}>
              <span>{labelOf(l.from)}</span>
              <span style={{ color: '#d97706', fontWeight: 950 }}>—{l.label ?? ''}→</span>
              <span>{labelOf(l.to)}</span>
            </div>
          ))}
        </div>
      )}
      {spec.focus && (
        <div style={{ ...wrap, textAlign: 'center', color: '#059669', fontSize: compact ? 13 : 18, fontWeight: 900 }}>
          <MathOrText>{spec.focus}</MathOrText>
        </div>
      )}
    </Frame>
  )
}

/** 数据图表: table 用表格, bar 用横条, line 简化为带趋势的数值行。全部纯 CSS。 */
function DataChartBoard({ spec, compact }: { spec: Extract<VisualSpec, { kind: 'data-chart' }>; compact?: boolean | undefined }) {
  const rows = spec.data
  const keys = rows.length > 0 ? Object.keys(rows[0]!) : []
  const labelKey = keys.find(k => rows.some(r => typeof r[k] === 'string')) ?? keys[0]
  const valueKey = keys.find(k => k !== labelKey && rows.some(r => typeof r[k] === 'number'))
  const numeric = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
  const maxVal = valueKey ? Math.max(...rows.map(r => Math.abs(numeric(r[valueKey]))), 1) : 1
  return (
    <Frame compact={compact} label="数据图表图示">
      {spec.chart !== 'table' && labelKey && valueKey ? (
        <div style={{ display: 'grid', gap: compact ? 8 : 12 }}>
          {rows.slice(0, 8).map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: compact ? '90px 1fr 64px' : '140px 1fr 90px', gap: 10, alignItems: 'center' }}>
              <div style={{ ...wrap, color: '#334155', fontSize: compact ? 13 : 18, fontWeight: 900, textAlign: 'right' }}>{String(r[labelKey])}</div>
              <div style={{ height: compact ? 18 : 26, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(6, Math.round((Math.abs(numeric(r[valueKey])) / maxVal) * 100))}%`, height: '100%', borderRadius: 999, background: '#2563eb' }} />
              </div>
              <div style={{ color: '#2563eb', fontSize: compact ? 13 : 18, fontWeight: 950 }}>{String(r[valueKey])}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{keys.map(k => <th key={k} style={{ textAlign: 'left', padding: compact ? '6px 10px' : '10px 14px', color: '#2563eb', fontSize: compact ? 13 : 18, fontWeight: 950, borderBottom: '2px solid #bfdbfe' }}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r, i) => (
                <tr key={i}>{keys.map(k => <td key={k} style={{ padding: compact ? '6px 10px' : '10px 14px', color: '#334155', fontSize: compact ? 13 : 18, fontWeight: 800, borderBottom: '1px solid #e2e8f0' }}>{String(r[k] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {spec.conclusion && <RolePanel color={roleColors.conclusion} title="数据结论" body={spec.conclusion} compact={compact} strong />}
    </Frame>
  )
}

/** 数学模型: number-line 画刻度线, 其余模型先用键值面板承载(结构正确优先于花哨)。 */
function MathModelBoard({ spec, compact }: { spec: Extract<VisualSpec, { kind: 'math-model' }>; compact?: boolean | undefined }) {
  const entries = Object.entries(spec.values).slice(0, 8)
  const modelName: Record<typeof spec.model, string> = {
    'number-line': '数轴模型',
    coordinate: '坐标模型',
    'ratio-bar': '比例条模型',
    geometry: '几何模型',
  }
  return (
    <Frame compact={compact} label="数学模型图示">
      <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>{modelName[spec.model]}</div>
      <div style={{ display: 'grid', gap: compact ? 8 : 10 }}>
        {entries.map(([k, v]) => (
          <RolePanel key={k} color={roleColors.known} title={k} body={typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)} compact={compact} />
        ))}
      </div>
      {spec.focus && <RolePanel color={roleColors.goal} title="关注点" body={spec.focus} compact={compact} strong />}
    </Frame>
  )
}

function RolePanel({ color, title, body, compact, strong, active, onSelect }: { color: string; title: string; body: string; compact?: boolean | undefined; strong?: boolean | undefined; active?: boolean | undefined; onSelect?: (() => void) | undefined }) {
  const interactive = Boolean(onSelect)
  const Element = interactive ? 'button' : 'div'
  return (
    <Element
      type={interactive ? 'button' : undefined}
      data-interactive-role={interactive ? 'visual-focus' : undefined}
      onClick={onSelect}
      style={{
      background: active || strong ? `${color}12` : '#fff',
      // 边框宽度恒为 2px（仅改透明度），避免点击聚焦时盒子尺寸变化导致相邻内容跳动
      border: `2px solid ${color}${active || strong ? '66' : '32'}`,
      boxSizing: 'border-box',
      borderRadius: 16,
      padding: compact ? '11px 12px' : '15px 18px',
      boxShadow: active ? `0 10px 24px ${color}22` : 'none',
      cursor: interactive ? 'pointer' : 'default',
      textAlign: 'left',
      appearance: 'none',
      font: 'inherit',
    }}>
      <div style={{ color, fontSize: compact ? 14 : 18, fontWeight: 950 }}>{title}</div>
      <div style={{ ...wrap, marginTop: 5, color: '#334155', fontSize: compact ? 12 : 18, lineHeight: 1.45, fontWeight: 780 }}>
        <MathOrText>{body}</MathOrText>
      </div>
    </Element>
  )
}

function StepRow({ step, active, compact, onSelect }: { step: WorkedExampleStep; active: boolean; compact?: boolean | undefined; onSelect?: (() => void) | undefined }) {
  const color = active ? roleColors.action : '#64748b'
  return (
    <button type="button" data-interactive-role="visual-step" onClick={onSelect} style={{ display: 'grid', gridTemplateColumns: compact ? '34px 1fr' : '44px 1fr', gap: compact ? 10 : 14, alignItems: 'start', background: active ? '#fff7ed' : '#ffffff', border: `2px solid ${active ? 'rgba(217,119,6,0.45)' : 'rgba(148,163,184,0.24)'}`, borderRadius: 16, padding: compact ? '10px 12px' : '14px 16px', cursor: 'pointer', textAlign: 'left', appearance: 'none', font: 'inherit' }}>
      <div style={{ width: compact ? 32 : 40, height: compact ? 32 : 40, borderRadius: 999, background: `${color}18`, color, border: `1px solid ${color}55`, display: 'grid', placeItems: 'center', fontSize: compact ? 14 : 18, fontWeight: 950 }}>{step.stepNum}</div>
      <div>
        {/* 始终占位，仅切换可见性，避免点击切换"当前动作"时行高跳动 */}
        <div style={{ color: roleColors.action, fontSize: compact ? 12 : 14, fontWeight: 950, letterSpacing: 2, marginBottom: 4, visibility: active ? 'visible' : 'hidden' }}>当前动作</div>
        <div style={{ ...wrap, color: '#0f172a', fontSize: compact ? 14 : 18, lineHeight: 1.38, fontWeight: 900 }}><MathOrText>{step.action}</MathOrText></div>
        {step.explanation && <div style={{ ...wrap, marginTop: 4, color: '#64748b', fontSize: compact ? 12 : 14, lineHeight: 1.45, fontWeight: 720 }}><MathOrText>{step.explanation}</MathOrText></div>}
      </div>
    </button>
  )
}

function ExperimentScene({ compact, objects }: { compact?: boolean | undefined; objects?: string[] | undefined }) {
  // 容器标签取自真实实验对象(截短), 不再写死"热水/冷水"——化学燃烧课的实验板
  // 曾因此画出方糖溶解实验的两杯水(2026-07-06 真检)。
  const labelA = (objects?.[0] ?? '对照组 A').slice(0, 6)
  const labelB = (objects?.[1] ?? objects?.[0] ?? '对照组 B').slice(0, 6)
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 65%)' }}>
      <Cup left={compact ? 54 : 86} bottom={compact ? 60 : 82} label={labelA} color="#fb923c" compact={compact} />
      <Cup left={compact ? 176 : 286} bottom={compact ? 60 : 82} label={labelB} color="#38bdf8" compact={compact} />
      <div style={{ position: 'absolute', left: compact ? 42 : 70, right: compact ? 36 : 64, bottom: compact ? 52 : 72, height: 4, borderRadius: 999, background: '#cbd5e1' }} />
      <div style={{ position: 'absolute', right: compact ? 28 : 42, top: compact ? 54 : 78, color: '#94a3b8', fontSize: compact ? 18 : 28, fontWeight: 950 }}>观察 → 记录 → 推出结论</div>
    </div>
  )
}

function Cup({ left, bottom, label, color, compact }: { left: number; bottom: number; label: string; color: string; compact?: boolean | undefined }) {
  const w = compact ? 54 : 78
  const h = compact ? 70 : 102
  return (
    <div style={{ position: 'absolute', left, bottom, width: w, height: h }}>
      <div style={{ position: 'absolute', inset: 0, border: '3px solid #64748b', borderTop: 'none', borderRadius: '0 0 16px 16px', background: 'rgba(255,255,255,0.65)' }} />
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: compact ? 36 : 52, borderRadius: '0 0 11px 11px', background: `${color}55` }} />
      <div style={{ position: 'absolute', left: '50%', bottom: compact ? 24 : 36, width: compact ? 16 : 22, height: compact ? 16 : 22, transform: 'translateX(-50%) rotate(12deg)', borderRadius: 4, background: '#fef3c7', border: '2px solid #f59e0b' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: -24, color, textAlign: 'center', fontSize: compact ? 12 : 18, fontWeight: 950 }}>{label}</div>
    </div>
  )
}

function MiniTag({ color, text }: { color: string; text: string }) {
  return <div style={{ color, background: `${color}12`, border: `1px solid ${color}44`, borderRadius: 999, padding: '7px 10px', fontSize: 14, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</div>
}

function extractKnown(problem: string): string[] {
  const parts = problem
    .split(/[，,；;。]/)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/(一共|多少|几|还剩|求|问)/.test(part))
  return parts.length > 0 ? parts.slice(0, 3) : ['题目给出的数量和条件']
}

function extractGoal(problem: string): string {
  return pickOne(problem, [
    /(一共[^？?。；]*)/,
    /(还剩[^？?。；]*)/,
    /(求[^？?。；]*)/,
    /问[:：]?([^？?。；]*)/,
  ], '最后要回答什么')
}

function extractSteps(text: string): WorkedExampleStep[] {
  const matches = Array.from(text.matchAll(/(?:第?\s*(\d+)\s*步|步骤\s*(\d+))[:：]([^；。\n]+)/g))
  return matches.slice(0, 4).map((match, index) => ({
    stepNum: Number(match[1] ?? match[2] ?? index + 1),
    action: match[3]?.trim() || '说明当前解题动作',
  }))
}

function focusExperimentPart(text: string): Extract<VisualSpec, { kind: 'experiment-board' }>['focus'] {
  if (/(结论|说明|推出|证据)/.test(text)) return 'conclusion'
  if (/(现象|观察到|变小|消失)/.test(text)) return 'observations'
  if (/(条件|变量|热水|冷水|搅拌)/.test(text)) return 'conditions'
  return 'objects'
}

function pickList(text: string, patterns: RegExp[], fallback: string[]): string[] {
  const value = pickOne(text, patterns, '')
  if (!value) return fallback
  return value.split(/[、，,和与]/).map(part => part.trim()).filter(Boolean).slice(0, 4)
}

function pickOne(text: string, patterns: RegExp[], fallback: string): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1]?.trim() || match?.[0]?.trim()
    if (value) return value
  }
  return fallback
}

'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { spriteSideOf } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import type {
  BiologyVisual,
  ChemistryMoleculeVisual,
  ChemistryVisual,
  ChineseVisual,
  CircuitComponent,
  CircuitVisual,
  EnglishVisual,
} from '@/lib/mainline/presentation/subject-content'
import { fitType, projectionFontSize, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { MathText, SceneBadge, spritePad } from './shared'

interface ViewProps<T> {
  scene: LessonScene
  course: MainlineCourse
  pres: ScenePresentation
  sceneNumber: number
  model: T
}

function ContentFrame({ scene, pres, sceneNumber, label, children }: Omit<ViewProps<unknown>, 'course' | 'model'> & { label: string; children: React.ReactNode }) {
  const theme = pres.palette
  return (
    <section className={`flex h-full flex-col gap-5 px-[8%] pb-[10%] pt-[4%] ${spritePad(spriteSideOf(scene))}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={label} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

const ELEMENT_COLOR: Record<string, string> = {
  H: '#d8d3cb', C: '#5b6573', N: '#3b6cb7', O: '#c85145', F: '#4a9d68', Cl: '#4a9d68', S: '#c59b2a', P: '#d9823b',
}

function moleculePositions(model: ChemistryMoleculeVisual): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const center = model.atoms.find(atom => model.bonds.filter(bond => bond.from === atom.id || bond.to === atom.id).length > 1) ?? model.atoms[0]!
  positions.set(center.id, { x: 300, y: 190 })
  const others = model.atoms.filter(atom => atom.id !== center.id)
  others.forEach((atom, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(others.length, 1)
    positions.set(atom.id, { x: 300 + Math.cos(angle) * 145, y: 190 + Math.sin(angle) * 125 })
  })
  return positions
}

export function ChemistryContentView(props: ViewProps<ChemistryVisual>) {
  const { scene, pres, sceneNumber, model } = props
  const theme = pres.palette
  if (model.kind === 'chemistry-equation') {
    return (
      <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="化学方程式">
        <div className="grid h-full grid-cols-[1.4fr_1fr] gap-7">
          <div className="flex flex-col justify-center gap-5 rounded-[8px] border px-8" style={{ borderColor: toRgba(theme.ink, 0.18), background: theme.paper }}>
            <div style={{ ...fitType('heading', model.equation.length), color: theme.ink }}><MathText>{`\\(${model.equation}\\)`}</MathText></div>
            <div className="flex flex-wrap gap-2">
              {model.condition ? <span className="rounded px-3 py-1" style={{ ...TYPE_SCALE.caption, background: theme.accentSoft, color: theme.accent }}>条件 · {model.condition}</span> : null}
              {model.energy ? <span className="rounded px-3 py-1" style={{ ...TYPE_SCALE.caption, background: model.energy === '放热' ? '#fff0e7' : '#e9f4fb', color: model.energy === '放热' ? '#b85b2d' : '#2f78a3' }}>{model.energy}</span> : null}
              {model.states.map(item => <span key={`${item.substance}-${item.state}`} className="rounded border px-3 py-1" style={{ ...TYPE_SCALE.caption, borderColor: toRgba(theme.ink, 0.16) }}>{item.substance} · {item.state}</span>)}
            </div>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.68) }}>标注计数（未自动核验）</div>
            {model.atomCounts.map(item => (
              <div key={item.element} className="grid grid-cols-[48px_1fr_1fr] items-center gap-3 rounded-[6px] border px-4 py-3" style={{ borderColor: toRgba(theme.ink, 0.14) }}>
                <strong style={{ color: theme.accent }}>{item.element}</strong>
                <span>反应物 · {item.reactants}</span>
                <span>生成物 · {item.products}</span>
              </div>
            ))}
          </div>
        </div>
      </ContentFrame>
    )
  }

  const positions = moleculePositions(model)
  return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="分子结构">
      <div className="grid h-full grid-cols-[1.45fr_0.75fr] items-center gap-5">
        <svg viewBox="0 0 600 380" className="h-full w-full">
          {model.bonds.flatMap((bond, index) => {
            const a = positions.get(bond.from)!, b = positions.get(bond.to)!
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
            const ox = (-dy / length) * 5, oy = (dx / length) * 5
            return Array.from({ length: bond.order }, (_, lineIndex) => {
              const offset = lineIndex - (bond.order - 1) / 2
              return <line key={`${index}-${lineIndex}`} x1={a.x + ox * offset} y1={a.y + oy * offset} x2={b.x + ox * offset} y2={b.y + oy * offset} stroke={theme.ink} strokeWidth="3" />
            })
          })}
          {model.atoms.map(atom => {
            const point = positions.get(atom.id)!
            return <g key={atom.id}><circle cx={point.x} cy={point.y} r="32" fill={ELEMENT_COLOR[atom.element] ?? theme.accent} stroke={theme.paper} strokeWidth="4" /><text x={point.x} y={point.y + 7} textAnchor="middle" fill="#fff" style={{ fontSize: projectionFontSize('diagram'), fontWeight: 750 }}>{atom.element}</text><text x={point.x} y={point.y + 56} textAnchor="middle" fill={theme.ink} style={{ fontSize: projectionFontSize('diagram') }}>{atom.id}</text></g>
          })}
        </svg>
        <div className="flex flex-col gap-3">
          <div style={fitType('heading', model.label.length)}><MathText>{model.label}</MathText></div>
          {model.bondAngles.map(item => <div key={item} className="border-l-4 py-2 pl-3" style={{ borderColor: theme.accent }}>{item}</div>)}
          {model.functionalGroups.map(item => <div key={item} className="rounded-[6px] px-3 py-2" style={{ background: theme.accentSoft }}>{item}</div>)}
        </div>
      </div>
    </ContentFrame>
  )
}

const CIRCUIT_POSITIONS = [{ x: 105, y: 85 }, { x: 300, y: 85 }, { x: 495, y: 85 }, { x: 495, y: 260 }, { x: 300, y: 260 }, { x: 105, y: 260 }, { x: 200, y: 172 }, { x: 400, y: 172 }]
function CircuitSymbol({ component, x, y, theme }: { component: CircuitComponent; x: number; y: number; theme: ScenePresentation['palette'] }) {
  const stroke = theme.ink
  let symbol: React.ReactNode
  if (component.type === 'resistor') symbol = <rect x={x - 32} y={y - 13} width="64" height="26" fill={theme.paper} stroke={stroke} strokeWidth="3" />
  else if (component.type === 'battery') symbol = <g><line x1={x - 10} y1={y - 25} x2={x - 10} y2={y + 25} stroke={stroke} strokeWidth="3" /><line x1={x + 10} y1={y - 16} x2={x + 10} y2={y + 16} stroke={stroke} strokeWidth="3" /></g>
  else if (component.type === 'bulb') symbol = <g><circle cx={x} cy={y} r="25" fill={theme.paper} stroke={stroke} strokeWidth="3" /><line x1={x - 17} y1={y - 17} x2={x + 17} y2={y + 17} stroke={stroke} strokeWidth="2" /><line x1={x + 17} y1={y - 17} x2={x - 17} y2={y + 17} stroke={stroke} strokeWidth="2" /></g>
  else if (component.type === 'switch') symbol = <g><circle cx={x - 25} cy={y} r="4" fill={stroke} /><circle cx={x + 25} cy={y} r="4" fill={stroke} /><line x1={x - 21} y1={y - 2} x2={x + 15} y2={y - 22} stroke={stroke} strokeWidth="3" /></g>
  else symbol = <g><circle cx={x} cy={y} r="28" fill={theme.paper} stroke={stroke} strokeWidth="3" /><text x={x} y={y + 8} textAnchor="middle" fill={stroke} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 700 }}>{component.type === 'ammeter' ? 'A' : 'V'}</text></g>
  return <g>{symbol}<text x={x} y={y + 54} textAnchor="middle" fill={stroke} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 650 }}>{component.id}{component.value ? ` · ${component.value}${component.unit ?? ''}` : ''}</text></g>
}

export function CircuitDiagramView({ scene, pres, sceneNumber, model }: ViewProps<CircuitVisual>) {
  const theme = pres.palette
  const positions = new Map(model.components.map((component, index) => [component.id, CIRCUIT_POSITIONS[index] ?? { x: 100 + (index % 4) * 135, y: 85 + Math.floor(index / 4) * 175 }]))
  return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="电路图">
      <svg viewBox="0 0 600 350" className="h-full w-full" aria-label="国标电路图">
        {model.connections.map(([from, to], index) => { const a = positions.get(from)!, b = positions.get(to)!, mid = (a.x + b.x) / 2; return <path key={index} d={`M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`} fill="none" stroke={toRgba(theme.accent, 0.72)} strokeWidth="4" strokeLinejoin="round" /> })}
        {model.components.map(component => <CircuitSymbol key={component.id} component={component} {...positions.get(component.id)!} theme={theme} />)}
      </svg>
    </ContentFrame>
  )
}

const TONE_SHAPE: Record<number, string> = { 1: 'M5 16 L95 16', 2: 'M5 34 Q50 34 95 7', 3: 'M5 15 Q45 48 95 12', 4: 'M5 7 L95 38' }
export function ChineseContentView({ scene, pres, sceneNumber, model }: ViewProps<ChineseVisual>) {
  const theme = pres.palette
  if (model.kind === 'chinese-classical') return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="文言对读">
      <div className="grid h-full grid-cols-[1fr_1fr_0.75fr] gap-5">
        <div className="space-y-4 border-r pr-5" style={{ borderColor: toRgba(theme.ink, 0.18) }}>{model.text.map((line, i) => <div key={i} style={fitType('heading', line.length)}>{line}</div>)}</div>
        <div className="space-y-4">{model.translation.map((line, i) => <div key={i} style={fitType('body', line.length)}>{line}</div>)}</div>
        <div className="space-y-2">{model.glosses.map(item => <div key={`${item.word}-${item.meaning}`} className="rounded-[6px] border px-3 py-2" style={{ borderColor: toRgba(theme.ink, 0.14) }}><strong style={{ color: theme.accent }}>{item.word}</strong><span className="ml-2">{item.meaning}</span>{item.grammar ? <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.58) }}>{item.grammar}</div> : null}</div>)}</div>
      </div>
    </ContentFrame>
  )
  if (model.kind === 'chinese-pinyin') return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="拼音声调">
      <div className="grid h-full items-center gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(model.syllables.length, 4)}, minmax(0, 1fr))` }}>
        {model.syllables.slice(0, 8).map((item, index) => <div key={`${item.initial}-${item.final}-${index}`} className="flex h-[78%] flex-col items-center justify-center rounded-[8px] border px-4" style={{ borderColor: toRgba(theme.ink, 0.16), background: item.tone.toString() === model.focus ? theme.accentSoft : theme.paper }}><div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{item.initial || '∅'} + {item.final}</div><strong className="my-4" style={{ fontSize: '52px' }}>{item.example}</strong><svg viewBox="0 0 100 48" className="w-full"><path d={TONE_SHAPE[item.tone]} fill="none" stroke={theme.accent} strokeWidth="4" strokeLinecap="round" /></svg><span>{item.tone} 声</span></div>)}
      </div>
    </ContentFrame>
  )
  return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="病句诊断">
      <div className="grid h-full grid-rows-[auto_1fr_auto] gap-4">
        <div className="rounded-[8px] border-l-4 px-5 py-4" style={{ borderColor: '#c25d4b', background: '#fff7f5' }}>{model.faulty}</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(model.diagnoses.length, 3)}, minmax(0, 1fr))` }}>{model.diagnoses.map(item => <div key={`${item.type}-${item.fragment}`} className="rounded-[8px] border p-4" style={{ borderColor: toRgba(theme.ink, 0.14) }}><div style={{ ...TYPE_SCALE.caption, color: '#b34f42' }}>{item.type}</div><strong className="my-2 block">{item.fragment}</strong><span>{item.reason}</span></div>)}</div>
        <div className="rounded-[8px] border-l-4 px-5 py-4" style={{ borderColor: '#3f7d63', background: '#f4faf6' }}>{model.corrected.replace(/[【】]/g, '')}{model.punctuation ? <span className="ml-4" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{model.punctuation}</span> : null}</div>
      </div>
    </ContentFrame>
  )
}

const ROLE_COLOR: Record<string, string> = { subject: '#3b6cb7', predicate: '#c25d4b', object: '#3f7d63', attributive: '#8a63a8', 'attributive-clause': '#8a63a8', adverbial: '#b5872f', complement: '#2e7fa8' }
export function EnglishContentView({ scene, pres, sceneNumber, model }: ViewProps<EnglishVisual>) {
  const theme = pres.palette
  if (model.kind === 'english-vocab') return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="Vocabulary">
      <div className="grid h-full gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(model.cards.length, 3)}, minmax(0, 1fr))` }}>
        {model.cards.slice(0, 6).map(card => <article key={card.word} className="flex flex-col justify-center rounded-[8px] border p-5" style={{ borderColor: toRgba(theme.ink, 0.14) }}><div className="flex items-baseline justify-between gap-3"><strong style={{ fontSize: '30px' }}>{card.word}</strong><span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{card.pos}</span></div><div style={{ color: toRgba(theme.ink, 0.58) }}>/{card.ipa}/</div><div className="my-3 font-semibold">{card.meaning}</div><div>{card.example}</div><div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>{card.hint}</div></article>)}
      </div>
    </ContentFrame>
  )
  return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="Sentence X-Ray">
      <div className="flex h-full flex-col justify-center gap-6">
        <div className="flex flex-wrap items-end gap-2">{model.parts.map((part, index) => <div key={`${part.segment}-${index}`} className="flex flex-col" style={{ marginTop: `${part.depth * 18}px` }}><span className="border-b-4 px-3 py-3" style={{ borderColor: ROLE_COLOR[part.role] ?? theme.accent, fontSize: projectionFontSize('body', 32 - part.depth * 2) }}>{part.segment}</span><span className="mt-2 text-center" style={{ ...TYPE_SCALE.caption, color: ROLE_COLOR[part.role] ?? theme.accent }}>{part.role} · L{part.depth}</span></div>)}</div>
        <div className="h-px" style={{ background: toRgba(theme.ink, 0.16) }} />
        <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.58) }}>层级 0 是主干，层级越大表示越深的修饰或从属结构。</div>
      </div>
    </ContentFrame>
  )
}

export function BiologyStructureView({ scene, pres, sceneNumber, model }: ViewProps<BiologyVisual>) {
  const theme = pres.palette
  const groups = new Map<string, typeof model.callouts>()
  for (const callout of model.callouts) { const key = callout.system ?? '结构与功能'; groups.set(key, [...(groups.get(key) ?? []), callout]) }
  return (
    <ContentFrame scene={scene} pres={pres} sceneNumber={sceneNumber} label="结构图解">
      <div className={`grid h-full gap-6 ${scene.imageUrl ? 'grid-cols-[1.1fr_1fr]' : 'grid-cols-1'}`}>
        {scene.imageUrl ? <div className="relative overflow-hidden rounded-[8px]" style={{ background: theme.backdrop[0] }}><img src={scene.imageUrl} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" /></div> : null}
        <div className="grid content-center gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(groups.size, 2)}, minmax(0, 1fr))` }}>
          {[...groups.entries()].map(([system, items]) => <section key={system} className="rounded-[8px] border p-4" style={{ borderColor: toRgba(theme.ink, 0.14) }}><div className="mb-3 border-b pb-2" style={{ ...TYPE_SCALE.caption, color: theme.accent, borderColor: toRgba(theme.accent, 0.24) }}>{system}</div><div className="space-y-3">{items.map((item, index) => <div key={item.structure} className="grid grid-cols-[32px_1fr] gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: theme.accent, color: theme.paper, fontSize: projectionFontSize('auxiliary') }}>{index + 1}</span><div><strong>{item.structure}</strong><div style={{ color: toRgba(theme.ink, 0.65) }}>{item.function}</div></div></div>)}</div></section>)}
        </div>
      </div>
    </ContentFrame>
  )
}

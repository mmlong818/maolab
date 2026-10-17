import type { LessonScene } from '../domain.js'
import {
  functionPlotSegments,
  parseDialogueScript,
  parseForceVectors,
  parseFuncBreakpoints,
  parseFuncKeyPoints,
  parseRange,
  parseTimelineEvents,
} from './content-forms.js'
import { opticsSolutionFor } from './optics.js'
import {
  biologyVisualFor,
  chemistryVisualFor,
  chineseVisualFor,
  circuitVisualFor,
  englishVisualFor,
  geometryVisualFor,
} from './subject-content.js'

export type SpecializedContentKind =
  | 'poem'
  | 'timeline'
  | 'dialogue'
  | 'force'
  | 'function-plot'
  | 'geometry'
  | 'chemistry'
  | 'circuit'
  | 'chinese'
  | 'english'
  | 'biology'
  | 'optics'

export interface SpecializedContentEntry {
  key: string
  label: string
  value: string
}

export interface SpecializedContentPresentation {
  /** 图表中逐字可见的文字，已经按渲染器的解析规则展开。 */
  textEntries: SpecializedContentEntry[]
  /** 由结构化数据绘制、不能冒充逐字上屏文字的空间或连接关系。 */
  visualEntries: SpecializedContentEntry[]
}

export const SPECIALIZED_SLOT_KEYS: Readonly<Record<SpecializedContentKind, readonly string[]>> = {
  poem: ['poemTitle', 'poemAuthor', 'poemLines'],
  timeline: ['timelineEvents'],
  dialogue: ['dialogueScript'],
  force: ['forceVectors'],
  'function-plot': ['funcExpr', 'funcDomain', 'funcPlotPoints', 'funcKeyPoints', 'funcBreakpoints'],
  geometry: ['geoVertices', 'geoEdges', 'geoAngleLabels', 'geoAuxLines'],
  chemistry: ['chemEquation', 'chemEquationAtoms', 'chemEquationCondition', 'chemEquationStates', 'chemEquationEnergy', 'molStructure', 'molAtoms', 'molBonds', 'molBondAngle', 'molFunctionalGroup'],
  circuit: ['circuitTopology', 'circuitConnections'],
  chinese: ['classicalText', 'classicalTranslation', 'classicalGloss', 'pinyinSyllables', 'pinyinToneFocus', 'faultySentence', 'sentenceDiagnosis', 'sentenceCorrection', 'punctuationFocus'],
  english: ['vocabCards', 'sentenceParse'],
  biology: ['structureCallouts'],
  optics: ['opticsScene'],
}

export const SPECIALIZED_LABELS: Readonly<Record<SpecializedContentKind, string>> = {
  poem: '诗文原文', timeline: '时间线', dialogue: '对话脚本', force: '受力图',
  'function-plot': '函数图像', geometry: '几何图', chemistry: '化学结构图', circuit: '电路图',
  chinese: '语文学科图解', english: '英语结构图解', biology: '生物结构图', optics: '光路图',
}

const CIRCUIT_TYPE_LABEL: Readonly<Record<string, string>> = {
  battery: '电源', resistor: '电阻', bulb: '灯泡', switch: '开关', ammeter: '电流表', voltmeter: '电压表',
}

const OPTICS_KIND_LABEL: Readonly<Record<string, string>> = {
  'convex-lens': '凸透镜成像', 'concave-lens': '凹透镜成像',
  'convex-parallel': '凸透镜平行光', 'concave-parallel': '凹透镜平行光',
  'plane-mirror': '平面镜反射', refraction: '折射', prism: '三棱镜色散',
}

const OPTICS_ROLE_LABEL: Readonly<Record<string, string>> = {
  incident: '入射光线', refracted: '折射或出射光线', reflected: '反射光线', virtual: '虚光线',
  normal: '法线', object: '物', image: '像', element: '光学元件',
}

function entry(key: string, label: string, value: string): SpecializedContentEntry {
  return { key, label, value }
}

function compactNumber(value: number): string {
  return Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : String(Number(value.toFixed(2)))
}

function lines(raw: string | undefined): string[] {
  return (raw ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

function poemPresentation(scene: LessonScene): SpecializedContentPresentation {
  const textEntries = [
    ...(scene.contentSlots.poemTitle?.trim() ? [entry('poemTitle', '诗文标题', scene.contentSlots.poemTitle.trim())] : []),
    ...(scene.contentSlots.poemAuthor?.trim() ? [entry('poemAuthor', '作者', scene.contentSlots.poemAuthor.trim())] : []),
    ...lines(scene.contentSlots.poemLines).map((line, index) => entry(`poemLines.${index}`, `原文 ${index + 1}`, line)),
  ]
  return { textEntries, visualEntries: [] }
}

function timelinePresentation(scene: LessonScene): SpecializedContentPresentation {
  const events = parseTimelineEvents(scene.contentSlots.timelineEvents ?? '')
  return {
    textEntries: events.map((item, index) => entry(
      `timelineEvents.${index}`,
      `时间节点 ${index + 1}`,
      `${item.time || '·'}　${item.event}`,
    )),
    visualEntries: events.length > 0
      ? [entry('timelineEvents.axis', '时间顺序', `${events.length} 个节点沿时间轴由上到下排列`)]
      : [],
  }
}

function dialoguePresentation(scene: LessonScene): SpecializedContentPresentation {
  const turns = parseDialogueScript(scene.contentSlots.dialogueScript ?? '')
  return {
    textEntries: turns.map((turn, index) => entry(`dialogueScript.${index}`, `对话 ${index + 1}`, `${turn.speaker}：${turn.line}`)),
    visualEntries: turns.length > 0
      ? [entry('dialogueScript.flow', '对话排布', `${turns.length} 轮台词按说话人分左右声道排列`)]
      : [],
  }
}

function forcePresentation(scene: LessonScene): SpecializedContentPresentation {
  const forces = parseForceVectors(scene.contentSlots.forceVectors ?? '').slice(0, 6)
  return {
    textEntries: forces.map((force, index) => entry(
      `forceVectors.${index}.label`,
      `力标注 ${index + 1}`,
      `${force.label}${force.magnitude ? ` ${force.magnitude}${force.unit}` : ''}`,
    )),
    visualEntries: forces.map((force, index) => entry(
      `forceVectors.${index}.vector`,
      `力矢量 ${index + 1}`,
      `${force.type || force.label}从物体中心指向 ${compactNumber(force.angle)}°；以向右为 0°，逆时针为正${force.magnitude ? `，箭头长度按 ${force.magnitude}${force.unit} 比例绘制` : ''}`,
    )),
  }
}

function functionPlotPresentation(scene: LessonScene): SpecializedContentPresentation {
  const segments = functionPlotSegments(
    scene.contentSlots.funcPlotPoints ?? '',
    scene.contentSlots.funcBreakpoints ?? '',
    scene.contentSlots.funcKeyPoints ?? '',
    scene.contentSlots.funcDomain ?? '',
  )
  const points = segments.flat()
  const keyPoints = parseFuncKeyPoints(scene.contentSlots.funcKeyPoints ?? '')
  const breakpoints = parseFuncBreakpoints(scene.contentSlots.funcBreakpoints ?? '', scene.contentSlots.funcKeyPoints ?? '')
  const allPoints = [...points, ...keyPoints]
  const domain = parseRange(scene.contentSlots.funcDomain ?? '')
  const xs = allPoints.map(point => point.x)
  const ys = allPoints.map(point => point.y)
  const xmin = domain?.[0] ?? Math.min(0, ...xs)
  const xmax = domain?.[1] ?? Math.max(0, ...xs)
  const rawYMin = Math.min(0, ...ys)
  const rawYMax = Math.max(0, ...ys)
  const yPadding = Math.max(1, (rawYMax - rawYMin) * 0.12)
  const textEntries = [
    ...(scene.contentSlots.funcExpr?.trim() ? [entry('funcExpr', '函数表达式', scene.contentSlots.funcExpr.trim())] : []),
    ...keyPoints.map((point, index) => entry(
      `funcKeyPoints.${index}`,
      `关键点 ${index + 1}`,
      `${point.label ? `${point.label} ` : ''}(${compactNumber(point.x)},${compactNumber(point.y)})`,
    )),
  ]
  const visualEntries = segments.some(segment => segment.length >= 2)
    ? [entry(
        'funcPlotPoints.curve',
        '坐标与曲线',
        `${segments.length} 个连续分支分别连线，共 ${points.length} 个采样点；横轴 ${compactNumber(xmin)} 至 ${compactNumber(xmax)}，纵轴约 ${compactNumber(rawYMin - yPadding)} 至 ${compactNumber(rawYMax + yPadding)}`,
      ), ...breakpoints.map((point, index) => entry(
        `funcBreakpoints.${index}`,
        `分支边界 ${index + 1}`,
        `x=${compactNumber(point.x)} 不在定义域，曲线在此断开`,
      ))]
    : []
  return { textEntries, visualEntries }
}

function geometryPresentation(scene: LessonScene): SpecializedContentPresentation {
  const model = geometryVisualFor(scene.contentSlots)
  if (!model) return { textEntries: [], visualEntries: [] }
  return {
    textEntries: [
      entry('geoVertices.labels', '顶点标注', model.vertices.map(vertex => vertex.name).join('、')),
      ...model.angles.map((angle, index) => entry(`geoAngleLabels.${index}`, `角度标注 ${index + 1}`, angle.text)),
      ...model.auxLines.map((step, index) => entry(`geoAuxLines.${index}`, `辅助线步骤 ${index + 1}`, step)),
    ],
    visualEntries: [
      ...model.vertices.map((vertex, index) => entry(
        `geoVertices.${index}.position`,
        `顶点位置 ${vertex.name}`,
        `坐标 (${compactNumber(vertex.x)},${compactNumber(vertex.y)})`,
      )),
      entry('geoEdges.connections', '图形连线', model.edges.map(([from, to]) => `${from}${to}`).join('、')),
    ],
  }
}

function chemistryPresentation(scene: LessonScene): SpecializedContentPresentation {
  const model = chemistryVisualFor(scene.contentSlots)
  if (!model) return { textEntries: [], visualEntries: [] }
  if (model.kind === 'chemistry-equation') {
    return {
      textEntries: [
        entry('chemEquation', '化学方程式', `\\(${model.equation}\\)`),
        ...(model.condition ? [entry('chemEquationCondition', '反应条件', model.condition)] : []),
        ...(model.energy ? [entry('chemEquationEnergy', '能量变化', model.energy)] : []),
        ...model.states.map((item, index) => entry(`chemEquationStates.${index}`, `物质状态 ${index + 1}`, `${item.substance} · ${item.state}`)),
        ...model.atomCounts.map((item, index) => entry(`chemEquationAtoms.${index}`, `原子计数 ${item.element}`, `反应物 ${item.reactants}；生成物 ${item.products}`)),
      ],
      visualEntries: [],
    }
  }
  const bondOrder = ['单键', '双键', '三键'] as const
  return {
    textEntries: [
      entry('molStructure', '分子结构', model.label),
      ...model.atoms.map((atom, index) => entry(`molAtoms.${index}`, `原子 ${index + 1}`, `${atom.element}；编号 ${atom.id}`)),
      ...model.bondAngles.map((value, index) => entry(`molBondAngle.${index}`, `键角 ${index + 1}`, value)),
      ...model.functionalGroups.map((value, index) => entry(`molFunctionalGroup.${index}`, `官能团 ${index + 1}`, value)),
    ],
    visualEntries: model.bonds.map((bond, index) => entry(
      `molBonds.${index}`,
      `化学键 ${index + 1}`,
      `${bond.from} 与 ${bond.to} 之间为 ${bondOrder[bond.order - 1]}`,
    )),
  }
}

function circuitPresentation(scene: LessonScene): SpecializedContentPresentation {
  const model = circuitVisualFor(scene.contentSlots)
  if (!model) return { textEntries: [], visualEntries: [] }
  return {
    textEntries: model.components.map((component, index) => entry(
      `circuitTopology.${index}`,
      `元件 ${index + 1}`,
      `${component.id}${component.value ? ` · ${component.value}${component.unit ?? ''}` : ''}`,
    )),
    visualEntries: [
      entry('circuitTopology.symbols', '元件图形', model.components.map(component => `${component.id}（${CIRCUIT_TYPE_LABEL[component.type] ?? component.type}）`).join('、')),
      entry('circuitConnections.wires', '导线连接', model.connections.map(([from, to]) => `${from}—${to}`).join('、')),
    ],
  }
}

function chinesePresentation(scene: LessonScene): SpecializedContentPresentation {
  const model = chineseVisualFor(scene.contentSlots)
  if (!model) return { textEntries: [], visualEntries: [] }
  if (model.kind === 'chinese-classical') {
    return {
      textEntries: [
        ...model.text.map((value, index) => entry(`classicalText.${index}`, `原文 ${index + 1}`, value)),
        ...model.translation.map((value, index) => entry(`classicalTranslation.${index}`, `翻译 ${index + 1}`, value)),
        ...model.glosses.map((item, index) => entry(`classicalGloss.${index}`, `词义 ${index + 1}`, `${item.word}：${item.meaning}${item.grammar ? `；${item.grammar}` : ''}`)),
      ],
      visualEntries: [],
    }
  }
  if (model.kind === 'chinese-pinyin') {
    return {
      textEntries: model.syllables.slice(0, 8).map((item, index) => entry(
        `pinyinSyllables.${index}`,
        `音节 ${index + 1}`,
        `${item.initial || '∅'} + ${item.final}；${item.example}；${item.tone} 声`,
      )),
      visualEntries: [entry(
        'pinyinToneFocus.cards',
        '声调曲线',
        `每个音节按对应声调绘制曲线${model.focus ? `；${model.focus} 声卡片使用重点色` : ''}`,
      )],
    }
  }
  return {
    textEntries: [
      entry('faultySentence', '病句', model.faulty),
      ...model.diagnoses.map((item, index) => entry(`sentenceDiagnosis.${index}`, `诊断 ${index + 1}`, `${item.type}；${item.fragment}；${item.reason}`)),
      entry('sentenceCorrection', '修改结果', model.corrected.replace(/[【】]/g, '')),
      ...(model.punctuation ? [entry('punctuationFocus', '标点重点', model.punctuation)] : []),
    ],
    visualEntries: [],
  }
}

function englishPresentation(scene: LessonScene): SpecializedContentPresentation {
  const model = englishVisualFor(scene.contentSlots)
  if (!model) return { textEntries: [], visualEntries: [] }
  if (model.kind === 'english-vocab') {
    return {
      textEntries: model.cards.slice(0, 6).map((card, index) => entry(
        `vocabCards.${index}`,
        `词汇卡 ${index + 1}`,
        `${card.word} /${card.ipa}/ ${card.pos}；${card.meaning}；${card.example}；${card.hint}`,
      )),
      visualEntries: [],
    }
  }
  return {
    textEntries: model.parts.map((part, index) => entry(`sentenceParse.${index}`, `句子成分 ${index + 1}`, `${part.segment}；${part.role} · L${part.depth}`)),
    visualEntries: [entry('sentenceParse.depth', '层级关系', '层级 0 是主干，层级越大表示越深的修饰或从属结构')],
  }
}

function biologyPresentation(scene: LessonScene): SpecializedContentPresentation {
  const model = biologyVisualFor(scene.contentSlots)
  if (!model) return { textEntries: [], visualEntries: [] }
  return {
    textEntries: model.callouts.map((item, index) => entry(
      `structureCallouts.${index}`,
      `结构 ${index + 1}`,
      `${item.system ? `${item.system}；` : ''}${item.structure}：${item.function}`,
    )),
    visualEntries: [],
  }
}

function opticsPresentation(scene: LessonScene): SpecializedContentPresentation {
  const solution = opticsSolutionFor(scene.contentSlots.opticsScene)
  if (!solution) return { textEntries: [], visualEntries: [] }
  const roleCounts = new Map<string, number>()
  for (const segment of solution.segments) roleCounts.set(segment.role, (roleCounts.get(segment.role) ?? 0) + 1)
  return {
    textEntries: [
      ...solution.labels.map((label, index) => entry(`opticsScene.label.${index}`, `图中标注 ${index + 1}`, label.text)),
      entry('opticsScene.verdict', '光学结论', solution.verdict),
    ],
    visualEntries: [
      entry('opticsScene.kind', '光路类型', OPTICS_KIND_LABEL[solution.kind] ?? solution.kind),
      entry('opticsScene.segments', '光路构成', [...roleCounts.entries()].map(([role, count]) => `${OPTICS_ROLE_LABEL[role] ?? role} ${count} 条`).join('、')),
    ],
  }
}

export function specializedContentPresentation(scene: LessonScene, kind: SpecializedContentKind): SpecializedContentPresentation {
  let presentation: SpecializedContentPresentation
  switch (kind) {
    case 'poem': presentation = poemPresentation(scene); break
    case 'timeline': presentation = timelinePresentation(scene); break
    case 'dialogue': presentation = dialoguePresentation(scene); break
    case 'force': presentation = forcePresentation(scene); break
    case 'function-plot': presentation = functionPlotPresentation(scene); break
    case 'geometry': presentation = geometryPresentation(scene); break
    case 'chemistry': presentation = chemistryPresentation(scene); break
    case 'circuit': presentation = circuitPresentation(scene); break
    case 'chinese': presentation = chinesePresentation(scene); break
    case 'english': presentation = englishPresentation(scene); break
    case 'biology': presentation = biologyPresentation(scene); break
    case 'optics': presentation = opticsPresentation(scene); break
  }
  if (presentation.textEntries.length > 0 || presentation.visualEntries.length > 0) return presentation
  return {
    textEntries: [],
    visualEntries: [entry(`${kind}.invalid`, '图形状态', '结构化绘图数据无法解析，当前页面可能缺少应有图形')],
  }
}

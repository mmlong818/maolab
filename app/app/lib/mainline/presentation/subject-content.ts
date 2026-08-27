import { parseGeoAngles, parseGeoEdges, parseGeoVertices, type GeoAngle, type GeoVertex } from './content-forms.js'

type ContentSlots = Readonly<Record<string, string | undefined>>

function lines(raw: string | undefined): string[] {
  return (raw ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length
}

export interface GeometryVisual {
  kind: 'geometry'
  vertices: GeoVertex[]
  edges: [string, string][]
  angles: GeoAngle[]
  auxLines: string[]
}

export function geometryVisualFor(slots: ContentSlots): GeometryVisual | null {
  const vertices = parseGeoVertices(slots.geoVertices ?? '')
  if (vertices.length < 3 || !unique(vertices.map(vertex => vertex.name))) return null
  const twiceArea = vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]!
    return sum + vertex.x * next.y - next.x * vertex.y
  }, 0)
  if (Math.abs(twiceArea) < 1e-8) return null

  const names = new Set(vertices.map(vertex => vertex.name))
  const edges = parseGeoEdges(slots.geoEdges ?? '')
  if (edges.length < 3 || edges.some(([a, b]) => a === b || !names.has(a) || !names.has(b))) return null
  const edgeKeys = edges.map(([a, b]) => [a, b].sort().join('-'))
  if (!unique(edgeKeys)) return null

  const angles = parseGeoAngles(slots.geoAngleLabels ?? '')
  if (angles.some(angle => !names.has(angle.vertex))) return null
  return {
    kind: 'geometry',
    vertices,
    edges,
    angles,
    auxLines: (slots.geoAuxLines ?? '').split('→').map(step => step.trim()).filter(Boolean),
  }
}

export interface EquationAtomCount { element: string; reactants: number; products: number }
export interface ChemistryEquationVisual {
  kind: 'chemistry-equation'
  equation: string
  atomCounts: EquationAtomCount[]
  condition?: string
  states: { substance: string; state: string }[]
  energy?: '放热' | '吸热'
}
export interface MoleculeAtom { id: string; element: string; ordinal: number }
export interface MoleculeBond { from: string; to: string; order: 1 | 2 | 3 }
export interface ChemistryMoleculeVisual {
  kind: 'chemistry-molecule'
  label: string
  atoms: MoleculeAtom[]
  bonds: MoleculeBond[]
  bondAngles: string[]
  functionalGroups: string[]
}
export type ChemistryVisual = ChemistryEquationVisual | ChemistryMoleculeVisual

function chemistryEquationFor(slots: ContentSlots): ChemistryEquationVisual | null {
  const equation = slots.chemEquation?.trim()
  if (!equation) return null
  const atomCounts = lines(slots.chemEquationAtoms).map(line => {
    const match = /^([A-Z][a-z]?)\s*:\s*(\d+)\s*=\s*(\d+)$/.exec(line)
    return match ? { element: match[1]!, reactants: Number(match[2]), products: Number(match[3]) } : null
  })
  if (atomCounts.length === 0 || atomCounts.some(item => item === null)) return null
  const counts = atomCounts as EquationAtomCount[]
  if (!unique(counts.map(item => item.element))) return null
  const states = lines(slots.chemEquationStates).map(line => {
    const splitAt = line.indexOf(':')
    return splitAt > 0 ? { substance: line.slice(0, splitAt).trim(), state: line.slice(splitAt + 1).trim() } : null
  })
  if (states.some(item => !item?.substance || !item.state)) return null
  const energy = slots.chemEquationEnergy?.trim()
  if (energy && energy !== '放热' && energy !== '吸热') return null
  return {
    kind: 'chemistry-equation',
    equation,
    atomCounts: counts,
    ...(slots.chemEquationCondition?.trim() ? { condition: slots.chemEquationCondition.trim() } : {}),
    states: states as { substance: string; state: string }[],
    ...(energy ? { energy: energy as '放热' | '吸热' } : {}),
  }
}

function chemistryMoleculeFor(slots: ContentSlots): ChemistryMoleculeVisual | null {
  const label = slots.molStructure?.trim()
  if (!label) return null
  const atomGroups = lines(slots.molAtoms).map(line => {
    const match = /^([A-Z][a-z]?)\s*:\s*([1-9]\d*)$/.exec(line)
    return match ? { element: match[1]!, count: Number(match[2]) } : null
  })
  if (atomGroups.length === 0 || atomGroups.some(group => group === null)) return null
  const groups = atomGroups as { element: string; count: number }[]
  if (!unique(groups.map(group => group.element))) return null
  const atoms = groups.flatMap(group => Array.from({ length: group.count }, (_, index) => ({
    id: `${group.element}${index + 1}`,
    element: group.element,
    ordinal: index + 1,
  })))
  const atomIds = new Set(atoms.map(atom => atom.id))
  const bonds = lines(slots.molBonds).map(line => {
    const match = /^([A-Z][a-z]?\d+)\s*-\s*([A-Z][a-z]?\d+)\s*:\s*([123])$/.exec(line)
    return match ? { from: match[1]!, to: match[2]!, order: Number(match[3]) as 1 | 2 | 3 } : null
  })
  if (bonds.length === 0 || bonds.some(bond => !bond || bond.from === bond.to || !atomIds.has(bond.from) || !atomIds.has(bond.to))) return null
  const validBonds = bonds as MoleculeBond[]
  if (!unique(validBonds.map(bond => [bond.from, bond.to].sort().join('-')))) return null
  const reached = new Set<string>([atoms[0]!.id])
  let changed = true
  while (changed) {
    changed = false
    for (const bond of validBonds) {
      if (reached.has(bond.from) && !reached.has(bond.to)) { reached.add(bond.to); changed = true }
      if (reached.has(bond.to) && !reached.has(bond.from)) { reached.add(bond.from); changed = true }
    }
  }
  if (reached.size !== atoms.length) return null
  return {
    kind: 'chemistry-molecule', label, atoms, bonds: validBonds,
    bondAngles: lines(slots.molBondAngle),
    functionalGroups: lines(slots.molFunctionalGroup),
  }
}

export function chemistryVisualFor(slots: ContentSlots): ChemistryVisual | null {
  return chemistryEquationFor(slots) ?? chemistryMoleculeFor(slots)
}

export type CircuitComponentType = 'battery' | 'resistor' | 'bulb' | 'switch' | 'ammeter' | 'voltmeter'
export interface CircuitComponent { id: string; type: CircuitComponentType; value?: string; unit?: string }
export interface CircuitVisual { kind: 'circuit'; components: CircuitComponent[]; connections: [string, string][] }
const CIRCUIT_TYPES = new Set<CircuitComponentType>(['battery', 'resistor', 'bulb', 'switch', 'ammeter', 'voltmeter'])

export function circuitVisualFor(slots: ContentSlots): CircuitVisual | null {
  const components = lines(slots.circuitTopology).map(line => {
    const parts = line.split('|').map(part => part.trim())
    const type = parts[1] as CircuitComponentType
    if (parts.length !== 4 || !/^[A-Za-z][\w-]*$/.test(parts[0] ?? '') || !CIRCUIT_TYPES.has(type)) return null
    return { id: parts[0]!, type, value: parts[2] || undefined, unit: parts[3] || undefined }
  })
  if (components.length < 2 || components.some(component => component === null)) return null
  const validComponents = components as CircuitComponent[]
  if (!unique(validComponents.map(component => component.id))) return null
  const ids = new Set(validComponents.map(component => component.id))
  const connections = lines(slots.circuitConnections).map(line => {
    const match = /^([A-Za-z][\w-]*)\s*-\s*([A-Za-z][\w-]*)$/.exec(line)
    return match ? [match[1]!, match[2]!] as [string, string] : null
  })
  if (connections.length === 0 || connections.some(connection => !connection || connection[0] === connection[1] || !ids.has(connection[0]) || !ids.has(connection[1]))) return null
  const validConnections = connections as [string, string][]
  if (!unique(validConnections.map(connection => [...connection].sort().join('-')))) return null
  const reached = new Set<string>([validComponents[0]!.id])
  let changed = true
  while (changed) {
    changed = false
    for (const [a, b] of validConnections) {
      if (reached.has(a) && !reached.has(b)) { reached.add(b); changed = true }
      if (reached.has(b) && !reached.has(a)) { reached.add(a); changed = true }
    }
  }
  return reached.size === validComponents.length ? { kind: 'circuit', components: validComponents, connections: validConnections } : null
}

export interface ClassicalVisual { kind: 'chinese-classical'; text: string[]; translation: string[]; glosses: { word: string; meaning: string; grammar?: string }[] }
export interface PinyinVisual { kind: 'chinese-pinyin'; syllables: { initial: string; final: string; tone: 1 | 2 | 3 | 4; example: string }[]; focus?: string }
export interface SentenceCorrectionVisual { kind: 'chinese-correction'; faulty: string; diagnoses: { type: string; fragment: string; reason: string }[]; corrected: string; punctuation?: string }
export type ChineseVisual = ClassicalVisual | PinyinVisual | SentenceCorrectionVisual

export function chineseVisualFor(slots: ContentSlots): ChineseVisual | null {
  if (slots.classicalText?.trim()) {
    const text = lines(slots.classicalText), translation = lines(slots.classicalTranslation)
    const glosses = lines(slots.classicalGloss).map(line => {
      const [word, meaning, grammar] = line.split('|').map(part => part.trim())
      return word && meaning ? { word, meaning, grammar: grammar || undefined } : null
    })
    if (text.length === 0 || text.length !== translation.length || glosses.length === 0 || glosses.some(item => item === null)) return null
    return { kind: 'chinese-classical', text, translation, glosses: glosses as ClassicalVisual['glosses'] }
  }
  if (slots.pinyinSyllables?.trim()) {
    const syllables = lines(slots.pinyinSyllables).map(line => {
      const [initial, final, toneRaw, example] = line.split('|').map(part => part.trim())
      const tone = Number(toneRaw)
      return final && example && Number.isInteger(tone) && tone >= 1 && tone <= 4 ? { initial, final, tone: tone as 1 | 2 | 3 | 4, example } : null
    })
    if (syllables.length === 0 || syllables.some(item => item === null)) return null
    const focus = slots.pinyinToneFocus?.trim()
    return { kind: 'chinese-pinyin', syllables: syllables as PinyinVisual['syllables'], ...(focus ? { focus } : {}) }
  }
  const faulty = slots.faultySentence?.trim(), corrected = slots.sentenceCorrection?.trim()
  if (faulty || corrected || slots.sentenceDiagnosis?.trim()) {
    const diagnoses = lines(slots.sentenceDiagnosis).map(line => {
      const [type, fragment, reason] = line.split('|').map(part => part.trim())
      return type && fragment && reason ? { type, fragment, reason } : null
    })
    if (!faulty || !corrected || diagnoses.length === 0 || diagnoses.some(item => item === null)) return null
    const punctuation = slots.punctuationFocus?.trim()
    return { kind: 'chinese-correction', faulty, corrected, diagnoses: diagnoses as SentenceCorrectionVisual['diagnoses'], ...(punctuation ? { punctuation } : {}) }
  }
  return null
}

export interface VocabCard { word: string; ipa: string; pos: string; meaning: string; example: string; hint: string }
export interface EnglishVocabVisual { kind: 'english-vocab'; cards: VocabCard[] }
export interface SentencePart { segment: string; role: string; depth: number }
export interface EnglishSentenceVisual { kind: 'english-sentence'; parts: SentencePart[] }
export type EnglishVisual = EnglishVocabVisual | EnglishSentenceVisual

export function englishVisualFor(slots: ContentSlots): EnglishVisual | null {
  if (slots.vocabCards?.trim()) {
    const cards = lines(slots.vocabCards).map(line => {
      const [word, ipa, pos, meaning, example, hint] = line.split('|').map(part => part.trim())
      return word && ipa && pos && meaning && example && hint ? { word, ipa, pos, meaning, example, hint } : null
    })
    if (cards.length === 0 || cards.some(card => card === null)) return null
    return { kind: 'english-vocab', cards: cards as VocabCard[] }
  }
  if (slots.sentenceParse?.trim()) {
    const parts = lines(slots.sentenceParse).map(line => {
      const [segment, role, depthRaw] = line.split('|').map(part => part.trim())
      const depth = Number(depthRaw)
      return segment && /^[a-z][a-z-]*$/.test(role ?? '') && Number.isInteger(depth) && depth >= 0 && depth <= 6 ? { segment, role, depth } : null
    })
    if (parts.length === 0 || parts.some(part => part === null) || !(parts as SentencePart[]).some(part => part.depth === 0)) return null
    return { kind: 'english-sentence', parts: parts as SentencePart[] }
  }
  return null
}

export interface BiologyCallout { structure: string; function: string; system?: string }
export interface BiologyVisual { kind: 'biology-structure'; callouts: BiologyCallout[] }
export function biologyVisualFor(slots: ContentSlots): BiologyVisual | null {
  const callouts = lines(slots.structureCallouts).map(line => {
    const parts = line.split('|').map(part => part.trim())
    return parts.length >= 2 && parts.length <= 3 && parts[0] && parts[1]
      ? { structure: parts[0], function: parts[1], system: parts[2] || undefined }
      : null
  })
  if (callouts.length < 2 || callouts.some(item => item === null)) return null
  const valid = callouts as BiologyCallout[]
  return unique(valid.map(item => item.structure)) ? { kind: 'biology-structure', callouts: valid } : null
}

export function hasRenderableSubjectVisual(slots: ContentSlots): boolean {
  return Boolean(
    geometryVisualFor(slots) || chemistryVisualFor(slots) || circuitVisualFor(slots) ||
    chineseVisualFor(slots) || englishVisualFor(slots) || biologyVisualFor(slots),
  )
}

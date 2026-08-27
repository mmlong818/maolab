import { aiVerifyPairs } from '../ai-verify.js'
import { IMAGE_SCENE_TYPES, type LessonScene, type MainlineCourse, type SceneType } from '../domain.js'
import { stagedLearningConfig } from '../staged-learning.js'
import { recapCoreSlotKeys, recapTemplateForScene } from '../recap-template.js'
import { SERIAL_HOOK_SLOT } from '../season.js'
import { opticsSolutionFor } from './optics.js'
import { pickMasterRouted } from './master-routing.js'
import { presentationFor } from './presentation.js'
import { usesGeneratedSceneImage } from './scene-rendering-priority.js'
import {
  SPECIALIZED_LABELS,
  SPECIALIZED_SLOT_KEYS,
  specializedContentPresentation,
  type SpecializedContentKind,
} from './specialized-content-contract.js'
import {
  biologyVisualFor,
  chemistryVisualFor,
  chineseVisualFor,
  circuitVisualFor,
  englishVisualFor,
  geometryVisualFor,
} from './subject-content.js'

export type { SpecializedContentKind } from './specialized-content-contract.js'

export interface SceneContentEntry {
  key: string
  label: string
  value: string
  source: 'slot' | 'board' | 'course' | 'scene' | 'visual'
}

export interface SceneContentContract {
  /** 学生首次进入本页会看到的内容。 */
  displayEntries: SceneContentEntry[]
  /** 学生完成本页任务后才出现的内容，不能混入首屏确认稿。 */
  revealEntries: SceneContentEntry[]
  /** 页面用图形、位置、连线或颜色呈现的内容，不冒充逐字上屏文字。 */
  visualEntries: SceneContentEntry[]
  /** 生成、讲解或后续渲染使用，但当前页面不会直接呈现的内容。 */
  planningEntries: SceneContentEntry[]
  specializedKind: SpecializedContentKind | null
  hasImage: boolean
  displaySummary: string
}

const CORE_SLOT_KEYS: Readonly<Partial<Record<SceneType, readonly string[]>>> = {
  'visual-observation': ['panelATitle', 'panelA', 'panelBTitle', 'panelB', 'panelCTitle', 'panelC'],
  'concept-build': ['statement', 'example'],
  contrast: ['misconception', 'correction'],
  'worked-example': ['problem', 'completionPrompt', 'steps'],
  practice: ['task', 'feedback'],
  'ai-verify': ['aiClaim', 'reveal'],
  'ai-inquiry': ['shallowSample', 'probingSample'],
  'ai-collab': ['task', 'rubric'],
}

const SLOT_LABELS: Readonly<Record<string, string>> = {
  panelATitle: '观察一标题', panelA: '观察一说明',
  panelBTitle: '观察二标题', panelB: '观察二说明',
  panelCTitle: '观察三标题', panelC: '观察三说明',
  mainImage: '主画面', zoomTarget: '局部放大',
  statement: '核心表述', example: '示例', problem: '题目', completionPrompt: '学生先补的关键一步', steps: '完整步骤',
  misconception: '常见误区', correction: '修正说明', task: '学习任务', feedback: '反馈', rubric: '评价标准',
  path: '学习路径', takeaway: '核心收获', aiClaim: 'AI 的说法', reveal: '核查结论',
  startingIdea: '起始想法', revisedIdea: '修正解释', revisionEvidence: '修正依据',
  shapeSummary: '本课总论断', shapeCenter: '中心主题',
  shallowSample: '普通提问示例', probingSample: '深度提问示例', serialHook: '下集预告',
  coreQuestion: '核心问题', structuralTurn: '结构转折',
  poemLines: '诗文原文', timelineEvents: '时间线', dialogueScript: '对话脚本', forceVectors: '受力数据',
  funcExpr: '函数表达式', funcDomain: '定义域', funcPlotPoints: '函数图像', funcKeyPoints: '关键点', funcBreakpoints: '无定义点',
  geoVertices: '几何顶点', geoEdges: '几何边', geoAngleLabels: '角度标注', geoAuxLines: '辅助线步骤',
  chemEquation: '化学方程式', chemEquationAtoms: '原子计数', chemEquationCondition: '反应条件', chemEquationStates: '物质状态', chemEquationEnergy: '能量变化',
  molStructure: '分子结构', molAtoms: '原子组成', molBonds: '化学键', molBondAngle: '键角', molFunctionalGroup: '官能团',
  circuitTopology: '电路元件', circuitConnections: '电路连接',
  classicalText: '文言原文', classicalTranslation: '逐句翻译', classicalGloss: '词义注释',
  pinyinSyllables: '拼音音节', pinyinToneFocus: '声调重点', faultySentence: '病句', sentenceDiagnosis: '病因诊断', sentenceCorrection: '修改结果', punctuationFocus: '标点重点',
  vocabCards: '词汇卡', sentenceParse: '句子结构', structureCallouts: '结构与功能', opticsScene: '光路参数',
  poemTitle: '诗文标题', poemAuthor: '作者',
}

export function contentSlotLabel(key: string): string {
  if (/^aiClaim\d+$/.test(key)) return '分项 AI 说法'
  if (/^reveal\d+$/.test(key)) return '分项核查结论'
  if (/^shapeItem\d+$/.test(key)) return '结构分支'
  return SLOT_LABELS[key] ?? '补充内容'
}

function filledSlotKeys(scene: LessonScene, keys: readonly string[]): string[] {
  return keys.filter(key => Boolean(scene.contentSlots[key]?.trim()))
}

export function sceneCoreSlotKeys(scene: LessonScene): string[] {
  if (scene.sceneType === 'recap') return filledSlotKeys(scene, recapCoreSlotKeys(scene))
  return filledSlotKeys(scene, CORE_SLOT_KEYS[scene.sceneType] ?? [])
}

/** 与 SceneTechniqueView 共用的专业内容派发顺序，避免预览和备课说明各自猜测。 */
export function specializedContentKind(scene: LessonScene): SpecializedContentKind | null {
  if (usesGeneratedSceneImage(scene)) return null
  if (scene.sceneType === 'recap' && scene.contentSlots.takeaway?.trim()) return null
  if (scene.contentSlots.poemLines?.trim()) return 'poem'
  if (scene.contentSlots.timelineEvents?.trim()) return 'timeline'
  if (scene.contentSlots.dialogueScript?.trim()) return 'dialogue'
  if (scene.contentSlots.forceVectors?.trim()) return 'force'
  if (scene.contentSlots.funcPlotPoints?.trim()) return 'function-plot'
  if (geometryVisualFor(scene.contentSlots)) return 'geometry'
  if (chemistryVisualFor(scene.contentSlots)) return 'chemistry'
  if (circuitVisualFor(scene.contentSlots)) return 'circuit'
  if (chineseVisualFor(scene.contentSlots)) return 'chinese'
  if (englishVisualFor(scene.contentSlots)) return 'english'
  if (biologyVisualFor(scene.contentSlots)) return 'biology'
  if (opticsSolutionFor(scene.contentSlots.opticsScene)) return 'optics'
  return null
}

function slotEntries(scene: LessonScene, keys: readonly string[]): SceneContentEntry[] {
  return keys.flatMap(key => {
    const value = scene.contentSlots[key]?.trim()
    return value ? [{ key, label: contentSlotLabel(key), value, source: 'slot' as const }] : []
  })
}

function boardEntries(scene: LessonScene, limit = scene.boardText.length): SceneContentEntry[] {
  return scene.boardText.slice(0, limit).map((value, index) => ({
    key: `boardText.${index}`,
    label: `板书 ${index + 1}`,
    value,
    source: 'board' as const,
  }))
}

function aiVerifyEntries(scene: LessonScene): SceneContentEntry[] {
  const pairs = aiVerifyPairs(scene)
  const indexed = pairs.length > 1
  return pairs.flatMap(pair => [
    ...(pair.claim
      ? [{
          key: indexed ? `aiClaim${pair.index}` : 'aiClaim',
          label: indexed ? `AI 的说法 ${pair.index}` : 'AI 的说法',
          value: pair.claim,
          source: 'slot' as const,
        }]
      : []),
    ...(pair.reveal
      ? [{
          key: indexed ? `reveal${pair.index}` : 'reveal',
          label: indexed ? `核查结论 ${pair.index}` : '核查结论',
          value: pair.reveal,
          source: 'slot' as const,
        }]
      : []),
  ])
}

function stagedContentEntries(scene: LessonScene): Pick<SceneContentContract, 'displayEntries' | 'revealEntries'> | null {
  const config = stagedLearningConfig(scene)
  if (!config) return null

  switch (config.sceneType) {
    case 'worked-example':
      return workedExampleContentEntries(scene)
    case 'practice':
      return {
        displayEntries: slotEntries(scene, ['task']),
        revealEntries: slotEntries(scene, ['feedback']),
      }
    case 'contrast':
      return {
        displayEntries: slotEntries(scene, [scene.contentSlots.leftAction?.trim() ? 'leftAction' : 'misconception']),
        revealEntries: slotEntries(scene, [scene.contentSlots.rightAction?.trim() ? 'rightAction' : 'correction']),
      }
    case 'ai-verify': {
      const pairs = aiVerifyPairs(scene)
      const [first, ...rest] = pairs
      if (!first?.claim) return null
      const entryFor = (prefix: 'claim' | 'reveal', index: number, value: string): SceneContentEntry => ({
        key: prefix === 'claim' ? `aiClaim${index}` : `reveal${index}`,
        label: prefix === 'claim'
          ? (index === 1 ? 'AI 的说法（首屏）' : `AI 的说法（第 ${index} 阶段）`)
          : `核查结论（第 ${index} 阶段）`,
        value,
        source: 'slot',
      })
      return {
        displayEntries: [entryFor('claim', first.index, first.claim)],
        revealEntries: [
          ...(first.reveal ? [entryFor('reveal', first.index, first.reveal)] : []),
          ...rest.flatMap(pair => [
            ...(pair.claim ? [entryFor('claim', pair.index, pair.claim)] : []),
            ...(pair.reveal ? [entryFor('reveal', pair.index, pair.reveal)] : []),
          ]),
        ],
      }
      }
  }
}

/** 完整例题的确认稿与实际投影片使用同一份题面和任务，不再派生幕后流程说明。 */
function workedExampleContentEntries(scene: LessonScene): Pick<SceneContentContract, 'displayEntries' | 'revealEntries'> {
  const problem = scene.contentSlots.problem?.trim()
  const completionPrompt = scene.contentSlots.completionPrompt?.trim()
  const steps = splitWorkedExampleSteps(scene.contentSlots.steps ?? '', scene.boardText)

  return {
    displayEntries: [
      ...(problem ? [{ key: 'problem', label: '题目', value: problem, source: 'slot' as const }] : []),
      ...(completionPrompt ? [{
        key: 'completionPrompt',
        label: '当前题目',
        value: completionPrompt,
        source: 'slot' as const,
      }] : []),
    ],
    revealEntries: steps.length > 0
      ? [{ key: 'steps', label: '解题过程', value: steps.join('\n'), source: 'slot' as const }]
      : [],
  }
}

function splitWorkedExampleSteps(value: string, boardText: readonly string[]): string[] {
  const hasFourConditions = boardText.some(line => /同体.*等大.*反向.*共线/.test(line))
  return value
    .split(/；|;|\n/)
    .map(step => step.trim().replace(/^第[一二三四五六七八九十]步(?:[：:，,])?/, ''))
    .map(step => hasFourConditions && /验证四条件/.test(step) && !/同体/.test(step)
      ? `${step.replace(/[。.]?$/, '')}：作用在同一物体上、大小相等、方向相反且在同一直线上，因此拉力和摩擦力是一对平衡力。`
      : step)
    .filter(Boolean)
}

/** 幕型核心内容的唯一展示视图；专业图表容器与备课确认稿共同消费。 */
export function sceneCoreContentEntries(scene: LessonScene): SceneContentEntry[] {
  if (scene.sceneType === 'ai-verify') return aiVerifyEntries(scene)
  return slotEntries(scene, sceneCoreSlotKeys(scene))
}

function recapDisplayEntries(course: MainlineCourse, scene: LessonScene): SceneContentEntry[] {
  const template = recapTemplateForScene(scene)
  if (template && template.id !== 'learning-ladder') {
    return slotEntries(scene, recapCoreSlotKeys(scene))
  }

  const master = pickMasterRouted(course, scene, 'recap')
  const slotKeys = master === 2 || master === 3 || master === 5
    ? ['takeaway']
    : ['path', 'takeaway']
  if ((master === 5 || master === 6 || master === 8) && scene.contentSlots[SERIAL_HOOK_SLOT]?.trim()) {
    slotKeys.push(SERIAL_HOOK_SLOT)
  }
  return [
    ...slotEntries(scene, slotKeys),
    ...(master === 2 ? boardEntries(scene) : master === 5 ? boardEntries(scene, 6) : []),
  ]
}

function compositionDisplayEntries(course: MainlineCourse, scene: LessonScene): SceneContentEntry[] {
  const text = presentationFor(scene, course).composition.text
  if (text === 'chips-tl' || text === 'chips-tr') return boardEntries(scene, 3)
  if (text === 'rail-cards' || text === 'strip-bottom') return boardEntries(scene, 4)
  if (text === 'stepper-bottom') {
    return scene.contentSlots.path?.trim()
      ? slotEntries(scene, ['path'])
      : boardEntries(scene, 6)
  }
  return []
}

function contrastDisplayEntries(course: MainlineCourse, scene: LessonScene): SceneContentEntry[] {
  const master = pickMasterRouted(course, scene, 'contrast')
  return [
    ...slotEntries(scene, sceneCoreSlotKeys(scene)),
    ...(master === 1 || master === 2 ? boardEntries(scene) : master === 5 ? boardEntries(scene, 3) : []),
  ]
}

function legacyDisplayEntries(course: MainlineCourse, scene: LessonScene): SceneContentEntry[] {
  if (scene.sceneTechnique === 'local-zoom') {
    return [...slotEntries(scene, ['mainImage', 'zoomTarget']), ...boardEntries(scene)]
  }
  if (scene.sceneTechnique === 'comparison-slider') {
    if (scene.sceneType === 'ai-verify') return aiVerifyEntries(scene)
    if (scene.sceneType === 'contrast') return contrastDisplayEntries(course, scene)
    return slotEntries(scene, sceneCoreSlotKeys(scene))
  }
  if (scene.visualLayout.includes('three-panel')) {
    return slotEntries(scene, ['panelA', 'panelB', 'panelC'])
  }
  if (scene.sceneTechnique === 'path-tracing') {
    return scene.contentSlots.path?.trim() ? slotEntries(scene, ['path']) : boardEntries(scene, 6)
  }
  if (scene.sceneTechnique === 'simulation' || scene.contentSlots.labels) return boardEntries(scene)
  if (scene.sceneTechnique === 'draggable-model') {
    return scene.interactionContract?.trim()
      ? [{ key: 'scene.interactionContract', label: '操作说明', value: scene.interactionContract, source: 'scene' }]
      : []
  }
  if (scene.sceneTechnique === 'step-replay') {
    if (scene.contentSlots.steps?.trim()) return slotEntries(scene, ['steps'])
    if (scene.contentSlots.path?.trim()) return slotEntries(scene, ['path'])
    return boardEntries(scene, 6)
  }
  return boardEntries(scene)
}

function sourceReadingEntries(course: MainlineCourse): SceneContentEntry[] {
  const knowledgePoints = course.sourceMaterial.map(item => item.title).filter(Boolean)
  return [
    { key: 'course.topic', label: '课程主题', value: course.topic, source: 'course' as const },
    ...(knowledgePoints.length > 0
      ? [{ key: 'course.knowledgePoints', label: '学习目录', value: knowledgePoints.join('；'), source: 'course' as const }]
      : []),
  ]
}

export function sceneContentContract(course: MainlineCourse, scene: LessonScene): SceneContentContract {
  const allSlotKeys = Object.keys(scene.contentSlots).filter(key => Boolean(scene.contentSlots[key]?.trim()))
  let hasImage = false
  let imagePending = false
  let displayEntries: SceneContentEntry[]
  let revealEntries: SceneContentEntry[] = []
  let visualEntries: SceneContentEntry[] = []
  let specializedSlotKeys: string[] = []
  let specializedKind: SpecializedContentKind | null = null

  const staged = stagedContentEntries(scene)
  if (staged) {
    displayEntries = staged.displayEntries
    revealEntries = staged.revealEntries
    hasImage = Boolean(scene.imageUrl)
    specializedKind = specializedContentKind(scene)
    if (specializedKind) {
      specializedSlotKeys = filledSlotKeys(scene, SPECIALIZED_SLOT_KEYS[specializedKind])
      const specialized = specializedContentPresentation(scene, specializedKind)
      revealEntries = [
        ...revealEntries,
        ...specialized.textEntries.map(item => ({ ...item, source: 'slot' as const })),
      ]
      visualEntries = specialized.visualEntries.map(item => ({ ...item, source: 'visual' as const }))
    }
  } else if (usesGeneratedSceneImage(scene)) {
    hasImage = true
    displayEntries = scene.sceneType === 'recap'
      ? boardEntries(scene)
      : slotEntries(scene, sceneCoreSlotKeys(scene))
  } else if (scene.sceneType === 'recap' && scene.contentSlots.takeaway?.trim() && !scene.contentSlots.takeaway.includes('待 LLM 填充')) {
    displayEntries = recapDisplayEntries(course, scene)
  } else {
    specializedKind = specializedContentKind(scene)
    if (specializedKind) {
      specializedSlotKeys = filledSlotKeys(scene, SPECIALIZED_SLOT_KEYS[specializedKind])
      const specialized = specializedContentPresentation(scene, specializedKind)
      displayEntries = [
        ...sceneCoreContentEntries(scene),
        ...specialized.textEntries.map(item => ({ ...item, source: 'slot' as const })),
      ]
      visualEntries = specialized.visualEntries.map(item => ({ ...item, source: 'visual' as const }))
    } else if (scene.imageUrl) {
      hasImage = true
      displayEntries = compositionDisplayEntries(course, scene)
    } else if (course.qualityStatus === 'passed' && IMAGE_SCENE_TYPES.includes(scene.sceneType)) {
      imagePending = true
      displayEntries = boardEntries(scene)
    } else if (scene.sceneType === 'source-reading') {
      displayEntries = sourceReadingEntries(course)
    } else if (scene.sceneType === 'concept-build' || scene.sceneType === 'worked-example' || scene.sceneType === 'practice' || scene.sceneType === 'ai-collab') {
      displayEntries = sceneCoreContentEntries(scene)
    } else {
      displayEntries = legacyDisplayEntries(course, scene)
    }
  }

  const displayedSlotKeys = new Set([
    ...displayEntries.filter(entry => entry.source === 'slot').map(entry => entry.key),
    ...revealEntries.filter(entry => entry.source === 'slot').map(entry => entry.key),
    ...specializedSlotKeys,
  ])
  const planningEntries = slotEntries(scene, allSlotKeys.filter(key => !displayedSlotKeys.has(key)))
  const summaryParts: string[] = []
  if (hasImage) summaryParts.push('原配图')
  if (imagePending) summaryParts.push('配图生成中')
  if (scene.sceneType === 'source-reading') summaryParts.push('课程主题', '学习目录')
  else {
    const specializedKeys = new Set(specializedKind ? SPECIALIZED_SLOT_KEYS[specializedKind] : [])
    summaryParts.push(...displayEntries
      .filter(entry => entry.source === 'slot' && !specializedKeys.has(entry.key.split('.')[0]!))
      .map(entry => entry.label.replace(/ \d+$/, '')))
    if (displayEntries.some(entry => entry.source === 'scene')) summaryParts.push('操作说明')
    if (displayEntries.some(entry => entry.source === 'board')) summaryParts.push('确认板书')
  }
  if (specializedKind) summaryParts.push(SPECIALIZED_LABELS[specializedKind])
  const displaySummary = [...new Set(summaryParts)].join('、') || '页面标题'
  return { displayEntries, revealEntries, visualEntries, planningEntries, specializedKind, hasImage, displaySummary }
}

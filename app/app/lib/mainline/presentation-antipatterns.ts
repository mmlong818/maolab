/**
 * presentation-antipatterns · 呈现反模式目录(B-5,2026-07-27)
 *
 * 与 quality-gates 的分工:
 * - `quality-gates` 查**错**——事实错误、结构违规,fatal 会阻断出课。
 * - 本文件查**浪费**——内容正确、闸门全绿,但呈现能力没被用上。
 *   只诊断不阻断,产出 ranked punch list。
 *
 * 为什么需要它(对标 usehallmark.com 与 bento/slides,2026-07-27):
 * 两者都把「Audit」与「Build」平级,并明确点名各自的 #1 失败模式——
 * bento 的原话是「correct-but-static result (bullets on slides) wastes it
 * and is the #1 failure mode」。maolab 目前只有查错的闸门,没有查浪费的:
 * 一幕内容全对、专属渲染器却没触发,课照样 passed,没人被告知。
 *
 * 目录纪律(与 creation.md 反同质化系统的抽象标签相区别):
 * **每条规则必须可机器判定,且注明出处**——出处是真检判例或代码核查结论,
 * 禁止凭空发明「看起来该管」的规则。判不准的宁可不收,假阳性会让整份清单失信。
 */

import type { LessonScene, MainlineCourse } from './domain.js'
import { MASTER_TRAITS, pickMasterRouted } from './presentation/master-routing.js'

/** 严重度。本目录一律不阻断出课,分级只用于排序。 */
export type AntipatternSeverity = 'high' | 'medium' | 'low'

export interface AntipatternEvidence {
  /** 仓库内原始真检报告；归档后仍可用 git show HEAD:<path> 读取。 */
  reportPath: string
  /** 报告中的原始症状摘要，避免只给路径却无法判断规则为何成立。 */
  caseSummary: string
}

export interface AntipatternFinding {
  ruleId: string
  sceneId: string
  /** 整课审计时补齐，供备课清单显示页码与幕型。 */
  sceneType?: LessonScene['sceneType']
  sceneNumber?: number
  severity: AntipatternSeverity
  /** 发生了什么。 */
  message: string
  /** 对教学的实际后果——不写后果的诊断没有行动力。 */
  consequence: string
  suggestion: string
  /** 至少一条真检原始判例；目录不接受无出处的审美猜测。 */
  evidence: readonly AntipatternEvidence[]
}

const REPORT_ROUND03 = 'docs/real-check/2026-06-27-round03/FINAL-REPORT.md'
const REPORT_ROUND06 = 'docs/real-check/2026-07-08-round06/FINAL-REPORT.md'
const REPORT_ROUND08 = 'docs/real-check/2026-07-13-round08/FINAL-REPORT.md'
const REPORT_PRODUCTION = 'docs/real-check/2026-07-23-production/REPORT.md'

/**
 * 已知的 typed 专属槽键。
 * **与三处保持同步**:SceneTechniqueView 派发、generation/fill-scenes 生成规则、
 * quality-gates 的 STRUCTURED_VISUAL_SLOTS。新增渲染器时四处一起加。
 */
export const TYPED_SLOT_KEYS: readonly string[] = [
  'poemLines',
  'timelineEvents',
  'dialogueScript',
  'forceVectors',
  'funcPlotPoints',
  'funcDomain',
  'funcKeyPoints',
  'funcExpr',
  'funcBreakpoints',
  'geoVertices',
  'geoEdges',
  'geoAngleLabels',
  'geoAuxLines',
  'opticsScene',
]

/** 编辑距离(上限 2 即可判定,超过直接返回 3)。 */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!
      prev[j] = Math.min(
        prev[j]! + 1,
        prev[j - 1]! + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diag = tmp
    }
  }
  return prev[b.length]!
}

/**
 * R1 · 近似槽键:专属渲染器静默失效。
 *
 * 出处:代码核查(2026-07-27)。`contentSlots` 是 `Record<string, string>`,
 * 全库无任何键名校验;派发器按精确键名匹配(`if (scene.contentSlots.forceVectors)`)。
 * 因此 `forceVector`(少个 s)这类笔误会让专属渲染器**永不触发**,内容退回通用板书,
 * 而所有闸门照常通过——没有任何人被告知呈现被降级了。
 * 同类问题在 bento/slides 的 agents 指南里被列为 gotcha:
 * 「a typo means your styling silently doesn't apply」。
 */
function detectNearMissSlotKeys(scene: LessonScene): AntipatternFinding[] {
  const findings: AntipatternFinding[] = []
  for (const key of Object.keys(scene.contentSlots)) {
    if (TYPED_SLOT_KEYS.includes(key)) continue
    if (!scene.contentSlots[key]?.trim()) continue
    const near = TYPED_SLOT_KEYS.find(known =>
      known.toLowerCase() === key.toLowerCase() || editDistance(key, known) <= 2)
    if (!near) continue
    findings.push({
      ruleId: 'near-miss-slot-key',
      sceneId: scene.id,
      severity: 'high',
      message: `槽键 \`${key}\` 与专属槽键 \`${near}\` 高度相似,疑似笔误。`,
      consequence: `专属渲染器按精确键名派发,\`${key}\` 不会触发任何渲染器——本幕内容会退回通用板书,而闸门不会报错。`,
      suggestion: `改名为 \`${near}\`;若确实是另一种内容,请先在 TYPED_SLOT_KEYS 与派发器登记。`,
      evidence: [{
        reportPath: REPORT_ROUND08,
        caseSummary: '真检发现渲染派发与内容能力不一致会产生空板、裂图或错误版式；近似槽键是同类静默降级的可判定入口。',
      }],
    })
  }
  return findings
}

/**
 * R2 · 专属槽存在但解析为空:渲染器拿到空数据。
 *
 * 出处:A-1 光路渲染器实测(2026-07-27,Codex 真检)。`opticsScene` 取值非法时
 * 渲染端回退通用板书,若无人察觉就是「本该有图的幕没有图」。同理适用于其它
 * 行编码槽——槽在、但一行有效数据都解析不出,等于白写。
 * 判定用**结构性下限**(至少一行含分隔符的非空内容),不重实现各渲染器的解析器。
 */
const LINE_ENCODED_SLOTS: readonly { key: string; separator: string; label: string }[] = [
  { key: 'timelineEvents', separator: '|', label: '历史时间线' },
  { key: 'dialogueScript', separator: ':', label: '英语对话剧本' },
  { key: 'forceVectors', separator: '|', label: '受力矢量' },
  { key: 'geoVertices', separator: '(', label: '几何顶点' },
  { key: 'opticsScene', separator: '|', label: '光路场景' },
]

function detectEmptyTypedSlots(scene: LessonScene): AntipatternFinding[] {
  const findings: AntipatternFinding[] = []
  for (const slot of LINE_ENCODED_SLOTS) {
    const raw = scene.contentSlots[slot.key]
    if (raw === undefined) continue
    const usable = raw
      .split('\n')
      .map(l => l.split('#')[0]!.trim())
      .filter(l => l.length > 0 && l.includes(slot.separator))
    if (usable.length > 0) continue
    findings.push({
      ruleId: 'typed-slot-parses-empty',
      sceneId: scene.id,
      severity: 'high',
      message: `${slot.label}槽 \`${slot.key}\` 存在,但解析不出任何一行有效数据。`,
      consequence: '渲染器拿到空数据会回退通用版式或画出空图,幕上承诺的结构化呈现落空。',
      suggestion: `按 \`${slot.key}\` 的行格式补全内容(每行需含分隔符 \`${slot.separator}\`),或删除该空槽避免误导。`,
      evidence: [{
        reportPath: REPORT_ROUND03,
        caseSummary: '例题步骤槽被序列化为 [object Object]，预期结构板被旁路，生成步骤和结论没有进入正确画面。',
      }],
    })
  }
  return findings
}

/**
 * R3 · 同一句话由多个层级重复承担。
 *
 * 出处:对标 bento/slides 工作流的「视觉所有者」原则(2026-07-27)——
 * 「一条信息只由一个层级负责:标题、图表、画面、正文或 notes。
 * 不要让画面和正文完整显示同一句话。」
 * maolab 一幕有 visualFocus / boardText / contentSlots / teacherScript 四个层级,
 * 重复风险是结构性的。此处只查**完全包含**的长句(≥12 字),避免误伤短语复用。
 */
const MIN_DUPLICATE_LENGTH = 12

function normalize(text: string): string {
  return text.replace(/[\s　]/g, '').replace(/[「」“”"'。,，、;；!！?？]/g, '')
}

function detectLayerDuplication(scene: LessonScene): AntipatternFinding[] {
  const focus = normalize(scene.visualFocus)
  if (focus.length < MIN_DUPLICATE_LENGTH) return []
  const board = scene.boardText.map(normalize).filter(t => t.length >= MIN_DUPLICATE_LENGTH)
  const hit = board.find(line => line.includes(focus) || focus.includes(line))
  if (!hit) return []
  return [{
    ruleId: 'layer-duplication',
    sceneId: scene.id,
    severity: 'medium',
    message: '本幕标题(visualFocus)与板书出现同一句长文本。',
    consequence: '同一条信息被两个层级完整承担,屏幕上重复一遍,挤占了本可以承载新信息的空间。',
    suggestion: '让一条信息只有一个所有者:标题留概括,板书留展开;或把板书那条改为标题的下一层细节。',
    evidence: [{
      reportPath: REPORT_ROUND06,
      caseSummary: '配图幕中图内信息与板书条 100% 重复，用户指出空间浪费且主体图被压小。',
    }],
  }]
}

/**
 * R4 · 单知识点开场把课题再当目录逐字显示。
 *
 * 出处:07-23 正式出品真检的历史课——课仅 1 个 KP 且 KP 名等于课题时，
 * 红色副标题与大标题逐字重复。当前 SourceReadingView 仍同时渲染 visualFocus 与
 * learningFragments 对应的 sourceMaterial.title，因此可以从课程数据精确判定。
 */
function detectIntroTitleDuplication(scene: LessonScene, course: MainlineCourse): AntipatternFinding[] {
  if (scene.sceneType !== 'source-reading') return []
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)
  if (kpFragments.length !== 1) return []
  const kpId = kpFragments[0]!.kpId
  const kpTitle = course.sourceMaterial.find(item => item.kpId === kpId)?.title
  if (!kpTitle || normalize(kpTitle) !== normalize(scene.visualFocus)) return []
  return [{
    ruleId: 'intro-title-duplication',
    sceneId: scene.id,
    severity: 'medium',
    message: '单知识点开场的大标题与知识点目录逐字重复。',
    consequence: '学生连续看到同一句话两次，却没有获得学习价值、问题线索或内容边界，首屏信息增量为零。',
    suggestion: '保留课题作为大标题；目录项改成该知识点的学习问题或一句可观察的学习价值，无法提供新信息时直接隐藏目录。',
    evidence: [{
      reportPath: REPORT_PRODUCTION,
      caseSummary: '历史开场在课仅 1 个知识点且知识点名等于课题时，红色副标题与大标题逐字重复。',
    }],
  }]
}

/**
 * R5 · 低内容量开场落到 airy 母版。
 *
 * 只在「单 KP + 路由到明确登记为 airy 的 source-reading 母版」同时成立时提示。
 * 不靠文本长度猜空间，也不把所有留白都当错误；母版密度和路由均来自渲染器同源表。
 */
function detectSparseIntroMaster(scene: LessonScene, course: MainlineCourse): AntipatternFinding[] {
  if (scene.sceneType !== 'source-reading') return []
  const kpCount = course.learningFragments.filter(fragment => fragment.kpId).length
  if (kpCount !== 1) return []
  const masterIndex = pickMasterRouted(course, scene, 'source-reading')
  const traits = MASTER_TRAITS['source-reading'][masterIndex]
  if (traits?.density !== 'airy') return []
  return [{
    ruleId: 'sparse-intro-master',
    sceneId: scene.id,
    severity: 'low',
    message: `单知识点开场命中低密度母版 #${masterIndex + 1}，存在大面积空置风险。`,
    consequence: '开场只承载课题与一个目录项时，低密度构图容易把有效内容挤在局部，16:9 教学屏的其余区域没有承担导入任务。',
    suggestion: '切换到中密度开场母版，或补一条不泄露答案的预测问题/学习价值；完成前请在真实舞台复看空间分布。',
    evidence: [{
      reportPath: REPORT_PRODUCTION,
      caseSummary: 'source-reading 开场母版下半幅大片留白，16:9 画面上偏空。',
    }],
  }]
}

const SEVERITY_ORDER: Record<AntipatternSeverity, number> = { high: 0, medium: 1, low: 2 }

/**
 * 对整门课跑一遍呈现反模式检查,按严重度排序返回。
 * **只诊断不改**——与 fact-audit 的 fatal 阻断严格区分。
 */
export function auditPresentationAntipatterns(course: MainlineCourse): AntipatternFinding[] {
  return course.scenes
    .flatMap((scene, sceneIndex) => [
        ...detectNearMissSlotKeys(scene),
        ...detectEmptyTypedSlots(scene),
        ...detectLayerDuplication(scene),
        ...detectIntroTitleDuplication(scene, course),
        ...detectSparseIntroMaster(scene, course),
      ].map(finding => ({ ...finding, sceneType: scene.sceneType, sceneNumber: sceneIndex + 1 })))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

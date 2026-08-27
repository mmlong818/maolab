/**
 * course-consistency · 纯本地跨页口径检查。
 *
 * 只比较同一知识点、同一语义标签的结构化内容；不会调用模型、访问数据库或
 * 修改课程。保守策略优先避免把不同题目的不同答案误判成冲突。
 */

import type { LessonScene, MainlineCourse } from '../domain.js'
import type { QualityIssue } from '../quality-gates.js'

type ConsistencyCategory = 'fact' | 'term' | 'mnemonic' | 'answer' | 'verdict'

export interface CourseConsistencyAuditResult {
  issues: QualityIssue[]
  auditedSceneIds: string[]
  conflictCount: number
}

interface ConsistencyAnchor {
  sceneId: string
  sceneIndex: number
  kpId: string
  category: ConsistencyCategory
  label: string
  value: string
  context?: string
}

const CONSISTENCY_CATEGORY_LABEL: Record<ConsistencyCategory, string> = {
  fact: '事实',
  term: '术语',
  mnemonic: '口诀',
  answer: '答案',
  verdict: '正误判断',
}

const CONTROLLED_ERROR_SLOT_PATTERN: Partial<Record<LessonScene['sceneType'], RegExp>> = {
  contrast: /^misconception$/,
  'ai-verify': /^aiClaim\d*$/,
}

const SOURCE_PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i
const QUESTION_SLOT_PATTERN = /^(?:task|question|prompt|stem|problem|statement|topic|题目|任务|问题|材料)$/i
const ANSWER_SLOT_PATTERN = /^(?:feedback|answer|result|solution|correction|答案|反馈|结果|解答|订正)$/i
const FORMULA_SLOT_PATTERN = /^(?:formula|equation|rule|公式|方程|法则)$/i
const MNEMONIC_SLOT_PATTERN = /^(?:mnemonic|口诀|助记)$/i
const TERM_SLOT_PATTERN = /^(?:definition|term|meaning|定义|术语|含义)$/i
const VERDICT_SLOT_PATTERN = /^(?:verdict|judgment|decision|正误|判定|判断)$/i
const GENERIC_LABEL_PATTERN = /^(?:feedback|answer|result|solution|correction|formula|equation|rule|definition|term|meaning|verdict|judgment|mnemonic|答案|反馈|结果|解答|订正|公式|方程|法则|定义|术语|含义|正误|判定|判断|口诀|助记)$/i
const CONTEXT_BOUND_LABEL_PATTERN = /(?:答案|结果|交点|坐标|定义域|取值|向量|顶点|本题|示例|函数|图象|表达式)|^(?:重力|支持力|压力|拉力|摩擦力|弹力|浮力|合力|牵引力|阻力|质量|速度|加速度|长度|面积|角度|数量|温度|时间|距离|高度|半径|直径|周长|体积)$/i
const LABELLED_VALUE_PATTERN = /(?:^|[\n；;])\s*([^：:=\n；;]{2,24})\s*[:：=]\s*([^\n；;]{1,160})/g
const NUMBER_WITH_UNIT_PATTERN = /[+-]?\d+(?:\.\d+)?(?:%|‰|℃|°|千米|公里|厘米|毫米|千克|克|米|秒|分钟|小时|年|世纪|年代|n|v|a|ω)?/gi
const FORMULA_SIGNAL_PATTERN = /[=≈<>±×÷+*/^]|\b(?:sin|cos|tan|log)\b/i

export function isControlledErrorSlot(sceneType: LessonScene['sceneType'], key: string): boolean {
  return CONTROLLED_ERROR_SLOT_PATTERN[sceneType]?.test(key) ?? false
}

export function sceneUsesControlledErrorSlots(sceneType: LessonScene['sceneType']): boolean {
  return CONTROLLED_ERROR_SLOT_PATTERN[sceneType] !== undefined
}

function normalizedConsistencyText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。；：、,.!?！？;:'"“”‘’（）()\[\]{}]/g, '')
}

function bigrams(text: string): Set<string> {
  const normalized = normalizedConsistencyText(text)
  const result = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2))
  }
  return result
}

function textSimilarity(left: string, right: string): number {
  const a = bigrams(left)
  const b = bigrams(right)
  if (a.size === 0 || b.size === 0) {
    return normalizedConsistencyText(left) === normalizedConsistencyText(right) ? 1 : 0
  }
  let overlap = 0
  for (const token of a) if (b.has(token)) overlap += 1
  return overlap / (a.size + b.size - overlap)
}

function numberTokens(text: string): string[] {
  return [...normalizedConsistencyText(text).matchAll(NUMBER_WITH_UNIT_PATTERN)].map(match => match[0]!).sort()
}

function sameTokens(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((token, index) => token === right[index])
}

function verdictPolarity(text: string): -1 | 0 | 1 {
  const normalized = normalizedConsistencyText(text)
  if (/不正确|错误|不成立|不是|并非|不能|无效|答错|判错/.test(normalized)) return -1
  if (/正确|成立|答对|判对/.test(normalized)) return 1
  if (/^(?:对|是|yes)$/.test(normalized)) return 1
  if (/^(?:错|否|no)$/.test(normalized)) return -1
  return 0
}

function directlyOpposed(left: string, right: string): boolean {
  const leftPolarity = verdictPolarity(left)
  const rightPolarity = verdictPolarity(right)
  if (leftPolarity !== 0 && rightPolarity !== 0 && leftPolarity !== rightPolarity) return true
  const stripPolarity = (text: string) => normalizedConsistencyText(text)
    .replace(/不正确|错误|不成立|不是|并非|不能|无效|正确|成立|可以|是|不|非/g, '')
  const leftNegative = /不|非|无|未|错误|错/.test(normalizedConsistencyText(left))
  const rightNegative = /不|非|无|未|错误|错/.test(normalizedConsistencyText(right))
  return leftNegative !== rightNegative && textSimilarity(stripPolarity(left), stripPolarity(right)) >= 0.72
}

function equivalentAnchorValue(left: string, right: string): boolean {
  const a = normalizedConsistencyText(left)
  const b = normalizedConsistencyText(right)
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b
  return shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.78
}

function looksLikeSemanticLabel(label: string): boolean {
  const trimmed = label.trim()
  if (!trimmed || /[\\()[\]{}]|\$|\^/.test(trimmed)) return false
  return /[\u3400-\u9fff]/u.test(trimmed) || GENERIC_LABEL_PATTERN.test(trimmed)
}

function categoryForLabel(label: string, value: string): ConsistencyCategory | undefined {
  if (MNEMONIC_SLOT_PATTERN.test(label) || /口诀|助记/.test(label)) return 'mnemonic'
  if (ANSWER_SLOT_PATTERN.test(label) || /答案|反馈|结果|解答|订正/.test(label)) return 'answer'
  if (VERDICT_SLOT_PATTERN.test(label) || /正误|判定|判断/.test(label)) return 'verdict'
  if (TERM_SLOT_PATTERN.test(label) || /定义|术语|含义/.test(label)) return 'term'
  if (FORMULA_SLOT_PATTERN.test(label) || /公式|方程|法则/.test(label)) return 'fact'
  return looksLikeSemanticLabel(label) && numberTokens(`${label}${value}`).length > 0 ? 'fact' : undefined
}

function comparableLabel(anchor: ConsistencyAnchor): string {
  // answer/feedback、definition/meaning 等是同一语义角色在不同幕型里的不同槽名。
  // 只把白名单内的通用槽名折叠到类别；教材中的显式事实标签仍逐字比较。
  return GENERIC_LABEL_PATTERN.test(anchor.label)
    ? `@${anchor.category}`
    : normalizedConsistencyText(anchor.label)
}

function contextForScene(scene: LessonScene): string | undefined {
  return Object.entries(scene.contentSlots).find(([key, value]) => QUESTION_SLOT_PATTERN.test(key) && value.trim())?.[1]
}

function containsLabelledValue(text: string): boolean {
  LABELLED_VALUE_PATTERN.lastIndex = 0
  return LABELLED_VALUE_PATTERN.test(text)
}

function consistencyAnchors(course: MainlineCourse): ConsistencyAnchor[] {
  const anchors: ConsistencyAnchor[] = []
  for (const [sceneIndex, scene] of course.scenes.entries()) {
    const context = contextForScene(scene)
    const visibleSlotValues: string[] = []
    for (const [key, rawValue] of Object.entries(scene.contentSlots)) {
      const value = rawValue.trim()
      if (!value || SOURCE_PLACEHOLDER_PATTERN.test(value) || isControlledErrorSlot(scene.sceneType, key)) continue
      visibleSlotValues.push(value)
      const category = categoryForLabel(key, value)
      // “反馈：答案：100℃”由内层“答案”锚点承载。再保留外层反馈锚点会把
      // 同一处矛盾重复计数；没有显式标签的普通结构槽仍按槽键比较。
      if (category && !containsLabelledValue(value)) {
        anchors.push({ sceneId: scene.id, sceneIndex, kpId: scene.kpId ?? 'course', category, label: key, value, ...(context ? { context } : {}) })
      }
    }
    const texts = [...scene.boardText, ...visibleSlotValues, scene.teacherScript]
    for (const text of texts) {
      LABELLED_VALUE_PATTERN.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = LABELLED_VALUE_PATTERN.exec(text)) !== null) {
        const label = match[1]!.trim()
        const value = match[2]!.trim()
        if (SOURCE_PLACEHOLDER_PATTERN.test(value)) continue
        const category = categoryForLabel(label, value)
        if (category) {
          anchors.push({ sceneId: scene.id, sceneIndex, kpId: scene.kpId ?? 'course', category, label, value, ...(context ? { context } : {}) })
        }
      }
    }
  }
  return anchors
}

function anchorsAreComparable(left: ConsistencyAnchor, right: ConsistencyAnchor): boolean {
  if (left.sceneId === right.sceneId || left.kpId !== right.kpId || left.category !== right.category) return false
  if (comparableLabel(left) !== comparableLabel(right)) return false
  const bothGeneric = GENERIC_LABEL_PATTERN.test(left.label) && GENERIC_LABEL_PATTERN.test(right.label)
  if (!bothGeneric) {
    if (!CONTEXT_BOUND_LABEL_PATTERN.test(left.label)) return true
    if (!left.context || !right.context) return false
    return textSimilarity(left.context, right.context) >= 0.88
  }
  if (left.category === 'mnemonic' || left.category === 'term') return true
  if (!left.context || !right.context) return false
  return textSimilarity(left.context, right.context) >= 0.88
}

function conflictSeverity(left: ConsistencyAnchor, right: ConsistencyAnchor): QualityIssue['severity'] | undefined {
  if (equivalentAnchorValue(left.value, right.value)) return undefined
  const leftNumbers = numberTokens(left.value)
  const rightNumbers = numberTokens(right.value)
  const numericConflict = leftNumbers.length > 0 && rightNumbers.length > 0 && !sameTokens(leftNumbers, rightNumbers)
  if (numericConflict || directlyOpposed(left.value, right.value)) return 'blocking'
  // 纯符号差异可能只是等价变形或不同记号；本地检查器不能证明哪一式错误。
  // 有数值反转仍在上面阻断，纯公式口径差异留给逐页事实核查或教师确认。
  if (left.category === 'fact' && FORMULA_SIGNAL_PATTERN.test(left.value) && FORMULA_SIGNAL_PATTERN.test(right.value)) return 'warning'
  if (left.category === 'mnemonic' || left.category === 'term') return 'warning'
  if (left.category === 'answer' && left.context && right.context && textSimilarity(left.context, right.context) >= 0.88) return 'warning'
  return undefined
}

function makeConsistencyIssue(
  earlier: ConsistencyAnchor,
  later: ConsistencyAnchor,
  severity: QualityIssue['severity'],
  sequence: number,
): QualityIssue {
  const label = normalizedConsistencyText(earlier.label) === normalizedConsistencyText(later.label)
    ? earlier.label
    : `${earlier.label} / ${later.label}`
  return {
    id: `pedagogy:scene:${later.sceneId}:consistency-${sequence + 1}`,
    gate: 'pedagogy',
    severity,
    targetType: 'scene',
    targetId: later.sceneId,
    relatedTargetIds: [earlier.sceneId, later.sceneId],
    message: `跨幕一致性核查 ${severity === 'blocking' ? 'FATAL' : 'MISLEADING'}:第 ${earlier.sceneIndex + 1} 页与第 ${later.sceneIndex + 1} 页的${CONSISTENCY_CATEGORY_LABEL[earlier.category]}冲突（标签「${label}」）「${earlier.value}」/「${later.value}」`,
    impact: `同一知识点、同一${earlier.label}在不同页面给出两套不能稳定合并的口径，学生无法判断课堂最终采用哪一套。`,
    fix: `对照教材和题目条件确认唯一口径，统一第 ${earlier.sceneIndex + 1}、${later.sceneIndex + 1} 页；不要只修改其中一处显示文本。`,
    autoFixable: false,
  }
}

/**
 * 只读、纯本地的整课口径检查。requestedSceneIds 用于单页复核：仍与整课比较，
 * 但只返回触及指定页面的冲突。
 */
export function auditLocalCourseConsistency(
  course: MainlineCourse,
  requestedSceneIds?: readonly string[],
): CourseConsistencyAuditResult {
  const sceneIds = new Set(course.scenes.map(scene => scene.id))
  const targetSceneIds = requestedSceneIds
    ? [...new Set(requestedSceneIds.filter(id => sceneIds.has(id)))]
    : course.scenes.map(scene => scene.id)
  if (targetSceneIds.length === 0) return { issues: [], auditedSceneIds: [], conflictCount: 0 }
  const targetSet = new Set(targetSceneIds)
  const anchors = consistencyAnchors(course)
  const issues: QualityIssue[] = []
  const seen = new Set<string>()
  for (let leftIndex = 0; leftIndex < anchors.length; leftIndex += 1) {
    const left = anchors[leftIndex]!
    for (let rightIndex = leftIndex + 1; rightIndex < anchors.length; rightIndex += 1) {
      const right = anchors[rightIndex]!
      if (!anchorsAreComparable(left, right)) continue
      if (!targetSet.has(left.sceneId) && !targetSet.has(right.sceneId)) continue
      const severity = conflictSeverity(left, right)
      if (!severity) continue
      const key = [left.sceneId, right.sceneId, left.category, comparableLabel(left)].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const earlier = left.sceneIndex <= right.sceneIndex ? left : right
      const later = earlier === left ? right : left
      issues.push(makeConsistencyIssue(earlier, later, severity, issues.length))
    }
  }
  return { issues, auditedSceneIds: targetSceneIds, conflictCount: issues.length }
}

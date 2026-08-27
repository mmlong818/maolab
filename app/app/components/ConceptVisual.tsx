'use client'

import type { CSSProperties, ReactNode } from 'react'
import EducationalVisual, { canRenderEducationalVisual, inferVisualSpecFromText } from './EducationalVisual.js'
import MathOrText from './MathOrText.js'
import {
  type ConceptVisualInput,
  EXACT_VISUAL_RE,
  AESTHETIC_RE,
  MOON_PHASE_RE,
  CHART_READING_RE,
  RELATIONSHIP_STRUCTURE_RE,
  METHOD_STRATEGY_RE,
  CONCEPT_COMPARISON_RE,
  PROCESS_FLOW_RE,
  SITUATION_APPLICATION_RE,
  MEMORY_RECALL_RE,
  VALUE_UNDERSTANDING_RE,
  ERROR_CORRECTION_RE,
  EXPERIMENT_OBSERVATION_RE,
  COMPREHENSIVE_TASK_RE,
  SUPPORTING_ILLUSTRATION_RE,
  visualText,
  isConceptDefinitionVisualText,
  shouldUseConceptVisual,
} from './concept-visual-triggers.js'

export { shouldUseConceptVisual } from './concept-visual-triggers.js'

const DECOR_FREE_ATOM_TYPES = new Set(['single-question', 'derivation-step', 'worked-example'])

const readableWrap: CSSProperties = {
  overflowWrap: 'break-word',
  wordBreak: 'normal',
  lineBreak: 'strict',
  hyphens: 'manual',
  textWrap: 'pretty',
}

const balancedWrap = {
  ...readableWrap,
  textWrap: 'balance',
} as CSSProperties

const PROTECTED_PHRASES = [
  '离太阳近到远',
  '四颗一组',
  '检索线索',
  '记忆对象',
  '提取练习',
  '复习句',
  '举头望明月',
  '低头思故乡',
  '诗句画面',
  '思乡情感',
  '交还饭卡',
  '价值判断',
  '材料证据',
  '具体行为',
  '尊重他人财物',
  '没人监督',
  '正确选择',
  '交给老师',
  '同样大小的两块方糖',
  '操作条件',
  '控制变量',
  '搅拌次数',
  '保持相同',
  '一杯热水',
  '一杯冷水',
  '可见现象',
  '更快变小',
  '更快消失',
  '还剩一小块',
  '水温会影响',
  '溶解快慢',
  '热水中溶解更快',
  '图表结构',
  '四个月阅读人数变化',
  '横轴是月份',
  '纵轴是人数',
  '当前数据',
  '四月最高',
  '关系趋势',
  '逐月上升',
  '持续上升',
  '从一月到四月',
  '柱子越来越高',
  '图表证据',
  '阅读人数越来越多',
  '校园节水海报',
  '最终海报',
  '作品标准',
  '一个数据证据',
  '一个节水观点',
  '一个可执行行动建议',
  '知识点分工',
  '数据证据',
  '节水观点',
  '行动建议',
  '统计图负责',
  '节水知识负责',
  '表达方法负责',
  '合成步骤',
  '先放标题和数据证据',
  '再写观点',
  '最显眼的位置',
  '检查清单',
  '符合海报标准',
].sort((a, b) => b.length - a.length)

const PROTECTED_SPLIT = new RegExp(`(${PROTECTED_PHRASES.map(escapeRegExp).join('|')})`, 'g')

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ProtectedText({ children }: { children: string }) {
  const parts = children.split(PROTECTED_SPLIT).filter(Boolean)
  return (
    <>
      {parts.map((part, index) => (
        PROTECTED_PHRASES.includes(part)
          ? <span key={`${part}-${index}`} style={{ whiteSpace: 'nowrap' }}><MathOrText>{part}</MathOrText></span>
          : <MathOrText key={`${part}-${index}`}>{part}</MathOrText>
      ))}
    </>
  )
}

export type VisualPolicyMode = 'structured' | 'supporting' | 'none'

export function visualPolicyFor(input: ConceptVisualInput & { atomType?: string | undefined }): {
  mode: VisualPolicyMode
  reason: string
} {
  const text = visualText(input)
  const compactTextLength = Array.from(text.replace(/\s+/g, '')).length
  const canUseSceneDecor = input.atomType === 'dialogue-turn' || input.atomType === 'recap-bullet' || input.atomType === 'single-example'
  if (canUseSceneDecor && SUPPORTING_ILLUSTRATION_RE.test(text) && compactTextLength <= 110 && !EXACT_VISUAL_RE.test(text) && !CHART_READING_RE.test(text) && !EXPERIMENT_OBSERVATION_RE.test(text) && !COMPREHENSIVE_TASK_RE.test(text)) {
    return { mode: 'supporting', reason: '对白、回顾和小例子中的场景图只做低干扰提示，不替代教学主体。' }
  }
  if (shouldUseConceptVisual(input)) {
    return { mode: 'structured', reason: '精确概念、关系、步骤、标准或证据需要系统结构图承载。' }
  }
  if (input.atomType && DECOR_FREE_ATOM_TYPES.has(input.atomType)) {
    return { mode: 'none', reason: '题页、推导页和范例页优先保护文字、公式、选项与反馈，不放辅助配图。' }
  }
  if (SUPPORTING_ILLUSTRATION_RE.test(text) && compactTextLength <= 110) {
    return { mode: 'supporting', reason: '场景、人物或故事性内容可以使用低干扰辅助配图增强画面。' }
  }
  return { mode: 'none', reason: '当前内容以文字或结构信息为主，配图容易分散注意力。' }
}

export default function ConceptVisual({ input, compact = false }: { input: ConceptVisualInput; compact?: boolean }) {
  const text = visualText(input)
  const decorImageUrl = input.decorImageUrl
  const isIsoscelesText = /(等腰三角形|等边对等角|底角|顶角|AB\s*=\s*AC|全等|角平分线|辅助线|几何证明)/.test(text)
  // canRender 守卫: 未接入渲染器的 spec kind(如 supporting-illustration)不能
  // 把内部占位文案亮给学生, 交给下方模板链兜底
  if (input.visualSpec && canRenderEducationalVisual(input.visualSpec)) {
    return <EducationalVisual spec={input.visualSpec} compact={compact} />
  }
  // 生成期显式标注优先: LLM 按认知动作选定的类型比关键词正则可靠
  // (正则会被跨类词汇误触发, 2026-07-06 真检抓到活案例)。命不中映射再走正则链。
  if (input.contentType) {
    const explicit = renderByContentType(input.contentType, { title: input.title || input.caption || input.narration || '概念图示', text, compact, decorImageUrl })
    if (explicit) return explicit
  }
  const inferredVisualSpec = inferVisualSpecFromText(text)
  if (!isIsoscelesText && (inferredVisualSpec?.kind === 'experiment-board' || inferredVisualSpec?.kind === 'worked-example-board')) {
    return <EducationalVisual spec={inferredVisualSpec} compact={compact} />
  }
  const title = input.title || input.caption || input.narration || '概念图示'
  if (/1\.1\s*(\\text\{m\/s\}|m\/s)|每.*1\s*秒.*1\.1\s*米/.test(text)) {
    return <SpeedMeaningVisual compact={compact} />
  }
  if (/1\s*(\\text\{m\/s\}|m\/s)\s*=\s*3\.6\s*(\\text\{km\/h\}|km\/h)|3\.6/.test(text)) {
    return <UnitConvertVisual compact={compact} />
  }
  if (/v\s*=\s*\\frac\{s\}\{t\}|v\s*=\s*s\s*\/\s*t|速度.*路程.*时间/.test(text)) {
    return <SpeedFormulaVisual compact={compact} />
  }
  if (isIsoscelesText) {
    return <IsoscelesTriangleVisual text={text} compact={compact} />
  }
  if (MOON_PHASE_RE.test(text)) {
    return <MoonPhaseVisual title={title} text={text} compact={compact} />
  }
  if (isConceptDefinitionVisualText(text)) {
    return <ConceptDefinitionVisual title={title} text={text} compact={compact} />
  }
  if (VALUE_UNDERSTANDING_RE.test(text)) {
    return <ValueUnderstandingVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
  }
  if (COMPREHENSIVE_TASK_RE.test(text)) {
    return <ComprehensiveTaskVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
  }
  if (EXPERIMENT_OBSERVATION_RE.test(text)) {
    return <ExperimentObservationVisual title={title} text={text} compact={compact} />
  }
  if (MEMORY_RECALL_RE.test(text)) {
    return <MemoryRecallVisual title={title} text={text} compact={compact} />
  }
  if (METHOD_STRATEGY_RE.test(text)) {
    return <MethodStrategyVisual title={title} text={text} compact={compact} />
  }
  if (CONCEPT_COMPARISON_RE.test(text)) {
    return <ConceptComparisonVisual title={title} text={text} compact={compact} />
  }
  if (AESTHETIC_RE.test(text)) {
    return <AestheticVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
  }
  if (SITUATION_APPLICATION_RE.test(text)) {
    return <SituationApplicationVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
  }
  if (PROCESS_FLOW_RE.test(text)) {
    return <ProcessFlowVisual title={title} text={text} compact={compact} />
  }
  if (ERROR_CORRECTION_RE.test(text)) {
    return <ErrorCorrectionVisual text={text} compact={compact} />
  }
  // 只有能从原文抽到"组成/节点/要素"标记时才用关系结构模板——否则四个面板全落
  // 生态系统默认值(植物/动物/土壤/阳光), 化学灭火页会渲染出生物生态图穿帮
  // (2026-07-06 真检: "指向"一词误触发本分支)。抽不到就交给通用概念图。
  if (RELATIONSHIP_STRUCTURE_RE.test(text) && /(组成|节点|要素|部分)[:：]/.test(text)) {
    return <RelationshipStructureVisual title={title} text={text} compact={compact} />
  }
  if (CHART_READING_RE.test(text)) {
    return <ChartReadingVisual title={title} text={text} compact={compact} />
  }
  if (/相同时间|相同路程|统一标准|比较/.test(text)) {
    return <ComparisonVisual title={title} compact={compact} />
  }
  return <GenericConceptVisual title={title} text={text} compact={compact} />
}

/**
 * 显式 contentType → 承载模板。返回 null 表示该类型没有专属模板或
 * 抽取守卫不满足(防硬编码默认值穿帮), 交回正则链/通用图兜底。
 * C04(公式)与 C07(例题)保持 null: 它们有更精确的专用路径
 * (speed/unit/formula 专图与 worked-example-board)。
 */
function renderByContentType(
  contentType: import('@maolab/shared-types').TeachingContentTypeId,
  ctx: { title: string; text: string; compact: boolean; decorImageUrl?: string | undefined },
): ReactNode | null {
  const { title, text, compact, decorImageUrl } = ctx
  switch (contentType) {
    case 'C01': return <ConceptDefinitionVisual title={title} text={text} compact={compact} />
    case 'C02': return <ConceptComparisonVisual title={title} text={text} compact={compact} />
    case 'C03': return /(组成|节点|要素|部分)[:：]/.test(text)
      ? <RelationshipStructureVisual title={title} text={text} compact={compact} />
      : null
    case 'C05': return <ProcessFlowVisual title={title} text={text} compact={compact} />
    case 'C06': return <MethodStrategyVisual title={title} text={text} compact={compact} />
    case 'C08': return <ErrorCorrectionVisual text={text} compact={compact} />
    case 'C09': return <SituationApplicationVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
    case 'C10': return <MemoryRecallVisual title={title} text={text} compact={compact} />
    case 'C11': return <AestheticVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
    case 'C12': return <ValueUnderstandingVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
    case 'C13': return <ExperimentObservationVisual title={title} text={text} compact={compact} />
    case 'C14': return <ChartReadingVisual title={title} text={text} compact={compact} />
    case 'C15': return <ComprehensiveTaskVisual title={title} text={text} compact={compact} decorImageUrl={decorImageUrl} />
    default: return null
  }
}

// 注意: 这串文本里混着 prompt(版式方法论文案, 只用于模板路由)。
// 所有 pick*Part 提取正则必须要求冒号标记([:：]非可选), 否则"局部意象、情绪词…"
// 这类方法论句子会被截半句当学生可见面板内容(2026-07-03 真实检查发现)。
function Frame({ label, children, compact = false }: { label: string; children: ReactNode; compact?: boolean | undefined }) {
  return (
    <div data-visual-role="structured-visual" aria-label={label || undefined} style={{
      ...readableWrap,
      width: '100%',
      height: '100%',
      minHeight: compact ? 240 : 420,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: compact ? 16 : 28,
      padding: compact ? 20 : 40,
      boxSizing: 'border-box',
      borderRadius: 18,
      background: '#f8fafc',
      border: '1px solid #dbe4ee',
    }}>
      {children}
    </div>
  )
}

function SpeedFormulaVisual({ compact }: { compact?: boolean }) {
  const isCompact = Boolean(compact)
  const dense = true
  const distance = compact ? '3.3 m' : '路程 s = 3.3 m'
  const time = compact ? '3 s' : '时间 t = 3 s'
  const speed = compact ? '1.1 m/s' : '速度 v = 1.1 m/s'
  return (
    <Frame label="速度公式" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.4fr 0.9fr', gap: compact ? 14 : 20, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', minHeight: compact ? 112 : 154, borderRadius: 18, background: '#ffffff', border: '1px solid #dbe4ee', overflow: 'hidden', padding: compact ? 14 : 18 }}>
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: compact ? 34 : 48, height: 8, borderRadius: 999, background: '#dbeafe' }} />
          <div style={{ position: 'absolute', left: compact ? 26 : 36, bottom: compact ? 46 : 66, width: compact ? 22 : 34, height: compact ? 22 : 34, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', left: compact ? 32 : 45, bottom: compact ? 18 : 30, width: compact ? 8 : 12, height: compact ? 30 : 44, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', left: compact ? 22 : 34, bottom: compact ? 12 : 20, width: compact ? 44 : 68, height: 4, borderRadius: 999, background: '#0f172a', transform: 'rotate(-14deg)', transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', left: compact ? 30 : 46, bottom: compact ? 10 : 18, width: compact ? 42 : 64, height: 4, borderRadius: 999, background: '#0f172a', transform: 'rotate(17deg)', transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', left: compact ? 86 : 126, right: compact ? 36 : 62, bottom: compact ? 60 : 90, height: 3, background: '#2563eb' }} />
          <div style={{ position: 'absolute', right: compact ? 34 : 60, bottom: compact ? 54 : 84, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '13px solid #2563eb' }} />
          <div style={{ position: 'absolute', left: compact ? 90 : 132, right: compact ? 48 : 80, bottom: compact ? 68 : 104, textAlign: 'center', color: '#2563eb', fontSize: compact ? 15 : 20, fontWeight: 900 }}>{distance}</div>
          <div style={{ position: 'absolute', left: compact ? 18 : 26, bottom: compact ? 8 : 14, color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 800 }}>起点</div>
          <div style={{ position: 'absolute', right: compact ? 18 : 26, bottom: compact ? 8 : 14, color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 800 }}>终点</div>
        </div>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: compact ? 10 : 14 }}>
          <QuantityCard color="#d97706" title={time} body="用了多久" compact={dense} />
          <QuantityCard color="#059669" title={speed} body="每秒走多远" compact={dense} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: compact ? 10 : 14 }}>
        <div style={{ height: 2, flex: 1, background: '#bfdbfe' }} />
        <div style={{ fontSize: compact ? 26 : 38, color: '#111827', fontWeight: 900 }}>v = s / t</div>
        <div style={{ height: 2, flex: 1, background: '#bfdbfe' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: compact ? 8 : 12 }}>
        <MiniFormulaPart color="#2563eb" title="s 路程" body="走了多远" compact={dense} />
        <div style={{ fontSize: compact ? 20 : 24, color: '#0f172a', fontWeight: 900 }}>÷</div>
        <MiniFormulaPart color="#d97706" title="t 时间" body="用了多久" compact={dense} />
        <div style={{ fontSize: compact ? 20 : 24, color: '#0f172a', fontWeight: 900 }}>=</div>
        <MiniFormulaPart color="#059669" title="v 速度" body="每秒走多远" compact={dense} />
      </div>
    </Frame>
  )
}

function SpeedMeaningVisual({ compact }: { compact?: boolean }) {
  return (
    <Frame label="速度数值的物理意义" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.35fr 0.65fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', minHeight: compact ? 132 : 190, borderRadius: 18, background: '#ffffff', border: '1px solid #dbe4ee', overflow: 'hidden', padding: compact ? 14 : 22 }}>
          <div style={{ position: 'absolute', left: compact ? 22 : 34, right: compact ? 26 : 44, bottom: compact ? 40 : 58, height: 7, borderRadius: 999, background: '#cbd5e1' }} />
          <div style={{ position: 'absolute', left: compact ? 34 : 52, bottom: compact ? 58 : 82, width: compact ? 20 : 30, height: compact ? 20 : 30, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', left: compact ? 40 : 61, bottom: compact ? 29 : 44, width: compact ? 8 : 12, height: compact ? 31 : 45, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', left: compact ? 29 : 48, bottom: compact ? 25 : 39, width: compact ? 44 : 64, height: 4, borderRadius: 999, background: '#0f172a', transform: 'rotate(-16deg)', transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', left: compact ? 38 : 60, bottom: compact ? 23 : 35, width: compact ? 46 : 68, height: 4, borderRadius: 999, background: '#0f172a', transform: 'rotate(18deg)', transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', left: compact ? 102 : 150, right: compact ? 48 : 74, bottom: compact ? 74 : 108, height: 3, background: '#2563eb' }} />
          <div style={{ position: 'absolute', right: compact ? 45 : 70, bottom: compact ? 68 : 102, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '13px solid #2563eb' }} />
          <div style={{ position: 'absolute', left: compact ? 104 : 152, right: compact ? 62 : 96, bottom: compact ? 82 : 122, textAlign: 'center', color: '#2563eb', fontSize: compact ? 16 : 22, fontWeight: 900 }}>1.1 米</div>
          <div style={{ position: 'absolute', left: compact ? 28 : 44, bottom: compact ? 10 : 16, color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 800 }}>这一秒开始</div>
          <div style={{ position: 'absolute', right: compact ? 20 : 32, bottom: compact ? 10 : 16, color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 800 }}>这一秒结束</div>
        </div>
        <div style={{ display: 'grid', alignContent: 'center', gap: compact ? 10 : 14 }}>
          <div style={{ justifySelf: 'center', width: compact ? 58 : 82, height: compact ? 58 : 82, borderRadius: 999, border: '6px solid #d97706', position: 'relative', background: '#fff' }}>
            <div style={{ position: 'absolute', left: '50%', top: compact ? 11 : 16, width: 4, height: compact ? 18 : 26, background: '#d97706', transformOrigin: 'bottom center', transform: 'translateX(-50%) rotate(20deg)', borderRadius: 999 }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: compact ? 18 : 26, height: 4, background: '#d97706', transformOrigin: 'left center', transform: 'rotate(0deg)', borderRadius: 999 }} />
          </div>
          <div style={{ textAlign: 'center', color: '#d97706', fontSize: compact ? 18 : 26, fontWeight: 900 }}>每 1 秒</div>
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: compact ? 13 : 18, fontWeight: 800 }}>看一次前进距离</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: compact ? 22 : 32, fontWeight: 900, color: '#0f172a' }}>
        <MathOrText>{'1.1 m/s = 每 1 秒前进 1.1 米'}</MathOrText>
      </div>
    </Frame>
  )
}

function UnitConvertVisual({ compact }: { compact?: boolean }) {
  return (
    <Frame label="单位换算" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: compact ? 16 : 30 }}>
        <BigUnit value="1 m/s" desc="每秒 1 米" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: compact ? 18 : 24, color: '#475569', fontWeight: 800 }}>乘以 3.6</div>
          <Arrow />
        </div>
        <BigUnit value="3.6 km/h" desc="每小时 3.6 千米" />
      </div>
      <div style={{ textAlign: 'center', fontSize: compact ? 17 : 22, color: '#475569' }}>数值改变，表示的运动快慢不变</div>
    </Frame>
  )
}

export type IsoscelesTriangleVisualMode = 'property' | 'proof' | 'application' | 'boundary'

export function isoscelesTriangleModeForText(text: string): IsoscelesTriangleVisualMode {
  if (/(作高|辅助线|AD|HL|全等|Rt△|证明|直角|公共边)/.test(text)) return 'proof'
  if (/(求|度数|内角和|40°|50°|70°|80°|方程|计算)/.test(text)) return 'application'
  if (/(看着像|视觉|没有\s*AB\s*=\s*AC|不能|反向|错误|错因|修正|陷阱)/.test(text)) return 'boundary'
  return 'property'
}

function IsoscelesTriangleVisual({ text, compact }: { text: string; compact?: boolean }) {
  const mode = isoscelesTriangleModeForText(text)
  const isCompact = Boolean(compact)
  const leftTitle = mode === 'proof'
    ? '证明图：主体一直保留'
    : mode === 'application'
      ? '计算图：先定等角'
      : mode === 'boundary'
        ? '边界图：没有条件不下结论'
        : '性质图：边相等推出角相等'
  const sideCards: Array<[string, string, string]> = mode === 'proof'
    ? [
        ['#2563eb', '已知条件', 'AB = AC，两条腰相等'],
        ['#d97706', '辅助线', '作 AD ⟂ BC，把大三角形分成两个直角三角形'],
        ['#059669', '证明目标', '由全等推出 ∠B = ∠C'],
      ]
    : mode === 'application'
      ? [
          ['#2563eb', '第一步', 'AB = AC，所以 ∠B = ∠C'],
          ['#d97706', '第二步', '用内角和：顶角 + 两个底角 = 180°'],
          ['#059669', '结论', '先找相等角，再计算角度'],
        ]
      : mode === 'boundary'
        ? [
            ['#dc2626', '不能只看图', '看着像等腰，不等于题目给了 AB = AC'],
            ['#d97706', '不能反推', '只给 ∠B = ∠C 时，不是本节“等边对等角”的方向'],
            ['#059669', '正确启动', '看到 AB = AC，才能推出 ∠B = ∠C'],
          ]
        : [
            ['#2563eb', '条件', 'AB = AC：两条腰相等'],
            ['#059669', '结论', '∠B = ∠C：两个底角相等'],
            ['#7c3aed', '读法', '边的相等关系，对应到它们所对的角'],
          ]
  return (
    <Frame label="等腰三角形结构图" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.2fr 0.8fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', minHeight: compact ? 250 : 360, borderRadius: 18, background: '#ffffff', border: '1px solid #dbe4ee', overflow: 'hidden', padding: compact ? 12 : 18 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 13 : 18, fontWeight: 950, letterSpacing: 2, marginBottom: compact ? 6 : 10 }}>{leftTitle}</div>
          <IsoscelesSvg mode={mode} compact={isCompact} />
          {mode === 'proof' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: compact ? 6 : 8, marginTop: compact ? 4 : 8 }}>
              <ProofLegendChip color="#d97706" text="AD ⟂ BC" compact={isCompact} />
              <ProofLegendChip color="#2563eb" text="△ABD" compact={isCompact} />
              <ProofLegendChip color="#059669" text="△ACD" compact={isCompact} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          {sideCards.map(([color, title, body]) => (
            <QuantityCard key={title} color={color} title={title} body={body} compact={isCompact} />
          ))}
        </div>
      </div>
    </Frame>
  )
}

function IsoscelesSvg({ mode, compact }: { mode: IsoscelesTriangleVisualMode; compact: boolean }) {
  const showProof = mode === 'proof'
  const showApplication = mode === 'application'
  const showBoundary = mode === 'boundary'
  const sideStroke = showBoundary ? '#94a3b8' : '#2563eb'
  const equalStroke = showBoundary ? '#cbd5e1' : '#f97316'
  const angleStroke = showBoundary ? '#cbd5e1' : '#059669'
  const w = 420
  const h = compact ? 250 : 286
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="等腰三角形教学图示" style={{ width: '100%', height: compact ? 210 : 300, display: 'block' }}>
      <defs>
        <marker id="iso-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4.5 L0,9 Z" fill="#64748b" />
        </marker>
      </defs>
      <polygon points="210,28 70,232 350,232" fill={showBoundary ? '#f8fafc' : '#eff6ff'} stroke={sideStroke} strokeWidth="7" strokeLinejoin="round" />
      {showProof && <polygon points="210,28 70,232 210,232" fill="rgba(37,99,235,0.10)" stroke="none" />}
      {showProof && <polygon points="210,28 210,232 350,232" fill="rgba(5,150,105,0.10)" stroke="none" />}
      {!showBoundary && <EqualSideTicks />}
      {!showBoundary && <BaseAngleMarks stroke={angleStroke} />}
      {showProof && <ProofMarks />}
      {showApplication && <ApplicationMarks />}
      {showBoundary && <BoundaryMarks />}
      <PointLabel x={210} y={28} label="A" color="#2563eb" />
      <PointLabel x={70} y={232} label="B" color="#059669" />
      <PointLabel x={350} y={232} label="C" color="#059669" />
      {showProof && <PointLabel x={210} y={232} label="D" color="#d97706" />}
      {!showProof && !showBoundary && !showApplication && <text x="210" y="270" textAnchor="middle" fill="#334155" fontSize="18" fontWeight="900">AB = AC  →  ∠B = ∠C</text>}
      {showBoundary && <text x="210" y="270" textAnchor="middle" fill="#dc2626" fontSize="18" fontWeight="900">缺少 AB = AC，不能只凭外观看出结论</text>}
    </svg>
  )
}

function EqualSideTicks() {
  return (
    <>
      <line x1="129" y1="120" x2="151" y2="135" stroke="#f97316" strokeWidth="6" strokeLinecap="round" />
      <line x1="291" y1="120" x2="269" y2="135" stroke="#f97316" strokeWidth="6" strokeLinecap="round" />
      <text x="130" y="96" fill="#f97316" fontSize="20" fontWeight="950">AB</text>
      <text x="270" y="96" fill="#f97316" fontSize="20" fontWeight="950">AC</text>
    </>
  )
}

function BaseAngleMarks({ stroke }: { stroke: string }) {
  return (
    <>
      <path d="M98 232 A34 34 0 0 1 89 202" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M322 232 A34 34 0 0 0 331 202" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
      <text x="112" y="214" fill={stroke} fontSize="19" fontWeight="950">∠B</text>
      <text x="269" y="214" fill={stroke} fontSize="19" fontWeight="950">∠C</text>
    </>
  )
}

function ProofMarks() {
  return (
    <>
      <line x1="210" y1="28" x2="210" y2="232" stroke="#d97706" strokeWidth="5" strokeDasharray="10 9" />
      <path d="M210 210 L232 210 L232 232" fill="none" stroke="#d97706" strokeWidth="4" />
      <path d="M188 232 L188 210 L210 210" fill="none" stroke="#d97706" strokeWidth="4" />
    </>
  )
}

function ProofLegendChip({ color, text, compact }: { color: string; text: string; compact: boolean }) {
  return (
    <div style={{
      minWidth: 0,
      borderRadius: 999,
      background: `${color}10`,
      border: `1px solid ${color}44`,
      color,
      fontSize: compact ? 12 : 14,
      fontWeight: 950,
      lineHeight: 1,
      padding: compact ? '7px 6px' : '9px 8px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    }}>
      <MathOrText>{text}</MathOrText>
    </div>
  )
}

function ApplicationMarks() {
  return (
    <>
      <text x="210" y="76" textAnchor="middle" fill="#7c3aed" fontSize="21" fontWeight="950">40°</text>
      <text x="116" y="216" fill="#059669" fontSize="23" fontWeight="950">x</text>
      <text x="287" y="216" fill="#059669" fontSize="23" fontWeight="950">x</text>
      <line x1="126" y1="254" x2="294" y2="254" stroke="#64748b" strokeWidth="3" markerEnd="url(#iso-arrow)" />
      <text x="210" y="282" textAnchor="middle" fill="#334155" fontSize="18" fontWeight="900">40° + x + x = 180°</text>
    </>
  )
}

function BoundaryMarks() {
  return (
    <>
      <line x1="118" y1="116" x2="151" y2="136" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
      <line x1="151" y1="116" x2="118" y2="136" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
      <text x="210" y="132" textAnchor="middle" fill="#dc2626" fontSize="18" fontWeight="950">没有等边标记</text>
      <text x="210" y="160" textAnchor="middle" fill="#64748b" fontSize="16" fontWeight="850">不能推出 ∠B = ∠C</text>
    </>
  )
}

function PointLabel({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="16" fill="#ffffff" stroke={color} strokeWidth="4" />
      <text x={x} y={y + 6} textAnchor="middle" fill={color} fontSize="17" fontWeight="950">{label}</text>
    </g>
  )
}

function ComparisonVisual({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <Frame label="比较方法" compact={compact}>
      <div style={{ textAlign: 'center', fontSize: compact ? 22 : 34, color: '#0f172a', fontWeight: 900 }}>{cleanTitle(title)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 12 : 24 }}>
        <MethodCard title="相同时间" body="比谁走得更远" />
        <MethodCard title="相同路程" body="比谁用时更短" />
      </div>
      <div style={{ textAlign: 'center', color: '#2563eb', fontSize: compact ? 18 : 24, fontWeight: 800 }}>不同路程、不同时间时，用速度统一比较</div>
    </Frame>
  )
}

function ErrorCorrectionVisual({ text, compact }: { text: string; compact?: boolean }) {
  const isCompact = Boolean(compact)
  const wrong = pickErrorPart(text, /(错误|错答|误区)[:：]([^；。\n]+)/, '错误答案')
  const cause = pickErrorPart(text, /(错因|原因)[:：]([^；。\n]+)/, '错因')
  const fix = pickErrorPart(text, /(修正|改法)[:：]([^；。\n]+)/, '修正动作')
  const verify = pickErrorPart(text, /(验证|检查)[:：]([^；。\n]+)/, '验证')
  return (
    <Frame label="纠错图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr auto 1fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <CorrectionPanel color="#dc2626" mark="×" title="先保留原错误" body={wrong} compact={isCompact} />
        {!compact && <div style={{ display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 28, fontWeight: 900 }}>→</div>}
        <CorrectionPanel color="#d97706" mark="!" title="指出错因" body={cause} compact={isCompact} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr auto 1fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <CorrectionPanel color="#059669" mark="✓" title="给修正动作" body={fix} compact={isCompact} />
        {!compact && <div style={{ display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 28, fontWeight: 900 }}>→</div>}
        <CorrectionPanel color="#2563eb" mark="↺" title="回到原题验证" body={verify} compact={isCompact} />
      </div>
    </Frame>
  )
}

function CorrectionPanel({ color, mark, title, body, compact }: { color: string; mark: string; title: string; body: string; compact?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `2px solid ${color}33`, borderRadius: 16, padding: compact ? '12px 14px' : '18px 20px', minHeight: compact ? 74 : 112 }}>
      <div style={{ display: 'flex', gap: compact ? 10 : 14, alignItems: 'center' }}>
        <div style={{ width: compact ? 30 : 42, height: compact ? 30 : 42, borderRadius: 999, background: `${color}18`, color, border: `2px solid ${color}55`, display: 'grid', placeItems: 'center', fontSize: compact ? 17 : 24, fontWeight: 950, flexShrink: 0 }}>{mark}</div>
        <div>
          <div data-line-role="card" style={{ ...balancedWrap, color, fontSize: compact ? 15 : 20, fontWeight: 950 }}>{title}</div>
          <div data-line-role="card" style={{ ...balancedWrap, marginTop: 5, color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 750 }}>{body}</div>
        </div>
      </div>
    </div>
  )
}

function pickErrorPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[2]?.trim() || fallback
}

function AestheticVisual({ title, text, compact, decorImageUrl }: { title: string; text: string; compact?: boolean; decorImageUrl?: string | undefined }) {
  const poemLine = pickAestheticPart(text, /(诗句|原句)[:：]([^；。\n]+)/, cleanTitle(title))
  const image = pickAestheticPart(text, /(意象|画面|景物)[:：]([^；。\n]+)/, '先看见画面')
  const feeling = pickAestheticPart(text, /(情绪|情感|感受|心情)[:：]([^；。\n]+)/, '再说出心情')
  const voice = pickAestheticPart(text, /(表达|出口|自己的话)[:：]([^；。\n]+)/, '用自己的话说依据')
  const isCompact = Boolean(compact)
  const rhythmParts = splitPoemRhythm(poemLine)
  return (
    <Frame label="审美感受图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.05fr 0.95fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 18, padding: compact ? '16px 18px' : '22px 30px', display: 'grid', alignContent: 'center', gap: compact ? 10 : 14, minHeight: compact ? 170 : 300, overflow: 'hidden', position: 'relative' }}>
          <MoonScene compact={isCompact} decorImageUrl={decorImageUrl} />
          <div style={{ color: '#7c3aed', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>诗句主体</div>
          <div style={{ color: '#111827', fontSize: compact ? 24 : 38, lineHeight: 1.28, fontWeight: 950, textAlign: 'center', position: 'relative', zIndex: 1 }}><MathOrText>{poemLine}</MathOrText></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: compact ? 8 : 12, position: 'relative', zIndex: 1 }}>
            {rhythmParts.map((part, index) => (
              <RhythmChip key={`${part}-${index}`} text={part} compact={isCompact} />
            ))}
          </div>
          <div style={{ height: 1, background: '#ede9fe' }} />
          <div style={{ color: '#64748b', fontSize: compact ? 13 : 18, lineHeight: 1.5 }}>先保留原诗句，再从画面和情绪里读出味道。</div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#2563eb" title="看见意象" body={image} compact={isCompact} />
          <AestheticPanel color="#7c3aed" title="读出节奏" body="举头/望明月，低头/思故乡" compact={isCompact} />
          <AestheticPanel color="#d97706" title="说出情绪" body={feeling} compact={isCompact} />
          <AestheticPanel color="#059669" title="学生表达" body={voice} compact={isCompact} />
        </div>
      </div>
    </Frame>
  )
}

function MoonScene({ compact, decorImageUrl }: { compact?: boolean; decorImageUrl?: string | undefined }) {
  return (
    <div aria-hidden style={{ position: 'relative', height: compact ? 58 : 92, borderRadius: 16, background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)', border: '1px solid #dbeafe', overflow: 'hidden' }}>
      {decorImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={decorImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <>
          <div style={{ position: 'absolute', right: compact ? 26 : 42, top: compact ? 10 : 16, width: compact ? 26 : 38, height: compact ? 26 : 38, borderRadius: 999, background: '#fef3c7', boxShadow: '0 0 0 10px rgba(254, 243, 199, 0.45)' }} />
          <div style={{ position: 'absolute', left: compact ? 18 : 30, right: compact ? 20 : 36, bottom: compact ? 16 : 24, height: 2, background: '#bfdbfe' }} />
          <div style={{ position: 'absolute', left: compact ? 36 : 58, bottom: compact ? 17 : 25, width: compact ? 18 : 26, height: compact ? 18 : 26, borderRadius: '50% 50% 44% 44%', background: '#1f2937' }} />
          <div style={{ position: 'absolute', left: compact ? 42 : 66, bottom: compact ? 0 : 2, width: compact ? 7 : 10, height: compact ? 22 : 32, borderRadius: 999, background: '#1f2937' }} />
          <div style={{ position: 'absolute', left: compact ? 68 : 102, bottom: compact ? 23 : 36, width: compact ? 58 : 86, height: 2, background: '#93c5fd', transform: 'rotate(-10deg)', transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', left: compact ? 12 : 20, top: compact ? 12 : 18, color: '#2563eb', fontSize: compact ? 12 : 14, fontWeight: 900, letterSpacing: 2 }}>月夜镜头</div>
        </>
      )}
    </div>
  )
}

function RhythmChip({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 5 : 7, padding: compact ? '5px 8px' : '7px 10px', borderRadius: 999, background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.22)', color: '#5b21b6', fontSize: compact ? 12 : 18, fontWeight: 900 }}>
      <span>{text}</span>
      <span style={{ width: compact ? 5 : 7, height: compact ? 5 : 7, borderRadius: 999, background: '#d97706' }} />
    </div>
  )
}

function splitPoemRhythm(text: string): string[] {
  // 节奏 chips 只适合真正的诗句(短、无叹问号); 指令句/长讲解切出来会是"低"这类断字, 不如不切
  if (/[！？!?]/.test(text) || text.replace(/\s+/g, '').length > 16) return []
  const cleaned = text.replace(/[。]/g, '').trim()
  const parts = cleaned.split(/[，,、]/).map(part => part.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [cleaned || '读出停顿']
}

function AestheticPanel({ color, title, body, compact }: { color: string; title: string; body: string; compact?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `2px solid ${color}30`, borderRadius: 16, padding: compact ? '12px 14px' : '18px 20px', display: 'grid', gap: 5 }}>
      <div data-line-role="card" style={{ ...balancedWrap, color, fontSize: compact ? 15 : 20, fontWeight: 950 }}><ProtectedText>{title}</ProtectedText></div>
      <div data-line-role="card" style={{ ...balancedWrap, color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 750 }}><ProtectedText>{body}</ProtectedText></div>
    </div>
  )
}

function pickAestheticPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[2]?.trim() || fallback
}

function RelationshipStructureVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const subject = pickRelationPart(text, /(主体|系统|整体)[:：]([^；。\n]+)/, cleanTitle(title))
  const nodes = pickRelationPart(text, /(组成|节点|要素|部分)[:：]([^；。\n]+)/, '植物、动物、土壤、阳光')
  const link = pickRelationPart(text, /(关系|连接|因果|联系)[:：]([^；。\n]+)/, '植物给动物提供食物，动物影响土壤')
  const direction = pickRelationPart(text, /(方向|层级|指向)[:：]([^；。\n]+)/, '植物 -> 动物 -> 土壤 -> 植物')
  const conclusion = pickRelationPart(text, /(结论|说明|结果)[:：]([^；。\n]+)/, '关系让系统循环运转')
  const isCompact = Boolean(compact)
  return (
    <Frame label="关系结构图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.25fr 0.75fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 18, padding: compact ? '14px 16px' : '16px 22px', minHeight: compact ? 210 : 260, display: 'grid', gap: compact ? 8 : 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>{subject}</div>
            <div style={{ color: '#64748b', fontSize: compact ? 12 : 14, fontWeight: 900 }}>完整主体保留</div>
          </div>
          <SystemMap compact={isCompact} />
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr auto', gap: 10, alignItems: 'center' }}>
            <div style={{ color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 800 }}>{nodes}</div>
            <div style={{ color: '#d97706', fontSize: compact ? 12 : 18, fontWeight: 950 }}>{direction}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, alignContent: 'stretch' }}>
          <AestheticPanel color="#2563eb" title="先看完整主体" body={subject} compact />
          <AestheticPanel color="#7c3aed" title="找组成节点" body={nodes} compact />
          <AestheticPanel color="#d97706" title="看连接方向" body={`${link}；${direction}`} compact />
          <AestheticPanel color="#059669" title="说结构结论" body={conclusion} compact />
        </div>
      </div>
    </Frame>
  )
}

function ConceptDefinitionVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const subject = pickDefinitionPart(text, /(主体|概念|对象)[:：]([^；。\n]+)/, pickFirst(text, /(自然段|速度|密度|函数|细胞|光线)/, cleanTitle(title)))
  const relation = pickFirst(text, /(围绕一个意思|每一秒移动|单位时间内变化|由.+组成)/, pickDefinitionPart(text, /(关系|核心)[:：]([^；。\n]+)/, '抓住关键关系'))
  const conclusion = pickDefinitionPart(text, /(结论|定义|意思是)[:：]([^；。\n]+)/, cleanTitle(title))
  const boundary = text.includes('换行')
    ? '换行只是常见标记，不是唯一判断'
    : pickDefinitionPart(text, /(边界|限制|不是|注意)[:：]([^；。\n]+)/, pickFirst(text, /(不是[^；。\n]+|不等于[^；。\n]+)/, '不要只看表面标记'))
  const isCompact = Boolean(compact)
  return (
    <Frame label="概念定义图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '0.95fr 1.05fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 18, padding: compact ? '16px 18px' : '22px 28px', display: 'grid', alignContent: 'center', gap: compact ? 12 : 18, minHeight: compact ? 170 : 280 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>先看主体</div>
          <div style={{ ...balancedWrap, color: '#111827', fontSize: compact ? 26 : 38, lineHeight: 1.24, fontWeight: 950, textAlign: 'center' }}><MathOrText>{cleanTitle(title)}</MathOrText></div>
          <div style={{ display: 'grid', gap: compact ? 8 : 10 }}>
            <DefinitionMiniLine color="#2563eb" label="主体" value={subject} compact={isCompact} />
            <DefinitionMiniLine color="#d97706" label="关系" value={relation} compact={isCompact} />
            <DefinitionMiniLine color="#059669" label="结论" value={conclusion} compact={isCompact} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 12, alignContent: 'stretch' }}>
          <DefinitionPanel color="#2563eb" title="主体先出现" body={subject} compact={isCompact} />
          <DefinitionPanel color="#d97706" title="再说关键关系" body={relation} compact={isCompact} />
          <DefinitionPanel color="#059669" title="收束成短定义" body={conclusion} compact={isCompact} />
          <DefinitionPanel color="#7c3aed" title="补一句边界" body={boundary} compact={isCompact} />
        </div>
      </div>
    </Frame>
  )
}

function DefinitionMiniLine({ color, label, value, compact }: { color: string; label: string; value: string; compact?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '54px 1fr' : '66px 1fr', gap: 10, alignItems: 'center', textAlign: 'left' }}>
      <div style={{ color, fontSize: compact ? 13 : 18, fontWeight: 950 }}>{label}</div>
      <div style={{ ...readableWrap, color: '#334155', fontSize: compact ? 14 : 18, lineHeight: 1.42, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function DefinitionPanel({ color, title, body, compact }: { color: string; title: string; body: string; compact?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `2px solid ${color}30`, borderRadius: 16, padding: compact ? '12px 14px' : '14px 18px', display: 'grid', gap: 5 }}>
      <div style={{ ...balancedWrap, color, fontSize: compact ? 15 : 19, fontWeight: 950 }}>{title}</div>
      <div style={{ ...readableWrap, color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 760 }}>{body}</div>
    </div>
  )
}

function SystemMap({ compact }: { compact?: boolean }) {
  const nodeSize = compact ? 58 : 78
  return (
    <div style={{ position: 'relative', minHeight: compact ? 146 : 204, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: compact ? 14 : 20, border: '2px dashed rgba(37,99,235,0.28)', borderRadius: 18 }} />
      <RelationNode label="阳光" color="#f59e0b" style={{ left: compact ? 24 : 38, top: compact ? 18 : 28, width: nodeSize, height: nodeSize }} compact={Boolean(compact)} />
      <RelationNode label="植物" color="#059669" style={{ left: compact ? 98 : 152, top: compact ? 54 : 82, width: nodeSize, height: nodeSize }} compact={Boolean(compact)} strong />
      <RelationNode label="动物" color="#7c3aed" style={{ right: compact ? 56 : 88, top: compact ? 26 : 44, width: nodeSize, height: nodeSize }} compact={Boolean(compact)} strong />
      <RelationNode label="土壤" color="#92400e" style={{ right: compact ? 24 : 38, bottom: compact ? 16 : 28, width: nodeSize, height: nodeSize }} compact={Boolean(compact)} />
      <RelationArrow left={compact ? 78 : 116} top={compact ? 54 : 80} width={compact ? 66 : 106} rotate={16} color="#d97706" compact={Boolean(compact)} label="提供" />
      <RelationArrow right={compact ? 102 : 158} top={compact ? 78 : 112} width={compact ? 74 : 116} rotate={32} color="#d97706" compact={Boolean(compact)} label="影响" />
      <RelationArrow right={compact ? 86 : 138} bottom={compact ? 50 : 72} width={compact ? 118 : 184} rotate={178} color="#d97706" compact={Boolean(compact)} label="循环回到植物" />
      <div style={{ position: 'absolute', left: compact ? 14 : 22, bottom: compact ? 10 : 14, color: '#2563eb', fontSize: compact ? 12 : 14, fontWeight: 950 }}>完整系统：四个节点都在场</div>
    </div>
  )
}

function RelationNode({ label, color, style, compact, strong = false }: { label: string; color: string; style: CSSProperties; compact?: boolean; strong?: boolean }) {
  return (
    <div style={{ position: 'absolute', ...style, borderRadius: 16, display: 'grid', placeItems: 'center', background: '#fff', color, border: `${strong ? 3 : 2}px solid ${color}66`, boxShadow: strong ? `0 10px 24px ${color}22` : 'none', fontSize: compact ? 14 : 18, fontWeight: 950 }}>
      {label}
    </div>
  )
}

function RelationArrow({ left, right, top, bottom, width, rotate, color, compact, label }: { left?: number; right?: number; top?: number; bottom?: number; width: number; rotate: number; color: string; compact?: boolean; label: string }) {
  return (
    <div style={{ position: 'absolute', left, right, top, bottom, width, height: compact ? 22 : 28, transform: `rotate(${rotate}deg)`, transformOrigin: 'left center' }}>
      <div style={{ position: 'absolute', left: 0, right: 9, top: '50%', height: 3, background: color, borderRadius: 999 }} />
      <div style={{ position: 'absolute', right: 0, top: '50%', width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: `12px solid ${color}`, transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: compact ? -9 : -12, transform: 'translateX(-50%)', color, fontSize: compact ? 12 : 14, fontWeight: 950, whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  )
}

function pickRelationPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[2]?.trim() || fallback
}

function pickDefinitionPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[2]?.trim() || fallback
}

function pickFirst(text: string, pattern: RegExp, fallback: string): string {
  return text.match(pattern)?.[1]?.trim() || fallback
}

function MethodStrategyVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const task = pickStrategyPart(text, /(?:^|[；。\n])(?:任务|题目|原文|目标)[:：]([^；。\n]+)/, cleanTitle(title))
  const cue = pickStrategyPart(text, /(?:^|[；。\n])(?:线索|关键词|提示词|条件)[:：]([^；。\n]+)/, '题目问什么，原文反复出现什么')
  const standard = pickStrategyPart(text, /(?:^|[；。\n])(?:标准|依据|判断)[:：]([^；。\n]+)/, '能回答目标、能在原文中找到依据')
  const path = pickStrategyPart(text, /(?:^|[；。\n])(?:路径|方法|策略|怎么想)[:：]([^；。\n]+)/, '先看目标，再找线索，再按标准选择')
  const action = pickStrategyPart(text, /(?:^|[；。\n])(?:行动|做法|清单|步骤)[:：]([^；。\n]+)/, '圈目标、标线索、说依据、再作答')
  const isCompact = Boolean(compact)
  return (
    <Frame label="方法策略图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.05fr 0.95fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 18, padding: compact ? '16px 18px' : '22px 26px', minHeight: compact ? 210 : 300, display: 'grid', alignContent: 'center', gap: compact ? 12 : 16 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>原任务一直在场</div>
          <div style={{ borderRadius: 16, background: '#eff6ff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '14px 16px' : '20px 24px', color: '#0f172a', fontSize: compact ? 18 : 26, lineHeight: 1.45, fontWeight: 900 }}>
            <MathOrText>{task}</MathOrText>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: compact ? 10 : 14, alignItems: 'center' }}>
            <StrategyBadge text="1 圈目标" color="#2563eb" compact={isCompact} />
            <div style={{ color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 750 }}>{cue}</div>
            <StrategyBadge text="2 找线索" color="#7c3aed" compact={isCompact} />
            <div style={{ color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 750 }}>{standard}</div>
            <StrategyBadge text="3 说动作" color="#059669" compact={isCompact} />
            <div style={{ color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 750 }}>{action}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, alignContent: 'stretch' }}>
          <AestheticPanel color="#2563eb" title="先保留任务" body={task} compact />
          <AestheticPanel color="#7c3aed" title="找判断线索" body={cue} compact />
          <AestheticPanel color="#d97706" title="走思考路径" body={path} compact />
          <AestheticPanel color="#059669" title="落到行动清单" body={action} compact />
        </div>
      </div>
    </Frame>
  )
}

function StrategyBadge({ text, color, compact }: { text: string; color: string; compact?: boolean }) {
  return (
    <div style={{ borderRadius: 999, background: `${color}14`, border: `1px solid ${color}55`, color, padding: compact ? '6px 9px' : '8px 12px', fontSize: compact ? 12 : 18, fontWeight: 950, whiteSpace: 'nowrap' }}>
      {text}
    </div>
  )
}

function pickStrategyPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function ConceptComparisonVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const objectA = pickComparisonPart(text, /(?:^|[；。\n])(?:对象A|概念A|左边|A)[:：]([^；。\n]+)/, '自然段')
  const objectB = pickComparisonPart(text, /(?:^|[；。\n])(?:对象B|概念B|右边|B)[:：]([^；。\n]+)/, '段落')
  const standard = pickComparisonPart(text, /(?:^|[；。\n])(?:标准|比较标准|依据|维度|判断点)[:：]([^；。\n]+)/, '看是否形成阅读停顿和完整意思')
  const same = pickComparisonPart(text, /(?:^|[；。\n])(?:相同|相同点|共同点)[:：]([^；。\n]+)/, '都能组织一组句子表达意思')
  const difference = pickComparisonPart(text, /(?:^|[；。\n])(?:区别|不同|差异|关键差异)[:：]([^；。\n]+)/, '自然段看换行停顿，段落看内容层次')
  const boundary = pickComparisonPart(text, /(?:^|[；。\n])(?:边界|判断边界|结论)[:：]([^；。\n]+)/, '先按标准判断，不只看名字像不像')
  const isCompact = Boolean(compact)
  return (
    <Frame label="概念辨析图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '0.95fr 0.62fr 0.95fr', gap: compact ? 12 : 16, alignItems: 'stretch' }}>
        <ComparisonObjectCard label="对象 A" title={objectA} color="#2563eb" note="先保留第一个概念" compact={isCompact} />
        <div style={{ display: 'grid', alignContent: 'center', gap: compact ? 9 : 12 }}>
          <div style={{ borderRadius: 16, background: '#fff', border: '2px solid rgba(124,58,237,0.28)', padding: compact ? '12px 14px' : '16px 18px', textAlign: 'center' }}>
            <div style={{ color: '#7c3aed', fontSize: compact ? 14 : 18, fontWeight: 950 }}>同一比较标准</div>
            <div style={{ marginTop: 6, color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 750 }}>{standard}</div>
          </div>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 4, color: '#94a3b8', fontWeight: 950 }}>
            <div style={{ width: '80%', height: 2, background: '#cbd5e1' }} />
            <div style={{ fontSize: compact ? 13 : 18 }}>用同一把尺子比</div>
            <div style={{ width: '80%', height: 2, background: '#cbd5e1' }} />
          </div>
        </div>
        <ComparisonObjectCard label="对象 B" title={objectB} color="#2563eb" note="同时保留第二个概念" compact={isCompact} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr 1fr', gap: compact ? 10 : 14 }}>
        <AestheticPanel color="#059669" title="先说相同点" body={same} compact={isCompact} />
        <AestheticPanel color="#d97706" title="再看关键差异" body={difference} compact={isCompact} />
        <AestheticPanel color="#7c3aed" title="最后判边界" body={boundary} compact={isCompact} />
      </div>
      <div style={{ textAlign: 'center', color: '#0f172a', fontSize: compact ? 16 : 22, fontWeight: 950 }}>
        <MathOrText>{cleanTitle(title)}</MathOrText>
      </div>
    </Frame>
  )
}

function ComparisonObjectCard({ label, title, color, note, compact }: { label: string; title: string; color: string; note: string; compact?: boolean }) {
  return (
    <div style={{ minHeight: compact ? 112 : 160, borderRadius: 18, background: '#fff', border: `2px solid ${color}30`, display: 'grid', alignContent: 'center', justifyItems: 'center', gap: compact ? 7 : 10, padding: compact ? '14px 16px' : '20px 22px' }}>
      <div style={{ color, fontSize: compact ? 13 : 18, fontWeight: 950, letterSpacing: 2 }}>{label}</div>
      <div style={{ color: '#0f172a', fontSize: compact ? 25 : 38, lineHeight: 1.18, fontWeight: 950, textAlign: 'center' }}>{title}</div>
      <div style={{ color: '#64748b', fontSize: compact ? 12 : 18, lineHeight: 1.35, fontWeight: 750, textAlign: 'center' }}>{note}</div>
    </div>
  )
}

function pickComparisonPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function ProcessFlowVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const goal = pickProcessPart(text, /(?:^|[；。\n])(?:目标|任务|起点)[:：]([^；。\n]+)/, cleanTitle(title))
  const step1 = pickProcessPart(text, /(?:^|[；。\n])(?:第一步|步骤1|1)[:：]([^；。\n]+)/, '确定部首')
  const step2 = pickProcessPart(text, /(?:^|[；。\n])(?:第二步|步骤2|2)[:：]([^；。\n]+)/, '数部首笔画')
  const step3 = pickProcessPart(text, /(?:^|[；。\n])(?:第三步|步骤3|3)[:：]([^；。\n]+)/, '查部首目录')
  const step4 = pickProcessPart(text, /(?:^|[；。\n])(?:第四步|步骤4|4)[:：]([^；。\n]+)/, '数剩余笔画找字')
  const reason = pickProcessPart(text, /(?:^|[；。\n])(?:顺序|理由|为什么)[:：]([^；。\n]+)/, '先找到入口，后面的查找才有方向')
  const check = pickProcessPart(text, /(?:^|[；。\n])(?:检查|检查点|完成)[:：]([^；。\n]+)/, '能找到字音、字义或页码')
  const steps = [step1, step2, step3, step4]
  const isCompact = Boolean(compact)
  return (
    <Frame label="步骤流程图示" compact={compact}>
      <div style={{ display: 'grid', gap: compact ? 12 : 18 }}>
        <div style={{ borderRadius: 16, background: '#eff6ff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '12px 14px' : '16px 20px', color: '#0f172a', fontSize: compact ? 18 : 24, fontWeight: 950, textAlign: 'center' }}>
          目标：<MathOrText>{goal}</MathOrText>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: compact ? 8 : 12, alignItems: 'stretch' }}>
          {steps.map((step, index) => (
            <FlowStepCard key={`${step}-${index}`} index={index + 1} text={step} current={index === 1} compact={isCompact} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#d97706" title="顺序理由" body={reason} compact={isCompact} />
          <AestheticPanel color="#059669" title="完成检查点" body={check} compact={isCompact} />
        </div>
        <div style={{ textAlign: 'center', color: '#0f172a', fontSize: compact ? 15 : 20, lineHeight: 1.45, fontWeight: 850 }}>
          当前步高亮，但目标和前后步骤都保留。
        </div>
      </div>
    </Frame>
  )
}

function FlowStepCard({ index, text, current, compact }: { index: number; text: string; current: boolean; compact?: boolean }) {
  const color = current ? '#7c3aed' : '#64748b'
  return (
    <div style={{ position: 'relative', minHeight: compact ? 86 : 116, borderRadius: 16, background: '#fff', border: `2px solid ${current ? 'rgba(124,58,237,0.38)' : 'rgba(148,163,184,0.30)'}`, padding: compact ? '12px 10px' : '16px 14px', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: compact ? 6 : 8 }}>
      <div style={{ width: compact ? 28 : 36, height: compact ? 28 : 36, borderRadius: 999, display: 'grid', placeItems: 'center', background: `${color}18`, color, border: `1px solid ${color}55`, fontSize: compact ? 14 : 18, fontWeight: 950 }}>{index}</div>
      <div style={{ color, fontSize: compact ? 13 : 18, lineHeight: 1.35, fontWeight: 900, textAlign: 'center' }}>{text}</div>
      {current && <div style={{ color: '#7c3aed', fontSize: compact ? 12 : 14, fontWeight: 950 }}>当前步骤</div>}
      {index < 4 && (
        <div aria-hidden style={{ position: 'absolute', right: compact ? -10 : -14, top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1', fontSize: compact ? 18 : 24, fontWeight: 950, zIndex: 2 }}>→</div>
      )}
    </div>
  )
}

function pickProcessPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function SituationApplicationVisual({ title, text, compact, decorImageUrl }: { title: string; text: string; compact?: boolean; decorImageUrl?: string | undefined }) {
  const situation = pickApplicationPart(text, /(?:^|[；。\n\s])(?:情境|场景|任务)[:：]([^；。\n]+)/, cleanTitle(title))
  const problem = pickApplicationPart(text, /(?:^|[；。\n\s])(?:问题|需求|要解决|目标)[:：]([^；。\n]+)/, '先指出真实任务里要解决什么')
  const knowledge = pickApplicationPart(text, /(?:^|[；。\n\s])(?:知识点|概念|公式|方法|根据|用到)[:：]([^；。\n]+)/, '选择能解释这个问题的知识点')
  const action = pickApplicationPart(text, /(?:^|[；。\n\s])(?:应用|行动|做法)[:：]([^；。\n]+)/, '把知识点落成一个可执行动作')
  const transfer = pickApplicationPart(text, /(?:^|[；。\n\s])(?:迁移|结论|结果)[:：]([^；。\n]+)/, '遇到类似情境时, 先找证据再行动')
  const isCompact = Boolean(compact)
  return (
    <Frame label="情境应用图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.02fr auto 1fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <div style={{ borderRadius: 18, background: '#fff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '14px 16px' : '20px 24px', display: 'grid', gap: compact ? 10 : 14, minHeight: compact ? 174 : 260 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>真实情境</div>
          <MiniSituationScene compact={isCompact} decorImageUrl={decorImageUrl} />
          <div style={{ color: '#0f172a', fontSize: compact ? 16 : 22, lineHeight: 1.4, fontWeight: 900 }}><MathOrText>{situation}</MathOrText></div>
        </div>
        {!compact && (
          <div style={{ display: 'grid', placeItems: 'center', minWidth: 86 }}>
            <ApplicationArrow color="#d97706" label="知识点进入行动" />
          </div>
        )}
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#7c3aed" title="要解决的问题" body={problem} compact={isCompact} />
          <AestheticPanel color="#d97706" title="使用的知识" body={knowledge} compact={isCompact} />
          <AestheticPanel color="#059669" title="应用动作" body={action} compact={isCompact} />
          <AestheticPanel color="#0f766e" title="迁移结论" body={transfer} compact={isCompact} />
        </div>
      </div>
      <div style={{ textAlign: 'center', color: '#0f172a', fontSize: compact ? 15 : 20, lineHeight: 1.45, fontWeight: 850 }}>
        情境不是装饰：先看证据, 再选知识点, 最后做行动。
      </div>
    </Frame>
  )
}

function MiniSituationScene({ compact, decorImageUrl }: { compact?: boolean; decorImageUrl?: string | undefined }) {
  return (
    <div style={{ position: 'relative', minHeight: compact ? 74 : 112, borderRadius: 16, background: '#eff6ff', border: '1px solid #bfdbfe', overflow: 'hidden' }}>
      {decorImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={decorImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <>
          <div style={{ position: 'absolute', left: compact ? 14 : 22, right: compact ? 14 : 22, bottom: compact ? 13 : 20, height: compact ? 8 : 12, borderRadius: 999, background: '#bfdbfe' }} />
          <div style={{ position: 'absolute', left: compact ? 18 : 28, top: compact ? 18 : 28, width: compact ? 44 : 66, height: compact ? 30 : 46, borderRadius: '12px 12px 7px 7px', background: '#fff', border: '2px solid #2563eb55' }} />
          <div style={{ position: 'absolute', left: compact ? 60 : 94, top: compact ? 26 : 40, width: compact ? 22 : 34, height: compact ? 7 : 10, borderRadius: 999, background: '#2563eb' }} />
          <div style={{ position: 'absolute', left: compact ? 86 : 132, top: compact ? 34 : 52, width: compact ? 6 : 8, height: compact ? 24 : 38, borderRadius: 999, background: '#60a5fa' }} />
          <div style={{ position: 'absolute', left: compact ? 90 : 137, top: compact ? 62 : 94, width: compact ? 5 : 7, height: compact ? 5 : 7, borderRadius: 999, background: '#2563eb' }} />
          <div style={{ position: 'absolute', right: compact ? 18 : 28, bottom: compact ? 24 : 36, width: compact ? 28 : 42, height: compact ? 28 : 42, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', right: compact ? 23 : 36, bottom: compact ? 9 : 16, width: compact ? 18 : 28, height: compact ? 22 : 34, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', right: compact ? 56 : 84, top: compact ? 10 : 16, color: '#2563eb', fontSize: compact ? 12 : 18, fontWeight: 950 }}>先看发生了什么</div>
        </>
      )}
    </div>
  )
}

function ApplicationArrow({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ position: 'relative', width: 80, height: 46 }}>
      <div style={{ position: 'absolute', left: 0, right: 10, top: '50%', height: 4, background: color, borderRadius: 999 }} />
      <div style={{ position: 'absolute', right: 0, top: '50%', width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderLeft: `16px solid ${color}`, transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)', color, fontSize: 14, fontWeight: 950, whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  )
}

function pickApplicationPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function ValueUnderstandingVisual({ title, text, compact, decorImageUrl }: { title: string; text: string; compact?: boolean; decorImageUrl?: string | undefined }) {
  const evidence = pickValuePart(text, /(?:^|[；。\n\s])(?:材料|行为|选择|证据|事件)[:：]([^；。\n]+)/, cleanTitle(title))
  const judgment = pickValuePart(text, /(?:^|[；。\n\s])(?:价值判断|价值|态度|判断)[:：]([^；。\n]+)/, '先判断这个行为体现什么价值')
  const reason = pickValuePart(text, /(?:^|[；。\n\s])(?:理由|因为|体现|说明)[:：]([^；。\n]+)/, '判断必须回到材料里的具体行为')
  const expression = pickValuePart(text, /(?:^|[；。\n\s])(?:表达|观点|启发|反思)[:：]([^；。\n]+)/, '我认为这个行为值得认同, 因为它有材料证据')
  const isCompact = Boolean(compact)
  return (
    <Frame label=" " compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.02fr auto 1fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <div style={{ borderRadius: 18, background: '#fff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '14px 16px' : '20px 24px', display: 'grid', gap: compact ? 10 : 14, minHeight: compact ? 184 : 270 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>材料证据</div>
          <MiniEvidenceScene compact={isCompact} decorImageUrl={decorImageUrl} />
          <div style={{ color: '#0f172a', fontSize: compact ? 16 : 22, lineHeight: 1.42, fontWeight: 900 }}><MathOrText>{evidence}</MathOrText></div>
        </div>
        {!compact && (
          <div style={{ display: 'grid', placeItems: 'center', minWidth: 86 }}>
            <ApplicationArrow color="#7c3aed" label="从行为推出价值" />
          </div>
        )}
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#7c3aed" title="价值判断" body={judgment} compact={isCompact} />
          <AestheticPanel color="#d97706" title="判断理由" body={reason} compact={isCompact} />
          <AestheticPanel color="#059669" title="表达出口" body={expression} compact={isCompact} />
          <AestheticPanel color="#0f766e" title="自检句式" body="我认为...因为材料里..." compact={isCompact} />
        </div>
      </div>
      <div style={{ textAlign: 'center', color: '#0f172a', fontSize: compact ? 15 : 20, lineHeight: 1.45, fontWeight: 850 }}>
        价值不是口号：先找行为证据, 再说判断和理由。
      </div>
    </Frame>
  )
}

function MiniEvidenceScene({ compact, decorImageUrl }: { compact?: boolean; decorImageUrl?: string | undefined }) {
  return (
    <div style={{ position: 'relative', minHeight: compact ? 78 : 116, borderRadius: 16, background: '#eff6ff', border: '1px solid #bfdbfe', overflow: 'hidden' }}>
      {decorImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={decorImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <>
          <div style={{ position: 'absolute', left: compact ? 18 : 28, right: compact ? 18 : 28, bottom: compact ? 14 : 22, height: compact ? 8 : 12, borderRadius: 999, background: '#dbeafe' }} />
          <div style={{ position: 'absolute', left: compact ? 28 : 44, bottom: compact ? 28 : 42, width: compact ? 30 : 46, height: compact ? 22 : 34, borderRadius: 8, background: '#fef3c7', border: '2px solid #d9770655', transform: 'rotate(-7deg)' }} />
          <div style={{ position: 'absolute', left: compact ? 88 : 134, bottom: compact ? 26 : 40, width: compact ? 36 : 54, height: compact ? 24 : 38, borderRadius: 8, background: '#fff', border: '2px solid #2563eb55' }} />
          <div style={{ position: 'absolute', left: compact ? 132 : 202, bottom: compact ? 42 : 64, width: compact ? 60 : 88, height: 3, background: '#7c3aed', borderRadius: 999 }} />
          <div style={{ position: 'absolute', left: compact ? 184 : 282, bottom: compact ? 34 : 52, width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '12px solid #7c3aed' }} />
          <div style={{ position: 'absolute', right: compact ? 22 : 34, bottom: compact ? 28 : 42, width: compact ? 30 : 44, height: compact ? 30 : 44, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', right: compact ? 26 : 40, bottom: compact ? 10 : 18, width: compact ? 20 : 30, height: compact ? 24 : 36, borderRadius: 999, background: '#0f172a' }} />
          <div style={{ position: 'absolute', right: compact ? 18 : 28, top: compact ? 10 : 16, color: '#2563eb', fontSize: compact ? 12 : 18, fontWeight: 950 }}>先看他做了什么</div>
        </>
      )}
    </div>
  )
}

function pickValuePart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function ComprehensiveTaskVisual({ title, text, compact, decorImageUrl }: { title: string; text: string; compact?: boolean; decorImageUrl?: string | undefined }) {
  const product = pickComprehensiveTaskPart(text, /(?:^|[；。\n\s])(?:最终产出|产出|作品|成品)[:：]([^；。\n]+)/, cleanTitle(title))
  const standard = pickComprehensiveTaskPart(text, /(?:^|[；。\n\s])(?:评价标准|作品标准|标准|要求)[:：]([^；。\n]+)/, '有证据、有观点、有行动建议, 版面清楚')
  const knowledge = pickComprehensiveTaskPart(text, /(?:^|[；。\n\s])(?:知识点分工|分工|知识点)[:：]([^；。\n]+)/, '数据负责证明, 观点负责表达, 方法负责行动')
  const synthesis = pickComprehensiveTaskPart(text, /(?:^|[；。\n\s])(?:合成步骤|合成|步骤)[:：]([^；。\n]+)/, '先定标题, 再放证据, 然后连成行动建议')
  const checklist = pickComprehensiveTaskPart(text, /(?:^|[；。\n\s])(?:检查清单|自检|检查)[:：]([^；。\n]+)/, '看产出是否符合每条标准')
  const isCompact = Boolean(compact)
  return (
    <Frame label="综合任务图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.02fr 0.98fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <div style={{ borderRadius: 18, background: '#fff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '14px 16px' : '20px 24px', display: 'grid', gap: compact ? 10 : 14, minHeight: compact ? 186 : 280 }}>
          <div style={{ ...balancedWrap, color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>最终产出</div>
          <MiniProductMockup compact={isCompact} decorImageUrl={decorImageUrl} />
          <div style={{ ...balancedWrap, color: '#0f172a', fontSize: compact ? 16 : 21, lineHeight: 1.42, fontWeight: 900, textAlign: 'center' }}><MathOrText>{product}</MathOrText></div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#7c3aed" title="评价标准" body={standard} compact={isCompact} />
          <AestheticPanel color="#d97706" title="知识点分工" body={knowledge} compact={isCompact} />
          <AestheticPanel color="#0f766e" title="合成步骤" body={synthesis} compact={isCompact} />
          <AestheticPanel color="#059669" title="检查清单" body={checklist} compact={isCompact} />
        </div>
      </div>
      <div style={{ ...balancedWrap, textAlign: 'center', color: '#0f172a', fontSize: compact ? 15 : 20, lineHeight: 1.45, fontWeight: 850 }}>
        综合任务不是堆知识点：先看作品标准, 再决定每个知识点放到哪里。
      </div>
    </Frame>
  )
}

function MiniProductMockup({ compact, decorImageUrl }: { compact?: boolean; decorImageUrl?: string | undefined }) {
  return (
    <div style={{ position: 'relative', minHeight: compact ? 112 : 154, borderRadius: 16, background: '#eff6ff', border: '1px solid #bfdbfe', overflow: 'hidden', padding: decorImageUrl ? 0 : (compact ? 12 : 18) }}>
      {decorImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={decorImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <>
          <div style={{ position: 'absolute', left: compact ? 18 : 28, top: compact ? 16 : 22, width: compact ? 92 : 134, height: compact ? 18 : 24, borderRadius: 999, background: '#2563eb' }} />
          <div style={{ position: 'absolute', left: compact ? 18 : 28, top: compact ? 46 : 62, width: compact ? 82 : 118, height: compact ? 8 : 10, borderRadius: 999, background: '#93c5fd' }} />
          <div style={{ position: 'absolute', left: compact ? 18 : 28, top: compact ? 66 : 88, width: compact ? 112 : 164, height: compact ? 8 : 10, borderRadius: 999, background: '#bfdbfe' }} />
          <div style={{ position: 'absolute', left: compact ? 18 : 28, top: compact ? 86 : 114, width: compact ? 68 : 96, height: compact ? 8 : 10, borderRadius: 999, background: '#bfdbfe' }} />
          <div style={{ position: 'absolute', right: compact ? 18 : 28, top: compact ? 20 : 28, width: compact ? 84 : 124, height: compact ? 72 : 96, borderRadius: 14, background: '#fff7ed', border: '2px solid #fed7aa' }} />
          <div style={{ position: 'absolute', right: compact ? 32 : 48, top: compact ? 34 : 48, width: compact ? 34 : 48, height: compact ? 34 : 48, borderRadius: 999, background: '#f59e0b33', border: '2px solid #f59e0b' }} />
          <div style={{ position: 'absolute', right: compact ? 24 : 38, bottom: compact ? 22 : 32, color: '#d97706', fontSize: compact ? 12 : 14, fontWeight: 950 }}>证据 + 行动</div>
          <div style={{ position: 'absolute', left: compact ? 18 : 28, bottom: compact ? 10 : 14, color: '#2563eb', fontSize: compact ? 12 : 14, fontWeight: 950 }}>作品缩略图</div>
        </>
      )}
    </div>
  )
}

function pickComprehensiveTaskPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function ExperimentObservationVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const object = pickExperimentPart(text, /(?:^|[；。\n\s])(?:观察对象|实验对象|对象|材料)[:：]([^；。\n]+)/, cleanTitle(title))
  const condition = pickExperimentPart(text, /(?:^|[；。\n\s])(?:操作条件|条件|操作|控制变量)[:：]([^；。\n]+)/, '只改变一个条件, 其他尽量保持相同')
  const phenomenon = pickExperimentPart(text, /(?:^|[；。\n\s])(?:可见现象|现象|观察到|看到|记录)[:：]([^；。\n]+)/, '先记录眼睛看到的变化')
  const inference = pickExperimentPart(text, /(?:^|[；。\n\s])(?:推理|说明|所以)[:：]([^；。\n]+)/, '用现象和条件差异推出原因')
  const conclusion = pickExperimentPart(text, /(?:^|[；。\n\s])(?:结论|得出)[:：]([^；。\n]+)/, '结论必须贴着观察证据')
  const isCompact = Boolean(compact)
  return (
    <Frame label="实验观察图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.08fr 0.92fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <div style={{ borderRadius: 18, background: '#fff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '14px 16px' : '20px 24px', display: 'grid', gap: compact ? 10 : 14, minHeight: compact ? 186 : 280 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>观察对象</div>
          <MiniExperimentScene compact={isCompact} />
          <div style={{ color: '#0f172a', fontSize: compact ? 16 : 21, lineHeight: 1.42, fontWeight: 900, textAlign: 'center' }}><MathOrText>{object}</MathOrText></div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#7c3aed" title="操作条件" body={condition} compact={isCompact} />
          <AestheticPanel color="#d97706" title="可见现象" body={phenomenon} compact={isCompact} />
          <AestheticPanel color="#0f766e" title="推理过程" body={inference} compact={isCompact} />
          <AestheticPanel color="#059669" title="证据结论" body={conclusion} compact={isCompact} />
        </div>
      </div>
      <div style={{ textAlign: 'center', color: '#0f172a', fontSize: compact ? 15 : 20, lineHeight: 1.45, fontWeight: 850 }}>
        实验不是直接宣布答案：先做操作, 再记现象, 最后推出结论。
      </div>
    </Frame>
  )
}

function MiniExperimentScene({ compact }: { compact?: boolean }) {
  const cupWidth = compact ? 56 : 78
  const cupHeight = compact ? 66 : 94
  return (
    <div style={{ position: 'relative', minHeight: compact ? 100 : 146, borderRadius: 16, background: '#eff6ff', border: '1px solid #bfdbfe', overflow: 'hidden' }}>
      <ExperimentCup left={compact ? 44 : 76} bottom={compact ? 18 : 26} width={cupWidth} height={cupHeight} label="冷水" color="#60a5fa" compact={compact} />
      <ExperimentCup left={compact ? 152 : 246} bottom={compact ? 18 : 26} width={cupWidth} height={cupHeight} label="热水" color="#f59e0b" compact={compact} />
      <div style={{ position: 'absolute', left: compact ? 98 : 170, top: compact ? 42 : 62, height: 3, width: compact ? 50 : 72, background: '#7c3aed', borderRadius: 999 }} />
      <div style={{ position: 'absolute', left: compact ? 142 : 236, top: compact ? 35 : 54, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '13px solid #7c3aed' }} />
      <div style={{ position: 'absolute', right: compact ? 16 : 24, top: compact ? 10 : 16, color: '#7c3aed', fontSize: compact ? 12 : 18, fontWeight: 950 }}>只改变水温</div>
      <div style={{ position: 'absolute', left: compact ? 26 : 44, top: compact ? 10 : 16, color: '#2563eb', fontSize: compact ? 12 : 18, fontWeight: 950 }}>同样大小的方糖</div>
    </div>
  )
}

function ExperimentCup({ left, bottom, width, height, label, color, compact }: { left: number; bottom: number; width: number; height: number; label: string; color: string; compact?: boolean | undefined }) {
  return (
    <div style={{ position: 'absolute', left, bottom, width, height }}>
      <div style={{ position: 'absolute', left: width * 0.18, right: width * 0.18, top: height * 0.12, height: width * 0.22, borderRadius: 6, background: '#fef3c7', border: '2px solid #d9770655', transform: label === '热水' ? 'rotate(18deg)' : 'rotate(-10deg)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: compact ? 14 : 20, height: height * 0.72, borderRadius: '0 0 16px 16px', border: '3px solid #94a3b8', borderTop: 'none', background: '#ffffff' }} />
      <div style={{ position: 'absolute', left: 6, right: 6, bottom: compact ? 20 : 28, height: height * 0.34, borderRadius: '0 0 12px 12px', background: `${color}55` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', color, fontSize: compact ? 12 : 18, fontWeight: 950 }}>{label}</div>
      {label === '热水' && (
        <div style={{ position: 'absolute', left: width * 0.24, top: 0, color: '#d97706', fontSize: compact ? 12 : 18, fontWeight: 950 }}>更快变小</div>
      )}
    </div>
  )
}

function pickExperimentPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function MemoryRecallVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const target = pickMemoryPart(text, /(?:^|[；。\n\s])(?:记忆对象|要记住|背诵内容|对象)[:：]([^；。\n]+)/, cleanTitle(title))
  const cue = pickMemoryPart(text, /(?:^|[；。\n\s])(?:线索|提示|检索线索)[:：]([^；。\n]+)/, '用开头、分类、位置或联想帮助取出来')
  const retrieval = pickMemoryPart(text, /(?:^|[；。\n\s])(?:提取|回忆|默写|复述|练习)[:：]([^；。\n]+)/, '盖住原文后, 先说线索再说答案')
  const correction = pickMemoryPart(text, /(?:^|[；。\n\s])(?:校正|错位|漏掉|检查)[:：]([^；。\n]+)/, '漏掉时回到线索, 找到错位位置')
  const review = pickMemoryPart(text, /(?:^|[；。\n\s])(?:复习句|复习|结论)[:：]([^；。\n]+)/, '先用线索, 再提取内容, 最后检查漏项')
  const chips = splitMemoryTarget(target)
  const isCompact = Boolean(compact)
  return (
    <Frame label="记忆提取图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.08fr 0.92fr', gap: compact ? 12 : 18, alignItems: 'stretch' }}>
        <div style={{ borderRadius: 18, background: '#fff', border: '2px solid rgba(37,99,235,0.24)', padding: compact ? '14px 16px' : '20px 24px', display: 'grid', gap: compact ? 10 : 14, minHeight: compact ? 180 : 280 }}>
          <div style={{ color: '#2563eb', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>记忆对象</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 8 : 10, justifyContent: 'center' }}>
            {chips.map((chip, index) => (
              <div key={`${chip}-${index}`} style={{ minWidth: compact ? 50 : 72, borderRadius: 14, background: index % 3 === 1 ? '#f5f3ff' : '#eff6ff', border: `1px solid ${index % 3 === 1 ? '#c4b5fd' : '#bfdbfe'}`, color: '#0f172a', padding: compact ? '8px 10px' : '12px 14px', textAlign: 'center', fontSize: compact ? 14 : 18, lineHeight: 1.25, fontWeight: 950 }}>
                {chip}
              </div>
            ))}
          </div>
          <div style={{ borderRadius: 16, background: '#f8fafc', border: '1px dashed #94a3b8', padding: compact ? '10px 12px' : '14px 16px', color: '#475569', fontSize: compact ? 13 : 18, lineHeight: 1.45, fontWeight: 800, textAlign: 'center' }}>
            遮挡后只留线索, 不再直接看完整答案。
          </div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#7c3aed" title="检索线索" body={cue} compact={isCompact} />
          <AestheticPanel color="#d97706" title="提取练习" body={retrieval} compact={isCompact} />
          <AestheticPanel color="#059669" title="即时校正" body={correction} compact={isCompact} />
          <AestheticPanel color="#0f766e" title="复习句" body={review} compact={isCompact} />
        </div>
      </div>
      <div style={{ textAlign: 'center', color: '#0f172a', fontSize: compact ? 15 : 20, lineHeight: 1.45, fontWeight: 850 }}>
        不是多读几遍：先建线索, 再遮挡提取, 出错就回线索校正。
      </div>
    </Frame>
  )
}

function splitMemoryTarget(text: string): string[] {
  const clean = cleanTitle(text).replace(/太阳系八大行星顺序[:：]?/, '')
  const parts = clean.split(/[、,，\s]+/).map(part => part.trim()).filter(Boolean)
  return parts.length >= 2 ? parts.slice(0, 8) : [clean || '记忆对象', '线索', '提取', '校正']
}

function pickMemoryPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[1]?.trim() || fallback
}

function ChartReadingVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  const chartTitle = pickChartPart(text, /(标题|图名)[:：]([^；。\n]+)/, cleanTitle(title))
  const structure = pickChartPart(text, /(结构|坐标|轴|图例)[:：]([^；。\n]+)/, '横轴看类别，纵轴看数量')
  const data = pickChartPart(text, /(数据|当前|局部|高亮)[:：]([^；。\n]+)/, '当前高亮数据')
  const pattern = pickChartPart(text, /(趋势|比较|关系)[:：]([^；。\n]+)/, '读出变化趋势')
  const conclusion = pickChartPart(text, /(结论|说明|看出)[:：]([^；。\n]+)/, '用图表证据支持结论')
  const isCompact = Boolean(compact)
  return (
    <Frame label="图表读解图示" compact={compact}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.25fr 0.75fr', gap: compact ? 14 : 22, alignItems: 'stretch' }}>
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 18, padding: compact ? '14px 16px' : '20px 26px', minHeight: compact ? 190 : 300, display: 'grid', gap: compact ? 8 : 12 }}>
          <div style={{ color: '#7c3aed', fontSize: compact ? 14 : 18, fontWeight: 950, letterSpacing: 2 }}>{chartTitle}</div>
          <MiniBarChart compact={isCompact} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12 }}>
            <div style={{ color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 800 }}>{structure}</div>
            <div style={{ color: '#059669', fontSize: compact ? 12 : 18, fontWeight: 950 }}>结论要回到图表证据</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
          <AestheticPanel color="#7c3aed" title="先看结构" body={structure} compact={isCompact} />
          <AestheticPanel color="#2563eb" title="读当前数据" body={data} compact={isCompact} />
          <AestheticPanel color="#d97706" title="读趋势关系" body={pattern} compact={isCompact} />
          <AestheticPanel color="#059669" title="说证据结论" body={conclusion} compact={isCompact} />
        </div>
      </div>
    </Frame>
  )
}

function MiniBarChart({ compact }: { compact?: boolean }) {
  const bars = [
    { label: '一月', value: 32 },
    { label: '二月', value: 48 },
    { label: '三月', value: 66 },
    { label: '四月', value: 82 },
  ]
  const chartHeight = compact ? 118 : 180
  const max = 90
  return (
    <div style={{ position: 'relative', minHeight: chartHeight + (compact ? 54 : 70), padding: compact ? '8px 8px 34px 38px' : '12px 12px 42px 54px', borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ position: 'absolute', left: compact ? 22 : 34, top: compact ? 14 : 20, writingMode: 'vertical-rl', color: '#7c3aed', fontSize: compact ? 12 : 14, fontWeight: 900 }}>纵轴：人数</div>
      <div style={{ position: 'absolute', left: compact ? 38 : 54, right: compact ? 16 : 24, bottom: compact ? 34 : 42, height: 2, background: '#94a3b8' }} />
      <div style={{ position: 'absolute', left: compact ? 38 : 54, top: compact ? 14 : 20, bottom: compact ? 34 : 42, width: 2, background: '#94a3b8' }} />
      <div style={{ position: 'absolute', left: compact ? 48 : 68, right: compact ? 18 : 28, top: compact ? 18 : 24, bottom: compact ? 36 : 44, display: 'grid', gridTemplateColumns: `repeat(${bars.length}, 1fr)`, gap: compact ? 10 : 18, alignItems: 'end' }}>
        {bars.map((bar, index) => {
          const isCurrent = index === bars.length - 1
          return (
            <div key={bar.label} style={{ display: 'grid', alignItems: 'end', justifyItems: 'center', gap: 6, height: '100%' }}>
              <div style={{ color: isCurrent ? '#2563eb' : '#64748b', fontSize: compact ? 12 : 14, fontWeight: 950 }}>{bar.value}</div>
              <div style={{ width: compact ? 22 : 34, height: `${Math.max(18, (bar.value / max) * chartHeight)}px`, borderRadius: '8px 8px 3px 3px', background: isCurrent ? '#2563eb' : '#bfdbfe', border: isCurrent ? '3px solid #1d4ed8' : '1px solid #93c5fd', boxSizing: 'border-box' }} />
              <div style={{ color: '#475569', fontSize: compact ? 12 : 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{bar.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: compact ? 74 : 110, right: compact ? 44 : 74, top: compact ? 38 : 54, height: 3, background: '#d97706', transform: 'rotate(-12deg)', transformOrigin: 'left center' }} />
      <div style={{ position: 'absolute', right: compact ? 36 : 60, top: compact ? 28 : 42, width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '12px solid #d97706', transform: 'rotate(-12deg)' }} />
      <div style={{ position: 'absolute', right: compact ? 18 : 28, bottom: compact ? 10 : 14, color: '#7c3aed', fontSize: compact ? 12 : 14, fontWeight: 900 }}>横轴：月份</div>
      <div style={{ position: 'absolute', right: compact ? 18 : 28, top: compact ? 10 : 14, color: '#d97706', fontSize: compact ? 12 : 14, fontWeight: 950 }}>趋势：上升</div>
    </div>
  )
}

function pickChartPart(text: string, pattern: RegExp, fallback: string): string {
  const match = text.match(pattern)
  return match?.[2]?.trim() || fallback
}

// 当前页讲的是哪一种月相——据文本高亮对应的相，避免多页演示都画成同一张通用图。
function moonPhaseHighlight(text: string): string | undefined {
  // 整周期/轮播页（依次经过多种相）不单独高亮某一相，展示完整四相。
  const phaseCount = ['新月', '上弦', '满月', '下弦'].filter(p => text.includes(p)).length
  if (phaseCount >= 3 || /依次|循环|轮播|一个周期|逐渐变化|→/.test(text)) return undefined
  if (/满月|全亮|圆圆|整个亮|全部照亮/.test(text)) return '满月'
  if (/新月|看不见|全黑|不发光|没有亮面/.test(text)) return '新月'
  if (/上弦/.test(text)) return '上弦月'
  if (/下弦/.test(text)) return '下弦月'
  if (/弦月|半圆|半边|一半|侧面/.test(text)) return '上弦月'
  return undefined
}

// 月相/天文结构图：太阳光方向 + 新月/上弦/满月/下弦 月相一行 + 成因一句话（代码绘制，不依赖生图）
function MoonPhaseVisual({ title, text, compact }: { title: string; text?: string; compact?: boolean }) {
  const r = compact ? 22 : 30
  const box = r * 2 + 8
  const c = r + 4
  const highlight = text ? moonPhaseHighlight(text) : undefined
  const phases: Array<{ name: string; lit: 'none' | 'right' | 'full' | 'left' }> = [
    { name: '新月', lit: 'none' },
    { name: '上弦月', lit: 'right' },
    { name: '满月', lit: 'full' },
    { name: '下弦月', lit: 'left' },
  ]
  return (
    <Frame label="月相成因示意图" compact={compact}>
      <div style={{ textAlign: 'center', fontSize: compact ? 22 : 32, color: '#0f172a', fontWeight: 900 }}>{cleanTitle(title)}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 12 : 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#b45309', fontWeight: 900, fontSize: compact ? 12 : 18 }}>
          <div style={{ width: compact ? 32 : 44, height: compact ? 32 : 44, borderRadius: '50%', background: 'radial-gradient(circle, #fde68a, #f59e0b)', boxShadow: '0 0 16px #fcd34d' }} />
          <div>太阳光 →</div>
        </div>
        {phases.map(ph => {
          const on = ph.name === highlight
          return (
          <div key={ph.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: on ? 8 : 0, borderRadius: 16, background: on ? '#fef9c3' : 'transparent', boxShadow: on ? '0 0 0 3px #f59e0b' : 'none' }}>
            <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} role="img" aria-label={ph.name}>
              <circle cx={c} cy={c} r={r} fill="#1e293b" stroke="#cbd5e1" strokeWidth={2} />
              {ph.lit === 'full' && <circle cx={c} cy={c} r={r} fill="#fde68a" />}
              {ph.lit === 'right' && <path d={`M ${c},${c - r} A ${r},${r} 0 0 1 ${c},${c + r} Z`} fill="#fde68a" />}
              {ph.lit === 'left' && <path d={`M ${c},${c - r} A ${r},${r} 0 0 0 ${c},${c + r} Z`} fill="#fde68a" />}
            </svg>
            <div data-line-role="card" style={{ color: on ? '#b45309' : '#0f172a', fontSize: compact ? 12 : 18, fontWeight: on ? 950 : 850 }}>{ph.name}{on ? ' ←本页' : ''}</div>
          </div>
          )
        })}
      </div>
      <div data-line-role="card" style={{ ...balancedWrap, textAlign: 'center', color: '#334155', fontSize: compact ? 13 : 18, lineHeight: 1.5, fontWeight: 750 }}>
        月球被太阳照亮的半边始终朝着太阳；月球绕地球转动时，地球上看到的亮面多少不同，就形成了月相——不是地球的影子遮住了月亮。
      </div>
    </Frame>
  )
}

function GenericConceptVisual({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  // 兜底不再把文本切成互不相干的"词块卡片"（那就是"没人看得懂"的来源）。
  // 直接把这句话/这个要点干净地呈现出来——标题为主，若有不同的补充句再附一行。
  const headline = cleanTitle(title)
  const rest = (text || '').replace(/\s+/g, ' ').trim()
  const support = rest && !rest.includes(headline) && rest.length <= 80 ? rest : ''
  return (
    <Frame label="要点" compact={compact}>
      <div style={{ display: 'grid', placeItems: 'center', gap: compact ? 14 : 22, padding: compact ? '12px 16px' : '24px 32px' }}>
        <div data-line-role="card" style={{ ...balancedWrap, maxWidth: '100%', fontSize: compact ? 26 : 40, fontWeight: 900, color: '#0f172a', textAlign: 'center', lineHeight: 1.3 }}>{headline}</div>
        {support && <div data-line-role="card" style={{ ...balancedWrap, maxWidth: '92%', fontSize: compact ? 16 : 22, color: '#475569', textAlign: 'center', lineHeight: 1.5 }}>{support}</div>}
      </div>
    </Frame>
  )
}

function Arrow() {
  return <div style={{ fontSize: 30, color: '#2563eb', fontWeight: 900 }}>→</div>
}

function BigUnit({ value, desc }: { value: string; desc: string }) {
  return (
    <div style={{ background: '#fff', border: '2px solid #bfdbfe', borderRadius: 18, padding: 24, textAlign: 'center' }}>
      <div data-line-role="card" style={{ ...balancedWrap, fontSize: 36, fontWeight: 900, color: '#0f172a' }}>{value}</div>
      <div data-line-role="card" style={{ ...balancedWrap, marginTop: 8, fontSize: 18, color: '#64748b' }}>{desc}</div>
    </div>
  )
}

function QuantityCard({ color, title, body, compact }: { color: string; title: string; body: string; compact?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `2px solid ${color}33`, borderRadius: 16, padding: compact ? '10px 12px' : '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div data-line-role="card" style={{ ...balancedWrap, color, fontSize: compact ? 18 : 28, fontWeight: 900 }}>{title}</div>
      <div data-line-role="card" style={{ ...balancedWrap, marginTop: compact ? 4 : 8, color: '#64748b', fontSize: compact ? 13 : 18, fontWeight: 800 }}>{body}</div>
    </div>
  )
}

function MiniFormulaPart({ color, title, body, compact }: { color: string; title: string; body: string; compact?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}55`, borderRadius: 12, padding: compact ? '8px 10px' : '12px 14px', textAlign: 'center' }}>
      <div data-line-role="card" style={{ ...balancedWrap, color, fontSize: compact ? 15 : 20, fontWeight: 900 }}>{title}</div>
      <div data-line-role="card" style={{ ...balancedWrap, marginTop: 4, color: '#64748b', fontSize: compact ? 12 : 18, fontWeight: 700 }}>{body}</div>
    </div>
  )
}

function MethodCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 14, padding: 22, textAlign: 'center' }}>
      <div data-line-role="card" style={{ ...balancedWrap, fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{title}</div>
      <div data-line-role="card" style={{ ...balancedWrap, marginTop: 10, fontSize: 20, color: '#475569' }}>{body}</div>
    </div>
  )
}

function cleanTitle(text: string): string {
  return text.replace(/\$\$?[^$]+\$\$?/g, '公式').replace(/\s+/g, ' ').slice(0, 28)
}

function extractChips(text: string): string[] {
  const raw = text
    .replace(/\$\$?[^$]+\$\$?/g, '')
    .split(/[，。；;、：:\n]/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 16)
  return Array.from(new Set(raw)).slice(0, 6)
}

import type { TeachingContentTypeId, VisualSpec } from '@maolab/shared-types'

/**
 * ConceptVisual 的结构化承载触发器 — 单一真相源。
 *
 * 放映端 (ConceptVisual/PresentMode/AtomRenderer) 与质量闸门 (fragment-quality)
 * 必须用同一份触发逻辑判断"这段内容会不会被结构化图示承载"。
 * 2026-07-06 真检发现闸门手工镜像的关键词表与这里漂移, 导致课程被假阳性拦停
 * (missing-structured-visual), 因此抽出为纯 TS 模块供两端共用。
 */

export type ConceptVisualInput = {
  title?: string | undefined
  caption?: string | undefined
  alt?: string | undefined
  prompt?: string | undefined
  narration?: string | undefined
  src?: string | undefined
  visualSpec?: VisualSpec | undefined
  /** 生成期 LLM 显式标注的内容类型 — 派发时优先于关键词正则 */
  contentType?: TeachingContentTypeId | undefined
  decorImageUrl?: string | undefined
}

export const EXACT_VISUAL_RE = /(\$|\\frac|\\text|m\/s|km\/h|公式|单位|换算|变量|坐标|函数|等高线|经纬|入射角|反射角|法线|三角形|等腰|等边|底角|顶角|角平分线|中线|垂线|全等|证明|HL|SSS|SAS|ASA)/
export const DIAGRAM_INTENT_RE = /(流程|关系|步骤|比较|图示|示意图|标注|箭头|结构|变量|辅助线|作图|证明)/
export const CONCEPT_RE = /(速度|路程|时间|密度|质量|体积|函数|光线|细胞|生态|消化|吸收|反应|浓度|三角形|等腰|等边|角|边|全等|几何)/
export const ERROR_CORRECTION_RE = /(错误|错了|错答|不对|误区|易错|错因|混淆|漏掉|修正|改成|改法|验证|检查)/
export const AESTHETIC_RE = /(古诗|诗句|意象|意境|思乡|朗读|停顿|节奏|情感|明月|月光|月夜|霜|举头|低头|有感情|体会)/
// 月相/天文：月相成因、相对位置、盈亏、公转、三球仪/台灯小球演示等科学内容（不含纯诗词的"明月/月光"）
export const MOON_PHASE_RE = /(月相|新月|满月|上弦|下弦|弦月|蛾眉月|凸月|盈亏|阴晴圆缺|三球仪|月球.{0,6}(?:公转|绕地球|转动|亮面)|亮面.{0,5}(?:半圆|半边|全亮|圆)|(?:太阳|阳光|台灯|灯泡).{0,12}(?:照亮|照在|照射|照到|位置|光).{0,12}(?:月球|地球|月亮|小球))/
export const CHART_READING_RE = /(图表|统计图|折线图|柱状图|条形图|坐标|横轴|纵轴|图例|表格|数据点|趋势图)/
export const RELATIONSHIP_STRUCTURE_RE = /(生态系统|系统|整体|组成|节点|要素|层级|相互作用|因果|导致|影响|指向|连接|谁和谁|植物|动物|土壤|阳光|循环|运转)/
export const METHOD_STRATEGY_RE = /(方法|策略|怎么想|关键词|抓住|线索|判断标准|选择标准|行动清单|解题思路|阅读策略|审题)/
export const CONCEPT_COMPARISON_RE = /(辨析|区别|不同|相同|对比|比较标准|同一标准|差异|边界|混淆|共同点|相似概念|自然段|段落)/
export const CONCEPT_DEFINITION_RE = /(是什么|定义|概念|叫做|是指|意思是|围绕一个意思|一段话)/
export const PROCESS_FLOW_RE = /(步骤|流程|顺序|第一步|第二步|第三步|先.*再|然后|检查点|不能颠倒|部首查字法|查字典)/
export const SITUATION_APPLICATION_RE = /(情境|现实|生活|实际|应用|迁移|场景|超市|校园|任务|解决|水龙头|节约用水)/
export const MEMORY_RECALL_RE = /(记忆|背诵|默写|口诀|提取|回忆|复述|记住|取出来|遮挡)/
export const VALUE_UNDERSTANDING_RE = /(价值|态度|文化|值得|认同|反思|启发|责任|诚信|勇气|尊重|价值判断|行为证据)/
export const EXPERIMENT_OBSERVATION_RE = /(实验|观察对象|实验对象|可见现象|操作条件|控制变量|观察到|记录.*现象|热水|冷水|方糖|溶解)/
export const COMPREHENSIVE_TASK_RE = /(综合任务|项目任务|最终产出|作品标准|评价标准|检查清单|知识点分工|合成步骤|合成产出|展示稿|学习任务单|制作.*海报|设计.*方案|完成.*作品)/
export const SUPPORTING_ILLUSTRATION_RE = /(跑步|步行|人物|同学|老师|校园|操场|超市|水龙头|海报|童话|故事|侦探|档案|古诗|月光|明月|故乡|生活|真实|场景|情境|太阳系|行星|饭卡|诚信)/

export function visualText(input: ConceptVisualInput): string {
  return [input.title, input.caption, input.alt, input.prompt, input.narration, input.src].filter(Boolean).join(' ')
}

export function isConceptDefinitionVisualText(text: string): boolean {
  if (!CONCEPT_DEFINITION_RE.test(text)) return false
  if (/(辨析|区别|不同|相同|对比|比较标准|同一标准|段落)/.test(text)) return false
  return true
}

export function shouldUseConceptVisual(input: ConceptVisualInput): boolean {
  // 生成期显式产出的结构规格 = 生成器已声明"本页有精确结构要承载", 无条件结构化
  if (input.visualSpec) return true
  const text = visualText(input)
  return isConceptDefinitionVisualText(text) || MOON_PHASE_RE.test(text) || COMPREHENSIVE_TASK_RE.test(text) || EXPERIMENT_OBSERVATION_RE.test(text) || VALUE_UNDERSTANDING_RE.test(text) || MEMORY_RECALL_RE.test(text) || SITUATION_APPLICATION_RE.test(text) || PROCESS_FLOW_RE.test(text) || CONCEPT_COMPARISON_RE.test(text) || METHOD_STRATEGY_RE.test(text) || RELATIONSHIP_STRUCTURE_RE.test(text) || CHART_READING_RE.test(text) || AESTHETIC_RE.test(text) || ERROR_CORRECTION_RE.test(text) || EXACT_VISUAL_RE.test(text) || (DIAGRAM_INTENT_RE.test(text) && CONCEPT_RE.test(text))
}

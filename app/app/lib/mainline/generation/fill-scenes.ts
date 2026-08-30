/**
 * fill-scenes · P2-2 内容填充层(LLM)
 *
 * 逐 scene 让 LLM 把 compile-lesson 生成的空骨架替换成针对具体 KP 的真实教学内容。
 * 保留结构字段(sceneType/visualLayout/characterLayer/sceneTechnique/dialogueLayout/etc.),
 * 覆写内容字段，并把呈现/交互/降级说明重新对齐当前真实课堂能力。
 *
 * 硬约束:
 * - 每 scene prompt 塞入前面 scene 已生成的 teacherScript 摘要 → 强制不复述(消除
 *   compile 阶段"4 段讲同一 KP"的观感)
 * - Zod schema 严格但字段少;失败重试 3 次,由 callLLMJson 统一处理
 * - LLM 只干填槽,结构层完全不动 → 与 compile-lesson 分层
 * - 填完跑 auditMainlineCourse,blocking===0 → qualityStatus='passed';否则'blocked'
 */

import { z } from 'zod'
import { metaphorsFor, toneRulesFor } from '@maolab/pedagogy'
import { IMAGE_SCENE_TYPES, misconceptionSourcesOf, type LessonScene, type MainlineCourse, type SceneType, type SubjectId } from '../domain.js'
import { normalizeAiVerifyClaims, normalizeGroundedContrastClaim } from '../ai-verify.js'
import {
  ASSESSMENT_ACTION_LABELS,
  assessmentActionKindsIn,
  practiceAlignmentReasons,
} from '../assessment-alignment.js'
import { learningGoalContractProblems } from '../learning-goal-contract.js'
import { normalizeFunctionPlotSlots } from '../presentation/content-forms.js'
import { SERIAL_HOOK_MAX, SERIAL_HOOK_SLOT, type SeasonInjection } from '../season.js'
import { auditMainlineCourse, blockingQualityIssues, recapNeedsDeeperAction, studentProjectionMetaProblems, type QualityIssue } from '../quality-gates.js'
import {
  practiceAnswerLeakReasons,
  practiceFeedbackQualityReasons,
  practiceTaskMaterialReasons,
} from '../practice-feedback.js'
import {
  ensureStudentActionEvidence,
  ensureWorkedExampleSelfExplanation,
  workedExampleActionHasSelfExplanation,
  WORKED_EXAMPLE_SELF_EXPLANATION_CUE,
} from '../learning-action.js'
import { ensureObservationPanelTitles } from '../presentation/observation-content.js'
import { conceptTemplatePrompt, normalizeConceptContentSlots } from '../concept-template.js'
import { normalizeRecapContentSlots, recapTemplatePrompt, recapTransferTaskProblems } from '../recap-template.js'
import { runtimeSceneContractFor } from '../runtime-interaction.js'
import { lessonOpeningCopy, lessonPhaseGenerationContract } from '../lesson-phase.js'
import type { KpMistakeEvidence } from '../mastery-store.js'
import { teacherScriptForSpeech } from '../speech-text.js'
import { teacherScriptLoadProblems, teacherScriptPromptBudget } from '../teacher-script-load.js'
import { sceneContentSlotProblems } from '../scene-content-slots.js'
import { workedExampleScaffoldProblems } from '../worked-example-scaffold.js'
import { callLLMJson } from '../../v2/llm.js'

/**
 * 学科特化教学手法提示 · round06 决策 3(王老师反馈 fill-scenes 缺学科 prior)。
 * 每门课的 LLM 生成时按学科经典手法走,不再给通用讲解。
 */
const SUBJECT_HINTS: Partial<Record<SubjectId, string>> = {
  chinese: '诗词/文言主动使用朗读停顿标记、句读、意象分组、字形辨析等文学教学手法;引用原文时给出完整句子而非零散词汇。',
  math: '公式给出后必须用一个具体数值代入示范一次;强调单位与换算;几何题主动画辅助线并说明理由。',
  physics: '公式给出后必须代入示例数值;明确物理量单位;变量关系用"当 A 增大,B 如何"这样的对应句;必要时用受力图或过程图。',
  chemistry: '化学方程式必须配平;反应条件/颜色/相态用短标签明确标出(如△、催化剂、↑↓);主动分类反应类型(化合/分解/置换/复分解)。',
  biology: '结构必须与功能一一对应说明(如"细胞膜半透 → 允许水分子进出");生命过程按阶段推进,不跳步;涉及分类时给出上位概念。',
  history: '主动使用时间轴组织事件;点明因果链而非只列事实;人物-事件-地点-影响四要素齐全;数字精确到年(如"220 年曹丕称帝")。',
  geography: '涉及大量地名/位置记忆时,**主动使用经典助记法**(如中国 34 省级行政区的"两湖两广两河山,五江云贵福吉安,四西二宁青甘陕,内蒙台海北上天"七字口诀);位置按分区组织(如沿海/内陆/边疆,或东部/中部/西部三大区),避免让学生死记硬背。',
  english: '词汇给出音标或读音提示;句法主动拆解主谓宾结构;语义比对靠中英语境对照,不脱离具体用例。',
  science: '走"观察-假设-实验-结论"标准科学方法顺序;强调变量控制;实验步骤给可操作细节。',
  general: '按知识类型选主流手法:结构类走对应图,过程类走阶段图,规律类走关系图。',
}

/**
 * 学科内容形态契约(方向二·学科内容形态库,2026-07-22,docs/design-refresh/
 * 2026-07-22-k12-presentation-space.md §3):内容以其原生形态落**显式结构化槽**,
 * 渲染端有对应专属渲染器(行内 LaTeX→MathJax;timelineEvents→时间线;
 * dialogueScript→对话剧本)。铁律:渲染端只认显式槽键,禁正则猜测内容类型
 * (contentType 架构判例);teacherScript 是口语讲稿会被 TTS 朗读,公式在讲稿里
 * 用自然语言读法(如「n 平方加 n 加 41」),严禁 LaTeX 进讲稿。
 */
const CONTENT_FORM_RULES: Partial<Record<SubjectId, string>> = {
  math: '数学式(分数/根号/上下标/运算式)在 contentSlots 与 boardText 里一律写行内 LaTeX,用 \\( … \\) 包裹(如 \\(n^2+n+41\\)、\\(\\frac{s}{t}\\)),渲染端有 MathJax 专业排版;禁用 Unicode 上下标(²₃)。注意 JSON 字符串里反斜杠必须双写(\\\\times 而非 \\times,否则被转义损坏)。teacherScript 口语讲稿里公式用自然语言读法,严禁 LaTeX。硬规则:只要本幕呈现函数图像/坐标系(画某函数的图),contentSlots **必须**额外含 funcPlotPoints 键——这是不上屏的渲染数据,不是学生作图任务。格式「x,y x,y …」,每个连续分支内按 x 严格递增;直线只需定义域端点或教学任务指定点,曲线每个连续分支至少 4 个准确采样点;多个连续分支用「 | 」分隔。同时加 funcDomain(「xmin,xmax」)、funcKeyPoints(「类型:(x,y);…」,如「零点:(-1,0);顶点:(1,-4)」)、funcExpr(函数式行内 LaTeX)。定义域内有无定义点时还必须加 funcBreakpoints(如「x=1;x=-2」),断点不能写入采样点,两侧必须分支。严禁为了满足渲染数据要求,在 problem/task/studentAction/teacherScript 里要求学生“均匀取至少 8 个点”;学生取点数量必须服从描点法、两点法等本课方法。采样点必须由你按函数算准(渲染器只连点不求值,点错图就错)。均为**附加键**,原必填槽照常输出。另,只要本幕呈现平面几何图形(三角形/四边形等),contentSlots **必须**额外含 geoVertices 键——顶点「名(x,y)」分号分隔(如「A(0,0);B(4,0);C(4,3)」);并加 geoEdges(「AB;BC;CA」)、geoAngleLabels(「∠ABC=90°;∠BAC=37°」,直角务必标 90°)、可选 geoAuxLines(辅助线作法「→」分隔,每步「作CD⊥AB于D:理由」)。坐标由你按题设精确给定(渲染器按坐标画,坐标错图就错)。均为附加键。',
  physics: '物理公式与带单位的量在 contentSlots 与 boardText 里一律行内 LaTeX \\( … \\)(如 \\(v=\\frac{s}{t}\\)、\\(9.8\\,\\mathrm{m/s^2}\\));禁用 Unicode 上下标。teacherScript 里公式用自然语言读法。硬规则:只要本幕做受力分析(分析某物体受到的各个力),contentSlots **必须**额外含 forceVectors 键——每行一个力,格式「标签|类型|大小|单位|角度|颜色角色」;角度以物体右侧水平为 0°、逆时针为正(重力=270,竖直向上=90,水平向右=0,水平向左=180,沿斜面等按实际方向给角度值);颜色角色取 gravity/normal/friction/applied/tension 之一(如 mg|重力|50|N|270|gravity)。大小/方向由你按题给定并保证正确(渲染器只精确绘制不推导)。它是**附加键**,本幕原必填槽照常输出。',
  chemistry: '化学式与方程式在 contentSlots 与 boardText 里一律行内 LaTeX \\( … \\)(下标用 _,条件写在箭头上,如 \\(2H_2 + O_2 \\xrightarrow{\\text{点燃}} 2H_2O\\));禁用 Unicode 下标。teacherScript 里用自然语言读法。',
  history: '硬规则:只要本幕内容(任何槽/板书)出现 2 个以上带年代的事件,contentSlots **必须**额外含 timelineEvents 键——每行一个事件,格式「年代|事件短句」(如「约170万年前|元谋人生活于云南」「220|曹丕称帝」),按时间升序;它是**附加键**,本幕原必填槽照常输出,内容可与其重叠。',
  english: '硬规则:只要本幕教学对象是对话/情景交际(问答、问诊、问路、购物等场景),contentSlots **必须**额外含 dialogueScript 键——每行一句,格式「说话人: 台词」(说话人用英文名如 Amy/Ben,台词英文原文,行尾可用(  )附简短中文提示);它是**附加键**,本幕原必填槽(题面/步骤/任务等)照常输出。',
}

/** 剩余 typed 渲染器的显式槽契约。每条只描述输入数据,不让 LLM 推导渲染结果。 */
const TYPED_RENDERER_RULES: Partial<Record<SubjectId, string>> = {
  math: '几何图必须同时给 geoVertices、geoEdges、geoAngleLabels；边端点必须存在且不得省略边后让渲染器猜形状。',
  chemistry: '若呈现化学方程式,必须加 chemEquation(完整式)、chemEquationAtoms(每行「元素:反应物计数=生成物计数」),可加 chemEquationCondition、chemEquationStates、chemEquationEnergy(放热/吸热)。若呈现分子结构,必须加 molStructure、molAtoms(每行「元素:数量」)、molBonds(每行「原子1-原子2:键级」,键级1/2/3),可加 molBondAngle、molFunctionalGroup；连接拓扑必须完整,禁止让图片模型画结构式。',
  physics: '若呈现电路,必须加 circuitTopology(每行「id|类型|数值|单位」,类型只取 battery/resistor/bulb/switch/ammeter/voltmeter)和 circuitConnections(每行「idA-idB」)；所有端点必须存在且电路连通,只给题设拓扑,不要写串并联推导结果。',
  chinese: '文言文加 classicalText、classicalGloss(每行「词|释义|语法标签」)、classicalTranslation(与原文逐行对齐)；拼音加 pinyinSyllables(每行「声母|韵母|声调1-4|例字」)；病句加 faultySentence、sentenceDiagnosis(每行「错误类型|错误片段|错误原因」)、sentenceCorrection。三类按教学对象选一类,槽不得残缺。',
  english: '词汇教学加 vocabCards(每行「word|ipa|pos|meaning_zh|example_en|example_zh_hint」)；句型拆解加 sentenceParse(每行「segment|role|depth」,depth 从0开始且至少一段为0)。按教学对象选一类,不要把字段拼成普通段落。',
  biology: '结构图解必须加 structureCallouts(每行「结构名|功能一句话|所属系统可选」),至少2条且结构名唯一；结构与功能必须成对,不要求 LLM 编造图中坐标。',
}

/** 内容形态附加键的幕型适用面:对话/时间线只对这些教学动作幕有意义,开场/收束不塞。 */
const CONTENT_FORM_SCENE_TYPES: readonly SceneType[] = ['concept-build', 'worked-example', 'practice', 'visual-observation', 'contrast']

function contentFormConstraint(subject: SubjectId, sceneType: SceneType): string | null {
  if (!CONTENT_FORM_SCENE_TYPES.includes(sceneType)) return null
  const typed = TYPED_RENDERER_RULES[subject] ? ` 另:${TYPED_RENDERER_RULES[subject]}` : ''
  if (subject === 'history') {
    return ' 另:本幕内容若出现 2 个以上带年代的事件,contentSlots 必须再加 timelineEvents 键(每行「年代|事件短句」,按时间升序,是附加键不替代上述必填键)。' + typed
  }
  if (subject === 'english') {
    return ' 另:本幕教学对象若是对话/情景交际(问答/问诊/问路等),contentSlots 必须再加 dialogueScript 键(每行「说话人: 台词」,说话人用英文名,台词英文原文,是附加键不替代上述必填键)。' + typed
  }
  if (subject === 'physics') {
    return ' 另:本幕若做受力分析,contentSlots 必须再加 forceVectors 键(每行「标签|类型|大小|单位|角度|颜色角色」,角度以物体右侧水平为 0°、逆时针为正:重力270、竖直向上90、水平向右0、水平向左180;颜色角色取 gravity/normal/friction/applied/tension;是附加键不替代上述必填键)。' +
      ' 另:本幕若涉及几何光学(平面镜成像/凸透镜/凹透镜成像/折射/棱镜色散),contentSlots 必须再加 opticsScene 键——' +
      '首行「scene|类型」取 convex-lens/concave-lens/convex-parallel/concave-parallel/plane-mirror/refraction/prism 之一,其后每行「键|数值」只给原始物理量:' +
      '透镜成像给 u(物距cm)、f(焦距cm,正数)、h(物高);**平行光会聚/发散(物在无穷远、"平行光射向透镜"这类场景)用 convex-parallel / concave-parallel,只给 f,禁止用超大 u 去模拟平行光**;' +
      '平面镜给 u、h;折射给 n1、n2、theta1(入射角度数,0–89);棱镜给 n、theta1、apex(顶角,默认60)。' +
      '**只给这些取值,绝不要描述光线怎么走、像在哪、放大还是缩小**——光线路径、像距、虚实正倒全部由渲染器按薄透镜成像公式/反射定律/Snell 定律算出。' +
      '是附加键不替代上述必填键。' + typed
  }
  if (subject === 'math') {
    return ' 另:本幕若画函数图像/坐标系,contentSlots 必须再加 funcPlotPoints(不上屏的渲染数据;分支内按 x 递增,直线用端点或任务指定点,曲线每个连续分支≥4个准确点,分支间用「 | 」)+ funcDomain(「xmin,xmax」)+ funcKeyPoints(「类型:(x,y);…」)+ funcExpr(函数式 LaTeX);有无定义点再加 funcBreakpoints(如「x=1;x=-2」),断点不进采样点。严禁把渲染采样数写成学生“至少取8个点”的任务,学生取点服从本课方法。若呈现平面几何图形,必须再加 geoVertices(「A(0,0);B(4,0);C(4,3)」)+ geoEdges(「AB;BC;CA」)+ geoAngleLabels(「∠ABC=90°」,直角标90°)+可选 geoAuxLines;坐标/采样点按题设算准,是附加键不替代上述必填键。' + typed
  }
  return typed || null
}

export interface FillLLMCall {
  (params: { system: string; user: string; schema: z.ZodSchema; temperature?: number }): Promise<unknown>
}

export const PRACTICE_QUALITY_RETRY_EXHAUSTED = 'PRACTICE_QUALITY_RETRY_EXHAUSTED' as const
export const SCENE_CONTENT_QUALITY_RETRY_EXHAUSTED = 'SCENE_CONTENT_QUALITY_RETRY_EXHAUSTED' as const

export class SceneGenerationQualityError extends Error {
  readonly code: string

  constructor(
    readonly sceneId: string,
    readonly sceneType: SceneType,
    readonly attempts: number,
    readonly reasons: readonly string[],
    code: string = SCENE_CONTENT_QUALITY_RETRY_EXHAUSTED,
  ) {
    super([
      `${sceneType} 幕 ${sceneId} 连续 ${attempts} 次未通过专属页面内容检查，已停止生成，避免保存空白或字段错位的页面。`,
      ...reasons.map((reason, index) => `${index + 1}. ${reason}`),
    ].join('\n'))
    this.name = 'SceneGenerationQualityError'
    this.code = code
  }
}

/**
 * 模型连续修正后仍未产出可作答练习。调用层据此区分内容质量失败与服务故障，
 * 既不保存半成品，也能把具体原因交给备课界面。
 */
export class PracticeGenerationQualityError extends SceneGenerationQualityError {
  constructor(
    sceneId: string,
    attempts: number,
    reasons: readonly string[],
  ) {
    super(sceneId, 'practice', attempts, reasons, PRACTICE_QUALITY_RETRY_EXHAUSTED)
    this.name = 'PracticeGenerationQualityError'
  }
}

const defaultLLM: FillLLMCall = params => callLLMJson({
  system: params.system,
  user: params.user,
  schema: params.schema,
  temperature: params.temperature ?? 0.5,
  timeoutSec: 90,
  maxAttempts: 3,
})

const ContentSlotValueSchema = z.preprocess(value => {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return value
  return value.map(item => item.trim()).filter(Boolean).join('\n')
}, z.string().min(1))

const ContentSlotsSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).filter(([, slot]) => {
    if (typeof slot === 'string') return slot.trim().length > 0
    if (Array.isArray(slot) && slot.every(item => typeof item === 'string')) {
      return slot.some(item => item.trim().length > 0)
    }
    return true
  }))
}, z.record(ContentSlotValueSchema).refine(o => Object.keys(o).length >= 2, {
  message: 'contentSlots 至少 2 键',
}))

export const FillOutputSchema = z.object({
  contentSlots: ContentSlotsSchema,
  visualFocus: z.string().min(2),
  narrationAnchor: z.string().min(2),
  boardText: z.array(z.string().min(2)).min(2).max(5),
  // 字符上限只防畸形输出。真实课堂负荷在口语化、补锚点和补教学提示后，
  // 按逐页时长做动态验收；公式源码长度不能冒充口播长度。
  teacherScript: z.string().min(40).max(600),
  studentAction: z.string().min(6),
  evidenceOnScreen: z.array(z.string().min(1)).min(2).max(6),
})

type FillOutput = z.infer<typeof FillOutputSchema>

const GoalsRefineSchema = z.object({
  goals: z.array(z.object({
    goalId: z.string().min(1),
    statement: z.string().min(10),
    successSignal: z.string().min(10),
    nonGoals: z.array(z.string()).min(1).max(4).optional(),
  })).min(1).max(20),
})

interface SceneRoleSpec {
  sceneType: SceneType
  label: string
  mission: string
  constraints: string
}

const SCENE_ROLES: Record<SceneType, SceneRoleSpec> = {
  'source-reading': {
    sceneType: 'source-reading',
    label: '源读 / 引入',
    mission: '让学生看清本课主题与学习目录，唤起已有经验，并在接触解释前先写下一个预测。具体结论和判断依据全部留给后续页面。',
    constraints: '讲稿只做问题定向，不讲答案；contentSlots 只写 topic / learningPath / openingQuestion 三类开场信息；板书只提示"先预测 / 找证据 / 再修正"。narrationAnchor 应指向课程主题本身。',
  },
  'visual-observation': {
    sceneType: 'visual-observation',
    label: '观察 / 分层',
    mission: '把 KP 的关键要素拆成 3 层(可以是要素/成分/分类/阶段),分别用一句话说清楚。学生沿 A→B→C 路径认识对象整体。',
    constraints: 'contentSlots 必须成对包含 panelATitle / panelA、panelBTitle / panelB、panelCTitle / panelC。三个 Title 各 2-12 字,是配图下三层结构的短标题；三个 panel 各 15-60 字,是与标题逐项对应的具体说明。boardText 是教师板书总结,可以独立组织,不得拿来代替或扩充三层画面结构。narrationAnchor 指向"三层关键要素"。禁止重复源读页的"我们要学 X"式引导。',
  },
  'concept-build': {
    sceneType: 'concept-build',
    label: '概念建构',
    mission: '本页是全片段的讲授核心:老师把定义/规律/方法**正面教出来**——它是什么、每个要点/步骤为什么成立、什么时候用。给出规范陈述 + 一个具体正例;程序性知识则给出方法步骤清单 + 每步的道理。学生此页以听讲和理解为主,不做题。',
    constraints: 'contentSlots 至少含 statement / example 二键(程序性知识:statement 写方法的完整步骤要点,example 用一个最简实例走一遍)。板书写定义/规律/步骤要点。teacherScript 必须逐点讲解 statement 的内容与道理,是本课讲授密度最高的一页,严禁写成任务布置。',
  },
  'worked-example': {
    sceneType: 'worked-example',
    label: '例题演算',
    mission: '给一个完整可讲的例题，并把它改造成“完成题”：先展示已经完成的前序步骤，只撤掉一个关键步骤让学生补写并说明依据；随后揭晓完整步骤，再进入下一页独立练习。',
    constraints: 'contentSlots 必须含 problem / completionPrompt / steps 三键。completionPrompt 直接写出题面已经给出的 1-2 个步骤或信息，表述必须用「…已给出…」「图中已有…」「已经求得/画出/列出…」「第一步已…」这类明示“已给”的措辞(内容检查按这些措辞核验已给信息是否写明),再把且只把一个关键步骤替换为【待补】,并明确要求学生说明补步依据(含「依据/理由/为什么」字样)。不得写“已完成前两步,现在轮到你”这类幕后流程旁白(写实际内容,如「图中已有四个力,拉力为 6 N」),不得泄露空缺答案,也不得把整道题重新交给学生从头做。steps 保存完整解法。板书写关键步骤。studentAction 必须同时要求学生补关键一步并说明依据、核对后再解释一个关键步骤；禁止只跟读、照抄或同步抄写完整解法。contentSlots 另必含 promptScript 键——学生先作答那一页的教师讲稿(70-150字,自然口语):先用课堂口吻把题面/说法带读一遍,点一个思考切入点(先看哪个条件/先判断什么),再做分层引导——给还没有思路的学生一句搭台阶的提示,给已完成的学生一句自查或进阶动作;严禁出现答案、结论、正误判定或关键步骤。teacherScript 是揭晓页讲稿:讲透答案与依据之后必须补分层跟进——答错的学生按哪一步重走一遍,答对的学生用哪个追问或小变式再进一步;不能只报答案。',
  },
  contrast: {
    sceneType: 'contrast',
    label: '辨析 / 纠错',
    mission: '选一个初学者最容易踩的真实误区(误解句/错答/混淆),给出正确判别。误区必须是真实、初学者会犯的,不是稻草人。',
    constraints: 'contentSlots 必须含 misconception / correction 二键。同学(peer)在此页承担误区暴露者角色。misconception 用学生第一人称口吻写(如"我觉得…是不是…"),它会由同学角色亲口念出,禁止"同学X认为"式第三人称转述。narrationAnchor 应指向"误区"或"判别依据"。contentSlots 另必含 promptScript 键——学生先作答那一页的教师讲稿(70-150字,自然口语):先用课堂口吻把题面/说法带读一遍,点一个思考切入点(先看哪个条件/先判断什么),再做分层引导——给还没有思路的学生一句搭台阶的提示,给已完成的学生一句自查或进阶动作;严禁出现答案、结论、正误判定或关键步骤。teacherScript 是揭晓页讲稿:讲透答案与依据之后必须补分层跟进——答错的学生按哪一步重走一遍,答对的学生用哪个追问或小变式再进一步;不能只报答案。',
  },
  practice: {
    sceneType: 'practice',
    label: '练习',
    mission: '给学生一个可以独立完成、并能直接证明本知识点成功信号是否达成的小任务。',
    constraints: 'contentSlots 至少含 task / feedback 二键。task 与 studentAction 必须覆盖本幕成功信号中的全部可观察动作，不能只检核其中一个更窄的子技能。课堂首次作答画面只显示 task，因此 task 必须自足：凡要求判断选项、重排语段、观察图表或填句子，都要把实际候选项、语段、数据和空缺直接写进 task，禁止只写“屏幕上三条”“给定材料”“下列选项”却省略材料。task 只写题干、已知条件、材料和作答要求，严禁出现答案、算完的数值、完成的推导、正确选项或结论。feedback 必须同时写清答案或完成标准、关键依据，以及一个典型错误对应的具体订正动作；不能只说“做得很好”“请核对”或只报最终答案。contentSlots 另必含 promptScript 键——学生先作答那一页的教师讲稿(70-150字,自然口语):先用课堂口吻把题面/说法带读一遍,点一个思考切入点(先看哪个条件/先判断什么),再做分层引导——给还没有思路的学生一句搭台阶的提示,给已完成的学生一句自查或进阶动作;严禁出现答案、结论、正误判定或关键步骤。teacherScript 是揭晓页讲稿:讲透答案与依据之后必须补分层跟进——答错的学生按哪一步重走一遍,答对的学生用哪个追问或小变式再进一步;不能只报答案。',
  },
  recap: {
    sceneType: 'recap',
    label: '收束 / 路径复盘',
    mission: '把源读→观察→辨析 3 步压成一条学习路径(3-4 个短节点),给出一句已经建立的结论。学生不能照着结论复述,而要解释、举例、迁移或修正开场预测。',
    constraints: 'contentSlots 至少含 path / takeaway 二键。path 必须用"→"连接 3-5 个短节点(每节点 ≤12 字),这是路径图的渲染格式。takeaway 会以大字直接上屏,所以 studentAction 禁止只写复述/背诵/朗读；必须要求学生用新例子解释、迁移到新情境,或回看开场预测说明一处修正。**不允许再讲新内容**,只做沉淀。narrationAnchor 应指向"学习路径"或"收束"。',
  },
  'ai-verify': {
    sceneType: 'ai-verify',
    label: 'AI 找茬 / 误概念验证',
    mission: '基于给定的误概念原文呈现一句似是而非的待核查说法(可能是一条,也可能合并了同一片段的多条误区),学生先独立判断,下一张投影片再呈现核查结论。这是刻意设计的教学教具,不是真实错误。',
    constraints: 'contentSlots 必须含 aiClaim / reveal 二键,这是合并粗槽,任何情况下都要填(单条误区时就是那一条改写;多条误区合并进本幕时,aiClaim 连续列出全部错误说法,reveal 是对应的合并核查结论)。aiClaim 必须紧扣本幕给定的误区原文,改写成一句可独立判断的自然表述;每条误区都要出现、不得偏离、不得替换或编造其他错误。不要添加“AI 助教”“小助”“AI 说”等角色前缀。合并多条时额外按 user 提示输出 aiClaimN/revealN 细分槽。讲稿直接引导学生判断说法和引用证据,不要解释内部生成角色。narrationAnchor 应指向"找茬"或"判别依据"。contentSlots 另必含 promptScript 键——学生先作答那一页的教师讲稿(70-150字,自然口语):先用课堂口吻把题面/说法带读一遍,点一个思考切入点(先看哪个条件/先判断什么),再做分层引导——给还没有思路的学生一句搭台阶的提示,给已完成的学生一句自查或进阶动作;严禁出现答案、结论、正误判定或关键步骤。teacherScript 是揭晓页讲稿:讲透答案与依据之后必须补分层跟进——答错的学生按哪一步重走一遍,答对的学生用哪个追问或小变式再进一步;不能只报答案。',
  },
  'ai-inquiry': {
    sceneType: 'ai-inquiry',
    label: 'AI 提问链 / 浅问与追问对比',
    mission: '给出同一个话题下两组真实的问答样本:一组是浅层提问得到的平庸回答,另一组是追问后 AI 暴露边界或给出更有价值的回答。学生借此学习怎么问出好问题。',
    constraints: 'contentSlots 必须含 shallowSample / probingSample 二键,每键都要同时包含"问"与"AI 答"两部分文字,不能只写问题或只写答案。两个样本必须是具体、可对比的真实内容,不能用"随便问问"这类空泛描述。',
  },
  'ai-collab': {
    sceneType: 'ai-collab',
    label: 'AI 协作任务 / 提示词与验证评价',
    mission: '给学生一个用 AI 完成的小任务卡,以及配套的评价量规——评的是提示词质量与验证过程,不是最终答案对不对。',
    constraints: 'contentSlots 必须含 task / rubric 二键。rubric 要列出至少两条可观察的评价维度(如"提示词是否给了约束条件""是否核实了 AI 的答案"),不得只写"完成即可"这类不可评价的标准。',
  },
}

function sceneRoleFor(scene: LessonScene): SceneRoleSpec {
  const base = SCENE_ROLES[scene.sceneType]
  const conceptTemplate = conceptTemplatePrompt(scene)
  if (conceptTemplate?.id === 'strategy-cycle') {
    return {
      ...base,
      label: `概念建构 / ${conceptTemplate.label}`,
      mission: conceptTemplate.mission,
      constraints: `${conceptTemplate.constraints} boardText 只留“时机—步骤—自检”的最小线索；studentAction 必须让学生提交适用情境、执行结果和自检回答。narrationAnchor 应指向“${conceptTemplate.narrationAnchor}”。`,
    }
  }
  const template = recapTemplatePrompt(scene)
  if (!template) return base
  return {
    ...base,
    label: `收束 / ${template.label}`,
    mission: template.mission,
    constraints: `${template.constraints} takeaway 会直接上屏，所以 studentAction 禁止只写复述、背诵或朗读；必须要求学生解释关系、引用证据、迁移应用或修正开场预测。不允许再讲新内容。narrationAnchor 应指向“${template.narrationAnchor}”。`,
  }
}

const SCENE_EVIDENCE_RULES: Record<SceneType, string> = {
  'source-reading': '只激活先备知识并让学生提出一个预测或疑问；不要提前给出后续页才建立的完整答案，也不要要求学生完成最终成功信号。',
  'visual-observation': '让学生辨认、标注或比较 2-3 个可观察特征，产出观察记录；不要重复开场目标，也不要直接做整课终结性复述。',
  'concept-build': '让学生用自己的话说出本幕建立的关系，并用一个例子或依据解释；证据必须比观察页推进一步。',
  'worked-example': '用 completionPrompt 直接呈现题面已经给出的步骤，只留一个【待补】关键空缺；让学生补步并说明依据。不要写“已完成前两步”“当前只需完成下一步”等幕后流程说明，不要让学生从头重做整题，也不要只抄完整解法。',
  contrast: '让学生指出一处错误、给出修正并说出判别依据；只评本幕误区，不重复整课全部任务。',
  practice: '让学生独立完成接近成功信号的任务；题面不能同时泄露完整答案，feedback 才承担反馈。',
  recap: 'takeaway 会作为完整结论上屏；transferTask 必须给出只改变一个条件的具体新题，并要求学生判断、解释、计算或产出作品。不得只写“举个新例子/迁移到新情境”，也不得把答案写进题面。',
  'ai-verify': '让学生定位待核查说法中的具体错误并引用本课证据纠正；不要再次机械复述所有已知事实。',
  'ai-inquiry': '让学生比较浅问与追问的差别，改写出一条更有效的追问并说明理由。',
  'ai-collab': '让学生提交可检查的提示词或验证记录，并按量规自评；不把 AI 输出本身当学习证据。',
}

function sceneEvidenceRule(scene: LessonScene): string {
  const template = conceptTemplatePrompt(scene)
  if (template?.id === 'strategy-cycle') {
    return '让学生写出一个可观察的适用情境，按 2-5 个短步骤执行策略，并回答自检问题；不能用朗读定义或指出例子代替策略表现。'
  }
  return SCENE_EVIDENCE_RULES[scene.sceneType]
}

/**
 * 开场页只负责建立问题意识，不应由自由生成模型决定知识结论。
 *
 * source-reading 的实际画面只读取课程主题和知识点目录；过去模型却仍会把教材事实、
 * 后续结论和完整成功信号写进讲稿、板书与 evidenceOnScreen，造成学生尚未预测就已
 * 听到答案。这里把开场内容收敛为只依赖课程结构元数据的确定性模板：模型仍参与
 * 其余教学页，但无论返回什么，都不能覆盖开场的“先预测、后取证”顺序。
 */
function sourceReadingOutput(course: MainlineCourse, season?: SeasonInjection): FillOutput {
  const topic = course.topic.trim() || '本课主题'
  const anchor = topic.slice(0, 28)
  const kpTitles = course.sourceMaterial.map(source => source.title.trim()).filter(Boolean)
  const continuity = season?.prevEpisode
    ? `上一课的问题先留在心里，今天从 ${anchor} 继续追。`
    : `这节课围绕 ${anchor} 展开。`
  const opening = lessonOpeningCopy({
    topic,
    kpTitles,
    continuity,
    ...(course.lessonPhase ? { phase: course.lessonPhase } : {}),
  })

  return {
    contentSlots: {
      topic,
      learningPath: opening.learningPath,
      openingQuestion: opening.openingQuestion,
    },
    visualFocus: topic,
    narrationAnchor: anchor,
    boardText: opening.boardText,
    teacherScript: opening.teacherScript,
    studentAction: opening.studentAction,
    evidenceOnScreen: [topic, ...kpTitles.slice(0, 4), opening.evidenceLabel],
  }
}

function deepenRecapAction(scene: LessonScene, output: FillOutput): FillOutput {
  const actionUsesTransferTask = /迁移题|新题|条件变化/.test(output.studentAction)
  if (!recapNeedsDeeperAction(output.studentAction) && actionUsesTransferTask) return output
  const template = recapTemplatePrompt(scene)
  const cue = template
    ? `${template.label}只是线索；请先独立完成屏幕上的迁移题，写出判断和依据，再回看开场预测。`
    : '路径只是线索；请先独立完成屏幕上的迁移题，写出判断和依据，再回看开场预测。'
  const deepenedScript = `${output.teacherScript} ${cue}`
  return {
    ...output,
    teacherScript: deepenedScript,
    studentAction: '独立完成屏幕迁移题，写出判断和依据，再回看并修正开场预测',
  }
}

function deepenWorkedExampleOutput(output: FillOutput): FillOutput {
  if (workedExampleActionHasSelfExplanation(output.studentAction)) return output
  const cue = `步骤展开后，不要只核对答案。${WORKED_EXAMPLE_SELF_EXPLANATION_CUE}。`
  const deepenedScript = output.teacherScript.includes(WORKED_EXAMPLE_SELF_EXPLANATION_CUE)
    ? output.teacherScript
    : `${output.teacherScript} ${cue}`
  return {
    ...output,
    teacherScript: deepenedScript,
    studentAction: ensureWorkedExampleSelfExplanation(output.studentAction),
  }
}

/** 新旧模型输出统一补齐观察页三层标题；教师板书保持独立。 */
function contentSlotsForScene(scene: LessonScene, contentSlots: Record<string, string>, boardText: string[]): Record<string, string> {
  const normalized = scene.sceneType === 'recap'
    ? normalizeRecapContentSlots(scene, contentSlots, boardText)
    : scene.sceneType === 'concept-build'
      ? normalizeConceptContentSlots(scene, contentSlots, boardText)
      : scene.sceneType === 'visual-observation'
        ? ensureObservationPanelTitles(contentSlots, boardText)
        : scene.sceneType === 'contrast'
          ? normalizeGroundedContrastClaim(scene, contentSlots)
          : scene.sceneType === 'ai-verify'
            ? normalizeAiVerifyClaims(scene, contentSlots)
            : contentSlots
  return normalizeFunctionPlotSlots(normalized)
}

function generatedOutputProblems(
  course: MainlineCourse,
  scene: LessonScene,
  output: FillOutput,
): { output: FillOutput; reasons: string[] } {
  const contentSlots = contentSlotsForScene(scene, output.contentSlots, output.boardText)
  const normalized = { ...output, contentSlots }
  const reasons = [
    ...sceneContentSlotProblems(scene, contentSlots),
    ...(scene.sceneType === 'worked-example'
      ? workedExampleScaffoldProblems({ contentSlots })
      : []),
    ...teacherScriptLoadProblems(course, scene, output.teacherScript),
    ...studentProjectionMetaProblems({
      visualFocus: output.visualFocus,
      boardText: output.boardText,
      studentAction: output.studentAction,
      contentSlots,
    }),
  ]
  // 双讲稿验收(2026-08-25 用户裁决:题目两页讲稿不能一致,先答页要有自己的引导):
  // 作答类幕必须给出先答页讲稿 promptScript,且它不得泄露揭晓内容。
  const STAGED_TYPES = ['worked-example', 'practice', 'contrast', 'ai-verify'] as const
  if ((STAGED_TYPES as readonly string[]).includes(scene.sceneType)) {
    const promptScript = contentSlots.promptScript?.trim() ?? ''
    if (promptScript.length < 40) {
      reasons.push('promptScript 缺失或过短:先答页需要 70-150 字的读题引导+思考切入点+分层引导讲稿')
    } else {
      const revealText = [contentSlots.steps, contentSlots.feedback, contentSlots.reveal, contentSlots.correction]
        .filter(Boolean).join(' ')
      if (revealText) reasons.push(...practiceAnswerLeakReasons(promptScript, revealText))
    }
  }
  if (scene.sceneType === 'recap') {
    return {
      output: normalized,
      reasons: [...reasons, ...recapTransferTaskProblems(contentSlots.transferTask)],
    }
  }
  if (scene.sceneType !== 'practice') return { output: normalized, reasons }

  const task = contentSlots.task ?? ''
  const feedback = contentSlots.feedback ?? ''
  return {
    output: normalized,
    reasons: [
      ...reasons,
      ...practiceAnswerLeakReasons(task, feedback),
      ...practiceTaskMaterialReasons(task),
      ...practiceFeedbackQualityReasons(feedback),
      ...practiceAlignmentReasons(sceneSuccessSignal(course, scene), task, output.studentAction),
    ],
  }
}

function speechReadyOutput(output: FillOutput): FillOutput {
  const narrationAnchor = teacherScriptForSpeech(output.narrationAnchor)
  let teacherScript = teacherScriptForSpeech(output.teacherScript)
  if (!teacherScript.includes(narrationAnchor)) {
    teacherScript = `${teacherScript} 我们再回到 ${narrationAnchor} 这一点。`
  }
  return { ...output, narrationAnchor, teacherScript }
}

function finalizeGeneratedOutput(scene: LessonScene, output: FillOutput): FillOutput {
  // 先保证画面锚点进入口播；迁移提示属于可选增强，不能挤掉“所见即所闻”的基础契约。
  const speechReady = speechReadyOutput(output)
  const deepened = scene.sceneType === 'recap'
    ? deepenRecapAction(scene, speechReady)
    : scene.sceneType === 'worked-example'
      ? deepenWorkedExampleOutput(speechReady)
      : speechReady
  return {
    ...deepened,
    studentAction: ensureStudentActionEvidence(scene.sceneType, deepened.studentAction),
  }
}

interface SceneSummary { label: string; excerpt: string; facts?: string }

interface FillOneParams {
  course: MainlineCourse
  scene: LessonScene
  sceneIndex: number
  priorSummaries: SceneSummary[]
  llmCall: FillLLMCall
  season?: SeasonInjection
  /** v5 M1 单幕 regen 专用:后一幕已有内容摘要,防止"改中间幕"与已定的后续幕矛盾或重复。 */
  nextSummary?: SceneSummary
  /** 事实核查回修专用:把核查结论作为本次重写的强约束,不改变场景结构。 */
  repairInstructions?: readonly string[]
  /** 复习课专用(2026-08-25 DeepTutor 借鉴票2):本课各 KP 的真实误答证据,幕级按 kpId 注入。 */
  mistakes?: readonly KpMistakeEvidence[]
}

/** 幕带 kpId 时反查该 KP 名,让 LLM 只围绕本幕知识点展开;开场/收束等课级幕返回 undefined。 */
function sceneFocusKpName(course: MainlineCourse, scene: LessonScene): string | undefined {
  if (!scene.kpId) return undefined
  return course.sourceMaterial.find(s => s.kpId === scene.kpId)?.title
}

function sceneGoalPromptLines(course: MainlineCourse, scene: LessonScene): string[] {
  const fragment = course.learningFragments.find(item => item.sceneIds.includes(scene.id))
  const focusedGoal = scene.kpId
    ? course.goals.find(goal => goal.kpId === scene.kpId)
      ?? course.goals.find(goal => goal.id === fragment?.goalId)
    : undefined
  const goals = focusedGoal ? [focusedGoal] : course.goals

  return goals.flatMap(goal => [
    `${focusedGoal ? '本幕' : '本课'}学习目标[${goal.id}]:${goal.statement}`,
    `${focusedGoal ? '本幕' : '本课'}成功信号[${goal.id}]:${goal.successSignal}`,
  ])
}

function sceneSuccessSignal(course: MainlineCourse, scene: LessonScene): string {
  if (!scene.kpId) return ''
  const fragment = course.learningFragments.find(item => item.sceneIds.includes(scene.id))
  return course.goals.find(goal => goal.kpId === scene.kpId)?.successSignal
    ?? course.goals.find(goal => goal.id === fragment?.goalId)?.successSignal
    ?? fragment?.successSignal
    ?? ''
}

/**
 * 成功信号是验收标准，不是给模型看的抽象口号。练习生成时把其中每个可观察
 * 动作翻译成明确任务标签，避免模型只复述“完成任务”而漏掉作图、解释或迁移。
 */
function practiceActionRequirement(course: MainlineCourse, scene: LessonScene): string {
  const signal = sceneSuccessSignal(course, scene)
  const actions = assessmentActionKindsIn(signal)
  if (actions.length === 0) return '本知识点成功信号未解析出额外动作；任务仍须具体、可独立作答。'
  return `首次作答的 task 与 studentAction 必须逐项明确要求学生完成：${[...new Set(actions)]
    .map(action => ASSESSMENT_ACTION_LABELS[action])
    .join('、')}。不得只写“完成任务”“独立作答”或“写出答案”代替这些动作。`
}

function sceneSourcePromptLines(course: MainlineCourse, scene: LessonScene): string[] {
  const sources = scene.kpId
    ? course.sourceMaterial.filter(source => source.kpId === scene.kpId)
    : course.sourceMaterial
  if (sources.length === 0) return ['本幕来源状态:没有可追溯来源；不得编造教材原句或出处。']

  const lines = ['本幕可用来源（严格区分原文、目录定位和 AI 线索）:']
  for (const source of sources) {
    const excerpt = source.excerpt?.trim()
    const status = source.provenance?.evidenceStatus
      ?? (excerpt && !/待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i.test(excerpt)
        ? 'authoritative-excerpt'
        : 'curriculum-metadata')

    if (status === 'authoritative-excerpt' && excerpt) {
      lines.push(`- 权威摘录[${source.title}]:${excerpt.slice(0, 500)}`)
    } else if (status === 'ai-extracted' && excerpt) {
      lines.push(`- AI 提取线索[${source.title}]:${excerpt.slice(0, 500)}（未经权威复核，不得当作教材原句或唯一事实依据）`)
    } else if (status === 'unverified-excerpt' && excerpt) {
      lines.push(`- 未核验摘录[${source.title}]:${excerpt.slice(0, 500)}（来源权威性尚未确认，不得当作教材原句或唯一事实依据）`)
    } else {
      lines.push(`- 教材定位[${source.title}]:${source.citation ?? '只有知识点名称'}（仅定位课程目录，不提供原文；不得伪造教材引文）`)
    }

    for (const resource of source.candidateResources ?? []) {
      const revealRule = resource.revealPolicy === 'explanation-only'
        ? '只能在学生先作答后的解释阶段使用，不得提前放进观察或提问页'
        : '呈现时机尚未审核，不得自动放进学生页面'
      lines.push(`  - 备课配图候选:${resource.title}${resource.citation ? `；${resource.citation}` : ''}；${revealRule}。当前模型没有读取图片，不得推断图中细节。`)
    }
  }
  lines.push('只有“权威摘录”可以作为教材原文引用；其余内容必须按学科共识表述并留待教师复核。')
  return lines
}

/**
 * v5 骨架去重合并:ai-verify 幕的误区原文可能是 1 条也可能是合并后的多条
 * (misconceptionSourcesOf 统一读取,见 domain.ts)。单条时提示与旧版逐字一致
 * (不引入无谓差异);多条时额外要求逐条列出误区原文,并给出合并粗槽
 * (aiClaim/reveal)+ 细分槽(aiClaimN/revealN)的产出说明。细分槽会被派生为
 * 独立的待判断页与核查结论页,溯源闸门也会按下标逐条核对。
 */
function buildAiVerifyPromptLines(sources: readonly string[]): string[] {
  if (sources.length === 0) return [`本幕的误区原文(必须紧扣改写,不得替换或编造新的错误):「」`]
  if (sources.length === 1) {
    return [
      `本幕的误区原文(必须紧扣改写,不得替换或编造新的错误):「${sources[0]}」`,
      'aiClaim 必须改写为一句自然、可独立判断的待核查说法,可以换措辞但不能偏离这句原文表达的错误判断;不要添加角色名或说话人前缀。',
    ]
  }
  return [
    `本幕合并了 ${sources.length} 条误区原文,找茬清单必须连续呈现 ${sources.length} 条待核查说法,每条紧扣其中一条原文改写,不得替换或编造新的错误、不得遗漏任何一条:`,
    ...sources.map((s, i) => `- 误区原文 ${i + 1}:「${s}」`),
    '请按以下要求输出 contentSlots:',
    `- aiClaim:连续列出全部 ${sources.length} 条错误说法,供合并展示;不要添加角色名或说话人前缀。`,
    '- reveal:对上面全部错误的合并核查结论与判别依据,一段完整文字。',
    ...sources.map((_, i) => `- aiClaim${i + 1} / reveal${i + 1}:第 ${i + 1} 条待核查说法与对应核查结论(供逐条投影片渲染),aiClaim${i + 1} 必须紧扣误区原文 ${i + 1} 改写,不得偏离或替换。`),
  ]
}

function buildContrastPromptLines(sources: readonly string[]): string[] {
  const source = sources.map(item => item.trim()).find(Boolean)
  if (!source) {
    return ['本幕缺少经教材或教研确认的误区来源，不得自行编造错误说法；该结构应在生成前被质量闸门阻断。']
  }
  return [
    `本幕唯一可使用的误区原文：「${source}」`,
    '- contentSlots.misconception 可以改写成自然的学生口吻，但必须紧扣这句原文，不得替换或编造另一种错误。',
    '- contentSlots.correction 必须给出纠偏结论和可执行的判别依据；依据仍需接受后续事实核查。',
  ]
}

async function fillOneScene(params: FillOneParams): Promise<FillOutput> {
  const { course, scene, sceneIndex, priorSummaries, llmCall, season, nextSummary, repairInstructions, mistakes } = params
  if (scene.sceneType === 'source-reading') return sourceReadingOutput(course, season)
  const role = sceneRoleFor(scene)
  const kpNames = course.sourceMaterial.map(s => s.title).join('、')
  const subjectHint = SUBJECT_HINTS[course.subject]
  const scriptBudget = teacherScriptPromptBudget(course, scene)
  // v4 M1 教研资产注入:学段语气契约 + 隐喻白名单/禁用讲法(命中本课 KP 才出现)
  const tone = toneRulesFor(course.gradeBand)
  const kpHaystack = [course.topic, ...course.sourceMaterial.map(s => s.title)]
  const metaphors = metaphorsFor(course.subject, course.gradeBand, kpHaystack)

  const system = [
    `你是给中小学生填写课堂内容的教学内容作者。任务:为一节 ${course.scenes.length} 幕课程的第 ${sceneIndex + 1} 幕填充教学内容。`,
    `本幕定位:${role.label}。`,
    `本幕任务:${role.mission}`,
    `本幕学习证据设计:${sceneEvidenceRule(scene)}`,
    `本课学习时期契约:${lessonPhaseGenerationContract(course.lessonPhase)}`,
    // 复习课幕级错因注入:该 KP 有真实误答证据时,练习/辨析/找茬必须针对错因设计变式,
    // 不复用原题原答案。证据为学生反馈后自评(暂定),契约允许驱动加练设计。
    ...(course.lessonPhase === 'review' && scene.kpId
      ? (mistakes ?? []).filter(m => m.kpId === scene.kpId).slice(0, 2).map((m, i) => [
          `学生在本知识点的真实误答证据 ${i + 1}(来自上次课堂,揭晓前把握度:${m.confidence}):`,
          `- 当时题目:${m.task.slice(0, 160)}`,
          `- 学生原答:${m.attemptText.slice(0, 120)}`,
          `- 揭晓后错因订正:${m.reflectionText.slice(0, 160)}`,
          `硬要求:本幕若是练习/辨析/找茬,题目必须换情境或换表征做成变式,直击上述错因(不得复用原题题面);feedback/reveal 必须点名该错误模式并给出针对性订正动作;把握度为 high 的误答优先修正其错误规则本身。`,
        ].join(' '))
      : []),
    ...(subjectHint ? [`本学科(${course.subject})特化教学手法:${subjectHint}`] : []),
    ...(CONTENT_FORM_RULES[course.subject] ? [`本学科内容形态契约(渲染端有专属排版,必须遵守):${CONTENT_FORM_RULES[course.subject]}`] : []),
    ...(TYPED_RENDERER_RULES[course.subject] ? [`本学科 typed 渲染器槽契约:${TYPED_RENDERER_RULES[course.subject]}`] : []),
    `本学段语气契约:${tone.voice}`,
    `学段禁用措辞(出现即不合格):${tone.banned.map(b => `「${b.phrase}」`).join('')}`,
    ...(metaphors.approved.length > 0 ? [
      '隐喻白名单(教研审定;讲解命中概念时只许用它们,且讲稿必须主动点破比喻的失灵边界):',
      ...metaphors.approved.map(m => `- 「${m.metaphor}」映射:${m.mapping}。必须点破的边界:${m.knownLimits}`),
    ] : []),
    ...(metaphors.banned.length > 0 ? [
      '禁用讲法(已被证伪或超学段,严禁出现):',
      ...metaphors.banned.map(m => `- 「${m.metaphor}」——${m.reason ?? m.knownLimits ?? ''}${m.replacement ? ` 改用:${m.replacement}` : ''}`),
    ] : []),
    // 内容形态附加键并进硬约束行:实测放在旁侧提示位时模型只输出必填键,
    // 只有 constraints 行的键要求会被稳定服从(2026-07-22 两轮 regen 验证)
    `本幕硬约束:${role.constraints}${contentFormConstraint(course.subject, scene.sceneType) ?? ''}`,
    '严格规则:',
    '- 只输出一个合法 JSON 对象,不要 markdown 代码块,不要额外说明。',
    ...(IMAGE_SCENE_TYPES.includes(scene.sceneType)
      ? ['- 本幕会另行生成一整幅教学插图,讲稿可以指图讲解(如"看画面左侧")。']
      : ['- 本幕没有也不会有配图——visualFocus/boardText/teacherScript 严禁出现「看这幅图/如图/图中/示意图/拼合图/分布图」等任何指图表述;visualFocus 写教学对象本身,不写图名。']),
    '- teacherScript 必须包含 narrationAnchor 一模一样的文本片段。',
    `- teacherScript 约 ${scriptBudget.suggestedMinCharacters}-${scriptBudget.suggestedMaxCharacters} 个中文等效字符,自然口语,口播不超过 ${Math.floor(scriptBudget.estimatedSpeechBudgetSec)} 秒；英文词、数字和公式读法也占口播时间。只讲一个学习动作，至少给学生留 20% 页面时间观察、书写或回应，不要"我们首先来学习""接下来"这类套话。`,
    '- 内容必须针对当前 KP 具体展开,不能只重复 KP 名字。',
    '- teacherScript 是老师在课堂上对学生**讲课**的话:先把本页知识内容本身讲清楚(它是什么/每一步为什么成立/什么时候用),再自然引出学生要做的事。禁止通篇任务导语——「请判断/请核验/写下/找出」这类指令句不得构成讲稿主体;讲授页(概念建构/观察/例题演算)的讲稿必须以内容讲解为主体。',
    '- teacherScript 的受众是学生本人,严禁出现「请学生」「引导学生」「让学生」等面向教师的备课话术。',
    '- 整节课共同达成成功信号；studentAction、contentSlots 与 evidenceOnScreen 在本幕只收集与本幕定位相符的一步证据。练习页必须直接检核该知识点的完整成功信号；其他页面不要重复完整成功信号。',
    '- 不要照抄前面幕的讲稿——每幕教学动作不同,内容也应不同。',
    '- **绝不与前面幕矛盾**:前幕已给出的答案、结论、口诀、要素名称、正误判定,本幕必须原样沿用;尤其收束幕只能复述已建立的结论,不得引入新判断或反转答案。',
    ...(scene.sceneType === 'recap' ? [
      '- contentSlots.transferTask 是学生独立完成的近迁移题：题面必须给出一个与本课同构但未出现过的具体场景，只改变一个条件、对象、材料、数据或表征，并明确要求判断、解释、计算、比较、改写、标注或产出作品。题面必须用「换成/如果/另一/新(场景|情境|对象|数据)/不同」之一明示这次改变了什么(内容检查按这些措辞核验变化是否点明),如「把水平桌面换成斜面」「另一个物体悬挂在绳上」。',
      '- transferTask 不得只写“举一个新例子”“迁移到新情境”或让学生自行设计题目；不得出现答案、结论、算完的结果或“因此/所以”后的正确判断。',
      '- studentAction 必须明确要求学生独立完成 transferTask 并写出判断与依据；回看开场预测可以作为第二步，不能替代迁移作答。',
    ] : []),
    ...(scene.sceneType === 'practice' ? [
      practiceActionRequirement(course, scene),
    ] : []),
    '- 严禁「回第X幕」「见第X页」「第X幕的…」式跨页指路——页序会动态展开,页码必然指错,「幕」还是学生看不见的内部概念;需要引用此前内容时把要点直接复述在本页。',
    '- 不要写"画面左侧/画面右侧/左边/右边"这类方位词——版式由渲染端动态决定,方位会失准;指画面时统一说"画面上/屏幕上"。',
    '- 引用词语、短语一律用直角引号「」,严禁用半角单引号\'…\'或半角双引号"…"包裹中文(数学撇号、英寸符等非引用用途不受此限)。',
  ].join('\n')

  const priorBlock = priorSummaries.length === 0
    ? '(这是第一幕,无前置)'
    : priorSummaries.map(p => `- ${p.label} 已定内容:${p.facts ?? ''} | 讲稿节选:${p.excerpt.slice(0, 80)}…`).join('\n')

  const user = [
    `课程主题:${course.topic}`,
    `涉及知识点:${kpNames}`,
    `学段:${course.gradeBand}  学科:${course.subject}`,
    ...sceneSourcePromptLines(course, scene),
    ...sceneGoalPromptLines(course, scene),
    `本课边界(不做什么):${course.boundary}`,
    ...(repairInstructions && repairInstructions.length > 0 ? [
      '',
      '事实核查回修要求(本次重写的最高优先级):',
      ...repairInstructions.map((instruction, index) => `${index + 1}. ${instruction}`),
      '必须同步修正 contentSlots、boardText、teacherScript 与 evidenceOnScreen 中涉及上述问题的全部表述；不要只在末尾追加一句补丁，也不要引入本课边界外的新事实。',
    ] : []),
    '',
    `本幕 sceneType:${scene.sceneType}`,
    ...(sceneFocusKpName(course, scene) ? [`本幕聚焦知识点(内容只围绕它展开):${sceneFocusKpName(course, scene)}`] : []),
    // 辨析幕只使用编译期随 scene 固化的教材/教研误区来源。不能在整课主题上重新
    // 搜索一个“看起来相关”的误区替换它，否则多知识点课程会发生误区错绑。
    ...(scene.sceneType === 'contrast' ? buildContrastPromptLines(misconceptionSourcesOf(scene)) : []),
    // v5 M2 ai-verify 溯源:错误说法必须紧扣生成期落档的误区原文改写,不得替换或编造
    // (quality-gates 的溯源闸门会逐条校验 aiClaim/细分槽与各自原文的重合度)。
    // 骨架去重合并后,一幕可能携带 1 条或多条误区原文——单条时提示与旧版一致,
    // 多条时额外要求产出 aiClaimN/revealN 细分槽,便于渲染逐条揭底(向前预留)。
    ...(scene.sceneType === 'ai-verify' ? buildAiVerifyPromptLines(misconceptionSourcesOf(scene)) : []),
    // v4 M2 课程季:开场承接由确定性模板处理；自由模型只负责收束钩子与中间幕禁剧情。
    ...(season ? [
      `本课属于课程季「${season.seasonTitle}」第 ${season.episodeNo} 集,季主题:${season.seasonTheme}。`,
      ...(scene.sceneType === 'recap' ? [
        `结尾钩子(硬性):contentSlots 额外输出 ${SERIAL_HOOK_SLOT} 键——一句「下集预告」悬念(≤40 字,硬上限 ${SERIAL_HOOK_MAX} 字)。钩子从**本课留下的自然疑问**出发,保持开放,**不得点名任何未学知识点名词**(下一集内容未定,点名会落空);不得剧透未学结论。`,
      ] : []),
      ...(scene.sceneType !== 'recap' ? [
        '本幕不得出现任何剧情/连续剧措辞(承接与预告只属于开场和收束幕)。',
      ] : []),
    ] : []),
    `本幕 visualLayout(不要改):${scene.visualLayout}`,
    `本幕 dialogueLayout(不要改):${scene.dialogueLayout}`,
    `本幕 sceneTechnique(不要改):${scene.sceneTechnique}`,
    `本幕对话角色:${scene.characterLayer.castId ?? '(无角色出场)'} 表情:${scene.characterLayer.expression ?? 'neutral'}`,
    `本幕语气基调:${scene.gradeTone}`,
    '',
    '前面已生成的幕(不要重复):',
    priorBlock,
    '',
    ...(nextSummary ? [
      '后面已经定稿的幕(内容已定,本幕不得与它矛盾,也不要提前讲它的内容):',
      `- ${nextSummary.label} 已定内容:${nextSummary.facts ?? ''} | 讲稿节选:${nextSummary.excerpt.slice(0, 80)}…`,
      '',
    ] : []),
    '请输出以下字段的 JSON:',
    '- contentSlots: 对象,键值都是字符串,至少 2 键,每值 10-60 字',
    '- visualFocus: 本幕视觉焦点的具体对象名(不是"关键要素"这类框架词;也不要以"文字/板书/示意"等载体词收尾——它会作为本幕标题显示,写教学对象本身,如"串联电路三点电流读数")',
    '- narrationAnchor: 讲解锚定到画面上的具体词/短语',
    '- boardText: 2-5 条板书文字,每条 5-25 字,承载教学信息不是通用词',
    `- teacherScript: 老师讲解稿,约 ${scriptBudget.suggestedMinCharacters}-${scriptBudget.suggestedMaxCharacters} 个中文等效字符,口播不超过 ${Math.floor(scriptBudget.estimatedSpeechBudgetSec)} 秒；只讲一个学习动作并留一次学生回应停顿；必须包含 narrationAnchor 完整字样`,
    '- studentAction: 学生在本幕要做的具体动作,10-40 字。不能只写阅读、观察、思考、听讲、拖动或确认；保留这些操作后，还必须要求学生说出判断、标注证据、写出理由或提交作品，留下教师可检查的学习证据',
    '- evidenceOnScreen: 画面上出现的具体证据(词/短语/句),2-6 条',
  ].join('\n')

  let output = await llmCall({ system, user, schema: FillOutputSchema }) as FillOutput
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // 必须在口语化、补画面锚点和补教学动作之后验收；否则确定性补句会把
    // 一个模型阶段看似合格的讲稿推过页面时长，却仍被保存。
    const checked = generatedOutputProblems(course, scene, finalizeGeneratedOutput(scene, output))
    if (checked.reasons.length === 0) return checked.output

    if (attempt === maxAttempts) {
      if (scene.sceneType === 'practice') {
        throw new PracticeGenerationQualityError(scene.id, maxAttempts, checked.reasons)
      }
      throw new SceneGenerationQualityError(scene.id, scene.sceneType, maxAttempts, checked.reasons)
    }

    const repairUser = [
      user,
      '',
      `上一次输出未通过“${role.label}”专属页面检查（第 ${attempt} 次验收），必须完整重写后再输出：`,
      ...checked.reasons.map((reason, index) => `${index + 1}. ${reason}`),
      `- 严格使用本幕约定的核心槽键：${role.constraints}`,
      ...(scene.sceneType === 'practice' ? [
        '- task 是首次作答画面的唯一内容，必须直接包含全部题设、候选项、语段、数据和空缺位置。',
        '- 不得用“屏幕上三条”“给定材料”“下列选项”等指代未写入 task 的内容；材料放不下时改成自足的小任务。',
        '- task 只保留学生作答前可见的题设、材料、已知条件和作答要求。',
        '- task 不得出现算完的数值、连续推导、正确选项、方向结论、正误判定或答案提示。',
        '- feedback 同时写完整答案或完成标准、关键步骤或判别依据，以及一个典型错误对应的具体订正动作。',
        `- 本知识点成功信号：${sceneSuccessSignal(course, scene)}`,
        `- ${practiceActionRequirement(course, scene)}`,
        '- teacherScript、boardText 和 evidenceOnScreen 可以讲清教学组织，但不要把 feedback 的答案复制回 task。',
      ] : []),
      ...(scene.sceneType === 'recap' ? [
        '- transferTask 必须给出完整的新条件和作答要求，只改变一个变量；不得把新情境留给学生自己发明。',
        '- transferTask 必须用「换成/如果/另一/新(场景|情境|对象|数据)/不同」之一明示这次改变了什么,否则无法通过核验。',
        '- transferTask 只写题面，不写答案、结论或算完的结果。',
        '- studentAction 改为独立完成该迁移题并写出判断与依据。',
      ] : []),
      ...(['worked-example', 'practice', 'contrast', 'ai-verify'].includes(scene.sceneType) ? [
        '- contentSlots.promptScript 必填:先答页教师讲稿 70-150 字——带读题面、点一个思考切入点、分层引导(没思路的学生给提示台阶,已完成的给自查/进阶动作);严禁答案、结论、正误判定或关键步骤。',
      ] : []),
      ...(scene.sceneType === 'worked-example' ? [
        '- completionPrompt 必须以明示“已给”的措辞写出题面已给信息(用「…已给出…」「图中已有…」「已经求得/画出/列出…」「第一步已…」之一起句),否则无法通过核验。',
        '- completionPrompt 恰好一个【待补】,并含「依据/理由/为什么」等要求学生说明补步依据的字样。',
        '- 【待补】前后不得出现该空缺的答案、结果或“所以/因此/解得”式结论。',
      ] : []),
      `上一次不合格输出：${JSON.stringify(output)}`,
    ].join('\n')

    output = await llmCall({ system, user: repairUser, schema: FillOutputSchema, temperature: 0.3 }) as FillOutput
  }

  return output
}

/**
 * 在不改变 goalId/kpId 映射的前提下,把编译期目标润色为可观察、可考核表述。
 * 输出少一项、多一项、重复或改写 goalId 都整批回退,避免目标错绑到其他 KP。
 */
async function refineGoals(
  course: MainlineCourse,
  llmCall: FillLLMCall,
): Promise<MainlineCourse['goals']> {
  const kpNames = course.sourceMaterial.map(s => s.title).join('、')
  const subjectHint = SUBJECT_HINTS[course.subject]

  const system = [
    `你是资深教研员,任务是逐项润色这节课已有的 ${course.goals.length} 个学习目标。每个知识点必须保留一个独立目标,不得合并或遗漏。`,
    '硬约束:',
    '- 目标句必须使用可直接观察的学生行为(能说出/能解释/能判断/能对比/能计算/能画出/能操作等),禁止只写“了解、理解、知道、认识、熟悉、掌握、识记”。',
    '- 成功信号(successSignal)必须描述**具体、可以在课堂上观察或测的行为**(如"学生能在空白地图上标出 34 个省级行政区名称,准确率 80% 以上")。',
    '- 每个成功信号必须能由该知识点的一页独立练习直接检核；不要把三个互不相干的作品、操作或任务捆成一个无法在单页完成的标准。',
    '- 不得为了迁就模板把学科核心能力偷换成“理解”或“知道”；若目标本质需要作图、计算、朗读、实验或操作，必须明确写出对应行为。',
    '- 每个目标控制 15-40 字;成功信号 20-50 字。',
    '- 原样返回每项的 goalId,不得新建、改写、重复或省略。',
    '- 只输出一个合法 JSON 对象,不要 markdown 代码块。',
    ...(subjectHint ? [`本学科(${course.subject})特化教学手法:${subjectHint}`] : []),
  ].join('\n')

  const user = [
    `课程主题:${course.topic}`,
    `涉及知识点:${kpNames}`,
    `学段:${course.gradeBand}  学科:${course.subject}`,
    `课程边界(不做什么):${course.boundary}`,
    '待润色目标(每行必须一一返回):',
    ...course.goals.map(goal => {
      const kpName = course.sourceMaterial.find(source => source.kpId === goal.kpId)?.title ?? '课级目标'
      return `- ${goal.id} | 知识点:${kpName} | 当前目标:${goal.statement} | 当前成功信号:${goal.successSignal}`
    }),
    '',
    '请输出以下 JSON:',
    `- goals: 数组,必须恰好 ${course.goals.length} 项,每项含 goalId、statement(目标句)、successSignal(成功信号)、可选 nonGoals(不追求的能力,1-3 项)。`,
  ].join('\n')

  try {
    const output = await llmCall({ system, user, schema: GoalsRefineSchema, temperature: 0.4 }) as z.infer<typeof GoalsRefineSchema>
    const expectedIds = new Set(course.goals.map(goal => goal.id))
    const returnedIds = output.goals.map(goal => goal.goalId)
    if (returnedIds.length !== expectedIds.size
      || new Set(returnedIds).size !== returnedIds.length
      || returnedIds.some(id => !expectedIds.has(id))) {
      throw new Error(`目标映射不完整:期望 ${[...expectedIds].join(',')},收到 ${returnedIds.join(',')}`)
    }
    const refinedById = new Map(output.goals.map(goal => [goal.goalId, goal]))
    const invalidGoals = output.goals
      .map(goal => ({ goalId: goal.goalId, problems: learningGoalContractProblems(goal.statement, goal.successSignal) }))
      .filter(goal => goal.problems.length > 0)
    if (invalidGoals.length > 0) {
      throw new Error(`目标契约不合格:${invalidGoals.map(goal => `${goal.goalId}(${goal.problems.join('、')})`).join(';')}`)
    }
    return course.goals.map(original => {
      const refined = refinedById.get(original.id)!
      const nonGoals = refined.nonGoals ?? original.nonGoals
      return {
        ...original,
        statement: refined.statement,
        successSignal: refined.successSignal,
        ...(nonGoals ? { nonGoals } : {}),
      }
    })
  } catch (err) {
    console.warn('[fill-scenes] goals refine 失败,回退 compile-lesson 模板 goals:', err)
    return course.goals
  }
}

export interface FillScenesResult {
  course: MainlineCourse
  audit: QualityIssue[]
  blocking: QualityIssue[]
  /**
   * 连续重试仍未通过专属页面检查的幕:内容保持骨架原样(不保存不合格输出),
   * 课程整体照常落库并标 blocked,教师在备课中对这些幕逐页重生成。
   * 此前单幕失败会丢弃整课已生成内容并 422,一门 10 幕课任何一幕运气差
   * 就全盘重来(2026-08-25 真实 fill 一天撞四次)。
   */
  failedScenes: { sceneId: string; sceneType: SceneType; reasons: string[] }[]
}

/** 关键槽位全量摘要:答案、口诀、要素名一旦定下,后面的幕必须沿用
 * (真检 round07:60 字截断摘要导致 recap 反转 practice 的答案、三要素跨幕变体)。 */
function summarize(scene: LessonScene, label: string): SceneSummary {
  return {
    label,
    excerpt: scene.teacherScript,
    facts: Object.entries(scene.contentSlots).map(([k, v]) => `${k}=${v}`).join('；').slice(0, 240),
  }
}

export async function fillScenes(
  course: MainlineCourse,
  opts?: { llm?: FillLLMCall; season?: SeasonInjection; respectTeacherEdits?: boolean; mistakes?: readonly KpMistakeEvidence[] },
): Promise<FillScenesResult> {
  const llmCall = opts?.llm ?? defaultLLM
  // v5 M1:非 force 的整课 fill 默认保护教师手改幕(fill?force=1 走 respectTeacherEdits:false)。
  const respectTeacherEdits = opts?.respectTeacherEdits ?? true

  // 决策 2:先重写 goals(替换 compile-lesson 的模板套壳);失败自动回退原 goals。
  const refinedGoals = await refineGoals(course, llmCall)
  const refinedGoalById = new Map(refinedGoals.map(goal => [goal.id, goal]))
  const courseWithGoals: MainlineCourse = {
    ...course,
    goals: refinedGoals,
    learningFragments: course.learningFragments.map(fragment => {
      if (!fragment.kpId) return fragment
      const goal = refinedGoalById.get(fragment.goalId)
      return goal ? { ...fragment, successSignal: goal.successSignal } : fragment
    }),
  }

  const filledScenes: LessonScene[] = []
  const priorSummaries: SceneSummary[] = []
  const failedScenes: FillScenesResult['failedScenes'] = []

  for (const [index, scene] of courseWithGoals.scenes.entries()) {
    const label = `第 ${index + 1} 幕(${sceneRoleFor(scene).label})`

    if (respectTeacherEdits && scene.editedByTeacher) {
      // 教师已手改本幕:跳过重填,原样保留,但仍纳入后续幕的一致性上下文
      filledScenes.push(scene)
      priorSummaries.push(summarize(scene, `${label},教师已手改`))
      continue
    }

    let output: FillOutput
    try {
      output = await fillOneScene({ course: courseWithGoals, scene, sceneIndex: index, priorSummaries, llmCall, ...(opts?.season ? { season: opts.season } : {}), ...(opts?.mistakes ? { mistakes: opts.mistakes } : {}) })
    } catch (error) {
      if (!(error instanceof SceneGenerationQualityError)) throw error
      // 本幕连续重试均不合格:保留骨架原样继续往下,不让一幕拖垮整课。
      // 骨架占位文本不进上下文摘要正文——后续幕不得把它当已定内容沿用。
      failedScenes.push({ sceneId: scene.id, sceneType: scene.sceneType, reasons: [...error.reasons] })
      filledScenes.push(scene)
      priorSummaries.push(summarize(scene, `${label},本幕生成失败待重生成,内容未定`))
      continue
    }
    const filledScene: LessonScene = {
      ...scene,
      ...runtimeSceneContractFor(scene.sceneType),
      contentSlots: contentSlotsForScene(scene, output.contentSlots, output.boardText),
      visualFocus: output.visualFocus,
      narrationAnchor: output.narrationAnchor,
      boardText: output.boardText,
      teacherScript: output.teacherScript,
      studentAction: output.studentAction,
      evidenceOnScreen: output.evidenceOnScreen,
      // AI 重新生成覆盖了本幕内容,清除教师手改标记(只在 force 场景下会走到这里,
      // 因为非 force 时上面的 respectTeacherEdits 分支已经拦下了教师手改的幕)。
      editedByTeacher: false,
    }
    filledScenes.push(filledScene)
    priorSummaries.push(summarize(filledScene, label))
  }

  const audited = auditMainlineCourse({ ...courseWithGoals, scenes: filledScenes })
  const blocking = blockingQualityIssues(audited)
  const nextCourse: MainlineCourse = {
    ...courseWithGoals,
    scenes: filledScenes,
    // 有生成失败的幕时,即使闸门对骨架占位内容碰巧全放行,课程也不得标 passed
    qualityStatus: blocking.length === 0 && failedScenes.length === 0 ? 'passed' : 'blocked',
  }

  return { course: nextCourse, audit: audited, blocking, failedScenes }
}

export interface FillSceneResult {
  /** 重生成后的 scene(结构字段不变,内容字段被 AI 覆写,editedByTeacher 清除)。 */
  scene: LessonScene
}

/**
 * v5 M1 单页重生成核心:只对一个 scene 重跑 LLM 填槽,不动其余幕。
 * 跨幕一致性对策(v5 方案 §10 风险表第一行):把前面幕的已有内容(全量,非重新生成)
 * 和紧邻后一幕的已有内容都作为上下文注入,防止"改中间幕"引入矛盾或抢答后续内容。
 * 调用方(API 路由)负责落库、闸门重跑和 fact-audit,本函数只管单幕内容生成。
 */
export async function fillSceneInContext(
  course: MainlineCourse,
  sceneId: string,
  opts?: { llm?: FillLLMCall; season?: SeasonInjection; repairInstructions?: readonly string[] },
): Promise<FillSceneResult> {
  const llmCall = opts?.llm ?? defaultLLM
  const sceneIndex = course.scenes.findIndex(s => s.id === sceneId)
  if (sceneIndex === -1) throw new Error(`fillSceneInContext: scene not found: ${sceneId}`)
  const scene = course.scenes[sceneIndex]!

  const priorSummaries = course.scenes
    .slice(0, sceneIndex)
    .map((s, i) => summarize(s, `第 ${i + 1} 幕(${sceneRoleFor(s).label})`))
  const nextScene = course.scenes[sceneIndex + 1]
  const nextSummary = nextScene ? summarize(nextScene, `第 ${sceneIndex + 2} 幕(${sceneRoleFor(nextScene).label})`) : undefined

  const output = await fillOneScene({
    course, scene, sceneIndex, priorSummaries, llmCall,
    ...(opts?.season ? { season: opts.season } : {}),
    ...(nextSummary ? { nextSummary } : {}),
    ...(opts?.repairInstructions ? { repairInstructions: opts.repairInstructions } : {}),
  })
  const filledScene: LessonScene = {
    ...scene,
    ...runtimeSceneContractFor(scene.sceneType),
    contentSlots: contentSlotsForScene(scene, output.contentSlots, output.boardText),
    visualFocus: output.visualFocus,
    narrationAnchor: output.narrationAnchor,
    boardText: output.boardText,
    teacherScript: output.teacherScript,
    studentAction: output.studentAction,
    evidenceOnScreen: output.evidenceOnScreen,
    editedByTeacher: false,
  }
  return { scene: filledScene }
}

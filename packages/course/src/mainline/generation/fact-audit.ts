/**
 * fact-audit · v4 M1 事实核查步(docs/v4-master-plan-2026-07-13.md §3.1)
 *
 * 在 fill-scenes 之后对内容做断言级核查:抽取可判真伪的断言(数字/公式/因果/
 * 定义/史实),逐条判级:
 * - fatal      → blocking(事实/公式/数据错误,一票否决,绝不强制放行)
 * - misleading → warning(字面不算错但会诱导错误推广,须补条件限定)
 * - imprecise  → 中学以上 warning,小学 info(简化过度但方向正确,学段裁量)
 *
 * 核查不可用(LLM 失败)时降级为 info「本幕未验证」,不阻塞生成——但发现的
 * fatal 永远阻塞,这是与风格闸门(可将就)的本质区别。
 */

import { z } from 'zod'
import { misconceptionSourcesOf, type LessonScene, type MainlineCourse, type SourceMaterialRef } from '../domain.js'
import type { QualityIssue } from '../quality-gates.js'
import type { FillLLMCall } from './fill-scenes.js'
import { callLLMJson } from '../../v2/llm.js'
import { auditLocalCourseConsistency, isControlledErrorSlot, sceneUsesControlledErrorSlots } from './course-consistency.js'

const FactAuditSchema = z.object({
  claims: z.array(z.object({
    claim: z.string().min(4),
    verdict: z.enum(['ok', 'fatal', 'misleading', 'imprecise']),
    evidence: z.string().min(2),
    fix: z.string().optional(),
  })).max(12),
})

type FactAuditOutput = z.infer<typeof FactAuditSchema>

const defaultLLM: FillLLMCall = params => callLLMJson({
  system: params.system,
  user: params.user,
  schema: params.schema,
  temperature: params.temperature ?? 0.2,
  timeoutSec: 90,
  maxAttempts: 3,
})

/** 断言密集幕型全查;其余幕只在文本含数字/公式/单位时才查(控制 token 成本)。
 * v5 M2:ai-verify 的 reveal/揭底部分需要真实核查(揭底也要经得起事实核查)。 */
const ALWAYS_AUDIT_TYPES: readonly LessonScene['sceneType'][] = ['concept-build', 'worked-example', 'contrast', 'ai-verify']
const CLAIM_SIGNAL_PATTERN = /[0-9０-９]|[=≈><±%‰]|℃|千米|公里|千克|万年|亿|世纪|年代/
const SOURCE_PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i

/** 幕型 → 刻意展示的"错误槽"键匹配规则——该槽是教学教具(会被同幕其余内容纠正),
 * 不进核查文本(round09 实撞:核查官把误区槽原文判 FATAL;v5 M2 ai-verify 的
 * aiClaim 同理豁免)。ai-verify 用正则而非字面量键:骨架去重合并后一幕可能同时
 * 携带 aiClaim(合并粗槽)与 aiClaim1..N(细分槽),全部都是"AI 故意犯错"的原文,
 * 全部豁免;reveal/revealN 是老师揭底,不豁免,仍照常送审。 */
/**
 * 按 KP 汇总本课已标注的易混点(B-2,2026-07-27)。
 *
 * 来源是 contrast / ai-verify 幕的溯源字段——compile-lesson 保证它们逐字来自
 * 教材标注的 misconceptions,所以无需回查 DB,fact-audit 保持可脱库单测。
 */
function knownMisconceptionsByKp(course: MainlineCourse): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const scene of course.scenes) {
    if (!scene.kpId) continue
    const sources = misconceptionSourcesOf(scene)
    if (sources.length === 0) continue
    const bucket = map.get(scene.kpId) ?? []
    for (const text of sources) if (!bucket.includes(text)) bucket.push(text)
    map.set(scene.kpId, bucket)
  }
  return map
}

/**
 * 是否给本幕注入「已知易混点」。
 *
 * **contrast / ai-verify 一律不注入**——这两类幕的误区原文被受控错误槽规则
 * 特意排除在审查文本之外(round09 不变量,07-23 真检又复核过一次)。把误区当上下文
 * 喂回去,等于把刚排除的东西从另一个口子送进核查官眼里,会重新引发「把教具原文判 fatal」
 * 和「反推被排除说法」两类误杀。易混点要防的是**普通教学幕不小心把误区当正确结论讲出来**,
 * 那正是这两类幕之外的场景。
 */
function shouldInjectMisconceptions(scene: LessonScene): boolean {
  return !sceneUsesControlledErrorSlots(scene.sceneType)
}

function sceneText(scene: LessonScene): string {
  const slots = Object.entries(scene.contentSlots)
    .filter(([key]) => !isControlledErrorSlot(scene.sceneType, key))
    .map(([, value]) => value)
  return [scene.teacherScript, ...scene.boardText, ...slots].join('\n')
}

export function shouldAuditScene(scene: LessonScene): boolean {
  return ALWAYS_AUDIT_TYPES.includes(scene.sceneType) || CLAIM_SIGNAL_PATTERN.test(sceneText(scene))
}

export interface FactAuditResult {
  issues: QualityIssue[]
  /** 历史字段名；现表示所有事实发布阻断（fatal + misleading）。 */
  fatalCount: number
  auditedSceneCount: number
  auditedSceneIds: string[]
  requiredSceneIds: string[]
  unverifiedSceneIds: string[]
  consistencyAuditedSceneIds: string[]
  consistencyConflictCount: number
}

function nonPlaceholderExcerpt(source: SourceMaterialRef): string | undefined {
  const excerpt = source.excerpt?.trim()
  return excerpt && !SOURCE_PLACEHOLDER_PATTERN.test(excerpt) ? excerpt : undefined
}

function authoritativeExcerpt(source: SourceMaterialRef): string | undefined {
  const excerpt = nonPlaceholderExcerpt(source)
  if (!excerpt) return undefined
  if (!source.provenance) return excerpt
  return source.provenance.evidenceStatus === 'authoritative-excerpt' ? excerpt : undefined
}

function reviewClueExcerpt(source: SourceMaterialRef): string | undefined {
  const excerpt = nonPlaceholderExcerpt(source)
  const status = source.provenance?.evidenceStatus
  return status === 'ai-extracted' || status === 'unverified-excerpt' ? excerpt : undefined
}

export async function factAuditCourse(
  course: MainlineCourse,
  opts?: { llm?: FillLLMCall; sceneIds?: readonly string[] },
): Promise<FactAuditResult> {
  const llmCall = opts?.llm ?? defaultLLM
  const issues: QualityIssue[] = []
  let fatalCount = 0
  const auditedSceneIds: string[] = []
  const requiredSceneIds: string[] = []
  const unverifiedSceneIds: string[] = []

  // v5 M1 单幕重生成:只核查改动的 scene,不为一整课的其余幕重复烧 LLM。
  const targetScenes = opts?.sceneIds
    ? course.scenes.filter(scene => opts.sceneIds!.includes(scene.id))
    : course.scenes
  const explicitlyRequested = opts?.sceneIds !== undefined

  const groundTruth = course.sourceMaterial
    .flatMap(source => {
      const excerpt = authoritativeExcerpt(source)
      return excerpt ? [`- ${source.title}:${excerpt.slice(0, 320)}`] : []
    })
    .join('\n')
  const reviewClues = course.sourceMaterial
    .flatMap(source => {
      const excerpt = reviewClueExcerpt(source)
      return excerpt ? [`- ${source.title}:${excerpt.slice(0, 320)}`] : []
    })
    .join('\n')
  const sourceLocations = course.sourceMaterial
    .flatMap(source => {
      const provenance = source.provenance
      if (!source.citation && !provenance) return []
      const status = provenance?.evidenceStatus ?? 'legacy'
      return [`- ${source.title}:${source.citation ?? `${provenance!.source}${provenance!.externalId ? `，节点 ${provenance!.externalId}` : ''}`} [${status}]`]
    })
    .join('\n')

  const system = [
    '你是教材事实核查官。任务:抽取给定课堂文本中所有**可判真伪的断言**(数字、公式、因果关系、史实、定义、学科术语的使用),逐条判定。',
    '判级标准:',
    '- ok:与教材依据和学科共识一致。',
    '- fatal:事实/公式/数据/史实错误,或使用已被权威机构证伪的解释(如机翼升力"等时说")。**近义术语混用同属 fatal**:把一个概念说成与之相邻的另一个概念(如把「借物喻人」说成「借物抒情」、把「熔化」说成「溶解」),句子往往读来通顺却教错了概念,不得因"读着像对的"放过。',
    '- misleading:字面不算错,但缺少条件限定会诱导错误推广(如"重的东西下落快"不说明空气阻力条件)。这类表述必须补齐条件后才能用于正式授课。',
    '- imprecise:简化过度但方向正确。',
    '剧情性文本(角色动作、语气词)跳过,只审知识断言。宁可多标不可漏标 fatal。',
    '判断/选择型练习的题面选项(供学生判断的候选,常含刻意错误项)**不是断言**:只审正文对选项的判定与解答是否正确。正文已明确判定某选项错误的,不得把该选项本身判 fatal;只有把错误选项当正确结论教授、或解答本身算错时才判 fatal。',
    '每条断言给出 evidence(判定依据)与 fix(修正指令,ok 可省略)。',
    '只输出一个合法 JSON 对象:{"claims":[{claim,verdict,evidence,fix?}]}。无可查断言时输出 {"claims":[]}。',
  ].join('\n')

  const misconceptionsByKp = knownMisconceptionsByKp(course)

  for (const scene of targetScenes) {
    // 教研资产外化到核查官:本 KP 教材标注的易混点。通用提示对「近义术语混用」
    // 召回不稳(round13 实测 借物喻人/借物抒情 三处只抓 1 处),点名易混点后
    // 核查官有明确的比对目标,而不是靠自己想到这两个词容易混。
    const known = scene.kpId && shouldInjectMisconceptions(scene)
      ? misconceptionsByKp.get(scene.kpId) ?? []
      : []
    // 数字/公式信号只覆盖显眼事实错误；已知易混点通常没有这些信号，却可能散落在
    // 观察、练习等任意普通教学幕。只“给原本会审的幕加提示”仍会让这些幕在提示
    // 组装前被跳过。教研已标注易混点本身就是核查触发条件，且只扩大对应 KP 的范围。
    // 单页重生成与教师点击“核查本页”属于明确复核请求，不能再用批量成本筛选跳过。
    // 否则无数字的事实错误（如错置人物、地点或概念）会被当成“无需核查”而放行。
    if (!explicitlyRequested && !shouldAuditScene(scene) && known.length === 0) continue
    requiredSceneIds.push(scene.id)
    const user = [
      `学科:${course.subject}  学段:${course.gradeBand}  课程主题:${course.topic}`,
      '权威教材摘录(ground truth,与其冲突的断言判 fatal):',
      groundTruth || '(本课没有权威教材摘录；依学科共识核查。知识点标题、目录定位和 AI 提取线索都不是事实依据。)',
      ...(reviewClues
        ? ['', 'AI 提取或其他未核验的待复核线索(只能帮助发现待查点，不得作为判真依据):', reviewClues]
        : []),
      ...(sourceLocations
        ? ['', '来源定位(用于追溯，不等于原文证据):', sourceLocations]
        : []),
      '',
      ...(known.length > 0
        ? [
            '本知识点教材标注的已知易混点(教研资产,逐条比对):',
            ...known.map(text => `- ${text}`),
            '这类混淆的特征是**用错术语但句子读来通顺**,不会有数字或公式上的破绽。请专门检查本幕文本是否落入其中任意一条;落入即判 fatal,并在 fix 里写明正确术语与二者的分界。本幕不是辨析幕,不应出现把上述说法当作正确结论讲授的内容。',
            '',
          ]
        : []),
      ...(scene.sceneType === 'contrast'
        ? ['注意:本幕是辨析幕,任务是先引述学生误区再纠正。被明确标记为误区并已给出纠正的引述判 ok;只有被当作正确结论教授的错误断言才判 fatal。', '']
        : []),
      ...(scene.sceneType === 'ai-verify'
        ? [
            '注意:本幕是 AI 找茬幕,AI 助教故意给出一个或多个错误说法供学生找茬,这是刻意设计的教学教具,不是真实错误(AI 的原始错误说法已从下方待核查文本中排除,不会出现)。',
            '判定铁律:「揭底/找茬提示」中若出现对那些(已排除的)AI 说法的整体判定或指认(如「三处均有误」「上述说法错误」「AI 把因果说反了」),那是教具的标准答案键、针对的是你看不到的原始错误说法——**一律判 ok,绝不因这句判定本身判 fatal,也不要试图反推那些被排除的说法是否正确**。只有揭底在解释/纠正时**新引入的、可独立核查的知识事实**出错,才判 fatal。讲稿中引用错误说法但已明确标记为错误并纠正的部分判 ok。',
            '',
          ]
        : []),
      `待核查文本(第 ${course.scenes.indexOf(scene) + 1} 幕,${scene.sceneType}):`,
      sceneText(scene),
    ].join('\n')

    let output: FactAuditOutput
    try {
      output = await llmCall({ system, user, schema: FactAuditSchema, temperature: 0.2 }) as FactAuditOutput
    } catch (err) {
      console.warn(`[fact-audit] 第 ${course.scenes.indexOf(scene) + 1} 幕核查失败,降级为未验证:`, err)
      unverifiedSceneIds.push(scene.id)
      issues.push(makeIssue(scene.id, 'info', '事实核查未完成(核查服务失败),本幕断言未经验证。', '错误断言可能未被发现。', '重跑 fill 或人工复核本幕。', issues.length))
      continue
    }

    // 只有核查服务真实返回合法结果，才记录精确覆盖；异常降级不能冒充“已核查”。
    auditedSceneIds.push(scene.id)

    for (const claim of output.claims) {
      if (claim.verdict === 'ok') continue
      const severity = claim.verdict === 'fatal'
        ? 'blocking' as const
        : claim.verdict === 'misleading'
          ? 'blocking' as const
          : (course.gradeBand === 'middle-school' || course.gradeBand === 'high-school')
            ? 'warning' as const
            : 'info' as const
      if (severity === 'blocking') fatalCount += 1
      issues.push(makeIssue(
        scene.id,
        severity,
        `断言核查 ${claim.verdict.toUpperCase()}:「${claim.claim}」`,
        claim.evidence,
        claim.fix ?? '按核查依据修正该断言。',
        issues.length,
      ))
    }
  }

  // 跨幕一致性只做本地结构化比对，不把整课内容新增发送给外部服务。
  const consistency = auditLocalCourseConsistency(course, opts?.sceneIds)
  issues.push(...consistency.issues)
  fatalCount += consistency.issues.filter(issue => issue.severity === 'blocking').length

  return {
    issues,
    fatalCount,
    auditedSceneCount: auditedSceneIds.length,
    auditedSceneIds,
    requiredSceneIds,
    unverifiedSceneIds,
    consistencyAuditedSceneIds: consistency.auditedSceneIds,
    consistencyConflictCount: consistency.conflictCount,
  }
}

function makeIssue(
  sceneId: string,
  severity: QualityIssue['severity'],
  message: string,
  impact: string,
  fix: string,
  seq: number,
): QualityIssue {
  return {
    id: `pedagogy:scene:${sceneId}:fact-${seq + 1}`,
    gate: 'pedagogy',
    severity,
    targetType: 'scene',
    targetId: sceneId,
    message,
    impact,
    fix,
    autoFixable: false,
  }
}

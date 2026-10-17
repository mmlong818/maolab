/**
 * AI 试学 · 第一人称课程评估(2026-08-25,DeepTutor TutorBench 借鉴票4)
 *
 * 让 LLM 扮演目标学段的普通学生,把整课投影片(拆页后的真实放映序列)从头"上"一遍,
 * 报告卡壳点:哪页看不懂、题目哪里有歧义、讲稿哪里跳跃、页间衔接哪里断层。
 * 这是教师视角的自动真检,补足质量闸门(确定性规则)检不出的"学生体验"维度。
 *
 * 约束:只读课程、不落库、单次 LLM 调用;报告是排查线索,不是评分,更不改变
 * qualityStatus——课程能不能上仍由确定性闸门与事实核查决定。
 */
import { z } from 'zod'
import { callLLMJson } from '../v2/llm.js'
import type { GradeBand, MainlineCourse } from './domain.js'
import { lessonPresentationPages, presentationScene } from './presentation/presentation-pages.js'

const GRADE_PERSONA: Record<GradeBand, string> = {
  'lower-primary': '小学低年级学生,识字量有限,只能理解直白短句',
  'upper-primary': '小学高年级学生,能读懂课本语言,抽象推理刚起步',
  'middle-school': '初中生,基础中等,新概念需要例子支撑,容易被跳步骤的推导甩开',
  'high-school': '高中生,基础中等,能跟上正式表达,但对含糊的条件和跳跃的因果敏感',
}

const TryoutPageIssueSchema = z.object({
  pageNo: z.number().int().min(1),
  kind: z.enum(['看不懂', '题目歧义', '讲稿跳跃', '衔接断层', '信息缺失']),
  detail: z.string().min(8).max(200),
})

export const TryoutReportSchema = z.object({
  /** 一段话:这节课作为学生上下来的整体感受与最大障碍。 */
  overall: z.string().min(20).max(400),
  /** 卡壳点清单;没有问题的页不出现。空数组=全程顺畅。 */
  issues: z.array(TryoutPageIssueSchema).max(20),
  /** 学生视角认为讲得最清楚的一页(正例,帮教师识别有效讲法)。 */
  clearestPageNo: z.number().int().min(1),
})

export type TryoutReport = z.infer<typeof TryoutReportSchema>

export type TryoutLLMCall = (params: {
  system: string
  user: string
  schema: typeof TryoutReportSchema
}) => Promise<unknown>

const defaultLLM: TryoutLLMCall = params => callLLMJson({
  system: params.system,
  user: params.user,
  schema: params.schema,
  temperature: 0.4,
  timeoutSec: 120,
  maxAttempts: 2,
})

/** 逐页文本化:学生真实看到/听到的内容(拆页后讲稿),不含教师侧备课字段。 */
function pageTranscript(course: MainlineCourse): string {
  const pages = lessonPresentationPages(course)
  return pages.map((page, index) => {
    const scene = presentationScene(page)
    const slots = Object.entries(scene.contentSlots)
      .filter(([key]) => !key.startsWith('__') && !/^(promptScript|imagePrompt)$/.test(key))
      .map(([key, value]) => `${key}: ${String(value).slice(0, 300)}`)
    return [
      `【第 ${index + 1} 页 · ${page.stageLabel ?? scene.sceneType}】`,
      `标题: ${scene.visualFocus}`,
      `老师说: ${scene.teacherScript}`,
      scene.boardText.length > 0 ? `板书: ${scene.boardText.join(' / ')}` : '',
      slots.length > 0 ? `页面内容: ${slots.join(' | ')}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}

export async function tryoutCourse(
  course: MainlineCourse,
  opts?: { llm?: TryoutLLMCall },
): Promise<TryoutReport> {
  const llm = opts?.llm ?? defaultLLM
  const pages = lessonPresentationPages(course)
  const system = [
    `你现在是一名${GRADE_PERSONA[course.gradeBand]}。你要把下面这节${course.topic}课从第 1 页认真"上"到第 ${pages.length} 页。`,
    '你不是审稿人,是学生:只报告你**作为学生**真实卡住的地方——哪页的话没听懂、哪道题的要求有歧义、哪里老师突然跳了一步、哪两页之间接不上、哪页缺了完成任务必需的信息。',
    '规则:',
    '- 每个问题必须落到具体页号,并用一句话说清你卡在哪(不写改进建议,只写学生感受到的障碍)。',
    '- 能顺利跟上的页不要硬挑毛病;整课顺畅就返回空 issues。',
    '- 只输出一个合法 JSON 对象:{ "overall": string, "issues": [{ "pageNo": number, "kind": "看不懂"|"题目歧义"|"讲稿跳跃"|"衔接断层"|"信息缺失", "detail": string }], "clearestPageNo": number }',
  ].join('\n')
  const raw = await llm({ system, user: pageTranscript(course), schema: TryoutReportSchema })
  const report = TryoutReportSchema.parse(raw)
  // 页号越界的条目是模型幻觉,直接剔除而不是让教师去找不存在的页
  return {
    ...report,
    issues: report.issues.filter(issue => issue.pageNo >= 1 && issue.pageNo <= pages.length),
    clearestPageNo: Math.min(Math.max(report.clearestPageNo, 1), pages.length),
  }
}

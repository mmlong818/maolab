// ─── maolab mainline → presgen mainline deck 适配器 ───────────────────────────
//
// 把 mainline 的 MainlineCourse(教研骨架 + scene 内容)转换成可导出为 PPTX 的
// 精简 deck 结构。与 adapt-from-maolab.ts(旧 v2 CourseV2/atoms 结构,已停用但
// 只读保留)相互独立 —— mainline 的 scene 形状(boardText/teacherScript/
// imageUrl/contentSlots)与 v2 atoms 完全不同,不可复用旧适配器。
//
// 本文件不 import 任何 app 侧类型(presgen 不应反向依赖 app):调用方(app 侧)
// 负责把 MainlineCourse 压平成下面的 *Like 结构 —— 含中文标签换算、图片文件
// 绝对路径解析等,都由 app 侧完成。
//
// 幕型 → 页版式映射(复用 presgen 既有 Slide 语义,而非发明新版式):
//   - 封面(cover):课题 + 学段·学科(·第N集)
//   - 教学目标(checklist):goals.statement,仅 goals 非空时出现
//   - 每个非 recap 幕 → 一页(argument):heading = visualFocus(本幕视觉聚焦),
//     points = boardText(板书,作为幻灯片主体文字),eyebrow = 幕型中文标签;
//     若该幕有配图,同页嵌入图片(呼应旧适配器 demonstration→argument+image 的先例)
//   - recap 幕 → 收束页(checklist):boardText + 下集预告(若有);
//     无 recap 幕时用 fallbackClosing(如教学目标的 successSignal)兜底
//   - teacherScript(讲稿)一律进演讲者备注(notes),不重复渲染到幻灯片正文

import type { ArgumentSlide, ChecklistSlide, CoverSlide, ScriptEntry, Slide } from './types.js'

export interface MainlineSceneLike {
  /** 幕型中文标签(如"概念建构"),由调用方按 sceneType 查表传入 */
  sceneTypeLabel: string
  /** 本幕视觉聚焦对象,做该页标题 */
  visualFocus: string
  /** 板书文字,做该页正文要点 */
  boardText: readonly string[]
  /** 教师讲稿,进演讲者备注 */
  teacherScript: string
  /** 服务端已解析好的配图绝对文件路径(pptxgenjs 在 Node 侧直接读取) */
  imagePath?: string
  /** 仅 recap 幕可能有:下集预告钩子(course.season 存在时) */
  serialHook?: string
}

export interface MainlineCourseLike {
  topic: string
  gradeLabel: string
  subjectLabel: string
  /** 课程季场景下的"第N集"标签 */
  episodeLabel?: string
  /** 教学目标陈述句(goals.statement) */
  objectives: readonly string[]
  /** 播放顺序的非 recap 幕 */
  scenes: readonly MainlineSceneLike[]
  /** 课程的收束幕(sceneType === 'recap'),若存在 */
  recap?: MainlineSceneLike
  /** 无 recap 幕时的收束页兜底文案(如 goals.successSignal) */
  fallbackClosing?: readonly string[]
}

export interface MainlineDeck {
  title: string
  slides: Slide[]
  /** 演讲者备注,1-based slideIndex 对齐 slides */
  notes: ScriptEntry[]
  /** 配图,1-based slideIndex → 绝对文件路径 */
  images: Record<number, string>
}

export function mainlineCourseToDeck(course: MainlineCourseLike): MainlineDeck {
  const slides: Slide[] = [buildCoverSlide(course)]
  const notes: ScriptEntry[] = []
  const images: Record<number, string> = {}

  if (course.objectives.length > 0) {
    slides.push({
      type: 'checklist',
      eyebrow: '本节目标',
      heading: '今天你将能够',
      items: course.objectives.slice(0, 5) as string[],
    } satisfies ChecklistSlide)
  }

  for (const scene of course.scenes) {
    const slideIndex = slides.length + 1
    slides.push(buildSceneSlide(scene))
    attachNotesAndImage(scene, slideIndex, notes, images)
  }

  const closingIndex = slides.length + 1
  slides.push(buildClosingSlide(course))
  if (course.recap) attachNotesAndImage(course.recap, closingIndex, notes, images)

  return { title: course.topic, slides, notes, images }
}

function buildCoverSlide(course: MainlineCourseLike): CoverSlide {
  const subtitle = [course.gradeLabel, course.subjectLabel, course.episodeLabel]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  return { type: 'cover', eyebrow: '一节课', title: course.topic, subtitle }
}

function buildSceneSlide(scene: MainlineSceneLike): ArgumentSlide {
  const points = scene.boardText.length > 0
    ? [...scene.boardText]
    : [scene.teacherScript.slice(0, 40)]
  return {
    type: 'argument',
    eyebrow: scene.sceneTypeLabel,
    heading: scene.visualFocus,
    points,
  }
}

function buildClosingSlide(course: MainlineCourseLike): ChecklistSlide {
  const recap = course.recap
  const items = recap && recap.boardText.length > 0
    ? [...recap.boardText, ...(recap.serialHook ? [`下集预告:${recap.serialHook}`] : [])]
    : [...(course.fallbackClosing ?? [])]
  return {
    type: 'checklist',
    eyebrow: '收束',
    heading: '这节课,我们走到了这里',
    items: items.length > 0 ? items : ['本节课学习内容已回顾完毕。'],
  }
}

function attachNotesAndImage(
  scene: MainlineSceneLike,
  slideIndex: number,
  notes: ScriptEntry[],
  images: Record<number, string>,
): void {
  if (scene.teacherScript) notes.push({ slideIndex, text: scene.teacherScript, durationSec: 0 })
  if (scene.imagePath) images[slideIndex] = scene.imagePath
}

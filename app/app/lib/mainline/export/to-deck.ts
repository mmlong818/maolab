/**
 * export/to-deck · v5 M1 导出为 PPTX(第一出口)
 *
 * 把 MainlineCourse 压平成 @maolab/presgen 的 MainlineCourseLike 结构:换算中文
 * 标签、把 imageUrl(如 `/generated-images/xxx.png`)解析成服务端绝对文件路径
 * (fill-images.ts 写图落在 `public/generated-images/`,与 image-gen.ts 的
 * outputDir 约定一致)。presgen 侧渲染器直接用 fs 读该路径,不走网络请求。
 *
 * 课程骨架固定"开场 → …→ 收束(recap)"(scene-delete.ts 头注已确认 recap 全课
 * 唯一),故直接取最后一个 recap 幕做收束页,其余幕按顺序进逐幕正文。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MainlineCourseLike, MainlineSceneLike } from '@maolab/presgen/adapt-from-mainline'
import type { GradeBand, LessonScene, MainlineCourse, SceneType, SubjectId } from '../domain.js'
import { lessonPresentationPages, presentationScene } from '../presentation/presentation-pages.js'
import { courseDisplayTitle } from '../presentation/course-display-title.js'
import { SERIAL_HOOK_SLOT } from '../season.js'

const GRADE_LABELS: Record<GradeBand, string> = {
  'lower-primary': '小学低段',
  'upper-primary': '小学高段',
  'middle-school': '初中',
  'high-school': '高中',
}

const SUBJECT_LABELS: Record<SubjectId, string> = {
  chinese: '语文', math: '数学', science: '科学', english: '英语', history: '历史', politics: '道德与法治',
  geography: '地理', physics: '物理', chemistry: '化学', biology: '生物', general: '通识',
}

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  'source-reading': '源读 / 引入',
  'concept-build': '概念建构',
  'worked-example': '例题演算',
  'visual-observation': '观察 / 分层',
  contrast: '辨析 / 纠错',
  practice: '练习',
  recap: '收束 / 路径复盘',
  'ai-verify': 'AI 找茬 / 误概念验证',
  'ai-inquiry': 'AI 提问链 / 浅问与追问',
  'ai-collab': 'AI 协作任务 / 提示词与验证',
}

/** imageUrl(如 `/generated-images/a.png`)→ 服务端绝对文件路径;文件不存在时返回 undefined(不让导出因缺图中断)。 */
function resolveImagePath(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return undefined
  const abs = join(process.cwd(), 'public', imageUrl)
  return existsSync(abs) ? abs : undefined
}

function toSceneLike(scene: LessonScene): MainlineSceneLike {
  const imagePath = resolveImagePath(scene.imageUrl)
  return {
    sceneTypeLabel: SCENE_TYPE_LABELS[scene.sceneType],
    visualFocus: scene.visualFocus,
    boardText: scene.boardText,
    teacherScript: scene.teacherScript,
    ...(imagePath ? { imagePath } : {}),
    ...(scene.sceneType === 'recap' && scene.contentSlots[SERIAL_HOOK_SLOT]
      ? { serialHook: scene.contentSlots[SERIAL_HOOK_SLOT] }
      : {}),
  }
}

/** 把课程转成 presgen 可消费的精简结构,供 render-pptx 直接渲染。 */
export function mainlineCourseToDeckInput(course: MainlineCourse): MainlineCourseLike {
  const pages = lessonPresentationPages(course)
  const recapPage = [...pages].reverse().find(page => page.scene.sceneType === 'recap')
  const otherPages = pages.filter(page => page !== recapPage)

  return {
    topic: courseDisplayTitle(course),
    gradeLabel: GRADE_LABELS[course.gradeBand],
    subjectLabel: SUBJECT_LABELS[course.subject],
    ...(course.season ? { episodeLabel: `第${course.season.episodeNo}集` } : {}),
    objectives: course.goals.map(g => g.statement),
    scenes: otherPages.map(page => toSceneLike(presentationScene(page))),
    ...(recapPage ? { recap: toSceneLike(presentationScene(recapPage)) } : {}),
    fallbackClosing: course.goals.map(g => g.successSignal),
  }
}

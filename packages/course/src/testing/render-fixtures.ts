/**
 * 渲染与导出夹具（3b）：course 的测试、workers/render 的测试与本机端到端脚本共用。不做任何 I/O。
 * - buildRenderingCourse：golden-middle-refraction 的课程外壳（卡司、呈现包、来源）+ 两页解释型计划，
 *   用 3a 的生成服务（桩正文、桩核查）推进到 rendering：两页都在等截图。
 * - goldenExportCourse：golden-primary-jingyesi，已通过发布判定（6 个呈现页、讲稿非空），供 PPTX 导出。
 */
import type { MainlineCourse } from '../mainline/domain.js'
import { createGenerationSession } from '../mainline/generation-session.js'
import type { GeneratedLessonPage } from '../mainline/planning/page-content-contract.js'
import type { CoursePlanningState, LessonPagePlan } from '../mainline/planning/page-contract.js'
import { GOLDEN_MAINLINE_COURSES } from '../mainline/samples.js'
import type { MainlineCourseStore } from '../mainline/store.js'
import { createCourseGenerationServices } from '../services/generation.js'

export const RENDER_FIXTURE_PAGES = 2

function golden(id: string): MainlineCourse {
  const found = GOLDEN_MAINLINE_COURSES.find((course) => course.id === id)
  if (!found) throw new Error(`缺少样例课 ${id}`)
  return structuredClone(found)
}

function planPages(): LessonPagePlan[] {
  return Array.from({ length: RENDER_FIXTURE_PAGES }, (_, index): LessonPagePlan => {
    const order = index + 1
    return {
      id: `page-${order}`, order, fragmentId: 'fragment-1', knowledgePointIds: [], purpose: 'explain', audience: 'student',
      learningAction: `理解第 ${order} 个要点。`, newInformation: `第 ${order} 个新信息。`, sourceRefs: [],
      contentSpec: { kind: 'explanation', focus: `概念 ${order}`, requiredElements: [`要点 ${order}`] },
      visualSpec: { required: false, form: 'none', reason: '不需要图像。', sourceAssetPolicy: 'none' },
      teacherCompanion: { scriptGoal: '讲清要点。', teachingMove: '追问依据。', pace: 'brief' }, arcStepId: 'arc-1',
      ...(order > 1 ? { previousPageId: `page-${order - 1}` } : {}),
    }
  })
}

function stubPage(planPage: LessonPagePlan): GeneratedLessonPage {
  return {
    pageId: planPage.id, order: planPage.order, purpose: planPage.purpose, planRevisionId: 'plan-1', sourceRefs: [],
    content: { kind: 'explanation', title: `光的折射 ${planPage.order}`, coreStatement: `光从空气斜射入水中时，折射角小于入射角（第 ${planPage.order} 页）。`, evidence: [{ text: '把筷子斜插入水中，看起来在水面处"折断"。' }], boundary: '只讨论空气与水之间的折射。' },
    teacherCompanion: { script: '请观察筷子在水面处的样子，并说出你的依据。', notes: [], pace: 'brief' },
  }
}

export async function buildRenderingCourse(store: MainlineCourseStore, id: string): Promise<MainlineCourse> {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: id, planRevisionId: 'plan-1', status: 'plan-approved',
    learningContracts: [], arc: { id: 'arc-1', courseId: id, steps: [] }, pages: planPages(),
  }
  const course: MainlineCourse = { ...golden('golden-middle-refraction'), id, planning }
  course.generationSession = createGenerationSession(course, `session-${id}`, '2026-10-14T00:00:00.000Z')
  await store.saveMainlineCourse(course)
  const services = createCourseGenerationServices(store, {
    pages: {
      generate: async ({ planPage }) => stubPage(planPage),
      auditFacts: async (_course, page) => ({ revisionId: `fact:${page.pageId}` }),
    },
  })
  for (let order = 1; order <= RENDER_FIXTURE_PAGES; order += 1) await services.pages.runNext(id, `2026-10-14T00:0${order}:00.000Z`)
  const saved = await store.findMainlineCourse(id)
  if (saved?.generationSession?.status !== 'rendering') throw new Error(`夹具课程没有进入 rendering：${saved?.generationSession?.status ?? '无会话'}`)
  return saved
}

export function goldenExportCourse(id = 'golden-primary-jingyesi'): MainlineCourse {
  return { ...golden('golden-primary-jingyesi'), id }
}

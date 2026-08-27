import { aiVerifyPairs } from '../ai-verify.js'
import {
  stagedLearningConfig,
  stagedLearningStateKey,
  stagedPostRevealRecordIsComplete,
  stagedSceneForPrompt,
  stagedSceneForReveal,
  type StagedPostRevealRecord,
} from '../staged-learning.js'
import type { LessonScene, MainlineCourse } from '../domain.js'
import { recapTransferTaskProblems } from '../recap-template.js'

export const PRESENTATION_VARIANT_SLOT = '__presentationVariant'
export const RECAP_TRANSFER_VARIANT = 'recap-transfer'
export const COURSE_STRUCTURE_VARIANT = 'course-structure'
export const COURSE_STRUCTURE_ITEMS_SLOT = '__courseStructureItems'
export const COURSE_STRUCTURE_SUMMARY_SLOT = '__courseStructureSummary'
export const COURSE_STRUCTURE_START_SLOT = '__courseStructureStart'

const COURSE_STRUCTURE_PAGE_CAPACITY = 4

export interface CourseStructureItem {
  title: string
  detail: string
}

/**
 * 实际放映页不是数据库里“场景”数量的同义词。
 *
 * 一个场景可以包含先判断、揭晓、逐条辨析等多个教学时刻；这些时刻必须分别成为
 * 可翻页、可编号、可导出的投影片，不能靠同一页内的按钮切换状态。课程数据仍以场景
 * 为编辑单位，放映层在读取时展开为连续页面，避免重写存量课程或丢失教师修订。
 */
export interface LessonPresentationPage {
  id: string
  sourceSceneId: string
  /** 同一题的提问页与核查页共用；AI 多条说法则逐条独立。 */
  stateId: string
  scene: LessonScene
  /** false 为学生先判断页，true 为作答后揭晓页。 */
  feedbackRevealed: boolean
  /** 同一场景拆出的页在教师备课中使用的清晰说明。 */
  stageLabel?: string
  /** 由全课结构派生，不对应一张可单独编辑的数据库场景。 */
  derived?: boolean
}

export function lessonPresentationPages(
  course: Pick<MainlineCourse, 'scenes' | 'learningFragments' | 'sourceMaterial'>,
): LessonPresentationPage[] {
  const contentPages = course.scenes.flatMap(scene => presentationPagesForScene(scene))
  const structurePages = courseStructurePages(course)
  if (structurePages.length === 0) return contentPages

  const openingIndex = contentPages.findIndex(item => item.scene.sceneType === 'source-reading')
  const insertAt = openingIndex >= 0 ? openingIndex + 1 : Math.min(1, contentPages.length)
  return [
    ...contentPages.slice(0, insertAt),
    ...structurePages,
    ...contentPages.slice(insertAt),
  ]
}

/** 课程结构页只取学生真正要经历的阶段，不把骨架名、执行器或生成链路带上屏。 */
export function courseStructureItems(
  course: Pick<MainlineCourse, 'scenes' | 'learningFragments' | 'sourceMaterial'>,
): CourseStructureItem[] {
  return course.learningFragments.flatMap(fragment => {
    const firstScene = course.scenes.find(scene => scene.id === fragment.sceneIds[0])
    if (!firstScene) return []

    if (fragment.kpId) {
      const title = course.sourceMaterial.find(source => source.kpId === fragment.kpId)?.title.trim()
        || firstScene.visualFocus.trim()
      return title ? [{ title, detail: structureDetail(firstScene) }] : []
    }

    if (firstScene.sceneType === 'source-reading') {
      return [{ title: '提出问题', detail: structureDetail(firstScene) }]
    }
    if (firstScene.sceneType === 'recap') {
      return [{ title: '总结与迁移', detail: structureDetail(firstScene) }]
    }

    const title = firstScene.visualFocus.trim()
    return title ? [{ title, detail: structureDetail(firstScene) }] : []
  })
}

export function courseStructureItemsFromScene(scene: Pick<LessonScene, 'contentSlots'>): CourseStructureItem[] {
  const raw = scene.contentSlots[COURSE_STRUCTURE_ITEMS_SLOT]
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const title = 'title' in item && typeof item.title === 'string' ? item.title.trim() : ''
      const detail = 'detail' in item && typeof item.detail === 'string' ? item.detail.trim() : ''
      return title && detail ? [{ title, detail }] : []
    })
  } catch {
    return []
  }
}

function courseStructurePages(
  course: Pick<MainlineCourse, 'scenes' | 'learningFragments' | 'sourceMaterial'>,
): LessonPresentationPage[] {
  const sourceScene = course.scenes.find(scene => scene.sceneType === 'source-reading') ?? course.scenes[0]
  const items = courseStructureItems(course)
  if (!sourceScene || items.length === 0) return []

  const groups = chunk(items, COURSE_STRUCTURE_PAGE_CAPACITY)
  return groups.map((group, index) => {
    const pageNo = index + 1
    const stageLabel = groups.length > 1 ? `课程结构 ${pageNo}/${groups.length}` : '课程结构'
    const { imageUrl: _imageUrl, imagePrompt: _imagePrompt, imageFidelity: _imageFidelity, imageAspect: _imageAspect, ...sourceWithoutImage } = sourceScene
    const structureScene: LessonScene = {
      ...sourceWithoutImage,
      id: `${sourceScene.id}:course-structure:${pageNo}`,
      sceneType: 'concept-build',
      visualLayout: 'course-structure / full-width-sequence',
      contentSlots: {
        [PRESENTATION_VARIANT_SLOT]: COURSE_STRUCTURE_VARIANT,
        [COURSE_STRUCTURE_ITEMS_SLOT]: JSON.stringify(group),
        [COURSE_STRUCTURE_START_SLOT]: String(index * COURSE_STRUCTURE_PAGE_CAPACITY),
        [COURSE_STRUCTURE_SUMMARY_SLOT]: sourceScene.contentSlots.learningPath?.trim()
          || group.map(item => item.title).join(' → '),
      },
      visualFocus: stageLabel,
      narrationAnchor: group.map(item => item.title).join('、'),
      syncStrategy: '整页显示本课学习顺序，按编号依次进入后续投影片。',
      boardText: group.map(item => `${item.title}：${item.detail}`),
      sceneTechnique: 'static-board',
      interactionContract: '学生看清本课顺序后进入第一项学习任务。',
      fallbackPresentation: '静态投影保持相同顺序和文字。',
      characterLayer: {
        layout: 'no-character',
        positionRule: '课程结构占满画面，不放角色。',
        exitRule: '进入第一项学习任务。',
      },
      dialogueLayout: 'no-character',
      peerFunction: 'none',
      teacherScript: `用一句话带过本课路径：${group.map(item => item.title).join('、')}。`,
      studentAction: '说出本课将依次完成的学习步骤。',
      evidenceOnScreen: group.map(item => item.title),
    }
    return {
      id: structureScene.id,
      sourceSceneId: sourceScene.id,
      stateId: structureScene.id,
      scene: structureScene,
      feedbackRevealed: true,
      stageLabel,
      derived: true,
    }
  })
}

function structureDetail(scene: LessonScene): string {
  const candidate = scene.studentAction.trim() || scene.narrationAnchor.trim() || scene.visualFocus.trim()
  const [firstClause] = candidate.split(/[；;。]/)
  return firstClause?.trim() || candidate
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size))
  return groups
}

export function presentationPagesForScene(scene: LessonScene): LessonPresentationPage[] {
  const transferTask = scene.sceneType === 'recap' ? scene.contentSlots.transferTask?.trim() : undefined
  if (transferTask && recapTransferTaskProblems(transferTask).length === 0) {
    const { transferTask: _transferTask, ...summarySlots } = scene.contentSlots
    const { imageUrl: _imageUrl, ...sceneWithoutImage } = scene
    const summaryScene: LessonScene = {
      ...scene,
      contentSlots: summarySlots,
      studentAction: '回看本课要点，说出一条最重要的判断依据。',
    }
    const transferScene: LessonScene = {
      ...sceneWithoutImage,
      visualFocus: '迁移练习',
      narrationAnchor: '迁移练习',
      teacherScript: '请独立完成屏幕上的迁移练习，先写结论，再写依据或关键步骤。',
      studentAction: transferTask,
      boardText: [transferTask],
      evidenceOnScreen: [transferTask],
      contentSlots: {
        transferTask,
        [PRESENTATION_VARIANT_SLOT]: RECAP_TRANSFER_VARIANT,
      },
    }
    return [
      page(scene, summaryScene, scene.id, true, '本课总结'),
      page(scene, transferScene, `${scene.id}:transfer`, true, '迁移练习'),
    ]
  }

  const config = stagedLearningConfig(scene)
  if (!config) return [page(scene, scene, scene.id, true)]

  if (scene.sceneType !== 'ai-verify') {
    return [
      page(scene, scene, scene.id, false, '学生先作答'),
      page(scene, scene, scene.id, true, '展示讲解与结论'),
    ]
  }

  return aiVerifyPairs(scene).flatMap(pair => {
    const pairScene = sceneForAiVerifyPair(scene, pair)
    const phaseLabel = `第 ${pair.index} 条`
    const stateId = `${scene.id}:verify-${pair.index}`
    return [
      page(scene, pairScene, stateId, false, `${phaseLabel} · 学生判断`),
      page(scene, pairScene, stateId, true, `${phaseLabel} · 显示核查`),
    ]
  })
}

function page(sourceScene: LessonScene, scene: LessonScene, stateId: string, feedbackRevealed: boolean, stageLabel?: string): LessonPresentationPage {
  const suffix = feedbackRevealed ? 'reveal' : 'prompt'
  const pairSuffix = stageLabel ? `:${stageLabel}` : ''
  return {
    id: `${sourceScene.id}:${suffix}${pairSuffix}`,
    sourceSceneId: sourceScene.id,
    stateId,
    scene,
    feedbackRevealed,
    ...(stageLabel ? { stageLabel } : {}),
  }
}

/** 课堂记录按真实教学步骤存储，而不是把同一场景里的多条判断混成一份记录。 */
export function presentationPageStateKey(courseId: string, page: Pick<LessonPresentationPage, 'stateId'>): string {
  return stagedLearningStateKey(courseId, page.stateId)
}

/**
 * 为当前投影片状态生成实际使用的内容副本。
 * 提问页只保留题面，不携带答案板书；核查页才带讲解与结论。
 */
export function presentationScene(page: LessonPresentationPage): LessonScene {
  const config = stagedLearningConfig(page.scene)
  if (!config) return page.scene
  const scene = page.feedbackRevealed ? stagedSceneForReveal(page.scene) : stagedSceneForPrompt(page.scene)
  return {
    ...scene,
    boardText: page.feedbackRevealed
      ? revealBoardText(page.scene, config.sceneType)
      : promptBoardText(page.scene, config.sceneType, config.promptItems, config.completionPrompt),
  }
}

export interface PresentationNavigationBlocker {
  pageIndex: number
  pageId: string
  phase: 'reveal' | 'post-reveal' | 'practice-evidence'
  actionLabel: string
}

/** 后续投影片不能绕过前一张判断页的作答和核查动作。 */
export function presentationNavigationBlocker(
  courseId: string,
  pages: readonly LessonPresentationPage[],
  targetIndex: number,
  revealedByKey: Readonly<Record<string, boolean | undefined>>,
  postRevealByKey: Readonly<Record<string, StagedPostRevealRecord | undefined>>,
  practiceEvidenceByKey: Readonly<Record<string, boolean | undefined>> = {},
  /** 投影授课下教师确认的纸面完成(仅本课堂会话,不写掌握度),与服务端证据同样过闸。 */
  practicePaperCompleteByKey: Readonly<Record<string, boolean | undefined>> = {},
): PresentationNavigationBlocker | null {
  const upperBound = Math.min(Math.max(targetIndex, 0), pages.length)
  for (let pageIndex = 0; pageIndex < upperBound; pageIndex += 1) {
    const page = pages[pageIndex]
    if (!page) continue
    const config = stagedLearningConfig(page.scene)
    if (!config) continue
    const stateKey = presentationPageStateKey(courseId, page)
    if (!page.feedbackRevealed) {
      if (!revealedByKey[stateKey]) {
        return { pageIndex, pageId: page.id, phase: 'reveal', actionLabel: config.revealLabel }
      }
      continue
    }
    if (config.recordsMastery) {
      if (!practiceEvidenceByKey[stateKey] && !practicePaperCompleteByKey[stateKey]) {
        return { pageIndex, pageId: page.id, phase: 'practice-evidence', actionLabel: '完成反馈核对' }
      }
      continue
    }
    if (!stagedPostRevealRecordIsComplete(page.scene, postRevealByKey[stateKey])) {
      return { pageIndex, pageId: page.id, phase: 'post-reveal', actionLabel: '完成核对与修正' }
    }
  }
  return null
}

function promptBoardText(
  scene: LessonScene,
  sceneType: NonNullable<ReturnType<typeof stagedLearningConfig>>['sceneType'],
  promptItems: readonly string[],
  completionPrompt?: string,
): string[] {
  if (sceneType === 'worked-example') {
    return [scene.contentSlots.problem, completionPrompt].filter((item): item is string => Boolean(item?.trim()))
  }
  return promptItems.filter(Boolean)
}

function revealBoardText(
  scene: LessonScene,
  sceneType: NonNullable<ReturnType<typeof stagedLearningConfig>>['sceneType'],
): string[] {
  if (sceneType === 'practice') return [scene.contentSlots.feedback].filter((item): item is string => Boolean(item?.trim()))
  if (sceneType === 'contrast') return [scene.contentSlots.rightAction ?? scene.contentSlots.correction].filter((item): item is string => Boolean(item?.trim()))
  if (sceneType === 'ai-verify') return aiVerifyPairs(scene).map(pair => pair.reveal).filter(Boolean)
  return scene.boardText.length > 0
    ? scene.boardText
    : [scene.contentSlots.steps].filter((item): item is string => Boolean(item?.trim()))
}

/** 多条 AI 说法在放映层拆成单条场景，从根源上移除 A-1/A-2/A-3 页内切换控件。 */
function sceneForAiVerifyPair(scene: LessonScene, pair: ReturnType<typeof aiVerifyPairs>[number]): LessonScene {
  const contentSlots = Object.fromEntries(
    Object.entries(scene.contentSlots).filter(([key]) => !/^(?:aiClaim|reveal)\d+$/.test(key)),
  )
  const provenance = pair.source
    ? { misconceptionSource: pair.source, misconceptionSources: [pair.source] }
    : {}
  return {
    ...scene,
    ...provenance,
    // 讲稿在课堂上由老师对学生说出(字幕+TTS 同源),受众是学生——
    // 「请学生先判断…」是备课导语,不能上讲台。提问态另由 stagedSceneForPrompt
    // 换成行动指令,这里主要负责核查(揭晓)态的讲解话语。
    teacherScript: `我们来核查这条说法。${pair.reveal}`,
    studentAction: '先判断说法是否成立并写出依据；核查后把错误说法改写正确。',
    boardText: [pair.claim, pair.reveal].filter(Boolean),
    contentSlots: {
      ...contentSlots,
      aiClaim: pair.claim,
      reveal: pair.reveal,
    },
  }
}

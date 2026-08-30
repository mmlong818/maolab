import type { LessonScene, MainlineCourse, SourceMaterialRef } from '../domain.js'
import type { GeneratedLessonPage, VisiblePageContent } from '../planning/page-content-contract.js'
import type { LessonPagePlan } from '../planning/page-contract.js'
import { sourceMaterialByReference } from '../planning/source-reference.js'
import type { LessonPresentationPage } from './presentation-pages.js'

export const PAGE_CONTENT_VARIANT = 'page-content-v1'
export const PAGE_CONTENT_VARIANT_SLOT = '__pageContentVariant'
export const PAGE_CONTENT_DATA_SLOT = '__pageContentData'
export const PAGE_CONTENT_PROMPT_SLOT = '__pageContentPrompt'

type PageContentCourse = Pick<
  MainlineCourse,
  'scenes' | 'learningFragments' | 'sourceMaterial' | 'planning' | 'pageContent'
>

/**
 * 新课程的正文页面已经是最终投影片，读取时只能一对一适配成既有舞台外壳。
 * 这里不增页、不删页、不排序，也不调用旧的 presentationPagesForScene()。
 */
export function pageContentPresentationPages(course: PageContentCourse): LessonPresentationPage[] | undefined {
  if (!course.pageContent) return undefined

  const planById = new Map(course.planning?.pages.map(page => [page.id, page]))
  const promptByPairId = new Map<string, GeneratedLessonPage>()
  for (const page of course.pageContent.pages) {
    if (page.pairId && page.pairRole === 'prompt') promptByPairId.set(page.pairId, page)
  }

  return course.pageContent.pages.map(page => {
    const planPage = planById.get(page.pageId)
    const sourceScene = sourceSceneForPlan(course, planPage)
    const prompt = page.pairId ? promptByPairId.get(page.pairId) : undefined
    const scene = generatedPageScene(course, page, planPage, sourceScene, prompt?.content)
    return {
      id: page.pageId,
      sourceSceneId: sourceScene?.id ?? page.pageId,
      stateId: page.pageId,
      scene,
      feedbackRevealed: true,
      derived: true,
    }
  })
}

export function isPageContentScene(scene: Pick<LessonScene, 'contentSlots'>): boolean {
  return scene.contentSlots[PAGE_CONTENT_VARIANT_SLOT] === PAGE_CONTENT_VARIANT
}

export function pageContentFromScene(scene: Pick<LessonScene, 'contentSlots'>): VisiblePageContent | undefined {
  return parseVisiblePageContent(scene.contentSlots[PAGE_CONTENT_DATA_SLOT])
}

export function pairedPromptContentFromScene(scene: Pick<LessonScene, 'contentSlots'>): VisiblePageContent | undefined {
  return parseVisiblePageContent(scene.contentSlots[PAGE_CONTENT_PROMPT_SLOT])
}

function generatedPageScene(
  course: PageContentCourse,
  page: GeneratedLessonPage,
  planPage: LessonPagePlan | undefined,
  sourceScene: LessonScene | undefined,
  pairedPrompt: VisiblePageContent | undefined,
): LessonScene {
  const contentSlots: Record<string, string> = {
    [PAGE_CONTENT_VARIANT_SLOT]: PAGE_CONTENT_VARIANT,
    [PAGE_CONTENT_DATA_SLOT]: JSON.stringify(page.content),
    ...(pairedPrompt ? { [PAGE_CONTENT_PROMPT_SLOT]: JSON.stringify(pairedPrompt) } : {}),
  }
  const imageUrl = pageImageUrl(course.sourceMaterial, page, planPage)
  const voicePace = page.teacherCompanion.pace === 'deliberate'
    ? 'slow'
    : page.teacherCompanion.pace === 'brief'
      ? 'fast'
      : 'medium'
  const notes = page.teacherCompanion.notes.map(item => item.trim()).filter(Boolean)

  return {
    ...(sourceScene ?? fallbackScene(page.pageId)),
    id: page.pageId,
    // 新页面不借用旧 sceneType 的互动、拆页或揭晓语义；它只作为既有舞台的静态外壳。
    sceneType: 'concept-build',
    ...(planPage?.knowledgePointIds[0] ? { kpId: planPage.knowledgePointIds[0] } : {}),
    durationTargetSec: page.teacherCompanion.pace === 'deliberate' ? 90 : page.teacherCompanion.pace === 'brief' ? 40 : 60,
    visualLayout: PAGE_CONTENT_VARIANT,
    contentSlots,
    visualFocus: page.content.title,
    narrationAnchor: notes.join('；') || page.content.title,
    syncStrategy: planPage?.learningAction ?? '',
    boardText: [],
    sceneTechnique: 'static-board',
    interactionContract: planPage?.learningAction ?? '',
    fallbackPresentation: '静态投影片保持相同页面内容。',
    characterLayer: {
      layout: 'no-character',
      positionRule: '学生投影片正文使用完整画面。',
      exitRule: '翻到下一张投影片。',
    },
    dialogueLayout: 'no-character',
    peerFunction: 'none',
    voiceCue: {
      ...(sourceScene?.voiceCue ?? fallbackScene(page.pageId).voiceCue),
      pace: voicePace,
      pauseRule: page.teacherCompanion.pace === 'deliberate'
        ? '留出观察或作答时间后再翻页。'
        : page.teacherCompanion.pace === 'brief'
          ? '讲清本页后直接翻页。'
          : '讲完后短暂停顿，确认学生跟上。',
    },
    teacherScript: page.teacherCompanion.script,
    studentAction: planPage?.learningAction ?? studentActionFor(page.content),
    evidenceOnScreen: [page.content.title],
    ...(imageUrl ? { imageUrl } : {}),
    executor: 'ai',
    editedByTeacher: false,
  }
}

function sourceSceneForPlan(course: PageContentCourse, planPage: LessonPagePlan | undefined): LessonScene | undefined {
  if (planPage) {
    const fragment = course.learningFragments.find(item => item.id === planPage.fragmentId)
    const fragmentScene = fragment?.sceneIds
      .map(sceneId => course.scenes.find(scene => scene.id === sceneId))
      .find((scene): scene is LessonScene => Boolean(scene))
    if (fragmentScene) return fragmentScene
    const kpScene = course.scenes.find(scene => scene.kpId && planPage.knowledgePointIds.includes(scene.kpId))
    if (kpScene) return kpScene
  }
  return course.scenes[0]
}

function pageImageUrl(
  sources: readonly SourceMaterialRef[],
  page: GeneratedLessonPage,
  planPage: LessonPagePlan | undefined,
): string | undefined {
  if (page.imageUrl?.trim()) return page.imageUrl
  if (!planPage?.visualSpec.required) return undefined
  for (const sourceRef of page.sourceRefs) {
    const source = sourceMaterialByReference(sources, sourceRef)
    const candidate = source?.candidateResources?.find(item => item.assetUrl.trim())
    if (candidate) return candidate.assetUrl
  }
  return undefined
}

function studentActionFor(content: VisiblePageContent): string {
  switch (content.kind) {
    case 'question':
    case 'practice':
    case 'transfer':
      return content.responseInstruction
    case 'observation':
      return content.prompt
    default:
      return `阅读并说明“${content.title}”的要点。`
  }
}

function parseVisiblePageContent(value: string | undefined): VisiblePageContent | undefined {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return undefined
    const kind = (parsed as { kind?: unknown }).kind
    const title = (parsed as { title?: unknown }).title
    if (typeof kind !== 'string' || typeof title !== 'string') return undefined
    return parsed as VisiblePageContent
  } catch {
    return undefined
  }
}

function fallbackScene(id: string): LessonScene {
  return {
    id,
    sceneType: 'concept-build',
    visualLayout: PAGE_CONTENT_VARIANT,
    contentSlots: {},
    visualFocus: id,
    narrationAnchor: '',
    syncStrategy: '',
    boardText: [],
    sceneTechnique: 'static-board',
    interactionContract: '',
    fallbackPresentation: '',
    characterLayer: { layout: 'no-character', positionRule: '', exitRule: '' },
    dialogueLayout: 'no-character',
    peerFunction: 'none',
    subjectTeachingMode: 'general-explanation',
    voiceCue: { emotion: 'neutral', pace: 'medium', pauseRule: '' },
    gradeTone: '',
    teacherScript: '',
    studentAction: '',
    evidenceOnScreen: [],
  }
}

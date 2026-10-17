import type { LessonScene, MainlineCourse } from './domain.js'
import type { GeneratedLessonPage } from './planning/page-content-contract.js'

export type CourseImageTarget =
  | { kind: 'page'; page: GeneratedLessonPage; scene: LessonScene }
  | { kind: 'scene'; scene: LessonScene }

export function courseImageTarget(course: MainlineCourse, targetId: string): CourseImageTarget | undefined {
  const page = course.pageContent?.pages.find(candidate => candidate.pageId === targetId)
  if (page) {
    const sourceScene = sourceSceneForPage(course, page)
    return {
      kind: 'page',
      page,
      scene: {
        ...sourceScene,
        id: page.pageId,
        visualFocus: page.content.title,
        ...(page.imageUrl ? { imageUrl: page.imageUrl } : {}),
        ...(page.imagePrompt ? { imagePrompt: page.imagePrompt } : {}),
        ...(page.imageAspect ? { imageAspect: page.imageAspect } : {}),
      },
    }
  }
  const scene = course.scenes.find(candidate => candidate.id === targetId)
  return scene ? { kind: 'scene', scene } : undefined
}

function sourceSceneForPage(course: MainlineCourse, page: GeneratedLessonPage): LessonScene {
  const plan = course.planning?.pages.find(candidate => candidate.id === page.pageId)
  const fragment = plan && course.learningFragments.find(candidate => candidate.id === plan.fragmentId)
  const sourceScene = fragment?.sceneIds
    .map(sceneId => course.scenes.find(candidate => candidate.id === sceneId))
    .find((candidate): candidate is LessonScene => Boolean(candidate))
  return sourceScene ?? course.scenes[0] ?? fallbackScene(page.pageId)
}

function fallbackScene(id: string): LessonScene {
  return {
    id, sceneType: 'visual-observation', visualLayout: 'page-content-v1', contentSlots: {},
    visualFocus: id, narrationAnchor: '', syncStrategy: '', boardText: [], sceneTechnique: 'static-board',
    interactionContract: '', fallbackPresentation: '', characterLayer: { layout: 'no-character', positionRule: '', exitRule: '' },
    dialogueLayout: 'no-character', peerFunction: 'none', subjectTeachingMode: 'general-explanation',
    voiceCue: { emotion: 'neutral', pace: 'medium', pauseRule: '' }, gradeTone: '', teacherScript: '', studentAction: '', evidenceOnScreen: [],
  }
}

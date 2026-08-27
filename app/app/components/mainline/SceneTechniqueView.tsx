'use client'

import type { LessonScene, MainlineCourse } from '@/lib/mainline'
import { COURSE_STRUCTURE_VARIANT, courseDisplayTitle, IMAGE_SCENE_TYPES, PRESENTATION_VARIANT_SLOT, RECAP_TRANSFER_VARIANT, presentationFor, stagedPromptEvidenceKind } from '@/lib/mainline'
import { AiCollabView } from './scene-views/ai-collab'
import { AiVerifyView } from './scene-views/ai-scenes'
import { ConceptBuildView } from './scene-views/concept-build'
import { CourseStructureSlideView } from './scene-views/course-structure'
import { specializedContentKind, type SpecializedContentKind } from '@/lib/mainline/presentation/scene-content-contract'
import { usesGeneratedSceneImage } from '@/lib/mainline/presentation/scene-rendering-priority'
import { biologyVisualFor, chemistryVisualFor, chineseVisualFor, circuitVisualFor, englishVisualFor, geometryVisualFor } from '@/lib/mainline/presentation/subject-content'
import { CoordinatePlotView, DialogueScriptView, ForceDiagramView, GeometryView, OpticsDiagramView, TimelineEventsView } from './scene-views/content-forms'
import { BiologyStructureView, ChemistryContentView, ChineseContentView, CircuitDiagramView, EnglishContentView } from './scene-views/subject-content'
import { ContrastImageView } from './scene-views/contrast-scenes'
import { CoreWithSpecializedVisual } from './scene-views/core-content'
import {
  ComparisonView,
  DraggableModel,
  LabelledDiagram,
  LocalZoom,
  PathTracingView,
  PoemDisplay,
  RefractionSimulation,
  StaticBoard,
  StepReplay,
  TriptychView,
} from './scene-views/legacy-techniques'
import { PracticeSequenceView, PracticeView } from './scene-views/practice'
import { RecapFocusView, RecapImageView, RecapTransferSlideView } from './scene-views/recap'
import { CompositionScene, ImagePendingScene, isFilled } from './scene-views/shared'
import { SourceReadingView } from './scene-views/source-reading'
import { StagedLearningPromptView } from './scene-views/staged-learning'
import { VisualObservationSlide } from './scene-views/visual-slide'
import { WorkedExampleView } from './scene-views/worked-example'

interface SceneTechniqueViewProps {
  course: MainlineCourse
  scene: LessonScene
  /** 实际投影片页码；未提供时兼容旧调用并回退数据库场景序号。 */
  sceneNumber?: number
  /** 授课页首次进入检核幕时为 false；备课预览缺省为 true，始终展示完整终态。 */
  stagedFeedbackRevealed?: boolean
}

/**
 * SceneTechniqueView · 幕型 → 版式母版的派发器
 *
 * 拆分自原 980 行单文件(2026-07-21 母版扩容):各幕型的具体渲染搬到
 * scene-views/ 子目录,本文件只保留分派顺序——纯移动,分派逻辑不变。
 * source-reading/concept-build/worked-example/practice/recap 五个主力幕型
 * 各自扩为 3 个结构真异质母版(见各文件顶部注释),由母版内部的
 * pickMaster(course.id+scene.id 哈希)确定性选择,本文件无需感知母版数量。
 * ai-verify/ai-inquiry(scene-views/ai-scenes.tsx)同轮扩为 4+3 母版,选择逻辑
 * 见 ai-master-select.ts,本文件仍只经 ComparisonView 转发,不新增分派分支。
 */
export function SceneTechniqueView({ course, scene, sceneNumber: pageNumber, stagedFeedbackRevealed = true }: SceneTechniqueViewProps) {
  const sceneNumber = pageNumber ?? (course.scenes.findIndex(item => item.id === scene.id) + 1 || 1)

  if (scene.contentSlots[PRESENTATION_VARIANT_SLOT] === RECAP_TRANSFER_VARIANT) {
    return <RecapTransferSlideView scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  }

  if (scene.contentSlots[PRESENTATION_VARIANT_SLOT] === COURSE_STRUCTURE_VARIANT) {
    return <CourseStructureSlideView course={course} scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  }

  // 纯文字练习的提问页与揭晓页共用同一骨架，只在原位置补入答案。
  // 有题图或专业图表的练习继续走证据优先分支，避免为了统一版式丢掉学生必须看的图。
  if (scene.sceneType === 'practice' && stagedPromptEvidenceKind(scene) === null) {
    return <PracticeSequenceView scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} feedbackRevealed={stagedFeedbackRevealed} />
  }

  // AI 找茬的提问与核查必须留在同一母版中：初始态只把结论槽留为“等待判断”，
  // 核查页在原槽位追加结论，不能用无关版式替换整个画面。
  if (!stagedFeedbackRevealed && scene.sceneType === 'ai-verify') {
    return <AiVerifyView scene={scene} course={course} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} feedbackRevealed={false} />
  }

  // 例题、练习、辨析先收集学生自己的判断，再展示步骤或反馈。
  // 该分支必须早于配图/专业图表派发，否则解答图和 correction/reveal 会抢先上屏。
  if (!stagedFeedbackRevealed) {
    return <StagedLearningPromptView scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  }

  // visual-observation / contrast / recap 是明确的配图页。只要图已生成，
  // 它就是本页内容的一部分，不能被 timelineEvents 等附加槽或无图母版覆盖。
  if (usesGeneratedSceneImage(scene)) {
    if (scene.sceneType === 'visual-observation') {
      return <VisualObservationSlide scene={scene} course={course} sceneNumber={sceneNumber} />
    }
    if (scene.sceneType === 'recap') {
      return <RecapImageView scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
    }
    return <ContrastImageView scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  }

  // 收束幕的一句话结论(contentSlots.takeaway)此前从未上屏——四轴合成把它挤没了。
  // Editorial Stage 方向 A「Focus 全出血强调」专辟给它:退场配图,整幅深墨底反白
  // 巨字收尾,路径节点收窄成上方细带。草稿态(takeaway 仍是占位)保留原逻辑不提前介入。
  if (scene.sceneType === 'recap' && isFilled(scene.contentSlots.takeaway)) {
    return <RecapFocusView scene={scene} course={course} pres={presentationFor(scene, course)} />
  }

  // 专业图表只提供“如何看”的证据，不再取代幕型已经确认的题面、结论、任务或反馈。
  const specializedKind = specializedContentKind(scene)
  if (specializedKind) return <SpecializedSceneView kind={specializedKind} scene={scene} course={course} sceneNumber={sceneNumber} />

  // 其余配图幕 → 四轴版式系统(图形态×文字形态×立绘位×字幕形态,见 lib/mainline/presentation/composition)
  if (scene.imageUrl) return <CompositionScene scene={scene} course={course} />

  // 配图幕型已填文字但图未生成 → 过渡态占位:此时讲稿可指图,不能落入无图版式
  // (三联底卡 bottom-[12%] 会与字幕带瞬时重叠,round12 观察项 3)
  if (course.qualityStatus === 'passed' && IMAGE_SCENE_TYPES.includes(scene.sceneType)) {
    return <ImagePendingScene scene={scene} course={course} />
  }

  // 开场扉页:杂志封面式报头 + 渐进目录(告别"标题+三条杠")
  if (scene.sceneType === 'source-reading') {
    const displayScene = !scene.kpId && scene.visualFocus.trim() === course.topic.trim()
      ? { ...scene, visualFocus: courseDisplayTitle(course) }
      : scene
    return <SourceReadingView scene={displayScene} course={course} pres={presentationFor(displayScene, course)} />
  }

  // 新幕型走显式 sceneType 分派(槽位必上屏:题面/任务/反馈不再丢失)
  if (scene.sceneType === 'worked-example') return <WorkedExampleView scene={scene} course={course} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  if (scene.sceneType === 'practice') return <PracticeView scene={scene} course={course} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  if (scene.sceneType === 'concept-build') return <ConceptBuildView scene={scene} course={course} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  // ai-collab 专属视图(2026-07-22 S3 扩容):task/rubric 槽位等权同屏,不再挤通用板书卡
  if (scene.sceneType === 'ai-collab') return <AiCollabView scene={scene} course={course} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />

  if (scene.sceneTechnique === 'local-zoom') return <LocalZoom scene={scene} pres={presentationFor(scene, course)} />
  if (scene.sceneTechnique === 'comparison-slider') return <ComparisonView scene={scene} course={course} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  if (scene.visualLayout.includes('three-panel')) return <TriptychView scene={scene} pres={presentationFor(scene, course)} sceneNumber={sceneNumber} />
  if (scene.sceneTechnique === 'path-tracing') return <PathTracingView scene={scene} pres={presentationFor(scene, course)} />
  if (scene.sceneTechnique === 'simulation') return <RefractionSimulation scene={scene} />
  if (scene.contentSlots.labels) return <LabelledDiagram scene={scene} />
  if (scene.sceneTechnique === 'draggable-model') return <DraggableModel scene={scene} />
  if (scene.sceneTechnique === 'step-replay') return <StepReplay scene={scene} pres={presentationFor(scene, course)} />

  return <StaticBoard course={course} scene={scene} sceneNumber={sceneNumber} />
}

function SpecializedSceneView({ kind, scene, course, sceneNumber }: { kind: SpecializedContentKind; scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const pres = presentationFor(scene, course)
  let visual: React.ReactNode

  switch (kind) {
    case 'poem': visual = <PoemDisplay scene={scene} />; break
    case 'timeline': visual = <TimelineEventsView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />; break
    case 'dialogue': visual = <DialogueScriptView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />; break
    case 'force': visual = <ForceDiagramView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />; break
    case 'function-plot': visual = <CoordinatePlotView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />; break
    case 'geometry': visual = <GeometryView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} model={geometryVisualFor(scene.contentSlots)!} />; break
    case 'chemistry': visual = <ChemistryContentView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} model={chemistryVisualFor(scene.contentSlots)!} />; break
    case 'circuit': visual = <CircuitDiagramView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} model={circuitVisualFor(scene.contentSlots)!} />; break
    case 'chinese': visual = <ChineseContentView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} model={chineseVisualFor(scene.contentSlots)!} />; break
    case 'english': visual = <EnglishContentView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} model={englishVisualFor(scene.contentSlots)!} />; break
    case 'biology': visual = <BiologyStructureView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} model={biologyVisualFor(scene.contentSlots)!} />; break
    case 'optics': visual = <OpticsDiagramView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />; break
  }

  return <CoreWithSpecializedVisual scene={scene} pres={pres}>{visual}</CoreWithSpecializedVisual>
}

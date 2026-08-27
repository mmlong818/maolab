'use client'

import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Timer, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  classroomLessonCanComplete,
  courseDisplayScene,
  courseHasDualTeacherOption,
  dualTeacherSceneBehavior,
  lessonPhaseOf,
  openingAttemptIsComplete,
  openingAttemptReviewIsComplete,
  openingAttemptStateKey,
  recapTransferAttemptIsComplete,
  recapTransferStateKey,
  recapTransferTaskProblems,
  stagedLearningConfig,
  stagedRevealAction,
  lessonPresentationPages,
  presentationNavigationBlocker,
  presentationPageStateKey,
  presentationScene,
  INITIAL_VOICE_SESSION_STATE,
  nextVoiceSessionState,
  scenePlaybackRate,
  teacherScriptForSpeech,
  voiceForMainlineCast,
  voiceSessionAllowsSynthesis,
  voicePaceLabel,
  voicePauseTimingLabel,
  type CastProfile,
  type LessonScene,
  type LessonOpeningAttempt,
  type MainlineCourse,
  type ScenePresentation,
  type VoiceSessionState,
} from '@/lib/mainline'
import { backdropGradient, FONT_STACKS } from '@/lib/mainline/presentation/tokens'
import { toRgba } from '@/lib/mainline/presentation/color'
import { practiceObjectiveCriteria } from '@/lib/mainline/mastery'
import type { TextureSpec } from '@/lib/mainline/presentation/primitives'
import { baseplateOverlay, baseplateSize, chromeColorsFor, coursePaletteFor, presentationFor, type ChromeColors } from '@/lib/mainline'
import ScaleStage from '@/components/ScaleStage'
import { DialogueLayer, dialogueBandVisible, dialogueCopy } from './DialogueLayer'
import { cardSurface, MathText } from './scene-views/shared'
import { SceneTechniqueView } from './SceneTechniqueView'
import { AnnotationCanvas, AnnotationToolbar, useAnnotations } from './AnnotationLayer'
import { useTtsAudio } from './useTtsAudio.js'
import { LearningCycleCheckIn } from './LearningCycleCheckIn'
import { OpeningLearningCheckIn } from './OpeningLearningCheckIn'
import { LessonCompletion } from './LessonCompletion'
import { RecapTransferCheckIn } from './RecapTransferCheckIn'
import { useClassroomSessionProgress } from './useClassroomSessionProgress'

const MIN_SUPPORTED_WIDTH = 1024

interface StageCanvasProps {
  courses: MainlineCourse[]
}

export function StageCanvas({ courses }: StageCanvasProps) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  // 导出渲染态(?export=1&page=N):PPTX 截图管线逐页打开本页,画面必须与授课
  // 放映完全一致且不含任何管理浮层——「导出的 PPT 复现应用中的原样」(2026-08-25)。
  // 这两个参数只有无头截图路径会带,惰性初始化直读 URL:首帧即目标页
  // (它与 SSR 首帧不同造成的 hydration 警告只发生在截图页面,无人观看;
  // mount 后再 set 会输给会话恢复对 sceneIndex 的写入,截到错页——实撞过)。
  const exportRender = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('export') === '1'
  const [sceneIndex, setSceneIndex] = useState(() => {
    if (typeof window === 'undefined') return 0
    const page = Number(new URLSearchParams(window.location.search).get('page'))
    return Number.isFinite(page) && page >= 1 ? page - 1 : 0
  })
  // 截图管线不赌 networkidle 与 hydration 的时序:目标页真正渲染后才发就绪信号,
  // route 端 waitForFunction 等到它才按快门。
  useEffect(() => {
    if (!exportRender) return
    document.body.dataset.exportReady = String(sceneIndex + 1)
    return () => { delete document.body.dataset.exportReady }
  }, [exportRender, sceneIndex])
  const course = courses.find(item => item.id === courseId) ?? courses[0]
  const presentationPages = useMemo(() => course ? lessonPresentationPages(course) : [], [course])

  // v5 M2 WP7:双师模式开关——只有课程含 teacher/co 幕才露出;默认关,关闭时
  // 下面所有渲染/TTS 分支都读 dualTeacherSceneBehavior(scene, false),行为与开关加入前完全一致。
  const dualTeacherAvailable = useMemo(() => course ? courseHasDualTeacherOption(course.scenes) : false, [course])
  const [dualMode, setDualMode] = useState(false)
  // 课堂放映形态(2026-08-25 用户定档:授课内容生成工具,可理解为 PPT):
  // - teach 授课放映(默认):只有前后翻页+语音+批注,无任何作答控制与导航闸门,
  //   题面页→答案页靠翻页揭晓;学生作答留在纸面/口头,由教师现场组织,系统不采集。
  // - study 自学互动:学生自己操作设备,保留完整证据闭环(开场/先答/揭晓/自评/闸门)。
  // 深链 ?mode=study 进入自学;顶部开关可切,切换不清进度。
  const [classroomMode, setClassroomMode] = useState<'teach' | 'study'>('teach')
  useEffect(() => {
    // mount 后读深链参数(同上:避免 SSR/客户端首帧不一致)
    if (new URLSearchParams(window.location.search).get('mode') === 'study') setClassroomMode('study')
  }, [])
  const teachMode = classroomMode === 'teach'
  const anno = useAnnotations()
  const {
    classroomSessionId,
    lessonCompleted,
    setLessonCompleted,
    openingAttempts,
    setOpeningAttempts,
    recapTransferAttempts,
    setRecapTransferAttempts,
    stagedAttempts,
    setStagedAttempts,
    revealedLearningFeedback,
    setRevealedLearningFeedback,
    postRevealRecords,
    setPostRevealRecords,
    practiceEvidenceSaved,
    setPracticeEvidenceSaved,
    practiceFeedbackByScene,
    setPracticeFeedbackByScene,
  } = useClassroomSessionProgress(course, sceneIndex, setSceneIndex, { enabled: !exportRender })
  // 投影授课下正式练习的纸面完成确认:仅本标签页内存态,不进会话快照、不写掌握度。
  // 刷新后需教师重新一击确认——比伪造「已保存证据」诚实。
  const [practicePaperComplete, setPracticePaperComplete] = useState<Record<string, boolean>>({})
  const lessonCanComplete = useMemo(() => course ? classroomLessonCanComplete(
    course,
    openingAttempts,
    revealedLearningFeedback,
    postRevealRecords,
    practiceEvidenceSaved,
    recapTransferAttempts,
    practicePaperComplete,
  ) : false, [course, openingAttempts, revealedLearningFeedback, postRevealRecords, practiceEvidenceSaved, recapTransferAttempts, practicePaperComplete])

  useEffect(() => {
    if (!lessonCanComplete && lessonCompleted) setLessonCompleted(false)
  }, [lessonCanComplete, lessonCompleted, setLessonCompleted])

  // 授课=PPT:方向键/PgUp/PgDn 翻页(翻页笔发送的就是 PgUp/PgDn),空格仅在焦点
  // 不在任何控件上时前进。输入控件聚焦时不劫持(自学模式打字优先)。翻页仍走
  // moveScene → canNavigateTo,自学模式的证据闸门照常拦截,键盘不是旁路。
  const moveSceneRef = useRef<(delta: number) => void>(() => {})
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown'
        || (event.key === ' ' && (!target || target === document.body))) {
        event.preventDefault()
        moveSceneRef.current(1)
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        moveSceneRef.current(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 授课=PPT 放映:管理性浮层(模式开关/批注钮/底部控制条/页面角标/提示横幅,
  // 统一挂 .classroom-chrome)默认淡出,鼠标移动或触屏浮现 3 秒后再隐——画面只留
  // 教学内容(2026-08-25 用户裁决「大量附加内容叠加在画面上影响观看」)。
  // 自学模式与批注进行中不隐藏(学生要操作/教师在画)。样式在 globals.css。
  const [chromeAwake, setChromeAwake] = useState(true)
  const chromeHideTimer = useRef<number | undefined>(undefined)
  const chromeAutoHide = teachMode && !anno.on
  useEffect(() => {
    // 导出截图态:chrome 常隐,不挂唤醒监听(截图进程的鼠标事件不该唤出浮层)
    if (exportRender) {
      document.body.classList.add('stage-chrome-hidden')
      return () => document.body.classList.remove('stage-chrome-hidden')
    }
    if (!chromeAutoHide) {
      window.clearTimeout(chromeHideTimer.current)
      setChromeAwake(true)
      return
    }
    function wake() {
      setChromeAwake(true)
      window.clearTimeout(chromeHideTimer.current)
      chromeHideTimer.current = window.setTimeout(() => setChromeAwake(false), 3000)
    }
    // 进入放映先给 3 秒看清控制位置,随后隐去
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('pointerdown', wake)
    return () => {
      window.clearTimeout(chromeHideTimer.current)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  }, [chromeAutoHide, exportRender])
  useEffect(() => {
    if (exportRender) return
    document.body.classList.toggle('stage-chrome-hidden', chromeAutoHide && !chromeAwake)
    return () => document.body.classList.remove('stage-chrome-hidden')
  }, [chromeAutoHide, chromeAwake, exportRender])

  // 视窗宽度检测:< 1024 显示提示(用户明确不管这个档位)
  const [tooNarrow, setTooNarrow] = useState(false)
  useEffect(() => {
    function check() { setTooNarrow(window.innerWidth < MIN_SUPPORTED_WIDTH) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // 语音教学模式:每次进入课堂先由教师显式启动；启动后翻页自动播当前幕并预取下一幕。
  // 不从 localStorage 恢复“开启”状态，避免页面加载即产生外部 TTS 请求与费用。
  const tts = useTtsAudio()
  const [voiceSession, setVoiceSession] = useState<VoiceSessionState>(INITIAL_VOICE_SESSION_STATE)
  const voiceOn = voiceSessionAllowsSynthesis(voiceSession)
  const [showVoiceCue, setShowVoiceCue] = useState(false)
  useEffect(() => setShowVoiceCue(false), [course?.id, sceneIndex])
  useEffect(() => {
    if (!voiceOn || !course) return
    const idx = Math.min(sceneIndex, Math.max(0, presentationPages.length - 1))
    const currentPage = presentationPages[idx]
    if (!currentPage) return
    const current = presentationScene(currentPage)
    // v5 M2 WP7:双师模式下 teacher 幕交给真人教师亲自开口,AI 静默不代讲
    if (dualTeacherSceneBehavior(current, dualMode).silenceTts) {
      tts.stop()
      return
    }
    const cast = course.castProfiles.find(c => c.id === current.voiceCue.castId)
    void tts.play(
      spokenTextFor(current, cast),
      voiceForMainlineCast(course, current.voiceCue.castId),
      currentPage.id,
      {
        rate: scenePlaybackRate(current.voiceCue.pace),
        emotion: current.voiceCue.emotion,
      },
    )
    const nextPage = presentationPages[idx + 1]
    if (nextPage) {
      const next = presentationScene(nextPage)
      if (dualTeacherSceneBehavior(next, dualMode).silenceTts) return
      const nextCast = course.castProfiles.find(c => c.id === next.voiceCue.castId)
      tts.prefetch(
        spokenTextFor(next, nextCast),
        voiceForMainlineCast(course, next.voiceCue.castId),
        next.voiceCue.emotion,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn, course?.id, sceneIndex, dualMode, presentationPages])

  function toggleVoice() {
    const nextSession = nextVoiceSessionState(voiceSession)
    if (!voiceSessionAllowsSynthesis(nextSession)) tts.stop()
    setVoiceSession(nextSession)
  }

  if (!course) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#17140f] px-6 text-[#f9f1df]">
        <div className="max-w-xl rounded-[8px] border border-[#6d5c3f] bg-[#211b13] p-8">
          <h1 className="text-[28px] font-semibold">没有可预览的样板课</h1>
          <p className="mt-3 text-[16px] leading-[1.7] text-[#d7c6a8]">请先在 GOLDEN_MAINLINE_COURSES 中补齐至少一节课程。</p>
        </div>
      </main>
    )
  }

  const safeSceneIndex = Math.min(sceneIndex, Math.max(0, presentationPages.length - 1))
  const currentPage = presentationPages[safeSceneIndex]
  const scene = currentPage ? courseDisplayScene(course, presentationScene(currentPage)) : undefined

  if (!scene) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#17140f] px-6 text-[#f9f1df]">
        <div className="max-w-xl rounded-[8px] border border-[#6d5c3f] bg-[#211b13] p-8">
          <h1 className="text-[28px] font-semibold">{course.topic}</h1>
          <p className="mt-3 text-[16px] leading-[1.7] text-[#d7c6a8]">这节样板课还没有任何 scene，暂不能进入舞台。</p>
        </div>
      </main>
    )
  }

  // 呈现方案(风格包+调色板+四轴+身份三轴)只随当前幕算一次,chrome/字体变量/
  // 背景质感层全部从这一份派生,不重复调用 presentationFor(真检 2026-07-21)。
  const pres = presentationFor(scene, course)
  const stagedConfig = stagedLearningConfig(scene)
  const stagedKey = presentationPageStateKey(course.id, currentPage!)
  const stagedFeedbackRevealed = currentPage!.feedbackRevealed
  const practiceCriteria = scene.kpId ? practiceObjectiveCriteria(course.goals, scene.kpId) : []
  const sceneForDialogue = scene
  const revealedLearningAction = stagedFeedbackRevealed ? stagedRevealAction(scene) : null
  // chrome(控制条/页码/双师开关/对白框/名牌)配色:课程级基准 palette 派生,不随幕
  // 变化(真检 2026-07-21:此前全硬编码 classic 暖棕,压在蓝图等冷色包幕布上冷暖
  // 打架;2026-07-21 课内色彩节奏上线后 pres.palette 按幕明暗分层,chrome 必须锚
  // 在课程基准态,否则控制条会跟着幕的明暗弧线闪变)
  const chrome = chromeColorsFor(coursePaletteFor(course))
  const dualBehavior = dualTeacherSceneBehavior(scene, dualMode)
  const sceneCount = presentationPages.length
  const openingSceneIndex = presentationPages.findIndex(item => item.scene.sceneType === 'source-reading')
  const openingScene = openingSceneIndex >= 0
    ? course.scenes.find(item => item.id === presentationPages[openingSceneIndex]?.sourceSceneId)
    : undefined
  const openingKey = openingScene ? openingAttemptStateKey(course.id, openingScene.id) : ''
  const openingAttempt = openingKey ? openingAttempts[openingKey] : undefined
  const openingComplete = !openingScene || openingAttemptIsComplete(openingAttempt)
  const openingReviewComplete = !openingScene || openingAttemptReviewIsComplete(openingAttempt)
  const recapTransferRequired = scene.sceneType === 'recap'
    && recapTransferTaskProblems(scene.contentSlots.transferTask).length === 0
  const recapTransferKey = recapTransferRequired ? recapTransferStateKey(course.id, scene.id) : ''
  const recapTransferAttempt = recapTransferKey ? recapTransferAttempts[recapTransferKey] : undefined
  const recapTransferComplete = !recapTransferRequired || recapTransferAttemptIsComplete(recapTransferAttempt)
  const courseStatePrefix = `${course.id}:`
  const postRevealCount = Object.entries(postRevealRecords)
    .filter(([key, record]) => key.startsWith(courseStatePrefix) && Boolean(record))
    .length
  const practiceSavedCount = Object.entries(practiceEvidenceSaved)
    .filter(([key, saved]) => key.startsWith(courseStatePrefix) && saved === true)
    .length
  const lessonCompletionBlockReason = !openingReviewComplete
    ? '请先完成开场判断的回看与修正'
    : !recapTransferComplete
      ? '请先完成收束页迁移挑战'
    : navigationBlockReason(presentationPages.length) ?? undefined
  const openingQuestion = openingScene?.contentSlots.openingQuestion?.trim()
    || `关于${course.topic}，在看讲解前你认为最关键的判断依据是什么？`
  // 授课放映 = PPT:整个学习动作区不存在,教师只翻页。
  const showLearningActionDock = !teachMode && Boolean(
    stagedConfig
    || (scene.sceneType === 'source-reading' && openingScene)
    || (scene.sceneType === 'recap' && openingAttempt)
    || recapTransferRequired
    || safeSceneIndex === presentationPages.length - 1,
  )

  // StylePack 身份三轴 → CSS 变量注入(2026-07-21 identity refresh)。字体:display/
  // heading 走 --pack-font-display,其余 tier 靠继承拿根节点默认的 --pack-font-body
  // (tokens.ts TYPE_SCALE 只在 display/heading 显式写 fontFamily,单一注入点见此处)。
  // 表面:cardSurface() 同一份函数既服务这里的 CSS 变量、也服务卡片调用点直接
  // spread 的 JS 对象——两条消费路径共享一份计算,不重复定义"五种表面长什么样"。
  const surface = cardSurface(pres.palette, pres.pack.surface)
  const stageVars: CSSProperties = {
    '--pack-font-display': FONT_STACKS[pres.pack.typography.display],
    '--pack-font-body': FONT_STACKS[pres.pack.typography.body],
    '--pack-surface-radius': surface.borderRadius,
    '--pack-surface-shadow': surface.boxShadow,
    '--pack-surface-transform': surface.transform ?? 'none',
    '--pack-surface-backdrop': surface.backdropFilter ?? 'none',
    '--scene-safe-bottom': '16%',
    '--scene-dialogue-bottom': showLearningActionDock ? '14%' : '6%',
  } as CSSProperties

  function chooseCourse(nextCourseId: string) {
    setCourseId(nextCourseId)
    setSceneIndex(0)
  }

  function moveScene(delta: number) {
    setSceneIndex(current => {
      const target = Math.min(sceneCount - 1, Math.max(0, current + delta))
      return canNavigateTo(target) ? target : current
    })
  }
  moveSceneRef.current = moveScene

  function canNavigateTo(index: number): boolean {
    return navigationBlockReason(index) === null
  }

  function navigationBlockReason(index: number): string | null {
    if (!course) return '课程尚未加载'
    // 授课放映不设导航闸门:教师像翻 PPT 一样自由前后与跳页。
    if (teachMode) return null
    if (!openingComplete && openingSceneIndex >= 0 && index > openingSceneIndex) {
      return `请先完成第 ${openingSceneIndex + 1} 页开场作答，才能进入后续内容`
    }
    const blocker = presentationNavigationBlocker(
      course.id,
      presentationPages,
      index,
      revealedLearningFeedback,
      postRevealRecords,
      practiceEvidenceSaved,
      practicePaperComplete,
    )
    if (!blocker) return null
    return blocker.phase === 'reveal'
      ? `请先完成第 ${blocker.pageIndex + 1} 页作答并点击“${blocker.actionLabel}”`
      : blocker.phase === 'practice-evidence'
        ? `请先完成第 ${blocker.pageIndex + 1} 页${blocker.actionLabel}`
        : `请先完成第 ${blocker.pageIndex + 1} 页“${blocker.actionLabel}”`
  }

  function revealCurrentPage() {
    setRevealedLearningFeedback(current => ({ ...current, [stagedKey]: true }))
    const nextPage = presentationPages[safeSceneIndex + 1]
    if (nextPage?.stateId === currentPage!.stateId && nextPage.feedbackRevealed) {
      setSceneIndex(safeSceneIndex + 1)
    }
  }

  function saveOpeningAttempt(attempt: LessonOpeningAttempt) {
    if (!openingKey) return
    setOpeningAttempts(current => ({ ...current, [openingKey]: attempt }))
  }

  if (tooNarrow) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#0e0c09] text-[#f9f1df] px-6">
        <div className="max-w-md rounded-[10px] border border-[#6d5c3f] bg-[#211b13] p-8 text-center">
          <div className="text-[15px] font-semibold tracking-[0.08em] text-[#f0c978]">MAINLINE 上课</div>
          <h1 className="mt-3 text-[24px] font-semibold">屏幕太窄</h1>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#d7c6a8]">
            上课模式按 1920×1080 设计,当前视窗宽度不足 1024。请把窗口拉宽或换到更大的屏幕。
          </p>
        </div>
      </main>
    )
  }

  return (
    <>
      {/* v5 M2 WP7:双师模式开关渲染在 ScaleStage 之外——ScaleStage 内层带 transform:scale,
          嵌进去的 fixed 元素会以那层为定位基准而不是真实视口(CSS transform 建立新的
          containing block)。当兄弟层放在这里就是真正锚定视口顶部,不碰 ScaleStage/StageCanvas
          既有的满幅+缩放机制。只有课程含 teacher/co 幕才显示;默认关。 */}
      {/* 放映形态切换:授课=纯翻页(默认,PPT 语义);自学=学生自己作答的完整证据闭环。 */}
      <div className="classroom-chrome fixed left-3 top-3 z-[100] flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: chrome.chipBorder }}>
          {([
            { value: 'teach' as const, label: '授课' },
            { value: 'study' as const, label: '自学' },
          ]).map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setClassroomMode(option.value)}
              className="border-r px-3 py-1.5 text-[13px] font-semibold transition last:border-r-0 hover:brightness-110"
              style={classroomMode === option.value
                ? { borderColor: chrome.chipBorder, background: chrome.activeBg, color: chrome.activeText }
                : { borderColor: chrome.chipBorder, background: chrome.chipBgFloating, color: chrome.chipText }}
              aria-pressed={classroomMode === option.value}
              title={option.value === 'teach' ? '投影授课:只保留翻页、语音与批注' : '学生自学:逐页作答并保留学习证据'}
            >
              {option.label}
            </button>
          ))}
        </div>
        {dualTeacherAvailable && (
          <button
            type="button"
            onClick={() => setDualMode(v => !v)}
            className="rounded-[8px] border px-3 py-1.5 text-[13px] font-semibold transition hover:brightness-110"
            style={dualMode
              ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
              : { borderColor: chrome.chipBorder, background: chrome.chipBgFloating, color: chrome.chipText }}
          >
            {dualMode ? '双师模式 · 开' : '双师模式'}
          </button>
        )}
      </div>
      {/* 教师舞台批注工具栏:与双师开关同理渲染在 ScaleStage 之外(视口固定,避开 transform 定位)。 */}
      <div className="classroom-chrome"><AnnotationToolbar state={anno} sceneId={currentPage!.id} chrome={chrome} /></div>
    <ScaleStage baseWidth={1920} baseHeight={1080} background="#0e0c09">
      <div
        lang="zh-CN"
        className="relative h-full w-full text-[#f9f1df]"
        style={{
          lineBreak: 'strict',
          fontSynthesis: 'none',
          fontVariantNumeric: 'tabular-nums',
          // heti 级标点挤压(task4):Edge 认 text-spacing-trim,不认 text-autospace/
          // hanging-punctuation(CDP CSS.supports 实测均为 false,故不加,不做 JS 逐字包裹兜底)。
          textSpacingTrim: 'trim-start',
          // 字体身份轴默认落到 body 栈,display/heading 由 TYPE_SCALE 自己覆盖
          // (见 tokens.ts)——舞台内所有未显式指定字体的文字(对白框/名牌/控制条)
          // 因此也自动继承 body 字体,不用逐个组件传参。
          fontFamily: 'var(--pack-font-body)',
          ...stageVars,
        } as CSSProperties}
      >
        <StageBackdrop pres={pres} />

        {/* 课程主题在建课页已经确认过,上课时无需每帧顶部大标题占空间。 */}

        {courses.length > 1 && (
          <div className="absolute right-[3%] top-[3%] z-50 flex flex-wrap justify-end gap-2">
            {courses.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseCourse(item.id)}
                className="rounded-[8px] border px-4 py-2 text-[14px] font-semibold transition hover:brightness-110"
                style={item.id === course.id
                  ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
                  : { borderColor: chrome.chipBorder, background: chrome.chipBgFloating, color: chrome.chipText }}
              >
                {shortCourseLabel(item)}
              </button>
            ))}
          </div>
        )}

        {/* 教学内容满幅铺满整个画面:立绘/对白框/控制条都是临时浮层压在上面
            ("会有一些遮挡,但不是全程"),唯一预留区是底部字幕带(DialogueLayer
            统一锚定 bottom-9%),不再按 layout 切侧边或底部死区。
            v5 M2 WP7:双师模式下 teacher 幕整体让位给 TeacherBoardLayer(大板书+提词器),
            立绘/对白框(DialogueLayer)一并退场;其余幕(ai/co)不受影响。 */}
          <div className="absolute inset-0 z-10 overflow-hidden">
            {dualBehavior.showBigBoard && stagedFeedbackRevealed
              ? <TeacherBoardLayer course={course} scene={scene} />
              : <SceneTechniqueView course={course} scene={scene} sceneNumber={safeSceneIndex + 1} stagedFeedbackRevealed={stagedFeedbackRevealed} />}
          </div>

          {/* 揭晓动作提示是自学场景的操作指令(圈出/写错因/选择结果),授课放映下
              这些操作不存在,浮条只会压住内容(2026-08-25 用户截图:盖住「判断」行)。 */}
          {!teachMode && revealedLearningAction && (
            <div
              data-testid={revealedLearningAction.sceneType === 'worked-example' ? 'worked-example-self-explanation' : 'staged-reveal-action'}
              data-staged-reveal-action={revealedLearningAction.sceneType}
              className="absolute left-1/2 z-30 flex w-fit max-w-[82%] -translate-x-1/2 items-start gap-3 border-l-4 px-5 py-3.5"
              // chip 与字幕带共用同一条安全线锚点;带在场时(带 max-h 194px,z-40 在前)
              // chip 原位必然被整条压住成幽灵文字——带守住定档预留区,chip 抬到带上方。
              style={{
                bottom: (!dualBehavior.showBigBoard || !stagedFeedbackRevealed) && dialogueBandVisible(sceneForDialogue, course.castProfiles)
                  ? 'calc(var(--scene-dialogue-bottom, 18%) + 194px + 14px)'
                  : 'var(--scene-dialogue-bottom, 18%)',
                borderColor: chrome.activeBorder,
                background: chrome.chipBgFloating,
                color: chrome.chipText,
              }}
            >
              <CheckCircle2 aria-hidden size={22} className="mt-0.5 shrink-0" style={{ color: chrome.activeBorder }} />
              <div>
                <div className="text-[13px] font-semibold" style={{ color: chrome.mutedText }}>{revealedLearningAction.label}</div>
                <div className="mt-0.5 text-[20px] leading-[1.5]"><MathText>{revealedLearningAction.instruction}</MathText></div>
              </div>
            </div>
          )}

          {/* 2026-08-25 用户裁决:授课模式无需对白(老师在场,字幕冗余且遮内容),
              立绘与对白带整体退场;自学模式保留。导出态=授课原样,同样无对白。 */}
          {!teachMode && (!dualBehavior.showBigBoard || !stagedFeedbackRevealed) && (
            <DialogueLayer scene={sceneForDialogue} castProfiles={course.castProfiles} chrome={chrome} />
          )}

          {/* 教师批注画布:叠在场景之上(z-40)、控制条之下(z-50);关时 pointer-events 穿透。 */}
          <AnnotationCanvas state={anno} sceneId={currentPage!.id} />
      </div>
    </ScaleStage>

      {showLearningActionDock && (
        <section
          data-classroom-learning-actions
          aria-label="本页学习动作"
          className="pointer-events-none fixed inset-x-0 bottom-[72px] z-[110] flex justify-center px-4"
        >
          <div
            className="pointer-events-auto flex max-w-[calc(100vw-32px)] flex-wrap items-center justify-center gap-2 rounded-[8px] border px-2 py-2 shadow-xl"
            style={{ borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}
          >
            <LearningCycleCheckIn
              courseId={course.id}
              stateKey={stagedKey}
              classroomSessionId={classroomSessionId ?? undefined}
              scene={scene}
              successSignal={practiceCriteria[0]?.successSignal}
              criterionAlignment={practiceCriteria[0]?.alignment}
              chrome={chrome}
              feedbackRevealed={stagedFeedbackRevealed}
              onReveal={revealCurrentPage}
              stagedAttempt={stagedAttempts[stagedKey]}
              onStagedAttempt={attempt => setStagedAttempts(current => ({ ...current, [stagedKey]: attempt }))}
              postRevealRecord={postRevealRecords[stagedKey]}
              onPostRevealRecord={record => setPostRevealRecords(current => ({ ...current, [stagedKey]: record }))}
              practiceEvidenceSaved={Boolean(practiceEvidenceSaved[stagedKey])}
              practiceFeedback={practiceFeedbackByScene[stagedKey]}
              onPracticeEvidenceSaved={feedback => {
                setPracticeEvidenceSaved(current => ({ ...current, [stagedKey]: true }))
                setPracticeFeedbackByScene(current => ({ ...current, [stagedKey]: feedback }))
              }}
              practicePaperComplete={Boolean(practicePaperComplete[stagedKey])}
              onPracticePaperComplete={() => setPracticePaperComplete(current => ({ ...current, [stagedKey]: true }))}
            />
            {scene.sceneType === 'source-reading' && openingScene && (
              <OpeningLearningCheckIn
                mode="capture"
                phase={lessonPhaseOf(course)}
                openingQuestion={openingQuestion}
                attempt={openingAttempt}
                chrome={chrome}
                onChange={saveOpeningAttempt}
              />
            )}
            {scene.sceneType === 'recap' && openingAttempt && (
              <OpeningLearningCheckIn
                mode="review"
                phase={lessonPhaseOf(course)}
                openingQuestion={openingQuestion}
                attempt={openingAttempt}
                chrome={chrome}
                onChange={saveOpeningAttempt}
              />
            )}
            {recapTransferRequired && (
              <RecapTransferCheckIn
                scene={scene}
                {...(recapTransferAttempt ? { attempt: recapTransferAttempt } : {})}
                chrome={chrome}
                onChange={attempt => setRecapTransferAttempts(current => ({ ...current, [recapTransferKey]: attempt }))}
              />
            )}
            {safeSceneIndex === presentationPages.length - 1 && (
              <LessonCompletion
                ready={lessonCanComplete}
                completed={lessonCompleted && lessonCanComplete}
                {...(lessonCompletionBlockReason ? { blockedReason: lessonCompletionBlockReason } : {})}
                hasOpeningReview={Boolean(openingScene && openingReviewComplete)}
                postRevealCount={postRevealCount}
                practiceSavedCount={practiceSavedCount}
                hasTransferEvidence={recapTransferComplete && recapTransferRequired}
                chrome={chrome}
                onComplete={() => setLessonCompleted(true)}
                onRestart={() => setSceneIndex(0)}
              />
            )}
          </div>
        </section>
      )}

      <nav
        data-classroom-controls
        aria-label="课堂页面控制"
        className="classroom-chrome fixed inset-x-0 bottom-0 z-[110] flex h-16 items-center gap-2 border-t px-4"
        style={{ borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}
      >
        <button
          type="button"
          onClick={() => moveScene(-1)}
          disabled={safeSceneIndex === 0}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
          style={{ borderColor: chrome.chipBorder, color: chrome.chipText }}
          aria-label="上一页"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-[76px] max-w-[220px] shrink items-center gap-2 text-[15px]" style={{ color: chrome.chipText }}>
          <span className="font-semibold">{safeSceneIndex + 1}</span>
          <span style={{ color: chrome.mutedText }}>/</span>
          <span>{presentationPages.length}</span>
          <span className="ml-1 hidden min-w-0 truncate xl:inline" style={{ color: chrome.mutedText }} title={scene.visualFocus}>{scene.visualFocus}</span>
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[8px] border px-3 text-[14px] font-semibold transition hover:brightness-110"
          style={voiceOn
            ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
            : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.mutedText }}
          aria-pressed={voiceOn}
          title={voiceOn ? '关闭本次课堂语音' : '启动本次课堂语音'}
        >
          {tts.loadingKey ? (
            <><LoaderCircle size={17} className="animate-spin" aria-hidden />合成中…</>
          ) : !voiceOn ? (
            <><Volume2 size={17} aria-hidden />启动语音</>
          ) : dualBehavior.silenceTts ? (
            <><VolumeX size={17} aria-hidden />教师主讲</>
          ) : (
            <><Volume2 size={17} aria-hidden />{speakerLabel(scene, course.castProfiles)}</>
          )}
        </button>
        <div className="relative shrink-0">
          {showVoiceCue && (
            <div
              className="absolute bottom-[calc(100%+10px)] left-0 w-[360px] rounded-[8px] border p-4 text-left shadow-xl"
              style={{ borderColor: chrome.chipBorder, background: chrome.barBg, color: chrome.chipText }}
              role="status"
            >
              <div className="text-[14px] font-semibold" style={{ color: chrome.mutedText }}>授课节奏</div>
              <div className="mt-1 text-[16px] font-semibold">{voicePaceLabel(scene.voiceCue.pace)}</div>
              <p className="mt-2 text-[16px] leading-[1.55]">{scene.voiceCue.pauseRule}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowVoiceCue(value => !value)}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border px-3 text-[14px] font-semibold transition hover:brightness-110"
            style={showVoiceCue
              ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
              : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
            aria-expanded={showVoiceCue}
            aria-label="查看授课节奏"
            title={scene.voiceCue.pauseRule}
          >
            <Timer size={17} aria-hidden="true" />
            {voicePauseTimingLabel(scene.voiceCue.pauseRule)}
          </button>
        </div>
        {safeSceneIndex < presentationPages.length - 1 && (
          <button
            type="button"
            onClick={() => moveScene(1)}
            disabled={!canNavigateTo(safeSceneIndex + 1)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
            style={{ borderColor: chrome.chipBorder, color: chrome.chipText }}
            aria-label="下一页"
            title={navigationBlockReason(safeSceneIndex + 1) ?? undefined}
          >
            <ChevronRight size={20} />
          </button>
        )}
        <div
          className="scrollbar-none ml-auto flex max-w-[42vw] min-w-0 items-center gap-1 overflow-x-auto py-1"
          role="group"
          aria-label="课程页面"
        >
          {presentationPages.map((item, index) => (
            <button
              key={item.id}
              type="button"
              // 滚动条隐藏后,当前页码必须自己滚进可视区,否则后段页码永远看不见
              ref={index === safeSceneIndex ? el => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
              onClick={() => {
                setSceneIndex(index)
              }}
              disabled={!canNavigateTo(index)}
              className="h-11 min-w-11 shrink-0 rounded-[8px] border px-2 text-[14px] font-semibold transition hover:brightness-110"
              style={index === safeSceneIndex
                ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
                : { borderColor: chrome.chipBorder, background: chrome.chipBg, color: chrome.chipText }}
              title={navigationBlockReason(index) ?? item.scene.visualFocus}
              aria-current={index === safeSceneIndex ? 'page' : undefined}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}

/** 播报文本:同学幕念字幕同款台词(所见即所闻),老师/旁白幕念完整讲稿。 */
function spokenTextFor(scene: LessonScene, cast?: CastProfile): string {
  if (cast && cast.role === 'student') return dialogueCopy(scene, cast)
  return teacherScriptForSpeech(scene.teacherScript)
}

function speakerLabel(scene: LessonScene, castProfiles: CastProfile[]): string {
  return castProfiles.find(c => c.id === scene.voiceCue.castId)?.displayName ?? '旁白'
}

/**
 * v5 M2 WP7:双师模式下 teacher 幕的大板书层——独立覆盖层,不动 DialogueLayer/StageCanvas
 * 既有的满幅+字幕带规则(它们只服务 AI 演出幕)。boardText 满幅铺开当黑板抄写,
 * 底部叠一个可折叠的教师提词器面板显示 teacherScript,教师看着提词器自己讲、自己点下一幕。
 */
function TeacherBoardLayer({ course, scene }: { course: MainlineCourse; scene: LessonScene }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette
  const [scriptOpen, setScriptOpen] = useState(true)
  // chrome 锚在课程基准态,不随幕的明暗弧线变化(见上方 chromeColorsFor(coursePaletteFor(course)) 的注释)
  const chrome = chromeColorsFor(coursePaletteFor(course))
  const speechReadyScript = teacherScriptForSpeech(scene.teacherScript)

  return (
    <section className="relative flex h-full w-full flex-col items-center justify-center px-[10%] pb-[16%] text-center" style={{ background: theme.backdrop[2], color: theme.ink }}>
      <div className="flex items-center gap-3 text-[14px] font-semibold tracking-[0.2em]" style={{ color: theme.accent }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: theme.accent }} />
        双师模式 · 教师主讲
      </div>
      <h2 className="mt-6 max-w-[86%] text-[42px] font-semibold leading-[1.22]">{scene.visualFocus}</h2>
      <div className="mt-9 flex max-w-[86%] flex-wrap items-center justify-center gap-3">
        {scene.boardText.map(item => (
          <div key={item} className="rounded-[8px] border px-6 py-4 text-[24px] font-semibold" style={{ background: theme.paper, borderColor: `${theme.accent}55` }}>
            {item}
          </div>
        ))}
      </div>

      <div className="absolute inset-x-[8%] z-20 rounded-[10px] border text-left shadow-[0_18px_50px_rgba(0,0,0,0.35)]" style={{ bottom: 'var(--scene-dialogue-bottom, 9%)', borderColor: chrome.barBorder, background: chrome.barBg, color: chrome.chipText }}>
        <button
          type="button"
          onClick={() => setScriptOpen(v => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-[14px] font-semibold tracking-[0.06em]"
        >
          教师提词器
          <span>{scriptOpen ? '收起 ▾' : '展开 ▸'}</span>
        </button>
        {scriptOpen && (
          <div className="max-h-[160px] overflow-y-auto px-5 py-4 text-[16px] leading-[1.7]" style={{ borderTop: `1px solid ${chrome.chipBorder}`, color: chrome.mutedText }}>
            {speechReadyScript}
          </div>
        )}
      </div>
    </section>
  )
}

function StageBackdrop({ pres }: { pres: ScenePresentation }) {
  // 配色库(学科 × mood)+ 底图库(纹理):每科可辨、每幕有质感,同课色调稳定
  const background = backdropGradient(pres.palette)
  const overlay = baseplateOverlay(pres.baseplate, pres.palette)
  const overlaySize = baseplateSize(pres.baseplate)

  return (
    <>
      <div className="absolute inset-0" style={{ background }} />
      {overlay && (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: overlay, ...(overlaySize ? { backgroundSize: overlaySize } : {}) }} />
      )}
      {/* 明度二次收紧(2026-07-22):字幕带底衬 12%→6%,暗角 8%→4%——整页停留在亮端。 */}
      <div className="absolute inset-x-0 bottom-0 bg-[#332617]/6" style={{ height: 'var(--scene-safe-bottom)' }} />
      {/* 暗角全包通用(与风格包无关的舞台边缘收光)。 */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.04) 100%)' }} />
      {/* StylePack 质感轴(2026-07-21):替代此前写死的"深色包才叠胶片颗粒"单一判定
          (wantsFilmGrain),按 pack.texture.kind 叠五选一的全幅背景质感层,
          全课统一、intensity 控深浅——grain/paper 复用同一 feTurbulence 原语
          (仅 baseFrequency/色调不同),grid/dots 是纯 CSS 渐变,none 不叠加。 */}
      <StageTextureLayer texture={pres.pack.texture} ink={pres.palette.ink} accent={pres.palette.accent} accentSoft={pres.palette.accentSoft} />
    </>
  )
}

/** StylePack 质感轴:舞台全幅背景质感层,七选一,intensity(0-1)控制叠加强度。
 * mesh/glow(明亮令新增)吃 accent/accentSoft 做光影色场,其余只吃 ink。 */
function StageTextureLayer({ texture, ink, accent, accentSoft }: { texture: TextureSpec; ink: string; accent: string; accentSoft: string }) {
  switch (texture.kind) {
    case 'grain':
      return <FilmGrainLayer baseFrequency={0.8} opacity={0.03 + texture.intensity * 0.06} />
    case 'paper':
      // 低频 turbulence 模拟纸纤维(比 grain 的高频颗粒更疏更"软"),暖墨色叠加
      // 而非纯黑白噪点,防止在浅色纸包上显脏(round13 教训:胶片颗粒在纸色包上反而显脏)。
      return <FilmGrainLayer baseFrequency={0.16} opacity={0.025 + texture.intensity * 0.05} tint={ink} />
    case 'grid':
      return (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${toRgba(ink, 0.07)} 0 1px, transparent 1px 72px), repeating-linear-gradient(90deg, ${toRgba(ink, 0.07)} 0 1px, transparent 1px 72px)`,
            opacity: 0.35 + texture.intensity * 0.5,
          }}
        />
      )
    case 'dots':
      return (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `radial-gradient(${toRgba(ink, 0.12)} 1.6px, transparent 1.8px)`, backgroundSize: '40px 40px', opacity: 0.35 + texture.intensity * 0.5 }}
        />
      )
    case 'mesh':
      // 渐变网格:三团 accent/accentSoft 色晕锚在角落——明亮地色上的柔和色场,
      // 不压字(低 alpha,内容区中央基本留白),当代 aurora 质感。
      return (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(42% 55% at 12% 8%, ${toRgba(accent, 0.14)}, transparent 70%), radial-gradient(50% 60% at 88% 12%, ${toRgba(accentSoft, 0.55)}, transparent 72%), radial-gradient(58% 46% at 50% 104%, ${toRgba(accent, 0.10)}, transparent 75%)`,
            opacity: 0.45 + texture.intensity * 0.55,
          }}
        />
      )
    case 'glow':
      // 定向光晕:左上主光源 + 118° 斜向光带衰减——给明亮底做出光的方向感,
      // 白光提亮为主、accent 只在暗端极低浓度收尾,保持浅底深字对比不受损。
      return (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(50% 62% at 16% -4%, rgba(255,255,255,0.75), transparent 68%), linear-gradient(118deg, rgba(255,255,255,0.38) 0%, transparent 36%, ${toRgba(accent, 0.06)} 82%)`,
            opacity: 0.5 + texture.intensity * 0.5,
          }}
        />
      )
    default:
      return null
  }
}

/** feTurbulence 分形噪点(胶片颗粒/纸纹共用同一原语),纯内联 SVG,不产生任何网络请求或静态资源。 */
function FilmGrainLayer({ baseFrequency, opacity, tint }: { baseFrequency: number; opacity: number; tint?: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ mixBlendMode: 'overlay', opacity }} aria-hidden="true">
      <filter id="mainline-film-grain">
        <feTurbulence type="fractalNoise" baseFrequency={baseFrequency} numOctaves={2} stitchTiles="stitch" />
        {tint && (
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 ${hexChannel(tint, 0)}  0 0 0 0 ${hexChannel(tint, 1)}  0 0 0 0 ${hexChannel(tint, 2)}  0 0 0 1 0`}
          />
        )}
      </filter>
      <rect width="100%" height="100%" filter="url(#mainline-film-grain)" />
    </svg>
  )
}

/** #rrggbb → 0-1 的单通道值,供 feColorMatrix 把噪点染成墨色(纸纹质感专用,grain 不传 tint 保持灰阶)。 */
function hexChannel(hex: string, index: 0 | 1 | 2): number {
  const v = hex.replace('#', '')
  return parseInt(v.slice(index * 2, index * 2 + 2), 16) / 255
}

function shortCourseLabel(course: MainlineCourse): string {
  if (course.id.includes('jingyesi')) return '小学诗'
  if (course.id.includes('tianjingsha')) return '初中诗'
  return '理科课'
}

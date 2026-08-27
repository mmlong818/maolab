'use client'

/**
 * PreviewStage · 备课工作台中栏只读预览(v5 M1 WP2)
 *
 * StageCanvas 本体不可复用:它的 ScaleStage 依赖 `position:fixed` + `100vw/100vh`
 * 铺满整个浏览器视口来做等比缩放舞台,嵌进三栏工作台的中栏盒子里会整屏溢出盖住
 * 左右栏(position:fixed 的尺寸用 vw/vh 单位,不会因祖先设置 transform 而按祖先盒子
 * 重新计算尺寸——只有定位基准会变,尺寸基准不会变)。
 *
 * 因此这里不做"黑盒嵌入 + key 重挂载"的整幅方案,改为复用 StageCanvas 内部已经
 * 抽出来的纯页面组件 SceneTechniqueView,配合一个用 ResizeObserver 量自身容器尺寸(而非
 * window)的等比缩放层——同 ScaleStage 的缩放算法,只是基准换成容器。
 * StageCanvas.tsx 本体不做任何改动。
 *
 * 备课预览只检查学生会看到的页面内容。教师讲稿仍在对应幕的备课详情中展示，
 * 不作为对白气泡叠在页面上；同时也不引入翻页、语音和学情打卡等课堂状态。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LessonScene, MainlineCourse } from '@/lib/mainline'
import { backdropGradient, baseplateOverlay, baseplateSize, chromeColorsFor, courseDisplayScene, coursePaletteFor, presentationFor } from '@/lib/mainline'
import { DialogueLayer } from '../DialogueLayer'
import { SceneTechniqueView } from '../SceneTechniqueView'
import { AnnotationCanvas, AnnotationToolbar, useAnnotations } from '../AnnotationLayer'

const BASE_WIDTH = 1920
const BASE_HEIGHT = 1080

interface PreviewStageProps {
  course: MainlineCourse
  scene: LessonScene
  pageNumber?: number
  showAnnotations?: boolean
  /** 该独立投影片处于学生作答前或作答后的固定状态。 */
  forceFeedbackRevealed?: boolean
}

export function PreviewStage({ course, scene, pageNumber, showAnnotations = true, forceFeedbackRevealed = true }: PreviewStageProps) {
  const displayScene = courseDisplayScene(course, scene)
  const outerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0)
  const anno = useAnnotations()
  const chrome = chromeColorsFor(coursePaletteFor(course))
  // 预览保留事先配置的立绘；没有实际素材时才取消角色让位，避免凭空留下空白安全区。
  const previewScene: LessonScene = hasConfiguredPortrait(displayScene, course) ? displayScene : { ...displayScene, dialogueLayout: 'no-character' }
  const feedbackRevealed = forceFeedbackRevealed

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    function recalc() {
      const rect = el!.getBoundingClientRect()
      setScale(rect.width > 0 && rect.height > 0 ? Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT) : 0)
    }
    recalc()
    window.addEventListener('resize', recalc)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(recalc)
    observer?.observe(el)
    return () => {
      window.removeEventListener('resize', recalc)
      observer?.disconnect()
    }
  }, [])

  return (
    <div
      ref={outerRef}
      data-scene-id={displayScene.id}
      aria-label={`${displayScene.visualFocus}页面预览`}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#0e0c09', borderRadius: 12, overflow: 'hidden' }}
    >
      {scale > 0 && (
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            width: BASE_WIDTH, height: BASE_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: '50% 50%',
          }}
        >
          <div
            lang="zh-CN"
            className="relative h-full w-full text-[#f9f1df]"
            style={{
              lineBreak: 'strict',
              fontSynthesis: 'none',
              fontVariantNumeric: 'tabular-nums',
              '--scene-safe-bottom': '4%',
            } as CSSProperties}
          >
            <PreviewBackdrop course={course} scene={displayScene} />
            <div className="absolute inset-0 z-10 overflow-hidden">
              <SceneTechniqueView
                course={course}
                scene={previewScene}
                {...(pageNumber === undefined ? {} : { sceneNumber: pageNumber })}
                stagedFeedbackRevealed={feedbackRevealed}
              />
            </div>
            <DialogueLayer scene={previewScene} castProfiles={course.castProfiles} chrome={chrome} display="portrait-only" />
            {showAnnotations ? <AnnotationCanvas state={anno} sceneId={displayScene.id} /> : null}
          </div>
        </div>
      )}
      {/* 备课台批注:工具栏相对预览面板定位(panel),画布叠在缩放层内 */}
      {showAnnotations ? <AnnotationToolbar state={anno} sceneId={displayScene.id} chrome={chrome} variant="panel" /> : null}
    </div>
  )
}

function hasConfiguredPortrait(scene: LessonScene, course: MainlineCourse): boolean {
  if (scene.dialogueLayout === 'no-character' || scene.dialogueLayout === 'narration-only') return false
  const cast = course.castProfiles.find(item => item.id === scene.characterLayer.castId)
  return Boolean(cast?.assetRefs?.some(item => item.src))
}

/** 与 StageCanvas.tsx 内部 StageBackdrop 视觉等价的复刻(该函数未导出,无法直接复用)。 */
function PreviewBackdrop({ course, scene }: { course: MainlineCourse; scene: LessonScene }) {
  const pres = presentationFor(scene, course)
  const background = backdropGradient(pres.palette)
  const overlay = baseplateOverlay(pres.baseplate, pres.palette)
  const overlaySize = baseplateSize(pres.baseplate)

  return (
    <>
      <div className="absolute inset-0" style={{ background }} />
      {overlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: overlay, ...(overlaySize ? { backgroundSize: overlaySize } : {}) }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-[#332617]/6" style={{ height: 'var(--scene-safe-bottom)' }} />
    </>
  )
}

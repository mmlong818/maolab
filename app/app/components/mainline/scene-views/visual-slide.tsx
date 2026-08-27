'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { presentationFor } from '@/lib/mainline'
import { fitType, projectionFontSize, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { toRgba } from '@/lib/mainline/presentation/color'
import { observationPanels, type ObservationPanel } from '@/lib/mainline/presentation/observation-content'
import { MathText, SceneBadge, pickMasterRouted } from './shared'

/**
 * visual-slide · 观察幕 5 母版(2026-07-23 单版式扩容为母版路由,呼应
 * recap/worked-example 已落地的"↑母版数、真异质结构"扩容模式)
 *
 * ⓪栏目卡式(原版,2026-07-22 用户复核「按 PPT 排版」定型:近白整版 + 大标题 +
 *   居中插图卡 + 底部编号说明卡横排,来源 docs/design-refresh/harvest/
 *   open-design·.slide 栏目网格语法)
 * ①左图右注式(来源 harvest/layouts/touying.md 的 split-slide 双栏骨架):
 *   左栏竖直大图卡钉住画面主体,右栏标题+纵向堆叠说明卡(左侧 accent 竖条),
 *   编辑式双栏——与⓪的"图上文下"单栏骨架完全不同。
 * ②引线标注式(来源 slidev-neocarbon/diagram 图表标注 + open-design callout
 *   引线机制):图居中偏上放大,四周散布编号 chip,细 accent 引线(线+终端圆点)
 *   从图边指向 chip——本幕型唯一"辐射式标注"骨架,信息密度最高。
 * ③影院单带式(来源 harvest/layouts/marpstyle.md 全出血图手法,但收边不出血、
 *   不深底):图占上 62% 大画框、右上角 accent 圆形幕序号角标,标题降格成图上方
 *   overline 小字,图下方是连续通栏说明带(等宽分栏、细分隔线,不设独立卡片)。
 * ④图鉴网格式(来源 harvest/layouts/touying.md touying-university/matrix-slide):
 *   顶部标题条 + 宽幅 hero 图卡 + 下方说明卡走 2 列网格,零圆角零阴影的功能主义
 *   骨架,适合说明点多的密集场景。
 */
export function VisualObservationSlide({ scene, course, sceneNumber }: { scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const master = pickMasterRouted(course, scene, 'visual-observation')
  if (master === 1) return <ObsSplitMaster scene={scene} course={course} sceneNumber={sceneNumber} />
  if (master === 2) return <ObsCalloutMaster scene={scene} course={course} sceneNumber={sceneNumber} />
  if (master === 3) return <ObsCinemaMaster scene={scene} course={course} sceneNumber={sceneNumber} />
  if (master === 4) return <ObsFieldGuideMaster scene={scene} course={course} sceneNumber={sceneNumber} />
  return <ObsColumnMaster scene={scene} course={course} sceneNumber={sceneNumber} />
}

/**
 * 母版⓪栏目卡式(原版):标题在上 → 居中图卡 → 底部编号说明卡横排。
 * 内容区高度统一读取舞台安全区：课堂保留对白空间，备课预览没有对白时自动铺开。
 */
function ObsColumnMaster({ scene, course, sceneNumber }: { scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette
  const cards = observationPanels(scene)

  return (
    <section className="absolute inset-0 flex flex-col" style={{ background: theme.paper, color: theme.ink }}>
      <div className="scene-safe-height flex flex-col gap-4 px-[5.5%] pt-[3.5%]">
        <div>
          <SceneBadge number={sceneNumber} label="观察" theme={theme} />
          <h2 className="mt-2" style={fitType('heading', scene.visualFocus.length)}>
            <MathText>{scene.visualFocus}</MathText>
          </h2>
          <div
            className="mt-3 h-[3px] w-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${theme.accent}, ${toRgba(theme.accent, 0)})` }}
          />
        </div>

        <div
          className="relative min-h-0 flex-[3] overflow-hidden rounded-[14px]"
          style={{ background: theme.backdrop[0], boxShadow: `0 18px 50px ${toRgba(theme.ink, 0.12)}` }}
        >
          <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
        </div>

        <div className="grid flex-[2] gap-4" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
          {cards.map((panel, index) => (
            <div
              key={panel.id}
              className="flex flex-col justify-center rounded-[10px] border px-5 py-4"
              style={{ borderColor: toRgba(theme.accent, 0.28), background: theme.paper, boxShadow: `0 10px 26px ${toRgba(theme.ink, 0.08)}` }}
            >
              <div className="mb-1.5" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</div>
              <ObservationCardContent panel={panel} theme={theme} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * 母版①宽带图注式:标题带 → 满宽大图带(与 3:1 生成图同族,object-contain 填满不留空带)
 * → 说明卡横排(accentSoft 左条卡),整块纵向 justify-between 填满内容区。与⓪的区别:
 * ⓪是有边框卡 + 分隔线的"栏目"气质,①是满宽出血图带 + accentSoft 实底条卡的"杂志跨页"气质。
 * (2026-07-23 真检:原左窄列放 3:1 宽图上下留大空带,改满宽带填满。)
 */
function ObsSplitMaster({ scene, course, sceneNumber }: { scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette
  const cards = observationPanels(scene)

  return (
    <section className="absolute inset-0 flex flex-col" style={{ background: theme.paper, color: theme.ink }}>
      <div className="scene-safe-height flex flex-col gap-5 px-[5.5%] pt-[3.5%]">
        <div className="flex items-baseline gap-3">
          <SceneBadge number={sceneNumber} label="观察" theme={theme} />
          <h2 style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
        </div>
        <div
          className="relative min-h-0 flex-[3] overflow-hidden rounded-[14px]"
          style={{ background: theme.backdrop[0], boxShadow: `0 18px 50px ${toRgba(theme.ink, 0.12)}` }}
        >
          <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
        </div>
        <div className="grid flex-[2] gap-4" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
          {cards.map((panel, index) => (
            <div
              key={panel.id}
              className="flex flex-col justify-center rounded-r-[10px] py-4 pl-5 pr-4"
              style={{ borderLeft: `4px solid ${theme.accent}`, background: theme.accentSoft }}
            >
              <div className="mb-1.5" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</div>
              <ObservationCardContent panel={panel} theme={theme} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** 引线标注行:chip 贴外沿,引线 flex-1 铺满固定宽容器直抵图缘,终端圆点落在图边。
 * side 决定 chip/圆点朝向(左/右侧向,底部纵向),让"线指向图"的意图真正连上。 */
function CalloutRow({ index, panel, theme, side }: { index: number; panel: ObservationPanel; theme: ScenePresentation['palette']; side: 'left' | 'right' | 'bottom' }) {
  const chip = (
    <div
      className="rounded-full border px-4 py-2"
      style={{ borderColor: toRgba(theme.accent, 0.4), background: theme.paper, boxShadow: `0 10px 24px ${toRgba(theme.ink, 0.1)}` }}
    >
      <span
        className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full align-middle"
        style={{ background: theme.accent, color: theme.paper, fontSize: projectionFontSize('auxiliary'), lineHeight: 1 }}
      >
        {index + 1}
      </span>
      <span className="inline-flex flex-col align-middle" style={{ maxWidth: 'calc(100% - 32px)' }}>
        <strong data-observation-panel-title={panel.id} style={{ fontSize: projectionFontSize('body'), lineHeight: 1.35 }}><MathText>{panel.title}</MathText></strong>
        <span
          data-observation-panel-detail={panel.id}
          title={panel.detail}
          style={{ color: toRgba(theme.ink, 0.72), fontSize: projectionFontSize('auxiliary'), lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          <MathText>{panel.detail}</MathText>
        </span>
      </span>
    </div>
  )
  const dot = <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: theme.accent }} />
  const hLine = <span className="mx-1 h-px flex-1" style={{ background: toRgba(theme.accent, 0.55) }} />
  const vLine = <span className="my-1 w-px flex-1" style={{ background: toRgba(theme.accent, 0.55) }} />

  if (side === 'left') return <div className="flex w-full items-center">{chip}{hLine}{dot}</div>
  if (side === 'right') return <div className="flex w-full flex-row-reverse items-center">{chip}{hLine}{dot}</div>
  return <div className="flex h-full flex-col items-center">{dot}{vLine}{chip}</div>
}

/**
 * 母版②引线标注式:图居中偏上放大,四周编号说明 chip 贴外沿,细 accent 引线
 * 从图缘辐射指向各 chip——认知负荷稍高、信息密,本幕型唯一"辐射式标注"骨架,
 * 与⓪①的"文字成栏成块"都不同构。chip 在固定宽容器里靠外沿,引线铺满到图边。
 */
function ObsCalloutMaster({ scene, course, sceneNumber }: { scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette
  const items = observationPanels(scene)
  // 图居中放大占宽 50%(贴 3:1 生成图,少留空带),竖直居中;侧向 chip 贴图上下缘两档,
  // 底部 chip 落图下方,引线抵图缘。整簇纵向居中填满内容区。
  const slots: { className: string; side: 'left' | 'right' | 'bottom' }[] = [
    { className: 'absolute left-[3%] top-[27%] w-[24%]', side: 'left' },
    { className: 'absolute right-[3%] top-[27%] w-[24%]', side: 'right' },
    { className: 'absolute left-[3%] top-[55%] w-[24%]', side: 'left' },
    { className: 'absolute right-[3%] top-[55%] w-[24%]', side: 'right' },
    { className: 'absolute bottom-[2%] left-1/2 h-[16%] w-[36%] -translate-x-1/2', side: 'bottom' },
  ]

  return (
    <section className="absolute inset-0 flex flex-col" style={{ background: theme.paper, color: theme.ink }}>
      <div className="scene-safe-height relative px-[4%] pt-[3%]">
        <div className="absolute inset-x-0 top-0 flex justify-center">
          <div className="flex max-w-[46%] items-baseline gap-3">
            <SceneBadge number={sceneNumber} label="观察" theme={theme} />
            <span style={{ ...fitType('body', scene.visualFocus.length), color: theme.ink }}>
              <MathText>{scene.visualFocus}</MathText>
            </span>
          </div>
        </div>
        <div
          className="absolute left-1/2 top-[24%] h-[50%] w-[50%] -translate-x-1/2 overflow-hidden rounded-[14px]"
          style={{ background: theme.backdrop[0], boxShadow: `0 18px 50px ${toRgba(theme.ink, 0.12)}` }}
        >
          <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
        </div>
        {items.map((panel, index) => {
          const slot = slots[index]!
          return (
            <div key={panel.id} className={slot.className}>
              <CalloutRow index={index} panel={panel} theme={theme} side={slot.side} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * 母版③影院单带式:图占上 62% 大画框(圆角卡,右上角 accent 圆形幕序号角标),
 * 标题降格成图上方 overline 小字;图下方是连续通栏说明带(等宽分栏、细分隔线,
 * 不设独立卡片边框/阴影)——留白舒展,与⓪④的"独立卡片"语言不同构。
 */
function ObsCinemaMaster({ scene, course, sceneNumber }: { scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette
  const cards = observationPanels(scene)

  return (
    <section className="absolute inset-0 flex flex-col" style={{ background: theme.paper, color: theme.ink }}>
      <div className="scene-safe-height flex flex-col px-[6%] pt-[3%]">
        <div className="flex items-baseline gap-3">
          <SceneBadge number={sceneNumber} label="观察" theme={theme} />
          <span className="tracking-wide" style={{ ...fitType('body', scene.visualFocus.length), color: theme.ink }}>
            <MathText>{scene.visualFocus}</MathText>
          </span>
        </div>
        <div
          className="relative mt-4 overflow-hidden rounded-[16px]"
          style={{ flex: '0 0 62%', background: theme.backdrop[0], boxShadow: `0 20px 54px ${toRgba(theme.ink, 0.14)}` }}
        >
          <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
          <div
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: theme.accent, color: theme.paper, ...TYPE_SCALE.caption }}
          >
            {String(sceneNumber).padStart(2, '0')}
          </div>
        </div>
        <div className="mt-5 flex flex-1 items-stretch overflow-hidden rounded-[10px]" style={{ background: theme.backdrop[1] }}>
          {cards.map((panel, index) => (
            <div
              key={panel.id}
              className="flex flex-1 flex-col justify-center gap-1.5 px-5"
              style={{ borderLeft: index > 0 ? `1px solid ${toRgba(theme.ink, 0.12)}` : undefined }}
            >
              <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
              <ObservationCardContent panel={panel} theme={theme} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * 母版④图鉴网格式:顶部标题条(SceneBadge + 标题 inline)→ 图作一张宽幅 hero
 * 卡 → 下方说明卡走 2 列网格,零圆角零阴影的功能主义骨架——信息密,适合
 * 说明点多的场景,与②③的"辐射/通栏"构图都不同。
 */
function ObsFieldGuideMaster({ scene, course, sceneNumber }: { scene: LessonScene; course: MainlineCourse; sceneNumber: number }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette
  const cards = observationPanels(scene)

  return (
    <section className="absolute inset-0 flex flex-col" style={{ background: theme.paper, color: theme.ink }}>
      <div className="scene-safe-height flex flex-col overflow-hidden">
        <div className="flex items-center gap-4 border-b px-[5.5%] py-4" style={{ borderColor: toRgba(theme.ink, 0.1) }}>
          <SceneBadge number={sceneNumber} label="观察" theme={theme} />
          <h2 style={fitType('heading', scene.visualFocus.length)}>
            <MathText>{scene.visualFocus}</MathText>
          </h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-[5.5%] pt-4">
          <div className="relative h-[46%] shrink-0 overflow-hidden rounded-[10px]" style={{ background: theme.backdrop[0] }}>
            <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
            {cards.map((panel, index) => (
              <div
                key={panel.id}
                className="flex flex-col justify-center gap-1.5 border px-5 py-3.5"
                style={{ borderColor: toRgba(theme.ink, 0.12), background: theme.paper }}
              >
                <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
                <ObservationCardContent panel={panel} theme={theme} compact />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ObservationCardContent({ panel, theme, compact = false }: {
  panel: ObservationPanel
  theme: ScenePresentation['palette']
  compact?: boolean
}) {
  return (
    <div className="min-w-0">
      <div data-observation-panel-title={panel.id} style={{ ...fitType('body', panel.title.length), fontWeight: 800 }}>
        <MathText>{panel.title}</MathText>
      </div>
      <div
        data-observation-panel-detail={panel.id}
        title={panel.detail}
        style={{
          display: '-webkit-box',
          marginTop: compact ? 2 : 4,
          overflow: 'hidden',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: compact ? 2 : 3,
          color: toRgba(theme.ink, 0.72),
          fontSize: projectionFontSize('auxiliary', compact ? 24 : 26),
          fontWeight: 500,
          lineHeight: 1.45,
        }}
      >
        <MathText>{panel.detail}</MathText>
      </div>
    </div>
  )
}

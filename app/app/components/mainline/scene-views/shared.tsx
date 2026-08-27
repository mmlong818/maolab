'use client'

import type { LessonScene, MainlineCourse, ScenePresentation, SpriteSide } from '@/lib/mainline'
import { IMAGE_ZONE_HEIGHT, labelCss, markerCss, presentationFor, SERIAL_HOOK_SLOT } from '@/lib/mainline'
import { hexToOklch, mixOklch, toRgba } from '@/lib/mainline/presentation/color'
import type { SurfaceId } from '@/lib/mainline/presentation/primitives'
import { pickMasterRouted } from '@/lib/mainline/presentation/master-routing'
import { fitType, TYPE_SCALE, type TypeStyle } from '@/lib/mainline/presentation/tokens'
import { pickMaster } from './master-hash'

export { pickMaster, pickMasterRouted }
/** 数理化行内 LaTeX 渲染(方向二内容形态):槽文本可能含 \( … \),各母版在
 * 公式高发槽位(题面/步骤/表述/任务)用它替代裸字符串渲染,无公式时原样透传。 */
import { splitEnumeratedItems } from '@/lib/mainline/presentation/enumerated-text'
import MathText from '../../MathOrText'
export { MathText }

/**
 * scene-views/shared · 拆分自 SceneTechniqueView.tsx 的共享件
 *
 * 四轴版式渲染(CompositionScene 及其子件)+ 各幕型母版共用的排版原子
 * (SceneBadge/cardSurface/darkLightBase/spritePad/pickMaster 等)。
 * 纯移动,行为不变——每个母版文件从这里 import,不再各自重复实现。
 */

/** 占位草稿判定:compile-lesson 的槽位缺省值一律含"待 LLM 填充",走既有约定不新造标记。 */
export function isFilled(value: string | undefined): value is string {
  return !!value && !value.includes('待 LLM 填充')
}

/**
 * 深浅基准色:暗场包(如蓝图)paper 暗于 ink——ink 其实是浅色文字、paper 才是深底,
 * 和纸色包正好相反。统一取"较暗者"当深底基准、"较浅者"当反白文字基准,不管
 * 具体包的 ink/paper 语义哪个更暗(chrome.ts 的 darkColor/lightColor 同款规则)。
 */
export function darkLightBase(theme: ScenePresentation['palette']): { dark: string; light: string } {
  const isDarkPack = hexToOklch(theme.paper).l < hexToOklch(theme.ink).l
  return isDarkPack ? { dark: theme.paper, light: theme.ink } : { dark: theme.ink, light: theme.paper }
}

/**
 * 题头条(标题条→渐变分隔→正文条三段式母版专用)配色:浅包沿用纯 accent 底 +
 * paper 反色字,原样保留;深包下同一手法会把最亮的 accent 整块铺成题头,
 * 亮度反超正文体——题头是标签不是主角(真检 induction-03:题头抢戏)。
 * 深包改成 accent 压向 paper 混出的哑光带(mixOklch 0.55,只留一点点强调色的
 * 影子),条内文字换成深浅基准的浅色(即正文已在用的 ink)保证可读。
 */
export function titlebarSurface(theme: ScenePresentation['palette']): { background: string; color: string } {
  const isDarkPack = hexToOklch(theme.paper).l < hexToOklch(theme.ink).l
  if (!isDarkPack) return { background: theme.accent, color: theme.paper }
  return { background: mixOklch(theme.accent, theme.paper, 0.55), color: theme.ink }
}

export interface CardSurfaceCss {
  border: string
  boxShadow: string
  borderRadius: string
  transform?: string
  backdropFilter?: string
}

/**
 * 卡片表面语言(2026-07-21 identity refresh):五种真正不同的形状语法,不是"换个
 * 边框色"——border-radius 的形状与 transform 的旋转是纯结构信号,蒙掉颜色/黑白稿
 * 下依然可辨。深浅场(dark = 暗场包 paper 暗于 ink)只决定边框/阴影的明暗基调,
 * 表面形状本身不随深浅变。
 *
 * 这套值同时是 StageCanvas.tsx 注入 `--pack-surface-*` CSS 变量的唯一事实源
 * (StageCanvas 对课程级 palette 调一次这个函数,写进变量供 globals.css 的
 * `.pack-surface` 长尾卡片消费)——本函数自己的调用点(TriptychView/worked-example
 * 步骤卡等"头部卡")则直接把返回值展开进 style,不吃 CSS 变量那层间接。
 */
export function cardSurface(theme: ScenePresentation['palette'], surface: SurfaceId): CardSurfaceCss {
  const dark = hexToOklch(theme.paper).l < hexToOklch(theme.ink).l
  const glowBorder = dark ? `1px solid ${toRgba(theme.accent, 0.55)}` : `1px solid ${toRgba(theme.accent, 0.28)}`
  const glowShadow = dark
    ? `0 0 0 1px ${toRgba(theme.accent, 0.16)}, 0 0 32px ${toRgba(theme.accent, 0.24)}`
    : '0 14px 40px rgba(40,26,12,0.14)'

  switch (surface) {
    case 'sharp-editorial':
      // 直角细边编辑部:近零圆角,阴影收成一条极浅的顶缘反光,克制冷静。
      return { border: glowBorder, borderRadius: '2px', boxShadow: dark ? glowShadow : `0 1px 0 ${toRgba(theme.ink, 0.08)}, 0 10px 26px rgba(20,16,10,0.10)` }
    case 'glass':
      // 玻璃拟态:半透明面 + 内亮边(inset highlight)+ 模糊——不改变调用方自己
      // 设置的 background 透明度,只叠 backdrop-filter 让底纹透出朦胧感。
      return {
        border: `1px solid ${toRgba('#ffffff', dark ? 0.22 : 0.55)}`,
        boxShadow: `${glowShadow}, inset 0 1px 0 ${toRgba('#ffffff', 0.28)}`,
        borderRadius: '18px',
        backdropFilter: 'blur(16px) saturate(160%)',
      }
    case 'ink-brush':
      // 水墨笔触边:四角不对称的夸张圆角模拟毛笔晕染轮廓,阴影加一层墨色扩散。
      return { border: glowBorder, borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px', boxShadow: `${glowShadow}, 0 24px 48px ${toRgba(theme.ink, 0.16)}` }
    case 'paper-sticker':
      // 贴纸感:圆角适中 + 硬投影(实色位移,不是虚化)+ 微旋转,手作贴纸质感。
      return { border: glowBorder, borderRadius: '9px', boxShadow: `${glowShadow}, 5px 8px 0 ${toRgba(theme.ink, 0.85)}`, transform: 'rotate(-1.6deg)' }
    default: // rounded-soft
      return { border: dark ? glowBorder : `1px solid ${toRgba(theme.ink, 0.06)}`, borderRadius: '26px', boxShadow: `0 26px 56px ${toRgba(theme.ink, 0.18)}` }
  }
}

/** 幕序号 + 幕型小标(caption 级,统一格式「04 · 例题拆解」),贯穿各 View 的页眉识别。 */
export function SceneBadge({ number, label, theme, tone = 'onLight' }: { number: number; label: string; theme: ScenePresentation['palette']; tone?: 'onLight' | 'onDark' }) {
  const color = tone === 'onDark' ? '#f7ecd6' : theme.accent
  return (
    <div
      className={`inline-flex w-fit items-center gap-2 ${tone === 'onDark' ? 'rounded-full px-3 py-1' : ''}`}
      style={{ ...TYPE_SCALE.caption, color, ...(tone === 'onDark' ? { background: 'rgba(20,14,8,0.55)' } : {}) }}
    >
      <span className="tabular-nums opacity-80">{String(number).padStart(2, '0')}</span>
      <span aria-hidden>·</span>
      <span>{label}</span>
    </div>
  )
}

/* ── 配图过渡态 ───────────────────────────────────────────────── */

/** 配图幕型「文字已填、图未生成」的占位:满幅纸底 + 教学要点前置,底部让出字幕带。 */
export function ImagePendingScene({ scene, course }: { scene: LessonScene; course: MainlineCourse }) {
  const pres = presentationFor(scene, course)
  const theme = pres.palette

  return (
    <section className="scene-safe-bottom flex h-full w-full flex-col items-center justify-center px-[12%] text-center" style={{ background: theme.backdrop[2], color: theme.ink }}>
      <div className="flex items-center gap-3" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
        <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: theme.accent }} />
        配图生成中
      </div>
      <h2 className="mt-6" style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
      <div className="mt-9 flex max-w-[72%] flex-wrap items-center justify-center gap-3">
        {scene.boardText.map(item => (
          <div key={item} className="rounded-full border px-6 py-2.5" style={{ ...fitType('body', item.length), background: theme.paper, borderColor: `${theme.accent}55` }}>
            <MathText>{item}</MathText>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 在 fitType 算出的档位上再加几个 px(而非跳一整个 tier)——短板书词条已经卡在
 * body 档最大字号,想再放大一号又不想冒 heading 档跳档过猛导致溢出换行的风险
 * (真检 induction-08:底部四词条偏小)。 */
function bumpFontSize(style: TypeStyle, px: number): TypeStyle {
  return { ...style, fontSize: `${parseFloat(style.fontSize) + px}px` }
}

/* ── 四轴版式渲染 ─────────────────────────────────────────────── */

/** 立绘让位:无图幕/侧栏内容避开立绘所在竖列(立绘约占 26% 宽、贴底 64% 高)。 */
export function spritePad(side: SpriteSide): string {
  if (side === 'left') return 'pl-[27%]'
  if (side === 'right') return 'pr-[27%]'
  return ''
}

/** 图区高度:与生图尺寸共用 IMAGE_ZONE_HEIGHT 事实源(composition.ts),改占比两端一起变。 */
function zoneHeightPct(form: 'cover-full' | 'band-top' | 'anchor-left' | 'anchor-right' | 'letterbox-center', subtitled: boolean): string {
  const zone = IMAGE_ZONE_HEIGHT[form]
  return `${(subtitled ? zone.subtitled : zone.plain) * 100}%`
}

export function CompositionScene({ scene, course }: { scene: LessonScene; course: MainlineCourse }) {
  const pres = presentationFor(scene, course)
  const composition = pres.composition
  const theme = pres.palette
  const subtitled = composition.subtitle !== 'none'
  const imageHeight = zoneHeightPct('letterbox-center', subtitled)
  // 宽高比随生成时的槽位尺寸(如 '1312:880');存量 '3:2'/'1:1' 同一解析路径兼容
  const [aw = 0, ah = 0] = (scene.imageAspect ?? '3:2').split(':').map(Number)
  const imageAspect = aw > 0 && ah > 0 ? `${aw} / ${ah}` : '3 / 2'
  const railSide: 'left' | 'right' = composition.sprite === 'left' ? 'right' : 'left'

  if (composition.image === 'cover-full') {
    // 满宽铺放,但有字幕时收高避让——图内底部教学内容不被对白框压住
    return (
      <section className="relative h-full w-full overflow-hidden" style={{ background: theme.backdrop[2] }}>
        <div className="absolute inset-x-0 top-0" style={{ height: zoneHeightPct('cover-full', subtitled) }}>
          <img src={scene.imageUrl!} alt={scene.visualFocus} className="h-full w-full object-cover" />
          {composition.text === 'strip-bottom' && (
            // 词条坐在图的密集下半部之上,直接压字与图内元素打架(真检 induction-12)——
            // 叠一层贴底渐变 scrim(不裁切图,只是图区内的叠加层),词条落在 scrim 上再读。
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0"
              style={{ height: '26%', background: `linear-gradient(180deg, transparent, ${toRgba(theme.backdrop[2], 0.85)})` }}
            />
          )}
        </div>
        <TextZone scene={scene} pres={pres} railSide={railSide} />
      </section>
    )
  }

  if (composition.image === 'band-top') {
    // 上带全宽拼接:同图放大模糊铺满作延展底,清晰原图 contain 居中——
    // 槽位定制后原图已近全宽(≤3:1 clamp 的差额由模糊底吸收),存量 3:2 图同样零裁切
    return (
      <section className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: theme.backdrop[2] }}>
        <div className="relative w-full overflow-hidden" style={{ height: zoneHeightPct('band-top', subtitled) }}>
          <img src={scene.imageUrl!} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-[26px]" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 42%, ${theme.backdrop[2]}59 100%)` }} />
          <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_14px_40px_rgba(20,12,4,0.35)]" />
        </div>
        <TextZone scene={scene} pres={pres} railSide={railSide} />
      </section>
    )
  }

  // letterbox-center / anchor-left / anchor-right:原比例完整展示,
  // 余下的竖带是侧栏文字卡位——左右空带从缺陷变成版位。
  const order = composition.image === 'anchor-left' ? 'flex-row' : composition.image === 'anchor-right' ? 'flex-row-reverse' : 'flex-row'
  const centered = composition.image === 'letterbox-center'
  return (
    <section className={`relative flex h-full w-full items-start overflow-hidden ${order} ${centered ? 'justify-center' : ''}`} style={{ background: theme.backdrop[2] }}>
      {centered && <RailSlot active={composition.text === 'rail-cards' && railSide === 'left'} scene={scene} sprite={composition.sprite} theme={theme} />}
      <div className="relative shrink-0 max-w-full" style={{ aspectRatio: imageAspect, height: imageHeight }}>
        <img src={scene.imageUrl!} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-cover" />
        {(composition.text === 'chips-tl' || composition.text === 'chips-tr') && (
          <BoardChips items={scene.boardText} side={composition.text === 'chips-tl' ? 'left' : 'right'} pres={pres} />
        )}
      </div>
      {centered
        ? <RailSlot active={composition.text === 'rail-cards' && railSide === 'right'} scene={scene} sprite={composition.sprite} theme={theme} />
        : <RailSlot active={composition.text === 'rail-cards'} scene={scene} sprite={composition.sprite} theme={theme} grow />}
      {(composition.text === 'strip-bottom' || composition.text === 'stepper-bottom') && (
        <TextZone scene={scene} pres={pres} railSide={railSide} />
      )}
    </section>
  )
}

/** 路径节点解析:优先 →;LLM 偶尔不写箭头时按分号/步次词拆(真检 round08:单节点回归)。 */
export function pathNodes(scene: LessonScene): string[] {
  const raw = scene.contentSlots.path ?? scene.boardText.join(' → ')
  let nodes = raw.split('→').map(item => item.trim()).filter(Boolean)
  if (nodes.length < 2) {
    nodes = raw.split(/[；;]|，?第[一二三四五六]步[，,：:]?/).map(item => item.trim()).filter(Boolean)
  }
  return nodes.slice(0, 6)
}

/** 图上/图下的文字区(胶囊、底条、stepper);侧栏形态走 RailSlot。 */
function TextZone({ scene, pres, railSide }: { scene: LessonScene; pres: ScenePresentation; railSide: 'left' | 'right' }) {
  const composition = pres.composition
  const theme = pres.palette
  const bottomAnchor = composition.subtitle !== 'none' ? 'bottom-[19%]' : 'bottom-[6%]'
  switch (composition.text) {
    case 'chips-tl':
      return <BoardChips items={scene.boardText} side="left" pres={pres} />
    case 'chips-tr':
      return <BoardChips items={scene.boardText} side="right" pres={pres} />
    case 'rail-cards':
      return (
        <div className={`absolute top-6 z-10 w-[24%] ${railSide === 'left' ? 'left-5' : 'right-5'}`}>
          <RailCards scene={scene} theme={theme} />
        </div>
      )
    case 'strip-bottom': {
      const stripItems = scene.boardText.slice(0, 4)
      return (
        <div className={`absolute inset-x-[4%] z-10 flex flex-col gap-2.5 ${bottomAnchor} ${spritePad(composition.sprite)}`}>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stripItems.length}, 1fr)` }}>
            {stripItems.map(item => (
              <div key={item} className="rounded-[8px] border px-5 py-3.5 shadow-[0_10px_32px_rgba(40,26,12,0.22)]" style={{ ...bumpFontSize(fitType('body', item.length), 3), borderColor: `${theme.accent}55`, background: `${theme.paper}f0`, color: theme.ink }}>
                {item}
              </div>
            ))}
          </div>
          <SerialHookTeaser scene={scene} theme={theme} />
        </div>
      )
    }
    case 'stepper-bottom': {
      const nodes = pathNodes(scene)
      return (
        <div className={`absolute inset-x-[5%] z-10 flex flex-col gap-2.5 ${bottomAnchor} ${spritePad(composition.sprite)}`}>
          <div className="relative flex items-stretch justify-between gap-3">
            <div className="absolute left-[4%] right-[4%] top-[26px] h-[3px] opacity-45" style={{ background: theme.accent }} />
            {nodes.map((node, index) => (
              <div key={node} className="relative z-10 flex flex-1 flex-col items-center gap-2">
                <div className="flex h-[52px] w-[52px] items-center justify-center shadow-[0_10px_26px_rgba(80,50,16,0.2)]" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>
                  {index + 1}
                </div>
                <div className="rounded-[8px] bg-[#241c11]/78 px-3 py-1.5 text-center text-[#f7ecd6] backdrop-blur-[2px]" style={TYPE_SCALE.caption}>
                  {node}
                </div>
              </div>
            ))}
          </div>
          <SerialHookTeaser scene={scene} theme={theme} />
        </div>
      )
    }
    default:
      return null
  }
}

/** v4 M2 下集预告(课程季结尾钩子):只在 recap 幕出现,一行悬念,剧情预算受闸门约束。 */
export function SerialHookTeaser({ scene, theme }: { scene: LessonScene; theme: ScenePresentation['palette'] }) {
  const hook = scene.sceneType === 'recap' ? scene.contentSlots[SERIAL_HOOK_SLOT] : undefined
  if (!hook) return null
  return (
    <div className="flex items-center gap-3 self-center rounded-[8px] border border-dashed px-5 py-2.5 shadow-[0_8px_24px_rgba(40,26,12,0.16)]" style={{ borderColor: `${theme.accent}99`, background: `${theme.paper}ee` }}>
      <span className="shrink-0" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>下集预告</span>
      <span style={{ ...TYPE_SCALE.caption, fontWeight: 500, color: theme.ink }}>{hook}</span>
    </div>
  )
}

/** 信箱侧带/贴边余带:承接侧栏文字卡,永远选立绘对侧;卡组垂直居中避免下半栏空板。 */
function RailSlot({ active, scene, sprite, theme, grow }: { active: boolean; scene: LessonScene; sprite: SpriteSide; theme: ScenePresentation['palette']; grow?: boolean }) {
  return (
    <div className={`relative h-full min-w-0 ${grow ? 'flex-1' : 'flex-1'}`}>
      {active && (
        <div className={`flex h-full flex-col gap-3 px-5 py-6 ${sprite !== 'none' ? 'justify-start max-h-[62%]' : 'justify-center pb-[14%]'}`}>
          <RailCards scene={scene} theme={theme} />
        </div>
      )}
    </div>
  )
}

/** 侧栏卡内容:辨析幕上误区/修正双卡(槽位必上屏),其余幕上板书卡。 */
function RailCards({ scene, theme }: { scene: LessonScene; theme: ScenePresentation['palette'] }) {
  if (scene.sceneType === 'contrast' && scene.contentSlots.misconception && scene.contentSlots.correction) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-[8px] border border-[#d8bf8b] bg-[#fff4dc]/96 px-4 py-3.5 shadow-[0_12px_36px_rgba(40,26,12,0.2)]">
          <div className="mb-1.5" style={{ ...TYPE_SCALE.caption, color: '#a4562f' }}>误区</div>
          <div style={{ ...fitType('body', scene.contentSlots.misconception.length), color: '#2d2417' }}><MathText>{scene.contentSlots.misconception}</MathText></div>
        </div>
        <div className="rounded-[8px] border border-[#b6c5be] bg-[#e8f0ea]/96 px-4 py-3.5 shadow-[0_12px_36px_rgba(40,26,12,0.2)]">
          <div className="mb-1.5" style={{ ...TYPE_SCALE.caption, color: '#33604f' }}>修正</div>
          <div style={{ ...fitType('body', scene.contentSlots.correction.length), color: '#2d2417' }}><MathText>{scene.contentSlots.correction}</MathText></div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {scene.boardText.slice(0, 4).map((item, index) => (
        <div key={item} className="rounded-[8px] border px-4 py-3 shadow-[0_10px_30px_rgba(40,26,12,0.18)]" style={{ borderColor: `${theme.accent}66`, background: `${theme.paper}f0` }}>
          <span className="mr-2" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>0{index + 1}</span>
          <span style={{ ...fitType('body', item.length), color: theme.ink }}><MathText>{item}</MathText></span>
        </div>
      ))}
      <SerialHookTeaser scene={scene} theme={theme} />
    </div>
  )
}

/** 图上胶囊:≤3 条硬限,超出折叠为 +n(胶囊压图内元素的修复)。 */
function BoardChips({ items, side, pres }: { items: string[]; side: 'left' | 'right'; pres: ScenePresentation }) {
  const shown = items.slice(0, 3)
  const folded = items.length - shown.length
  const css = labelCss(pres.label, pres.palette)
  return (
    <div className={`absolute top-5 z-10 flex max-w-[38%] flex-col gap-2 ${side === 'left' ? 'left-5 items-start' : 'right-5 items-end'}`}>
      {shown.map(text => (
        <div key={text} className="px-4 py-2" style={{ ...TYPE_SCALE.caption, ...css }}>
          <MathText>{text}</MathText>
        </div>
      ))}
      {folded > 0 && (
        <div className="px-3 py-1 opacity-80" style={{ ...TYPE_SCALE.caption, ...css }}>+{folded}</div>
      )}
    </div>
  )
}

/** tone='focus':局部全出血(整格 accent 实底反白),呼应 recap 的 Focus 语言但只占半屏。 */
export function ContrastPanel({ index, title, tone, theme, surface: surfaceId }: { index: string; title: string; tone: 'neutral' | 'focus'; theme: ScenePresentation['palette']; surface: SurfaceId }) {
  const surface = cardSurface(theme, surfaceId)
  if (tone === 'focus') {
    return (
      <div className="relative flex flex-col justify-between overflow-hidden p-8" style={{ background: theme.accent, color: theme.paper, borderRadius: surface.borderRadius, transform: surface.transform }}>
        <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.paper, 0.82) }}>对照 {index} · 结论</div>
        <div className="relative z-10" style={fitType('heading', title.length)}>{title}</div>
        <div className="h-[3px] w-24 rounded-full" style={{ background: toRgba(theme.paper, 0.7) }} />
      </div>
    )
  }
  return (
    <div className="relative flex flex-col justify-between overflow-hidden p-8" style={{ background: theme.paper, border: surface.border, boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter, color: theme.ink }}>
      <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>对照 {index}</div>
      <div className="relative z-10" style={fitType('heading', title.length)}>{title}</div>
      <div className="h-[2px] w-24" style={{ background: toRgba(theme.accent, 0.5) }} />
    </div>
  )
}

/**
 * 并列条目感知的文本渲染:题面/反馈里的「甲同学:…乙同学:…」「①…②…」自动逐条
 * 断行(2026-08-26 用户裁决),拆不动时按原段落渲染。样式继承调用处字号。
 */
export function EnumeratedText({ text, gapClass = 'mt-3' }: { text: string; gapClass?: string }) {
  const split = splitEnumeratedItems(text)
  if (!split) return <MathText>{text}</MathText>
  return (
    <>
      {split.lead && <div><MathText>{split.lead}</MathText></div>}
      <ol className={`${split.lead ? gapClass : ''} grid gap-2.5`}>
        {split.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 12)}`} className="min-w-0">
            <MathText>{item}</MathText>
          </li>
        ))}
      </ol>
    </>
  )
}

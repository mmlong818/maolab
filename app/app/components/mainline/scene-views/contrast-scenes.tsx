'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { spriteSideOf } from '@/lib/mainline'
import { pickMasterRouted } from '@/lib/mainline/presentation/master-routing'
import { toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { cardSurface, ContrastPanel, MathText, SceneBadge, spritePad } from './shared'

/**
 * contrast-scenes · 辨析/纠错幕 7 母版(S3 幕型扩容第一批,2026-07-22 起 3→7;
 * docs/design-refresh/2026-07-22-k12-presentation-space.md §8)
 *
 * contrast 是 conceptual 骨架的固定第三幕——全库最高频幕型之一,此前只有
 * 对照双栏一张构图。首批三母版结构真异质:
 * ①对照双栏(既有骨架原样保留):左误区纸面调 / 右修正半屏 accent 反白
 * ②裁决纵列式:误区横带在上(虚线+微倾斜的可疑语气,视觉降权)→ 修正大字
 *   居中主区(accent 下划线权威语气)→ 底部依据细带——单列纵向流,认知负荷
 *   最低,低学段亲和
 * ③勘辨式:修正正文大字居左 62% 无卡片包裹,右 38% 竖批注栏放误区(「误」
 *   区块虚线语气)与判据(「辨」区块)——古籍勘误的批注骨架,亲文史
 *
 * 二批开源版式引进(2026-07-23,harvest/layouts/{slidev-neocarbon,touying}.md 里
 * 「建议映射幕型」显式含 contrast 的卡片):
 * ④分隔线双栏式(slidev-neocarbon/comparison):对称 50/50,栏间一条上下渐隐的
 *   竖向分隔线取代卡片边框,修正栏铺满 accentSoft 到栏边缘(唯一获得底色晋升的
 *   一侧),误区栏维持纸面底色——与①的"两张阴影卡片"、③的"62/38+实线批注"
 *   均不同
 * ⑤定性宣言式(slidev-neocarbon/statement):首个 dark ground 母版,呼吸径向光晕
 *   衬底,修正是唯一的巨字反白宣言主角(居中占屏);误区退成右上角一枚小尺寸
 *   虚线贴纸(角标语气,不参与主竖向叙事流)——与②"上中下三段纵向流"的构图
 *   顺序彻底不同(角标 vs 堆叠)
 * ⑥棋盘辨析式(touying-university/matrix-slide):满幅零缝隙棋盘格,不设圆角/
 *   阴影——顶行「误/正」标签格 + 次行陈述格(误区列固定虚线降权、不参与棋盘
 *   奇偶交替,避免铁律被"轮到亮色"的巧合破坏)+ 依据条目各自跨栏铺满、按行
 *   奇偶交替明暗——本文件首个"表格骨架"母版
 * ⑦素文双栏堆叠式(slidev-neocarbon/two-cols):六卡采集里"结构最朴素"的一款,
 *   改横排双栏为上下两段纯文字流,无卡片/无色块/无分隔线,铁律完全靠排版权重
 *   兑现(误区降字号档+虚线细下划线,修正升字号档+实线粗下划线)——本文件最
 *   克制的母版,与④(色块+分隔线)、⑥(棋盘表格)、②(带虚线转盘)均不同
 *
 * 铁律(与 ai-verify 同源):误区永远不给权威版式——七母版里 misconception
 * 的视觉语气必须弱于/异于 correction(虚线/倾斜/降色/降字号至少占其二)。
 * 母版选择走 pickMasterRouted('contrast'),学段学科气质加权,同课稳定。
 */
export function ContrastView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const master = pickMasterRouted(course, scene, 'contrast')
  if (master === 1) return <ContrastVerdictMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 2) return <ContrastAnnotationMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 3) return <ContrastDividerMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 4) return <ContrastStatementMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 5) return <ContrastMatrixMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 6) return <ContrastPlainStackMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  return <ContrastPanelsMaster scene={scene} pres={pres} />
}

/** 有配图的辨析页：原图与“误区 / 修正”固定同屏，避免通用图文模板只显示板书。 */
export function ContrastImageView({ scene, pres, sceneNumber }: { scene: LessonScene & { imageUrl: string }; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const { misconception, correction } = slotsOf(scene)
  return (
    <section className="scene-safe-height grid grid-cols-[minmax(0,1.25fr)_minmax(300px,0.9fr)] gap-7 px-[5.5%] pb-[3%] pt-[3.5%]" style={{ background: theme.paper, color: theme.ink }}>
      <div className="relative min-h-0 overflow-hidden rounded-[12px]" style={{ background: theme.backdrop[0], border: `1px solid ${toRgba(theme.accent, 0.22)}` }}>
        <img src={scene.imageUrl} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-5">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.contrast} theme={theme} />
        <div className="border border-dashed px-5 py-4" style={{ borderColor: toRgba(theme.ink, 0.3), background: toRgba(theme.ink, 0.04) }}>
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.58) }}>常见误区</div>
          <div className="mt-2" style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.76) }}><MathText>{misconception}</MathText></div>
        </div>
        <div className="border-l-4 px-5 py-4" style={{ borderColor: theme.accent, background: theme.accentSoft }}>
          <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>修正</div>
          <div className="mt-2" style={fitType('heading', correction.length)}><MathText>{correction}</MathText></div>
        </div>
      </div>
    </section>
  )
}

function slotsOf(scene: LessonScene): { misconception: string; correction: string } {
  return {
    misconception: scene.contentSlots.leftAction ?? scene.contentSlots.misconception ?? '左侧观察',
    correction: scene.contentSlots.rightAction ?? scene.contentSlots.correction ?? '右侧修正',
  }
}

/** 纯文字辨析：前后两页保持同一版式，只在原位置补入结论与依据。 */
export function ContrastSequenceView({
  scene,
  pres,
  sceneNumber,
  feedbackRevealed,
}: {
  scene: LessonScene
  pres: ScenePresentation
  sceneNumber: number
  feedbackRevealed: boolean
}) {
  const theme = pres.palette
  const { misconception, correction } = slotsOf(scene)

  return (
    <section
      data-response-hidden={feedbackRevealed ? 'false' : 'true'}
      className="scene-safe-bottom flex h-full flex-col gap-7 px-[8%] pb-[8%] pt-[5%]"
      style={{ background: theme.paper, color: theme.ink }}
    >
      <div className="flex items-end justify-between gap-8">
        <div className="min-w-0">
          <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.contrast} theme={theme} />
          <h2 className="mt-5" style={fitType('heading', scene.visualFocus.length)}>
            <MathText>{scene.visualFocus}</MathText>
          </h2>
        </div>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
          {feedbackRevealed ? '核对结论' : '先判断'}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-6">
        <div className="border border-dashed px-7 py-6" style={{ borderColor: toRgba(theme.ink, 0.28), background: toRgba(theme.ink, 0.035) }}>
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.58) }}>待判断说法</div>
          <div className="mt-3" style={fitType('body', misconception.length)}>
            <MathText>{misconception}</MathText>
          </div>
        </div>

        <div className="border-l-4 px-7 py-6" style={{ borderColor: theme.accent, background: toRgba(theme.accent, feedbackRevealed ? 0.1 : 0.045) }}>
          {feedbackRevealed ? (
            <>
              <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>结论与依据</div>
              <div className="mt-3" style={fitType('heading', correction.length)}>
                <MathText>{correction}</MathText>
              </div>
            </>
          ) : (
            <div className="grid h-full grid-cols-[0.42fr_1fr] items-center gap-8" style={{ color: toRgba(theme.ink, 0.55) }}>
              <div>
                <div style={TYPE_SCALE.caption}>判断</div>
                <div className="mt-4 h-px" style={{ background: toRgba(theme.ink, 0.28) }} />
              </div>
              <div>
                <div style={TYPE_SCALE.caption}>原文依据</div>
                <div className="mt-4 h-px" style={{ background: toRgba(theme.ink, 0.28) }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** 母版①对照双栏(既有骨架,原样保留):待观察 vs 已定论的半屏 Focus 落差。 */
function ContrastPanelsMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const { misconception, correction } = slotsOf(scene)
  return (
    <section className="relative grid h-full grid-cols-[0.94fr_1.06fr] gap-6 p-10" style={{ color: theme.ink }}>
      <ContrastPanel index="一" title={misconception} tone="neutral" theme={theme} surface={pres.pack.surface} />
      <ContrastPanel index="二" title={correction} tone="focus" theme={theme} surface={pres.pack.surface} />
    </section>
  )
}

/**
 * 母版②裁决纵列式:误区做顶部「可疑横带」(虚线边框+微倾斜+降色),修正是
 * 居中大字主角(accent 下划线收尾),底部一条依据细带(boardText)。
 * 单列纵向流——先看到疑点、再看到裁决、最后看到依据,叙事顺序即版式顺序。
 */
function ContrastVerdictMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const { misconception, correction } = slotsOf(scene)
  const basis = scene.boardText.filter(Boolean)
  return (
    <section className={`flex h-full flex-col items-center justify-center gap-10 px-[10%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="self-start">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '辨析'} theme={theme} />
      </div>
      <div className="w-full max-w-[72%] -rotate-[0.5deg] border border-dashed px-8 py-4" style={{ borderColor: toRgba(theme.ink, 0.4), background: toRgba(theme.ink, 0.05) }}>
        <span className="mr-4" style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.62) }}>有人说</span>
        <span style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.78) }}><MathText>{misconception}</MathText></span>
      </div>
      <div className="flex max-w-[84%] flex-col items-center gap-5 text-center">
        <p style={fitType('heading', correction.length)}><MathText>{correction}</MathText></p>
        <div aria-hidden className="h-[6px] w-28" style={{ background: theme.accent }} />
      </div>
      {basis.length > 0 && (
        <p className="max-w-[76%] text-center" style={{ ...fitType('body', basis.join(' · ').length), color: toRgba(theme.ink, 0.72) }}>
          {basis.join(' · ')}
        </p>
      )}
    </section>
  )
}

/**
 * 母版③勘辨式:修正正文大字居左 62%(无卡片包裹,注疏语言),右 38% 竖批注栏
 * ——「误」区块(虚线+降色)与「辨」区块(判据列表)沿细规则线排布。
 */
function ContrastAnnotationMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  const { misconception, correction } = slotsOf(scene)
  const basis = scene.boardText.filter(Boolean)
  return (
    <section className={`flex h-full items-center gap-0 px-[8%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex w-[62%] flex-col gap-6 pr-12">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '辨析'} theme={theme} />
        <p style={fitType('heading', correction.length)}><MathText>{correction}</MathText></p>
      </div>
      <div className="flex h-[72%] w-[38%] flex-col gap-7 border-l pl-10" style={{ borderColor: toRgba(theme.ink, 0.24) }}>
        <div>
          <div className="mb-2 inline-block border border-dashed px-3 py-1 -rotate-[0.8deg]" style={{ ...TYPE_SCALE.caption, borderColor: toRgba(theme.ink, 0.42), color: toRgba(theme.ink, 0.66) }}>误</div>
          <p style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.74) }}><MathText>{misconception}</MathText></p>
        </div>
        {basis.length > 0 && (
          <div>
            <div className="mb-2 inline-block px-3 py-1" style={{ ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper, borderRadius: surface.borderRadius }}>辨</div>
            <ul className="flex flex-col gap-2">
              {basis.map(item => (
                <li key={item} style={fitType('body', item.length)}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 母版④分隔线双栏式(来源:harvest/layouts/slidev-neocarbon.md · slidev-neocarbon/
 * comparison):对称 flex row 50/50,栏间一条上下渐隐的竖向渐变分隔线取代卡片
 * 边框/阴影——与①"两张独立阴影卡片"、③"62/38+实线批注栏"都不同,这里没有
 * 卡片容器,靠背景色块本身的明暗差 + 中线传达对比,更贴近"浏览器窗口左右并排
 * 截图对比"的克制气质。误区栏维持纸面底色(仅虚线下划线+降不透明度),修正栏
 * 铺满 accentSoft 到栏边缘——唯一获得"底色晋升"的一侧,延续铁律。
 */
function ContrastDividerMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const { misconception, correction } = slotsOf(scene)
  return (
    <section className={`relative flex h-full items-stretch pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex flex-1 flex-col justify-center gap-4 px-[6%]">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '辨析'} theme={theme} />
        <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.5) }}>有人这样想</span>
        <p className="w-fit border-b border-dashed pb-3" style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.62), borderColor: toRgba(theme.ink, 0.35) }}>
          <MathText>{misconception}</MathText>
        </p>
      </div>
      <div
        aria-hidden
        className="my-[8%] w-px self-stretch"
        style={{ background: `linear-gradient(180deg, transparent, ${toRgba(theme.accent, 0.55)} 25%, ${toRgba(theme.accent, 0.55)} 75%, transparent)` }}
      />
      <div className="flex flex-1 flex-col justify-center gap-4 px-[6%]" style={{ background: theme.accentSoft }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>其实是</span>
        <p style={fitType('heading', correction.length)}><MathText>{correction}</MathText></p>
      </div>
    </section>
  )
}

/**
 * 母版⑤定性宣言式(来源:harvest/layouts/slidev-neocarbon.md · slidev-neocarbon/
 * statement)。原版是本文件首个 dark ground 母版;2026-07-23「白为主令」扩展到
 * 母版层后反转为近白底——禁任何整页深底,戏剧感改靠白底上的柔和 accent 呼吸
 * 光晕承载。修正仍是唯一被允许巨字居中的定性判断句(主角不变,只是从"反白
 * 发光"改成"墨色 + 淡光晕"),误区仍退成右上角一枚小尺寸虚线贴纸(角标语气,
 * 视觉降权,不进入主竖向叙事流)——与②"上中下三段纵向堆叠"的构图顺序依旧
 * 不同:这里是"角标 + 单一宏大主体"。
 */
function ContrastStatementMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const { misconception, correction } = slotsOf(scene)
  return (
    <section className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: theme.paper }}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(ellipse, ${toRgba(theme.accent, 0.14)}, transparent 70%)` }}
      />
      <div className="absolute left-[6%] top-[6%] z-10">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '辨析'} theme={theme} />
      </div>
      <div
        className="absolute right-[6%] top-[9%] z-10 max-w-[26%] -rotate-[2deg] border border-dashed px-4 py-2.5 text-right"
        style={{ borderColor: toRgba(theme.ink, 0.3), background: toRgba(theme.ink, 0.04) }}
      >
        <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.45) }}>有人说</div>
        <div style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.62) }}><MathText>{misconception}</MathText></div>
      </div>
      <div className={`scene-safe-bottom relative z-10 flex flex-1 flex-col items-center justify-center px-[12%] text-center ${spritePad(sprite)}`}>
        <p className="max-w-[76%]" style={{ ...fitType('display', correction.length), color: theme.ink, textShadow: `0 0 46px ${toRgba(theme.accent, 0.22)}` }}>
          <MathText>{correction}</MathText>
        </p>
      </div>
    </section>
  )
}

/**
 * 母版⑥棋盘辨析式(来源:harvest/layouts/touying.md · touying-university/
 * matrix-slide):满幅零缝隙棋盘格,不设卡片圆角/阴影——顶行「误/正」标签格 +
 * 次行误区/修正陈述格,其余依据条目各自跨两列铺满、按行奇偶交替明暗,直白到
 * 近乎"矩阵对比表"。守铁律的取舍:误区列固定虚线降权底色,不参与棋盘奇偶
 * 交替——若严格按 (row+col) 奇偶交替,误区格偶尔会轮到与修正同等的强调底色,
 * 等于给误区一次"权威版式",直接违反铁律;所以棋盘交替只用在纯依据条目行
 * (无褒贬归属)。与①②③④皆不同,是本文件第一个"表格骨架"母版。
 */
function ContrastMatrixMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const { misconception, correction } = slotsOf(scene)
  const basis = scene.boardText.filter(Boolean).slice(0, 3)
  const rowsTemplate = basis.length > 0 ? `auto auto repeat(${basis.length}, auto)` : 'auto auto'
  return (
    <section
      className={`scene-safe-bottom grid h-full w-full ${spritePad(sprite)}`}
      style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: rowsTemplate, color: theme.ink }}
    >
      <div className="flex items-center px-[5%] py-4" style={{ background: theme.paper }}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '辨析'} theme={theme} />
      </div>
      <div className="flex items-center justify-end px-[5%] py-4" style={{ background: theme.accentSoft }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>结论</span>
      </div>
      <div className="flex flex-col justify-center gap-2 border border-dashed px-[5%] py-6" style={{ borderColor: toRgba(theme.ink, 0.32), background: toRgba(theme.ink, 0.03) }}>
        <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.5) }}>误</span>
        <p style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.68) }}><MathText>{misconception}</MathText></p>
      </div>
      <div className="flex flex-col justify-center gap-2 px-[5%] py-6" style={{ background: theme.accentSoft }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正</span>
        <p style={fitType('heading', correction.length)}><MathText>{correction}</MathText></p>
      </div>
      {basis.map((item, index) => (
        <div
          key={item}
          className="flex items-center px-[5%] py-3"
          style={{ gridColumn: '1 / span 2', background: index % 2 === 0 ? theme.paper : toRgba(theme.accent, 0.08) }}
        >
          <span className="mr-3" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>0{index + 1}</span>
          <span style={fitType('body', item.length)}><MathText>{item}</MathText></span>
        </div>
      ))}
    </section>
  )
}

/**
 * 母版⑦素文双栏堆叠式(来源:harvest/layouts/slidev-neocarbon.md · slidev-neocarbon/
 * two-cols):六卡采集里"结构最朴素"的一款——无卡片、无色块、无分隔线,原版是
 * 左右对称双栏;这里改横排为上下两段纯文字流(避免与④"横排+分隔线+色块"的
 * 骨架撞脸),铁律完全靠排版权重兑现:误区段降字号档(body)+浅色+细虚线下划线,
 * 修正段升字号档(heading)+实色粗下划线。无虚线转盘(区别于②)、无竖批注栏
 * (区别于③)、无背景色块(区别于④⑥)——本文件最克制的一款母版。
 */
function ContrastPlainStackMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const { misconception, correction } = slotsOf(scene)
  return (
    <section className={`flex h-full flex-col justify-center gap-10 px-[12%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="self-start">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '辨析'} theme={theme} />
      </div>
      <div className="flex flex-col gap-2">
        <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.45) }}>有人这样想</span>
        <p className="w-fit border-b border-dashed pb-2" style={{ ...fitType('body', misconception.length), color: toRgba(theme.ink, 0.58), borderColor: toRgba(theme.ink, 0.4) }}>
          <MathText>{misconception}</MathText>
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>其实是</span>
        <p className="w-fit border-b-4 pb-2" style={{ ...fitType('heading', correction.length), borderColor: theme.accent }}>
          <MathText>{correction}</MathText>
        </p>
      </div>
    </section>
  )
}

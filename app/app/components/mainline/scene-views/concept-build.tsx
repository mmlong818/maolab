'use client'

import { spriteSideOf, type LessonScene, type MainlineCourse, type ScenePresentation } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { conceptTemplateForScene, strategyStepNodes } from '@/lib/mainline/concept-template'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { cardSurface, MathText, pickMasterRouted, SceneBadge, spritePad, titlebarSurface } from './shared'

/**
 * concept-build · 建立概念 5 母版(Editorial Stage 方向 A 扩容,2026-07-21;
 * 开源版式母版第一批引进,2026-07-21)
 *
 * ①Stargazer 定理卡片(原版:深题头+浅正文+渐变分隔,正例降一档跟随)
 * ②注疏式(正文大字居左 58%无卡片包裹,右 42% 竖向批注栏放正例——古籍注疏骨架,
 *   与①的"卡片容器"语言完全不同)
 * ③全出血式(白为主令改造 2026-07-23:原 accent 深底整幅反白已禁,改为白底 +
 *   出血到边的超大 accent 色块 + theme.ink 巨字居中,正例仍做底部浅色横带——
 *   戏剧感来自色块体量与出血感,不再靠明暗反转,与①②的"纸面卡片"语言仍相反)
 * ④聚光式(白为主令改造 2026-07-23:原剧场纯黑底 + 三层纯 CSS 舞台聚光装置已禁,
 *   改为白底 + 三层 accent 低透明径向光晕(柔光替代黑场聚光)+ theme.ink 巨字微光
 *   描边,与③"色块出血+底部横带"不同,装饰构件是唯一分野)
 * ⑤棋盘式(touying-university/matrix-slide:满幅零缝隙两格,核心表述/正例明暗
 *   交替填色,不设卡片圆角阴影——"表格感"骨架)
 *
 * 开源版式母版第二批引进(Wave2,2026-07-23,白为主令下直接以 paper 为底新建,
 * 无需明暗改造):
 * ⑥出血色带式(来源:harvest/layouts/marpstyle.md·marpstyle-heidegger/body):核心
 *   表述嵌进一条通栏 accent 色带内直接反白排版——色带承载文字而非只做背景装饰,
 *   与②③④的"装饰在文字之外"都不同
 * ⑦细线仪表式(来源:harvest/layouts/touying.md·touying-metropolis/title-slide):
 *   全篇零容器零色块,仅一条 accent 细线分隔序号徽标(浮在右上角)与表述文字流,
 *   靠字号断层而非分区制造层级——十母版里唯一"零容器"骨架
 * ⑧巨数气泡式(来源:harvest/layouts/touying.md·touying-aqua/section-slide):幕序号
 *   放大成背景巨字 + 四角离散 accent 气泡圆点,与③"层叠居中径向光晕"语言不同
 * ⑨网格图纸式(来源:harvest/layouts/slidev-neocarbon.md·slidev-neocarbon/diagram):
 *   非对称 35/65 分栏(区别于①的58/42),右栏铺 accent 网格线背景模拟图纸质感,
 *   正例是浮空标签而非卡片
 * ⑩令牌条式(来源:harvest/layouts/marpstyle.md·marpstyle-gropius/cover+body):表述
 *   左对齐叠定向发光投影,底部一条 Bauhaus 胶囊令牌条(序号令牌+正例令牌并排),
 *   与⑤的满幅两格、⑨的浮空标签都不同
 */
export function ConceptBuildView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const template = conceptTemplateForScene(scene)
  if (template?.id === 'strategy-cycle') return <ConceptBuildStrategyCycleView scene={scene} pres={pres} sceneNumber={sceneNumber} />
  const master = pickMasterRouted(course, scene, 'concept-build')
  if (master === 1) return <ConceptBuildAnnotationMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 2) return <ConceptBuildFullBleedMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 3) return <ConceptBuildSpotlightMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 4) return <ConceptBuildMatrixMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 5) return <ConceptBuildBleedBarMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 6) return <ConceptBuildHairlineMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 7) return <ConceptBuildBubbleNumeralMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 8) return <ConceptBuildGridDiagramMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 9) return <ConceptBuildTokenStripMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  return <ConceptBuildStargazerMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
}

/** 元认知策略不是“定义 + 正例”，而是一条可执行、可自我监控的学习闭环。 */
function ConceptBuildStrategyCycleView({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const steps = strategyStepNodes(scene.contentSlots.steps)
  const trigger = scene.contentSlots.trigger ?? ''
  const selfCheck = scene.contentSlots.selfCheck ?? ''
  return (
    <section
      data-concept-template="strategy-cycle"
      className="scene-safe-bottom grid h-full w-full grid-rows-[auto_1fr] overflow-hidden px-[7%] pt-[5.5%]"
      style={{ background: theme.paper, color: theme.ink }}
    >
      <header className="flex items-end justify-between gap-8 border-b pb-5" style={{ borderColor: toRgba(theme.accent, 0.3) }}>
        <div className="min-w-0">
          <SceneBadge number={sceneNumber} label="策略建构" theme={theme} />
          <h2 className="mt-3 max-w-[780px]" style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
        </div>
        <div className="shrink-0 text-right" style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>
          识别情境 · 执行策略 · 监控效果
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[30%_40%_30%] py-6">
        <section className="flex min-w-0 flex-col justify-center border-r pr-7" style={{ borderColor: toRgba(theme.ink, 0.14) }}>
          <div className="mb-5 flex items-baseline gap-3">
            <span style={{ ...TYPE_SCALE.heading, color: theme.accent }}>01</span>
            <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>何时使用</span>
          </div>
          <div className="border-l-4 py-2 pl-5" style={{ borderColor: theme.accent, ...fitType('body', trigger.length) }}>
            <MathText>{trigger}</MathText>
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-center px-7">
          <div className="mb-4 flex items-baseline gap-3">
            <span style={{ ...TYPE_SCALE.heading, color: theme.accent }}>02</span>
            <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>怎样执行</span>
          </div>
          <div className="grid gap-0 border-y" style={{ borderColor: toRgba(theme.accent, 0.28) }}>
            {steps.map((step, index) => (
              <div key={`${index}-${step}`} className="grid grid-cols-[44px_1fr] items-center py-3" style={{ borderTop: index === 0 ? 'none' : `1px solid ${toRgba(theme.ink, 0.1)}` }}>
                <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
                <span style={fitType('body', step.length)}><MathText>{step}</MathText></span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-center border-l pl-7" style={{ borderColor: toRgba(theme.ink, 0.14) }}>
          <div className="mb-5 flex items-baseline gap-3">
            <span style={{ ...TYPE_SCALE.heading, color: theme.accent }}>03</span>
            <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>如何确认</span>
          </div>
          <div className="border-y py-5" style={{ borderColor: toRgba(theme.accent, 0.32), ...fitType('body', selfCheck.length) }}>
            <MathText>{selfCheck}</MathText>
          </div>
        </section>
      </div>
    </section>
  )
}

function ConceptBuildStargazerMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  const titlebar = titlebarSurface(theme)
  return (
    <section className={`flex h-full flex-col justify-center gap-5 px-[9%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
      <h2 className="max-w-[80%]" style={TYPE_SCALE.heading}><MathText>{scene.visualFocus}</MathText></h2>

      <div className="overflow-hidden" style={{ boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter }}>
        <div className="flex items-center gap-3 px-8 py-3" style={titlebar}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ ...TYPE_SCALE.caption, background: toRgba(titlebar.color, 0.22) }}>
            {String(sceneNumber).padStart(2, '0')}
          </span>
          <span style={TYPE_SCALE.caption}>核心表述</span>
        </div>
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
        <div className="px-8 py-8" style={{ background: theme.paper }}>
          <div style={fitType('display', (scene.contentSlots.statement ?? '').length)}><MathText>{scene.contentSlots.statement ?? ''}</MathText></div>
        </div>
      </div>

      {scene.contentSlots.example && (
        <div className="ml-10 max-w-[84%] overflow-hidden pack-surface" style={{ border: `1px solid ${theme.accent}55` }}>
          <div className="px-6 py-2" style={{ background: theme.accentSoft }}>
            <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正例</span>
          </div>
          <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${theme.accent}66, transparent)` }} />
          <div className="px-6 py-4" style={{ background: theme.paper }}>
            <div style={fitType('body', (scene.contentSlots.example ?? '').length)}><MathText>{scene.contentSlots.example}</MathText></div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版②注疏式:核心表述不再装进卡片,直接以 display 音阶裸排在左 58%(古籍正文
 * 的"无边框、字大即权威"逻辑);右 42% 是竖向批注栏,用左侧竖线分隔,正例/引用
 * 以「」直角引号包裹,呼应注疏眉批的克制感。
 *
 * round14 真检修复:生成内容本身有时已经带了「」(例如说明文本课的正例原文就是
 * "「赵州桥建于……左右」中，「左右」限定……")——此时再无脑套一层外层引号会
 * 产生「「……」……」这种首尾不对称的双重嵌套,读起来像排版错误。quoteExample
 * 改成"内容已含引号就不再包一层"。
 */
function ConceptBuildAnnotationMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`flex h-full items-center gap-10 px-[7%] pb-[8%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex w-[58%] flex-col gap-6">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
        <h2 style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}><MathText>{scene.visualFocus}</MathText></h2>
        <div style={fitType('display', (scene.contentSlots.statement ?? '').length)}><MathText>{scene.contentSlots.statement ?? ''}</MathText></div>
      </div>
      <div className="flex h-[72%] w-[42%] flex-col gap-4 border-l pl-8" style={{ borderColor: toRgba(theme.accent, 0.4) }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>批注</span>
        {scene.contentSlots.example
          ? (
            <div className="flex flex-col gap-2">
              <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>正例</span>
              <div style={fitType('body', (scene.contentSlots.example ?? '').length)}><MathText>{quoteExample(scene.contentSlots.example)}</MathText></div>
            </div>
          )
          : (
            <div style={{ ...fitType('body', 1), color: toRgba(theme.ink, 0.55) }}>—</div>
          )}
      </div>
    </section>
  )
}

/**
 * 母版③全出血式(白为主令改造 2026-07-23):底色从 accent 深底整幅换成 theme.paper
 * 近白纸底;戏剧感不再靠"深底反白"的明暗反转,改由一块出血到左边缘、贴顶溢出的
 * 超大 accent 色块(旋转矩形,两边裁切在 overflow-hidden 之外)撑体量——延续"出血"
 * 的版式记忆(色块本身出血到边),核心表述换回 theme.ink 巨字。正例仍是底部浅色
 * 横带(局部留白吸收信息密度),呼应 recap Focus 但用色更克制(半屏高)。
 */
function ConceptBuildFullBleedMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: theme.paper }}>
      {/* 出血色块:贴顶溢出左边缘的超大 accent 旋转矩形——drama 来自体量与出血,不是明暗反转 */}
      <div aria-hidden className="pointer-events-none absolute -left-[16%] -top-[18%] h-[62%] w-[46%] rotate-[10deg]" style={{ background: theme.accent }} />

      <div className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-[9%] text-center ${spritePad(sprite)}`}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
        <div className="max-w-[78%]" style={{ ...fitType('display', (scene.contentSlots.statement ?? '').length), color: theme.ink }}><MathText>{scene.contentSlots.statement ?? ''}</MathText></div>
      </div>
      {scene.contentSlots.example && (
        // 底部 16% 是字幕带(bottom-9%)+控制条的预留区(同 TeacherBoardLayer 惯例),
        // 横带贴死 section 底会被两者盖住出现文字穿透——抬升到预留区上方。
        <div className="relative z-10 mb-[16%] flex items-center justify-center gap-3 px-[9%] py-6" style={{ background: theme.accentSoft }}>
          <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正例</span>
          <span style={{ ...fitType('body', (scene.contentSlots.example ?? '').length), color: theme.ink }}><MathText>{scene.contentSlots.example}</MathText></span>
        </div>
      )}
    </section>
  )
}

/** 生成内容偶尔自带「」引号(说明文语料常见),此时不再叠加一层外层引号,避免首尾不对称的双重嵌套。 */
function quoteExample(text: string): string {
  return /[「」]/.test(text) ? text : `「${text}」`
}

/**
 * 母版④聚光式(白为主令改造 2026-07-23,原源:docs/design-refresh/harvest/layouts/
 * slidev-neocarbon.md slidev-neocarbon/spotlight):剧场纯黑底 + 三层聚光装置已禁,
 * 改为 theme.paper 白底 + 三层 accent 低透明度 radial-gradient 柔光(原三角光束的
 * CSS 边框三角形换成同位置的顶部椭圆径向光晕,与另两层同构为"radial-gradient
 * 光晕"语言,不再是黑场上的锐利光束)——聚光的"光"变成白纸上的 accent 柔光晕染,
 * 核心表述回归 theme.ink 巨字,仅叠一层低透明度 accent text-shadow 做微光描边;
 * 不设正例横带(改为文字下方一行小字说明)——与③"色块出血 + 底部浅色横带"的
 * 骨架不同,装饰构件是唯一的分野标志。
 */
function ConceptBuildSpotlightMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden" style={{ background: theme.paper }}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[640px] w-[360px] -translate-x-1/2"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${toRgba(theme.accent, 0.14)}, transparent 65%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${toRgba(theme.accent, 0.12)}, ${toRgba(theme.accent, 0.04)} 45%, transparent 72%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] h-[220px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(ellipse, ${toRgba(theme.accent, 0.2)}, transparent 70%)` }}
      />

      <div className={`relative z-10 flex flex-col items-center gap-6 px-[10%] text-center ${spritePad(sprite)}`}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
        <div
          className="max-w-[76%]"
          style={{ ...fitType('display', (scene.contentSlots.statement ?? '').length), color: theme.ink, textShadow: `0 0 24px ${toRgba(theme.accent, 0.2)}, 0 0 56px ${toRgba(theme.accent, 0.1)}` }}
        >
          <MathText>{scene.contentSlots.statement ?? ''}</MathText>
        </div>
        {scene.contentSlots.example && (
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.65) }}>正例 · <MathText>{scene.contentSlots.example}</MathText></div>
        )}
      </div>
    </section>
  )
}

/**
 * 母版⑤棋盘式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-university/matrix-slide,内容块「棋盘格」组件):满幅零缝隙两格网格——
 * 核心表述与正例各占一格、明暗交替填色(纸色/浅强调色),不设卡片圆角/边框/阴影
 * ——与①②③④皆不同的"表格感"骨架,呼应源卡"对比矩阵、直白到近乎表格"的气质。
 */
function ConceptBuildMatrixMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const hasExample = !!scene.contentSlots.example
  return (
    <section className={`grid h-full w-full ${spritePad(sprite)}`} style={{ gridTemplateColumns: hasExample ? '1fr 1fr' : '1fr' }}>
      <div className="flex flex-col justify-center gap-4 px-[7%]" style={{ background: theme.paper, color: theme.ink }}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
        <div style={fitType('display', (scene.contentSlots.statement ?? '').length)}><MathText>{scene.contentSlots.statement ?? ''}</MathText></div>
      </div>
      {hasExample && (
        <div className="flex flex-col justify-center gap-3 px-[7%]" style={{ background: theme.accentSoft, color: theme.ink }}>
          <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正例</span>
          <div style={fitType('heading', (scene.contentSlots.example ?? '').length)}><MathText>{scene.contentSlots.example ?? ''}</MathText></div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑥出血色带式(来源:harvest/layouts/marpstyle.md · marpstyle-heidegger/body
 * "h1 变成一条贯穿版心的黑色出血条,文字浮在黑条上,与下方正文区形成强烈明暗切割"):
 * 核心表述不再落在卡片或纯文字里,改嵌进一条贴左右边缘出血的通栏 accent 色带内、
 * 色带上直接反白排版——色带是承载文字的主体而非纯装饰,与②"色块在文字之外充当
 * 背景"、③"光晕在文字之外"、④"明暗只是格子填色"都不同;色带下方留白区放正例
 * (纯文字,不设卡片),呼应源卡"黑条切出核心命题,与正文形成层级对比"。
 */
function ConceptBuildBleedBarMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className="scene-safe-bottom flex h-full w-full flex-col justify-center gap-8" style={{ background: theme.paper }}>
      <div className="w-full py-10" style={{ background: theme.accent }}>
        <div className={`flex flex-col gap-4 px-[9%] ${spritePad(sprite)}`}>
          <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} tone="onDark" />
          <div className="max-w-[88%]" style={{ ...fitType('display', (scene.contentSlots.statement ?? '').length), color: theme.paper }}>
            <MathText>{scene.contentSlots.statement ?? ''}</MathText>
          </div>
        </div>
      </div>
      {scene.contentSlots.example && (
        <div className={`px-[9%] ${spritePad(sprite)}`}>
          <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正例</span>
          <div className="mt-2" style={{ ...fitType('body', (scene.contentSlots.example ?? '').length), color: theme.ink }}>
            <MathText>{scene.contentSlots.example}</MathText>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑦细线仪表式(来源:harvest/layouts/touying.md · touying-metropolis/title-slide
 * "标题与logo分居两栏,通栏.05em 细分隔线是招牌视觉签名,线下文字统一.8em"):去卡片
 * 去色块,仅用一条 accent 细线做全场唯一装饰——序号徽标悬浮右上角(呼应源卡
 * title/logo 两栏分居),核心表述落在细线之下的单栏文字流,正例接续在表述之后、
 * 字号降一档,全篇靠字号断层而非容器分区,是十母版里唯一"零容器"的骨架。
 */
function ConceptBuildHairlineMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`scene-safe-bottom relative flex h-full flex-col justify-center gap-6 px-[10%] ${spritePad(sprite)}`} style={{ background: theme.paper, color: theme.ink }}>
      <div className="absolute right-[10%] top-[9%]">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
      </div>
      <div className="h-px w-full" style={{ background: toRgba(theme.accent, 0.5) }} />
      <div className="max-w-[80%]" style={fitType('display', (scene.contentSlots.statement ?? '').length)}>
        <MathText>{scene.contentSlots.statement ?? ''}</MathText>
      </div>
      {scene.contentSlots.example && (
        <div className="max-w-[74%]" style={{ ...fitType('body', (scene.contentSlots.example ?? '').length), color: toRgba(theme.ink, 0.7) }}>
          <MathText>{scene.contentSlots.example}</MathText>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑧巨数气泡式(来源:harvest/layouts/touying.md · touying-aqua/section-slide
 * "章节序号纯数字巨字 + 四角几何气泡装饰,活泼、几何感强"):幕序号放大成 decorative
 * 档的巨型数字当背景视觉锚点,四角散布数枚低透明度 accent 圆点气泡(离散圆形,
 * 非③聚光式的居中层叠光晕)——核心表述居中叠在巨数之上,与③"层叠径向光晕"语言
 * 彻底不同。
 */
function ConceptBuildBubbleNumeralMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className="scene-safe-bottom relative flex h-full w-full flex-col items-center justify-center overflow-hidden" style={{ background: theme.paper }}>
      <div aria-hidden className="pointer-events-none absolute -left-[6%] -top-[10%] h-40 w-40 rounded-full" style={{ background: toRgba(theme.accent, 0.1) }} />
      <div aria-hidden className="pointer-events-none absolute -right-[4%] top-[14%] h-24 w-24 rounded-full" style={{ background: toRgba(theme.accent, 0.14) }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[20%] -right-[5%] h-32 w-32 rounded-full" style={{ background: toRgba(theme.accent, 0.08) }} />
      <div aria-hidden className="pointer-events-none absolute select-none" style={{ ...TYPE_SCALE.decorative, color: toRgba(theme.accent, 0.12) }}>
        {String(sceneNumber).padStart(2, '0')}
      </div>
      <div className={`relative z-10 flex flex-col items-center gap-5 px-[10%] text-center ${spritePad(sprite)}`}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
        <div className="max-w-[76%]" style={{ ...fitType('display', (scene.contentSlots.statement ?? '').length), color: theme.ink }}>
          <MathText>{scene.contentSlots.statement ?? ''}</MathText>
        </div>
        {scene.contentSlots.example && (
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.65) }}>正例 · <MathText>{scene.contentSlots.example}</MathText></div>
        )}
      </div>
    </section>
  )
}

/**
 * 母版⑨网格图纸式(来源:harvest/layouts/slidev-neocarbon.md · slidev-neocarbon/diagram
 * "左35%文字+右侧图表区,背景网格线+径向遮罩淡出,强化系统图表语境"):非对称
 * 35/65 分栏(区别于①的 58/42),右栏铺一层 accent 极浅网格线背景(双向线性渐变
 * 叠加,边缘用径向遮罩淡出)模拟系统图纸质感,正例以浮空标签贴在网格上而非嵌进
 * 卡片容器。
 */
function ConceptBuildGridDiagramMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const gridLine = toRgba(theme.accent, 0.14)
  return (
    <section className={`scene-safe-bottom flex h-full w-full ${spritePad(sprite)}`} style={{ background: theme.paper }}>
      <div className="flex w-[35%] shrink-0 flex-col justify-center gap-5 px-[6%]" style={{ color: theme.ink }}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['concept-build']} theme={theme} />
        <div style={fitType('display', (scene.contentSlots.statement ?? '').length)}><MathText>{scene.contentSlots.statement ?? ''}</MathText></div>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-[6%]"
        style={{
          backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 85% 75% at 50% 50%, black 55%, transparent 92%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at 50% 50%, black 55%, transparent 92%)',
        }}
      >
        {scene.contentSlots.example && (
          <div className="max-w-[80%] px-6 py-4" style={{ background: theme.paper, border: `1px solid ${toRgba(theme.accent, 0.35)}`, borderRadius: '10px' }}>
            <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正例</span>
            <div className="mt-1.5" style={{ ...fitType('body', (scene.contentSlots.example ?? '').length), color: theme.ink }}>
              <MathText>{scene.contentSlots.example}</MathText>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 母版⑩令牌条式(来源:harvest/layouts/marpstyle.md · marpstyle-gropius/cover+body
 * "发光标题+荧光胶囊代码块,系统化到近乎设计规范文档"):核心表述左对齐、字距收紧,
 * 叠一层定向模糊投影(非③的居中径向光晕,而是紧贴字形的单向 blur 阴影)营造
 * "发光标题"揭晓感;底部是一条 Bauhaus 令牌/规格条——序号令牌 + 正例令牌左右并排、
 * 胶囊圆角,与⑤棋盘式的满幅两格、⑨图纸式的浮空标签都不同。
 */
function ConceptBuildTokenStripMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`scene-safe-bottom flex h-full w-full flex-col justify-center gap-8 px-[9%] ${spritePad(sprite)}`} style={{ background: theme.paper }}>
      <div
        className="max-w-[86%]"
        style={{
          ...fitType('display', (scene.contentSlots.statement ?? '').length),
          letterSpacing: '-0.02em',
          color: theme.ink,
          textShadow: `-6px 2px 28px ${toRgba(theme.accent, 0.32)}`,
        }}
      >
        <MathText>{scene.contentSlots.statement ?? ''}</MathText>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex items-center gap-2 rounded-full px-5 py-2" style={{ background: theme.accent, color: theme.paper }}>
          <span style={TYPE_SCALE.caption}>{String(sceneNumber).padStart(2, '0')} · {SCENE_TYPE_LABEL['concept-build']}</span>
        </div>
        {scene.contentSlots.example && (
          <div className="flex max-w-[70%] items-center gap-2 rounded-full px-5 py-2" style={{ border: `1px solid ${toRgba(theme.accent, 0.4)}`, color: theme.ink }}>
            <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>正例</span>
            <span style={fitType('body', (scene.contentSlots.example ?? '').length)}><MathText>{scene.contentSlots.example}</MathText></span>
          </div>
        )}
      </div>
    </section>
  )
}

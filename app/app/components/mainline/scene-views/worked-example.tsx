'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { markerCss } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { cardSurface, MathText, pickMasterRouted, SceneBadge, titlebarSurface } from './shared'

/**
 * worked-example · 完整例题 10 母版(Editorial Stage 方向 A 扩容,2026-07-21;
 * 开源版式母版第一批引进,2026-07-21;第二批引进,2026-07-23)
 *
 * ①62/38 非对称(原版:步骤主角在左,题面参照卡钉右侧顶部)
 * ②纵嵌式(题面横幅置顶通栏,步骤纵列带连接线——像证明过程逐行推导,
 *   与①的"左右分栏"骨架完全不同)
 * ③对开式(50/50 左题右步,中缝细规则线——书页对开的骨架,双栏等权而非①的62/38)
 * ④双层定理卡式(touying-stargazer/tblock:题面卡+步骤卡纵向堆叠,均为
 *   "标题条→渐变分隔→正文条"三段式,不再左右分栏)
 * ⑤极简进度线式(touying-metropolis:20% 四边大留白 + `.05em` 细分隔线签名,
 *   步骤退化为扁平细线上的方点标记,不用①②③惯用的圆形编号章)
 * ⑥棋盘格式(touying-university/matrix-slide:题面+每条步骤各占一格,满幅零缝隙,
 *   明暗交替填色,不设卡片阴影——本幕型第一个"表格感"骨架)
 * ⑦网格纸推导流式(slidev-neocarbon/diagram:左裸文字题面+右侧方格网纸背景,
 *   步骤沿中轴线左右交替排布——"演算稿纸"骨架,与②③的单侧/静态分栏不同)
 * ⑧出血题头+分栏式(marpstyle-heidegger 出血黑条手法+全系列共享分栏机制:
 *   题面收成通栏出血色带,步骤走等宽表格式分栏,细竖线分隔不设卡片)
 * ⑨手稿账册式(slidev-neocarbon/quote 巨型引号+touying-simple 极简空白画布合成:
 *   题面被半透明超大「」括起,步骤退化为发丝线分隔的账册条目,无卡片无编号章)
 * ⑩演算稿窗式(slidev-neocarbon/browser+/code 应用窗体合成:圆角窗体+三点工具条+
 *   地址栏题面,步骤走终端提示符逐行输出——本幕型唯一"容器嵌套"骨架)
 */
export function WorkedExampleView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const master = pickMasterRouted(course, scene, 'worked-example')
  if (master === 1) return <WorkedExampleStackedMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 2) return <WorkedExampleSpreadMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 3) return <WorkedExampleTheoremStackMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 4) return <WorkedExampleMetropolisMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 5) return <WorkedExampleCheckerboardMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 6) return <WorkedExampleGridFlowMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 7) return <WorkedExampleBleedColumnsMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 8) return <WorkedExampleLedgerMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 9) return <WorkedExampleWindowChromeMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  return <WorkedExampleAsymmetricMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
}

function parseSteps(scene: LessonScene): string[] {
  let steps = (scene.contentSlots.steps ?? '')
    .split(/→|；|;|\n/)
    .map(item => item.trim())
    .filter(Boolean)
  // LLM 用"第一步…，第二步…"逗号句式时按步次词拆(真检:单卡长串回归)
  if (steps.length < 2) {
    steps = (scene.contentSlots.steps ?? '')
      .split(/[，,]?第[一二三四五六]步[：:，,]?/)
      .map(item => item.trim())
      .filter(Boolean)
  }
  return steps.length > 0 ? steps : [scene.contentSlots.steps ?? scene.boardText.join(' · ')]
}

/**
 * 完整例题 · 62/38 非对称:左栏(62%)是主角——按序展开的步骤;右栏(38%)是
 * 题面参照卡,跟随 Stargazer 同款题头语言,钉在侧栏顶部供随时回看题目。
 */
function WorkedExampleAsymmetricMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const surface = cardSurface(theme, pres.pack.surface)
  const stepList = parseSteps(scene)

  return (
    <section className="flex h-full items-center gap-8 px-[7%] pb-[8%]" style={{ color: theme.ink }}>
      <div className="flex w-[62%] flex-col gap-4">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
        <div className="grid gap-3">
          {stepList.map((step, index) => (
            <div key={`${index}-${step}`} className="grid grid-cols-[56px_1fr] items-center gap-4 px-5 py-3.5" style={{ background: theme.paper, border: surface.border, boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter, color: theme.ink }}>
              <div className="flex h-11 w-11 items-center justify-center" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>
                {index + 1}
              </div>
              <div style={fitType('body', step.length)}><MathText>{step}</MathText></div>
            </div>
          ))}
        </div>
      </div>
      {scene.contentSlots.problem && (
        <div className="w-[38%] overflow-hidden" style={{ boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter }}>
          <div className="flex items-center gap-2 px-6 py-3" style={{ background: theme.accent, color: theme.paper }}>
            <span style={TYPE_SCALE.caption}>题面</span>
          </div>
          <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
          <div className="px-6 py-6" style={{ background: theme.paper }}>
            <div style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版②纵嵌式:题面收成顶部通栏(不再是侧卡),步骤改纵向列表 + 左侧连接线
 * 贯穿——视觉上像"逐行展开的证明",与母版①的左右分栏骨架完全不同。
 */
function WorkedExampleStackedMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)

  return (
    <section className="flex h-full flex-col gap-6 px-[7%] pb-[8%] pt-[6%]" style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
      {scene.contentSlots.problem && (
        <div className="pack-surface px-8 py-5" style={{ background: theme.accent, color: theme.paper }}>
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.paper, 0.82) }}>题面</div>
          <div className="mt-1.5" style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
        </div>
      )}
      <div className="relative flex flex-1 flex-col gap-4 pl-9">
        <div className="absolute left-[18px] top-1 bottom-1 w-[3px] rounded-full opacity-40" style={{ background: theme.accent }} />
        {stepList.map((step, index) => (
          <div key={`${index}-${step}`} className="relative flex items-start gap-4">
            <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>
              {index + 1}
            </div>
            <div className="pt-1" style={fitType('body', step.length)}><MathText>{step}</MathText></div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * 母版③对开式:50/50 等权双栏(非①②的主次分明),左页题面、右页步骤,
 * 中缝一条细规则线——书页对开的骨架隐喻。
 */
function WorkedExampleSpreadMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)

  return (
    <section className="relative flex h-full" style={{ color: theme.ink }}>
      <div className="flex w-1/2 flex-col gap-5 px-[6%] pt-[12%]">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
        {scene.contentSlots.problem && (
          <div>
            <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>题面</div>
            <div className="mt-2" style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
          </div>
        )}
      </div>
      <div className="absolute inset-y-[8%] left-1/2 w-px" style={{ background: `linear-gradient(180deg, transparent, ${theme.accent}88 20%, ${theme.accent}88 80%, transparent)` }} />
      <div className="flex w-1/2 flex-col gap-3 px-[6%] pt-[12%]">
        {stepList.map((step, index) => (
          <div key={`${index}-${step}`} className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>
              {index + 1}
            </span>
            <span style={fitType('body', step.length)}><MathText>{step}</MathText></span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * 母版④双层定理卡式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-stargazer/tblock,内容块「定理框」组件独有):原版三段纵向堆叠(标题条
 * →4pt 渐变分隔条→正文条)复制两份满宽纵叠——上层题面卡、下层步骤卡,不再是
 * ①的左右分栏或③的 50/50 对开,是本幕型第一个"纵向双卡堆叠"骨架。
 */
function WorkedExampleTheoremStackMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)
  const titlebar = titlebarSurface(theme)

  return (
    <section className="flex h-full flex-col justify-center gap-6 px-[7%] pb-[7%]" style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
      {scene.contentSlots.problem && (
        <div className="overflow-hidden pack-surface">
          <div className="px-7 py-2.5" style={titlebar}>
            <span style={TYPE_SCALE.caption}>题面</span>
          </div>
          <div className="h-1" style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
          <div className="px-7 py-5" style={{ background: theme.paper }}>
            <div style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
          </div>
        </div>
      )}
      <div className="overflow-hidden pack-surface">
        <div className="px-7 py-2.5" style={titlebar}>
          <span style={TYPE_SCALE.caption}>步骤</span>
        </div>
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
        <div className="flex flex-col gap-4 px-7 py-6" style={{ background: theme.paper }}>
          {stepList.map((step, index) => (
            <div key={`${index}-${step}`} className="flex items-center gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>
                {index + 1}
              </span>
              <span style={fitType('body', step.length)}><MathText>{step}</MathText></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * 母版⑤极简进度线式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-metropolis:title-slide 招牌的 `.05em` 细分隔线 + section-slide 的
 * 20% 四边留白/2pt 细进度条两个签名手法合成):全屏大留白,题面居中裸排(无卡片
 * 包裹,只用一条 border-bottom 细线),一条细线贯穿步骤区当扁平进度条、步骤号是
 * 线上小方点而非①③惯用的圆形编号章——是本幕型留白感最强的一版。
 */
function WorkedExampleMetropolisMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)

  return (
    <section className="scene-safe-bottom flex h-full w-full flex-col justify-center gap-6 px-[11%] py-[6%]" style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
      {scene.contentSlots.problem && (
        <div className="max-w-[920px] border-l-4 pl-6" style={{ ...fitType('heading', scene.contentSlots.problem.length), borderColor: theme.accent }}>
          <MathText>{scene.contentSlots.problem}</MathText>
        </div>
      )}
      <ol className="grid w-full max-w-[1000px] gap-3">
        {stepList.map((step, index) => (
          <li key={`${index}-${step}`} className="grid grid-cols-[42px_1fr] items-start gap-4 border-t pt-3" style={{ borderColor: toRgba(theme.ink, 0.14) }}>
            <span className="font-semibold tabular-nums" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
            <span style={fitType('body', step.length)}><MathText>{step}</MathText></span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * 母版⑥棋盘格式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-university/matrix-slide,内容块「棋盘格」组件):题面与每条步骤各占一格,
 * 满幅零缝隙铺满整屏,格子按 (行+列) 奇偶在纸色/浅强调色间交替填色,不设圆角/
 * 边框/阴影——与①③④的卡片语言、②⑤的单栏纵列语言都不同,是本幕型第一个
 * "表格感"骨架(呼应 concept-build 棋盘式的姊妹手法,但格数随步骤数自动伸缩)。
 */
function WorkedExampleCheckerboardMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)
  const hasProblem = !!scene.contentSlots.problem
  const cells: { label: string; text: string; heading?: boolean }[] = [
    ...(hasProblem ? [{ label: '题面', text: scene.contentSlots.problem!, heading: true }] : []),
    ...stepList.map((step, index) => ({ label: `0${index + 1}`, text: step })),
  ]
  const columns = Math.max(1, cells.length <= 3 ? cells.length : cells.length <= 6 ? 3 : 4)

  return (
    <section className="flex h-full w-full flex-col" style={{ color: theme.ink }}>
      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: '1fr' }}>
        {cells.map((cell, index) => {
          const row = Math.floor(index / columns)
          const col = index % columns
          const dark = (row + col) % 2 === 1
          return (
            <div key={`${index}-${cell.label}`} className="flex flex-col justify-center gap-3 px-8 py-6" style={{ background: dark ? theme.accentSoft : theme.paper }}>
              {index === 0 && <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />}
              <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{cell.label}</span>
              <div style={fitType(cell.heading ? 'heading' : 'body', cell.text.length)}><MathText>{cell.text}</MathText></div>
            </div>
          )
        })}
      </div>
      <div style={{ height: '16%' }} />
    </section>
  )
}

/**
 * 母版⑦网格纸推导流式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/diagram:左 35% 内容区 + 右侧图表区的方格网纸纹理,本母版把
 * "图表区"改造成步骤推导流):左 34% 是题面裸文字(无卡片包裹),右 66% 铺一层极浅
 * 方格网纸纹理(仿 diagram.vue 的 `repeating-linear-gradient` 网格线手法,ink 色
 * 0.05 透明度),步骤沿中轴线左右交替排布(奇数步靠左、偶数步靠右)——与②的单侧
 * 纵列、③的两栏静态对开都不同,是本幕型第一个"演算稿纸"骨架。
 */
function WorkedExampleGridFlowMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)
  const gridLine = toRgba(theme.ink, 0.05)
  const gridTexture = `repeating-linear-gradient(0deg, ${gridLine} 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, ${gridLine} 0 1px, transparent 1px 48px)`

  return (
    <section className="scene-safe-bottom flex h-full" style={{ color: theme.ink }}>
      <div className="flex w-[34%] flex-col justify-center gap-4 px-[5%]">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
        {scene.contentSlots.problem && (
          <div>
            <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>题面</span>
            <div className="mt-2" style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
          </div>
        )}
      </div>
      <div className="relative flex w-[66%] flex-col justify-center gap-6 px-[5%]" style={{ backgroundImage: gridTexture }}>
        <div className="absolute inset-y-[6%] left-1/2 w-px" style={{ background: toRgba(theme.accent, 0.35) }} />
        {stepList.map((step, index) => {
          const isLeft = index % 2 === 0
          return (
            <div key={`${index}-${step}`} className={`relative z-10 flex w-[52%] items-center gap-3 ${isLeft ? 'mr-auto flex-row' : 'ml-auto flex-row-reverse text-right'}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>{index + 1}</span>
              <span style={fitType('body', step.length)}><MathText>{step}</MathText></span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * 母版⑧出血题头+分栏式(来源:docs/design-refresh/harvest/layouts/marpstyle.md
 * marpstyle-heidegger/body 的 h1 出血黑条手法 + 全系列共享的 `.columns` 等宽分栏
 * 机制):题面收成一条通栏色带(用 titlebarSurface 反色,视觉上贯穿两侧边缘的
 * "出血条"),色带下方步骤走等宽 CSS 分栏——每栏一条步骤,栏间只用细竖线分隔,
 * 不设卡片/阴影/编号圆章。与④的"两张卡纵叠"、⑥的"棋盘格明暗交替"都不同,
 * 是本幕型第一个"通栏色带 + 表格分栏"骨架。
 */
function WorkedExampleBleedColumnsMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)
  const titlebar = titlebarSurface(theme)
  const columns = Math.max(1, Math.min(stepList.length, 5))

  return (
    <section className="scene-safe-bottom flex h-full flex-col" style={{ color: theme.ink }}>
      {scene.contentSlots.problem && (
        <div className="flex flex-col gap-2 px-[7%] py-7" style={titlebar}>
          <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} tone="onDark" />
          <div style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
        </div>
      )}
      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {stepList.map((step, index) => (
          <div key={`${index}-${step}`} className="flex flex-col gap-3 px-6 py-8" style={{ borderLeft: index % columns !== 0 ? `1px solid ${toRgba(theme.ink, 0.12)}` : undefined }}>
            <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>0{index + 1}</span>
            <div style={fitType('body', step.length)}><MathText>{step}</MathText></div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * 母版⑨手稿账册式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/quote 的超大开合引号手法 + docs/design-refresh/harvest/layouts/
 * touying.md touying-simple 的"空白画布、不设色块"极简哲学,二者合成):题面被一对
 * 半透明超大「」括起(呼应 quote.vue 的巨型引号,换成中文直角引号避免西文引号
 * 违和),步骤退化为无卡片的账册式条目——只用发丝线分隔,不设编号圆章/背景色块。
 * 与⑤ metropolis 同属"无卡片"但走向相反:⑤是居中 + 水平进度线,这里是左对齐 +
 * 纵向账册流,巨引号装饰构件也是本幕型独有。
 */
function WorkedExampleLedgerMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const stepList = parseSteps(scene)

  return (
    <section className="scene-safe-bottom flex h-full flex-col gap-8 px-[9%] pt-[6%]" style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
      {scene.contentSlots.problem && (
        <div className="relative max-w-[80%] px-10">
          <span aria-hidden className="absolute -left-2 -top-6" style={{ ...TYPE_SCALE.decorative, fontSize: '96px', color: toRgba(theme.accent, 0.18) }}>「</span>
          <div style={fitType('heading', scene.contentSlots.problem.length)}><MathText>{scene.contentSlots.problem}</MathText></div>
          <span aria-hidden className="absolute -bottom-10 -right-2" style={{ ...TYPE_SCALE.decorative, fontSize: '96px', color: toRgba(theme.accent, 0.18) }}>」</span>
        </div>
      )}
      <div className="flex flex-1 flex-col">
        {stepList.map((step, index) => (
          <div key={`${index}-${step}`} className="flex items-baseline gap-5 py-4" style={{ borderTop: index > 0 ? `1px solid ${toRgba(theme.ink, 0.14)}` : undefined }}>
            <span className="shrink-0 tabular-nums" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>0{index + 1}</span>
            <div style={fitType('body', step.length)}><MathText>{step}</MathText></div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * 母版⑩演算稿窗式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/browser 与 /code 两版"应用窗体"手法合成):整屏钉一个圆角窗体
 * (复用 cardSurface)——顶部工具条走三枚色深浅递增的圆点(取代原版写死的红黄绿
 * 三色,改用同一 accent 的三档不透明度,不新增硬编码色)+ 题面装进"地址栏"胶囊;
 * 窗体主体是步骤,每条前缀一个 `›` 提示符模拟终端/笔记逐行输出。与①③④的卡片
 * 语言不同之处在于:全部内容收进单一"窗体"容器而非拆成多张独立卡片,是本幕型
 * 唯一的"容器嵌套"骨架。
 */
function WorkedExampleWindowChromeMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const surface = cardSurface(theme, pres.pack.surface)
  const stepList = parseSteps(scene)

  return (
    <section className="scene-safe-bottom flex h-full flex-col items-center justify-center gap-4 px-[8%]" style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['worked-example']} theme={theme} />
      <div className="flex w-full flex-1 flex-col overflow-hidden" style={{ background: theme.paper, border: surface.border, boxShadow: surface.boxShadow, borderRadius: surface.borderRadius }}>
        <div className="flex items-center gap-4 px-6 py-3.5" style={{ borderBottom: `1px solid ${toRgba(theme.ink, 0.1)}` }}>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: toRgba(theme.accent, 0.35) }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: toRgba(theme.accent, 0.6) }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: toRgba(theme.accent, 0.9) }} />
          </div>
          {scene.contentSlots.problem && (
            <div className="flex-1 truncate px-4 py-1.5" style={{ ...TYPE_SCALE.caption, background: theme.accentSoft, borderRadius: '9999px', color: theme.ink }}>
              <MathText>{scene.contentSlots.problem}</MathText>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-4 px-9 py-7">
          {stepList.map((step, index) => (
            <div key={`${index}-${step}`} className="flex items-start gap-3">
              <span className="shrink-0" style={{ ...TYPE_SCALE.body, color: theme.accent }}>›</span>
              <div style={fitType('body', step.length)}><MathText>{step}</MathText></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

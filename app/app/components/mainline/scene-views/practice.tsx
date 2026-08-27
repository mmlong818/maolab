'use client'

import { spriteSideOf, type LessonScene, type MainlineCourse, type ScenePresentation } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { cardSurface, MathText, pickMasterRouted, SceneBadge, spritePad, EnumeratedText } from './shared'

function answerRailClass(scene: LessonScene): string {
  const sprite = spriteSideOf(scene)
  if (sprite === 'left') return 'ml-[23%]'
  if (sprite === 'right') return 'mr-[23%]'
  return ''
}

function feedbackParts(feedback: string): { verdict: string; reason: string } {
  const match = feedback.trim().match(/^([^。！？]{1,14})[。！？]\s*(.*)$/u)
  if (!match) return { verdict: '结论', reason: feedback.trim() }
  return { verdict: match[1] ?? '结论', reason: match[2] ?? '' }
}

/**
 * 纯文字练习的固定渐进母版。提问与揭晓使用完全相同的版位和字号，
 * 揭晓页只把学生原先作答的“判断 / 依据”区域填上结论，不再随机换骨架。
 */
export function PracticeSequenceView({
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
  const task = scene.contentSlots.task?.trim() || scene.visualFocus
  const feedback = scene.contentSlots.feedback?.trim() || ''
  const answer = feedbackParts(feedback)

  return (
    <section
      data-testid="practice-sequence-slide"
      data-response-hidden={feedbackRevealed ? 'false' : 'true'}
      className="relative flex h-full flex-col overflow-hidden px-[7%] pb-[6%] pt-[6%]"
      style={{ background: theme.paper, color: theme.ink }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-2" style={{ background: theme.accent }} />
      <header className="flex items-center justify-between gap-8">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
          {feedbackRevealed ? '核对结论' : '独立判断'}
        </span>
      </header>

      <div className={`grid min-h-0 flex-1 gap-7 pt-7 ${feedbackRevealed ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)_minmax(260px,auto)]"}`}>
        <div data-testid="practice-sequence-question" className="grid min-h-0 grid-cols-[minmax(0,1fr)_132px] items-center gap-10 overflow-hidden border-y py-8" style={{ borderColor: toRgba(theme.ink, 0.16) }}>
          <div className="min-w-0">
            <h2 style={{ ...fitType('heading', scene.visualFocus.length), color: theme.ink }}>
              <MathText>{scene.visualFocus}</MathText>
            </h2>
            {/* 揭晓页是「答案页」:题面上一页已完整呈现,这里只留标题行,把纵向空间让给
                断行后的多条依据(2026-08-26 断行改造后题答同页放不下的取舍)。 */}
            {!feedbackRevealed && task !== scene.visualFocus && (
              <div className="mt-6 max-w-[1320px]" style={{ ...fitType('body', task.length), color: toRgba(theme.ink, 0.84) }}>
                <EnumeratedText text={task} />
              </div>
            )}
          </div>
          <div
            aria-hidden
            className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-2"
            style={{ ...fitType('display', 1), borderColor: toRgba(theme.accent, 0.45), color: theme.accent, background: toRgba(theme.accent, 0.06) }}
          >
            {feedbackRevealed ? '✓' : '?'}
          </div>
        </div>

        <div
          data-testid="practice-sequence-answer"
          className={`grid grid-cols-[180px_minmax(0,1fr)] content-center gap-x-8 gap-y-7 border-l-4 px-8 py-7 ${answerRailClass(scene)}`}
          style={{ borderColor: theme.accent, background: toRgba(theme.accent, feedbackRevealed ? 0.09 : 0.045) }}
        >
          <div style={{ ...TYPE_SCALE.body, color: theme.accent }}>判断</div>
          {feedbackRevealed ? (
            <div style={{ ...fitType('heading', answer.verdict.length), fontWeight: 800, color: theme.ink }}>
              <MathText>{answer.verdict}</MathText>
            </div>
          ) : (
            <div className="self-center border-b-2 border-dashed" style={{ borderColor: toRgba(theme.ink, 0.25) }} />
          )}

          <div style={{ ...TYPE_SCALE.body, color: theme.accent }}>依据</div>
          {feedbackRevealed ? (
            <div style={{ ...fitType('body', answer.reason.length), color: theme.ink }}>
              <EnumeratedText text={answer.reason || feedback} />
            </div>
          ) : (
            <div className="self-center border-b-2 border-dashed" style={{ borderColor: toRgba(theme.ink, 0.25) }} />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * practice · 轮到你了 10 母版(Editorial Stage 方向 A 扩容,2026-07-21;
 * 开源版式母版第一批引进,2026-07-21;第二批引进,2026-07-23)
 *
 * ①62/38 非对称(原版:任务卡主角在左,反馈卡虚线降级在右)
 * ②任务卡居中放大式(单栏居中,反馈折叠成底部细条——与①的"双栏并列"骨架不同)
 * ③横幅任务式(任务通栏置顶,反馈拆成底部选项横排——呼应"先答题再核对"节奏)
 * ④棋盘式(touying-university/matrix-slide:满幅零缝隙两格,任务/反馈明暗
 *   交替填色,不设卡片圆角阴影)
 * ⑤对比双栏式(slidev-neocarbon/comparison:两栏各自装框,中缝上下淡出的渐变
 *   分隔线,右栏叠浅强调色渲染"核对结果"的语义色差)
 * ⑥指标卡网格式(slidev-neocarbon/metrics:任务通栏置顶,反馈拆句铺成 KPI 卡片
 *   行——每卡只留顶部 2px 色条 + 编号,不设圆角/阴影/卡片背景,是"数据仪表盘"
 *   式的扁平卡语言,与①-⑤的卡片/棋盘/分隔线骨架都不同)
 * ⑦大留白进度式(touying-metropolis/university section-slide 的 `pad(20%)` +
 *   2pt 进度条:任务收进四边大留白的克制舞台,标题下是一排可数的分段节拍条
 *   〔非连续渐变线〕,反馈落在节拍条下方一行小字——郑重感来自留白比例本身)
 * ⑧图纸网格式(slidev-neocarbon/diagram:左 35% 任务纵向居中,右 65% 反馈嵌在
 *   一张双向 linear-gradient 网格线 + radial-gradient mask 中心透出/四边淡出
 *   的"图纸"纹理面板里——纹理装饰是①-⑦都没用过的构件)
 * ⑨徽章聚焦式(touying-aqua/title-slide 的手绘几何气泡装饰:任务居中,背后叠
 *   四角不对称大小的 accent 圆点 + 中央旋转 45°的方形"印章"打底,反馈退成
 *   徽章下方一行小字——实心几何图形装饰,区别于⑦的柔光/渐变语言)
 * ⑩出血标题条式(marpstyle heidegger/jobs 共享机制的 h1 出血黑条 + blockquote
 *   脚注机制:任务标题坐在一条用负 margin 撑穿两侧边缘的 accent 出血条上,
 *   反馈以脚注体裁呈现〔上缘虚线分隔〕——出血通栏 + 脚注的组合是①-⑨都没有的)
 */
export function PracticeView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const master = pickMasterRouted(course, scene, 'practice')
  if (master === 1) return <PracticeCenteredMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 2) return <PracticeBannerMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 3) return <PracticeCheckerboardMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 4) return <PracticeComparisonMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 5) return <PracticeMetricsMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 6) return <PracticeStageMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 7) return <PracticeGridPanelMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 8) return <PracticeBadgeMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 9) return <PracticeBleedBarMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  return <PracticeAsymmetricMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
}

/**
 * 轮到你了 · 62/38 非对称:任务卡是主角(左栏,Stargazer 题头语言,heading 音阶
 * 陈述任务),反馈卡降为侧栏参照(右栏,虚线边框保留"先答后看"的克制感)。
 */
function PracticeAsymmetricMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  return (
    <section className={`flex h-full items-center gap-8 px-[7%] pb-[8%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex w-[62%] flex-col gap-4">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
        <div className="overflow-hidden" style={{ boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter }}>
          <div className="flex items-center gap-2 px-7 py-3" style={{ background: theme.accent, color: theme.paper }}>
            <span style={TYPE_SCALE.caption}>任务</span>
          </div>
          <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
          <div className="px-7 py-7" style={{ background: theme.paper }}>
            <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
          </div>
        </div>
      </div>
      {scene.contentSlots.feedback && (
        <div className="w-[38%] pack-surface border border-dashed px-7 py-6" style={{ borderColor: toRgba(theme.ink, 0.28), background: toRgba(theme.paper, 0.85) }}>
          <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>先自己答 · 再对照反馈</div>
          <div className="mt-2" style={{ ...fitType('body', scene.contentSlots.feedback.length), color: toRgba(theme.ink, 0.82) }}><MathText>{scene.contentSlots.feedback}</MathText></div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版②居中放大式:任务卡单栏居中放大(非①的双栏并列),反馈收成底部
 * 一条虚线细条——像答题后翻到书末"提示"那一行,克制感比①的侧卡更强。
 */
function PracticeCenteredMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  return (
    <section className={`relative flex h-full flex-col items-center justify-center gap-5 px-[9%] pb-[10%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="absolute left-[9%] top-[8%]">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
      </div>
      <div className="w-full max-w-[66%] overflow-hidden" style={{ boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter }}>
        <div className="flex items-center gap-2 px-8 py-3" style={{ background: theme.accent, color: theme.paper }}>
          <span style={TYPE_SCALE.caption}>任务</span>
        </div>
        <div className="px-8 py-9 text-center" style={{ background: theme.paper }}>
          <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
        </div>
      </div>
      {scene.contentSlots.feedback && (
        <div className="flex w-full max-w-[66%] items-center gap-3 pack-surface border border-dashed px-6 py-3" style={{ borderColor: toRgba(theme.ink, 0.28), background: toRgba(theme.paper, 0.7) }}>
          <span className="shrink-0" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>反馈</span>
          <span className="line-clamp-1" style={{ ...fitType('body', scene.contentSlots.feedback.length), color: toRgba(theme.ink, 0.82) }}><MathText>{scene.contentSlots.feedback}</MathText></span>
        </div>
      )}
    </section>
  )
}

/** 反馈拆句:按顿号/分号/逗号切分,呈现为选项横排;找不到分隔时整句当单条。 */
function splitFeedback(feedback: string): string[] {
  const parts = feedback.split(/[、；;，,]/).map(item => item.trim()).filter(Boolean)
  return parts.length > 1 ? parts.slice(0, 4) : [feedback]
}

/**
 * 母版③横幅任务式:任务通栏置顶(heading 音阶,不设侧卡),反馈拆成底部
 * 选项式横排小卡——呼应"先自己选、再看哪个对"的检核节奏。
 */
function PracticeBannerMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`flex h-full flex-col gap-8 px-[7%] pb-[8%] pt-[7%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
      <div className="pack-surface px-8 py-7" style={{ background: theme.accent, color: theme.paper }}>
        <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.paper, 0.82) }}>任务</div>
        <div className="mt-2" style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      </div>
      {scene.contentSlots.feedback && (
        <div className="mt-auto flex flex-wrap gap-3">
          {splitFeedback(scene.contentSlots.feedback).map(item => (
            <div key={item} className="rounded-full border px-5 py-2.5" style={{ ...fitType('body', item.length), borderColor: `${theme.accent}55`, background: `${theme.paper}f0`, color: theme.ink }}>
              <MathText>{item}</MathText>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * 母版④棋盘式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-university/matrix-slide,内容块「棋盘格」组件):满幅零缝隙两格——
 * 任务与反馈各占一格、纸色/浅强调色交替填色,不设卡片圆角/阴影,是①②③的
 * 卡片语言之外的"表格感"骨架(呼应源卡"多题并练"的建议映射)。
 */
function PracticeCheckerboardMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const hasFeedback = !!scene.contentSlots.feedback
  return (
    <section className={`grid h-full w-full ${spritePad(sprite)}`} style={{ gridTemplateColumns: hasFeedback ? '1fr 1fr' : '1fr' }}>
      <div className="flex flex-col gap-4 px-[7%] pt-[12%]" style={{ background: theme.paper, color: theme.ink }}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
        <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      </div>
      {hasFeedback && (
        <div className="flex flex-col gap-3 px-[7%] pt-[12%]" style={{ background: theme.accentSoft, color: theme.ink }}>
          <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>先自己答 · 再对照反馈</span>
          <div style={fitType('body', (scene.contentSlots.feedback ?? '').length)}><MathText>{scene.contentSlots.feedback ?? ''}</MathText></div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑤对比双栏式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/comparison):两栏各撑满、内部再各留白装框,中缝一条上下淡出的
 * 渐变分隔线(区别于④棋盘式的零缝隙满幅、也区别于①的 62/38 主次);右栏(反馈)
 * 叠一层浅强调色渲染"核对结果"的语义色差,呼应源卡"色彩语义化强化正负判断"
 * 的气质。
 */
function PracticeComparisonMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  return (
    // 容器配平:items-center + 内容自适应高(min-h 兜底防"邮票卡"),内容少时纸张
    // 随之变矮、整组居中——不再是满高纸张下方 70% 空白(2026-07-21 排版专家轮)。
    <section className={`relative flex h-full w-full items-center px-[4%] py-[6%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex min-h-[36%] flex-1 flex-col justify-center gap-4 self-center px-8 pb-6 pt-10" style={{ background: theme.paper, border: surface.border, boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter }}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
        <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      </div>
      <div
        className="relative mx-6 h-[50%] w-px shrink-0 self-center"
        style={{ background: `linear-gradient(180deg, transparent, ${toRgba(theme.accent, 0.5)} 25%, ${toRgba(theme.accent, 0.5)} 75%, transparent)` }}
      />
      {scene.contentSlots.feedback && (
        <div className="flex min-h-[36%] flex-1 flex-col justify-center gap-3 self-center pack-surface px-8 pb-6 pt-10" style={{ background: theme.accentSoft }}>
          <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>对照反馈</span>
          <div style={{ ...fitType('body', scene.contentSlots.feedback.length), color: theme.ink }}><MathText>{scene.contentSlots.feedback}</MathText></div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑥指标卡网格式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/metrics):任务是通栏置顶陈述(呼应源卡 `h1 { grid-column: 1 / -1 }`
 * 横跨整行的写法),反馈拆句后铺成下方一排 KPI 卡片——每卡只留顶部 2px 色条 +
 * 编号,不设圆角/阴影/卡片底色,是"数据仪表盘"式的扁平卡语言,与①-⑤的卡片/
 * 棋盘/分隔线骨架都不同。
 */
function PracticeMetricsMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const items = scene.contentSlots.feedback ? splitFeedback(scene.contentSlots.feedback) : []
  return (
    <section className={`scene-safe-bottom flex h-full flex-col gap-8 px-[7%] pt-[7%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
      <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      {items.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {items.map((item, index) => (
            <div key={item} className="flex flex-col gap-2 pt-3" style={{ borderTop: `2px solid ${theme.accent}` }}>
              <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
              <span style={fitType('body', item.length)}><MathText>{item}</MathText></span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑦大留白进度式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-metropolis/university section-slide:`show: pad.with(20%)` 四边大留白
 * + 标题下一条 2pt 进度条):任务收进页面中央的克制留白区,标题下方是一排可数的
 * 分段节拍条(非①的渐变分隔线,是若干独立色块,呼应源卡"进度条"但做成有节奏
 * 的分段),反馈落在节拍条下方一行小字——郑重感来自留白比例本身,是①-⑥都
 * 没有的"大幅四边留白"骨架。
 */
function PracticeStageMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const segments = 5
  return (
    <section className={`scene-safe-bottom flex h-full flex-col items-center justify-center gap-6 px-[18%] pt-[10%] text-center ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
      <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      <div className="flex w-full max-w-[50%] gap-2">
        {Array.from({ length: segments }).map((_, index) => (
          <div key={index} className="h-[3px] flex-1" style={{ background: index === 0 ? theme.accent : toRgba(theme.accent, 0.25) }} />
        ))}
      </div>
      {scene.contentSlots.feedback && (
        <div style={{ ...fitType('body', scene.contentSlots.feedback.length), color: toRgba(theme.ink, 0.75) }}><MathText>{scene.contentSlots.feedback}</MathText></div>
      )}
    </section>
  )
}

/**
 * 母版⑧图纸网格式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/diagram):左侧 35% 任务文字纵向居中(呼应源卡 `left: width:35%`),
 * 右侧 65% 反馈嵌在一张"图纸"纹理面板里——双向 linear-gradient 生成的浅色网格线
 * + radial-gradient mask 令网格中心透出、四边淡出,呼应源卡"技术架构感"的网格
 * 背景,是①-⑦都没有用过的纹理装饰构件。
 */
function PracticeGridPanelMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const gridLine = toRgba(theme.ink, 0.08)
  return (
    <section className={`scene-safe-bottom flex h-full ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex w-[35%] flex-col justify-center gap-4 px-[6%]">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
        <div style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      </div>
      {scene.contentSlots.feedback && (
        <div
          className="relative flex flex-1 items-center px-[6%]"
          style={{
            backgroundImage: `linear-gradient(90deg, ${gridLine} 1px, transparent 1px), linear-gradient(180deg, ${gridLine} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 85%)',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 85%)',
          }}
        >
          <div style={{ ...fitType('body', scene.contentSlots.feedback.length), color: toRgba(theme.ink, 0.85) }}><MathText>{scene.contentSlots.feedback}</MathText></div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑨徽章聚焦式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-aqua/title-slide:四角同心圆气泡 + 中央菱形"徽章"的手绘几何装饰):
 * 任务居中呈现,背后叠一枚几何徽章——四角大小不一的 accent 实心圆点做不对称
 * 点缀,中心一枚旋转 45°的方形"印章"打底,反馈退成徽章下方一行小字。实心
 * 几何图形装饰是①-⑧都没有出现过的构件语言(区别于⑦的网格纹理、其余各版的
 * 卡片/色块语言)。
 */
function PracticeBadgeMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`scene-safe-bottom relative flex h-full flex-col items-center justify-center gap-5 overflow-hidden px-[10%] text-center ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div aria-hidden className="pointer-events-none absolute left-[6%] top-[10%] h-10 w-10 rounded-full" style={{ background: toRgba(theme.accent, 0.18) }} />
      <div aria-hidden className="pointer-events-none absolute right-[8%] top-[16%] h-6 w-6 rounded-full" style={{ background: toRgba(theme.accent, 0.22) }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[26%] left-[12%] h-4 w-4 rounded-full" style={{ background: toRgba(theme.accent, 0.16) }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[28%] right-[7%] h-8 w-8 rounded-full" style={{ background: toRgba(theme.accent, 0.14) }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ background: toRgba(theme.accent, 0.06) }} />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
        <div className="max-w-[70%]" style={fitType('heading', (scene.contentSlots.task ?? '').length)}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
        {scene.contentSlots.feedback && (
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>反馈 · <MathText>{scene.contentSlots.feedback}</MathText></div>
        )}
      </div>
    </section>
  )
}

/**
 * 母版⑩出血标题条式(来源:docs/design-refresh/harvest/layouts/marpstyle.md
 * marpstyle-heidegger/jobs body 共享机制:h1 用负 margin 撑出版心边缘的"出血条";
 * 及共享机制里 blockquote 的脚注体裁):任务标题坐在一条用 `-mx` 负边距撑穿
 * 两侧边缘的 accent 出血条上(不像②③那样收在留白内),反馈以脚注体裁呈现——
 * 上缘虚线分隔、贴着任务条下方——是①-⑨都没有的"出血通栏 + 脚注"组合。
 */
function PracticeBleedBarMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`scene-safe-bottom flex h-full w-full flex-col justify-center gap-10 overflow-hidden px-[6%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL.practice} theme={theme} />
      <div className="-mx-[6%] px-[9%] py-8" style={{ background: theme.accent }}>
        <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.paper, 0.82) }}>任务</div>
        <div className="mt-2" style={{ ...fitType('heading', (scene.contentSlots.task ?? '').length), color: theme.paper }}><MathText>{scene.contentSlots.task ?? ''}</MathText></div>
      </div>
      {scene.contentSlots.feedback && (
        <div className="flex items-start gap-3 border-t border-dashed pt-4" style={{ borderColor: toRgba(theme.ink, 0.35) }}>
          <span className="shrink-0" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>反馈</span>
          <span style={{ ...fitType('body', scene.contentSlots.feedback.length), color: toRgba(theme.ink, 0.82) }}><MathText>{scene.contentSlots.feedback}</MathText></span>
        </div>
      )}
    </section>
  )
}

'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { courseDisplayTitle, coverDisplayTitle } from '@/lib/mainline/presentation/course-display-title'
import { mixOklch, toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { subjectLabel } from '../workbench/labels'
import { pickMasterRouted } from './shared'

/**
 * source-reading · 开场扉页 8 母版(Editorial Stage 方向 A 扩容,2026-07-21;
 * 开源版式母版第一批引进,2026-07-21;第二批引进,2026-07-23)
 *
 * 170+ 图文组合只管幕内四轴,不管幕型的整版骨架——同一幕型跨千课此前永远同一张
 * 构图。八母版结构真异质(网格骨架不同,非换皮):①报头式(62/38 非对称,文字
 * 密度在左,巨字装饰在右)②满版序号式(巨型课号占左半当主角,目录退到竖排窄栏)
 * ③横幅式(顶部通栏 display 题 + 三分横排目录 + 底部大留白配元数据带)
 * ④扉页式(marpstyle titlepage:单栏纵向流,标题下划线 + 巨幅留白分隔层级,
 * 目录退化为纯文字行,不装框)⑤学术抬头式(touying-university/title-slide:
 * 居中单栏,右上角悬浮小标,知识点目录改三栏一组的网格)⑥引语扉页式(marpstyle
 * 共享机制 Citation 卡 + husserl/body 斜体衬线引语:近白整幅出血(白为主令,
 * 2026-07-23 起禁整页深底),标题当引语斜体居中呈现,巨幅低透明度引号装饰戏剧感,
 * 目录退化为虚线上方的单行面包屑)⑦仪表队列式(beamer-metropolis
 * title-slide:顶部 vfill 把标题堆栈整体挤向画面下半部,发丝细线分隔,是八母版
 * 里唯一"下沉"骨架)⑧留白潦草式(slidev-shibainu/default:内容盒贴左上角占
 * 68% 宽,目录退化为错位旋转的胶囊簇,背景层叠有机色块+散点装饰)。
 * pickMasterRouted 按 course.id+scene.id 哈希确定性选择,权重由学段×学科气质
 * 路由推导(lib/mainline/presentation/master-routing.ts)——同课稳定,跨课错开,
 * 低学段偏亲和大留白、高中偏学术式。
 */
export function SourceReadingView({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const master = pickMasterRouted(course, scene, 'source-reading')
  if (master === 1) return <SourceReadingSerialMaster scene={scene} course={course} pres={pres} />
  if (master === 2) return <SourceReadingBannerMaster scene={scene} course={course} pres={pres} />
  if (master === 3) return <SourceReadingTitlepageMaster scene={scene} course={course} pres={pres} />
  if (master === 4) return <SourceReadingUniversityMaster scene={scene} course={course} pres={pres} />
  if (master === 5) return <SourceReadingCiteMaster scene={scene} course={course} pres={pres} />
  if (master === 6) return <SourceReadingMetropolisMaster scene={scene} course={course} pres={pres} />
  if (master === 7) return <SourceReadingRawMaster scene={scene} course={course} pres={pres} />
  return <SourceReadingHeaderMaster scene={scene} course={course} pres={pres} />
}

/** 封面大标题:与目录逐条重复时收缩为公共前缀课题;教师手改过的标题原样尊重。 */
function coverTitleOf(course: MainlineCourse, scene: LessonScene): string {
  return scene.visualFocus.trim() === courseDisplayTitle(course).trim()
    ? coverDisplayTitle(course)
    : scene.visualFocus
}

function kpTitleOf(course: MainlineCourse, kpId: string | undefined): string {
  return course.sourceMaterial.find(item => item.kpId === kpId)?.title ?? kpId ?? ''
}

/**
 * 母版①报头式(原版):62/38 非对称分栏——左栏报头(eyebrow + 超大课题 + 渐进目录 +
 * 页脚元数据带)承担全部信息密度,右栏是本幕号装饰巨字,故意向左溢出栏线一截
 * 作为唯一的"破格"标记。渐进目录数据源是 course.learningFragments。
 */
function SourceReadingHeaderMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)

  return (
    <section className="relative flex h-full w-full overflow-hidden" style={{ color: theme.ink }}>
      <div className="relative z-10 flex h-full w-[62%] flex-col px-[6%] py-[6.5%]">
        <div>
          <div className="flex items-center gap-3" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
            <span className="h-[2px] w-10" style={{ background: theme.accent }} />
            <span>{subjectLabel(course.subject)}</span>
          </div>
          <h1 className="mt-6 max-w-[96%]" style={fitType('display', coverTitleOf(course, scene).length)}>{coverTitleOf(course, scene)}</h1>
        </div>

        {kpFragments.length > 0 && (
          <div className="mt-10 flex flex-col gap-3">
            {kpFragments.map((fragment, index) => {
              const active = index === 0
              const title = kpTitleOf(course, fragment.kpId)
              return (
                <div
                  key={fragment.id}
                  className="flex items-center gap-4 pack-surface px-5 py-4"
                  style={active
                    ? { background: theme.accentSoft, border: `1px solid ${theme.accent}` }
                    : { background: 'transparent', border: `1px solid ${toRgba(theme.ink, 0.16)}` }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={active
                      ? { ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper }
                      : { ...TYPE_SCALE.caption, border: `1px solid ${toRgba(theme.ink, 0.32)}`, color: toRgba(theme.ink, 0.55) }}
                  >
                    {index + 1}
                  </span>
                  <span style={active
                    ? fitType('heading', title.length)
                    : { ...fitType('heading', title.length), fontWeight: 500, color: toRgba(theme.ink, 0.6) }}
                  >
                    {title}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex-1" />

      </div>

      <div className="relative flex h-full w-[38%] items-center justify-center overflow-visible">
        <div aria-hidden className="-ml-[32%] select-none tabular-nums" style={{ ...TYPE_SCALE.decorative, color: toRgba(theme.accent, 0.13) }}>
          01
        </div>
      </div>
    </section>
  )
}

/**
 * 母版②满版序号式:巨型课号占左半当主角(非母版①里退居装饰的巨字),
 * 目录与题头一起收窄到右侧竖排窄栏——左右角色对调,骨架与母版①正相反
 * (母版①"文字满左、数字点缀右",本母版"数字满左、文字收右")。
 */
function SourceReadingSerialMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)

  return (
    <section className="relative flex h-full w-full overflow-hidden" style={{ color: theme.ink }}>
      <div className="relative flex h-full w-[54%] flex-col items-start justify-center gap-6 pl-[7%]">
        <div className="flex items-center gap-3" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
          <span className="h-[2px] w-10" style={{ background: theme.accent }} />
          <span>{subjectLabel(course.subject)}</span>
        </div>
        <div aria-hidden className="select-none tabular-nums leading-none" style={{ ...TYPE_SCALE.decorative, fontSize: '340px', color: toRgba(theme.accent, 0.85) }}>
          01
        </div>
      </div>

      <div className="relative z-10 flex h-full w-[46%] flex-col border-l px-[5%] py-[7%]" style={{ borderColor: toRgba(theme.ink, 0.16) }}>
        <h1 className="max-w-full" style={fitType('heading', coverTitleOf(course, scene).length)}>{coverTitleOf(course, scene)}</h1>

        {kpFragments.length > 0 && (
          <div className="mt-8 flex flex-col gap-3">
            {kpFragments.map((fragment, index) => {
              const active = index === 0
              const title = kpTitleOf(course, fragment.kpId)
              return (
                <div
                  key={fragment.id}
                  className="flex items-center gap-3 pack-surface px-4 py-3.5"
                  style={active
                    ? { background: theme.accentSoft, border: `1px solid ${theme.accent}` }
                    : { background: 'transparent', border: `1px solid ${toRgba(theme.ink, 0.16)}` }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={active
                      ? { ...TYPE_SCALE.caption, fontSize: '13px', background: theme.accent, color: theme.paper }
                      : { ...TYPE_SCALE.caption, fontSize: '13px', border: `1px solid ${toRgba(theme.ink, 0.32)}`, color: toRgba(theme.ink, 0.55) }}
                  >
                    {index + 1}
                  </span>
                  <span style={active ? fitType('heading', title.length) : { ...fitType('heading', title.length), fontWeight: 500, color: toRgba(theme.ink, 0.6) }}>
                    {title}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex-1" />

      </div>
    </section>
  )
}

/**
 * 母版③横幅式:顶部通栏 eyebrow + display 巨题(不裁半屏,占满全宽),
 * 中段目录改横排三栏(非母版①②的纵向列表),底部刻意留白只放元数据带——
 * 呼应"翻开杂志跨页"的留白呼吸感,与前两母版的"信息塞满全屏"骨架相反。
 */
function SourceReadingBannerMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId).slice(0, 3)

  return (
    <section className="flex h-full w-full flex-col overflow-hidden px-[6%] pb-[6%] pt-[7%]" style={{ color: theme.ink }}>
      <div className="flex items-center gap-3" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
        <span className="h-[2px] w-10" style={{ background: theme.accent }} />
        <span>{subjectLabel(course.subject)}</span>
      </div>
      <h1 className="mt-5 max-w-[92%]" style={fitType('display', coverTitleOf(course, scene).length)}>{coverTitleOf(course, scene)}</h1>

      {kpFragments.length > 0 && (
        <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: `repeat(${kpFragments.length}, 1fr)` }}>
          {kpFragments.map((fragment, index) => {
            const title = kpTitleOf(course, fragment.kpId)
            return (
              <div key={fragment.id} className="flex flex-col gap-2 pack-surface px-5 py-4" style={{ borderTop: `3px solid ${theme.accent}`, background: index === 0 ? theme.accentSoft : 'transparent' }}>
                <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>0{index + 1}</span>
                <span style={fitType('heading', title.length)}>{title}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center justify-end border-t pt-5" style={{ borderColor: toRgba(theme.ink, 0.18) }}>
        <span aria-hidden className="tabular-nums" style={{ ...TYPE_SCALE.caption, color: toRgba(theme.accent, 0.7) }}>01</span>
      </div>
    </section>
  )
}

/**
 * 母版④扉页式(来源:docs/design-refresh/harvest/layouts/marpstyle.md「共享机制 ·
 * Title slide」——22 个哲学家主题共守的 titlepage 骨架):单栏纵向流,完全不分栏
 * ——大标题 border-bottom 1px(源码值,砖红/橙线因主题而异,这里统一走 accent)
 * + 标题与目录之间留出巨幅留白(源码 `.subtitle padding-bottom:120px`,按 1080
 * 舞台约合 11% 高度)分隔信息层级,知识点目录退化为纯文字行(不装框、不加色块,
 * 呼应 titlepage"元信息裸排、靠字号不靠色块"的克制),页脚一条细线钉住元数据——
 * 与①②③的分栏/卡片/网格骨架都不同。
 */
function SourceReadingTitlepageMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)

  return (
    <section className="flex h-full w-full flex-col px-[9%] pb-[7%] pt-[8%]" style={{ color: theme.ink }}>
      <div className="flex items-center gap-3" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
        <span>{subjectLabel(course.subject)}</span>
      </div>
      <h1 className="mt-4 w-fit max-w-[78%] border-b pb-4" style={{ ...fitType('display', coverTitleOf(course, scene).length), borderColor: toRgba(theme.accent, 0.5) }}>
        {coverTitleOf(course, scene)}
      </h1>

      {kpFragments.length > 0 && (
        <div className="mt-[11%] flex flex-col gap-3">
          {kpFragments.map((fragment, index) => {
            const active = index === 0
            const title = kpTitleOf(course, fragment.kpId)
            return (
              <div key={fragment.id} className="flex items-baseline gap-4">
                <span className="tabular-nums" style={{ ...TYPE_SCALE.caption, color: active ? theme.accent : toRgba(theme.ink, 0.4) }}>0{index + 1}</span>
                <span style={active ? fitType('heading', title.length) : { ...fitType('heading', title.length), color: toRgba(theme.ink, 0.55) }}>
                  {title}
                </span>
              </div>
            )
          })}
        </div>
      )}

    </section>
  )
}

/**
 * 母版⑤学术抬头式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-university/title-slide):居中纵列——右上角悬浮小标(原版 logo 固定
 * `place(right,...)` 位),标题/副标题居中对齐,知识点目录改三栏一组的网格(原版
 * "作者 3 人一组"的 `grid(columns:(auto,)*n, column-gutter:1em)`),机构/日期等
 * 元数据回落成裸文字(原版 `parbreak()` 纯文本流,不装框、不加色块)——与①②③的
 * 分栏骨架、④左对齐扉页骨架都不同,是五母版里唯一的居中单栏构图。
 */
function SourceReadingUniversityMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)

  return (
    <section className="relative flex h-full w-full flex-col items-center justify-center gap-8 px-[10%] text-center" style={{ color: theme.ink }}>
      <span
        aria-hidden
        className="absolute right-[7%] top-[7%] flex h-11 w-11 items-center justify-center rounded-full"
        style={{ ...TYPE_SCALE.caption, border: `1px solid ${theme.accent}`, color: theme.accent }}
      >
        课
      </span>

      <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{subjectLabel(course.subject)}</div>
      <h1 className="max-w-[70%]" style={fitType('display', coverTitleOf(course, scene).length)}>{coverTitleOf(course, scene)}</h1>

      {kpFragments.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-center gap-x-10 gap-y-3">
          {kpFragments.slice(0, 6).map((fragment, index) => {
            const title = kpTitleOf(course, fragment.kpId)
            return (
              <span
                key={fragment.id}
                style={index === 0
                  ? { ...fitType('heading', title.length), color: theme.accent }
                  : { ...fitType('heading', title.length), color: toRgba(theme.ink, 0.6) }}
              >
                {title}
              </span>
            )
          })}
        </div>
      )}

    </section>
  )
}

/**
 * 母版⑥引语扉页式(来源:docs/design-refresh/harvest/layouts/marpstyle.md
 * 共享机制「Citation 卡」(`section.cite`:整页背景色块 + 居中大字 + 隐藏
 * 页眉页脚页码,左右各留安全边)叠加 husserl/body 的斜体衬线引语处理、
 * structure.css「Blockquote 脚注机制」(`border-top: dashed` 钉在末尾的细线)——
 * 白为主令扩展到母版层(2026-07-23):不再用深底反白撑"引语感",改回 theme.paper
 * 近白纸底,戏剧感改由巨幅低透明度 accent 引号装饰(背景层,不参与文档流)承担,
 * 标题本身仍当作"待读文本"以 theme.ink 斜体大字居中呈现 + 一条 accent 细线收尾,
 * 不设卡片/编号/网格,知识点目录退化为 accent 虚线上方一行面包屑。是八母版里
 * 唯一的"全屏引语"骨架,与④扉页式(左对齐纵向流+纯文字列表)、⑤学术抬头式
 * (居中+网格标签)都不同。
 */
function SourceReadingCiteMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)

  return (
    <section className="scene-safe-bottom relative flex h-full w-full flex-col items-center justify-center gap-8 px-[12%] text-center" style={{ background: theme.paper }}>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[6%] -translate-x-1/2 select-none leading-none"
        style={{ ...TYPE_SCALE.decorative, fontSize: '280px', color: toRgba(theme.accent, 0.12) }}
      >
        “
      </span>

      <span className="relative z-10" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{subjectLabel(course.subject)}</span>
      <h1 className="relative z-10 max-w-[80%] italic" style={{ ...fitType('display', scene.visualFocus.length), color: theme.ink }}>
        {scene.visualFocus}
      </h1>
      <span aria-hidden className="relative z-10 h-[2px] w-16" style={{ background: toRgba(theme.accent, 0.6) }} />

      {kpFragments.length > 0 && (
        <div className="relative z-10 mt-2 flex max-w-[70%] flex-col items-center gap-3 border-t border-dashed pt-4" style={{ borderColor: toRgba(theme.accent, 0.4) }}>
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>
            {kpFragments.map(fragment => kpTitleOf(course, fragment.kpId)).join(' · ')}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * 母版⑦仪表队列式(来源:docs/design-refresh/harvest/layouts/beamer-metropolis.md
 * beamer-metropolis/title-slide:`minipage[b][\paperheight]` 顶部一个 `\vfill`
 * 把 kicker→标题→0.4pt 极细分隔线→作者/日期/机构 整段堆栈整体挤向画面下半部,
 * 全部左对齐、无卡片无编号,唯一装饰是那条头发丝细线)——知识点目录改成紧贴
 * 分隔线之下的单行队列(对应源版 author 行),元数据落到最底(对应 date/institute
 * 行)。是八母版里唯一把内容钉在下半屏、顶部留出大片空白的骨架,与④扉页式
 * (顶对齐)、①②(顶对齐分栏)都相反。
 */
function SourceReadingMetropolisMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)

  return (
    <section className="scene-safe-bottom flex h-full w-full flex-col px-[9%]" style={{ color: theme.ink }}>
      <div className="flex-1" />
      <div className="flex flex-col gap-3">
        <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>{subjectLabel(course.subject)}</span>
        <h1 className="max-w-[86%]" style={fitType('display', coverTitleOf(course, scene).length)}>{coverTitleOf(course, scene)}</h1>
        <div className="h-px w-full" style={{ background: toRgba(theme.ink, 0.22) }} />

        {kpFragments.length > 0 && (
          <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
            {kpFragments.map(fragment => kpTitleOf(course, fragment.kpId)).join('  ·  ')}
          </div>
        )}

      </div>
    </section>
  )
}

/**
 * 母版⑧留白潦草式(来源:docs/design-refresh/harvest/layouts/slidev-shibainu.md
 * slidev-shibainu/default:内容盒锁 70% 宽、无内边距、贴左上角起排,是该主题
 * 密度光谱里"最生"的一版;背景层用两枚四角圆角各异的有机色块模拟源仓库暖棕
 * 手绘背景(border-radius 每角不同模拟"泡状"轮廓)。白为主令扩展到母版层
 * (2026-07-23):舞台底改回 theme.backdrop[0] 近白纸底,两枚 blob 改走
 * accentSoft/accent 派生的浅色低透明度色块(不再是深底上的亮色斑块),
 * 再叠几点 accent 小圆点模拟其反复出现的爪印/逗号标记,内容文字回落 theme.ink。
 * 知识点目录不装列表/网格,改成松散错位、轻微旋转的胶囊簇(accentSoft 底/accent
 * 边)贴在内容盒下缘——与①~⑦皆不同的"非对齐簇"呈现。
 */
function SourceReadingRawMaster({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const theme = pres.palette
  const kpFragments = course.learningFragments.filter(fragment => fragment.kpId)
  const blobA = theme.accentSoft
  const blobB = mixOklch(theme.accent, theme.accentSoft, 0.45)
  const dots: Array<[number, number]> = [[10, 14], [17, 22], [8, 30]]

  return (
    <section className="relative h-full w-full overflow-hidden" style={{ background: theme.backdrop[0] }}>
      <div aria-hidden className="absolute -right-[6%] -top-[10%] h-[62%] w-[46%]" style={{ background: toRgba(blobA, 0.55), borderRadius: '42% 58% 63% 37% / 45% 40% 60% 55%' }} />
      <div aria-hidden className="absolute -right-[2%] bottom-[6%] h-[30%] w-[26%]" style={{ background: toRgba(blobB, 0.4), borderRadius: '58% 42% 40% 60% / 55% 60% 40% 45%' }} />
      {dots.map(([top, right]) => (
        <span key={`${top}-${right}`} aria-hidden className="absolute h-2 w-2 rounded-full" style={{ top: `${top}%`, right: `${right}%`, background: toRgba(theme.accent, 0.55) }} />
      ))}

      <div className="scene-safe-bottom relative z-10 flex h-full w-[68%] flex-col gap-6 px-[6%] pt-[6%]">
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{subjectLabel(course.subject)}</span>
        <h1 className="max-w-[94%]" style={{ ...fitType('display', scene.visualFocus.length), color: theme.ink }}>{scene.visualFocus}</h1>

        {kpFragments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {kpFragments.map((fragment, index) => {
              const title = kpTitleOf(course, fragment.kpId)
              const rotate = index % 2 === 0 ? '-1.2deg' : '1deg'
              return (
                <span
                  key={fragment.id}
                  className="rounded-full px-4 py-2"
                  style={{
                    ...fitType('body', title.length),
                    color: theme.ink,
                    background: index === 0 ? theme.accentSoft : toRgba(theme.paper, 0.82),
                    border: `1px solid ${toRgba(theme.accent, 0.4)}`,
                    transform: `rotate(${rotate})`,
                  }}
                >
                  {title}
                </span>
              )
            })}
          </div>
        )}

        <div className="flex-1" />

      </div>
    </section>
  )
}

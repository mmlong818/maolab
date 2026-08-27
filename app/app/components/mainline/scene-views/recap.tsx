'use client'

import { spriteSideOf, type LessonScene, type MainlineCourse, type ScenePresentation } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { recapTemplateForScene } from '@/lib/mainline/recap-template'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { MathText, pathNodes, pickMasterRouted, SceneBadge, SerialHookTeaser, spritePad } from './shared'

/**
 * recap · 收束总结 9 母版(Editorial Stage 方向 A 扩容,2026-07-21;
 * 开源版式母版第一批引进,2026-07-21;第二批引进(⑥-⑨),2026-07-23;
 * 白为主令扩展到母版层——①④⑧三个深底母版转近白底,2026-07-23)
 *
 * ①Focus 全出血强调(白底 display 巨字 + accent 粗下划线收束,路径收窄成上方细带胶囊)
 * ②纵向时间线式(路径节点竖排左栏 + 结论正文右栏——与①的"单栏居中"骨架不同)
 * ③板书总结墙式(takeaway 大字置顶 + boardText 错落卡片墙——不再走深底反白,
 *   回到纸面质感,呼应"下课前老师在黑板上圈重点"的场景)
 * ④纯色断点式(touying-stargazer/focus-slide 底子改良:白底 + 大面积 accentSoft
 *   浅色块 + accent 细节线,只留居中粗体一句话——比①更极简的断点)
 * ⑤光环聚焦式(slidev-neocarbon/fact:双层同心光环背衬结论文字,不强制深底,
 *   回到纸面质感,环外一行路径小字、环下一条细线收尾)
 * ⑥信息网格总结式(touying-university/matrix-slide:题头条 + 棋盘格总览,
 *   零圆角零缝隙的功能主义表格骨架——与①-⑤均不共享"单栏/双栏/环形"构图)
 * ⑦大纲高亮总览式(touying-stargazer/section-slide 页眉渐变条 + 大纲淡出手法:
 *   页眉/大纲列/页脚三段式纵向堆叠,当前项高亮、其余项降透明度)
 * ⑧引言收束式(marpstyle cite 全屏引语卡 + blockquote 虚线脚注机制:白底上装饰性
 *   accent 巨引号 + 贴底 accent 虚线脚注,与①④的"无装饰纯色断点"相区分)
 * ⑨巨数收尾式(touying-aqua/section-slide 巨型数字锚点 + university/metropolis
 *   细进度条:数字当视觉重心的纵向堆叠,全母版唯一以"数字巨物"收束)
 */
export function RecapFocusView({ scene, course, pres }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation }) {
  const template = recapTemplateForScene(scene)
  if (template?.id === 'belief-revision') return <RecapBeliefRevisionView scene={scene} pres={pres} />
  if (template?.id === 'claim-evidence') return <RecapClaimEvidenceView scene={scene} pres={pres} />
  if (template?.id === 'concept-network') return <RecapConceptNetworkView scene={scene} pres={pres} />
  const master = pickMasterRouted(course, scene, 'recap')
  if (master === 1) return <RecapTimelineMaster scene={scene} pres={pres} />
  if (master === 2) return <RecapWallMaster scene={scene} pres={pres} />
  if (master === 3) return <RecapPureFocusMaster scene={scene} pres={pres} />
  if (master === 4) return <RecapFactRingMaster scene={scene} pres={pres} />
  if (master === 5) return <RecapMatrixMaster scene={scene} pres={pres} />
  if (master === 6) return <RecapOutlineMaster scene={scene} pres={pres} />
  if (master === 7) return <RecapQuoteMaster scene={scene} pres={pres} />
  if (master === 8) return <RecapNumeralMaster scene={scene} pres={pres} />
  return <RecapFocusMaster scene={scene} pres={pres} />
}

function recapShapeItems(scene: LessonScene): string[] {
  return Object.keys(scene.contentSlots)
    .filter(key => /^shapeItem\d+$/.test(key))
    .sort((left, right) => Number(left.slice(9)) - Number(right.slice(9)))
    .map(key => scene.contentSlots[key]!)
    .filter(Boolean)
}

/** 概念误区课：把“原先怎么想—现在怎么解释—凭什么修正”放在同一视野。 */
function RecapBeliefRevisionView({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const startingIdea = scene.contentSlots.startingIdea ?? ''
  const revisedIdea = scene.contentSlots.revisedIdea ?? ''
  const evidence = scene.contentSlots.revisionEvidence ?? ''
  const takeaway = scene.contentSlots.takeaway ?? ''
  return (
    <section data-recap-template="belief-revision" className={`scene-safe-bottom flex h-full w-full flex-col overflow-hidden px-[7%] pt-[6%] ${spritePad(sprite)}`} style={{ background: theme.paper, color: theme.ink }}>
      <div className="flex items-end justify-between gap-8 border-b pb-5" style={{ borderColor: toRgba(theme.accent, 0.25) }}>
        <div>
          <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>想法是怎样改变的</div>
          <div className="mt-2 max-w-[760px]" style={fitType('heading', takeaway.length)}>{takeaway}</div>
        </div>
        <div className="shrink-0 text-right" style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>起点 · 证据 · 修正</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto_1fr] items-stretch gap-5 py-6">
        <div className="flex min-w-0 flex-col justify-center border px-6 py-5" style={{ borderColor: toRgba(theme.ink, 0.14), background: theme.backdrop[1] }}>
          <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.58) }}>起始想法</div>
          <div className="mt-4" style={fitType('heading', startingIdea.length)}>{startingIdea}</div>
        </div>
        <div className="flex w-20 flex-col items-center justify-center gap-3" style={{ color: theme.accent }}>
          <span className="h-px w-full" style={{ background: toRgba(theme.accent, 0.35) }} />
          <span style={TYPE_SCALE.heading}>→</span>
          <span style={{ ...TYPE_SCALE.caption, writingMode: 'vertical-rl' }}>证据修正</span>
          <span className="h-px w-full" style={{ background: toRgba(theme.accent, 0.35) }} />
        </div>
        <div className="flex min-w-0 flex-col justify-center border-l-4 px-6 py-5" style={{ borderColor: theme.accent, background: theme.accentSoft }}>
          <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>现在的解释</div>
          <div className="mt-4" style={fitType('heading', revisedIdea.length)}>{revisedIdea}</div>
        </div>
      </div>
      <div className="mb-[3%] grid grid-cols-[auto_1fr] items-start gap-5 border-t pt-4" style={{ borderColor: toRgba(theme.accent, 0.28) }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>修正依据</span>
        <span style={fitType('body', evidence.length)}>{evidence}</span>
      </div>
    </section>
  )
}

/** 单一主题或双知识点：总论断在上，三条已学依据在下，避免把并列内容画成伪路径。 */
function RecapClaimEvidenceView({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const summary = scene.contentSlots.shapeSummary ?? ''
  const takeaway = scene.contentSlots.takeaway ?? ''
  const items = recapShapeItems(scene)
  return (
    <section data-recap-template="claim-evidence" className={`scene-safe-bottom flex h-full w-full flex-col overflow-hidden px-[7%] pt-[6%] ${spritePad(sprite)}`} style={{ background: theme.paper, color: theme.ink }}>
      <div className="grid grid-cols-[auto_1fr] items-start gap-6 border-b pb-6" style={{ borderColor: toRgba(theme.accent, 0.28) }}>
        <div className="mt-1 border px-3 py-2" style={{ ...TYPE_SCALE.caption, borderColor: theme.accent, color: theme.accent }}>本课总论断</div>
        <div style={fitType('display', summary.length)}>{summary}</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-0 py-6">
        {items.map((item, index) => (
          <div key={`${index}-${item}`} className="flex min-w-0 flex-col justify-center gap-4 px-6" style={{ borderLeft: index === 0 ? 'none' : `1px solid ${toRgba(theme.ink, 0.14)}` }}>
            <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>依据 {String(index + 1).padStart(2, '0')}</span>
            <span style={fitType('body', item.length)}>{item}</span>
          </div>
        ))}
      </div>
      <div className="mb-[3%] flex items-start gap-5 border-t pt-4" style={{ borderColor: toRgba(theme.accent, 0.28) }}>
        <span className="shrink-0" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>迁移收获</span>
        <span style={fitType('body', takeaway.length)}>{takeaway}</span>
      </div>
    </section>
  )
}

/** 三个以上知识点：中心主题与分支关系同屏，强调联系而不是授课顺序。 */
function RecapConceptNetworkView({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const center = scene.contentSlots.shapeCenter ?? ''
  const takeaway = scene.contentSlots.takeaway ?? ''
  const items = recapShapeItems(scene)
  return (
    <section data-recap-template="concept-network" className={`scene-safe-bottom grid h-full w-full grid-rows-[auto_1fr_auto] overflow-hidden px-[7%] pt-[5.5%] ${spritePad(sprite)}`} style={{ background: theme.paper, color: theme.ink }}>
      <div className="flex items-baseline justify-between gap-8 border-b pb-4" style={{ borderColor: toRgba(theme.accent, 0.25) }}>
        <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>本课概念网络</div>
        <div className="max-w-[72%] text-right" style={fitType('body', takeaway.length)}>{takeaway}</div>
      </div>
      <div className="grid min-h-0 grid-cols-[34%_1fr] items-center gap-10 py-6">
        <div className="relative flex aspect-square max-h-[330px] w-full items-center justify-center justify-self-center rounded-full border-2 px-8 text-center" style={{ borderColor: theme.accent, background: theme.accentSoft }}>
          <div aria-hidden className="absolute inset-[10%] rounded-full border" style={{ borderColor: toRgba(theme.accent, 0.3) }} />
          <span className="relative z-10" style={fitType('heading', center.length)}>{center}</span>
        </div>
        <div className="relative grid content-center gap-3 border-l-2 pl-9" style={{ borderColor: toRgba(theme.accent, 0.42) }}>
          {items.map((item, index) => (
            <div key={`${index}-${item}`} className="relative flex items-start gap-4 border-b py-3" style={{ borderColor: toRgba(theme.ink, 0.1) }}>
              <span aria-hidden className="absolute -left-9 top-1/2 h-px w-7" style={{ background: toRgba(theme.accent, 0.42) }} />
              <span className="shrink-0" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
              <span style={fitType('body', item.length)}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mb-[3%] h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${theme.accent}, ${toRgba(theme.accent, 0.08)})` }} />
    </section>
  )
}

/** 有配图的收束页：只呈现原图和教师确认的板书；路径与收获留在备课说明。 */
export function RecapImageView({ scene, pres, sceneNumber }: { scene: LessonScene & { imageUrl: string }; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette

  return (
    <section className="absolute inset-0 overflow-hidden" style={{ background: theme.paper, color: theme.ink }}>
      <div className="scene-safe-height grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-7 px-[5.5%] pb-[3%] pt-[3.5%]">
        <div className="relative min-h-0 overflow-hidden rounded-[12px]" style={{ background: theme.backdrop[0], border: `1px solid ${toRgba(theme.accent, 0.22)}` }}>
          <img src={scene.imageUrl} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-5">
          <SceneBadge number={sceneNumber} label="收束" theme={theme} />
          <div className="min-h-0">
            <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>本课板书</div>
            <div data-recap-board className="mt-3 flex flex-col gap-3">
              {scene.boardText.map((item, index) => (
                <div key={`${index}-${item}`} className="flex items-start gap-3 border-l-2 py-1.5 pl-3" style={{ borderColor: toRgba(theme.accent, 0.45) }}>
                  <span className="shrink-0 pt-0.5" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
                  <span style={fitType('body', item.length)}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** 迁移任务是正式投影片，不藏在课堂工具弹窗里。 */
export function RecapTransferSlideView({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const task = scene.contentSlots.transferTask ?? scene.boardText[0] ?? ''
  return (
    <section
      data-recap-transfer-slide="true"
      className="scene-safe-bottom flex h-full w-full flex-col justify-center overflow-hidden px-[9%] py-[7%]"
      style={{ background: theme.paper, color: theme.ink }}
    >
      <SceneBadge number={sceneNumber} label="迁移练习" theme={theme} />
      <h2 className="mt-8" style={{ ...fitType('display', scene.visualFocus.length), color: theme.ink }}>
        <MathText>{scene.visualFocus}</MathText>
      </h2>
      {/* 迁移题面常含行内 LaTeX(力/角度/单位),裸文本会把源码晒给学生(2026-08-25 实撞) */}
      <div
        className="mt-9 border-l-4 py-4 pl-7"
        style={{ ...fitType('heading', task.length), borderColor: theme.accent, color: theme.ink }}
      >
        <MathText>{task}</MathText>
      </div>
    </section>
  )
}

/**
 * 收束 · Focus 全出血强调:recap 的一句话结论(contentSlots.takeaway)退场配图
 * 专辟整幅白底给它——theme.ink display 巨字居中,学习路径收窄成上方一条细带
 * 胶囊,底部一条加粗 accent 下划线接住戏剧感收尾(白为主令,2026-07-23:
 * 深墨底反白改白底,原先靠深底反白撑的仪式感现由粗下划线扛)。
 */
function RecapFocusMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const nodes = pathNodes(scene)
  return (
    <section className={`scene-safe-bottom relative flex h-full w-full flex-col items-center justify-center gap-10 overflow-hidden px-[8%] ${spritePad(sprite)}`} style={{ background: theme.paper }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, ${toRgba(theme.accent, 0.12)}, transparent 58%)` }} />
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5">
        {nodes.map((node, index) => (
          <span key={node} className="flex items-center gap-2.5">
            <span
              className="rounded-full px-4 py-1.5"
              style={{ ...TYPE_SCALE.caption, background: toRgba(theme.accent, 0.12), color: theme.accent, border: `1px solid ${toRgba(theme.accent, 0.4)}` }}
            >
              {node}
            </span>
            {index < nodes.length - 1 && <span aria-hidden style={{ color: toRgba(theme.accent, 0.55) }}>→</span>}
          </span>
        ))}
      </div>
      <div className="relative z-10 max-w-[80%] text-center" style={{ ...fitType('display', (scene.contentSlots.takeaway ?? '').length), color: theme.ink }}>
        {scene.contentSlots.takeaway}
      </div>
      <div className="relative z-10 h-[6px] w-32 rounded-full" style={{ background: theme.accent }} />
    </section>
  )
}

/**
 * 母版②纵向时间线式:学习路径改竖排左栏(带连接线,像时间轴),结论正文
 * 移到右栏——与母版①"单栏居中、路径收窄成顶部细带"的骨架完全不同,
 * 且回到纸面质感(非深底反白)。
 */
function RecapTimelineMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const nodes = pathNodes(scene)
  return (
    <section className={`flex h-full w-full items-center gap-10 px-[8%] pb-[8%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="relative flex h-[70%] w-[30%] flex-col justify-center gap-0">
        <div className="absolute left-[19px] top-2 bottom-2 w-[3px] rounded-full opacity-40" style={{ background: theme.accent }} />
        {nodes.map(node => (
          <div key={node} className="relative flex items-center gap-4 py-3">
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: theme.paper, border: `2px solid ${theme.accent}`, color: theme.accent, ...TYPE_SCALE.caption }}>
              ●
            </span>
            <span style={fitType('body', node.length)}>{node}</span>
          </div>
        ))}
      </div>
      <div className="flex w-[70%] flex-col gap-5 border-l pl-10" style={{ borderColor: toRgba(theme.accent, 0.35) }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>本课结论</span>
        <div style={fitType('display', (scene.contentSlots.takeaway ?? '').length)}>{scene.contentSlots.takeaway}</div>
        <div className="h-[3px] w-24 rounded-full" style={{ background: theme.accent }} />
      </div>
    </section>
  )
}

/**
 * 母版③板书总结墙式:takeaway 置顶陈述,boardText 化作错落卡片墙(轻微交替
 * 旋转角度模拟手写贴纸的随性感)——纸面质感,与①的深底反白、②的时间线
 * 骨架都不同,呼应"下课前老师圈重点"的黑板即视感。
 */
function RecapWallMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`relative flex h-full w-full flex-col items-center gap-8 overflow-hidden px-[8%] py-[7%] ${spritePad(sprite)}`} style={{ background: theme.backdrop[1], color: theme.ink }}>
      <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>本课板书</span>
      <div className="max-w-[82%] text-center" style={fitType('heading', (scene.contentSlots.takeaway ?? '').length)}>{scene.contentSlots.takeaway}</div>
      <div className="flex flex-1 w-full flex-wrap items-center justify-center gap-4 overflow-hidden">
        {scene.boardText.map((item, index) => (
          <div
            key={item}
            className="pack-surface border px-5 py-4"
            style={{ ...fitType('body', item.length), background: theme.paper, borderColor: `${theme.accent}55`, transform: `rotate(${(index % 2 === 0 ? -1 : 1) * (1 + (index % 3))}deg)` }}
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * 母版④纯色断点式(来源:docs/design-refresh/harvest/layouts/touying.md
 * touying-stargazer/focus-slide):六主题里"纯色打断最干净的一版"——白底上留一块
 * 大面积 accentSoft 浅色断点(顶缘一条 accent 细节线),连径向光晕、路径胶囊都不设,
 * 只留居中粗体一句话,是①Focus(渐变光晕+路径带+下划线)之外最克制的极简断点,
 * 呼应源卡"像一声停顿"的气质(白为主令,2026-07-23:纯色实底改浅色断点,不再深底)。
 */
function RecapPureFocusMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`relative flex h-full w-full items-center justify-center overflow-hidden px-[12%] text-center ${spritePad(sprite)}`} style={{ background: theme.paper }}>
      <div aria-hidden className="absolute inset-[5%]" style={{ background: theme.accentSoft, borderTop: `4px solid ${theme.accent}` }} />
      <div className="relative z-10 max-w-[78%]" style={{ ...fitType('display', (scene.contentSlots.takeaway ?? '').length), color: theme.ink }}>{scene.contentSlots.takeaway}</div>
    </section>
  )
}

/**
 * 母版⑤光环聚焦式(来源:docs/design-refresh/harvest/layouts/slidev-neocarbon.md
 * slidev-neocarbon/fact):双层同心光环(原版 320×320px 主环 + `inset:-20px` 副环
 * 的比例关系)背衬在结论文字之后,环用 accent 描边而非纯色填充,不强制深底、
 * 回到纸面质感(与①④的深底断点相反),呼应源卡"重要事实"的仪式聚焦,环外一行
 * 路径小字、环下一条细线收尾。
 */
function RecapFactRingMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const nodes = pathNodes(scene)
  return (
    <section
      className={`relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden px-[10%] text-center ${spritePad(sprite)}`}
      style={{ background: theme.backdrop[1], color: theme.ink }}
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: `2px solid ${toRgba(theme.accent, 0.22)}` }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: `1px solid ${toRgba(theme.accent, 0.14)}` }} />

      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 opacity-80">
        {nodes.map((node, index) => (
          <span key={node} className="flex items-center gap-2">
            <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>{node}</span>
            {index < nodes.length - 1 && <span aria-hidden style={{ color: toRgba(theme.accent, 0.5) }}>→</span>}
          </span>
        ))}
      </div>
      <div className="relative z-10 max-w-[74%]" style={fitType('display', (scene.contentSlots.takeaway ?? '').length)}>{scene.contentSlots.takeaway}</div>
      <div className="relative z-10 h-[2px] w-20" style={{ background: theme.accent }} />
    </section>
  )
}

/**
 * 母版⑥信息网格总结式(来源:harvest/layouts/touying.md · touying-university/
 * matrix-slide):takeaway 占满题头条(呼应 stargazer/tblock 的标题条手法,但下方
 * 改成 matrix-slide 的棋盘格——boardText 各条散入零缝隙零圆角的网格,按行列奇偶
 * 交替明暗填色,直白到近乎"表格"。与①⑤的圆形光晕、②的左右两栏、③的贴纸墙、
 * ④的纯色断点都不共享"题头条+棋盘格"这套骨架。
 */
function RecapMatrixMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const items = scene.boardText.slice(0, 6)
  const cols = items.length > 4 ? 3 : 2
  return (
    <section className={`flex h-full w-full flex-col overflow-hidden ${spritePad(sprite)}`} style={{ background: theme.paper }}>
      <div className="flex items-center gap-6 px-[6%] py-6" style={{ background: theme.accent, color: theme.paper }}>
        <span className="shrink-0" style={{ ...TYPE_SCALE.caption, opacity: 0.85 }}>本课总览</span>
        <div className="flex-1" style={fitType('heading', (scene.contentSlots.takeaway ?? '').length)}>{scene.contentSlots.takeaway}</div>
      </div>
      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {items.map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-3 px-6 py-5"
            style={{
              background: index % 2 === 0 ? theme.paper : theme.backdrop[1],
              borderTop: `1px solid ${toRgba(theme.ink, 0.08)}`,
              color: theme.ink,
              ...(index % cols !== 0 ? { borderLeft: `1px solid ${toRgba(theme.ink, 0.08)}` } : {}),
            }}
          >
            <span className="shrink-0" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
            <span style={fitType('body', item.length)}>{item}</span>
          </div>
        ))}
      </div>
      <div className="scene-safe-bottom flex justify-center px-[6%] pt-4" style={{ background: theme.backdrop[1] }}>
        <SerialHookTeaser scene={scene} theme={theme} />
      </div>
    </section>
  )
}

/**
 * 母版⑦大纲高亮总览式(来源:harvest/layouts/touying.md · touying-stargazer/
 * section-slide 页眉渐变条 + 大纲淡出手法,融合 dewdrop/section-slide"当前项高亮、
 * 其余项变淡"的逻辑):顶部渐变题头条居中标题,中段路径节点纵向罗列并统一降至
 * 六成透明度,末行 takeaway 用 accent 胶囊高亮成"当前项",底部复刻页脚四格色块
 * (含一条细分隔线)收尾。页眉/大纲列/页脚三段式纵向堆叠,与其余母版均不同构。
 */
function RecapOutlineMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const nodes = pathNodes(scene)
  return (
    <section className={`flex h-full w-full flex-col ${spritePad(sprite)}`} style={{ background: theme.paper, color: theme.ink }}>
      <div className="flex items-center px-[7%] py-5" style={{ background: `linear-gradient(90deg, ${theme.accent}, ${toRgba(theme.accent, 0.35)})` }}>
        <span style={{ ...fitType('heading', 4), color: theme.paper }}>本课回顾</span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-4 px-[10%]">
        {nodes.map(node => (
          <div key={node} className="flex items-center gap-3" style={{ opacity: 0.55 }}>
            <span aria-hidden style={{ color: theme.accent }}>—</span>
            <span style={fitType('body', node.length)}>{node}</span>
          </div>
        ))}
        <div className="mt-2 flex w-fit items-center gap-3 rounded-full px-6 py-3" style={{ background: theme.accent, color: theme.paper }}>
          <span aria-hidden>●</span>
          <span style={fitType('heading', (scene.contentSlots.takeaway ?? '').length)}>{scene.contentSlots.takeaway}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-[6%] pb-[8%]">
        <div className="grid items-center gap-4" style={{ gridTemplateColumns: '18% 18% 1fr' }}>
          <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>maolab</span>
          <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.55) }}>课堂回顾</span>
          <div className="h-[2px]" style={{ background: toRgba(theme.accent, 0.3) }} />
        </div>
        <SerialHookTeaser scene={scene} theme={theme} />
      </div>
    </section>
  )
}

/**
 * 母版⑧引言收束式(来源:harvest/layouts/marpstyle.md · cite 全屏引语卡「整页
 * 背景色块 + 居中大字 + 衬线倾向」+ blockquote 脚注机制「贴底虚线上边框」):
 * 白底上巨大装饰性 accent 引号(TYPE_SCALE.decorative 低透明度)衬在结论文字
 * 左上角,取代①④"无任何装饰的纯色断点"；路径节点降格为脚注,贴底 accent 虚线
 * 分隔线收尾,与①②③⑤均不共享"装饰引号+虚线脚注"这套语法(白为主令,
 * 2026-07-23:深底实色改白底,反白结论字改 theme.ink)。
 */
function RecapQuoteMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const nodes = pathNodes(scene)
  return (
    <section className={`scene-safe-bottom relative flex h-full w-full flex-col items-center justify-center gap-8 overflow-hidden px-[10%] text-center ${spritePad(sprite)}`} style={{ background: theme.paper }}>
      <span aria-hidden className="pointer-events-none absolute left-[8%] top-[8%] select-none" style={{ ...TYPE_SCALE.decorative, fontSize: '200px', color: toRgba(theme.accent, 0.22) }}>&ldquo;</span>
      <div className="relative z-10 max-w-[76%]" style={{ ...fitType('display', (scene.contentSlots.takeaway ?? '').length), color: theme.ink }}>{scene.contentSlots.takeaway}</div>
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 border-t border-dashed pt-4" style={{ borderColor: toRgba(theme.accent, 0.4) }}>
        {nodes.map((node, index) => (
          <span key={node} className="flex items-center gap-2">
            <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>{node}</span>
            {index < nodes.length - 1 && <span aria-hidden style={{ color: toRgba(theme.accent, 0.5) }}>·</span>}
          </span>
        ))}
      </div>
    </section>
  )
}

/**
 * 母版⑨巨数收尾式(来源:harvest/layouts/touying.md · touying-aqua/section-slide
 * 巨型数字锚点「章节序号即视觉主角」+ touying-university/metropolis section-slide
 * 细进度条):四边大留白后纵向堆叠——巨数字(取路径节点数,呼应源卡"数字当主角")
 * 居中当锚点,下接说明小字与 takeaway 陈述句,再落一条细进度条收尾。是唯一以
 * "数字巨物"当视觉重心的母版,与①⑤的环形光晕、②的时间线、⑥的棋盘格都不同构。
 */
function RecapNumeralMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const nodes = pathNodes(scene)
  return (
    <section className={`flex h-full w-full flex-col items-center justify-center gap-6 px-[15%] py-[8%] text-center ${spritePad(sprite)}`} style={{ background: theme.paper, color: theme.ink }}>
      <div style={{ ...TYPE_SCALE.decorative, fontSize: '180px', color: toRgba(theme.accent, 0.85) }}>{String(nodes.length).padStart(2, '0')}</div>
      <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>本课收束 · {nodes.length} 个关键节点</span>
      <div className="max-w-[70%]" style={fitType('heading', (scene.contentSlots.takeaway ?? '').length)}>{scene.contentSlots.takeaway}</div>
      <div className="mt-4 h-[2px] w-full max-w-[50%]" style={{ background: `linear-gradient(90deg, ${theme.accent}, ${toRgba(theme.accent, 0.15)})` }} />
      <SerialHookTeaser scene={scene} theme={theme} />
    </section>
  )
}

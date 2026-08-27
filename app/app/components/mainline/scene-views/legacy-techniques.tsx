'use client'

import type { CSSProperties } from 'react'
import { decorCss, markerCss, presentationFor, sceneTechniqueSpec, spriteSideOf, type LessonScene, type MainlineCourse, type ScenePresentation } from '@/lib/mainline'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { AiInquiryView, AiVerifyView } from './ai-scenes'
import { ContrastView } from './contrast-scenes'
import { cardSurface, MathText, SceneBadge, spritePad } from './shared'

/**
 * legacy-techniques · 未纳入母版扩容的既有技法组件(拆分自 SceneTechniqueView.tsx)
 *
 * 本次只对字号/行高做 TYPE_SCALE 音阶 token 化(治"零展示级排印"病灶),
 * 不改动内部逻辑/配色/结构——这些组件不在本轮 3 母版扩容范围内。
 * ai-verify/ai-inquiry 的专属母版已拆到 ./ai-scenes.tsx(2026-07-21 4+3 母版
 * 扩容),本文件的 ComparisonView 只保留分派 + 非 ai 幕型(contrast)的对照骨架。
 */

function StaticBoard({ course, scene, sceneNumber }: { course: MainlineCourse; scene: LessonScene; sceneNumber: number }) {
  const spec = sceneTechniqueSpec(scene.sceneTechnique)
  const sprite = spriteSideOf(scene)
  const pres = presentationFor(scene, course)
  const theme = pres.palette

  return (
    <section className={`flex h-full flex-col justify-center px-[9%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={spec.label} theme={theme} />
      <h2 className="mt-4" style={fitType('heading', scene.visualFocus.length)}>{scene.visualFocus}</h2>
      <BoardTextBlock items={scene.boardText} pres={pres} />
    </section>
  )
}

/** 段落排版库:板书卡组的四种排布(stack/two-col/lede-body/numbered)。 */
function BoardTextBlock({ items, pres }: { items: string[]; pres: ScenePresentation }) {
  const theme = pres.palette
  const card = (item: string, style: CSSProperties = fitType('body', item.length)) => (
    <div key={item} className="pack-surface border px-6 py-5" style={{ background: theme.paper, borderColor: `${theme.accent}66`, ...decorCss(pres.decor, theme), ...style }}>
      <MathText>{item}</MathText>
    </div>
  )
  switch (pres.textblock) {
    case 'two-col':
      return <div className="mt-8 grid grid-cols-2 gap-4">{items.map(item => card(item))}</div>
    case 'lede-body':
      return (
        <div className="mt-8 grid gap-4">
          {items[0] && card(items[0], fitType('heading', items[0].length))}
          <div className="grid grid-cols-2 gap-4">{items.slice(1).map(item => card(item))}</div>
        </div>
      )
    case 'numbered':
      return (
        <div className="mt-8 grid gap-4">
          {items.map((item, index) => (
            <div key={item} className="grid grid-cols-[56px_1fr] items-center gap-4 pack-surface border px-5 py-4" style={{ ...fitType('body', item.length), background: theme.paper, borderColor: `${theme.accent}66` }}>
              <div className="flex h-11 w-11 items-center justify-center" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>{index + 1}</div>
              <div><MathText>{item}</MathText></div>
            </div>
          ))}
        </div>
      )
    default:
      return <div className="mt-8 grid gap-4">{items.map(item => card(item))}</div>
  }
}

function PoemDisplay({ scene }: { scene: LessonScene }) {
  const poemLines = scene.contentSlots.poemLines ?? ''
  const lines = poemLines.split('\n').filter(Boolean)

  return (
    <section className="flex h-full flex-col items-center justify-center px-16 text-center text-[#2c2419]">
      <div className="mb-8 h-[2px] w-28 bg-[#b68044]" />
      <h2 style={fitType('display', (scene.contentSlots.poemTitle ?? '').length)}>{scene.contentSlots.poemTitle}</h2>
      <div className="mt-4 text-[#7b6142]" style={TYPE_SCALE.caption}>{scene.contentSlots.poemAuthor}</div>
      <div className="mt-12 space-y-5">
        {lines.map(line => (
          <p key={line} style={fitType('heading', line.length)}>{line}</p>
        ))}
      </div>
      <div className="mt-10 flex items-center gap-3 text-[#8a6a42]" style={TYPE_SCALE.caption}>
        <span className="h-[1px] w-10 bg-[#c7a979]" />
        <span>{scene.visualFocus}</span>
        <span className="h-[1px] w-10 bg-[#c7a979]" />
      </div>
    </section>
  )
}

function LocalZoom({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  return (
    <section className="grid h-full grid-cols-[1.05fr_0.9fr] gap-8 p-10" style={{ color: theme.ink }}>
      <div className="relative overflow-hidden rounded-[8px] border border-[#d5c29a] bg-[#e8dcc1] shadow-inner">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(185,144,82,0.14)),radial-gradient(circle_at_58%_22%,rgba(245,242,227,0.96),transparent_22%),linear-gradient(180deg,#cfc4ad,#efe3ca_46%,#c6b18c)]" />
        <div className="absolute left-[12%] top-[18%] h-[22%] w-[74%] rounded-full bg-[#fffaf0]/45 blur-[18px]" />
        <div className="absolute bottom-[14%] left-[12%] right-[12%] h-[34%] rounded-[50%] bg-[#d7c4a2]/70" />
        <div className="absolute bottom-[17%] left-[18%] right-[18%] h-[18%] rounded-[50%] bg-[#f5f1e6]/50 blur-[7px]" />
        <div className="absolute left-7 top-7 rounded-full bg-[#4e6f7d]/12 px-4 py-2 text-[#466170]" style={TYPE_SCALE.caption}>
          {scene.contentSlots.mainImage}
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>局部放大</div>
        <div className="mt-4 pack-surface border p-8" style={{ background: theme.paper, borderColor: `${theme.accent}55` }}>
          <div style={fitType('heading', (scene.contentSlots.zoomTarget ?? '').length)}>{scene.contentSlots.zoomTarget}</div>
          <p className="mt-5 opacity-85" style={fitType('body', scene.boardText.join(' · ').length)}>{scene.boardText.join(' · ')}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * 对照技法分派:ai-verify/ai-inquiry/contrast 各有专属母版组。
 */
function ComparisonView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  // v5 M2:ai-verify/ai-inquiry 复用本技法的左右对照骨架,但内容性质不同——
  // ai-verify 一边是待找茬的错误断言,不能和 contrast 幕的正确辨析用同一套视觉,
  // 否则等于把 AI 的错话渲染成权威版式(误导风险);两者都拆专属母版组(./ai-scenes.tsx),显式分派。
  if (scene.sceneType === 'ai-verify') return <AiVerifyView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />
  if (scene.sceneType === 'ai-inquiry') return <AiInquiryView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />
  // contrast 3 母版组(2026-07-22 S3 扩容,./contrast-scenes.tsx),对照双栏原版保留为其 0 号
  return <ContrastView scene={scene} course={course} pres={pres} sceneNumber={sceneNumber} />
}

/** 三联观察:非对称三栏(首栏 1.3fr 领衔,次两栏 0.85fr)+ 页眉幕序号,不再三栏排排坐。 */
function TriptychView({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const surface = cardSurface(theme, pres.pack.surface)
  const panels = [
    { key: 'panelA', color: '#4f5147' },
    { key: 'panelB', color: '#9b8054' },
    { key: 'panelC', color: '#80634a' },
  ]

  return (
    <section className="relative grid h-full gap-0" style={{ gridTemplateColumns: '1.3fr 0.85fr 0.85fr' }}>
      <div className="pointer-events-none absolute left-6 top-6 z-20">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '画面观察'} theme={theme} tone="onDark" />
      </div>
      {panels.map((panel, index) => (
        <div key={panel.key} className="relative overflow-hidden border-r border-[#f3ead7]/35">
          <div
            className="absolute inset-0"
            style={{
              background:
                index === 0
                  ? 'linear-gradient(160deg,#d8d1c1,#7a7769 55%,#403f39)'
                  : index === 1
                    ? 'linear-gradient(160deg,#f0dfb7,#c7a46a 54%,#76613f)'
                    : 'linear-gradient(160deg,#d8b58b,#977359 52%,#4f4036)',
            }}
          />
          <div className="absolute inset-x-[10%] bottom-[12%] p-5" style={{ background: `${theme.paper}e6`, border: surface.border, boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter, color: theme.ink }}>
            <div className="mb-3" style={{ ...TYPE_SCALE.caption, color: panel.color }}>
              0{index + 1}
            </div>
            <div style={fitType('body', (scene.contentSlots[panel.key] ?? '').length)}>{scene.contentSlots[panel.key]}</div>
          </div>
        </div>
      ))}
    </section>
  )
}

function PathTracingView({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const nodes = (scene.contentSlots.path ?? scene.boardText.join(' → ')).split('→').map(item => item.trim())

  return (
    <section className="flex h-full flex-col justify-center px-14" style={{ color: theme.ink }}>
      <div className="mb-10" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>路径追踪</div>
      <div className="relative flex items-center justify-between gap-4">
        <div className="absolute left-[6%] right-[6%] top-1/2 h-[3px] -translate-y-1/2 opacity-35" style={{ background: theme.accent }} />
        {nodes.map((node, index) => (
          <div key={node} className="relative z-10 flex w-[18%] flex-col items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center shadow-[0_14px_36px_rgba(80,50,16,0.16)]" style={{ ...TYPE_SCALE.caption, ...markerCss(pres.marker, theme) }}>
              {index + 1}
            </div>
            <div className="min-h-[92px] text-center" style={TYPE_SCALE.body}>{node}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RefractionSimulation({ scene }: { scene: LessonScene }) {
  return (
    <section className="grid h-full grid-cols-[0.9fr_1.1fr] gap-8 p-10 text-[#1f2933]">
      <div className="flex flex-col justify-center">
        <div className="text-[#326273]" style={TYPE_SCALE.caption}>实验观察</div>
        <h2 className="mt-4" style={fitType('heading', scene.visualFocus.length)}>{scene.visualFocus}</h2>
        <p className="mt-5 text-[#52616b]" style={fitType('body', scene.boardText.join(' · ').length)}>{scene.boardText.join(' · ')}</p>
      </div>
      <RefractionDiagram labels={false} />
    </section>
  )
}

function LabelledDiagram({ scene }: { scene: LessonScene }) {
  return (
    <section className="grid h-full grid-cols-[1.15fr_0.85fr] gap-8 p-10 text-[#1f2933]">
      <RefractionDiagram labels />
      <div className="flex flex-col justify-center gap-4">
        {scene.boardText.map((item, index) => (
          <div key={item} className="rounded-[8px] border border-[#b9c9c8] bg-[#f4fbf8] px-5 py-4" style={fitType('body', item.length)}>
            <span className="mr-3 text-[#326273]" style={TYPE_SCALE.caption}>0{index + 1}</span>
            {item}
          </div>
        ))}
      </div>
    </section>
  )
}

function DraggableModel({ scene }: { scene: LessonScene }) {
  return (
    <section className="grid h-full grid-cols-[1.1fr_0.9fr] gap-8 p-10 text-[#1f2933]">
      <div className="relative rounded-[8px] border border-[#b8ccc8] bg-[#eef7f4] p-8">
        <RefractionDiagram labels />
        <div className="absolute left-[18%] top-[24%] h-8 w-8 rounded-full border-4 border-[#c96f3f] bg-[#fff4e8] shadow-[0_10px_26px_rgba(166,82,38,0.3)]" />
      </div>
      <div className="flex flex-col justify-center">
        <div className="text-[#326273]" style={TYPE_SCALE.caption}>可拖模型</div>
        <h2 className="mt-4" style={fitType('heading', scene.visualFocus.length)}>{scene.visualFocus}</h2>
        <p className="mt-5 text-[#52616b]" style={fitType('body', (scene.interactionContract ?? '').length)}>{scene.interactionContract}</p>
      </div>
    </section>
  )
}

/** 2026-07-22:立绘避让(spritePad)+ 色板走 pack token——真检截图实证立绘遮
 * 步骤卡文字、暗场包里硬编码奶油卡违反「颜色全走 pack 三轴 token」铁律,同修。 */
function StepReplay({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  const steps = (scene.contentSlots.steps ?? scene.contentSlots.path ?? scene.boardText.join(' → '))
    .split('→')
    .map(item => item.trim())
    .filter(Boolean)

  return (
    <section className={`flex h-full flex-col justify-center px-14 pb-[8%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="mb-8" style={{ ...TYPE_SCALE.caption, color: theme.accent }}>步骤回放</div>
      <div className="grid gap-4">
        {steps.map((step, index) => (
          <div key={step} className="grid grid-cols-[72px_1fr] items-center gap-5 border px-6 py-5" style={{ background: theme.paper, borderColor: `${theme.accent}66`, borderRadius: surface.borderRadius, boxShadow: surface.boxShadow }}>
            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper }}>
              {index + 1}
            </div>
            <div style={fitType('heading', step.length)}><MathText>{step}</MathText></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RefractionDiagram({ labels }: { labels: boolean }) {
  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-[8px] border border-[#a9c3c5] bg-[#f7fbf7]">
      <div className="absolute inset-x-0 top-0 h-1/2 bg-[#eef7f4]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#b8d8e0]/55" />
      <div className="absolute left-[12%] right-[12%] top-1/2 h-[3px] bg-[#34515e]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 640 420" aria-hidden="true">
        <line x1="320" y1="48" x2="320" y2="372" stroke="#6c838a" strokeDasharray="10 10" strokeWidth="3" />
        <line x1="140" y1="60" x2="320" y2="210" stroke="#d06738" strokeWidth="8" strokeLinecap="round" />
        <line x1="320" y1="210" x2="430" y2="358" stroke="#d06738" strokeWidth="8" strokeLinecap="round" />
        <circle cx="320" cy="210" r="10" fill="#2f4f4b" />
      </svg>
      {labels && (
        <>
          <DiagramLabel className="left-[18%] top-[18%]" text="入射光线" />
          <DiagramLabel className="right-[20%] bottom-[15%]" text="折射光线" />
          <DiagramLabel className="left-[51%] top-[18%]" text="法线" />
          <DiagramLabel className="left-[8%] top-[46%]" text="空气" />
          <DiagramLabel className="left-[8%] top-[57%]" text="水" />
        </>
      )}
    </div>
  )
}

function DiagramLabel({ className, text }: { className: string; text: string }) {
  return (
    <div className={`absolute rounded-full border border-[#8fb0b3] bg-white/90 px-4 py-2 text-[#25434b] ${className}`} style={TYPE_SCALE.caption}>
      {text}
    </div>
  )
}

export {
  ComparisonView,
  DraggableModel,
  LabelledDiagram,
  LocalZoom,
  PathTracingView,
  PoemDisplay,
  RefractionSimulation,
  StaticBoard,
  StepReplay,
  TriptychView,
}

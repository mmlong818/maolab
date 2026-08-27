'use client'

import type { LessonScene, ScenePresentation } from '@/lib/mainline'
import { sceneCoreContentEntries } from '@/lib/mainline/presentation/scene-content-contract'
import { coreVisualLayout } from '@/lib/mainline/presentation/content-aware-layout'
import { toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { MathText } from './shared'

/**
 * 专业图表是课程核心内容的补充证据，不能取代幕型已经确认的题面、结论或任务。
 * 这个组合框把两者固定在同一页中；所有专业图表统一经过这里，不再各自抢占整页。
 */
export function CoreWithSpecializedVisual({
  scene,
  pres,
  children,
}: {
  scene: LessonScene
  pres: ScenePresentation
  children: React.ReactNode
}) {
  const entries = sceneCoreContentEntries(scene)
  if (entries.length === 0) return children

  const theme = pres.palette
  const isWorkedExample = scene.sceneType === 'worked-example'
  const workedExampleSteps = isWorkedExample
    ? splitWorkedExampleSteps(entries.find(entry => entry.key === 'steps')?.value ?? '', scene.boardText)
    : []
  const contentBlocks = workedExampleSteps.length > 0 ? workedExampleSteps : entries.map(entry => entry.value)
  const contentLayout = coreVisualLayout(contentBlocks)
  const denseContent = contentLayout.mode === 'text-heavy'
  return (
    <section
      className="grid h-full w-full overflow-hidden"
      data-content-balance={contentLayout.mode}
      style={{ background: theme.paper, color: theme.ink, gridTemplateColumns: contentLayout.columns }}
    >
      <aside className={`scene-safe-bottom flex min-w-0 flex-col justify-center border-r px-[6%] pt-[6%] ${denseContent ? 'gap-4' : 'gap-6'}`} style={{ borderColor: toRgba(theme.ink, 0.12), background: theme.backdrop[1] }}>
        <div>
          <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{isWorkedExample ? '解题过程' : '本页要点'}</div>
          <h2 className="mt-2" style={{ ...fitType('heading', scene.visualFocus.length), color: theme.ink }}>
            <MathText>{scene.visualFocus}</MathText>
          </h2>
        </div>
        {isWorkedExample && workedExampleSteps.length > 0 ? (
          <ol className={`grid ${denseContent ? 'gap-2' : 'gap-4'}`}>
            {workedExampleSteps.map((step, index) => (
              <li key={`${index}-${step}`} className={`grid grid-cols-[32px_1fr] gap-3 border-t ${denseContent ? 'pt-3' : 'pt-4'}`} style={{ borderColor: toRgba(theme.ink, 0.12) }}>
                <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>{String(index + 1).padStart(2, '0')}</span>
                <div style={{ ...fitType('body', step.length), color: theme.ink }}><MathText>{step}</MathText></div>
              </li>
            ))}
          </ol>
        ) : entries.map((entry, index) => {
          const value = entry.value
          return (
            <div key={`${entry.key}-${index}`} className={index === 0 ? '' : 'border-t pt-5'} style={{ borderColor: toRgba(theme.ink, 0.12) }}>
              <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.56) }}>{entry.label}</div>
              <div
                className="mt-2 min-w-0"
                data-layout-rule="core-content-wrap"
                style={{ ...fitType(index === 0 ? 'heading' : 'body', value.length), overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              >
                <MathText>{value}</MathText>
              </div>
            </div>
          )
        })}
      </aside>
      {/* 右栏可视区与左栏同样给底部字幕带让位——受力图/图形垂直居中占满全高时,
          底部箭头与标签会落进字幕带被压住(定档:底部字幕带是唯一预留区,内容让位)。 */}
      <div className="scene-safe-bottom min-w-0 overflow-hidden">{children}</div>
    </section>
  )
}

/** 例题的完整示范通常以“第一步…；第二步…”存储；揭晓态必须拆成可逐条核对的文字。 */
function splitWorkedExampleSteps(value: string, boardText: readonly string[]): string[] {
  const hasFourConditions = boardText.some(line => /同体.*等大.*反向.*共线/.test(line))
  return value
    .split(/；|;|\n/)
    .map(step => step.trim().replace(/^第[一二三四五六七八九十]步(?:[：:，,])?/, ''))
    .map(step => hasFourConditions && /验证四条件/.test(step) && !/同体/.test(step)
      ? `${step.replace(/[。.]?$/, '')}：作用在同一物体上、大小相等、方向相反且在同一直线上，因此拉力和摩擦力是一对平衡力。`
      : step)
    .filter(Boolean)
}

'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { spriteSideOf } from '@/lib/mainline'
import { pickMasterRouted } from '@/lib/mainline/presentation/master-routing'
import { toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { cardSurface, SceneBadge, spritePad, titlebarSurface } from './shared'

/**
 * ai-collab · AI 协作任务幕 2 母版(S3 扩容第二批,2026-07-22)
 *
 * v5 M2 三大 AI 素养幕型的最后一个专属视图缺口——此前 ai-collab 无任何专属
 * 渲染,靠 static-board 类技法兜底,task/rubric 槽位挤在通用板书卡里。
 * 语义(fill-scenes SCENE_ROLES):评的是提示词质量与验证过程,不是答案对错
 * ——量规必须与任务卡同屏等权,否则「过程评价」退化成一句口号。
 *
 * ①任务卡纵列式:中央任务卡(accent 题头)+ 量规逐条横列(编号椭章),
 *   对应 scene-insert 默认 visualLayout 'central-task-card'
 * ②契约双栏式:任务大字居左 58% 无卡包裹,右 42% 量规做「验收清单」竖栏
 *   (勾选框语言)——像一份贴在桌角的协作契约
 */
export function AiCollabView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const master = pickMasterRouted(course, scene, 'ai-collab')
  if (master === 1) return <AiCollabContractMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  return <AiCollabTaskCardMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
}

function rubricItemsOf(scene: LessonScene): string[] {
  const raw = scene.contentSlots.rubric ?? ''
  const items = raw.split(/；|;|\n|。/).map(item => item.trim()).filter(Boolean)
  return items.length > 0 ? items : [raw]
}

/** 母版①任务卡纵列式:任务是主角(accent 题头卡居中),量规逐条横列在下。 */
function AiCollabTaskCardMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  const titlebar = titlebarSurface(theme)
  const task = scene.contentSlots.task ?? scene.visualFocus
  const rubric = rubricItemsOf(scene)
  return (
    <section className={`flex h-full flex-col justify-center gap-8 px-[9%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? 'AI 协作'} theme={theme} />
      <div className="overflow-hidden" style={{ boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, backdropFilter: surface.backdropFilter }}>
        <div className="flex items-center gap-3 px-8 py-3" style={titlebar}>
          <span style={TYPE_SCALE.caption}>和 AI 一起完成</span>
        </div>
        <div className="px-8 py-7" style={{ background: theme.paper }}>
          <p style={fitType('heading', task.length)}>{task}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>评价量规 · 评的是过程,不是答案</div>
        <div className="grid grid-cols-2 gap-4">
          {rubric.map((item, index) => (
            <div key={item} className="flex items-start gap-4 border px-6 py-4" style={{ background: toRgba(theme.paper, 0.9), borderColor: `${theme.accent}55`, borderRadius: surface.borderRadius }}>
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper }}>{index + 1}</span>
              <span style={fitType('body', item.length)}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** 母版②契约双栏式:任务大字居左无卡,右侧「验收清单」竖栏用勾选框语言。 */
function AiCollabContractMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const task = scene.contentSlots.task ?? scene.visualFocus
  const rubric = rubricItemsOf(scene)
  return (
    <section className={`flex h-full items-center px-[8%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <div className="flex w-[58%] flex-col gap-6 pr-12">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? 'AI 协作'} theme={theme} />
        <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>和 AI 一起完成</div>
        <p style={fitType('heading', task.length)}>{task}</p>
      </div>
      <div className="flex h-[70%] w-[42%] flex-col gap-5 border-l pl-10" style={{ borderColor: toRgba(theme.ink, 0.24) }}>
        <div style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.66) }}>验收清单 · 过程重于答案</div>
        {rubric.map(item => (
          <div key={item} className="flex items-start gap-3">
            <span aria-hidden className="mt-1.5 h-5 w-5 shrink-0 border-2" style={{ borderColor: theme.accent, borderRadius: '4px' }} />
            <span style={fitType('body', item.length)}>{item}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

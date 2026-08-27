'use client'

import { DEFAULT_CHROME, type CastProfile, type ChromeColors, type DialogueLayout, type LessonScene } from '@/lib/mainline'
import { TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import MathText from '../MathOrText'

interface DialogueLayerProps {
  scene: LessonScene
  castProfiles: CastProfile[]
  /** 备课预览可保留已配置立绘，但不显示会泄露讲稿或答案的对白。 */
  display?: 'full' | 'portrait-only'
  /**
   * 对白框/旁白框/名牌配色,从当前课程风格包 palette 派生(见 presentation/chrome.ts)。
   * 可选:workbench/PreviewStage.tsx 等只读预览场景不接课程级 chrome 状态,缺省落回
   * DEFAULT_CHROME(视觉等同重构前的硬编码暖色)。
   */
  chrome?: ChromeColors
}

/**
 * 底部字幕带（旁白框/对白框）是否会真实渲染——与下方 DialogueLayer 的分支一一对应。
 * StageCanvas 用它决定揭晓动作 chip 是否需要抬离字幕带锚点（两者共用
 * --scene-dialogue-bottom 安全线，带在场时 chip 原位必然被压出幽灵文字）。
 */
export function dialogueBandVisible(
  scene: LessonScene,
  castProfiles: CastProfile[],
  display: 'full' | 'portrait-only' = 'full',
): boolean {
  const layout = scene.dialogueLayout
  if (layout === 'no-character') return false
  if (display !== 'full') return false
  if (layout === 'narration-only') return true
  return castProfiles.some(item => item.id === scene.characterLayer.castId)
}

export function DialogueLayer({ scene, castProfiles, chrome = DEFAULT_CHROME, display = 'full' }: DialogueLayerProps) {
  const layout = scene.dialogueLayout
  const cast = castProfiles.find(item => item.id === scene.characterLayer.castId)

  if (layout === 'no-character') return null

  if (layout === 'narration-only') {
    if (display === 'portrait-only') return null
    return (
      <div
        className="absolute inset-x-[20%] z-30 max-h-[194px] overflow-hidden rounded-[8px] border px-5 py-2.5 shadow-[0_18px_60px_rgba(34,24,12,0.22)]"
        style={{ bottom: 'var(--scene-dialogue-bottom, 9%)', borderColor: chrome.dialogueBorder, background: chrome.dialogueBg, color: chrome.dialogueText }}
      >
        {/* 讲稿偶发混入行内 LaTeX(有闸门 warning 但不拦):字幕带用 MathText 兜底渲染,不露源码 */}
        <p style={TYPE_SCALE.body}><span className="mr-3" style={{ ...TYPE_SCALE.caption, color: chrome.dialogueLabelText }}>旁白</span><MathText>{scriptPreview(scene)}</MathText></p>
      </div>
    )
  }

  if (!cast) return null

  const asset = cast.assetRefs?.find(item => item.expression === scene.characterLayer.expression) ?? cast.assetRefs?.[0]

  // 立绘和对白框都是临时浮层,直接压在满幅教学内容上(遮挡但不全程)。
  // 模仿 galgame:立绘在后(z-30),对白框在前(z-40)压住立绘下半身;框宽 60%
  // 屏宽、起点靠向立绘一侧,框内只剩对白文本,上下留白压到最小。
  // 人名贴纸锚定在框上沿(和框同容器,随框高自适应),向下搭进框 10% 自身高度。
  // 贴纸负偏移挂在框角外:框缘从人名第 2 字处起,首字悬出框外;
  // 斜角朝立绘一侧倾,右立绘时镜像
  const stickerSide = layout === 'student-right-content-left'
    ? '-right-9 rotate-[4deg]'
    : '-left-9 rotate-[-4deg]'
  return (
    <>
      {asset && (
        <img
          src={asset.src}
          alt={cast.displayName}
          className={`absolute bottom-0 z-30 object-contain object-bottom drop-shadow-[0_28px_60px_rgba(38,24,10,0.35)] ${SPRITE_POSITION[layout]}`}
        />
      )}
      {display === 'full' && <div className={`absolute z-40 ${SUBTITLE_POSITION[layout]}`} style={{ bottom: 'var(--scene-dialogue-bottom, 9%)' }}>
        <div
          className="max-h-[194px] overflow-hidden rounded-[8px] border px-5 py-2.5 shadow-[0_18px_60px_rgba(34,24,12,0.22)]"
          style={{ borderColor: chrome.dialogueBorder, background: chrome.dialogueBg, color: chrome.dialogueText }}
        >
          <p style={TYPE_SCALE.body}><MathText>{dialogueCopy(scene, cast)}</MathText></p>
        </div>
        <div
          className={`absolute bottom-full translate-y-[10%] rounded-[8px] px-4 py-1.5 shadow-[0_8px_24px_rgba(40,26,10,0.3)] ${stickerSide}`}
          style={{ ...TYPE_SCALE.body, background: chrome.nameplateBg, color: chrome.nameplateText }}
        >
          {cast.displayName}
        </div>
      </div>}
    </>
  )
}

// corner-avatar 名副其实:contrast/ai-verify/practice/recap 用它保留中央内容,立绘应是
// 角落小像而非大立绘。2026-07-22 用户复核「立绘出现过多/遮挡」——从 max-h-64%(≈691px)
// 收到 42%(≈454px),贴左下角,不再侵入中央对照区(与 max-h 历史 78%→64% 同向继续收)。
const SPRITE_POSITION: Record<DialogueLayout, string> = {
  'teacher-left-content-right': 'left-0 w-[26%] max-h-[70%]',
  'student-right-content-left': 'right-0 w-auto max-h-[64%]',
  'dual-characters-center-content': 'left-0 w-[21%] max-h-[70%]',
  'corner-avatar': 'left-0 w-auto max-h-[42%]',
  'bottom-rpg': 'left-0 w-auto max-h-[42%]',
  'narration-only': '',
  'no-character': '',
}

const SUBTITLE_POSITION: Record<DialogueLayout, string> = {
  'teacher-left-content-right': 'left-[7%] w-[57%]',
  'student-right-content-left': 'right-[7%] w-[57%]',
  'dual-characters-center-content': 'left-[7%] w-[57%]',
  'corner-avatar': 'left-[7%] w-[57%]',
  'bottom-rpg': 'left-[7%] w-[57%]',
  'narration-only': '',
  'no-character': '',
}

export function dialogueCopy(scene: LessonScene, cast: CastProfile): string {
  if (cast.role === 'student' && scene.peerFunction === 'misconception' && scene.contentSlots.misconception) {
    return scene.contentSlots.misconception
  }
  if (cast.role === 'student' && scene.peerFunction === 'questioner') {
    return scene.contentSlots.misconception ?? scene.studentAction
  }
  if (cast.role === 'student') {
    return scene.studentAction
  }
  return scriptPreview(scene)
}

function scriptPreview(scene: LessonScene): string {
  const sentences = scene.teacherScript
    .match(/[^。！？]+[。！？]?/gu)
    ?.map(item => item.trim())
    .filter(Boolean) ?? []

  return sentences.slice(0, 2).join('') || scene.teacherScript
}

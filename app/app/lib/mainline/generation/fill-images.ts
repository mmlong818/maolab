/**
 * fill-images · P2-3 图像层
 *
 * 为需要图示的 sceneType(visual-observation / contrast / recap)生成配图,
 * 写入 scene.imageUrl。用于覆盖 fill-scenes 后仍是纯文字的教学画面。
 *
 * 生成策略:
 * - 图 API 用 `generateImage`(app/lib/v2/image-gen.ts):OpenAI gpt-image-2 优先,
 *   失败回退 Pollinations Flux。图落到 public/generated-images/,返回 URL。
 * - Prompt 直接从 scene 的语义(sceneType 教学动作 + contentSlots 内容 + KP)
 *   拼装,不再调 LLM 生 prompt。第一版求稳。
 * - 3 张图并行调用,总耗时 ~30 秒(串行 60+ 秒)。
 *
 * `llmImage` 可注入,便于测试 mock 不真调 API。
 */

import { IMAGE_SCENE_TYPES, type ImageFidelity, type LessonScene, type MainlineCourse } from '../domain.js'
import { imageDirectives } from './image-fidelity.js'
import { imageSlotFor } from '../presentation/composition.js'
import { hexToOklch } from '../presentation/color.js'
import { presentationFor } from '../presentation/presentation.js'
import { generateImage } from '../../v2/image-gen.js'

/** size 为 `WxH`(均 16 倍数,宽高比 ≤3:1),由版式槽位(imageSlotFor)算出。 */
export interface ImageCallOpts { prompt: string; size?: string }
export type ImageCall = (opts: ImageCallOpts) => Promise<string>

const defaultImageCall: ImageCall = ({ prompt, size }) => {
  const m = /^(\d+)x(\d+)$/.exec(size ?? '')
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1536, 1024]
  return generateImage(prompt, { size: size ?? '1536x1024', fallbackWidth: w, fallbackHeight: h })
}

/** 配图幕型白名单收编到 domain.IMAGE_SCENE_TYPES(单一事实源)。 */
const NEEDS_IMAGE = IMAGE_SCENE_TYPES

function buildPrompt(course: MainlineCourse, scene: LessonScene): string {
  const kp = course.sourceMaterial.map(s => s.title).join('、')
  const subject = course.subject
  const grade = course.gradeBand
  const focus = scene.visualFocus

  // 【硬约束】图不再承载完整教学句子;板书文字由 UI 层独立渲染,与图互补而非重复。
  const HARD_TEXT_RULE = [
    'CRITICAL TEXT RULE (do NOT violate):',
    '- DO NOT render any full sentence, board-text list, learning-path caption, or teaching paragraph inside the image.',
    '- DO NOT include phrases like "第一步"/"第二步"/"结论"/"学习路径回放"/"本课主线" or their equivalents as visible text.',
    '- The image is a visual illustration only. Text on canvas is limited to VERY SHORT single-token labels (1-3 Chinese chars or a symbol like "34个" / "陕" / "晋" / "23省").',
    '- Prefer icons, spatial diagrams, colored regions, arrows, or a single hero object over any text.',
    '- Board text and narration are shown separately by the UI — do not duplicate them here.',
  ].join('\n')

  // 【硬约束】画面必须占满整个画布——字幕带避让由版式层负责(有字幕时图只占
  // 字幕带以上区域),图内不再自留空,否则出现"图下方大片留白"的双重避让。
  const SAFE_ZONE_RULE = [
    'FULL-BLEED COMPOSITION (do NOT violate):',
    '- The illustration must fill the ENTIRE canvas edge to edge — no empty reserved band at the bottom, no large blank margins.',
    '- Compose subjects generously across the full height; background may breathe but must stay illustrated (sky, terrain, texture), never a flat empty strip.',
    '- Keep the most critical detail at least 6% away from every edge so mild cropping never destroys meaning.',
  ].join('\n')

  // 「教学图 vs 氛围图」的定性交给保真档(image-fidelity),这里只留通用排版底线。
  const STYLE_BASE = [
    'Style: clean pedagogical illustration, restrained tasteful palette,',
    'generous whitespace, no busy background, no dense text blocks, no legible full sentences,',
    'no numbered step lists as text, no summary card overlays.',
  ].join(' ')

  if (scene.sceneType === 'visual-observation') {
    // 观察幕已改 PPT 幻灯片版式(VisualObservationSlide):图是"居中收纳的辅助插图",
    // 不再满幅出血、不再自带三段分栏色块(分段文字由下方栏目卡承担)。故不用 SAFE_ZONE
    // (满幅出血)规则,改用"单幅连贯 + 近白统一底"规则,让图干净地坐在白色幻灯片里。
    const SLIDE_IMAGE_RULE = [
      'COMPOSITION (do NOT violate):',
      '- Compose as ONE single cohesive horizontal illustration that reads left-to-right as an integrated scene or continuous process/cross-section, NOT divided into separate bordered or colour-blocked panels — no internal frames, dividers, or per-section background colours.',
      '- This is a SUPPORTING illustration inside a slide that already has a title and caption cards elsewhere; do NOT bake in section titles, layered labels, numbered captions, icon-badges, or a legend.',
      '- Light, airy, near-white (or very softly tinted) unified background so the illustration sits cleanly on a bright white slide; one cohesive palette across the whole image; no saturated full-bleed colour blocks.',
      '- Keep the most critical detail at least 6% away from every edge so mild cropping never destroys meaning.',
    ].join('\n')
    return [
      `Educational illustration for a ${grade} ${subject} class teaching "${kp}".`,
      `Visual focus: ${focus}.`,
      SLIDE_IMAGE_RULE,
      HARD_TEXT_RULE,
      STYLE_BASE,
    ].join('\n')
  }
  if (scene.sceneType === 'contrast') {
    return [
      `Educational side-by-side comparison illustration for a ${grade} ${subject} class teaching "${kp}".`,
      `Visual focus: ${focus}.`,
      `Two panels with a subtle vertical divider. LEFT: illustrate the misconception visually (a wrong-looking diagram, crossed-out symbol, etc). RIGHT: illustrate the correct understanding.`,
      `Use color/shape/spatial contrast, NOT text explanations, to convey the difference.`,
      HARD_TEXT_RULE,
      SAFE_ZONE_RULE,
      STYLE_BASE,
    ].join('\n')
  }
  // recap:图是"这门课的核心视觉隐喻",不是路径卡片
  return [
    `Educational hero illustration for a ${grade} ${subject} class recapping "${kp}".`,
    `Visual focus: ${focus}.`,
    `Show ONE strong central metaphor image that captures the whole lesson's core object/relationship visually (not a numbered step list, not a flowchart-with-text).`,
    `If a path/flow feels natural, use 3-4 icons connected by simple arrows — but NO numbered step captions and NO conclusion card.`,
    HARD_TEXT_RULE,
    SAFE_ZONE_RULE,
    STYLE_BASE,
  ].join('\n')
}

export interface FillImagesResult {
  course: MainlineCourse
  filledSceneIds: string[]
  failedSceneIds: string[]
}

export async function fillImages(
  course: MainlineCourse,
  opts?: { imageCall?: ImageCall; force?: boolean },
): Promise<FillImagesResult> {
  const imageCall = opts?.imageCall ?? defaultImageCall
  const force = opts?.force ?? false

  const targets = course.scenes.filter(s =>
    NEEDS_IMAGE.includes(s.sceneType) && (force || !s.imageUrl),
  )

  const filledSceneIds: string[] = []
  const failedSceneIds: string[] = []

  // 并行调 3 张(gpt-image-2 一般允许);失败的单张不影响其他。
  // 尺寸随版式:渲染端会给这幕选什么版式是确定性的(compositionFor 纯函数),
  // 生成前先算出来——贴边侧栏形态出方图,满幅/信箱形态出宽图。
  const results = await Promise.all(
    targets.map(async scene => {
      const pres = presentationFor({ ...scene, imageUrl: '/pending' }, course)
      // 尺寸按版式槽位精确定制(cover 满幅/band 上带/anchor 方图/letterbox 3:2)
      const slot = imageSlotFor(pres.composition)
      const ratio = slot.width / slot.height
      const sizeHint = ratio <= 1.1
        ? '\nCANVAS: square 1:1 composition — center the subject, no wide panorama.'
        : ratio >= 2.5
          ? '\nCANVAS: ultra-wide banner strip — compose as a horizontal panorama, spread subjects along the width, no single tall vertical subject.'
          : ''
      // 保真档(学段×学科×幕型):准确图示 / 风格化教学图 / 氛围配图,定档结果落库留痕
      const { fidelity, block } = imageDirectives(course, scene)
      // 深色包(引进档/生成档深 mood 皆算)插图本身仍按高饱和默认风格生成,和克制的
      // 深底舞台打架、对比过于强烈(真检 induction-02)——追加一句低饱和约束,
      // 用当前幕的实际调色板判断深浅(而非只查包的静态 isLight),moodArc 幕级
      // 明暗漂移也一并覆盖到。
      const isDarkPack = hexToOklch(pres.palette.paper).l < hexToOklch(pres.palette.ink).l
      const darkStyleNote = isDarkPack
        ? '\nStyle refinement: restrained low-saturation palette, muted tones harmonized with dark backdrop.'
        : ''
      const prompt = buildPrompt(course, scene) + '\n' + block + pres.pack.imageDNA + darkStyleNote + sizeHint
      try {
        const url = await imageCall({ prompt, size: `${slot.width}x${slot.height}` })
        return { sceneId: scene.id, url, prompt, fidelity, aspect: `${slot.width}:${slot.height}`, ok: true as const }
      } catch (err) {
        return { sceneId: scene.id, error: String(err), ok: false as const }
      }
    }),
  )

  const urlById = new Map<string, { url: string; prompt: string; fidelity: ImageFidelity; aspect: string }>()
  for (const r of results) {
    if (r.ok) {
      urlById.set(r.sceneId, { url: r.url, prompt: r.prompt, fidelity: r.fidelity, aspect: r.aspect })
      filledSceneIds.push(r.sceneId)
    } else {
      failedSceneIds.push(r.sceneId)
    }
  }

  const nextScenes = course.scenes.map(scene => {
    const filled = urlById.get(scene.id)
    if (!filled) return scene
    return { ...scene, imageUrl: filled.url, imagePrompt: filled.prompt, imageFidelity: filled.fidelity, imageAspect: filled.aspect }
  })

  return {
    course: { ...course, scenes: nextScenes },
    filledSceneIds,
    failedSceneIds,
  }
}

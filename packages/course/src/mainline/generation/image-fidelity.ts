/**
 * image-fidelity · 配图保真策略
 *
 * 不同学段对配图的诉求本质不同:低龄段要的是情绪锚点(氛围配图),
 * 高学段要的是经得起学科推敲的图示(准确图示)。把 gradeBand 当一个词
 * 写进 prompt 不构成约束——这里用显式矩阵(学段 × 学科 × 幕型)定档,
 * fill-images 生成期落到 scene.imageFidelity 留痕,禁止生成/渲染端各自猜。
 *
 * 与风格包正交:imageDNA 管美学签名(水墨/蓝图/童话),保真档管事实约束——
 * 准确档明确"风格可以润色质感,不许弯曲事实"。
 */

import type { GradeBand, ImageFidelity, LessonScene, MainlineCourse, SceneType, SubjectId } from '../domain.js'

/** 事实精度敏感学科:图内数量/比例/空间/年代关系画错就是教学事故。 */
const PRECISION_SUBJECTS: readonly SubjectId[] = ['math', 'science', 'physics', 'chemistry', 'biology', 'geography', 'history']

type SubjectCluster = 'precision' | 'expressive'
type ImageSceneType = Extract<SceneType, 'visual-observation' | 'contrast' | 'recap'>

/**
 * 定档矩阵——唯一事实源,按学段逐行显式列出(允许行间重复,便于将来单独调档)。
 * 结构规则:
 * - contrast(辨析)全线不低于 stylized-teaching:对错关系必须视觉可辨,氛围图讲不了辨析
 * - recap(收束隐喻)全线不高于 stylized-teaching:隐喻幕强行"准确"是自相矛盾
 * - diagram-accurate 从初中精度学科起步:小学阶段对象保真即可,呈现保留童趣
 */
const FIDELITY_MATRIX: Record<GradeBand, Record<SubjectCluster, Record<ImageSceneType, ImageFidelity>>> = {
  'lower-primary': {
    precision: { 'visual-observation': 'stylized-teaching', contrast: 'stylized-teaching', recap: 'atmosphere' },
    expressive: { 'visual-observation': 'atmosphere', contrast: 'stylized-teaching', recap: 'atmosphere' },
  },
  'upper-primary': {
    precision: { 'visual-observation': 'stylized-teaching', contrast: 'stylized-teaching', recap: 'atmosphere' },
    expressive: { 'visual-observation': 'atmosphere', contrast: 'stylized-teaching', recap: 'atmosphere' },
  },
  'middle-school': {
    precision: { 'visual-observation': 'diagram-accurate', contrast: 'diagram-accurate', recap: 'stylized-teaching' },
    expressive: { 'visual-observation': 'stylized-teaching', contrast: 'stylized-teaching', recap: 'atmosphere' },
  },
  'high-school': {
    precision: { 'visual-observation': 'diagram-accurate', contrast: 'diagram-accurate', recap: 'stylized-teaching' },
    expressive: { 'visual-observation': 'stylized-teaching', contrast: 'stylized-teaching', recap: 'atmosphere' },
  },
}

const FIDELITY_BLOCKS: Record<ImageFidelity, string> = {
  'diagram-accurate': [
    'FACTUAL FIDELITY — this is a precise teaching diagram (highest priority):',
    '- Every depicted count, proportion, spatial or temporal relation must be factually correct for the topic; the drawing must survive a subject teacher\'s scrutiny.',
    '- Do NOT invent extra objects, add decorations that read as content, or apply cute/exaggerated distortion to the teaching object.',
    '- The signature style may flavor texture and palette, but must NEVER bend shapes, scales, positions or quantities of the teaching object.',
  ].join('\n'),
  'stylized-teaching': [
    'TEACHING-OBJECT FIDELITY — stylized but trustworthy:',
    '- The core teaching object must stay recognizable and factually plausible: correct counts, relative sizes and orientation.',
    '- Everything around the core object may be freely stylized; simplification is welcome, distortion of the core relation is not.',
  ].join('\n'),
  atmosphere: [
    'MOOD ILLUSTRATION — this is companion art, NOT a diagram:',
    '- Its job is warmth, wonder and one clear emotional anchor; do not attempt precise data, measurements or labeled figures.',
    '- Avoid anything that looks like a chart, plotted diagram or annotated figure — it could be misread as factual content.',
  ].join('\n'),
}

/** 学段视觉语言:管元素密度与成熟度,不管配色(配色归风格包 imageDNA)。 */
const AUDIENCE_BLOCKS: Record<GradeBand, string> = {
  'lower-primary': 'AUDIENCE: 6-8 year olds — one big friendly subject, rounded simple shapes, very few elements (3-5 max), zero visual clutter.',
  'upper-primary': 'AUDIENCE: 9-11 year olds — playful but composed, one clear focal object with 1-2 supporting elements, light visual wit welcome.',
  'middle-school': 'AUDIENCE: 12-14 year olds — clean and structured, moderate detail density, no childish cuteness; respect the viewer\'s intelligence.',
  'high-school': 'AUDIENCE: 15-18 year olds — restrained, mature, near-editorial visual language; precision and composition over playfulness.',
}

function clusterOf(subject: SubjectId): SubjectCluster {
  return PRECISION_SUBJECTS.includes(subject) ? 'precision' : 'expressive'
}

/** 按学段×学科×幕型给配图定保真档;非配图幕型不应调用(返回托底 stylized-teaching)。 */
export function imageFidelityFor(course: MainlineCourse, scene: LessonScene): ImageFidelity {
  const row = FIDELITY_MATRIX[course.gradeBand]?.[clusterOf(course.subject)]
  return row?.[scene.sceneType as ImageSceneType] ?? 'stylized-teaching'
}

/** 生成 prompt 用的保真+学段视觉语言约束块,并回传定档结果供落库留痕。 */
export function imageDirectives(course: MainlineCourse, scene: LessonScene): { fidelity: ImageFidelity; block: string } {
  const fidelity = imageFidelityFor(course, scene)
  return { fidelity, block: `${FIDELITY_BLOCKS[fidelity]}\n${AUDIENCE_BLOCKS[course.gradeBand]}` }
}

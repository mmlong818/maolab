export type FeatureZone = 'core' | 'supporting' | 'experimental' | 'isolated' | 'legacy-readonly'

export interface FeatureZoneEntry {
  id: string
  label: string
  zone: FeatureZone
  ownerLayer: 'domain' | 'generation' | 'quality' | 'runtime' | 'presentation' | 'adapters' | 'docs'
  restartAction: string
  reason: string
  oldEntryPoints?: readonly string[]
}

export const FEATURE_ZONE_ENTRIES = [
  {
    id: 'textbook-kp',
    label: '教材 / KP',
    zone: 'core',
    ownerLayer: 'domain',
    restartAction: '接入 MainlineCourse.sourceMaterial 与 LessonGoal',
    reason: '定义内容来源和知识边界。',
    oldEntryPoints: ['app/app/lib/v2/extract-kps.ts', 'app/app/api/v2/textbook-kps/[treeId]/route.ts'],
  },
  {
    id: 'teaching-skeleton',
    label: 'TeachingSkeleton',
    zone: 'core',
    ownerLayer: 'generation',
    restartAction: '作为新生成管线必经层',
    reason: '稳定课程结构，避免 LLM 自由编排。',
    oldEntryPoints: ['app/app/lib/v2/teaching-skeletons.ts'],
  },
  {
    id: 'scene-stage',
    label: 'Scene / StageCanvas',
    zone: 'core',
    ownerLayer: 'presentation',
    restartAction: '新建 1920x1080 教学舞台',
    reason: '统一正式上课体验。',
  },
  {
    id: 'quality-gates',
    label: '六类质量闸门',
    zone: 'core',
    ownerLayer: 'quality',
    restartAction: '重建为阻断式检查',
    reason: '让问题定位到骨架、场景、讲稿、资产、角色或渲染层。',
    oldEntryPoints: ['app/app/lib/v2/fragment-quality.ts'],
  },
  {
    id: 'prep-workbench',
    label: '备课工作台',
    zone: 'core',
    ownerLayer: 'runtime',
    restartAction: '收拢旧审批入口',
    reason: '老师审目标、骨架、脚本、画面和质量问题。',
  },
  {
    id: 'lecture-stage',
    label: '上课模式',
    zone: 'core',
    ownerLayer: 'runtime',
    restartAction: '统一 LectureMode 与 beat 播放能力',
    reason: '唯一正式播放体验。',
    oldEntryPoints: ['app/app/(classroom)/v2/[courseId]/LectureMode.tsx', 'app/app/(classroom)/v2/[courseId]/BeatStage.tsx'],
  },
  {
    id: 'personal-follow-along',
    label: '个人跟课',
    zone: 'core',
    ownerLayer: 'runtime',
    restartAction: '合并 SelfStudyMode 的有用能力',
    reason: '学生一个人使用时仍然需要被教。',
    oldEntryPoints: ['app/app/(classroom)/v2/[courseId]/SelfStudyMode.tsx'],
  },
  {
    id: 'tts',
    label: 'TTS 接入',
    zone: 'supporting',
    ownerLayer: 'runtime',
    restartAction: '绑定 voiceProfiles',
    reason: '支撑老师讲解、角色音色和稳定声音身份。',
    oldEntryPoints: ['app/app/api/tts/route.ts', 'app/app/(classroom)/v2/[courseId]/useTtsAudio.ts'],
  },
  {
    id: 'cast-assets',
    label: '角色资产',
    zone: 'supporting',
    ownerLayer: 'presentation',
    restartAction: '绑定 castProfiles',
    reason: '老师、同学、旁白立绘和表情体系。',
    oldEntryPoints: ['app/public/generated-images/cast/base', 'app/public/generated-images/cast/subject'],
  },
  {
    id: 'pptx-export',
    label: 'PPTX 导出',
    zone: 'supporting',
    ownerLayer: 'presentation',
    restartAction: '只导出通过质量闸门的课程',
    reason: '输出能力，不是主产品体验。',
    oldEntryPoints: ['app/app/api/v2/export-pptx/[courseId]/route.ts'],
  },
  {
    id: 'live-classroom',
    label: 'live 多人实时课堂',
    zone: 'experimental',
    ownerLayer: 'runtime',
    restartAction: '移出主流程',
    reason: '工程复杂，价值未证，容易抢主线。',
    oldEntryPoints: ['app/app/(classroom)/live'],
  },
  {
    id: 'media-remix',
    label: 'media remix',
    zone: 'experimental',
    ownerLayer: 'presentation',
    restartAction: '只允许从通过质量闸门的片段生成',
    reason: '容易把课程变成课后包装。',
    oldEntryPoints: ['app/app/(classroom)/v2/[courseId]/media', 'app/app/api/v2/media-form/[courseId]/route.ts'],
  },
  {
    id: 'legacy-video-export',
    label: '旧整课视频导出',
    zone: 'isolated',
    ownerLayer: 'presentation',
    restartAction: '保持隔离',
    reason: '已证明画面和讲解脱节。',
  },
  {
    id: 'repair-grounding',
    label: '旧 Grounding 修复',
    zone: 'isolated',
    ownerLayer: 'quality',
    restartAction: '禁止进入新主线',
    reason: '曾把老师讲解改成机械模板，造成复读机。',
    oldEntryPoints: ['app/app/api/v2/repair-grounding/[courseId]/route.ts'],
  },
  {
    id: 'rundown',
    label: 'rundown',
    zone: 'legacy-readonly',
    ownerLayer: 'generation',
    restartAction: '迁移为 compile-lesson 参考',
    reason: '旧结构承担过多规则，不再作为新课结构来源。',
    oldEntryPoints: ['app/app/lib/v2/rundown.ts'],
  },
  {
    id: 'atoms-only',
    label: 'atoms-only',
    zone: 'legacy-readonly',
    ownerLayer: 'generation',
    restartAction: '迁移为 fill-scenes 参考',
    reason: '旧 atom 不能继续决定新 Scene 模型。',
    oldEntryPoints: ['app/app/lib/v2/generate-atoms-only.ts', 'app/app/api/v2/atoms-only/[courseId]/route.ts'],
  },
  {
    id: 'present-mode',
    label: 'PresentMode',
    zone: 'legacy-readonly',
    ownerLayer: 'presentation',
    restartAction: '迁移有用舞台能力，不保留平行体验',
    reason: '不应成为正式上课之外的第二套视觉语言。',
    oldEntryPoints: ['app/app/(classroom)/v2/[courseId]/present/PresentMode.tsx'],
  },
] as const satisfies readonly FeatureZoneEntry[]

export function featureZone(id: string): FeatureZone | undefined {
  return FEATURE_ZONE_ENTRIES.find(entry => entry.id === id)?.zone
}

export function featuresByZone(zone: FeatureZone): FeatureZoneEntry[] {
  return FEATURE_ZONE_ENTRIES.filter(entry => entry.zone === zone)
}

export function canEnterMainline(id: string): boolean {
  const zone = featureZone(id)
  return zone === 'core' || zone === 'supporting'
}

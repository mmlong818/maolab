import type { LessonScene, SceneType } from './domain.js'

export interface RuntimeSceneContract {
  syncStrategy: string
  interactionContract: string
  fallbackPresentation: string
}

export type StagedRuntimeSceneType = Extract<SceneType, 'worked-example' | 'practice' | 'contrast' | 'ai-verify'>

export const STAGED_RUNTIME_CONTROLS: Readonly<Record<StagedRuntimeSceneType, {
  revealLabel: string
  revealedLabel: string
}>> = {
  'worked-example': { revealLabel: '想好了，查看步骤', revealedLabel: '示范步骤已展开' },
  practice: { revealLabel: '已作答，查看反馈', revealedLabel: '反馈已展开' },
  contrast: { revealLabel: '已判断，查看修正', revealedLabel: '修正已展开' },
  'ai-verify': { revealLabel: '判断完成，查看核查', revealedLabel: '核查结论已展开' },
}

/**
 * 课堂当前真实支持的呈现与操作能力。生成骨架和质量闸门共用这份事实源，
 * 避免把计划中的滑块、逐步回放或自动高亮写成已经可用的课堂功能。
 */
const RUNTIME_SCENE_CONTRACTS: Readonly<Record<SceneType, RuntimeSceneContract>> = {
  'source-reading': {
    syncStrategy: '课程主题、学习目录和开场问题同时呈现；学生完成揭晓前作答并标记把握度后，才可进入后续证据页。',
    interactionContract: '自学时可直接记录原答；投影课堂可由教师确认学生已在纸面或口头完成。系统对后者只记录完成方式与把握度，不伪造答案文本；未确认时后续入口保持禁用。',
    fallbackPresentation: '没有动态控件时，教师先让学生在纸上写下作答与把握度，再展示后续内容，并在收束时回看原纸面记录。',
  },
  'visual-observation': {
    syncStrategy: '三组观察标题与说明同时呈现，教师按整体、局部、关系的顺序引导观察。',
    interactionContract: '学生观察三层要素，再说出一条关系和画面依据；页面为静态展示，不要求点击。',
    fallbackPresentation: '静态显示三组观察标题与说明，不承诺路径动画。',
  },
  'concept-build': {
    syncStrategy: '核心表述与正例同时呈现，教师先解释表述，再用正例逐词对应。',
    interactionContract: '学生先读核心表述，再在正例中指出关键词对应位置；页面为静态展示，不要求点击。',
    fallbackPresentation: '静态上下排布核心表述与正例，不承诺分层动画。',
  },
  contrast: {
    syncStrategy: '首次只显示待辨析说法；学生留下文字判断或确认已在纸面、口头完成后，教师才能一次展开完整修正。',
    interactionContract: `学生先独立判断误区并给出依据；文字作答只留在本次课堂，投影课堂可确认纸面或口头作答但不伪造文本；点击“${STAGED_RUNTIME_CONTROLS.contrast.revealLabel}”后，还要改写正确表述并指出关键条件，完成前后续页面入口保持禁用。`,
    fallbackPresentation: '没有动态控件时，教师先让学生在纸上写下判断与依据，再展示完整修正，并要求在原答旁改写正确表述后才继续。',
  },
  'ai-verify': {
    syncStrategy: '首次按编号显示全部待核查说法；每条都留下文字判断，或确认已逐条在纸面、口头完成后，教师才能一次展开对应核查结论。',
    interactionContract: `学生逐条指出每个待核查说法中的具体错误并各引用一条证据；系统按说法逐条检查文字作答完整性，投影课堂只确认完成方式，不伪造答案文本；点击“${STAGED_RUNTIME_CONTROLS['ai-verify'].revealLabel}”后，还要逐条改写并举证，完成前后续页面入口保持禁用。`,
    fallbackPresentation: '没有动态控件时，教师先让学生按编号在纸上逐条作答，再展示对应核查结论，并要求逐条改写正确、补证据后才继续。',
  },
  'ai-inquiry': {
    syncStrategy: '普通提问与深度追问样例同时呈现，教师引导学生比较回答质量和暴露的边界。',
    interactionContract: '学生比较两组问答，指出追问好在哪里，并为一个新问题设计追问；页面为静态展示。',
    fallbackPresentation: '静态上下排布两组问答，不承诺滑块或切换操作。',
  },
  'worked-example': {
    syncStrategy: '首次只显示题面；学生留下文字步骤或确认已在纸面、口头完成后，教师才能一次展开全部示范步骤。',
    interactionContract: `学生先补出关键一步并说出依据；文字作答只留在本次课堂，投影课堂可确认纸面或口头作答但不伪造文本；点击“${STAGED_RUNTIME_CONTROLS['worked-example'].revealLabel}”后，还要解释关键步骤为什么成立，完成前后续页面入口保持禁用。`,
    fallbackPresentation: '没有动态控件时，教师先让学生在纸上补出关键一步并说明依据，再展示全部步骤，并要求解释关键步骤为什么成立后才继续。',
  },
  practice: {
    syncStrategy: '首次只显示任务；学生独立作答并在揭晓前标记把握度，教师再一次展开完整反馈。',
    interactionContract: `学生先独立作答并保留过程，在揭晓前选择把握度；教师点击“${STAGED_RUNTIME_CONTROLS.practice.revealLabel}”后，页面一次展开完整反馈，再记录结果与校准建议；反馈展开前，后续页面入口保持禁用。`,
    fallbackPresentation: '没有动态控件时，教师先展示任务并询问把握度，再切换到任务与反馈同屏的完整页面。',
  },
  recap: {
    syncStrategy: '学习路径与核心收获静态呈现，同时回到本次课堂的开场原答；系统有文字原答时显示原文，纸面或口头作答时明确回看学生自己的记录。',
    interactionContract: '学生对照证据回看开场原答，完成保留项、修正项和依据；文字模式保存修正文，纸面或口头模式只确认已在原记录中完成，不冒充文本证据。',
    fallbackPresentation: '静态显示学习路径与核心收获，由教师带学生回看纸面开场作答。',
  },
  'ai-collab': {
    syncStrategy: '任务卡与评价量规同时呈现，学生在外部 AI 对话中完成任务后回到量规自评。',
    interactionContract: '学生使用 AI 完成任务卡，再按页面量规检查提示词、证据和结果；当前页面不代替 AI 对话。',
    fallbackPresentation: '静态显示任务卡与评价量规，不依赖角色或动效。',
  },
}

export function runtimeSceneContractFor(sceneType: SceneType): RuntimeSceneContract {
  return RUNTIME_SCENE_CONTRACTS[sceneType]
}

export interface UnsupportedRuntimePromise {
  claim: string
  actual: string
}

/** 只识别当前课堂明确没有实现的能力；不以文案是否逐字相同判断教师手改。 */
export function unsupportedRuntimePromises(
  scene: Pick<LessonScene, 'sceneType' | 'syncStrategy' | 'interactionContract' | 'fallbackPresentation'>,
): UnsupportedRuntimePromise[] {
  const activeCopy = `${scene.syncStrategy} ${scene.interactionContract}`
  const allCopy = `${activeCopy} ${scene.fallbackPresentation}`
  const promises: UnsupportedRuntimePromise[] = []

  if (scene.sceneType === 'contrast' && /(?:学生|用户).{0,16}(?:切换|拖动)|滑块.{0,12}(?:切换|改变|更新)/.test(activeCopy)) {
    promises.push({ claim: '可切换或拖动的辨析滑块', actual: '学生先作答，教师按钮一次展开完整修正' })
  }
  if (scene.sceneType === 'worked-example' && /逐步回放|步骤按.{0,10}逐步|当前步骤.{0,6}高亮|每步.{0,10}(?:展开|回放)/.test(allCopy)) {
    promises.push({ claim: '逐步回放并高亮当前步骤', actual: '教师按钮一次展开全部示范步骤' })
  }
  if (scene.sceneType === 'practice' && /(?:反馈|要点).{0,12}(?:分步|逐步)(?:显现|展开)/.test(activeCopy)) {
    promises.push({ claim: '反馈逐步显现', actual: '教师按钮一次展开完整反馈' })
  }
  if (scene.sceneType === 'recap' && /(?:系统|页面|当前节点).{0,12}高亮|路径.{0,8}回放|节点.{0,8}(?:静态)?高亮/.test(allCopy)) {
    promises.push({ claim: '路径自动回放或节点高亮', actual: '学习路径静态呈现，由教师组织解释和迁移' })
  }

  return promises
}

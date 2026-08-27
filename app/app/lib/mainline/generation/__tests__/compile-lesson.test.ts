import { describe, it, expect } from 'vitest'
import { blockingQualityIssues, auditMainlineCourse } from '../../quality-gates.js'
import { runtimeSceneContractFor } from '../../runtime-interaction.js'
import { pickCastPreset } from '../cast-preset.js'
import { BUILT_IN_TTS_VOICE_IDS } from '../../../teachers.js'
import { compileLessonFromKps } from '../compile-lesson.js'

function compile(overrides: Partial<Parameters<typeof compileLessonFromKps>[0]> = {}) {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-example-1', canonicalName: '示例知识点' }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
    ...overrides,
  })
}

describe('compileLessonFromKps', () => {
  it('所有骨架幕都从真实课堂能力生成呈现与交互契约', () => {
    const course = compile({
      kps: [
        { id: 'kp-c', canonicalName: '概念知识', knowledgeType: 'conceptual', misconceptions: ['典型误区'] },
        { id: 'kp-p', canonicalName: '程序知识', knowledgeType: 'procedural' },
        { id: 'kp-f', canonicalName: '事实知识', knowledgeType: 'factual', misconceptions: ['事实误区'] },
      ],
    })

    for (const scene of course.scenes) {
      expect({
        syncStrategy: scene.syncStrategy,
        interactionContract: scene.interactionContract,
        fallbackPresentation: scene.fallbackPresentation,
      }, scene.sceneType).toEqual(runtimeSceneContractFor(scene.sceneType))
    }
  })

  it('无可靠误区来源的 conceptual 骨架不凑辨析页:开场 + 观察/建概念/独立练习 + 收束', () => {
    const course = compile()
    expect(course.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'visual-observation', 'concept-build', 'practice', 'recap',
    ])
    expect(course.learningFragments).toHaveLength(3)
    expect(course.learningFragments[1]).toMatchObject({ kpId: 'kp-example-1', skeletonId: 'frag-conceptual' })
    expect(course.goals[0]?.statement).toContain('新例中指出关键特征')
    expect(course.goals[0]?.successSignal).toContain('新例中指出关键特征')
    expect(JSON.stringify(course.goals[0])).not.toContain('误区')
    expect(course.beats.length).toBeGreaterThanOrEqual(7)
    expect(course.qualityStatus).toBe('draft')
  })

  it('新骨架把时长落到每一页，片段总时长由所属页面求和', () => {
    const course = compile({
      kps: [{
        id: 'kp-p',
        canonicalName: '移项',
        knowledgeType: 'procedural',
        misconceptions: ['移项不用变号', '系数化一时符号不变'],
        needsReinforcement: true,
      }],
    })

    for (const scene of course.scenes) {
      expect(scene.durationTargetSec, scene.id).toBeGreaterThan(0)
    }
    expect(course.scenes.find(scene => scene.sceneType === 'source-reading')?.durationTargetSec).toBe(60)
    expect(course.scenes.find(scene => scene.sceneType === 'worked-example')?.durationTargetSec).toBe(60)
    expect(course.scenes.find(scene => scene.sceneType === 'ai-verify')?.durationTargetSec).toBe(45)
    expect(course.scenes.find(scene => scene.sceneType === 'recap')?.durationTargetSec).toBe(60)

    for (const fragment of course.learningFragments) {
      const sceneTotal = fragment.sceneIds.reduce((sum, sceneId) => {
        return sum + (course.scenes.find(scene => scene.id === sceneId)?.durationTargetSec ?? 0)
      }, 0)
      expect(sceneTotal, fragment.id).toBe(fragment.durationTargetSec)
    }
  })

  it('空骨架开场也先收集预测，不把学习目标里的答案提前写上屏', () => {
    const course = compile({
      kps: [{
        id: 'kp-example-1',
        canonicalName: '消息文体特征',
        learningObjectives: ['掌握标题、导语、正文的结构关系'],
      }],
    })
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    const sourceText = JSON.stringify(source)

    expect(Object.keys(source.contentSlots)).toEqual(['topic', 'learningPath', 'openingQuestion'])
    expect(source.boardText).toEqual(['先写下一个预测', '带着问题寻找证据', '最后检查想法变化'])
    expect(source.studentAction).toContain('预测')
    expect(source.teacherScript).toContain('逐步提供证据')
    expect(sourceText).not.toContain('标题、导语、正文的结构关系')
  })

  it('教材目标首条不可观察时选择可检核的高阶目标，并派生同动作成功信号', () => {
    const course = compile({
      kps: [{
        id: 'kp-example-1',
        canonicalName: '三角形面积公式',
        knowledgeType: 'procedural',
        learningObjectives: [
          '理解两个三角形可以拼成平行四边形',
          '能指出三角形底和高的对应关系',
          '会用三角形面积公式解决实际问题',
        ],
      }],
    })

    expect(course.goals[0]).toMatchObject({
      statement: '会用三角形面积公式解决实际问题',
      successSignal: expect.stringContaining('学生会用三角形面积公式解决实际问题'),
    })
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('教材只有理解类目标时回退到骨架的可观察目标', () => {
    const course = compile({
      kps: [{
        id: 'kp-example-1',
        canonicalName: '三角形面积公式',
        knowledgeType: 'procedural',
        learningObjectives: ['理解三角形面积公式', '掌握公式推导过程'],
      }],
    })

    expect(course.goals[0]?.statement).toContain('完成一道 三角形面积公式 的同型任务')
    expect(course.goals[0]?.successSignal).toContain('说明关键步骤的依据')
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('复习课把学习时期写入课程，并从闭卷提取而不是预测新知开始', () => {
    const course = compile({ lessonPhase: 'review' })
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!

    expect(course.lessonPhase).toBe('review')
    expect(source.contentSlots.learningPath).toBe('闭卷提取 → 对照纠错 → 变式再答')
    expect(source.studentAction).toContain('不看资料')
    expect(source.teacherScript).toContain('不是把新课重新听一遍')
    expect(source.studentAction).not.toContain('最想弄清')
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('考前课从限时诊断开始，不从头重讲', () => {
    const course = compile({ lessonPhase: 'exam-prep' })
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!

    expect(source.contentSlots.learningPath).toBe('限时诊断 → 错因归类 → 边界核查')
    expect(source.studentAction).toContain('限时')
    expect(source.teacherScript).toContain('不从头重讲')
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('空骨架收束页不把屏幕结论的照读当成学习证据', () => {
    const course = compile()
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!

    expect(recap.studentAction).toContain('新例子')
    expect(recap.studentAction).toContain('预测')
    expect(recap.studentAction).not.toMatch(/复述|背诵|朗读/)
    expect(recap.teacherScript).toContain('不能照着念完就算学会')
  })

  it('收束结构由知识点元数据确定，不再把所有课程压成同一条路径', () => {
    const procedural = compile({
      kps: [{ id: 'kp-p', canonicalName: '分数除法', knowledgeType: 'procedural' }],
    }).scenes.find(scene => scene.sceneType === 'recap')!
    expect(procedural.infoShape).toBe('progressive')
    expect(Object.keys(procedural.contentSlots)).toEqual(['path', 'takeaway', 'transferTask'])

    const revision = compile({
      kps: [{ id: 'kp-c', canonicalName: '浮力', knowledgeType: 'conceptual', misconceptions: ['越重浮力越大'] }],
    }).scenes.find(scene => scene.sceneType === 'recap')!
    expect(revision.infoShape).toBe('contrast')
    expect(Object.keys(revision.contentSlots)).toEqual(['startingIdea', 'revisedIdea', 'revisionEvidence', 'takeaway', 'transferTask'])

    const evidence = compile({
      kps: [{ id: 'kp-f', canonicalName: '安史之乱', knowledgeType: 'factual' }],
    }).scenes.find(scene => scene.sceneType === 'recap')!
    expect(evidence.infoShape).toBe('hierarchy')
    expect(Object.keys(evidence.contentSlots)).toEqual(['shapeSummary', 'shapeItem1', 'shapeItem2', 'shapeItem3', 'takeaway', 'transferTask'])

    const network = compile({
      kps: [
        { id: 'kp-1', canonicalName: '起因', knowledgeType: 'factual' },
        { id: 'kp-2', canonicalName: '过程', knowledgeType: 'factual' },
        { id: 'kp-3', canonicalName: '影响', knowledgeType: 'conceptual' },
      ],
    }).scenes.find(scene => scene.sceneType === 'recap')!
    expect(network.infoShape).toBe('radial')
    expect(Object.keys(network.contentSlots)).toEqual(['shapeCenter', 'shapeItem1', 'shapeItem2', 'shapeItem3', 'takeaway', 'transferTask'])
  })

  it('没有真实摘录时不再生成“待 LLM 填充”的伪教材依据', () => {
    const course = compile()
    expect(course.sourceMaterial[0]).toMatchObject({
      kind: 'textbook',
      title: '示例知识点',
      kpId: 'kp-example-1',
    })
    expect(course.sourceMaterial[0]?.excerpt).toBeUndefined()
    expect(JSON.stringify(course)).not.toContain('待 LLM 填充教材原文')
  })

  it('保留建课前解析出的权威来源和备课配图候选', () => {
    const course = compile({
      groundingByKp: {
        'kp-example-1': {
          excerpt: '经核验的教材原文。',
          citation: '人民教育出版社教材，第 12 页',
          provenance: { source: 'pep-cn', externalId: 'leaf-12', evidenceStatus: 'authoritative-excerpt' },
          candidateResources: [{
            id: 'asset-12',
            kind: 'textbook-asset',
            title: '教材示意图',
            assetUrl: '/api/v2/education-resources/file/asset-12',
            mediaType: 'image/png',
            revealPolicy: 'explanation-only',
          }],
        },
      },
    })

    expect(course.sourceMaterial[0]).toMatchObject({
      excerpt: '经核验的教材原文。',
      provenance: { evidenceStatus: 'authoritative-excerpt' },
      candidateResources: [{ id: 'asset-12', revealPolicy: 'explanation-only' }],
    })
  })

  it('薄弱 KP 骨架加固:多一幕加固再练且仍过全部闸门(v4 M3)', () => {
    const normal = compile()
    const reinforced = compile({ kps: [{ id: 'kp-example-1', canonicalName: '示例知识点', needsReinforcement: true }] })
    expect(reinforced.scenes.length).toBe(normal.scenes.length + 1)
    expect(reinforced.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'visual-observation', 'concept-build', 'practice', 'practice', 'recap',
    ])
    expect(reinforced.learningFragments[1]!.skeletonId).toBe('frag-conceptual-reinforced')
    expect(blockingQualityIssues(auditMainlineCourse(reinforced))).toEqual([])
  })

  it('procedural KP 走讲授跟做骨架:concept-build + worked-example + practice', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
    const course = compile({
      kps: [{ id: 'kp-p', canonicalName: '一元一次方程移项', knowledgeType: 'procedural' }],
      subject: 'math',
      preset,
    })
    // 2026-08-25 用户裁决:程序性知识先讲授方法要领,再例题示范与跟做
    expect(course.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'concept-build', 'worked-example', 'practice', 'recap',
    ])
    // worked-example 是内容密集幕,版式必须降级
    const worked = course.scenes.find(s => s.sceneType === 'worked-example')!
    expect(['corner-avatar', 'narration-only', 'no-character']).toContain(worked.dialogueLayout)
    expect(worked.contentSlots.completionPrompt).toContain('【待补】')
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('factual KP 走识记检核骨架,简单课不加复杂壳(全课 4 幕)', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    const course = compile({
      kps: [{ id: 'kp-f', canonicalName: '四大洋名称与位置', knowledgeType: 'factual' }],
      subject: 'geography',
      preset,
    })
    expect(course.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'visual-observation', 'practice', 'recap',
    ])
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('多 KP 混合类型:每 KP 一个片段,幕数随内容伸缩,kpId 全程可追溯', () => {
    const course = compile({
      kps: [
        { id: 'kp-1', canonicalName: 'A 概念', knowledgeType: 'conceptual' },
        { id: 'kp-2', canonicalName: 'B 概念', knowledgeType: 'procedural' },
        { id: 'kp-3', canonicalName: 'C 事实', knowledgeType: 'factual' },
      ],
    })
    // 1 开场 + 3(conceptual,无误区不凑辨析) + 3(procedural 含讲授幕) + 2(factual) + 1 收束 = 10 幕
    expect(course.scenes).toHaveLength(10)
    expect(course.learningFragments).toHaveLength(5)
    expect(course.teachingSkeleton.knowledgeType).toBe('conceptual+procedural+factual')
    expect(course.goals).toHaveLength(3)
    expect(course.goals.map(goal => goal.kpId)).toEqual(['kp-1', 'kp-2', 'kp-3'])
    // 每个 KP 片段的 sceneIds 都指向带同一 kpId 的幕
    for (const fragment of course.learningFragments.filter(f => f.kpId)) {
      expect(course.goals.find(goal => goal.id === fragment.goalId)?.kpId).toBe(fragment.kpId)
      for (const sceneId of fragment.sceneIds) {
        expect(course.scenes.find(s => s.id === sceneId)?.kpId).toBe(fragment.kpId)
      }
    }
    // 每幕至少 1 个节拍(闸门要求)
    const beatScenes = new Set(course.beats.map(b => b.sceneId))
    for (const scene of course.scenes) expect(beatScenes.has(scene.id)).toBe(true)
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('立绘密度受控:每 KP 片段至多 1 个立绘幕 + 收束,辨析幕恒用角落头像让位对照', () => {
    const course = compile({
      kps: [
        { id: 'kp-1', canonicalName: 'A 概念', knowledgeType: 'conceptual', misconceptions: ['A 的教研误区'] },
        { id: 'kp-2', canonicalName: 'B 概念', knowledgeType: 'conceptual', misconceptions: ['B 的教研误区'] },
        { id: 'kp-3', canonicalName: 'C 概念', knowledgeType: 'conceptual', misconceptions: ['C 的教研误区'] },
      ],
    })
    const spriteScenes = course.scenes.filter(s => s.dialogueLayout !== 'narration-only' && s.dialogueLayout !== 'no-character')
    const kpFragmentCount = course.learningFragments.filter(f => f.kpId).length
    expect(spriteScenes.length).toBeLessThanOrEqual(kpFragmentCount + 1)
    // 建概念幕全部退为旁白
    for (const s of course.scenes.filter(s => s.sceneType === 'concept-build')) {
      expect(s.dialogueLayout).toBe('narration-only')
    }
    // 辨析幕是中央左右对照幕(fill 后必然内容密集),恒用 corner-avatar 让位对照区——
    // 不再用 student-right-content-left 大立绘(会吃对照区并撞 isContentDense 闸门)
    const contrasts = course.scenes.filter(s => s.sceneType === 'contrast')
    expect(contrasts.map(s => s.dialogueLayout)).toEqual(['corner-avatar', 'corner-avatar', 'corner-avatar'])
    // 概念片段的辨析页已经承担同伴发言，随后的独立练习让角色退场，避免连续两页抢占任务空间。
    const practices = course.scenes.filter(s => s.sceneType === 'practice')
    expect(practices.map(s => s.dialogueLayout)).toEqual(['narration-only', 'narration-only', 'narration-only'])
    // ai-verify 同为对照幕,同样恒 corner-avatar
    for (const s of course.scenes.filter(s => s.sceneType === 'ai-verify')) {
      expect(s.dialogueLayout).toBe('corner-avatar')
    }
  })

  it('多个辨析幕也保持低交互:全课最多 1 个 ask/wait 节拍', () => {
    const course = compile({
      kps: [
        { id: 'kp-1', canonicalName: 'A 概念', knowledgeType: 'conceptual', misconceptions: ['A 的教研误区'] },
        { id: 'kp-2', canonicalName: 'B 概念', knowledgeType: 'conceptual', misconceptions: ['B 的教研误区'] },
      ],
    })
    expect(course.scenes.filter(s => s.sceneType === 'contrast')).toHaveLength(2)
    const interactive = course.beats.filter(b => b.action === 'ask' || b.action === 'wait').length
    expect(interactive).toBeLessThanOrEqual(1)
  })

  it('KP 带教材标注误区时,辨析幕的 misconception 槽以标注起底', () => {
    const course = compile({
      kps: [{
        id: 'kp-m', canonicalName: '海陆变迁', knowledgeType: 'conceptual',
        misconceptions: ['海岸线吻合就是大陆漂移的证据'],
      }],
    })
    const contrast = course.scenes.find(s => s.sceneType === 'contrast')!
    expect(contrast.contentSlots.misconception).toContain('标注误区')
    expect(contrast.contentSlots.misconception).toContain('海岸线吻合')
  })

  it('v5 M2 executor 默认分工:source-reading/recap=co,contrast=teacher,其余按骨架表', () => {
    const course = compile({
      kps: [{ id: 'kp-example-1', canonicalName: '示例知识点', misconceptions: ['教研确认的典型误区'] }],
    })
    const byType = new Map(course.scenes.map(s => [s.sceneType, s.executor]))
    expect(byType.get('source-reading')).toBe('co')
    expect(byType.get('visual-observation')).toBe('ai')
    expect(byType.get('concept-build')).toBe('co')
    expect(byType.get('contrast')).toBe('teacher')
    expect(byType.get('recap')).toBe('co')
  })

  it('v5 M2 ai-verify:conceptual KP 带 2 条误区,contrast 处理第 1 条、ai-verify 收编第 2 条', () => {
    const course = compile({
      kps: [{
        id: 'kp-m', canonicalName: '海陆变迁', knowledgeType: 'conceptual',
        misconceptions: ['海岸线吻合就是大陆漂移的证据', '板块运动速度肉眼可见'],
      }],
    })
    expect(course.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'visual-observation', 'concept-build', 'contrast', 'practice', 'ai-verify', 'recap',
    ])
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!
    expect(verifyScene.executor).toBe('teacher')
    expect(verifyScene.kpId).toBe('kp-m')
    expect(verifyScene.misconceptionSource).toBe('板块运动速度肉眼可见')
    expect(verifyScene.contentSlots.aiClaim).toContain('板块运动速度肉眼可见')
    expect(verifyScene.contentSlots.aiClaim).not.toMatch(/AI\s*助教|小助|AI\s*(?:说|表示|认为)/)
    expect(verifyScene.studentAction).not.toContain('AI 说法')
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('v5 M2 ai-verify:procedural KP 没有 contrast 步骤,ai-verify 合并全部误区进 1 幕(骨架去重)', () => {
    const course = compile({
      kps: [{
        id: 'kp-p', canonicalName: '移项', knowledgeType: 'procedural',
        misconceptions: ['移项不用变号', '系数化 1 时符号不变'],
      }],
    })
    const verifyScenes = course.scenes.filter(s => s.sceneType === 'ai-verify')
    expect(verifyScenes).toHaveLength(1)
    const verify = verifyScenes[0]!
    expect(verify.misconceptionSource).toBe('移项不用变号')
    expect(verify.misconceptionSources).toEqual(['移项不用变号', '系数化 1 时符号不变'])
    // 粗槽合并 + 细分槽并存(向后兼容 + 向前预留)
    expect(verify.contentSlots.aiClaim).toContain('移项不用变号')
    expect(verify.contentSlots.aiClaim).toContain('系数化 1 时符号不变')
    expect(verify.contentSlots.aiClaim1).toContain('移项不用变号')
    expect(verify.contentSlots.aiClaim2).toContain('系数化 1 时符号不变')
    expect(verify.contentSlots.aiClaim).not.toMatch(/AI\s*助教|小助|AI\s*(?:说|表示|认为)/)
    expect(verify.contentSlots.aiClaim1).not.toMatch(/AI\s*助教|小助|AI\s*(?:说|表示|认为)/)
    expect(verify.contentSlots.aiClaim2).not.toMatch(/AI\s*助教|小助|AI\s*(?:说|表示|认为)/)
    expect(verify.contentSlots.reveal1).toBeDefined()
    expect(verify.contentSlots.reveal2).toBeDefined()
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('v5 骨架去重合并:3 条误区的 conceptual KP,contrast 吃 1 条 + ai-verify 一幕合并吃剩下 2 条', () => {
    const course = compile({
      kps: [{
        id: 'kp-m3', canonicalName: '海陆变迁', knowledgeType: 'conceptual',
        misconceptions: ['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见', '大陆漂移只发生在过去,现在已经停止'],
      }],
    })
    expect(course.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'visual-observation', 'concept-build', 'contrast', 'practice', 'ai-verify', 'recap',
    ])
    const contrast = course.scenes.find(s => s.sceneType === 'contrast')!
    expect(contrast.contentSlots.misconception).toContain('海岸线吻合是大陆漂移的证据')
    const verify = course.scenes.find(s => s.sceneType === 'ai-verify')!
    expect(verify.misconceptionSource).toBe('板块运动速度肉眼可见')
    expect(verify.misconceptionSources).toEqual(['板块运动速度肉眼可见', '大陆漂移只发生在过去,现在已经停止'])
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('v5 骨架去重合并:3 条误区的 procedural KP,ai-verify 一幕合并吃全部 3 条', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
    const course = compileLessonFromKps({
      kps: [{
        id: 'kp-p3', canonicalName: '移项', knowledgeType: 'procedural',
        misconceptions: ['移项不用变号', '系数化 1 时符号不变', '合并同类项时忽略符号'],
      }],
      gradeBand: 'middle-school',
      subject: 'math',
      preset,
    })
    const verifyScenes = course.scenes.filter(s => s.sceneType === 'ai-verify')
    expect(verifyScenes).toHaveLength(1)
    expect(verifyScenes[0]!.misconceptionSources).toEqual(['移项不用变号', '系数化 1 时符号不变', '合并同类项时忽略符号'])
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('v5 M2 ai-inquiry:metacognitive KP 在独立 practice 前插入提问链,不替代可保存证据的练习', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-meta', canonicalName: '审题策略', knowledgeType: 'metacognitive' }],
      gradeBand: 'middle-school',
      subject: 'chinese',
      preset,
    })
    expect(course.scenes.map(s => s.sceneType)).toEqual([
      'source-reading', 'concept-build', 'ai-inquiry', 'practice', 'recap',
    ])
    const strategy = course.scenes.find(s => s.sceneType === 'concept-build')!
    expect(strategy.infoShape).toBe('progressive')
    expect(Object.keys(strategy.contentSlots)).toEqual(['trigger', 'steps', 'selfCheck'])
    expect(strategy.contentSlots.statement).toBeUndefined()
    expect(strategy.contentSlots.example).toBeUndefined()
    expect(strategy.studentAction).toContain('适用情境')
    expect(strategy.studentAction).toContain('自检')
    const inquiry = course.scenes.find(s => s.sceneType === 'ai-inquiry')!
    expect(inquiry.executor).toBe('co')
    expect(inquiry.contentSlots.shallowSample).toBeDefined()
    expect(inquiry.contentSlots.probingSample).toBeDefined()
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('binds selectedTeacher / teacherSubjectProfile / gradeAdaptationProfile consistently', () => {
    const course = compile()
    expect(course.teacherSubjectProfile.teacherId).toBe(course.selectedTeacher)
    expect(course.teacherSubjectProfile.subject).toBe(course.subject)
    expect(course.gradeAdaptationProfile.gradeBand).toBe(course.gradeBand)
  })

  it('has 0 blocking quality issues (structure + cast + skeleton all pass)', () => {
    const course = compile()
    const blocking = blockingQualityIssues(auditMainlineCourse(course))
    if (blocking.length > 0) {
      const summary = blocking.map(b => `[${b.gate}/${b.targetType}] ${b.message}`).join('\n')
      throw new Error(`expected 0 blocking, got ${blocking.length}:\n${summary}`)
    }
    expect(blocking).toEqual([])
  })

  it('keeps interaction low: at most 1 ask/wait beat per course', () => {
    const course = compile()
    const interactive = course.beats.filter(b => b.action === 'ask' || b.action === 'wait').length
    expect(interactive).toBeLessThanOrEqual(1)
  })

  it('uses varied dialogueLayouts and sceneTechniques (course shape gates)', () => {
    const course = compile()
    const layouts = new Set(course.scenes.map(s => s.dialogueLayout))
    const techniques = new Set(course.scenes.map(s => s.sceneTechnique))
    expect(layouts.size).toBeGreaterThanOrEqual(2)
    expect(techniques.size).toBeGreaterThanOrEqual(3)
  })

  it('carries cast立绘: teacher has ≥4 half-body transparent assetRefs', () => {
    const course = compile()
    const teacher = course.castProfiles.find(c => c.id === course.selectedTeacher)
    expect(teacher).toBeDefined()
    expect(teacher!.assetRefs?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(teacher!.assetRefs!.every(a => a.kind === 'half-body-cutout' && a.transparentBackground)).toBe(true)
  })

  it('accepts multi-KP input and lists every knowledge point in the topic', () => {
    const course = compile({
      kps: [
        { id: 'kp-1', canonicalName: 'A 概念' },
        { id: 'kp-2', canonicalName: 'B 步骤' },
      ],
    })
    expect(course.topic).toBe('A 概念、B 步骤')
    expect(course.topic).not.toMatch(/等\s*\d+\s*个知识点/)
    expect(course.sourceMaterial).toHaveLength(2)
    expect(course.sourceMaterial.map(s => s.kpId)).toEqual(['kp-1', 'kp-2'])
  })

  it('exact match: middle-school × geography 命中 GEO 预设(龙老师,不再借用陈教授)', () => {
    const { preset, matched } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    expect(matched).toBe('exact')
    expect(preset.selectedTeacher).toBe('teacher-longlaoshi')
    expect(preset.peerRoleProfile.peerId).toBe('student-steady')
    expect(preset.castProfiles.find(c => c.id === 'teacher-longlaoshi')?.displayName).toBe('龙老师')
    expect(preset.castProfiles.find(c => c.id === 'student-steady')?.displayName).toBe('苏同学')
    // 立绘 4 张齐全,半身透明
    const teacher = preset.castProfiles.find(c => c.role === 'teacher')!
    expect(teacher.assetRefs).toHaveLength(4)
    expect(teacher.assetRefs!.every(a => a.kind === 'half-body-cutout' && a.transparentBackground)).toBe(true)

    // 生成的地理课过闸门 0 blocking
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-g', canonicalName: '中国省级行政区划' }],
      gradeBand: 'middle-school',
      subject: 'geography',
      preset,
    })
    expect(course.selectedTeacher).toBe('teacher-longlaoshi')
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
  })

  it('subject/grade fallback: unknown combinations still pass audit (profile fields rewritten)', () => {
    // 未预设组合(高中地理)走学段家族互借:借初中地理的龙老师(gradeFit 含 high-school),
    // pickCastPreset 把 preset 的 subject/gradeBand/teachingMode 动态改写为课程实际值
    const { preset, matched } = pickCastPreset({ gradeBand: 'high-school', subject: 'geography' })
    expect(matched).toBe('grade-family')
    expect(preset.selectedTeacher).toBe('teacher-longlaoshi')
    expect(preset.subject).toBe('geography')
    expect(preset.gradeBand).toBe('high-school')
    expect(preset.teacherSubjectProfile.subject).toBe('geography')
    expect(preset.teacherSubjectProfile.teachingMode).toBe('spatial-reasoning')
    expect(preset.gradeAdaptationProfile.gradeBand).toBe('high-school')

    const course = compileLessonFromKps({
      kps: [{ id: 'kp-x', canonicalName: '地球自转规律' }],
      gradeBand: 'high-school',
      subject: 'geography',
      preset,
    })
    const blocking = blockingQualityIssues(auditMainlineCourse(course))
    if (blocking.length > 0) {
      throw new Error('fallback should now 0 blocking, got:\n' + blocking.map(b => b.message).join('\n'))
    }
    expect(blocking).toEqual([])
  })

  it('grade-family: 小学高年级借静夜思卡司(小美老师),不再跨到初中文学教授', () => {
    // 真检发现:from-kps 的「小学」映射为 upper-primary,而小学预设键是 lower-primary,
    // 旧逻辑直接兜底到初中陈教授。家族互借要求老师 gradeFit 覆盖目标学段才可借。
    for (const subject of ['chinese', 'math'] as const) {
      const { preset, matched } = pickCastPreset({ gradeBand: 'upper-primary', subject })
      expect(matched, subject).toBe('grade-family')
      expect(preset.selectedTeacher, subject).toBe('teacher-xiaomei')
      const teacher = preset.castProfiles.find(c => c.id === preset.selectedTeacher)!
      expect(teacher.gradeFit).toContain('upper-primary')
    }
  })

  it('grade-family 借用校验 gradeFit:高中物理不借 gradeFit 仅初中的理科老师', () => {
    // refraction 的 teacher-young gradeFit=['middle-school'],不覆盖 high-school → 不可借;
    // 落到家族内 gradeFit 覆盖的首个预设(陈教授资产),再把人物身份适配为高中物理教师。
    const { preset, matched } = pickCastPreset({ gradeBand: 'high-school', subject: 'physics' })
    expect(matched).toBe('grade-family')
    const teacher = preset.castProfiles.find(c => c.id === preset.selectedTeacher)!
    expect(teacher.gradeFit).toContain('high-school')
    expect(teacher.subjectFit).toContain('physics')
    expect(teacher.displayName).toBe('陈老师')
    expect(teacher.identity).toContain('高中物理教师')
  })

  it('非精确预设只借资产，不把样板课的学科身份和角色禁区带进新课', () => {
    const { preset } = pickCastPreset({ gradeBand: 'high-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-p', canonicalName: '分子热运动' }],
      gradeBand: 'high-school',
      subject: 'physics',
      preset,
    })
    const issues = auditMainlineCourse(course)
    const castWarnings = issues.filter(i => i.severity === 'warning' && i.targetType === 'cast')
    expect(castWarnings).toEqual([])
    expect(preset.teacherSubjectProfile.boardStyle).toContain('公式')
    expect(preset.peerRoleProfile.nonGoals.join('')).not.toContain('小桥流水人家')
    expect(preset.castProfiles.find(cast => cast.id === preset.selectedTeacher)?.visualIdentity).toContain('物理')
    expect(preset.voiceProfiles.find(voice => voice.castId === preset.selectedTeacher)?.stabilityRule).toContain('物理术语')
    expect(preset.voiceProfiles.find(voice => voice.castId === preset.selectedTeacher)?.stabilityRule).not.toContain('陈教授')
    expect(blockingQualityIssues(issues)).toEqual([])
  })

  it('全部学段与学科组合都得到身份匹配的老师和同学', () => {
    const gradeBands = ['lower-primary', 'upper-primary', 'middle-school', 'high-school'] as const
    const subjects = ['chinese', 'math', 'science', 'english', 'history', 'geography', 'physics', 'chemistry', 'biology', 'general'] as const

    for (const gradeBand of gradeBands) {
      for (const subject of subjects) {
        const { preset } = pickCastPreset({ gradeBand, subject })
        const teacher = preset.castProfiles.find(cast => cast.id === preset.selectedTeacher)!
        const peer = preset.castProfiles.find(cast => cast.id === preset.peerRoleProfile.peerId)!
        expect(teacher.gradeFit, `${gradeBand}/${subject}/teacher grade`).toContain(gradeBand)
        expect(teacher.subjectFit, `${gradeBand}/${subject}/teacher subject`).toContain(subject)
        expect(peer.gradeFit, `${gradeBand}/${subject}/peer grade`).toContain(gradeBand)
        expect(peer.subjectFit, `${gradeBand}/${subject}/peer subject`).toContain(subject)
        for (const voice of preset.voiceProfiles) {
          expect(BUILT_IN_TTS_VOICE_IDS, `${gradeBand}/${subject}/${voice.castId} voice`).toContain(voice.voiceId)
          expect(voice.voiceId).not.toMatch(/^(?:zhipu|minimax):/)
        }

        const course = compileLessonFromKps({
          kps: [{ id: `kp-${gradeBand}-${subject}`, canonicalName: '跨学段生成校验' }],
          gradeBand,
          subject,
          preset,
        })
        const castVoiceBlocking = blockingQualityIssues(auditMainlineCourse(course))
          .filter(issue => issue.gate === 'cast-voice-grade')
        expect(castVoiceBlocking, `${gradeBand}/${subject}/cast-voice integrity`).toEqual([])
      }
    }
  })
})

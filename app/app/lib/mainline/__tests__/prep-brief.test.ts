import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../generation/cast-preset.js'
import { compileLessonFromKps } from '../generation/compile-lesson.js'
import type { FactAuditRecord, MainlineCourse } from '../domain.js'
import type { KpMetadata } from '../kp-metadata.js'
import type { MasteryEvidenceStatus, MasteryRecord } from '../mastery.js'
import { assemblePrepBrief } from '../prep-brief.js'

function compile(kps: Parameters<typeof compileLessonFromKps>[0]['kps'], subject: Parameters<typeof compileLessonFromKps>[0]['subject'] = 'geography') {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject })
  return compileLessonFromKps({ kps, gradeBand: 'middle-school', subject, preset })
}

const NO_META = new Map<string, KpMetadata>()
const NO_MASTERY = new Map<string, MasteryRecord>()

function masteryRecord(kpId: string, score: number, evidenceStatus: MasteryEvidenceStatus): MasteryRecord {
  return { kpId, score, evidenceStatus, lastReviewedAt: 1 }
}

describe('assemblePrepBrief · 课头字段', () => {
  it('课头字段照抄 course,不额外发明', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    expect(brief.courseId).toBe(course.id)
    expect(brief.topic).toBe(course.topic)
    expect(brief.gradeBand).toBe(course.gradeBand)
    expect(brief.subject).toBe(course.subject)
    expect(brief.qualityStatus).toBe(course.qualityStatus)
  })
})

describe('assemblePrepBrief · KP 清单', () => {
  it('无 KP 元数据时:knowledgeType 兜底默认,来源标 默认兜底,误区/目标为空', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    const entry = brief.kps[0]!
    expect(entry.kpId).toBe('kp-1')
    expect(entry.knowledgeType).toBe('conceptual') // DEFAULT_KP_KNOWLEDGE_TYPE
    expect(entry.knowledgeTypeSource).toBe('默认兜底')
    expect(entry.learningObjectives).toEqual([])
    expect(entry.misconceptions).toEqual([])
  })

  it('有 KP 元数据时:知识类型来源标 教材标注,学习目标透传', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'procedural' }], 'math')
    const meta = new Map<string, KpMetadata>([
      ['kp-1', { id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'procedural', learningObjectives: ['能独立完成一道同型题'] }],
    ])
    const brief = assemblePrepBrief(course, meta, NO_MASTERY)
    const entry = brief.kps[0]!
    expect(entry.knowledgeTypeSource).toBe('教材标注')
    expect(entry.learningObjectives).toEqual(['能独立完成一道同型题'])
  })

  // v5 M2 起 ai-verify 找茬幕收编 contrast 之外的全部误区(skeleton-library aiVerifyStepsFor)。
  // 2026-07-27 之前 prep-brief 只认 contrast 幕,把已被 ai-verify 覆盖的误区报成「未处理」,
  // 教师看到假警报。以下测试锁住两类幕都要被认。
  const MISCONCEPTIONS = ['海岸线吻合就是大陆漂移的证据', '板块运动速度肉眼可见']

  it('conceptual KP:第一条归辨析幕,其余归找茬幕——两条都算已处理', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions: MISCONCEPTIONS }])
    const meta = new Map<string, KpMetadata>([
      ['kp-1', { id: 'kp-1', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions: MISCONCEPTIONS }],
    ])
    const brief = assemblePrepBrief(course, meta, NO_MASTERY)
    const [first, second] = brief.kps[0]!.misconceptions
    const contrastScene = course.scenes.find(s => s.sceneType === 'contrast')!
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!

    expect(first!.addressed).toBe(true)
    expect(first!.addressedInSceneId).toBe(contrastScene.id)
    expect(first!.source).toBe('教材标注')

    expect(second!.addressed).toBe(true)
    expect(second!.addressedInSceneId).toBe(verifyScene.id)
  })

  it('教材误区新增或重排后，只按各幕保存的原文溯源认定已处理', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions: MISCONCEPTIONS }])
    const contrastScene = course.scenes.find(s => s.sceneType === 'contrast')!
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!
    const meta = new Map<string, KpMetadata>([
      ['kp-1', {
        id: 'kp-1',
        canonicalName: '海陆变迁',
        knowledgeType: 'conceptual',
        misconceptions: ['后来新增的误区', ...MISCONCEPTIONS],
      }],
    ])

    const [added, contrasted, verified] = assemblePrepBrief(course, meta, NO_MASTERY).kps[0]!.misconceptions
    expect(added).toMatchObject({ text: '后来新增的误区', addressed: false })
    expect(added!.addressedInSceneId).toBeUndefined()
    expect(contrasted).toMatchObject({ text: MISCONCEPTIONS[0], addressed: true, addressedInSceneId: contrastScene.id })
    expect(verified).toMatchObject({ text: MISCONCEPTIONS[1], addressed: true, addressedInSceneId: verifyScene.id })
  })

  it('教材标注刷新后措辞整体漂移 → 报措辞待核对并指向处理幕,不假报「暂无幕处理」', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions: MISCONCEPTIONS }])
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!
    const meta = new Map<string, KpMetadata>([
      ['kp-1', {
        id: 'kp-1',
        canonicalName: '海陆变迁',
        knowledgeType: 'conceptual',
        // 标注被整批改写:与课程幕固化措辞零命中
        misconceptions: MISCONCEPTIONS.map(text => `改写后的表述:${text}`),
      }],
    ])

    for (const m of assemblePrepBrief(course, meta, NO_MASTERY).kps[0]!.misconceptions) {
      expect(m.addressed).toBe(false)
      expect(m.wordingDrift).toBe(true)
      expect(m.reviewSceneId).toBe(verifyScene.id)
    }
  })

  it('procedural KP 无辨析幕:全部误区由找茬幕收编,不得再报「未处理」', () => {
    const course = compile(
      [{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号', '等式两边可以只加一边'] }],
      'math',
    )
    expect(course.scenes.some(s => s.sceneType === 'contrast')).toBe(false)
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!
    const meta = new Map<string, KpMetadata>([
      ['kp-1', { id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号', '等式两边可以只加一边'] }],
    ])
    const brief = assemblePrepBrief(course, meta, NO_MASTERY)
    for (const m of brief.kps[0]!.misconceptions) {
      expect(m.addressed).toBe(true)
      expect(m.addressedInSceneId).toBe(verifyScene.id)
    }
  })

  it('细槽被后续编辑改动,溯源字段仍完整 → 覆盖判定不受影响', () => {
    // domain.ts 注明 aiClaim1..N 是「向前预留、现状渲染器不读」的脚手架,
    // 覆盖依据必须是 misconceptionSource(s),不能是细槽数量。
    const course = compile(
      [{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号', '等式两边可以只加一边'] }],
      'math',
    )
    const verifyIndex = course.scenes.findIndex(s => s.sceneType === 'ai-verify')
    const verifyScene = course.scenes[verifyIndex]!
    // 模拟教师逐页编辑:细槽被删除/改写,但溯源字段不变。
    // 注意必须**删键**而非置空——旧实现数的是键名,键在就照数,置空版两种实现同样通过,
    // 那样的测试没有判别力(2026-07-27 反证时发现)。
    const slots: Record<string, string> = { ...verifyScene.contentSlots, aiClaim: '被改写的说法' }
    delete slots.aiClaim1
    delete slots.aiClaim2
    const edited = { ...verifyScene, contentSlots: slots }
    const scenes = [...course.scenes]
    scenes[verifyIndex] = edited
    const patched = { ...course, scenes }

    const meta = new Map<string, KpMetadata>([
      ['kp-1', { id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号', '等式两边可以只加一边'] }],
    ])
    const brief = assemblePrepBrief(patched, meta, NO_MASTERY)
    for (const m of brief.kps[0]!.misconceptions) {
      expect(m.addressed).toBe(true)
      expect(m.addressedInSceneId).toBe(verifyScene.id)
    }
  })

  it('溯源里没有的误区不算已处理(精确文本匹配,不按位置推算)', () => {
    const course = compile(
      [{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号'] }],
      'math',
    )
    // 元数据比编课时多一条:多出来的那条没有任何幕处理
    const meta = new Map<string, KpMetadata>([
      ['kp-1', { id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号', '后来才补标的另一条误区'] }],
    ])
    const brief = assemblePrepBrief(course, meta, NO_MASTERY)
    const [covered, uncovered] = brief.kps[0]!.misconceptions
    expect(covered!.addressed).toBe(true)
    expect(uncovered!.addressed).toBe(false)
  })

  it('真的没有幕处理时仍如实报未处理(元数据有误区但编课时未带入)', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural' }], 'math')
    expect(course.scenes.some(s => s.sceneType === 'ai-verify')).toBe(false)
    const meta = new Map<string, KpMetadata>([
      ['kp-1', { id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: ['移项不用变号'] }],
    ])
    const brief = assemblePrepBrief(course, meta, NO_MASTERY)
    expect(brief.kps[0]!.misconceptions[0]!.addressed).toBe(false)
  })
})

describe('assemblePrepBrief · 课堂应变计划', () => {
  it('用真实成功信号、支架页和独立练习生成可定位的教学分支', () => {
    const misconceptions = ['把相关现象直接当成因果', '只看结论不核对证据']
    const course = compile([{ id: 'kp-1', canonicalName: '因果判断', knowledgeType: 'conceptual', misconceptions }])
    const meta = new Map<string, KpMetadata>([[
      'kp-1',
      { id: 'kp-1', canonicalName: '因果判断', knowledgeType: 'conceptual', misconceptions },
    ]])
    const fragment = course.learningFragments.find(candidate => candidate.kpId === 'kp-1')!
    const fragmentScenes = fragment.sceneIds.map(id => course.scenes.find(scene => scene.id === id)!)
    const practice = fragmentScenes.filter(scene => scene.sceneType === 'practice').at(-1)!
    const support = fragmentScenes
      .slice(0, fragmentScenes.findIndex(scene => scene.id === practice.id))
      .filter(scene => ['concept-build', 'worked-example', 'visual-observation'].includes(scene.sceneType))
      .at(-1)!

    const plan = assemblePrepBrief(course, meta, NO_MASTERY).kps[0]!.contingencyPlan
    const advance = plan.moves.find(move => move.kind === 'advance')!
    const repair = plan.moves.find(move => move.kind === 'repair')!
    const knownSceneIds = new Set(course.scenes.map(scene => scene.id))

    expect(plan).toMatchObject({ available: true, successSignal: fragment.successSignal, practiceSceneId: practice.id })
    expect(advance.trigger).toContain(fragment.successSignal)
    expect(repair.targetSceneId).toBe(support.id)
    expect(repair.resumeSceneId).toBe(practice.id)
    for (const move of plan.moves) {
      if (move.targetSceneId) expect(knownSceneIds.has(move.targetSceneId)).toBe(true)
      if (move.resumeSceneId) expect(knownSceneIds.has(move.resumeSceneId)).toBe(true)
    }
  })

  it('只为已被真实页面处理的教材误区生成分支，不编造也不替未覆盖误区指路', () => {
    const original = ['移项不用变号']
    const course = compile([{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural', misconceptions: original }], 'math')
    const meta = new Map<string, KpMetadata>([[
      'kp-1',
      {
        id: 'kp-1',
        canonicalName: '移项',
        knowledgeType: 'procedural',
        misconceptions: [...original, '后来新增但课程尚未处理的误区'],
      },
    ]])
    const plan = assemblePrepBrief(course, meta, NO_MASTERY).kps[0]!.contingencyPlan
    const misconceptionMoves = plan.moves.filter(move => move.kind === 'misconception')

    expect(misconceptionMoves).toHaveLength(1)
    expect(misconceptionMoves[0]!.trigger).toContain(original[0])
    expect(misconceptionMoves[0]!.trigger).not.toContain('后来新增')
    expect(course.scenes.some(scene => scene.id === misconceptionMoves[0]!.targetSceneId)).toBe(true)
  })

  it('缺少独立练习时明确停用，不用辨析或找茬冒充完整达成证据', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const practiceIds = new Set(course.scenes.filter(scene => scene.sceneType === 'practice').map(scene => scene.id))
    const patched: MainlineCourse = {
      ...course,
      scenes: course.scenes.filter(scene => !practiceIds.has(scene.id)),
      learningFragments: course.learningFragments.map(fragment => ({
        ...fragment,
        sceneIds: fragment.sceneIds.filter(sceneId => !practiceIds.has(sceneId)),
      })),
    }
    const plan = assemblePrepBrief(patched, NO_META, NO_MASTERY).kps[0]!.contingencyPlan

    expect(plan.available).toBe(false)
    expect(plan.moves).toEqual([])
    expect(plan.missingReason).toContain('没有独立练习')
  })
})

describe('assemblePrepBrief · 学情侧', () => {
  it('无作答记录:score 缺省,isWeakNow=false', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    expect(brief.kps[0]!.mastery.score).toBeUndefined()
    expect(brief.kps[0]!.mastery.isWeakNow).toBe(false)
  })

  it('薄弱分数 → isWeakNow=true;骨架加固痕迹取自持久化 skeletonId 后缀', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', needsReinforcement: true }])
    const mastery = new Map([['kp-1', masteryRecord('kp-1', 0.3, 'provisional-self-assessment')]])
    const brief = assemblePrepBrief(course, NO_META, mastery)
    expect(brief.kps[0]!.mastery.score).toBe(0.3)
    expect(brief.kps[0]!.mastery.evidenceStatus).toBe('provisional-self-assessment')
    expect(brief.kps[0]!.mastery.isWeakNow).toBe(true)
    expect(brief.kps[0]!.mastery.reinforcedInSkeleton).toBe(true)
  })

  it('当前分数已回稳,但生成时的加固痕迹仍如实保留(两者可以不一致)', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', needsReinforcement: true }])
    const mastery = new Map([['kp-1', masteryRecord('kp-1', 0.9, 'verified')]])
    const brief = assemblePrepBrief(course, NO_META, mastery)
    expect(brief.kps[0]!.mastery.isWeakNow).toBe(false)
    expect(brief.kps[0]!.mastery.reinforcedInSkeleton).toBe(true)
  })

  it('把当前分数对应的完整作答证据原样交给教师简报', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
    const record: MasteryRecord = {
      ...masteryRecord('kp-1', 0.68, 'provisional-self-assessment'),
      latestEvidence: {
        submittedAt: 1_755_778_400_000,
        outcome: 'correct',
        confidence: 'high',
        calibration: 'calibrated',
        evidenceBasis: 'self-assessed-after-feedback',
        scoreStatus: 'provisional',
        practiceSnapshot: { task: '判断并说明依据。', feedback: '根据条件核对结论。' },
        objectiveCriteria: [{ objectiveId: 'goal-1', successSignal: '能说明关键依据。', alignment: 'kp-specific' }],
        attemptText: '我的原答案。',
        reflectionText: '反馈后的关键依据。',
      },
    }

    expect(assemblePrepBrief(course, NO_META, new Map([['kp-1', record]])).kps[0]!.mastery.latestEvidence)
      .toEqual(record.latestEvidence)
  })

  it.each(['seeded-demo', 'legacy-unattributed'] as const)(
    '%s 的低分只披露来源，不得在备课简报中判成当前薄弱',
    evidenceStatus => {
      const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
      const mastery = new Map([['kp-1', masteryRecord('kp-1', 0.2, evidenceStatus)]])
      const note = assemblePrepBrief(course, NO_META, mastery).kps[0]!.mastery

      expect(note).toMatchObject({ score: 0.2, evidenceStatus, isWeakNow: false })
    },
  )
})

describe('assemblePrepBrief · 事实核查摘要', () => {
  it('course.factAudit 缺失(未 fill 或未核查)时优雅降级为 available:false', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    expect(brief.factAudit.available).toBe(false)
    expect(brief.factAudit.consistencyAvailable).toBe(false)
    expect(brief.factAudit.byScene).toEqual([])
  })

  it('按幕汇总 FATAL/MISLEADING/IMPRECISE 计数,未验证 info 标 unverified', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const sceneA = course.scenes[1]!.id // visual-observation
    const sceneB = course.scenes[2]!.id // concept-build
    const factAudit: FactAuditRecord = {
      auditedAt: '2026-07-20T00:00:00.000Z',
      auditedSceneCount: 2,
      fatalCount: 1,
      issues: [
        { id: 'i1', severity: 'blocking', targetId: sceneA, message: '断言核查 FATAL:「水的沸点是 90℃」', impact: '错误事实', fix: '改为 100℃' },
        { id: 'i2', severity: 'warning', targetId: sceneA, message: '断言核查 MISLEADING:「重的东西下落快」', impact: '缺条件', fix: '补条件限定' },
        { id: 'i3', severity: 'warning', targetId: sceneB, message: '断言核查 IMPRECISE:「声速约 340 米每秒」', impact: '简化过度', fix: '补温度条件' },
        { id: 'i4', severity: 'info', targetId: sceneB, message: '事实核查未完成(核查服务失败),本幕断言未经验证。', impact: '可能未被发现', fix: '重跑 fill' },
      ],
    }
    const courseWithAudit: MainlineCourse = { ...course, factAudit }
    const brief = assemblePrepBrief(courseWithAudit, NO_META, NO_MASTERY)

    expect(brief.factAudit.available).toBe(true)
    expect(brief.factAudit.fatalCount).toBe(2)
    expect(brief.factAudit.auditedSceneCount).toBe(2)
    expect(brief.factAudit.unverifiedSceneCount).toBe(1)
    expect(brief.factAudit.consistencyAvailable).toBe(false)

    const entryA = brief.factAudit.byScene.find(e => e.sceneId === sceneA)!
    expect(entryA.fatalCount).toBe(1)
    expect(entryA.misleadingCount).toBe(1)
    expect(entryA.unverified).toBe(false)

    const entryB = brief.factAudit.byScene.find(e => e.sceneId === sceneB)!
    expect(entryB.impreciseCount).toBe(1)
    expect(entryB.unverified).toBe(true)
  })

  it('显式未验证集合会进入汇总，且和教师手改待核查页分别计数', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const pendingScene = course.scenes[1]!
    const unverifiedScene = course.scenes[2]!
    const brief = assemblePrepBrief({
      ...course,
      qualityStatus: 'blocked',
      factAudit: {
        auditedSceneIds: [],
        requiredSceneIds: [pendingScene.id, unverifiedScene.id],
        unverifiedSceneIds: [unverifiedScene.id],
        pendingSceneIds: [pendingScene.id],
        auditedSceneCount: 0,
        fatalCount: 0,
        issues: [],
      },
    }, NO_META, NO_MASTERY)

    expect(brief.factAudit.pendingSceneCount).toBe(1)
    expect(brief.factAudit.unverifiedSceneCount).toBe(1)
    expect(brief.factAudit.byScene).toEqual(expect.arrayContaining([
      expect.objectContaining({ sceneId: pendingScene.id, pendingReview: true, unverified: false }),
      expect.objectContaining({ sceneId: unverifiedScene.id, pendingReview: false, unverified: true }),
    ]))
  })

  it('区分旧课未运行跨页检查与新课已检查，并正确汇总跨页冲突', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const target = course.scenes[2]!
    const checkedCourse: MainlineCourse = {
      ...course,
      factAudit: {
        auditedSceneIds: [],
        consistencyAuditedSceneIds: course.scenes.map(scene => scene.id),
        consistencyConflictCount: 1,
        pendingSceneIds: [],
        auditedSceneCount: 0,
        fatalCount: 1,
        issues: [{
          id: `pedagogy:scene:${target.id}:consistency-1`,
          severity: 'blocking',
          targetId: target.id,
          message: '跨幕一致性核查 FATAL:第 2 页与第 3 页的答案冲突',
          impact: '同题出现两个答案',
          fix: '核对题目条件并统一答案',
        }],
      },
    }

    const brief = assemblePrepBrief(checkedCourse, NO_META, NO_MASTERY)

    expect(brief.factAudit.consistencyAvailable).toBe(true)
    expect(brief.factAudit.consistencyAuditedSceneCount).toBe(course.scenes.length)
    expect(brief.factAudit.consistencyConflictCount).toBe(1)
    expect(brief.factAudit.byScene[0]).toMatchObject({
      sceneId: target.id,
      fatalCount: 1,
      unverified: false,
    })
  })

  it('教师手改后的待核查页单独显示，不能冒充“没有发现事实问题”', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const scene = course.scenes[2]!
    const courseWithPending: MainlineCourse = {
      ...course,
      qualityStatus: 'blocked',
      factAudit: {
        auditedSceneIds: [],
        pendingSceneIds: [scene.id],
        auditedSceneCount: 0,
        fatalCount: 0,
        issues: [],
      },
    }
    const brief = assemblePrepBrief(courseWithPending, NO_META, NO_MASTERY)

    expect(brief.factAudit.available).toBe(true)
    expect(brief.factAudit.pendingSceneCount).toBe(1)
    expect(brief.factAudit.byScene).toHaveLength(1)
    expect(brief.factAudit.byScene[0]).toMatchObject({
      sceneId: scene.id,
      pendingReview: true,
      unverified: false,
    })
    expect(brief.factAudit.byScene[0]!.details[0]!.fix).toContain('核查本页')
  })

  it('透出自动事实修正轨迹，让教师知道修了几轮以及为何仍阻断', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const sceneId = course.scenes[2]!.id
    const courseWithTrace: MainlineCourse = {
      ...course,
      qualityStatus: 'blocked',
      factAudit: {
        auditedSceneIds: [sceneId],
        pendingSceneIds: [],
        auditedSceneCount: 1,
        fatalCount: 1,
        repairTrace: {
          maxAttempts: 2,
          stoppedReason: 'max-attempts',
          attempts: [{
            attempt: 1,
            scope: 'blocking-and-warning',
            attemptedSceneIds: [sceneId],
            repairedSceneIds: [sceneId],
            skipped: [],
            failed: [],
            remainingBlockingCount: 1,
            remainingWarningCount: 0,
          }, {
            attempt: 2,
            scope: 'blocking-only',
            attemptedSceneIds: [sceneId],
            repairedSceneIds: [sceneId],
            skipped: [],
            failed: [],
            remainingBlockingCount: 1,
            remainingWarningCount: 0,
          }],
        },
        issues: [{
          id: 'fatal',
          severity: 'blocking',
          targetId: sceneId,
          message: '断言核查 FATAL:「错误断言」',
          impact: '与教材不符',
          fix: '按教材修正',
        }],
      },
    }

    const brief = assemblePrepBrief(courseWithTrace, NO_META, NO_MASTERY)

    expect(brief.factAudit.repairTrace).toMatchObject({
      maxAttempts: 2,
      stoppedReason: 'max-attempts',
    })
    expect(brief.factAudit.repairTrace?.attempts).toHaveLength(2)
  })
})

describe('assemblePrepBrief · 骨架依据', () => {
  it('还原片段实际使用的骨架形状(teachingType/steps),successSignal 直接取持久化值', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    const rationale = brief.skeletonRationale.find(r => r.kpId === 'kp-1')!
    expect(rationale.teachingType).toBe('观察建构')
    expect(rationale.steps.map(s => s.sceneType)).toEqual(['visual-observation', 'concept-build', 'practice'])
    expect(rationale.successSignal).toBe(course.learningFragments.find(f => f.kpId === 'kp-1')!.successSignal)
    expect(rationale.reinforced).toBe(false)
  })

  it('备课依据使用同一份误区元数据重放骨架,不会把真实辨析页漏掉', () => {
    const misconceptions = ['把现象相关当成因果关系']
    const course = compile([{
      id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual', misconceptions,
    }])
    const meta = new Map<string, KpMetadata>([[
      'kp-1',
      { id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual', misconceptions },
    ]])
    const rationale = assemblePrepBrief(course, meta, NO_MASTERY).skeletonRationale.find(r => r.kpId === 'kp-1')!

    expect(rationale.steps.map(step => step.sceneType)).toEqual(['visual-observation', 'concept-build', 'contrast', 'practice'])
  })

  it('薄弱加固课的骨架依据带加固步骤且 reinforced=true', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', needsReinforcement: true }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    const rationale = brief.skeletonRationale.find(r => r.kpId === 'kp-1')!
    expect(rationale.reinforced).toBe(true)
    expect(rationale.teachingType).toContain('薄弱加固')
    expect(rationale.steps.at(-1)).toEqual({ sceneType: 'practice', role: '薄弱加固再练', executor: 'ai', durationTargetSec: 40 })
  })

  it('课级片段(开场/收束,无 kpId)不进骨架依据清单', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
    const briefRationaleFragmentIds = new Set(
      assemblePrepBrief(course, NO_META, NO_MASTERY).skeletonRationale.map(r => r.fragmentId),
    )
    const introOrRecap = course.learningFragments.filter(f => !f.kpId)
    expect(introOrRecap.length).toBeGreaterThan(0)
    for (const f of introOrRecap) expect(briefRationaleFragmentIds.has(f.id)).toBe(false)
  })
})

describe('assemblePrepBrief · 质量状态摘要', () => {
  it('复用 quality-gates 的 summarize:结构完整但只有 KP 名称时 0 blocking → passed-with-warnings', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    expect(brief.qualitySummary.blocking).toBe(0)
    expect(brief.qualitySummary.warning).toBeGreaterThan(0)
    expect(brief.qualitySummary.status).toBe('passed-with-warnings')
    expect(brief.qualitySummary.source).toBe('质量闸门')
  })
})

describe('assemblePrepBrief · 真检呈现诊断', () => {
  it('命中项进入独立清单，并明确不改变课程通过状态', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '二力平衡', knowledgeType: 'conceptual' }], 'physics')
    const sourceTitle = course.sourceMaterial[0]!.title
    const patched: MainlineCourse = {
      ...course,
      scenes: course.scenes.map((scene, index) => index === 0 ? { ...scene, visualFocus: sourceTitle } : scene),
    }
    const brief = assemblePrepBrief(patched, NO_META, NO_MASTERY)
    const duplicate = brief.presentationReview.findings.find(finding => finding.ruleId === 'intro-title-duplication')

    expect(duplicate).toMatchObject({ sceneNumber: 1, sceneType: 'source-reading', severity: 'medium' })
    expect(duplicate!.evidence[0]!.reportPath).toBe('docs/real-check/2026-07-23-production/REPORT.md')
    expect(brief.presentationReview.blocking).toBe(false)
    expect(brief.presentationReview.source).toBe('真检判例')
    expect(brief.qualityStatus).toBe(course.qualityStatus)
  })

  it('计数与排序结果一致，不把呈现建议混入质量闸门统计', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '二力平衡', knowledgeType: 'conceptual' }], 'physics')
    const source = course.scenes[0]!
    const patched: MainlineCourse = {
      ...course,
      scenes: course.scenes.map((scene, index) => index === 0
        ? { ...scene, visualFocus: course.sourceMaterial[0]!.title, contentSlots: { ...source.contentSlots, forceVector: 'mg|重力|50|N|270|gravity' } }
        : scene),
    }
    const brief = assemblePrepBrief(patched, NO_META, NO_MASTERY)
    const review = brief.presentationReview

    expect(review.high + review.medium + review.low).toBe(review.findings.length)
    expect(review.findings[0]!.severity).toBe('high')
    expect(brief.qualitySummary.source).toBe('质量闸门')
  })
})

describe('assemblePrepBrief · 人机分工简报(executorBreakdown,v5 M2 WP8)', () => {
  it('按 sceneExecutor 汇总幕数和骨架逐页时长(conceptual 另含 AI 独立练习)', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    const byExecutor = new Map(brief.executorBreakdown.byExecutor.map(e => [e.executor, e]))

    // 无误区来源时不凑辨析页：开场 60s;概念片段观察 35s/建构 45s/独立练习 50s;收束 60s。
    expect(byExecutor.get('teacher')).toEqual({ executor: 'teacher', sceneCount: 0, estimatedDurationSec: 0 })
    expect(byExecutor.get('co')).toEqual({ executor: 'co', sceneCount: 3, estimatedDurationSec: 175 })
    expect(byExecutor.get('ai')).toEqual({ executor: 'ai', sceneCount: 2, estimatedDurationSec: 85 })
    expect(brief.executorBreakdown.totalDurationSec).toBe(260)
    expect(brief.executorBreakdown.source).toBe('骨架库')
  })

  it('存量课缺少逐页时长时，仍按片段总时长平均估算，不强制迁移', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '甲知识点', knowledgeType: 'conceptual' }])
    for (const scene of course.scenes) delete scene.durationTargetSec
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    const byExecutor = new Map(brief.executorBreakdown.byExecutor.map(entry => [entry.executor, entry]))

    expect(byExecutor.get('teacher')?.estimatedDurationSec).toBe(0)
    expect(byExecutor.get('co')?.estimatedDurationSec).toBe(167)
    expect(byExecutor.get('ai')?.estimatedDurationSec).toBe(93)
    expect(brief.executorBreakdown.totalDurationSec).toBe(260)
  })

  it('没有任何幕落在某执教者上时,该项如实为 0(不是缺省 undefined)——procedural 骨架没有 teacher 幕', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural' }], 'math')
    const brief = assemblePrepBrief(course, NO_META, NO_MASTERY)
    const teacherEntry = brief.executorBreakdown.byExecutor.find(e => e.executor === 'teacher')!
    expect(teacherEntry.sceneCount).toBe(0)
    expect(teacherEntry.estimatedDurationSec).toBe(0)
  })

  it('教师手改某幕 executor 后,简报按新分工重新统计(与逐页 PATCH 的教学决策语义一致)', () => {
    const course = compile([{ id: 'kp-1', canonicalName: '移项', knowledgeType: 'procedural' }], 'math')
    const practice = course.scenes.find(s => s.sceneType === 'practice')!
    const patched: MainlineCourse = {
      ...course,
      scenes: course.scenes.map(s => (s.id === practice.id ? { ...s, executor: 'teacher' } : s)),
    }
    const brief = assemblePrepBrief(patched, NO_META, NO_MASTERY)
    const byExecutor = new Map(brief.executorBreakdown.byExecutor.map(e => [e.executor, e]))
    expect(byExecutor.get('teacher')!.sceneCount).toBe(1)
    expect(byExecutor.get('ai')!.sceneCount).toBe(2) // concept-build 与 worked-example 仍是 ai,practice 已改走
  })
})

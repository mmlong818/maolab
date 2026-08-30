import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { auditCoursePlanningState, blockingPagePlanIssues } from '../page-audit.js'
import { PAGE_PLAN_SCHEMA_VERSION, type CoursePlanningState } from '../page-contract.js'
import { buildCoursePlanningState } from '../page-first-planner.js'
import { PAGE_FRAGMENT_SKELETONS } from '../page-skeleton-library.js'

function plan(
  kps: Parameters<typeof compileLessonFromKps>[0]['kps'],
  groundingByKp?: Parameters<typeof compileLessonFromKps>[0]['groundingByKp'],
) {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  const course = compileLessonFromKps({
    courseId: 'course-page-plan-test',
    kps,
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
    ...(groundingByKp ? { groundingByKp } : {}),
  })
  return {
    course,
    planning: buildCoursePlanningState({
      courseId: course.id,
      topic: course.topic,
      subject: course.subject,
      goals: course.goals,
      kps,
      sourceMaterial: course.sourceMaterial,
    }),
  }
}

function learningTask(goal: string): string {
  return goal.trim().replace(/^能(?=[\p{Script=Han}A-Za-z0-9《“'"])/u, '')
}

describe('投影片先行规划', () => {
  it('新课在正文填充前保存独立页面规划，页面不再依赖场景 ID', () => {
    const { course, planning } = plan([{
      id: 'kp-poem',
      canonicalName: '重章叠句的表达效果',
      knowledgeType: 'conceptual',
      misconceptions: ['重复的句子没有表达作用'],
    }])

    expect(course.planning).toEqual(planning)
    expect(planning.pages.every(page => !('sourceSceneId' in page))).toBe(true)
    expect(planning.schemaVersion).toBe(PAGE_PLAN_SCHEMA_VERSION)
    expect(planning.planRevisionId).toBe('course-page-plan-test:plan:1')
    expect(planning.status).toBe('planning')
    expect(planning.learningContracts).toEqual([
      expect.objectContaining({ kpId: 'kp-poem', goalId: course.goals[0]?.id }),
    ])
    expect(planning.pages[0]).toMatchObject({ order: 1, purpose: 'orient', audience: 'student' })
    expect(blockingPagePlanIssues(planning)).toEqual([])
  })

  it('页面骨架只使用学习动作和页面目的，不再以 sceneType 决定页序', () => {
    expect(JSON.stringify(PAGE_FRAGMENT_SKELETONS)).not.toContain('sceneType')
    const { planning } = plan([{
      id: 'kp-poem',
      canonicalName: '重章叠句的表达效果',
      knowledgeType: 'conceptual',
      misconceptions: ['重复的句子没有表达作用'],
    }])

    expect({
      arc: planning.arc.steps.map(step => `${step.action}:${step.pagePurposes.join('+')}`),
      pages: planning.pages.map(page => page.purpose),
    }).toMatchInlineSnapshot(`
      {
        "arc": [
          "orient:orient",
          "map-course:structure",
          "observe:observe",
          "explain:explain",
          "judge-and-revise:question+answer",
          "practice-and-revise:practice+feedback",
          "recap:recap",
          "transfer-and-revise:transfer+feedback",
        ],
        "pages": [
          "orient",
          "structure",
          "observe",
          "explain",
          "question",
          "answer",
          "practice",
          "feedback",
          "recap",
          "transfer",
          "feedback",
        ],
      }
    `)
  })

  it('同一输入和 courseId 产生完全相同的页面数量、顺序和配对关系', () => {
    const input = [{
      id: 'kp-procedure',
      canonicalName: '概括段落大意',
      knowledgeType: 'procedural' as const,
    }]
    const first = plan(input).planning
    const second = plan(input).planning

    expect(second).toEqual(first)
    expect(first.pages.map(page => page.order)).toEqual(first.pages.map((_, index) => index + 1))
  })

  it('提问与答案是相邻但不同的真实页面，并相互引用', () => {
    const { planning } = plan([{
      id: 'kp-poem',
      canonicalName: '重章叠句的表达效果',
      knowledgeType: 'conceptual',
      misconceptions: ['重复的句子没有表达作用'],
    }])
    const prompt = planning.pages.find(page => page.purpose === 'question')!
    const answer = planning.pages.find(page => page.pairId === prompt.pairId && page.pairRole === 'response')!

    expect(prompt.id).not.toBe(answer.id)
    expect(answer.order).toBe(prompt.order + 1)
    expect(prompt.contentSpec).toMatchObject({
      kind: 'question',
      answerPolicy: 'separate-following-page',
      responsePageId: answer.id,
    })
    expect(answer.contentSpec).toMatchObject({ kind: 'answer', questionPageId: prompt.id })
    expect(JSON.stringify(prompt.contentSpec)).not.toMatch(/conclusion|correction/)
  })

  it('薄弱加固的两组反馈分别绑定对应练习目标', () => {
    const { planning } = plan([{
      id: 'kp-reinforced',
      canonicalName: '移项',
      knowledgeType: 'procedural',
      needsReinforcement: true,
    }])
    const feedbackPages = planning.pages.filter(page => (
      page.fragmentId === 'fragment:kp-reinforced' && page.purpose === 'feedback'
    ))

    expect(feedbackPages).toHaveLength(2)
    expect(feedbackPages[0]?.learningAction).toContain('移项')
    expect(feedbackPages[1]?.learningAction).toContain('移项（第 2 次练习）')
    expect(feedbackPages[0]?.newInformation).not.toBe(feedbackPages[1]?.newInformation)
    expect(auditCoursePlanningState(planning).filter(issue => issue.code === 'semantic-duplicate')).toEqual([])
  })

  it('多条找茬严格按一条一组问题页和核查页规划', () => {
    const { planning } = plan([{
      id: 'kp-fact',
      canonicalName: '史料证据判断',
      knowledgeType: 'factual',
      misconceptions: ['第一条错误说法', '第二条错误说法', '第三条错误说法'],
    }])
    const verificationSteps = planning.arc.steps.filter(step => step.role.startsWith('误区核查'))
    const verifyPages = planning.pages.filter(page => verificationSteps.some(step => step.id === page.arcStepId))

    expect(verificationSteps).toHaveLength(3)
    expect(verifyPages).toHaveLength(6)
    expect(verifyPages.map(page => page.pairRole)).toEqual([
      'prompt', 'response', 'prompt', 'response', 'prompt', 'response',
    ])
  })

  it('正式学习目标是课程结构和逐页任务的唯一来源', () => {
    const { course, planning } = plan([{
      id: 'kp-poem',
      canonicalName: '《芣苢》中叠词与重章叠句的表达效果',
      knowledgeType: 'conceptual',
      learningObjectives: [
        '能识别《芣苢》中“采采”等叠词及其表意功能',
        '理解重章叠句在节奏、情感与劳动场景再现中的作用',
        '能结合诗句分析六组动作动词的层进性与画面感',
      ],
    }])
    const officialGoal = course.goals[0]!.statement
    const structure = planning.pages.find(page => page.purpose === 'structure')
    const orientation = planning.pages.find(page => page.purpose === 'orient')
    const observe = planning.pages.find(page => page.purpose === 'observe')
    const explain = planning.pages.find(page => page.purpose === 'explain')
    const practice = planning.pages.find(page => page.purpose === 'practice')

    expect(structure?.contentSpec).toMatchObject({
      kind: 'course-structure',
      items: [{ title: '提出学习问题' }, { title: learningTask(officialGoal) }, { title: '迁移应用并修正' }],
    })
    expect(orientation?.contentSpec).toMatchObject({
      kind: 'course-orientation',
      goalStatements: [officialGoal],
    })
    expect(observe?.contentSpec).toMatchObject({ kind: 'observation', focus: learningTask(officialGoal) })
    expect(observe?.visualSpec).toMatchObject({ required: true, form: 'source-text' })
    expect(observe?.evidenceExpected).toContain(learningTask(officialGoal))
    expect(explain?.evidenceExpected).toContain(learningTask(officialGoal))
    expect(practice?.contentSpec).toMatchObject({ kind: 'practice', taskGoal: learningTask(officialGoal) })
    expect(practice?.evidenceExpected).toContain(learningTask(officialGoal))
    expect(JSON.stringify(planning.pages)).not.toContain('重章叠句在节奏、情感与劳动场景再现中的作用')
  })

  it('逐页规划不把生成流程当作学生页面内容', () => {
    const { planning } = plan([{
      id: 'kp-poem',
      canonicalName: '重章叠句的表达效果',
      knowledgeType: 'conceptual',
      misconceptions: ['重复的句子没有表达作用'],
    }])

    expect(JSON.stringify(planning.pages)).not.toMatch(/下一张真实投影片|后续真实投影片|页面计划|保留学生的原始|留下原始答案|保存学生的原始作答|原始答案和依据/)
    expect(blockingPagePlanIssues(planning)).toEqual([])
  })

  it('有权威原文时，在课程结构后规划独立完整材料页', () => {
    const { planning } = plan(
      [{ id: 'kp-poem', canonicalName: '《芣苢》重章叠句', knowledgeType: 'conceptual' }],
      {
        'kp-poem': {
          excerpt: '采采芣苢，薄言采之。',
          citation: '《诗经·周南》',
          provenance: { source: 'textbook', evidenceStatus: 'authoritative-excerpt' },
        },
      },
    )
    const sourcePage = planning.pages.find(page => page.purpose === 'source')
    const transferPage = planning.pages.find(page => page.purpose === 'transfer')
    const transferFeedback = planning.pages.find(page => page.purpose === 'feedback' && page.pairId === transferPage?.pairId)

    expect(sourcePage?.contentSpec).toMatchObject({
      kind: 'source-material',
      title: '《芣苢》重章叠句',
      preserveFullText: true,
    })
    expect(sourcePage?.visualSpec).toMatchObject({ required: true, form: 'source-text' })
    expect(transferPage?.sourceRefs).toEqual([])
    expect(transferFeedback?.sourceRefs).toEqual([])
  })

  it('只有课程目录定位时不把来源误标为可引用证据', () => {
    const { planning } = plan(
      [{ id: 'kp-metadata', canonicalName: '勾股定理的应用', knowledgeType: 'procedural' }],
      {
        'kp-metadata': {
          citation: '课程目录来源 pep-cn，节点 unit-1（仅用于教材定位）',
          provenance: { source: 'pep-cn', evidenceStatus: 'curriculum-metadata' },
        },
      },
    )

    expect(planning.learningContracts[0]?.sourceEvidence).toEqual([])
    expect(planning.pages.every(page => page.sourceRefs.length === 0)).toBe(true)
    expect(planning.pages.some(page => page.purpose === 'source')).toBe(false)
  })

  it('语言课没有教材摘录时使用课堂自编短语料而不伪装成原文', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'english' })
    const kps = [{
      id: 'kp-english',
      canonicalName: 'have/has 与 be 的语义分工',
      knowledgeType: 'conceptual' as const,
      learningObjectives: ['能根据描述对象选择 have/has 或 be'],
    }]
    const course = compileLessonFromKps({
      courseId: 'course-english-metadata',
      kps,
      gradeBand: 'middle-school',
      subject: 'english',
      preset,
      groundingByKp: {
        'kp-english': {
          citation: '课程目录来源 pep-cn（仅用于教材定位）',
          provenance: { source: 'pep-cn', evidenceStatus: 'curriculum-metadata' },
        },
      },
    })
    const planning = buildCoursePlanningState({
      courseId: course.id,
      topic: course.topic,
      subject: course.subject,
      goals: course.goals,
      kps,
      sourceMaterial: course.sourceMaterial,
    })
    const observe = planning.pages.find(page => page.purpose === 'observe')

    expect(observe?.sourceRefs).toEqual([])
    expect(observe?.visualSpec).toMatchObject({
      required: true,
      form: 'source-text',
      sourceAssetPolicy: 'grounded-or-generate',
    })
    expect(observe).toBeDefined()
    expect(observe!.newInformation).not.toContain('原文')
    expect(observe!.contentSpec).toMatchObject({
      kind: 'observation',
      requiredEvidence: expect.not.stringContaining('原文'),
    })
  })

  it('非语言课按任务语义区分文字数据与必须观察的图像', () => {
    const chemistry = buildCoursePlanningState({
      courseId: 'course-chemistry-visual', topic: '质量守恒定律', subject: 'chemistry',
      goals: [{ id: 'goal-chemistry', kpId: 'kp-chemistry', statement: '能根据反应前后质量数据说明质量守恒', successSignal: '能列式核对反应前后总质量。', nonGoals: [] }],
      kps: [{ id: 'kp-chemistry', canonicalName: '质量守恒定律', knowledgeType: 'conceptual' }],
      sourceMaterial: [],
    })
    const physics = buildCoursePlanningState({
      courseId: 'course-physics-visual', topic: '二力平衡', subject: 'physics',
      goals: [{ id: 'goal-physics', kpId: 'kp-physics', statement: '能从受力图判断两个力是否平衡', successSignal: '能从受力图逐项核对四个条件。', nonGoals: [] }],
      kps: [{ id: 'kp-physics', canonicalName: '二力平衡', knowledgeType: 'conceptual' }],
      sourceMaterial: [],
    })

    expect(chemistry.pages.find(page => page.purpose === 'observe')?.visualSpec).toMatchObject({
      required: true,
      form: 'source-text',
    })
    expect(physics.pages.find(page => page.purpose === 'observe')?.visualSpec).toMatchObject({
      required: true,
      form: 'instructional-image',
    })
  })

  it('依赖经纬网的例题、练习和迁移页都要求教学图，反馈页沿用同一图', () => {
    const geography = buildCoursePlanningState({
      courseId: 'course-geography-grid', topic: '经纬网坐标读取与定位', subject: 'geography',
      goals: [{ id: 'goal-geography', kpId: 'kp-geography', statement: '能按步骤完成经纬网坐标读取与定位', successSignal: '能在经纬网上定位给定坐标。', nonGoals: [] }],
      kps: [{ id: 'kp-geography', canonicalName: '经纬网坐标读取与定位', knowledgeType: 'procedural' }],
      sourceMaterial: [],
    })
    const pairedPurposes = new Set(['question', 'worked-step', 'practice', 'feedback', 'transfer'])
    const taskPages = geography.pages.filter(page => pairedPurposes.has(page.purpose))

    expect(taskPages.length).toBeGreaterThanOrEqual(6)
    expect(taskPages.every(page => (
      page.visualSpec.required
      && page.visualSpec.form === 'instructional-image'
      && page.visualSpec.sourceAssetPolicy === 'grounded-or-generate'
    ))).toBe(true)
  })

  it('审计会阻断同页式答案链接和内部生成文字', () => {
    const planning = structuredClone(plan([{
      id: 'kp-poem',
      canonicalName: '重章叠句的表达效果',
      knowledgeType: 'conceptual',
      misconceptions: ['重复的句子没有表达作用'],
    }]).planning) as CoursePlanningState
    const prompt = planning.pages.find(page => page.purpose === 'question')!
    prompt.newInformation = '待 LLM 填充内部字段'
    if (prompt.contentSpec.kind === 'question') prompt.contentSpec.responsePageId = prompt.id

    const issues = auditCoursePlanningState(planning)
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['internal-text', 'response-link']))
  })
})

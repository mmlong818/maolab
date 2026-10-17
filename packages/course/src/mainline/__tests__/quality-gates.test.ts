import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { pickCastPreset } from '../generation/cast-preset.js'
import { compileLessonFromKps } from '../generation/compile-lesson.js'
import {
  STUDENT_PROJECTION_META_ISSUE_MESSAGE,
  auditMainlineCourse,
  blockingQualityIssues,
  studentProjectionMetaProblems,
  summarizeQuality,
} from '../quality-gates.js'

function compileConceptualWithMisconceptions(misconceptions: string[]) {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
  return withConcreteTransferTask(compileLessonFromKps({
    kps: [{ id: 'kp-m', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions }],
    gradeBand: 'middle-school',
    subject: 'geography',
    preset,
  }))
}

function compileTwoKps() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
  return withConcreteTransferTask(compileLessonFromKps({
    kps: [
      { id: 'kp-a', canonicalName: '海陆变迁证据', knowledgeType: 'conceptual' },
      { id: 'kp-b', canonicalName: '板块运动事实', knowledgeType: 'factual' },
    ],
    gradeBand: 'middle-school', subject: 'geography', preset,
  }))
}

function withConcreteTransferTask<T extends ReturnType<typeof compileLessonFromKps>>(course: T): T {
  const recap = course.scenes.find(scene => scene.sceneType === 'recap')
  if (recap) recap.contentSlots.transferTask = '如果只换成一条新的地理证据，判断原结论是否仍成立并说明依据。'
  return course
}

describe('mainline quality gates', () => {
  it('阻止把备课流程说明投给学生，同时允许直接呈现已有信息', () => {
    const course = compileTwoKps()
    const scene = course.scenes[0]!
    scene.contentSlots.completionPrompt = '已完成前两步“确认状态并画出四个力”，你现在只需完成下一步。'

    expect(studentProjectionMetaProblems(scene)).toEqual(expect.arrayContaining([
      expect.stringContaining('已完成前两步'),
    ]))
    expect(auditMainlineCourse(course)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'blocking',
        targetId: scene.id,
        targetType: 'scene',
        message: STUDENT_PROJECTION_META_ISSUE_MESSAGE,
      }),
    ]))

    scene.contentSlots.completionPrompt = '木块向右匀速滑动，受拉力 6 N。逐条判断拉力与摩擦力是否满足二力平衡条件。'
    expect(studentProjectionMetaProblems(scene)).toEqual([])
  })

  it('按口语化后的口播时长检查讲稿，并给新课保留 20% 学生活动时间', () => {
    const course = compileTwoKps()
    const scene = course.scenes.find(candidate => candidate.sceneType === 'concept-build')!
    scene.durationTargetSec = 60
    scene.voiceCue = { ...scene.voiceCue, pace: 'medium' }

    scene.teacherScript = String.raw`${'\\(\\frac{x}{y}\\)'.repeat(20)} 说出每一步的依据。`
    expect(scene.teacherScript.length).toBeGreaterThan(220)
    expect(auditMainlineCourse(course).some(issue => issue.targetId === scene.id && issue.message === '讲稿挤占学生作答时间。')).toBe(false)

    scene.teacherScript = '讲'.repeat(193)
    expect(auditMainlineCourse(course).some(issue => issue.targetId === scene.id && issue.message === '讲稿挤占学生作答时间。')).toBe(true)

    scene.teacherScript = '讲'.repeat(191)
    expect(auditMainlineCourse(course).some(issue => issue.targetId === scene.id && issue.message === '讲稿挤占学生作答时间。')).toBe(false)
  })

  it('认知节奏按单页检查，不再把多页片段总时长误报为一次负荷', () => {
    const course = compileConceptualWithMisconceptions(['误区一', '误区二', '误区三'])
    const kpFragment = course.learningFragments.find(fragment => fragment.kpId === 'kp-m')!
    expect(kpFragment.durationTargetSec).toBe(225)
    expect(course.scenes.every(scene => (scene.durationTargetSec ?? 0) <= 60)).toBe(true)

    const messages = auditMainlineCourse(course).map(issue => issue.message)
    expect(messages).not.toContain('学习片段过长。')
    expect(messages).not.toContain('单幕节奏过长。')
  })

  it('单页超过 60 秒时提醒拆分，60 秒边界不误报', () => {
    const course = compileTwoKps()
    const scene = course.scenes.find(candidate => candidate.sceneType === 'concept-build')!
    scene.durationTargetSec = 61
    expect(auditMainlineCourse(course).some(issue => issue.targetId === scene.id && issue.message === '单幕节奏过长。')).toBe(true)

    scene.durationTargetSec = 60
    expect(auditMainlineCourse(course).some(issue => issue.targetId === scene.id && issue.message === '单幕节奏过长。')).toBe(false)
  })

  it('显式的非法单页时长阻断，存量课缺省时保持兼容', () => {
    const course = compileTwoKps()
    const scene = course.scenes[0]!
    scene.durationTargetSec = 0
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).toContain('单幕时长无效。')

    delete scene.durationTargetSec
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).not.toContain('单幕时长无效。')
  })

  it('新课的片段总时长必须等于逐页求和，存量课缺逐页时长时不阻断', () => {
    const course = compileTwoKps()
    const fragment = course.learningFragments.find(candidate => candidate.kpId === 'kp-a')!
    fragment.durationTargetSec += 1
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .toContain('学习片段总时长与逐幕时长不一致。')

    for (const scene of course.scenes.filter(candidate => fragment.sceneIds.includes(candidate.id))) {
      delete scene.durationTargetSec
    }
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .not.toContain('学习片段总时长与逐幕时长不一致。')
  })

  it('新编译多知识点课程形成 KP→目标→片段→评价闭环', () => {
    const course = compileTwoKps()
    expect(blockingQualityIssues(auditMainlineCourse(course))).toEqual([])
    expect(course.goals.map(goal => goal.kpId)).toEqual(['kp-a', 'kp-b'])
  })

  it('阻断把任意自造键保存成知识页，避免渲染器读不到实际内容', () => {
    const course = compileTwoKps()
    course.qualityStatus = 'passed'
    const scene = course.scenes.find(candidate => candidate.sceneType === 'concept-build')!
    scene.contentSlots = { a: '模型自造字段一', b: '模型自造字段二' }

    const issues = blockingQualityIssues(auditMainlineCourse(course))
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: scene.id,
        message: '专属页面缺少真实渲染器需要的核心内容。',
      }),
    ]))
    expect(issues.find(issue => issue.targetId === scene.id)?.fix).toContain('contentSlots.statement')
    expect(issues.find(issue => issue.targetId === scene.id)?.fix).toContain('contentSlots.example')
  })

  it('阻断带知识点映射但无法观察或成功标准漏动作的目标', () => {
    const course = compileTwoKps()
    const goal = course.goals.find(candidate => candidate.kpId === 'kp-a')!

    goal.statement = '理解海陆变迁证据并掌握判断方法'
    goal.successSignal = '学生能说出一个结论'
    let messages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(messages).toContain('学习目标不可直接检核：目标句包含无法直接观察的“理解/掌握”类要求。')

    goal.statement = '能解释海陆变迁证据并判断一个说法'
    goal.successSignal = '学生能判断一个说法并写出答案'
    messages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(messages).toContain('学习目标不可直接检核：成功信号没有覆盖目标句要求的全部学习行为。')
  })

  it('展示形态按真实幕型渲染器计数，不再把独立页面误判为同一种技术', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-procedure', canonicalName: '一元一次方程求解', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school',
      subject: 'math',
      preset,
    })

    expect(new Set(course.scenes.map(scene => scene.sceneTechnique)).size).toBe(3)
    expect(auditMainlineCourse(course).map(issue => issue.message))
      .not.toContain('整节课实际呈现形态变化不足。')

    const techniques = ['static-board', 'layered-reveal', 'path-tracing', 'local-zoom'] as const
    course.scenes.forEach((scene, index) => {
      scene.sceneType = 'concept-build'
      scene.sceneTechnique = techniques[index % techniques.length]!
    })
    expect(auditMainlineCourse(course).map(issue => issue.message))
      .toContain('整节课实际呈现形态变化不足。')
  })

  it('旧课开场退化成先讲答案时给出学习顺序警告', () => {
    const course = compileTwoKps()
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    source.studentAction = '阅读屏幕并背诵老师给出的完整结论'
    source.teacherScript = '这一页直接把本课全部结论讲完，学生按照屏幕逐句记忆，再进入后续页面重复这些内容。为了模拟旧课退化，这里保留足够长度，但不安排任何预测，也不说明后续如何寻找依据。'

    const issues = auditMainlineCourse(course)
    expect(issues.some(item => item.severity === 'warning' && item.message === '开场没有形成“先预测、后取证”的学习顺序。')).toBe(true)
    expect(blockingQualityIssues(issues)).toEqual([])
  })

  it('复习课开场退化成重听讲解时给出提取顺序警告', () => {
    const course = compileTwoKps()
    course.lessonPhase = 'review'
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    source.studentAction = '阅读老师给出的完整讲解并做笔记'
    source.teacherScript = '这是一节复习课，但先由老师从头到尾重新讲一遍完整知识，再让学生阅读和记忆。这里刻意不安排闭卷回忆、独立作答、核对或纠错，用来验证质量闸门是否识别换皮重讲。'
    source.contentSlots = { topic: course.topic, learningPath: '完整重讲', openingQuestion: '请认真听讲' }

    const issues = auditMainlineCourse(course)
    expect(issues.some(item => item.message === '复习课开场没有形成“先提取、后纠错”的顺序。')).toBe(true)
    expect(blockingQualityIssues(issues)).toEqual([])
  })

  it('确定性复习开场通过提取顺序检查', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-review', canonicalName: '海陆变迁', knowledgeType: 'conceptual' }],
      gradeBand: 'middle-school', subject: 'geography', preset, lessonPhase: 'review',
    })

    expect(auditMainlineCourse(course).some(item => item.message === '复习课开场没有形成“先提取、后纠错”的顺序。')).toBe(false)
  })

  it('旧课收束页显示完整结论却只让学生背诵时给出深加工警告', () => {
    const course = compileTwoKps()
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    recap.studentAction = '沿路径逐字复述并背诵屏幕上的完整结论'

    const issues = auditMainlineCourse(course)
    expect(issues.some(item => item.severity === 'warning' && item.message === '收束页在完整结论可见时仍只要求复述或背诵。')).toBe(true)
    expect(blockingQualityIssues(issues)).toEqual([])

    recap.studentAction = '先复述路径，再举一个新例子说明结论为什么成立'
    expect(auditMainlineCourse(course).some(item => item.message === '收束页在完整结论可见时仍只要求复述或背诵。')).toBe(false)
  })

  it('新收束模板缺少结构分支时阻断，存量无 infoShape 课程不受影响', () => {
    const course = compileTwoKps()
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    expect(recap.infoShape).toBe('hierarchy')
    delete recap.contentSlots.shapeItem2
    delete recap.contentSlots.shapeItem3

    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(messages).toContain('收束页“结论与依据”结构不完整。')

    delete recap.infoShape
    recap.contentSlots = { path: '观察 → 解释 → 应用', takeaway: '存量课继续沿用旧结构' }
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).not.toContain('收束页“结论与依据”结构不完整。')
    expect(auditMainlineCourse(course).map(issue => issue.message)).toContain('收束页没有提供可直接作答的具体迁移题。')
  })

  it('元认知策略页缺少闭环要素时阻断，存量无结构标记课程继续兼容', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-meta', canonicalName: '审题策略', knowledgeType: 'metacognitive' }],
      gradeBand: 'middle-school', subject: 'chinese', preset,
    })
    const strategy = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const message = '策略页“策略建构”结构不完整。'
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).not.toContain(message)

    delete strategy.contentSlots.selfCheck
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).toContain(message)

    strategy.contentSlots.selfCheck = '我是否明确了目标和每个条件的用途？'
    strategy.contentSlots.steps = '只看题目'
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).toContain(message)

    delete strategy.infoShape
    strategy.contentSlots = { statement: '审题策略的定义', example: '一道例题' }
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)).not.toContain(message)
  })

  it('旧课只有观察或拖动、没有外显回答时给出学习证据警告', () => {
    const course = compileTwoKps()
    const observation = course.scenes.find(scene => scene.sceneType === 'visual-observation')!
    observation.studentAction = '拖动滑块，沿 A→B→C 路径观察三层变化并确认差异'

    const issues = auditMainlineCourse(course)
    expect(issues.some(item => item.targetId === observation.id && item.message === '学生动作只有观看或操作，没有留下可检查的回答。')).toBe(true)
    expect(blockingQualityIssues(issues)).toEqual([])

    observation.studentAction = '拖动滑块观察三层变化，再标出一处差异并写下理由'
    expect(auditMainlineCourse(course).some(item => item.targetId === observation.id && item.message === '学生动作只有观看或操作，没有留下可检查的回答。')).toBe(false)
  })

  it('完整例题只有抄写过程时提醒补充自我解释，但不阻断教师备课', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-worked', canonicalName: '二力平衡', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school', subject: 'physics', preset,
    })
    const worked = course.scenes.find(scene => scene.sceneType === 'worked-example')!
    worked.studentAction = '跟随步骤写出结果'

    const issues = auditMainlineCourse(course)
    const message = '完整例题只要求跟随或抄写步骤，没有要求学生解释关键步骤。'
    expect(issues.some(item => item.targetId === worked.id && item.message === message)).toBe(true)
    expect(blockingQualityIssues(issues).some(item => item.targetId === worked.id && item.message === message)).toBe(false)

    worked.studentAction = '先补关键一步并说明依据，核对后用因为所以解释为什么成立'
    expect(auditMainlineCourse(course).some(item => item.targetId === worked.id && item.message === message)).toBe(false)
  })

  it('完整例题缺少明确的单一待补步骤时阻断发布，补齐后放行', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-scaffold', canonicalName: '受力分析', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school', subject: 'physics', preset,
    })
    const worked = course.scenes.find(scene => scene.sceneType === 'worked-example')!
    const message = '完整例题没有形成“完成题→完整示范→独立练习”的支架渐退。'

    delete worked.contentSlots.completionPrompt
    expect(auditMainlineCourse(course).some(item => item.targetId === worked.id && item.message === message && item.severity === 'blocking')).toBe(true)

    worked.contentSlots.completionPrompt = '题面已有：研究对象已经确定。请在【待补】处补出下一步，并说明依据。'
    expect(auditMainlineCourse(course).some(item => item.targetId === worked.id && item.message === message)).toBe(false)
  })

  it('旧课承诺不存在的路径高亮时给出交互真实性警告，新骨架不误报', () => {
    const course = compileTwoKps()
    expect(auditMainlineCourse(course).some(item => item.message === '课堂交互描述承诺了当前页面未实现的能力。')).toBe(false)

    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    recap.interactionContract = '学生按路径复述，系统高亮当前节点。'
    const issues = auditMainlineCourse(course)

    expect(issues.some(item => item.targetId === recap.id && item.severity === 'warning' && item.message === '课堂交互描述承诺了当前页面未实现的能力。')).toBe(true)
    expect(blockingQualityIssues(issues)).toEqual([])
  })

  it('阻断练习题面提前写出反馈答案，修正为题设与要求后放行', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-force', canonicalName: '二力平衡', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school', subject: 'physics', preset,
    })
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    practice.contentSlots = {
      task: '质量 4kg 的球用绳悬挂静止，画出重力 G 与拉力 T。重力 G=mg=39.2N 竖直向下，拉力 T=39.2N 竖直向上。',
      feedback: '重力 G=mg=39.2N，方向竖直向下；拉力 T=39.2N，方向竖直向上。',
    }

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message))
      .toContain('练习题面提前泄露了反馈答案。')

    practice.contentSlots.task = '质量为 4kg 的球用绳悬挂静止，取 g=9.8N/kg。画出受力图并分别求两个力的大小。'
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message))
      .not.toContain('练习题面提前泄露了反馈答案。')
  })

  it('阻断无实际材料的练习和无法指导纠错的空反馈', () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chemistry' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-heat', canonicalName: '热化学方程式', knowledgeType: 'factual' }],
      gradeBand: 'middle-school', subject: 'chemistry', preset,
    })
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    practice.contentSlots = {
      task: '判断屏幕上三条热化学方程式各有一处错误，指出具体位置。',
      feedback: '做得很好，请核对答案。',
    }

    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message)
    expect(messages).toContain('练习题面引用了学生看不到的作答材料。')
    expect(messages).toContain('练习反馈缺少判定依据或具体纠错行动。')

    practice.contentSlots = {
      task: '逐条判断并说明理由：\nA. 反应物和生成物都标明聚集状态；\nB. 吸热反应的焓变写为负值；\nC. 计量数翻倍但焓变不变。',
      feedback: 'A 正确；B 的焓变应为正值；C 的焓变须随计量数翻倍。若把吸热写成负值，回到体系吸收能量的符号约定重新判断。',
    }
    const repairedMessages = blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message)
    expect(repairedMessages).not.toContain('练习题面引用了学生看不到的作答材料。')
    expect(repairedMessages).not.toContain('练习反馈缺少判定依据或具体纠错行动。')
  })

  it('旧多知识点课程没有 kpId 映射时只告警,不阻断存量课程', () => {
    const course = compileTwoKps()
    course.goals = [{ id: 'legacy-total', statement: '理解本课两个知识点', successSignal: '能复述本课两个知识点的主要内容' }]
    course.learningFragments.forEach(fragment => { fragment.goalId = 'legacy-total' })

    const issues = auditMainlineCourse(course)
    expect(blockingQualityIssues(issues)).toEqual([])
    expect(issues.some(item => item.severity === 'warning' && item.message.includes('没有按知识点建立可追溯映射'))).toBe(true)
  })

  it('阻断缺少独立目标的知识点', () => {
    const course = compileTwoKps()
    course.goals = course.goals.filter(goal => goal.kpId !== 'kp-b')
    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message)
    expect(messages).toContain('知识点 kp-b 缺少独立学习目标。')
  })

  it('阻断片段与目标的知识点错绑', () => {
    const course = compileTwoKps()
    const secondFragment = course.learningFragments.find(fragment => fragment.kpId === 'kp-b')!
    secondFragment.goalId = course.goals.find(goal => goal.kpId === 'kp-a')!.id
    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message)
    expect(messages).toContain('学习片段的知识点 kp-b 与目标知识点 kp-a 不一致。')
  })

  it('阻断只有讲解、没有评价证据的知识点片段', () => {
    const course = compileTwoKps()
    const firstFragment = course.learningFragments.find(fragment => fragment.kpId === 'kp-a')!
    firstFragment.sceneIds = firstFragment.sceneIds.filter(sceneId => {
      const type = course.scenes.find(scene => scene.id === sceneId)?.sceneType
      return type !== 'contrast' && type !== 'practice'
    })
    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message)
    expect(messages).toContain('知识点片段缺少可检核的评价场景。')
  })

  it('形成性辨析不能替代会保存原答、标准对照和订正的独立练习', () => {
    const course = compileConceptualWithMisconceptions(['把海岸线吻合直接当成大陆漂移的充分证据'])
    const fragment = course.learningFragments.find(candidate => candidate.kpId === 'kp-m')!
    fragment.sceneIds = fragment.sceneIds.filter(sceneId => (
      course.scenes.find(scene => scene.id === sceneId)?.sceneType !== 'practice'
    ))

    const issues = auditMainlineCourse(course)
    expect(blockingQualityIssues(issues).map(item => item.message))
      .toContain('知识点片段缺少可保存学习证据的独立练习。')
    expect(issues.some(item => item.message === '知识点片段缺少可检核的评价场景。')).toBe(false)
  })

  it('阻断只检核成功信号一部分行为的练习', () => {
    const course = compileTwoKps()
    const goal = course.goals.find(candidate => candidate.kpId === 'kp-a')!
    goal.successSignal = '学生能用自己的话解释海陆变迁证据，并判断一个典型误区。'
    const fragment = course.learningFragments.find(candidate => candidate.kpId === 'kp-a')!
    fragment.successSignal = goal.successSignal
    const practice = course.scenes.find(scene => scene.kpId === 'kp-a' && scene.sceneType === 'practice')!
    practice.contentSlots = {
      task: '判断“所有海岸线相似都能证明大陆漂移”是否正确，并写出一条依据。',
      feedback: '该说法错误，形状相似只是线索，还要结合地层、古生物等证据。若只看轮廓，请补充至少一类独立证据重新判断。',
    }
    practice.studentAction = '先独立判断，再写出支持判断的一条证据。'

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message))
      .toContain('练习任务不能证明知识点成功信号。')

    practice.contentSlots.task += ' 再用自己的话解释这些证据为什么能支持海陆变迁。'
    practice.studentAction += ' 最后解释证据与结论之间的关系。'
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message))
      .not.toContain('练习任务不能证明知识点成功信号。')
  })

  it('同义的解释任务不会因“用自己的话说出”被重复判成提取缺失', () => {
    const course = compileTwoKps()
    const goal = course.goals.find(candidate => candidate.kpId === 'kp-a')!
    goal.successSignal = '学生能用自己的话说出海陆变迁证据的核心含义，并判断一个典型误区。'
    const fragment = course.learningFragments.find(candidate => candidate.kpId === 'kp-a')!
    fragment.successSignal = goal.successSignal
    const practice = course.scenes.find(scene => scene.kpId === 'kp-a' && scene.sceneType === 'practice')!
    practice.contentSlots = {
      task: '解释海陆变迁证据的核心含义，并判断“轮廓相似就足以证明大陆漂移”是否正确。',
      feedback: '该说法错误，轮廓相似只是线索，还要结合地层和古生物证据；若只看轮廓，请补充一类独立证据后重写解释。',
    }
    practice.studentAction = '先解释核心含义，再判断说法并写出依据。'

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message))
      .not.toContain('练习任务不能证明知识点成功信号。')
  })

  it('通用的“独立完成同型任务”不能让狭窄判断题假装覆盖迁移目标', () => {
    const course = compileTwoKps()
    const goal = course.goals.find(candidate => candidate.kpId === 'kp-a')!
    goal.successSignal = '学生能在新情境里应用海陆变迁证据解决问题。'
    const fragment = course.learningFragments.find(candidate => candidate.kpId === 'kp-a')!
    fragment.successSignal = goal.successSignal
    const practice = course.scenes.find(scene => scene.kpId === 'kp-a' && scene.sceneType === 'practice')!
    practice.contentSlots = {
      task: '判断“两个大陆轮廓相似就能直接证明它们曾经相连”是否正确，并写出理由。',
      feedback: '该说法错误，单一轮廓证据不足；请补充地层或古生物证据，并说明多类证据如何共同支持结论。',
    }
    practice.studentAction = '独立完成同型任务。'

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(item => item.message))
      .toContain('练习任务不能证明知识点成功信号。')
  })

  it('把伪教材占位和无原文状态暴露为警告，但不阻断旧课', () => {
    const course = compileTwoKps()
    course.sourceMaterial[0]!.excerpt = '待 LLM 填充教材原文或定义引用。'
    course.sourceMaterial[1] = {
      ...course.sourceMaterial[1]!,
      citation: '课程目录来源 pep-cn，节点 leaf-b（仅用于教材定位）',
      provenance: { source: 'pep-cn', externalId: 'leaf-b', evidenceStatus: 'curriculum-metadata' },
    }

    const issues = auditMainlineCourse(course)
    expect(blockingQualityIssues(issues)).toEqual([])
    expect(issues.some(item => item.message.includes('把待补内容写进了来源摘录'))).toBe(true)
    expect(issues.some(item => item.message.includes('只有教材目录定位'))).toBe(true)
  })

  it('AI 提取内容不会被当成权威教材摘录', () => {
    const course = compileTwoKps()
    course.sourceMaterial = course.sourceMaterial.map(source => ({
      ...source,
      excerpt: `AI 对 ${source.title} 的概括`,
      provenance: { source: 'llm:qwen', evidenceStatus: 'ai-extracted' as const },
    }))

    const issues = auditMainlineCourse(course)
    expect(issues.some(item => item.message.includes('只有 AI 提取线索'))).toBe(true)
  })

  it('lets golden samples enter the classroom without blocking issues', () => {
    for (const course of GOLDEN_MAINLINE_COURSES) {
      const issues = auditMainlineCourse(course)
      expect(blockingQualityIssues(issues), course.id).toEqual([])
      expect(summarizeQuality(issues).status, course.id).not.toBe('blocked')
    }
  })

  it('blocks dense source content when a large RPG layout would cover it', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const firstScene = course.scenes[0]!
    course.scenes[0] = {
      ...firstScene,
      dialogueLayout: 'teacher-left-content-right',
      characterLayer: {
        castId: 'teacher-xiaomei',
        expression: 'neutral',
        layout: 'teacher-left-content-right',
        positionRule: '老师固定在左侧。',
        exitRule: '不退场。',
      },
    }

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('内容密集场景仍使用大角色对白版式。')
  })

  it('blocks image-promising text on scenes that will never have an image', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    // 找一个非配图幕型(source-reading),往讲稿里塞指图表述
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `看这幅图,${scene.teacherScript}`
    delete scene.imageUrl

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  it('does not flag 插图/图案 as subject-matter nouns on textual scenes(美术装帧课误伤回归)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.boardText = ['图形：插图、图案、装饰纹样', '色彩：底色与配色', '字体：书名字形']
    delete scene.imageUrl

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('无图幕的文本在指图。')
  })

  it('flags image-name visualFocus on textual scenes(标题即图名=许诺)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.visualFocus = '南美洲与非洲海岸轮廓拼合图'
    delete scene.imageUrl

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  it('学生可见文本跨页指路 → blocking(页序动态展开必然指错,2026-08-26 地理课实撞回归)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `${scene.teacherScript} 想不起来的同学可以回第5页的对比栏找证据。`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('学生可见文本在跨页指路。')
  })

  it('语文课「第X幕」是戏剧文本分析,不算跨页指路(《雷雨》类课文误伤回归)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `${scene.teacherScript} 回到第二幕的开头,周朴园的态度发生了什么变化?`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('学生可见文本在跨页指路。')
  })

  it('非语文课「回顾第X幕」仍是内部页序指路,必须阻断', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    course.subject = 'physics'
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `${scene.teacherScript} 回顾第二幕的受力图再判断。`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('学生可见文本在跨页指路。')
  })

  it('「第一步」「第3题」不是跨页指路,不误拦', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `${scene.teacherScript} 第一步先写下预测,第3题留到练习页再做。`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('学生可见文本在跨页指路。')
  })

  it('「示意图画法/规范」是画图技能名,不是图名许诺(2026-08-25 力的示意图课整课被拦回归)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.visualFocus = '二力平衡的四个条件、力的示意图画法规范'
    delete scene.imageUrl

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('无图幕的文本在指图。')
  })

  it('可解的 opticsScene 让指图合法(A-1:光路渲染器解锁图密集理科课)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `如图,${scene.teacherScript}`
    delete scene.imageUrl
    scene.contentSlots.opticsScene = 'scene|convex-lens\nu|30\nf|10\nh|4'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('无图幕的文本在指图。')
  })

  it('不可解的 opticsScene 仍按无图拦截(槽键存在≠画得出图,闸门与渲染端必须同步)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.teacherScript = `如图,${scene.teacherScript}`
    delete scene.imageUrl
    // 缺焦距 → 引擎解不出 → SceneTechniqueView 也不会进光路版式
    scene.contentSlots.opticsScene = 'scene|convex-lens\nu|30'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  it.each([
    ['数学几何', { geoVertices: 'A(0,0);B(4,0);C(4,3)', geoEdges: 'AB;BC;CA', geoAngleLabels: '∠ABC=90°' }, { geoVertices: 'A(0,0);B(4,0);C(4,3)', geoEdges: 'AB;BD;DA' }],
    ['化学方程式', { chemEquation: '2H_2 + O_2 → 2H_2O', chemEquationAtoms: 'H:4=4\nO:2=2' }, { chemEquation: 'H_2 + O_2 → H_2O' }],
    ['物理电路', { circuitTopology: 'B1|battery|6|V\nR1|resistor|5|Ω', circuitConnections: 'B1-R1' }, { circuitTopology: 'B1|battery|6|V\nR1|resistor|5|Ω', circuitConnections: 'B1-X1' }],
    ['语文拼音', { pinyinSyllables: 'm|a|3|马' }, { pinyinSyllables: 'm|a|5|吗' }],
    ['英语单词卡', { vocabCards: 'abundant|əˈbʌndənt|adj.|丰富的|It is abundant.|它很丰富' }, { vocabCards: 'abundant|adj.|丰富的' }],
    ['生物结构图解', { structureCallouts: '细胞壁|支持保护|细胞结构\n细胞膜|控制物质进出|细胞结构' }, { structureCallouts: '细胞壁|支持保护|' }],
  ] as const)('%s 的可渲染槽放行、残缺槽仍拦截', (_label, validSlots, invalidSlots) => {
    const validCourse = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const validScene = validCourse.scenes.find(scene => scene.sceneType === 'source-reading')!
    validScene.teacherScript = `如图,${validScene.teacherScript}`
    delete validScene.imageUrl
    validScene.contentSlots = { ...validScene.contentSlots, ...validSlots }
    expect(blockingQualityIssues(auditMainlineCourse(validCourse)).map(issue => issue.message)).not.toContain('无图幕的文本在指图。')

    const invalidCourse = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const invalidScene = invalidCourse.scenes.find(scene => scene.sceneType === 'source-reading')!
    invalidScene.teacherScript = `如图,${invalidScene.teacherScript}`
    delete invalidScene.imageUrl
    invalidScene.contentSlots = { ...invalidScene.contentSlots, ...invalidSlots }
    expect(blockingQualityIssues(auditMainlineCourse(invalidCourse)).map(issue => issue.message)).toContain('无图幕的文本在指图。')
  })

  it('任务式「在图上标出」不算指图(2026-07-27 真检:扉页预告本课任务被误拦)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = '后面分三步走：先认识会聚现象本身，再学画光路图，最后在图上准确标出焦点位置与焦距。'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('无图幕的文本在指图。')
  })

  it.each([
    ['构图中的视觉呈现'],
    ['绘图中的比例关系'],
    ['制图中的符号规范'],
    ['作图中的辅助线选择'],
  ])('复合词「%s」不误判为当场指图', (phrase) => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.visualFocus = phrase
    scene.teacherScript = `本课分析${phrase},并用文字记录判断依据。`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('无图幕的文本在指图。')
  })

  it.each([
    ['请观察地图中的边界。'],
    ['插图中有三条方向不同的光线。'],
  ])('真实的图像指代仍必须拦截:%s', (script) => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = script

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  // 以下三条锁住「豁免必须 fail closed」:没有未来语境的任务句是当场指令,幕上无图即事故。
  // Codex 复审实跑发现第一版裸剔任务构式把洞补大了(2026-07-27)。
  it.each([
    ['请在图上标出三条光线的焦点。'],
    ['请在图中画出法线并标注入射角。'],
    ['在图上找出焦点，量出焦距。'],
  ])('当场指令仍必须拦截:%s', (script) => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = script

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  it('未来语境须与任务构式同句才豁免(跨句不算)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = '接下来我们学习光的折射。请在图上标出法线。'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  it('剔任务构式不放宽指图本身:「看图上这三条光线」照拦', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = '看图上这三条光线，它们最后交于一点。'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('无图幕的文本在指图。')
  })

  // F2(2026-07-27):forceVectors / funcPlotPoints 此前是最后两个「槽键存在即算有图」的老槽,
  // 与光路及六学科的同源验证不一致。解析不出内容时渲染端画空图,闸门却放行。
  it.each([
    ['forceVectors', 'mg|重力|50|N|270|gravity', '重力向下\n支持力向上'],
    ['funcPlotPoints', '0,0 1,1 2,4 3,9', 'abc'],
  ])('%s:解析得出内容才算有图,解析不出仍按无图拦截', (slot, usable, broken) => {
    const build = (value: string) => {
      const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
      const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
      delete scene.imageUrl
      scene.teacherScript = `看这张图,${scene.teacherScript}`
      scene.contentSlots[slot] = value
      return blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
    }
    expect(build(usable)).not.toContain('无图幕的文本在指图。')
    expect(build(broken)).toContain('无图幕的文本在指图。')
  })

  it('funcPlotPoints 只有单点不算图(折线至少要两点)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = `看这张图,${scene.teacherScript}`
    scene.contentSlots.funcPlotPoints = '1,1'

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)).toContain('无图幕的文本在指图。')
  })

  it('函数图数据乱序、越界或缺少分式断点时阻断发布', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.contentSlots = {
      ...scene.contentSlots,
      funcExpr: '\\(y=\\dfrac{1}{x-1}\\)',
      funcDomain: '0,3',
      funcPlotPoints: '0,-1 2,1 1,0 4,0.333',
    }

    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(messages).toContain('函数图采样点没有按横坐标严格递增排列。')
    expect(messages).toContain('函数图采样点超出声明的定义域。')
    expect(messages).toContain('分母含 x 的函数图没有声明无定义点或连续分支边界。')
  })

  it('不上屏的函数采样预算不得成为学生机械凑点任务', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    scene.contentSlots = {
      ...scene.contentSlots,
      task: '沿定义域均匀取至少 8 个点，逐点描出函数图象。',
      funcExpr: '\\(y=2x-1\\)',
      funcDomain: '-2,3',
      funcPlotPoints: '-2,-5 -1,-3 0,-1 1,1 2,3 3,5',
    }

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .toContain('函数图渲染采样数被误写成学生作图要求。')
  })

  it('旧课无定义点格式也会切断函数曲线并保留结构图判定', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'source-reading')!
    delete scene.imageUrl
    scene.teacherScript = `看这张图,${scene.teacherScript}`
    scene.contentSlots = {
      ...scene.contentSlots,
      funcExpr: '\\(y=\\dfrac{1}{x-1}\\)',
      funcDomain: '-3,5',
      funcPlotPoints: '-3,-0.25 -2,-0.333 0,-1 0.5,-2 1.5,2 2,1 3,0.5 4,0.333',
      funcKeyPoints: '无定义断点:(1,不存在);x=0处:(0,-1);x=2处:(2,1)',
    }

    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(messages).not.toContain('无图幕的文本在指图。')
    expect(messages).not.toContain('分母含 x 的函数图没有声明无定义点或连续分支边界。')
  })

  it('allows image-referencing text on image scene types', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes.find(s => s.sceneType === 'visual-observation')!
    scene.teacherScript = `看这幅图,${scene.teacherScript}${scene.narrationAnchor}`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('无图幕的文本在指图。')
  })

  it('blocks infantilizing tone for middle-school courses(学段语气闸门)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES.find(c => c.gradeBand === 'middle-school')!)
    const scene = course.scenes[0]!
    scene.teacherScript = `小朋友们注意啦,${scene.teacherScript}`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('学段语气违规:出现「小朋友」。')
  })

  it('blocks misconception phrasing taught as fact(错误讲法闸门)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES.find(c => c.subject === 'physics')!)
    const scene = course.scenes.find(s => s.sceneType !== 'contrast')!
    scene.teacherScript = `${scene.teacherScript} 电流经过灯泡之后就被用光了。`

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('错误讲法命中误概念库 MIS-002。')
  })

  it('exempts contrast scenes from misconception phrasing scan(辨析幕的职责就是摆出误区)', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES.find(c => c.subject === 'physics')!)
    const contrast = course.scenes.find(s => s.sceneType === 'contrast')
    if (!contrast) return // 该样板无辨析幕时本例不适用
    contrast.contentSlots.misconception = '我觉得电流经过灯泡之后就被用光了,所以后面没电。'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('错误讲法命中误概念库 MIS-002。')
  })

  it('season 剧情护栏:钩子只许在 recap 幕且受字数预算约束', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const recap = course.scenes.find(s => s.sceneType === 'recap')
    const nonRecap = course.scenes.find(s => s.sceneType !== 'recap')!

    // 合法:recap 幕 ≤60 字钩子
    if (recap) {
      recap.contentSlots.serialHook = '下一集我们去看电压——推动这一切的看不见的手。'
      expect(blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)).not.toContain('下集钩子出现在非收束幕。')
    }

    // 非法 1:钩子出现在非 recap 幕
    nonRecap.contentSlots.serialHook = '预告乱入'
    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
    expect(messages).toContain('下集钩子出现在非收束幕。')
    delete nonRecap.contentSlots.serialHook

    // 非法 2:钩子超预算
    if (recap) {
      recap.contentSlots.serialHook = '这'.repeat(61)
      const overBudget = blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
      expect(overBudget.some(m => m.includes('下集钩子超出预算'))).toBe(true)
    }
  })

  it('v5 M2 ai-verify 溯源闸门:缺少 misconceptionSource 时 blocking', () => {
    const course = compileConceptualWithMisconceptions(['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'])
    const verify = course.scenes.find(s => s.sceneType === 'ai-verify')!
    delete (verify as { misconceptionSource?: string }).misconceptionSource

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
    expect(blockingMessages).toContain('AI 找茬幕缺少误区溯源(misconceptionSource)。')
  })

  it('知识点辨析页缺少误区来源时 blocking,普通内容对照页不误伤', () => {
    const course = compileConceptualWithMisconceptions(['把海岸线吻合直接当成大陆漂移的充分证据'])
    const contrast = course.scenes.find(scene => scene.sceneType === 'contrast')!
    delete (contrast as { misconceptionSource?: string }).misconceptionSource

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .toContain('辨析幕缺少误区溯源(misconceptionSource)。')

    const ordinaryContrast = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    expect(ordinaryContrast.scenes.some(scene => scene.sceneType === 'contrast' && !scene.kpId)).toBe(true)
    expect(blockingQualityIssues(auditMainlineCourse(ordinaryContrast)).map(issue => issue.message))
      .not.toContain('辨析幕缺少误区溯源(misconceptionSource)。')
  })

  it('知识点辨析页的可见错误说法偏离来源时阻断,忠实改写时通过', () => {
    const course = compileConceptualWithMisconceptions(['把海岸线吻合直接当成大陆漂移的充分证据'])
    const contrast = course.scenes.find(scene => scene.sceneType === 'contrast')!
    contrast.contentSlots.misconception = '三角形内角和是二百度。'
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .toContain('辨析幕的错误说法与教研确认误区原文重合度过低,疑似 LLM 自由编造错误。')

    contrast.contentSlots.misconception = `有同学认为${contrast.misconceptionSource},这个判断充分吗？`
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .not.toContain('辨析幕的错误说法与教研确认误区原文重合度过低,疑似 LLM 自由编造错误。')
  })

  it('v5 M2 ai-verify 溯源闸门:aiClaim 改写后与误区原文重合度过低时 blocking(疑似编造)', () => {
    const course = compileConceptualWithMisconceptions(['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'])
    const verify = course.scenes.find(s => s.sceneType === 'ai-verify')!
    expect(verify.misconceptionSource).toBe('板块运动速度肉眼可见')
    // 编译期占位内容(逐字包含原文)本就该过闸;人为替换成与原文毫无字面关联的文本模拟 LLM 编造出的另一个错误
    verify.contentSlots = { ...verify.contentSlots, aiClaim: '恐龙灭绝是因为一场突如其来的沙尘暴掩埋了所有栖息地' }
    verify.teacherScript = '刚才小助讲的这个恐龙灭绝原因的说法,我们一起来看看到底站不站得住脚,查一查证据。'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
    expect(blockingMessages).toContain('AI 找茬幕的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。')
  })

  it('揭底和讲稿引用误区原文也不能替偏离的错误说法通过溯源闸门', () => {
    const course = compileConceptualWithMisconceptions(['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'])
    const verify = course.scenes.find(scene => scene.sceneType === 'ai-verify')!
    verify.contentSlots = {
      ...verify.contentSlots,
      aiClaim: '我觉得三角形内角和是二百度。',
      reveal: `教材误区原文是「${verify.misconceptionSource}」，真正判断要依靠长期观测。`,
    }
    verify.teacherScript = `小助原本应该讨论「${verify.misconceptionSource}」，请核对这句教材误区。`

    expect(blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message))
      .toContain('AI 找茬幕的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。')
  })

  it('v5 M2 ai-verify 溯源闸门:aiClaim 忠实改写误区原文时不 blocking', () => {
    const course = compileConceptualWithMisconceptions(['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'])
    const verify = course.scenes.find(s => s.sceneType === 'ai-verify')!
    // 编译期默认占位("AI 助教「小助」说:板块运动速度肉眼可见"式)逐字包含原文,天然过闸
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)).not.toContain('AI 找茬幕的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。')

    // 模拟 fill-scenes 忠实改写(换措辞但保留关键信息)后依然过闸
    verify.contentSlots = { ...verify.contentSlots, aiClaim: `我觉得${verify.misconceptionSource},所以不用怀疑。` }
    verify.teacherScript = `刚才小助说${verify.misconceptionSource},这个说法看起来有道理,但其实需要更多证据支撑,不能简单下结论。`
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)).not.toContain('AI 找茬幕的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。')
  })

  it('v5 骨架去重合并:合并幕(3 条误区)逐条校验,只有编造的那一条被 blocking', () => {
    const course = compileConceptualWithMisconceptions([
      '海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见', '大陆漂移只发生在过去,现在已经停止',
    ])
    const verify = course.scenes.find(s => s.sceneType === 'ai-verify')!
    expect(verify.misconceptionSources).toEqual(['板块运动速度肉眼可见', '大陆漂移只发生在过去,现在已经停止'])
    // 编译期占位内容逐字包含各自原文,天然过闸
    expect(blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message).some(m => m.includes('AI 找茬幕'))).toBe(false)

    // 只替换第 2 处(aiClaim2)为与原文毫无字面关联的编造内容,第 1 处保持忠实改写
    verify.contentSlots = {
      ...verify.contentSlots,
      aiClaim1: '我觉得板块运动速度肉眼可见,所以能看见大陆在动。',
      aiClaim2: '恐龙灭绝是因为一场突如其来的沙尘暴掩埋了所有栖息地',
      aiClaim: '我觉得板块运动速度肉眼可见,所以能看见大陆在动。恐龙灭绝是因为一场突如其来的沙尘暴掩埋了所有栖息地',
    }
    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
    expect(messages).toContain('AI 找茬幕第 2/2 处误区的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。')
    expect(messages).not.toContain('AI 找茬幕第 1/2 处误区的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。')
  })

  it('多误区找茬缺少细分槽时阻断逐条学习闭环，同时不误报为自由编造', () => {
    const course = compileConceptualWithMisconceptions([
      '海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见', '大陆漂移只发生在过去,现在已经停止',
    ])
    const verify = course.scenes.find(s => s.sceneType === 'ai-verify')!
    // 只填合并粗槽,不填 aiClaimN 细分槽,但内容忠实覆盖两条原文
    verify.contentSlots = {
      aiClaim: '我觉得板块运动速度肉眼可见,并且大陆漂移只发生在过去,现在已经停止了。',
      reveal: '两处都错:板块运动极其缓慢肉眼无法察觉,而且现在仍在持续运动。',
    }
    const messages = blockingQualityIssues(auditMainlineCourse(course)).map(i => i.message)
    expect(messages).toContain('多误区 AI 找茬幕缺少逐条内容槽：aiClaim1、reveal1、aiClaim2、reveal2。')
    expect(messages.some(m => m.includes('AI 找茬幕') && m.includes('重合度过低'))).toBe(false)
  })

  it('v5 M2 executor 分工观察(info):全课清一色 ai 执教时提示没用到双师分工', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!) // 旧样板课无 executor 标注,全部按 'ai' 缺省读
    const issues = auditMainlineCourse(course)
    const infoMessages = issues.filter(i => i.severity === 'info').map(i => i.message)
    expect(infoMessages.some(m => m.includes('没有用到双师人机分工'))).toBe(true)
    // info 不阻断
    expect(blockingQualityIssues(issues)).toEqual([])
  })

  it('v5 M2 executor 分工观察(info):新课默认混合分工时不提示', () => {
    const course = compileConceptualWithMisconceptions([])
    const infoMessages = auditMainlineCourse(course).filter(i => i.severity === 'info').map(i => i.message)
    expect(infoMessages.some(m => m.includes('没有用到双师人机分工'))).toBe(false)
  })

  it('blocks teacher profiles without stable expression assets', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    const teacher = course.castProfiles.find(cast => cast.id === course.selectedTeacher)
    expect(teacher).toBeDefined()
    teacher!.assetRefs = []

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('陈教授 缺少多表情立绘资产。')
  })

  it('阻断重复卡司 id 和同角色多音色配置', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    const teacher = course.castProfiles.find(cast => cast.id === course.selectedTeacher)!
    const voice = course.voiceProfiles.find(item => item.castId === teacher.id)!
    course.castProfiles.push(structuredClone(teacher))
    course.voiceProfiles.push(structuredClone(voice))

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain(`卡司 id 重复：${teacher.id}。`)
    expect(blockingMessages).toContain(`角色 ${teacher.id} 绑定了多个音色配置。`)
  })

  it('阻断实际登场老师或同学沿用不匹配的样板课学段与学科身份', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    const teacher = course.castProfiles.find(cast => cast.id === course.selectedTeacher)!
    const peer = course.castProfiles.find(cast => cast.id === course.peerRoleProfile.peerId)!
    teacher.gradeFit = ['lower-primary']
    teacher.subjectFit = ['physics']
    peer.gradeFit = ['lower-primary']
    peer.subjectFit = ['chemistry']

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain(`实际教学角色「${teacher.displayName}」的学段档案(lower-primary)不含本课学段 ${course.gradeBand}。`)
    expect(blockingMessages).toContain(`实际教学角色「${teacher.displayName}」的学科档案(physics)不含本课学科 ${course.subject}。`)
    expect(blockingMessages).toContain(`实际教学角色「${peer.displayName}」的学段档案(lower-primary)不含本课学段 ${course.gradeBand}。`)
    expect(blockingMessages).toContain(`实际教学角色「${peer.displayName}」的学科档案(chemistry)不含本课学科 ${course.subject}。`)
  })

  it('阻断 peerRoleProfile 指向老师，且检查逐幕临时登场角色的适配范围', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    const teacher = course.castProfiles.find(cast => cast.id === course.selectedTeacher)!
    const guest = structuredClone(course.castProfiles.find(cast => cast.role === 'student')!)
    guest.id = 'student-foreign-subject'
    guest.displayName = '临时同学'
    guest.gradeFit = [course.gradeBand]
    guest.subjectFit = ['physics']
    course.castProfiles.push(guest)
    course.voiceProfiles.push({
      castId: guest.id,
      voiceId: 'doubao:student-boy-01',
      pace: 'medium',
      emotionRange: ['questioning'],
      stabilityRule: '临时同学只承担提问。',
    })
    course.peerRoleProfile.peerId = teacher.id
    course.scenes[0]!.voiceCue.castId = guest.id

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('peerRoleProfile 没有指向同学角色。')
    expect(blockingMessages).toContain(`实际教学角色「${guest.displayName}」的学科档案(physics)不含本课学科 ${course.subject}。`)
  })

  it('允许 peerRoleProfile 指向明确的 peer 同伴角色', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    const peer = course.castProfiles.find(cast => cast.id === course.peerRoleProfile.peerId)!
    peer.role = 'peer'

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).not.toContain('peerRoleProfile 没有指向同学角色。')
  })

  it('阻断空音色 ID 和孤立音色配置', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    course.voiceProfiles[0]!.voiceId = '  '
    course.voiceProfiles.push({
      ...structuredClone(course.voiceProfiles[0]!),
      castId: 'missing-cast',
      voiceId: 'custom-voice',
    })

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain(`角色 ${course.voiceProfiles[0]!.castId} 的音色 ID 为空。`)
    expect(blockingMessages).toContain('音色配置引用了不存在的角色 missing-cast。')
  })

  it('场景发声角色即使有同名音色，缺少卡司仍阻断', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    const scene = course.scenes[0]!
    scene.voiceCue.castId = 'voice-only-cast'
    course.voiceProfiles.push({
      ...structuredClone(course.voiceProfiles[0]!),
      castId: 'voice-only-cast',
    })

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('场景声音引用了不存在的角色 voice-only-cast。')
  })

  it('阻断没有指定发声角色的场景', () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[1]!)
    course.scenes[0]!.voiceCue.castId = '  '

    const blockingMessages = blockingQualityIssues(auditMainlineCourse(course)).map(issue => issue.message)
    expect(blockingMessages).toContain('场景声音没有指定发声角色。')
  })
})

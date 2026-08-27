import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../cast-preset.js'
import { compileLessonFromKps } from '../compile-lesson.js'
import {
  FillOutputSchema,
  PracticeGenerationQualityError,
  SceneGenerationQualityError,
  fillScenes,
  fillSceneInContext,
  type FillLLMCall,
} from '../fill-scenes.js'
import { auditMainlineCourse, blockingQualityIssues } from '../../quality-gates.js'
import { practiceTaskMaterialReasons } from '../../practice-feedback.js'
import { runtimeSceneContractFor } from '../../runtime-interaction.js'
import { functionPlotContractProblems } from '../../presentation/content-forms.js'
import { teacherScriptLoadFor } from '../../teacher-script-load.js'

function makeCourse() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-example-1', canonicalName: '消息文体特征' }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

/**
 * mockLLM 返回按 scene 定制的内容,各幕互不相同——这是"去重"效果的核心断言。
 * 每次调用把 sceneIndex 从 user prompt 里抠出来(prompt 里包含"第 N 幕"字样)。
 */
// mock 通用 goals-refine 返回(system 含"资深教研员")
const MOCK_GOALS = {
  goals: [
    { goalId: 'goal-kp-01', statement: '能说出消息文体特征的三大要素并举例', successSignal: '能说出标题/导语/主体三层结构并举出示例' },
  ],
}

function validContentSlotsForSystem(system: string): Record<string, string> {
  if (system.includes('本幕定位:观察 / 分层')) {
    return {
      panelATitle: '要素一', panelA: '第一项具体内容与可观察依据。',
      panelBTitle: '要素二', panelB: '第二项具体内容与可观察依据。',
      panelCTitle: '要素三', panelC: '第三项具体内容与可观察依据。',
    }
  }
  if (system.includes('本幕定位:概念建构 /')) {
    return { trigger: '出现这个情境时使用', steps: '先判断条件，再按顺序处理', selfCheck: '结果是否满足原条件？' }
  }
  if (system.includes('本幕定位:概念建构')) return { statement: '本幕建立的规范陈述', example: '与陈述逐项对应的具体正例' }
  if (system.includes('本幕定位:例题演算')) return {
    problem: '给出完整条件并要求判断关键一步。',
    completionPrompt: '题面已有：已知条件已经圈出。请在【待补】处补出下一步，并说明依据。',
    steps: '先判断依据，再完成步骤并核对结果。',
    promptScript: '先把题面自己读一遍，圈出已经给出的条件；先想想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经写完的同学，检查每条判断有没有对应的依据。',
  }
  if (system.includes('本幕定位:辨析 / 纠错')) return { misconception: '我觉得只看表面位置就能判断。', correction: '应回到本幕证据逐项核对后再判断。', promptScript: '先把题面自己读一遍，圈出已经给出的条件；先想想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经写完的同学，检查每条判断有没有对应的依据。' }
  if (system.includes('本幕定位:练习')) {
    return {
      task: '阅读材料“甲先陈述事实，乙再补充理由”，判断两句分别承担什么作用，并各写出一条文本依据。',
      feedback: '甲承担事实陈述，乙承担理由补充。关键依据是两句的信息功能不同；若只按先后位置判断，请重新标出每句实际表达的内容再订正。',
      promptScript: '先把题面自己读一遍，圈出已经给出的条件；先想想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经写完的同学，检查每条判断有没有对应的依据。',
    }
  }
  if (system.includes('本幕定位:收束 /')) return {
    path: '提出问题 → 寻找证据 → 修正解释',
    takeaway: '结论必须由证据支持',
    transferTask: '如果只替换一条材料证据，判断原结论是否仍成立并说明依据。',
  }
  if (system.includes('本幕定位:AI 找茬')) return { aiClaim: '我觉得只看表面位置就能判断。', reveal: '这忽略了本幕证据，应逐项核对后再判断。', promptScript: '先把题面自己读一遍，圈出已经给出的条件；先想想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经写完的同学，检查每条判断有没有对应的依据。' }
  if (system.includes('本幕定位:AI 提问链')) return { shallowSample: '问：答案是什么？AI 答：给出一个结论。', probingSample: '问：依据和边界是什么？AI 答：列出依据并说明适用边界。' }
  if (system.includes('本幕定位:AI 协作任务')) return { task: '写出带条件的提示词并核验回答。', rubric: '提示词包含约束条件；回答经过独立证据核验。' }
  return { statement: '本幕建立的规范陈述', example: '与陈述逐项对应的具体正例' }
}

function makeMockLLM(): FillLLMCall {
  const contents = [
    {
      contentSlots: { topic: '消息文体特征', why: '为了学会区分事实和评论' },
      visualFocus: '消息的三段结构',
      narrationAnchor: '消息的三段结构',
      boardText: ['本课主线:消息文体特征', '为什么学:能辨别真伪', '学完你能:说清三段'],
      teacherScript: '这节课我们要弄清楚消息的三段结构:标题、导语、正文之间的关系。为什么学这个?因为报纸和新闻网站每天都在用这套结构,能识别它你就不会被开头一句吓住。这节课我们会先看整体三层,再辨别常见误区,最后把学习路径回顾一遍。',
      studentAction: '完整听读一遍,标出自己第一眼最想弄清楚的点',
      evidenceOnScreen: ['标题', '导语', '正文'],
    },
    {
      contentSlots: {
        panelA: '标题层:一句话概括核心事件',
        panelB: '导语层:五要素(时间地点人物事件结果)',
        panelC: '正文层:补充细节和背景',
      },
      visualFocus: '标题/导语/正文三层',
      narrationAnchor: '标题/导语/正文三层',
      boardText: ['标题:核心一句话', '导语:五要素', '正文:细节补充'],
      teacherScript: '请沿路径观察标题/导语/正文三层。第一层是标题,一句话概括核心;第二层是导语,把五要素装进一到两句;第三层是正文,补充所有前两层没说完的细节。三层之间不是并列,是逐层展开的关系。',
      studentAction: '按 A→B→C 说出每层想表达什么',
      evidenceOnScreen: ['标题示例', '导语示例', '正文示例'],
    },
    {
      contentSlots: {
        statement: '消息是用最少字数把五要素说清楚的文体',
        example: '示例:昨日本市图书馆开馆,首日接待读者三千人',
      },
      visualFocus: '消息的核心表述',
      narrationAnchor: '核心表述',
      boardText: ['核心表述', '一个正例', '适用边界'],
      teacherScript: '现在把观察到的收拢成一句话:消息的核心表述是"用最少字数把五要素说清楚"。屏幕中央这句核心表述先读稳,再看下面的正例,它把时间地点人物事件结果都装进了一句话,对照着找一找每个要素在哪里。',
      studentAction: '朗读核心表述,在正例中指出五要素位置',
      evidenceOnScreen: ['核心表述', '完整正例'],
    },
    {
      contentSlots: {
        promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
        misconception: '导语是不是就是文章的第一段?',
        correction: '导语是"用最少字数装五要素"的语言块,不是"第一段"的位置概念',
      },
      visualFocus: '误区:导语等于第一段',
      narrationAnchor: '误区',
      boardText: ['误区:导语=第一段', '修正:导语是五要素浓缩', '判别:看有没有五要素'],
      teacherScript: '这里处理一个常见的误区:很多同学以为导语就是文章第一段。但导语的关键不是位置,而是它"用最少字数装了五要素"。所以有的文章第一段只是引子,真正的导语在第二段。判别方法很简单:找五要素在哪里,那里就是导语。',
      studentAction: '看示例判断哪段是导语',
      evidenceOnScreen: ['误区表述', '修正说明', '五要素判别法'],
    },
    {
      contentSlots: {
        promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
        task: '阅读“校园运动会昨日开幕，初一年级八个班参加接力赛”这则短讯，用自己的话说明标题、导语、主体分别承担什么作用，并各举出一处对应内容。',
        feedback: '标题概括核心事件，导语浓缩关键要素，主体补充过程与细节。若把第一句位置直接当成导语，请回到“五要素是否集中”这一依据重新标注。',
      },
      visualFocus: '消息三层结构独立检核',
      narrationAnchor: '三层结构独立检核',
      boardText: ['先独立说明三层作用', '再用短讯内容举证', '最后对照完成标准'],
      teacherScript: '现在做一次三层结构独立检核。先不要看反馈，直接用自己的话说明标题、导语和主体分别承担什么作用，再从短讯里各举出一处对应内容。写完后再展开完成标准，定位自己漏掉的是结构名称、作用，还是具体证据。',
      studentAction: '用自己的话说明三层结构作用，并各举出一处短讯内容。',
      evidenceOnScreen: ['完整短讯', '三层作用', '对应内容'],
    },
    {
      contentSlots: {
        path: '标题一句话 → 导语五要素 → 正文细节 → 判别看五要素',
        takeaway: '消息文体的核心是"层层展开"',
        transferTask: '如果把短讯的第二句改成背景说明，判断它属于导语还是正文并说明依据。',
      },
      visualFocus: '学习路径回放',
      narrationAnchor: '学习路径',
      boardText: ['三层结构', '五要素判别', '层层展开'],
      teacherScript: '最后回放这节课的学习路径:先看三层结构,再辨别导语与第一段的差别,最后能用五要素快速判别。这条路径要能自己复述:标题一句话概括、导语装五要素、正文补细节。请沿着屏幕上的学习路径复述一遍。',
      studentAction: '沿路径复述本课主线',
      evidenceOnScreen: ['三层结构节点', '五要素判别节点', '层层展开结论'],
    },
  ]
  return async ({ system }) => {
    if (system.includes('资深教研员')) return MOCK_GOALS
    if (system.includes('本幕定位:观察 / 分层')) return contents[1]!
    if (system.includes('本幕定位:概念建构')) return contents[2]!
    if (system.includes('本幕定位:辨析 / 纠错')) return contents[3]!
    if (system.includes('本幕定位:练习')) return contents[4]!
    if (system.includes('本幕定位:收束 /')) return contents[5]!
    return contents[0]!
  }
}

describe('FillOutputSchema', () => {
  const validOutput = {
    contentSlots: { statement: '张骞两次出使西域', example: '沟通了汉朝与西域诸国' },
    visualFocus: '出使目的与影响',
    narrationAnchor: '两次出使',
    boardText: ['前 138 年首次出使', '前 119 年再次出使'],
    teacherScript: '张骞两次出使西域的直接目标并不相同，但都让汉朝更具体地了解西域。两次出使并非简单的成功或失败，而要分别看出发目的、实际结果和后续影响，再用证据说明它们怎样推动了中原与西域的联系。',
    studentAction: '按时间顺序写出两次出使的目的和结果',
    evidenceOnScreen: ['出使时间', '出使目的', '实际结果'],
  }

  it('把模型返回的字符串数组槽归一为逐行字符串', () => {
    const parsed = FillOutputSchema.parse({
      ...validOutput,
      contentSlots: {
        ...validOutput.contentSlots,
        timelineEvents: [
          '公元前138年|张骞首次出使西域',
          '公元前119年|张骞再次出使西域',
        ],
      },
    })

    expect(parsed.contentSlots.timelineEvents).toBe(
      '公元前138年|张骞首次出使西域\n公元前119年|张骞再次出使西域',
    )
  })

  it('结构层只拒绝畸形超长文本，真实课堂负荷交给逐页口播验收', () => {
    expect(FillOutputSchema.safeParse({
      ...validOutput,
      teacherScript: '讲'.repeat(600),
    }).success).toBe(true)
    expect(FillOutputSchema.safeParse({
      ...validOutput,
      teacherScript: '讲'.repeat(601),
    }).success).toBe(false)
  })

  it('不接受对象数组，避免把未知结构静默写入课程', () => {
    expect(() => FillOutputSchema.parse({
      ...validOutput,
      contentSlots: {
        ...validOutput.contentSlots,
        timelineEvents: [{ year: '公元前138年', event: '首次出使西域' }],
      },
    })).toThrow()
  })
})

describe('fillScenes', () => {
  it('完整例题即使模型只要求抄步骤，也会补成预测与自我解释动作', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-worked', canonicalName: '二力平衡', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school', subject: 'physics', preset,
    })
    const target = course.scenes.find(scene => scene.sceneType === 'worked-example')!
    const { scene: worked } = await fillSceneInContext(course, target.id, {
      llm: async () => ({
        contentSlots: {
          problem: '小球静止时先判断哪两个力？',
          promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
          completionPrompt: '题面已有：研究对象已经确定。请在【待补】处补出下一步，并说明依据。',
          steps: '第一步：确定研究对象；第二步：画出重力和拉力',
        },
        visualFocus: '小球静止时的受力步骤',
        narrationAnchor: '受力步骤',
        boardText: ['确定研究对象', '画出重力与拉力'],
        teacherScript: '先看小球静止时的受力步骤。请跟着屏幕依次确定研究对象、找出施力物体，再画出重力和拉力。每完成一步就对照板书检查名称、方向和作用对象，最后核对结果是否完整。',
        studentAction: '跟随步骤写出结果',
        evidenceOnScreen: ['学生受力图', '两个力的名称'],
      }),
    })
    expect(worked.studentAction).toContain('因为…所以…')
    expect(worked.teacherScript).toContain('核对后圈出一个关键步骤')
    expect(worked.contentSlots.completionPrompt).toContain('【待补】')
  })

  it('完整例题完成题支架不合格时逐次验收，修正前不接受输出', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-completion', canonicalName: '受力分析', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school', subject: 'physics', preset,
    })
    const target = course.scenes.find(scene => scene.sceneType === 'worked-example')!
    let attempts = 0

    const { scene } = await fillSceneInContext(course, target.id, {
      llm: async () => {
        attempts += 1
        return {
          contentSlots: {
            problem: '小球静止时先判断哪两个力？',
            promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
            completionPrompt: attempts === 1
              ? '请从头完成整道题。'
              : '题面已有：研究对象已经确定。请在【待补】处补出下一步，并说明依据。',
            steps: '第一步：确定研究对象；第二步：画出重力和拉力。',
          },
          visualFocus: '小球静止时的受力步骤',
          narrationAnchor: '受力步骤',
          boardText: ['确定研究对象', '画出重力与拉力'],
          teacherScript: '先看受力步骤。我们先确定研究对象，再识别每个力的施力物体和方向。请补出空缺步骤并写出依据，展开后逐项核对名称、方向和作用对象。',
          studentAction: '补出关键一步并说明依据，核对后解释为什么成立',
          evidenceOnScreen: ['研究对象', '力的名称与方向'],
        }
      },
    })

    expect(attempts).toBe(2)
    expect(scene.contentSlots.completionPrompt).toContain('【待补】')
  })

  it('多知识点目标按 goalId 原位润色,每幕只注入对应目标和成功信号', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
    const before = compileLessonFromKps({
      kps: [
        { id: 'kp-news', canonicalName: '消息文体特征', knowledgeType: 'conceptual' },
        { id: 'kp-pyramid', canonicalName: '倒金字塔结构', knowledgeType: 'procedural' },
      ],
      gradeBand: 'middle-school',
      subject: 'chinese',
      preset,
    })
    const scenePrompts: string[] = []
    const llm: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) {
        return {
          goals: [
            { goalId: 'goal-kp-02', statement: '能按倒金字塔顺序重排一则消息材料', successSignal: '能把四段材料按重要性排序并说明首段依据' },
            { goalId: 'goal-kp-01', statement: '能辨认消息文体的标题导语主体三层', successSignal: '能在一则消息中准确圈出三层并说明作用' },
          ],
        }
      }
      scenePrompts.push(user)
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '本幕学习证据',
        narrationAnchor: '本幕学习证据',
        boardText: ['关键依据一', '关键依据二'],
        teacherScript: '这一幕围绕本幕学习证据展开具体教学。请先观察关键依据一，再用关键依据二完成判断，并把判断过程说清楚，最后根据屏幕上的任务留下可以检查的回答。',
        studentAction: '完成判断并写出依据，按要求作图、标注或制作结果，再迁移到新情境',
        evidenceOnScreen: ['学生答案', '判断依据'],
      }
    }

    const { course } = await fillScenes(before, { llm })
    expect(course.goals.map(goal => goal.id)).toEqual(['goal-kp-01', 'goal-kp-02'])
    expect(course.goals[0]?.statement).toContain('标题导语主体')
    expect(course.goals[1]?.statement).toContain('倒金字塔')
    expect(course.goals.map(goal => goal.kpId)).toEqual(['kp-news', 'kp-pyramid'])
    for (const fragment of course.learningFragments.filter(item => item.kpId)) {
      expect(fragment.successSignal).toBe(course.goals.find(goal => goal.id === fragment.goalId)?.successSignal)
    }

    const firstKpPrompt = scenePrompts.find(prompt => prompt.includes('本幕聚焦知识点(内容只围绕它展开):消息文体特征'))!
    expect(firstKpPrompt).toContain('本幕学习目标[goal-kp-01]')
    expect(firstKpPrompt).toContain('本幕成功信号[goal-kp-01]')
    expect(firstKpPrompt).not.toContain('本幕学习目标[goal-kp-02]')
    const secondKpPrompt = scenePrompts.find(prompt => prompt.includes('本幕聚焦知识点(内容只围绕它展开):倒金字塔结构'))!
    expect(secondKpPrompt).toContain('本幕学习目标[goal-kp-02]')
    expect(secondKpPrompt).not.toContain('本幕学习目标[goal-kp-01]')
  })

  it('目标润色缺项时整批回退,不把其他知识点目标错绑过来', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
    const before = compileLessonFromKps({
      kps: [
        { id: 'kp-a', canonicalName: '知识点甲', knowledgeType: 'conceptual' },
        { id: 'kp-b', canonicalName: '知识点乙', knowledgeType: 'factual' },
      ],
      gradeBand: 'middle-school', subject: 'chinese', preset,
    })
    const llm: FillLLMCall = async ({ system }) => system.includes('资深教研员')
      ? { goals: [{ goalId: 'goal-kp-01', statement: '只能覆盖知识点甲的目标表述', successSignal: '只能检核知识点甲的课堂行为表现' }] }
      : {
          contentSlots: validContentSlotsForSystem(system),
          visualFocus: '具体学习内容', narrationAnchor: '具体学习内容',
          boardText: ['要点一', '要点二'],
          teacherScript: '这一幕围绕具体学习内容展开说明，并要求学生完成一次可以检查的任务。教师先示范判断依据，再请学生写出答案和理由，最后用屏幕上的标准自行核对。',
          studentAction: '写出答案和理由', evidenceOnScreen: ['学生答案', '判断理由'],
        }

    const { course } = await fillScenes(before, { llm })
    expect(course.goals).toEqual(before.goals)
  })

  it('目标润色退化成理解或遗漏目标动作时整批回退', async () => {
    const before = makeCourse()
    const llm: FillLLMCall = async ({ system }) => system.includes('资深教研员')
      ? {
          goals: [{
            goalId: 'goal-kp-01',
            statement: '理解消息文体特征并掌握三层结构',
            successSignal: '学生能说出三层结构名称',
          }],
        }
      : {
          contentSlots: validContentSlotsForSystem(system),
          visualFocus: '具体学习内容', narrationAnchor: '具体学习内容',
          boardText: ['要点一', '要点二'],
          teacherScript: '这一幕围绕具体学习内容展开说明，并要求学生完成一次可以检查的任务。教师先示范判断依据，再请学生写出答案和理由，最后用屏幕上的标准自行核对。',
          studentAction: '写出答案和理由', evidenceOnScreen: ['学生答案', '判断理由'],
        }

    const { course } = await fillScenes(before, { llm })
    expect(course.goals).toEqual(before.goals)
  })

  it('单幕连续不合格不再拖垮整课:失败幕保留骨架并列入 failedScenes,其余幕照常填', async () => {
    const before = makeCourse()
    const practiceBefore = before.scenes.find(s => s.sceneType === 'practice')!
    const llm: FillLLMCall = async ({ system }) => system.includes('资深教研员')
      ? { goals: [] }
      : {
          // 练习幕持续返回缺 task/feedback 的输出 → 3 连败;其余幕合格
          contentSlots: system.includes('本幕定位:练习') ? { note: '不合格输出' } : validContentSlotsForSystem(system),
          visualFocus: '具体学习内容', narrationAnchor: '具体学习内容',
          boardText: ['要点一', '要点二'],
          teacherScript: '这一幕围绕具体学习内容展开说明，并要求学生完成一次可以检查的任务。教师先示范判断依据，再请学生写出答案和理由，最后用屏幕上的标准自行核对。',
          studentAction: '写出答案和理由', evidenceOnScreen: ['学生答案', '判断理由'],
        }

    const { course, failedScenes } = await fillScenes(before, { llm })
    expect(failedScenes.map(f => f.sceneId)).toContain(practiceBefore.id)
    expect(failedScenes[0]!.reasons.length).toBeGreaterThan(0)
    // 失败幕内容保持骨架原样,不保存不合格输出
    const practiceAfter = course.scenes.find(s => s.id === practiceBefore.id)!
    expect(practiceAfter.contentSlots).toEqual(practiceBefore.contentSlots)
    // 其余幕已正常填充,整课不因单幕失败而丢弃
    const worked = course.scenes.find(s => s.sceneType === 'worked-example')
    const filledOther = worked ?? course.scenes.find(s => s.sceneType === 'concept-build')!
    expect(filledOther.visualFocus).toBe('具体学习内容')
    expect(course.qualityStatus).toBe('blocked')
  })

  it('replaces content fields but preserves structural fields', async () => {
    const before = makeCourse()
    const structural = before.scenes.map(s => ({
      id: s.id, sceneType: s.sceneType, visualLayout: s.visualLayout,
      dialogueLayout: s.dialogueLayout, sceneTechnique: s.sceneTechnique,
      characterLayer: s.characterLayer,
    }))

    const { course } = await fillScenes(before, { llm: makeMockLLM() })

    course.scenes.forEach((s, i) => {
      expect(s.id).toBe(structural[i]!.id)
      expect(s.sceneType).toBe(structural[i]!.sceneType)
      expect(s.visualLayout).toBe(structural[i]!.visualLayout)
      expect(s.dialogueLayout).toBe(structural[i]!.dialogueLayout)
      expect(s.sceneTechnique).toBe(structural[i]!.sceneTechnique)
      expect(s.characterLayer).toEqual(structural[i]!.characterLayer)
    })
  })

  it('makes each scene distinct (kills the "每幕讲同一 KP" repeat)', async () => {
    const { course } = await fillScenes(makeCourse(), { llm: makeMockLLM() })
    const scripts = course.scenes.map(s => s.teacherScript)
    // 各幕讲稿互不相同(单概念 KP 课 = 6 幕)
    expect(new Set(scripts).size).toBe(course.scenes.length)
    // 讲稿不再全是"待 LLM 填充"占位
    expect(scripts.every(s => !s.includes('待 LLM 填充'))).toBe(true)
    // 每个 scene 的 visualFocus 也应不同
    const focuses = course.scenes.map(s => s.visualFocus)
    expect(new Set(focuses).size).toBe(course.scenes.length)
  })

  it('整课填充按选定模板把照读式收束升级为解释与迁移', async () => {
    const { course } = await fillScenes(makeCourse(), { llm: makeMockLLM() })
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!

    expect(recap.studentAction).toBe('独立完成屏幕迁移题，写出判断和依据，再回看并修正开场预测')
    expect(recap.teacherScript).toContain('结论与依据只是线索')
    expect(recap.teacherScript).toContain('迁移题')
  })

  it('确定性教学提示补入后仍不突破本页口播预算', async () => {
    const longScriptLLM: FillLLMCall = async ({ system }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '本幕学习内容',
        narrationAnchor: '本幕学习内容',
        boardText: ['关键依据一', '关键依据二'],
        teacherScript: `本幕学习内容。${'讲'.repeat(80)}`,
        studentAction: '沿路径复述本课主线',
        evidenceOnScreen: ['学生回答', '判断依据'],
      }
    }

    const { course } = await fillScenes(makeCourse(), { llm: longScriptLLM })
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    expect(teacherScriptLoadFor(course, recap).overBudget).toBe(false)
    expect(recap.teacherScript).toContain(recap.narrationAnchor)
    expect(recap.studentAction).toBe('独立完成屏幕迁移题，写出判断和依据，再回看并修正开场预测')
  })

  it('单页重生成会在确定性补句后重验口播预算，并要求模型压缩后才返回', async () => {
    const course = makeCourse()
    const scene = course.scenes.find(candidate => candidate.sceneType === 'visual-observation')!
    let calls = 0
    const llm: FillLLMCall = async ({ system }) => {
      calls += 1
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '本幕学习内容',
        narrationAnchor: '本幕学习内容',
        boardText: ['关键依据一', '关键依据二'],
        teacherScript: calls === 1
          ? `本幕学习内容。${'讲'.repeat(140)}`
          : `本幕学习内容。${'讲'.repeat(60)}`,
        studentAction: '写出一条观察结论和画面依据',
        evidenceOnScreen: ['学生回答', '判断依据'],
      }
    }

    const result = await fillSceneInContext(course, scene.id, { llm })
    expect(calls).toBe(2)
    expect(teacherScriptLoadFor(course, result.scene).overBudget).toBe(false)
    expect(result.scene.teacherScript).toContain('本幕学习内容')
  })

  it('整课填充保留观察操作，并确定性补上可检查的回答', async () => {
    const llm: FillLLMCall = async ({ system }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '关键变化',
        narrationAnchor: '关键变化',
        boardText: ['变化前', '变化后'],
        teacherScript: '这一幕围绕关键变化展开。先看变化前后的具体差别，再完成屏幕上的操作；操作结束后不要只停在看过，而要留下教师能够检查的回答和依据，用它承接下一页的学习。',
        studentAction: '拖动滑块并观察变化',
        evidenceOnScreen: ['变化前', '变化后'],
      }
    }

    const { course } = await fillScenes(makeCourse(), { llm })
    const observation = course.scenes.find(scene => scene.sceneType === 'visual-observation')!

    expect(observation.studentAction).toBe('拖动滑块并观察变化，再说出一条观察结论和画面依据')
    expect(auditMainlineCourse(course).some(item => item.targetId === observation.id && item.message === '学生动作只有观看或操作，没有留下可检查的回答。')).toBe(false)
  })

  it('advances qualityStatus to passed when audit is clean', async () => {
    const { course, blocking } = await fillScenes(makeCourse(), { llm: makeMockLLM() })
    expect(blocking.map(b => `${b.gate}:${b.message}`)).toEqual([])
    expect(course.qualityStatus).toBe('passed')
  })

  it('marks qualityStatus=blocked when LLM output would fail audit', async () => {
    // LLM 返回 boardText 单条(其实 zod schema 会先拒绝——所以我们要让 schema 通过但 audit 挂)
    // 让 boardText 是极短、visualFocus 也很短——但都能过 schema。选一个 audit 才检测的字段。
    // audit 里"scene.characterLayer.layout !== scene.dialogueLayout"是 warning,不阻塞。
    // 真正的 blocking 是 content-dense + 大 dialogueLayout。但我们无法从 LLM 端改 dialogueLayout(结构字段)。
    // 所以本例的期望是"即使 LLM 内容合规,audit 应也是 clean"——上一测试已覆盖。
    // 这里改测"LLM 抛错时,fillScenes 也抛错(不落库脏 course)"
    const failingLLM: FillLLMCall = async () => { throw new Error('mock LLM outage') }
    await expect(fillScenes(makeCourse(), { llm: failingLLM })).rejects.toThrow(/mock LLM outage/)
  })

  it('injects subject-specific teaching hint into system prompt (决策 3)', async () => {
    const capturedSystems: string[] = []
    const mockLLM: FillLLMCall = async ({ system }) => {
      capturedSystems.push(system)
      if (system.includes('资深教研员')) return MOCK_GOALS
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '焦点',
        narrationAnchor: '锚点',
        boardText: ['b1', 'b2'],
        teacherScript: '这是老师讲稿的完整内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 锚点 一致的锚点词,不再引发兜底。多加一些字保证长度到达八十字。',
        studentAction: '学生看',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    // 地理课 → 应含"七字口诀"
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    const geoCourse = compileLessonFromKps({
      kps: [{ id: 'kp-g', canonicalName: '中国省级行政区划' }],
      gradeBand: 'middle-school',
      subject: 'geography',
      preset,
    })
    await fillScenes(geoCourse, { llm: mockLLM })
    // 调用数 = 1 次 refineGoals + 除确定性开场外每幕 1 次 scene fill
    expect(capturedSystems).toHaveLength(geoCourse.scenes.length)
    // scene fill 的 system 应含地理 hint(refineGoals 的 system 也含,但走的是"资深教研员"分支)
    const sceneCallSystems = capturedSystems.filter(s => !s.includes('资深教研员'))
    expect(sceneCallSystems).toHaveLength(geoCourse.scenes.length - 1)
    for (const sys of sceneCallSystems) {
      expect(sys).toContain('七字口诀')
      expect(sys).toContain('geography')
    }
  })

  it('injects pedagogy assets: tone contract + metaphor whitelist + misconception refs(v4 M1)', async () => {
    const captured: Array<{ system: string; user: string }> = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      captured.push({ system, user })
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '教学对象',
        narrationAnchor: '教学对象',
        boardText: ['板书 1', '板书 2'],
        teacherScript: '这是老师讲稿的完整内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底。多加一些字保证长度到达八十个字符。',
        studentAction: '学生跟读',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const circuitCourse = compileLessonFromKps({
      kps: [{ id: 'kp-circuit', canonicalName: '欧姆定律与电阻' }],
      gradeBand: 'middle-school',
      subject: 'physics',
      preset,
    })
    await fillScenes(circuitCourse, { llm: mockLLM })

    for (const call of captured) {
      // 学段语气契约每幕注入
      expect(call.system).toContain('本学段语气契约')
      expect(call.system).toContain('学段禁用措辞')
      // 电路课命中隐喻注册表:白名单 + 必须点破边界
      expect(call.system).toContain('封闭水管中的水流')
      expect(call.system).toContain('失灵边界')
    }
    // 辨析幕命中误概念库:真实误概念作误区参考
    const contrastCall = captured.find(call => call.user.includes('本幕 sceneType:contrast'))
    if (contrastCall) {
      expect(contrastCall.user).toContain('误概念库命中')
      expect(contrastCall.user).toContain('用光')
    }
  })

  it('injects season context: 开场承接上集钩子 + recap 留下集预告 + 中间幕禁剧情(v4 M2)', async () => {
    const captured: Array<{ system: string; user: string }> = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      captured.push({ system, user })
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '教学对象',
        narrationAnchor: '教学对象',
        boardText: ['板书 1', '板书 2'],
        teacherScript: '这是老师讲稿的完整内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底。多加一些字保证长度到达八十个字符。',
        studentAction: '学生跟读',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    const before = makeCourse()
    const { course } = await fillScenes(before, {
      llm: mockLLM,
      season: {
        seasonTitle: '文体侦探社',
        seasonTheme: '拆解每一种文体的秘密结构',
        episodeNo: 2,
        prevEpisode: { topic: '新闻标题的秘密', endingHook: '标题之下,还有一层更浓缩的句子在等我们。' },
        openHooks: ['标题之下,还有一层更浓缩的句子在等我们。'],
      },
    })

    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    expect(source.teacherScript).toContain('上一课的问题先留在心里')
    expect(source.teacherScript).not.toContain('标题之下,还有一层更浓缩的句子在等我们。')

    before.scenes.filter(scene => scene.sceneType !== 'source-reading').forEach((scene, i) => {
      const { user } = captured[i]!
      expect(user).toContain('文体侦探社')
      if (scene.sceneType === 'recap') {
        expect(user).toContain('serialHook')
        expect(user).toContain('下集预告')
      } else {
        expect(user).toContain('不得出现任何剧情')
      }
    })
  })

  it('non-season courses get no serial-hook or season wording in prompts', async () => {
    const captured: string[] = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      captured.push(user)
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '教学对象',
        narrationAnchor: '教学对象',
        boardText: ['板书 1', '板书 2'],
        teacherScript: '这是老师讲稿的完整内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底。多加一些字保证长度到达八十个字符。',
        studentAction: '学生跟读',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    await fillScenes(makeCourse(), { llm: mockLLM })
    for (const user of captured) {
      expect(user).not.toContain('serialHook')
      expect(user).not.toContain('课程季')
    }
  })

  it('tells the LLM which scenes will have images and forbids image references elsewhere', async () => {
    const systemsByScene: string[] = []
    const mockLLM: FillLLMCall = async ({ system }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      systemsByScene.push(system)
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '教学对象',
        narrationAnchor: '教学对象',
        boardText: ['板书 1', '板书 2'],
        teacherScript: '这是老师讲稿的完整内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底。多加一些字保证长度到达八十个字符。',
        studentAction: '学生跟读',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    const before = makeCourse()
    await fillScenes(before, { llm: mockLLM })
    before.scenes.filter(scene => scene.sceneType !== 'source-reading').forEach((scene, i) => {
      if (['visual-observation', 'contrast', 'recap'].includes(scene.sceneType)) {
        expect(systemsByScene[i], scene.sceneType).toContain('会另行生成一整幅教学插图')
      } else {
        expect(systemsByScene[i], scene.sceneType).toContain('严禁出现「看这幅图')
      }
    })
  })

  it('falls back to append narrationAnchor when LLM forgets to include it', async () => {
    const skewedLLM: FillLLMCall = async ({ system }) => system.includes('资深教研员') ? MOCK_GOALS : ({
      contentSlots: validContentSlotsForSystem(system),
      visualFocus: '标准焦点',
      narrationAnchor: '独立锚点词',
      boardText: ['板书 1', '板书 2'],
      teacherScript: '这是老师讲稿的完整内容,包含足够的字数以满足 schema 的最小长度要求(至少 80 字),但故意不写锚点词进来,用来测试兜底把锚点补进讲稿的兜底逻辑。',
      studentAction: '学生按讲稿动作演练',
      evidenceOnScreen: ['证据 1', '证据 2'],
    })
    const { course } = await fillScenes(makeCourse(), { llm: skewedLLM })
    // 每 scene 的 teacherScript 都被兜底补上了 narrationAnchor
    course.scenes.forEach(s => {
      expect(s.teacherScript).toContain(s.narrationAnchor)
    })
  })

  it('v5 M1:非 force 时跳过教师已手改的幕,不覆盖其内容(respectTeacherEdits 默认开)', async () => {
    const before = makeCourse()
    const editedScene = { ...before.scenes[1]!, teacherScript: '教师手改的讲解内容,保持原样不应被覆盖,足够长避免过短警告触发。', editedByTeacher: true }
    const course = { ...before, scenes: before.scenes.map((s, i) => (i === 1 ? editedScene : s)) }

    let callCount = 0
    const mockLLM: FillLLMCall = async ({ system }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      callCount += 1
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '教学对象',
        narrationAnchor: '教学对象',
        boardText: ['板书 1', '板书 2'],
        teacherScript: 'AI 重新生成的讲解内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底。',
        studentAction: '学生跟读',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    const { course: filled } = await fillScenes(course, { llm: mockLLM })
    // 教师手改幕原样保留(内容不被覆盖),editedByTeacher 标记也保留
    const untouched = filled.scenes[1]!
    expect(untouched.teacherScript).toBe(editedScene.teacherScript)
    expect(untouched.editedByTeacher).toBe(true)
    // 教师手改幕跳过；确定性开场也不消耗模型调用。
    expect(callCount).toBe(course.scenes.length - 2)
  })

  it('v5 M1:force 场景(respectTeacherEdits:false)重填所有幕,包括教师已手改的', async () => {
    const before = makeCourse()
    const editedScene = { ...before.scenes[1]!, teacherScript: '教师手改的讲解内容,应在 force 模式下被覆盖。', editedByTeacher: true }
    const course = { ...before, scenes: before.scenes.map((s, i) => (i === 1 ? editedScene : s)) }

    const mockLLM: FillLLMCall = async ({ system }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '教学对象',
        narrationAnchor: '教学对象',
        boardText: ['板书 1', '板书 2'],
        teacherScript: 'AI 重新生成的讲解内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底。',
        studentAction: '学生跟读',
        evidenceOnScreen: ['e1', 'e2'],
      }
    }
    const { course: filled } = await fillScenes(course, { llm: mockLLM, respectTeacherEdits: false })
    const overwritten = filled.scenes[1]!
    expect(overwritten.teacherScript).not.toBe(editedScene.teacherScript)
    expect(overwritten.editedByTeacher).toBe(false)
  })
})

describe('函数图生成结果规范化', () => {
  it('单页生成在落库前排序、过滤定义域并按断点切分', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-function', canonicalName: '描点法画函数图象', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school',
      subject: 'math',
      preset,
    })
    const target = course.scenes.find(scene => scene.sceneType === 'worked-example')!
    const llm: FillLLMCall = async () => ({
      contentSlots: {
        problem: '画出函数 \\(y=\\dfrac{1}{x-1}\\) 在给定定义域内的图象。',
        promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
        completionPrompt: '题面已有：无定义点已经确定。请在【待补】处补出下一步，并说明依据。',
        steps: '先确定无定义点，再分别在断点两侧描点连线。',
        funcExpr: '\\(y=\\dfrac{1}{x-1}\\)',
        funcDomain: '0,4',
        funcPlotPoints: '4,0.333 0,-1 0.5,-2 2,1 1,99 -3,-0.25 3,0.5',
        funcBreakpoints: 'x=1（不取）',
        funcKeyPoints: 'x=0处:(0,-1);x=2处:(2,1)',
      },
      visualFocus: '分式函数断点两侧的图象',
      narrationAnchor: '断点两侧',
      boardText: ['先找无定义点', '断点两侧分别描点', '不能跨断点连线'],
      teacherScript: '先看断点两侧。横坐标等于一时分母为零，这个位置不能取；请分别核对左右两侧的函数值，再按横坐标顺序描点。想一想，为什么两侧的点不能跨过断点直接连起来？',
      studentAction: '分别核对断点两侧的点，并说明不能跨越连线的理由',
      evidenceOnScreen: ['无定义点', '左侧连续分支', '右侧连续分支'],
    })

    const { scene } = await fillSceneInContext(course, target.id, { llm })

    expect(scene.contentSlots.funcPlotPoints).toBe('0,-1 0.5,-2 | 2,1 3,0.5 4,0.333')
    expect(scene.contentSlots.funcBreakpoints).toBe('x=1')
    expect(functionPlotContractProblems(scene.contentSlots)).toEqual([])
  })
})

describe('知识点辨析页误区溯源', () => {
  it('prompt 只使用本页固化来源,模型改成无关错误时落库前回退', async () => {
    const source = '把海岸线吻合直接当成大陆漂移的充分证据'
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-m', canonicalName: '海陆变迁', knowledgeType: 'conceptual', misconceptions: [source] }],
      gradeBand: 'middle-school',
      subject: 'geography',
      preset,
    })
    const contrast = course.scenes.find(scene => scene.sceneType === 'contrast')!
    let capturedPrompt = ''
    const llm: FillLLMCall = async ({ user }) => {
      capturedPrompt = user
      return {
        contentSlots: {
          promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
          misconception: '三角形内角和是二百度。',
          correction: '海岸线形态相似只能算线索,还要结合岩层、化石和长期测量证据。',
        },
        visualFocus: '海陆变迁证据辨析',
        narrationAnchor: '证据辨析',
        boardText: ['先找错误判断', '再核对证据', '最后修正规则'],
        teacherScript: '先完成证据辨析，不要急着听结论。请把这句话里被说得过满的部分圈出来，再用本课已经出现的材料说明为什么只凭单一线索还不能得到充分结论。',
        studentAction: '圈出过度判断并写下一条反证依据',
        evidenceOnScreen: ['教研确认的错误说法', '学生写下的判别依据'],
      }
    }

    const { scene } = await fillSceneInContext(course, contrast.id, { llm })
    expect(capturedPrompt).toContain(`本幕唯一可使用的误区原文：「${source}」`)
    expect(capturedPrompt).toContain('不得替换或编造另一种错误')
    expect(scene.contentSlots.misconception).toContain(source)

    const audited = { ...course, scenes: course.scenes.map(item => item.id === scene.id ? scene : item) }
    expect(blockingQualityIssues(auditMainlineCourse(audited)).map(issue => issue.message))
      .not.toContain('辨析幕的错误说法与教研确认误区原文重合度过低,疑似 LLM 自由编造错误。')
  })
})

describe('v5 M2 ai-verify 溯源提示注入', () => {
  it('fillOneScene 的 user prompt 携带 misconceptionSource 原文与不得偏离的约束', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    const course = compileLessonFromKps({
      kps: [{
        id: 'kp-m', canonicalName: '海陆变迁', knowledgeType: 'conceptual',
        misconceptions: ['海岸线吻合是大陆漂移的证据', '板块运动速度肉眼可见'],
      }],
      gradeBand: 'middle-school',
      subject: 'geography',
      preset,
    })
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!
    expect(verifyScene.misconceptionSource).toBe('板块运动速度肉眼可见')

    const captured: string[] = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      captured.push(user)
      return {
        contentSlots: system.includes('本幕定位:AI 找茬')
          ? { aiClaim: '我觉得板块运动速度肉眼可见,所以能看见大陆在动。', reveal: '板块运动极其缓慢,肉眼无法察觉,要靠长期测量数据判断。' }
          : validContentSlotsForSystem(system),
        visualFocus: '这句话对不对',
        narrationAnchor: '找茬',
        boardText: ['待核查说法', '判断依据', '核查结论'],
        teacherScript: '请先判断板块运动速度肉眼可见这句话是否正确,再找出真正的判别依据,看看长期观测数据说明了什么。',
        studentAction: '判断说法是否正确并写出理由',
        evidenceOnScreen: ['待核查说法', '判断理由'],
      }
    }
    await fillScenes(course, { llm: mockLLM })
    const verifyPrompt = captured.find(u => u.includes('本幕 sceneType:ai-verify'))!
    expect(verifyPrompt).toContain('板块运动速度肉眼可见')
    expect(verifyPrompt).toContain('不得替换或编造新的错误')
    expect(verifyPrompt).not.toContain('AI 助教')
    expect(verifyPrompt).not.toContain('小助')
  })

  it('单页重生成即使模型改写跑偏，也在落库前回退到教研误区原文', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
    const course = compileLessonFromKps({
      kps: [{
        id: 'kp-anchor', canonicalName: '板块运动', knowledgeType: 'conceptual',
        misconceptions: ['海岸线吻合只是巧合', '板块运动速度肉眼可见'],
      }],
      gradeBand: 'middle-school', subject: 'geography', preset,
    })
    const verifyScene = course.scenes.find(scene => scene.sceneType === 'ai-verify')!
    const source = verifyScene.misconceptionSource!
    const reveal = '板块每年只移动很短距离，必须依靠长期定位数据才能确认运动。'
    const llm: FillLLMCall = async () => ({
      contentSlots: { aiClaim: '我觉得三角形内角和是二百度。', reveal, promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。' },
      visualFocus: '板块运动说法核查',
      narrationAnchor: '板块运动说法核查',
      boardText: ['先判断说法', '再引用证据'],
      teacherScript: '请先独立核查这句话，不要急着听结论。把最可疑的一处圈出来，再引用本课已经出现的观测证据说明理由；提交判断后，我们再核对真实运动尺度。',
      studentAction: '判断说法并写出一条本课证据',
      evidenceOnScreen: ['待核查说法', '学生引用的观测证据'],
    })

    const { scene } = await fillSceneInContext(course, verifyScene.id, { llm })
    const auditedCourse = { ...course, scenes: course.scenes.map(item => item.id === scene.id ? scene : item) }

    expect(scene.contentSlots.aiClaim).toContain(source)
    expect(scene.contentSlots.reveal).toBe(reveal)
    expect(blockingQualityIssues(auditMainlineCourse(auditedCourse)).some(issue =>
      issue.targetId === scene.id && issue.message.includes('重合度过低'),
    )).toBe(false)
  })

  it('骨架合并了多条误区时,prompt 逐条列出原文并要求产出 aiClaimN/revealN 细分槽', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
    const course = compileLessonFromKps({
      kps: [{
        id: 'kp-p', canonicalName: '移项', knowledgeType: 'procedural',
        misconceptions: ['移项不用变号', '系数化 1 时符号不变', '合并同类项时忽略符号'],
      }],
      gradeBand: 'middle-school',
      subject: 'math',
      preset,
    })
    const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify')!
    expect(verifyScene.misconceptionSources).toHaveLength(3)

    const captured: string[] = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      captured.push(user)
      return {
        contentSlots: system.includes('本幕定位:AI 找茬') ? {
          aiClaim: '我觉得移项不用变号,系数化 1 时符号不变,合并同类项时也可以忽略符号。',
          reveal: '三处都错:移项要变号,系数化 1 符号要跟着变,合并同类项也要看符号。',
          aiClaim1: '我觉得移项不用变号。', reveal1: '移项跨等号要变号。',
          aiClaim2: '我觉得系数化 1 时符号不变。', reveal2: '系数化 1 时符号要按除数符号判断。',
          aiClaim3: '我觉得合并同类项时忽略符号。', reveal3: '合并同类项要连同符号一起合并。',
        } : validContentSlotsForSystem(system),
        visualFocus: '这些说法对不对',
        narrationAnchor: '找茬',
        boardText: ['待核查说法', '判断依据', '核查结论'],
        teacherScript: '屏幕上连续出现三条关于移项的说法,请逐条判断并写出依据,再查看每条核查结论。',
        studentAction: '逐条判断说法是否正确',
        evidenceOnScreen: ['待核查说法', '判断理由'],
      }
    }
    await fillScenes(course, { llm: mockLLM })
    const verifyPrompt = captured.find(u => u.includes('本幕 sceneType:ai-verify'))!
    expect(verifyPrompt).toContain('本幕合并了 3 条误区原文')
    expect(verifyPrompt).toContain('误区原文 1:「移项不用变号」')
    expect(verifyPrompt).toContain('误区原文 2:「系数化 1 时符号不变」')
    expect(verifyPrompt).toContain('误区原文 3:「合并同类项时忽略符号」')
    expect(verifyPrompt).toContain('aiClaim1 / reveal1')
    expect(verifyPrompt).toContain('aiClaim3 / reveal3')
    expect(verifyPrompt).not.toContain('AI 助教')
    expect(verifyPrompt).not.toContain('小助')
  })

  it('整课生成发现练习题面泄露答案时只回修该幕一次', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const before = compileLessonFromKps({
      kps: [{ id: 'kp-force', canonicalName: '二力平衡', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school',
      subject: 'physics',
      preset,
    })
    let practiceCalls = 0
    const llm: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      if (system.includes('本幕定位:练习')) {
        practiceCalls += 1
        const repaired = user.includes('上一次输出未通过')
        return {
          contentSlots: repaired
            ? {
                promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
                task: '质量为 4kg 的球用绳悬挂静止，取 g=9.8N/kg。画出受力图并求两个力的大小。',
                feedback: '重力 G=mg=39.2N，方向竖直向下；拉力 T=39.2N，方向竖直向上。若方向画反，回到静止条件重新核对两个力。',
              }
            : {
                promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
                task: '画出小球受力图。重力 G=mg=39.2N 竖直向下，拉力 T=39.2N 竖直向上。',
                feedback: '重力 G=mg=39.2N，方向竖直向下；拉力 T=39.2N，方向竖直向上。若方向画反，回到静止条件重新核对两个力。',
              },
          visualFocus: '悬挂小球的二力平衡',
          narrationAnchor: '二力平衡',
          boardText: ['先独立作图', '再核对方向与大小'],
          teacherScript: '请先独立完成屏幕上的二力平衡任务，把两个力的方向和大小都写清楚。提交答案后再看反馈，逐项核对施力物体、方向和数量关系，发现不一致时回到静止条件重新判断。',
          studentAction: '独立画图并写出两个力的大小',
          evidenceOnScreen: ['学生受力图', '大小计算过程'],
        }
      }
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '本幕学习证据', narrationAnchor: '本幕学习证据',
        boardText: ['关键依据一', '关键依据二'],
        teacherScript: '这一幕围绕本幕学习证据展开具体教学。请先观察关键依据一，再用关键依据二完成判断，并把判断过程说清楚，最后根据屏幕上的任务留下可以检查的回答。',
        studentAction: '完成本幕判断并写出依据', evidenceOnScreen: ['学生答案', '判断依据'],
      }
    }

    const { course } = await fillScenes(before, { llm })
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    expect(practiceCalls).toBe(2)
    expect(practice.contentSlots.task).not.toContain('39.2N')
    expect(practice.contentSlots.feedback).toContain('39.2N')
  })

  it('整课生成会回修缺少实际作答材料和纠错行动的练习', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chemistry' })
    const before = compileLessonFromKps({
      kps: [{ id: 'kp-heat', canonicalName: '热化学方程式', knowledgeType: 'factual' }],
      gradeBand: 'middle-school',
      subject: 'chemistry',
      preset,
    })
    let practiceCalls = 0
    const llm: FillLLMCall = async ({ system, user }) => {
      if (system.includes('资深教研员')) return MOCK_GOALS
      if (system.includes('本幕定位:练习')) {
        practiceCalls += 1
        const repaired = user.includes('上一次输出未通过')
        return {
          contentSlots: repaired
            ? {
                promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
                task: '逐条判断并说明理由：\nA. 反应物和生成物都标明聚集状态；\nB. 吸热反应的焓变写为负值；\nC. 计量数翻倍但焓变不变。',
                feedback: 'A 正确；B 的焓变应为正值；C 的焓变须随计量数翻倍。若把吸热写成负值，回到体系吸收能量的符号约定重新判断。',
              }
            : {
                promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
                task: '判断屏幕上三条热化学方程式各有一处错误。',
                feedback: '做得很好，请核对答案。',
              },
          visualFocus: '热化学方程式逐条核查',
          narrationAnchor: '逐条核查',
          boardText: ['先独立判断', '再核对符号与计量数'],
          teacherScript: '请先完成屏幕上的逐条核查任务并写出理由。提交后再看反馈，按聚集状态、焓变符号和计量数三个标准定位错误，并把不一致的一条重新订正。',
          studentAction: '逐条判断并写出理由',
          evidenceOnScreen: ['三条判断', '订正理由'],
        }
      }
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '本幕学习证据', narrationAnchor: '本幕学习证据',
        boardText: ['关键依据一', '关键依据二'],
        teacherScript: '这一幕围绕本幕学习证据展开具体教学。请先观察关键依据一，再用关键依据二完成判断，并把判断过程说清楚，最后根据屏幕上的任务留下可以检查的回答。',
        studentAction: '完成本幕判断并写出依据', evidenceOnScreen: ['学生答案', '判断依据'],
      }
    }

    const { course } = await fillScenes(before, { llm })
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    expect(practiceCalls).toBe(2)
    expect(practice.contentSlots.task).toContain('A. 反应物和生成物')
    expect(practice.contentSlots.feedback).toContain('回到体系吸收能量的符号约定重新判断')
    expect(blockingQualityIssues(auditMainlineCourse(course)).some(issue => issue.targetId === practice.id)).toBe(false)
  })

  it('每次回修都重新验收，直到第三次输出真正补齐作答材料', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chemistry' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-heat-retry', canonicalName: '热化学方程式', knowledgeType: 'factual' }],
      gradeBand: 'middle-school',
      subject: 'chemistry',
      preset,
    })
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    let calls = 0

    const { scene } = await fillSceneInContext(course, practice.id, {
      llm: async () => {
        calls += 1
        const valid = calls === 3
        return {
          contentSlots: valid
            ? {
                promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
                task: '逐条判断并说明理由：\nA. 反应物和生成物都标明聚集状态；\nB. 吸热反应的焓变写为负值；\nC. 计量数翻倍但焓变不变。',
                feedback: 'A 正确；B 的焓变应为正值；C 的焓变须随计量数翻倍。若把吸热写成负值，回到体系吸收能量的符号约定重新判断。',
              }
            : {
                promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
                task: '判断屏幕上三条热化学方程式各有一处错误。',
                feedback: '做得很好，请核对答案。',
              },
          visualFocus: '热化学方程式逐条核查',
          narrationAnchor: '逐条核查',
          boardText: ['先独立判断', '再核对符号与计量数'],
          teacherScript: '请先完成屏幕上的逐条核查任务并写出理由。提交后再看反馈，按聚集状态、焓变符号和计量数三个标准定位错误，并把不一致的一条重新订正。',
          studentAction: '逐条判断并写出理由',
          evidenceOnScreen: ['三条判断', '订正理由'],
        }
      },
    })

    expect(calls).toBe(3)
    expect(scene.contentSlots.task).toContain('A. 反应物和生成物')
    expect(practiceTaskMaterialReasons(scene.contentSlots.task ?? '')).toEqual([])
  })

  it('三次仍缺少作答材料时中止生成，不返回表面完整的坏题', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chemistry' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-heat-fail', canonicalName: '热化学方程式', knowledgeType: 'factual' }],
      gradeBand: 'middle-school',
      subject: 'chemistry',
      preset,
    })
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    let calls = 0
    const invalidLLM: FillLLMCall = async () => {
      calls += 1
      return {
        contentSlots: {
          promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
          task: '判断屏幕上三条热化学方程式各有一处错误。',
          feedback: '做得很好，请核对答案。',
        },
        visualFocus: '热化学方程式逐条核查',
        narrationAnchor: '逐条核查',
        boardText: ['先独立判断', '再核对符号与计量数'],
        teacherScript: '请先完成屏幕上的逐条核查任务并写出理由。提交后再看反馈，按聚集状态、焓变符号和计量数三个标准定位错误，并把不一致的一条重新订正。',
        studentAction: '逐条判断并写出理由',
        evidenceOnScreen: ['三条判断', '订正理由'],
      }
    }

    const failure = fillSceneInContext(course, practice.id, { llm: invalidLLM })
    await expect(failure).rejects.toMatchObject({
      name: 'PracticeGenerationQualityError',
      code: 'PRACTICE_QUALITY_RETRY_EXHAUSTED',
      sceneId: practice.id,
      attempts: 3,
    })
    await expect(failure).rejects.toBeInstanceOf(PracticeGenerationQualityError)
    await expect(failure).rejects.toHaveProperty('reasons', expect.arrayContaining([
      expect.stringMatching(/题面|作答材料/),
    ]))
    expect(calls).toBe(3)
  })

  it('练习回修把成功信号拆成必须完成的学生动作，而不是只重复泛化目标', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const compiled = compileLessonFromKps({
      kps: [{ id: 'kp-draw-and-apply', canonicalName: '凸透镜成像规律', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school',
      subject: 'physics',
      preset,
    })
    const course = {
      ...compiled,
      goals: compiled.goals.map(goal => ({
        ...goal,
        successSignal: '学生能画出光路并标注焦点，并在新情境中应用凸透镜规律。',
      })),
    }
    const practice = course.scenes.find(scene => scene.sceneType === 'practice')!
    const prompts: string[] = []
    let calls = 0

    await expect(fillSceneInContext(course, practice.id, {
      llm: async ({ user }) => {
        calls += 1
        prompts.push(user)
        return {
          contentSlots: {
            task: '根据凸透镜焦距 10 cm 计算物距为 20 cm 时像距。',
            feedback: '像距为 20 cm。若只计算而未作图，请补画两条特殊光线并标注焦点。',
          },
          visualFocus: '凸透镜成像作图任务',
          narrationAnchor: '两条特殊光线',
          boardText: ['先画特殊光线', '再标注焦点'],
          teacherScript: '请先完成题目。提交后核对两条特殊光线和焦点标注是否完整，再说明为什么像距等于物距。',
          studentAction: '独立计算像距并写出结果',
          evidenceOnScreen: ['作图要求', '焦点标注'],
        }
      },
    })).rejects.toBeInstanceOf(PracticeGenerationQualityError)

    expect(calls).toBe(3)
    expect(prompts[1]).toContain('作图、标注或制作')
    expect(prompts[1]).toContain('不得只写“完成任务”')
  })
})

describe('fillSceneInContext', () => {
  function makeCourse() {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
    return compileLessonFromKps({
      kps: [{ id: 'kp-example-1', canonicalName: '消息文体特征' }],
      gradeBand: 'middle-school',
      subject: 'chinese',
      preset,
    })
  }

  it('专属槽位第一次缺失时自动重写，第二次合格才返回', async () => {
    const course = makeCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'visual-observation')!
    const prompts: string[] = []
    let calls = 0
    const { scene } = await fillSceneInContext(course, target.id, {
      llm: async ({ system, user }) => {
        calls += 1
        prompts.push(user)
        return {
          contentSlots: calls === 1
            ? { a: '模型自造但页面不用的字段一', b: '模型自造但页面不用的字段二' }
            : validContentSlotsForSystem(system),
          visualFocus: '消息结构三层要素',
          narrationAnchor: '三层要素',
          boardText: ['标题概括', '导语浓缩', '主体展开'],
          teacherScript: '请沿着三层要素依次观察标题、导语和主体。先说出每层承担的作用，再从给出的消息材料中各找一处依据，最后比较三层信息如何逐步展开，并留下可以检查的观察记录。',
          studentAction: '写出三层作用并各标注一处依据',
          evidenceOnScreen: ['标题', '导语', '主体'],
        }
      },
    })

    expect(calls).toBe(2)
    expect(prompts[1]).toContain('专属页面检查')
    expect(scene.contentSlots).toMatchObject({
      panelATitle: '要素一', panelA: '第一项具体内容与可观察依据。',
      panelBTitle: '要素二', panelB: '第二项具体内容与可观察依据。',
      panelCTitle: '要素三', panelC: '第三项具体内容与可观察依据。',
    })
  })

  it('专属槽位连续三次缺失时明确失败，不返回空白页面', async () => {
    const course = makeCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'visual-observation')!
    let calls = 0
    const failure = await fillSceneInContext(course, target.id, {
      llm: async () => {
        calls += 1
        return {
          contentSlots: { a: '模型自造但页面不用的字段一', b: '模型自造但页面不用的字段二' },
          visualFocus: '消息结构三层要素',
          narrationAnchor: '三层要素',
          boardText: ['标题概括', '导语浓缩', '主体展开'],
          teacherScript: '请沿着三层要素依次观察标题、导语和主体。先说出每层承担的作用，再从给出的消息材料中各找一处依据，最后比较三层信息如何逐步展开，并留下可以检查的观察记录。',
          studentAction: '写出三层作用并各标注一处依据',
          evidenceOnScreen: ['标题', '导语', '主体'],
        }
      },
    }).then(() => null, error => error)

    expect(calls).toBe(3)
    expect(failure).toBeInstanceOf(SceneGenerationQualityError)
    expect(failure).toMatchObject({
      code: 'SCENE_CONTENT_QUALITY_RETRY_EXHAUSTED',
      sceneId: target.id,
      sceneType: 'visual-observation',
      attempts: 3,
    })
    expect(failure.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('contentSlots.panelATitle'),
      expect.stringContaining('contentSlots.panelC'),
    ]))
  })

  it('单页重生成会把存量假交互说明校正为真实课堂流程', async () => {
    const course = makeCourse()
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    recap.syncStrategy = '中央路径逐步回放，当前节点高亮。'
    recap.interactionContract = '学生按路径复述，系统高亮当前节点。'
    recap.fallbackPresentation = '静态路径图，当前节点静态高亮。'
    const mockLLM: FillLLMCall = async () => ({
      contentSlots: {
        path: '提出问题 → 寻找证据 → 修正解释',
        takeaway: '消息结构帮助读者快速确认事实',
        transferTask: '如果只把短讯第二句换成背景说明，判断它属于导语还是正文并说明依据。',
      },
      visualFocus: '消息结构的学习路径',
      narrationAnchor: '学习路径',
      boardText: ['提出问题', '寻找证据', '修正解释'],
      teacherScript: '最后回到本课学习路径。路径只是线索，请用一个新的消息例子说明结构如何帮助读者确认事实，再回看开场预测，写下一处保留或修正。',
      studentAction: '用新例子解释结论，再回看并修正开场预测',
      evidenceOnScreen: ['学习路径', '新例子', '预测修正'],
    })

    const { scene } = await fillSceneInContext(course, recap.id, { llm: mockLLM })

    expect({
      syncStrategy: scene.syncStrategy,
      interactionContract: scene.interactionContract,
      fallbackPresentation: scene.fallbackPresentation,
    }).toEqual(runtimeSceneContractFor('recap'))
  })

  it('按幕型注入不同的学习证据要求，避免每页重复最终任务', async () => {
    const course = makeCourse()
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    const concept = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const prompts: string[] = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      prompts.push(`${system}\n${user}`)
      return {
        contentSlots: { statement: '消息用层次组织事实', example: '标题概括，导语交代要素' },
        visualFocus: '消息结构的学习证据',
        narrationAnchor: '学习证据',
        boardText: ['标题概括核心', '导语交代要素'],
        teacherScript: '这一页只推进一个清楚的学习动作，不把整节课的最终任务反复搬上来。请围绕屏幕上的「学习证据」留下本页对应的回答，再把它带到下一页继续加工，逐步形成完整理解。',
        studentAction: '写下本页对应的一个回答和理由',
        evidenceOnScreen: ['本页回答', '判断理由'],
      }
    }

    const sourceResult = await fillSceneInContext(course, source.id, { llm: mockLLM })
    await fillSceneInContext(course, concept.id, { llm: mockLLM })

    expect(prompts).toHaveLength(1)
    expect(sourceResult.scene.studentAction).toContain('预测')
    expect(sourceResult.scene.teacherScript).toContain('逐步提供证据')
    expect(prompts[0]).toContain('用自己的话说出本幕建立的关系')
    expect(prompts[0]).toContain('练习页必须直接检核该知识点的完整成功信号')
  })

  it('元认知页即使收到定义加正例输出，也归一为时机、步骤和自检', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-meta', canonicalName: '审题策略', knowledgeType: 'metacognitive' }],
      gradeBand: 'middle-school',
      subject: 'chinese',
      preset,
    })
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const systems: string[] = []
    const { scene } = await fillSceneInContext(course, target.id, {
      llm: async ({ system }) => {
        systems.push(system)
        return {
          contentSlots: {
            statement: '题目信息很多、目标不明确时启动审题策略',
            example: '圈出任务词 → 标记已知条件 → 用自己的话重述问题',
            check: '我是否明确了要回答什么，并且每个条件都有用途？',
          },
          visualFocus: '审题策略的使用闭环',
          narrationAnchor: '策略使用时机',
          boardText: ['先判断是否需要策略', '再按步骤执行', '最后检查结果'],
          teacherScript: '先判断当前任务是否出现信息多、目标不清的信号，再依次圈出任务词、标记条件并重述问题。执行以后回到策略使用时机，检查自己是否真的明确了目标和每个条件的用途。',
          studentAction: '写出适用情境，执行三个步骤并回答自检问题',
          evidenceOnScreen: ['使用时机', '三个执行步骤', '自检回答'],
        }
      },
    })

    expect(systems[0]).toContain('trigger / steps / selfCheck')
    expect(systems[0]).toContain('不得退回 statement / example')
    expect(scene.contentSlots).toEqual({
      trigger: '题目信息很多、目标不明确时启动审题策略',
      steps: '圈出任务词 → 标记已知条件 → 用自己的话重述问题',
      selfCheck: '我是否明确了要回答什么，并且每个条件都有用途？',
    })
    expect(scene.contentSlots.statement).toBeUndefined()
    expect(scene.contentSlots.example).toBeUndefined()
    expect(blockingQualityIssues(auditMainlineCourse({ ...course, scenes: course.scenes.map(item => item.id === scene.id ? scene : item) }))).toEqual([])
  })

  it('单页重生成把被动观察升级为观察结论与依据', async () => {
    const course = makeCourse()
    const observation = course.scenes.find(scene => scene.sceneType === 'visual-observation')!
    const prompts: string[] = []
    const mockLLM: FillLLMCall = async ({ user }) => {
      prompts.push(user)
      return {
        contentSlots: { panelA: '第一层变化', panelB: '第二层变化', panelC: '第三层变化' },
        visualFocus: '三层变化',
        narrationAnchor: '三层变化',
        boardText: ['第一层', '第二层', '第三层'],
        teacherScript: '请沿着画面观察三层变化。先操作并比较每一层的不同，再停下来整理自己的判断。三层变化不是看完就结束，后面还要用本页留下的依据继续建立概念。',
        studentAction: '沿路径逐层观察并确认差异',
        evidenceOnScreen: ['第一层', '第二层', '第三层'],
      }
    }

    const { scene } = await fillSceneInContext(course, observation.id, { llm: mockLLM })

    expect(prompts[0]).toContain('不能只写阅读、观察、思考、听讲、拖动或确认')
    expect(scene.studentAction).toBe('沿路径逐层观察并确认差异，再说出一条观察结论和画面依据')
  })

  it('开场页忽略模型泄露的后续答案，固定为先预测后取证', async () => {
    const course = makeCourse()
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    let called = false
    const leak = '消息的答案是标题概括核心、导语交代五要素、正文补充细节'
    const mockLLM: FillLLMCall = async () => {
      called = true
      return {
        contentSlots: { answer: leak, conclusion: '导语一定在第一段' },
        visualFocus: leak,
        narrationAnchor: '完整答案',
        boardText: [leak, '五要素就是最终判别标准'],
        teacherScript: `${leak}。完整答案 已经全部告诉你了，现在只要照着背下来就可以完成本课。这里继续补足讲稿字数，模拟一个会在开场提前讲完后续内容的失控模型输出。`,
        studentAction: '照抄完整答案',
        evidenceOnScreen: [leak, '最终结论'],
      }
    }

    const result = await fillSceneInContext(course, source.id, { llm: mockLLM })
    const allContent = JSON.stringify(result.scene)

    expect(called).toBe(false)
    expect(result.scene.visualFocus).toBe(course.topic)
    expect(result.scene.studentAction).toContain('预测')
    expect(result.scene.teacherScript).toContain('先别急着记结论')
    expect(result.scene.teacherScript).toContain('逐步提供证据')
    expect(allContent).not.toContain(leak)
    expect(allContent).not.toContain('照抄完整答案')
  })

  it('复习课开场固定为闭卷提取，且后续幕收到提取优先契约', async () => {
    const course = { ...makeCourse(), lessonPhase: 'review' as const }
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    let sourceCalled = false
    const sourceResult = await fillSceneInContext(course, source.id, {
      llm: async () => {
        sourceCalled = true
        return {}
      },
    })

    expect(sourceCalled).toBe(false)
    expect(sourceResult.scene.studentAction).toContain('不看资料')
    expect(sourceResult.scene.contentSlots.learningPath).toBe('闭卷提取 → 对照纠错 → 变式再答')

    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const systems: string[] = []
    const llm: FillLLMCall = async ({ system }) => {
      systems.push(system)
      return {
        contentSlots: { statement: '复习后的校准表述', example: '一个变式情境中的完整正例' },
        visualFocus: '校准表述', narrationAnchor: '校准表述',
        boardText: ['先提取', '再校准'],
        teacherScript: '先保留刚才闭卷写下的答案，再用这条校准表述逐项核对。不要因为看见熟悉文字就判定自己会了，请指出原答案中一处需要保留或纠正的地方，并说明依据。',
        studentAction: '写出一处保留或纠正及其依据', evidenceOnScreen: ['原答案', '校准依据'],
      }
    }
    await fillSceneInContext(course, target.id, { llm })
    expect(systems[0]).toContain('先闭卷提取、后反馈纠错、再变式应用')
    expect(systems[0]).toContain('不得把新授课原样重讲')
  })

  it('只重生成目标 scene,保留结构字段,清除 editedByTeacher', async () => {
    const course = makeCourse()
    const target = { ...course.scenes[2]!, editedByTeacher: true }
    const withEdit = { ...course, scenes: course.scenes.map((s, i) => (i === 2 ? target : s)) }

    const mockLLM: FillLLMCall = async () => ({
      contentSlots: { statement: '新表述', example: '新正例' },
      visualFocus: '新焦点',
      narrationAnchor: '新焦点',
      boardText: ['新板书 1', '新板书 2'],
      teacherScript: '这是重新生成的讲解内容,包含足够字数满足 schema 最小长度要求,内含 新焦点 锚点词,不需要兜底补全逻辑介入。',
      studentAction: '学生跟读新内容',
      evidenceOnScreen: ['新证据 1', '新证据 2'],
    })
    const { scene } = await fillSceneInContext(withEdit, target.id, { llm: mockLLM })
    expect(scene.visualFocus).toBe('新焦点')
    expect(scene.editedByTeacher).toBe(false)
    expect(scene.sceneType).toBe(target.sceneType)
    expect(scene.characterLayer).toEqual(target.characterLayer)
  })

  it('观察页三层画面与教师板书各自保留明确语义', async () => {
    const course = makeCourse()
    const target = course.scenes[1]!
    expect(target.sceneType).toBe('visual-observation')

    const mockLLM: FillLLMCall = async () => ({
      contentSlots: {
        panelATitle: '起因',
        panelA: '起因：外重内轻形成结构隐患',
        panelBTitle: '过程',
        panelB: '过程：冲突扩大并波及核心区域',
        panelCTitle: '后果',
        panelC: '后果：地方割据使中央控制减弱',
      },
      visualFocus: '起因过程后果三层结构',
      narrationAnchor: '三层关键要素',
      boardText: ['755 年起兵', '756 年失守', '763 年平定'],
      teacherScript: '请观察起因、过程、后果三层关键要素，沿着画面顺序说清楚结构变化。',
      studentAction: '按三层顺序复述画面',
      evidenceOnScreen: ['结构隐患', '冲突扩大', '地方割据'],
    })

    const { scene } = await fillSceneInContext(course, target.id, { llm: mockLLM })
    expect(scene.contentSlots.panelATitle).toBe('起因')
    expect(scene.contentSlots.panelBTitle).toBe('过程')
    expect(scene.contentSlots.panelCTitle).toBe('后果')
    expect(scene.boardText).toEqual(['755 年起兵', '756 年失守', '763 年平定'])
  })

  it('把前面幕和紧邻后一幕的已有内容都注入 prompt(跨幕一致性对策)', async () => {
    const course = makeCourse()
    const target = course.scenes[2]! // concept-build:前有 [0]source-reading,[1]visual-observation;后有 [3]contrast
    const captured: string[] = []
    const mockLLM: FillLLMCall = async ({ user }) => {
      captured.push(user)
      return {
        contentSlots: { statement: '新表述', example: '新正例' },
        visualFocus: '新焦点',
        narrationAnchor: '新焦点',
        boardText: ['新板书 1', '新板书 2'],
        teacherScript: '这是重新生成的讲解内容,包含足够字数满足 schema 最小长度要求,内含 新焦点 锚点词,不需要兜底补全逻辑介入。',
        studentAction: '学生跟读新内容',
        evidenceOnScreen: ['新证据 1', '新证据 2'],
      }
    }
    await fillSceneInContext(course, target.id, { llm: mockLLM })
    expect(captured).toHaveLength(1)
    expect(captured[0]).toContain('前面已生成的幕')
    expect(captured[0]).toContain('后面已经定稿的幕')
    expect(captured[0]).not.toContain('(这是第一幕,无前置)')
  })

  it('对最后一幕(recap)重生成时不注入 nextSummary 段落', async () => {
    const course = makeCourse()
    const target = course.scenes.at(-1)!
    expect(target.sceneType).toBe('recap')
    const captured: string[] = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      captured.push(`${system}\n${user}`)
      return {
        contentSlots: {
          path: 'A → B → C',
          takeaway: '结论',
          transferTask: '如果只替换一条材料证据，判断原结论是否仍成立并说明依据。',
        },
        visualFocus: '学习路径回放',
        narrationAnchor: '学习路径',
        boardText: ['板书 1', '板书 2'],
        teacherScript: '这是重新生成的收束讲解内容,包含足够字数满足 schema 最小长度要求,内含 学习路径 锚点词,不需要兜底补全逻辑介入哦。',
        studentAction: '学生复述学习路径',
        evidenceOnScreen: ['节点 1', '节点 2'],
      }
    }
    const { scene } = await fillSceneInContext(course, target.id, { llm: mockLLM })
    expect(captured[0]).not.toContain('后面已经定稿的幕')
    expect(captured[0]).toContain('studentAction 禁止只写复述、背诵或朗读')
    expect(scene.studentAction).toBe('独立完成屏幕迁移题，写出判断和依据，再回看并修正开场预测')
    expect(scene.teacherScript).toContain('结论与依据只是线索')
  })

  it('把来源可信度和 explanation-only 配图时机写进生成约束', async () => {
    const course = makeCourse()
    course.sourceMaterial[0] = {
      ...course.sourceMaterial[0]!,
      citation: '课程目录来源 pep-cn，节点 leaf-news（仅用于教材定位）',
      provenance: {
        source: 'pep-cn',
        externalId: 'leaf-news',
        evidenceStatus: 'curriculum-metadata',
      },
      candidateResources: [{
        id: 'asset-news',
        kind: 'textbook-asset',
        title: '新闻结构教材图',
        assetUrl: '/api/v2/education-resources/file/asset-news',
        mediaType: 'image/png',
        citation: '人民教育出版社教材插图',
        revealPolicy: 'explanation-only',
      }],
    }
    const target = course.scenes.find(scene => scene.kpId === 'kp-example-1')!
    const prompts: string[] = []
    const mockLLM: FillLLMCall = async ({ system, user }) => {
      prompts.push(user)
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '新焦点', narrationAnchor: '新焦点',
        boardText: ['新板书 1', '新板书 2'],
        teacherScript: '这是重新生成的讲解内容，包含足够字数满足最小长度要求，并围绕新焦点要求学生留下可检查的答案与理由。',
        studentAction: '写出答案和理由', evidenceOnScreen: ['学生答案', '判断理由'],
      }
    }

    await fillSceneInContext(course, target.id, { llm: mockLLM })
    expect(prompts[0]).toContain('教材定位[消息文体特征]')
    expect(prompts[0]).toContain('不得伪造教材引文')
    expect(prompts[0]).toContain('备课配图候选:新闻结构教材图')
    expect(prompts[0]).toContain('只能在学生先作答后的解释阶段使用')
    expect(prompts[0]).toContain('当前模型没有读取图片，不得推断图中细节')
  })

  it('单页重生成发现练习题面泄露答案时重写题面并保留反馈', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const course = compileLessonFromKps({
      kps: [{ id: 'kp-force', canonicalName: '二力平衡', knowledgeType: 'procedural' }],
      gradeBand: 'middle-school', subject: 'physics', preset,
    })
    const target = course.scenes.find(scene => scene.sceneType === 'practice')!
    const prompts: string[] = []
    const llm: FillLLMCall = async ({ user }) => {
      prompts.push(user)
      const repaired = user.includes('上一次输出未通过')
      return {
        contentSlots: repaired
          ? {
              promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
              task: '完成一道同型练习：质量为 4kg 的球用绳悬挂静止，取 g=9.8N/kg。画出受力图，求两个力的大小，并说明两力大小相等的依据。',
              feedback: '重力 G=mg=39.2N，方向竖直向下；拉力 T=39.2N，方向竖直向上。两力大小相等的依据是小球静止、合力为零。若方向画反，回到施力物体和静止条件重新订正。',
            }
          : {
              promptScript: '先自己把题面读一遍，圈出已经给出的条件，想一想应该先判断哪一条。还没有思路的同学，从第一个条件开始逐条对照；已经完成的同学，检查每一步有没有写出对应的依据。',
              task: '画出小球受力图。重力 G=mg=39.2N 竖直向下，拉力 T=39.2N 竖直向上。',
              feedback: '重力 G=mg=39.2N，方向竖直向下；拉力 T=39.2N，方向竖直向上。',
            },
        visualFocus: '悬挂小球的二力平衡', narrationAnchor: '二力平衡',
        boardText: ['先独立作图', '再核对方向与大小'],
        teacherScript: '请先独立完成屏幕上的二力平衡任务，把两个力的方向和大小都写清楚。提交答案后再看反馈，逐项核对施力物体、方向和数量关系，发现不一致时回到静止条件重新判断。',
        studentAction: '独立画图、计算两个力，并说明大小相等的依据', evidenceOnScreen: ['学生受力图', '大小计算过程'],
      }
    }

    const { scene } = await fillSceneInContext(course, target.id, { llm })
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('task 只保留学生作答前可见的题设')
    expect(scene.contentSlots.task).not.toContain('39.2N')
    expect(scene.contentSlots.feedback).toContain('39.2N')
  })

  it('scene 不存在时抛错', async () => {
    const course = makeCourse()
    await expect(fillSceneInContext(course, 'no-such-scene', { llm: async () => ({}) }))
      .rejects.toThrow(/scene not found/)
  })

  it('单页生成会把讲稿和讲解锚点中的 LaTeX 统一转成口语文本', async () => {
    const course = makeCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const llm: FillLLMCall = async () => ({
      contentSlots: { statement: '\\(G=mg\\)', example: '\\(m=2\\,\\mathrm{kg}\\)' },
      visualFocus: '重力公式',
      narrationAnchor: '重力公式 \\(G=mg\\)',
      boardText: ['公式 \\(G=mg\\)', '质量 \\(m=2\\,\\mathrm{kg}\\)'],
      teacherScript: '先看重力公式 \\(G=mg\\)，再代入质量 \\(m=2\\,\\mathrm{kg}\\) 和重力加速度 \\(g=9.8\\,\\mathrm{m/s^2}\\)。画面公式保留专业排版，但老师讲解时必须使用自然语言读法，不能把排版控制符直接交给语音引擎。',
      studentAction: '写出代入过程并说明单位',
      evidenceOnScreen: ['代入过程', '单位说明'],
    })

    const { scene } = await fillSceneInContext(course, target.id, { llm })
    expect(scene.teacherScript).toContain('G等于mg')
    expect(scene.teacherScript).toContain('m等于2千克')
    expect(scene.teacherScript).toContain('g等于9.8米每二次方秒')
    expect(scene.teacherScript).not.toMatch(/[\\{}$]/)
    expect(scene.narrationAnchor).toBe('重力公式 G等于mg')
    expect(scene.teacherScript).toContain(scene.narrationAnchor)
    expect(scene.contentSlots.statement).toBe('\\(G=mg\\)')
    expect(scene.boardText[0]).toBe('公式 \\(G=mg\\)')
  })
})

describe('复习课错因注入(DeepTutor 借鉴票2)', () => {
  it('review 课对应 KP 的幕 system 注入误答证据与变式硬要求;新课与他 KP 不注入', async () => {
    const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
    const before = {
      ...compileLessonFromKps({
        kps: [{ id: 'kp-force', canonicalName: '二力平衡', knowledgeType: 'procedural' }],
        gradeBand: 'middle-school', subject: 'physics', preset,
      }),
      lessonPhase: 'review' as const,
    }
    const systems: string[] = []
    const llm: FillLLMCall = async ({ system }) => {
      systems.push(system)
      if (system.includes('资深教研员')) return { goals: [] }
      return {
        contentSlots: validContentSlotsForSystem(system),
        visualFocus: '具体学习内容', narrationAnchor: '具体学习内容',
        boardText: ['要点一', '要点二'],
        teacherScript: '这一幕围绕具体学习内容展开说明，并要求学生完成一次可以检查的任务。教师先示范判断依据，再请学生写出答案和理由，最后用屏幕上的标准自行核对。',
        studentAction: '写出答案和理由', evidenceOnScreen: ['学生答案', '判断理由'],
      }
    }
    await fillScenes(before, {
      llm,
      mistakes: [{
        kpId: 'kp-force',
        task: '判断拉力与摩擦力是否构成二力平衡。',
        attemptText: '我认为不平衡,因为两个力作用在不同物体上。',
        reflectionText: '第一处偏离:拉力和摩擦力都作用在木块上,同体条件其实满足。',
        confidence: 'high',
        submittedAt: 1,
      }],
    })
    const practiceSystem = systems.find(sys => sys.includes('本幕定位:练习'))!
    expect(practiceSystem).toContain('真实误答证据')
    expect(practiceSystem).toContain('我认为不平衡')
    expect(practiceSystem).toContain('同体条件其实满足')
    expect(practiceSystem).toContain('变式')
    // 开场(课级幕,无 kpId)不注入
    const openingSystem = systems.find(sys => sys.includes('本幕定位:源读'))
    if (openingSystem) expect(openingSystem).not.toContain('真实误答证据')
  })
})

import { describe, it, expect } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../../samples.js'
import { factAuditCourse, shouldAuditScene } from '../fact-audit.js'
import { auditLocalCourseConsistency } from '../course-consistency.js'
import type { FillLLMCall } from '../fill-scenes.js'

function blockingOf(issues: { severity: string }[]) {
  return issues.filter(i => i.severity === 'blocking')
}

function physicsCourse() {
  return structuredClone(GOLDEN_MAINLINE_COURSES.find(c => c.subject === 'physics')!)
}

const OK_OUTPUT = { claims: [{ claim: '某断言', verdict: 'ok', evidence: '与教材一致' }] }

describe('shouldAuditScene', () => {
  it('断言密集幕型全查;纯文本引入幕无数字信号则跳过', () => {
    const course = physicsCourse()
    const base = course.scenes[0]!
    const conceptScene = { ...base, sceneType: 'concept-build' as const }
    expect(shouldAuditScene(conceptScene)).toBe(true)

    const plainIntro = {
      ...base,
      sceneType: 'source-reading' as const,
      teacherScript: '这节课我们观察光的传播路径,先看清对象是什么。',
      boardText: ['光的传播', '观察路径'],
      contentSlots: { topic: '光的传播', why: '解释影子如何形成' },
    }
    expect(shouldAuditScene(plainIntro)).toBe(false)
  })
})

describe('factAuditCourse', () => {
  it('fatal 断言产出 blocking issue 并计数', async () => {
    let first = true
    const llm: FillLLMCall = async () => {
      if (first) {
        first = false
        return {
          claims: [
            { claim: '水的沸点是 90℃', verdict: 'fatal', evidence: '标准大气压下水的沸点为 100℃', fix: '改为 100℃' },
            { claim: '光沿直线传播', verdict: 'ok', evidence: '与教材一致' },
          ],
        }
      }
      return OK_OUTPUT
    }
    const result = await factAuditCourse(physicsCourse(), { llm })
    expect(result.fatalCount).toBe(1)
    const blocking = result.issues.filter(i => i.severity === 'blocking')
    expect(blocking).toHaveLength(1)
    expect(blocking[0]!.message).toContain('FATAL')
    expect(blocking[0]!.message).toContain('90℃')
    expect(blocking[0]!.gate).toBe('pedagogy')
  })

  it('misleading 会诱导错误推广而阻断；imprecise 中学裁量为 warning', async () => {
    let first = true
    const llm: FillLLMCall = async () => {
      if (first) {
        first = false
        return {
          claims: [
            { claim: '重的东西下落快', verdict: 'misleading', evidence: '未说明空气阻力条件', fix: '补条件限定' },
            { claim: '声速约 340 米每秒', verdict: 'imprecise', evidence: '未说明温度条件,方向正确' },
          ],
        }
      }
      return OK_OUTPUT
    }
    const course = physicsCourse() // gradeBand: middle-school
    const result = await factAuditCourse(course, { llm })
    expect(result.fatalCount).toBe(1)
    expect(result.issues.filter(i => i.severity === 'blocking')).toHaveLength(1)
    expect(result.issues.filter(i => i.severity === 'warning')).toHaveLength(1)
  })

  it('全 ok 时零 issue', async () => {
    const llm: FillLLMCall = async () => OK_OUTPUT
    const result = await factAuditCourse(physicsCourse(), { llm })
    expect(result.issues).toHaveLength(0)
    expect(result.fatalCount).toBe(0)
    expect(result.auditedSceneCount).toBeGreaterThan(0)
  })

  it('核查服务失败保留 info 说明并登记未验证页面，供发布边界阻断', async () => {
    const llm: FillLLMCall = async () => { throw new Error('audit LLM outage') }
    const result = await factAuditCourse(physicsCourse(), { llm })
    expect(result.fatalCount).toBe(0)
    expect(result.auditedSceneCount).toBe(0)
    expect(result.auditedSceneIds).toEqual([])
    expect(result.requiredSceneIds.length).toBeGreaterThan(0)
    expect(result.unverifiedSceneIds).toEqual(result.requiredSceneIds)
    expect(result.issues.every(i => i.severity === 'info')).toBe(true)
    expect(result.issues[0]!.message).toContain('未经验证')
  })

  it('显式单页复核不受批量成本筛选影响，无数字文本也必须真实送审', async () => {
    const course = physicsCourse()
    const base = course.scenes[0]!
    const plainScene = {
      ...base,
      id: 'plain-explicit-audit',
      sceneType: 'source-reading' as const,
      teacherScript: '这页由教师修订人物与地点关系，需要重新核实。',
      boardText: ['人物与地点关系'],
      contentSlots: { topic: '人物与地点关系' },
    }
    course.scenes = [plainScene]
    let calls = 0
    const result = await factAuditCourse(course, {
      sceneIds: [plainScene.id],
      llm: async () => {
        calls += 1
        return { claims: [] }
      },
    })

    expect(shouldAuditScene(plainScene)).toBe(false)
    expect(calls).toBe(1)
    expect(result.auditedSceneIds).toEqual([plainScene.id])
  })
})

describe('factAuditCourse · 来源可信度分层', () => {
  it('占位 excerpt 和目录定位都不进入 ground truth', async () => {
    const course = physicsCourse()
    course.sourceMaterial = [{
      kind: 'textbook',
      title: '光的折射',
      kpId: 'kp-refraction',
      excerpt: '教材知识点：光的折射（待 LLM 填充教材原文或定义引用）。',
      citation: '课程目录来源 pep-cn，节点 leaf-refraction（仅用于教材定位）',
      provenance: {
        source: 'pep-cn',
        externalId: 'leaf-refraction',
        evidenceStatus: 'curriculum-metadata',
      },
    }]
    const prompts: string[] = []
    await factAuditCourse(course, { llm: async ({ user }) => {
      prompts.push(user)
      return OK_OUTPUT
    } })

    expect(prompts[0]).toContain('本课没有权威教材摘录')
    expect(prompts[0]).toContain('来源定位(用于追溯，不等于原文证据)')
    expect(prompts[0]).not.toContain('待 LLM 填充教材原文')
  })

  it('权威摘录进入 ground truth，AI 提取内容只进入待复核线索', async () => {
    const course = physicsCourse()
    course.sourceMaterial = [
      {
        kind: 'textbook',
        title: '权威定义',
        excerpt: '光从一种介质斜射入另一种介质时，传播方向通常会发生偏折。',
        provenance: { source: 'pep-cn', evidenceStatus: 'authoritative-excerpt' },
      },
      {
        kind: 'textbook',
        title: '模型概括',
        excerpt: '模型推测折射角总是小于入射角。',
        provenance: { source: 'llm:qwen', evidenceStatus: 'ai-extracted' },
      },
    ]
    const prompts: string[] = []
    await factAuditCourse(course, { llm: async ({ user }) => {
      prompts.push(user)
      return OK_OUTPUT
    } })

    const prompt = prompts[0]!
    const groundTruthSection = prompt.slice(
      prompt.indexOf('权威教材摘录'),
      prompt.indexOf('AI 提取或其他未核验的待复核线索'),
    )
    expect(groundTruthSection).toContain('光从一种介质斜射入另一种介质')
    expect(groundTruthSection).not.toContain('折射角总是小于入射角')
    expect(prompt).toContain('AI 提取或其他未核验的待复核线索')
    expect(prompt).toContain('模型推测折射角总是小于入射角')
  })
})

describe('v5 M2 ai-verify 幕豁免:AI 的故意错误是教具,不是真实错误', () => {
  function aiVerifyScene(base: ReturnType<typeof physicsCourse>['scenes'][number]) {
    return {
      ...base,
      sceneType: 'ai-verify' as const,
      misconceptionSource: '电流经过灯泡之后就被用光了',
      contentSlots: {
        aiClaim: '我觉得电流经过灯泡之后就被用光了,所以后面没电。',
        reveal: '电流不会被用光,灯泡把电能转化成了光和热,电流大小在电路里各处是不变的。',
      },
      teacherScript: '刚才小助说电流会被用光,这是错的;电流不会被消耗,只是电能转化成了光和热,电流本身沿电路流回电源,补足字数满足最小长度要求。',
      boardText: ['小助说了什么', '判断依据', '揭底'],
    }
  }

  it('ai-verify 幕永远送审,即便文本没有数字信号(ALWAYS_AUDIT_TYPES 收编)', () => {
    const scene = aiVerifyScene(physicsCourse().scenes[0]!)
    expect(shouldAuditScene(scene)).toBe(true)
  })

  it('aiClaim 槽不进入核查文本;reveal/teacherScript 仍照常送审,并带上豁免说明', async () => {
    const course = physicsCourse()
    course.scenes = [aiVerifyScene(course.scenes[0]!)]

    let capturedUser = ''
    const llm: FillLLMCall = async ({ user }) => { capturedUser = user; return OK_OUTPUT }
    await factAuditCourse(course, { llm })

    // AI 的原始错误说法(aiClaim)不出现在待核查文本里
    expect(capturedUser).not.toContain('我觉得电流经过灯泡之后就被用光了,所以后面没电。')
    // 揭底内容与讲稿仍照常送审
    expect(capturedUser).toContain('电流不会被用光,灯泡把电能转化成了光和热')
    expect(capturedUser).toContain('刚才小助说电流会被用光')
    // 豁免说明存在,告知核查官这是刻意设计的教学教具
    expect(capturedUser).toContain('AI 找茬幕')
    expect(capturedUser).toContain('教学教具')
  })

  it('揭底部分若本身包含事实错误,仍会被判 fatal(揭底也要经得起核查)', async () => {
    const course = physicsCourse()
    course.scenes = [aiVerifyScene(course.scenes[0]!)]
    const llm: FillLLMCall = async () => ({
      claims: [{ claim: '灯泡把电能转化成了热和光,水的沸点因此变成 90℃', verdict: 'fatal', evidence: '标准大气压下水的沸点为 100℃', fix: '删除无关且错误的沸点断言' }],
    })
    const result = await factAuditCourse(course, { llm })
    expect(result.fatalCount).toBe(1)
    expect(blockingOf(result.issues)).toHaveLength(1)
  })

  it('v5 骨架去重合并:aiClaim1..N 细分槽同样豁免,revealN 不豁免仍照常送审', async () => {
    const course = physicsCourse()
    const merged = {
      ...aiVerifyScene(course.scenes[0]!),
      misconceptionSources: ['电流经过灯泡之后就被用光了', '电压越大电流一定越大'],
      contentSlots: {
        aiClaim: '我觉得电流经过灯泡之后就被用光了,而且电压越大电流一定越大。',
        reveal: '两处都错:电流不会被用光;电流还要看电阻,不是电压越大电流就一定越大。',
        aiClaim1: '我觉得电流经过灯泡之后就被用光了。',
        reveal1: '电流不会被用光,电能转化成了光和热,电流本身不变。',
        aiClaim2: '我觉得电压越大电流一定越大。',
        reveal2: '电流还取决于电阻,同一电压下电阻不同电流也不同。',
      },
    }
    course.scenes = [merged]

    let capturedUser = ''
    const llm: FillLLMCall = async ({ user }) => { capturedUser = user; return OK_OUTPUT }
    await factAuditCourse(course, { llm })

    // 两条 aiClaim 细分槽的原始错误说法都不出现在待核查文本里
    expect(capturedUser).not.toContain('我觉得电流经过灯泡之后就被用光了。')
    expect(capturedUser).not.toContain('我觉得电压越大电流一定越大。')
    // reveal/revealN 揭底内容仍照常送审
    expect(capturedUser).toContain('电流不会被用光,电能转化成了光和热,电流本身不变。')
    expect(capturedUser).toContain('电流还取决于电阻,同一电压下电阻不同电流也不同。')
  })
})

/**
 * B-2 · 近义概念对召回(2026-07-27)
 *
 * round13 实测:「借物喻人 / 借物抒情」三处混淆只抓 1 处。根因是教研资产层的
 * 误概念库对核查官不可见——通用提示把注意力锚在数字/公式上,而术语混用
 * 句子读来通顺。这里把本 KP 的标注易混点注入提示,并锁住一条红线:
 * contrast / ai-verify 幕**绝不注入**,否则等于把 CONTROLLED_ERROR_SLOT_PATTERN
 * 刚排除的误区原文从另一个口子送回核查官眼前(round09 不变量)。
 */
describe('factAuditCourse · 已知易混点注入', () => {
  const MISCONCEPTION = '把借物喻人说成借物抒情'

  /** 造一门带溯源误区的课,并把首幕设为指定幕型。 */
  function courseWithMisconception(sceneType: 'concept-build' | 'contrast' | 'ai-verify') {
    const course = physicsCourse()
    const base = course.scenes[0]!
    course.scenes = [
      { ...base, sceneType, kpId: 'kp-x', misconceptionSources: [MISCONCEPTION] },
    ]
    return course
  }

  async function capturePrompt(course: ReturnType<typeof physicsCourse>) {
    let seen = ''
    const llm: FillLLMCall = async ({ user }) => { seen = user; return OK_OUTPUT }
    await factAuditCourse(course, { llm })
    return seen
  }

  it('普通教学幕:注入本 KP 的易混点原文', async () => {
    const prompt = await capturePrompt(courseWithMisconception('concept-build'))
    expect(prompt).toContain('已知易混点')
    expect(prompt).toContain(MISCONCEPTION)
  })

  it('三处无数字信号的近义概念混淆都进入核查并被捕获', async () => {
    const course = physicsCourse()
    const base = course.scenes[0]!
    const wrongScenes = [
      {
        ...base,
        id: 'wrong-source-reading',
        sceneType: 'source-reading' as const,
        kpId: 'kp-x',
        teacherScript: '文章借白杨赞美人的精神，因此这种写法是借物抒情。',
        boardText: ['借物抒情'],
        contentSlots: { conclusion: '借白杨赞美人的精神属于借物抒情。' },
      },
      {
        ...base,
        id: 'wrong-visual-observation',
        sceneType: 'visual-observation' as const,
        kpId: 'kp-x',
        teacherScript: '白杨与人的品质形成对应，这说明作者采用借物抒情。',
        boardText: ['白杨对应人的品质', '借物抒情'],
        contentSlots: { observation: '物的特点对应人的品质时仍叫借物抒情。' },
      },
      {
        ...base,
        id: 'wrong-practice',
        sceneType: 'practice' as const,
        kpId: 'kp-x',
        teacherScript: '作者借白杨赞美抗日军民，答案应写借物抒情。',
        boardText: ['答案：借物抒情'],
        contentSlots: { answer: '借物抒情' },
      },
    ]
    const sourceCarrier = {
      ...base,
      id: 'misconception-source',
      sceneType: 'ai-verify' as const,
      kpId: 'kp-x',
      misconceptionSource: MISCONCEPTION,
      contentSlots: { aiClaim: MISCONCEPTION, reveal: '物的特点对应人的品质时，应区分借物喻人与借物抒情。' },
    }
    course.scenes = [...wrongScenes, sourceCarrier]

    const auditedSceneIds: string[] = []
    const llm: FillLLMCall = async ({ user }) => {
      const scene = wrongScenes.find(candidate => user.includes(candidate.id) || user.includes(candidate.teacherScript))!
      auditedSceneIds.push(scene.id)
      expect(user).toContain(MISCONCEPTION)
      return {
        claims: [{
          claim: scene.teacherScript,
          verdict: 'fatal',
          evidence: '把物的特点对应人的品质误称为借物抒情。',
          fix: '改为借物喻人，并说明它与借物抒情的分界。',
        }],
      }
    }
    const result = await factAuditCourse(course, {
      llm,
      sceneIds: wrongScenes.map(scene => scene.id),
    })

    expect(auditedSceneIds).toEqual(wrongScenes.map(scene => scene.id))
    expect(result.auditedSceneCount).toBe(3)
    expect(result.auditedSceneIds).toEqual(wrongScenes.map(scene => scene.id))
    expect(result.fatalCount).toBe(3)
    expect(blockingOf(result.issues)).toHaveLength(3)
  })

  it('辨析幕不注入(误区原文本就被排除在审查文本外,注回去会重演误杀)', async () => {
    const prompt = await capturePrompt(courseWithMisconception('contrast'))
    expect(prompt).not.toContain('已知易混点')
    expect(prompt).not.toContain(MISCONCEPTION)
  })

  it('AI 找茬幕不注入(round09 不变量:aiClaim 不得以任何形式进入核查官视野)', async () => {
    const prompt = await capturePrompt(courseWithMisconception('ai-verify'))
    expect(prompt).not.toContain('已知易混点')
    expect(prompt).not.toContain(MISCONCEPTION)
  })

  it('本课没有标注误区时不加这段(不制造空栏目)', async () => {
    const course = physicsCourse()
    course.scenes = [{ ...course.scenes[0]!, sceneType: 'concept-build', kpId: 'kp-x' }]
    expect(await capturePrompt(course)).not.toContain('已知易混点')
  })

  it('只注入本 KP 的易混点,不串到别的知识点', async () => {
    const course = physicsCourse()
    const base = course.scenes[0]!
    course.scenes = [
      { ...base, id: 's-other', sceneType: 'ai-verify', kpId: 'kp-other', misconceptionSources: ['别的知识点的误区'] },
      { ...base, id: 's-target', sceneType: 'concept-build', kpId: 'kp-x', misconceptionSources: [MISCONCEPTION] },
    ]
    let targetPrompt = ''
    const llm: FillLLMCall = async ({ user }) => {
      if (user.includes('s-target') || user.includes('concept-build')) targetPrompt = user
      return OK_OUTPUT
    }
    await factAuditCourse(course, { llm })
    expect(targetPrompt).toContain(MISCONCEPTION)
    expect(targetPrompt).not.toContain('别的知识点的误区')
  })

  it('系统提示把近义术语混用列为 fatal', async () => {
    let system = ''
    const llm: FillLLMCall = async (params) => { system = params.system; return OK_OUTPUT }
    await factAuditCourse(courseWithMisconception('concept-build'), { llm })
    expect(system).toContain('近义术语混用')
  })
})

describe('factAuditCourse · 本地跨幕一致性', () => {
  const clean: FillLLMCall = async () => ({ claims: [] })

  function twoScenes(
    leftSlots: Record<string, string>,
    rightSlots: Record<string, string>,
  ) {
    const course = physicsCourse()
    const base = course.scenes[0]!
    course.scenes = [
      { ...base, id: 'consistency-left', sceneType: 'practice', kpId: 'kp-same', contentSlots: leftSlots },
      { ...base, id: 'consistency-right', sceneType: 'recap', kpId: 'kp-same', contentSlots: rightSlots },
    ]
    return course
  }

  it('同一道题跨页给出不同数值答案时阻断，并把两页都记为已交叉核查', async () => {
    const course = twoScenes(
      { task: '标准大气压下，水的沸点是多少？', feedback: '答案：100℃。' },
      { task: '标准大气压下，水的沸点是多少？', feedback: '答案：90℃。' },
    )
    const result = await factAuditCourse(course, { llm: clean })

    expect(result.consistencyAuditedSceneIds).toEqual(course.scenes.map(scene => scene.id))
    expect(result.consistencyConflictCount).toBe(1)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'blocking',
        targetId: 'consistency-right',
        message: expect.stringContaining('跨幕一致性核查 FATAL'),
      }),
    ]))
  })

  it('题目不同即使反馈数值不同也不误报为答案冲突', async () => {
    const course = twoScenes(
      { task: '标准大气压下，水的沸点是多少？', feedback: '答案：100℃。' },
      { task: '标准大气压下，水的冰点是多少？', feedback: '答案：0℃。' },
    )
    const result = await factAuditCourse(course, { llm: clean })
    expect(result.consistencyConflictCount).toBe(0)
    expect(result.issues.some(issue => issue.message.includes('跨幕一致性核查'))).toBe(false)
  })

  it('同一知识点的不同物体题中支持力数值不同不误报为事实冲突', () => {
    const course = twoScenes(
      { problem: '质量 5 kg 的木箱静止于水平地面。', board: '支持力：49 N' },
      { task: '质量 3 kg 的铁块静止于水平地面。', board: '支持力：29.4 N' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(0)
  })

  it('同一道题跨页给出不同支持力数值时仍然阻断', () => {
    const course = twoScenes(
      { problem: '质量 5 kg 的木箱静止于水平地面。', board: '支持力：49 N' },
      { task: '质量 5 kg 的木箱静止于水平地面。', board: '支持力：39 N' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(1)
    expect(result.issues[0]).toMatchObject({ severity: 'blocking' })
  })

  it('同一知识点的不同函数示例不误报为同一道题的表达式冲突', () => {
    const course = twoScenes(
      { problem: '用描点法画函数 y=2x-1 的图象。', funcExpr: 'y=2x-1' },
      { task: '判断函数 y=6/x（x≠0）的图象如何连线。', funcExpr: 'y=6/x（x≠0）' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(0)
  })

  it('同一知识点的不同函数例题不把描点坐标误报为跨页冲突', () => {
    const course = twoScenes(
      { problem: '用两点法画函数 y=2x+4 的图象。', board: '描点：(0,4)、(2,8)' },
      { task: '用两点法画函数 y=3x+3 的图象。', board: '描点：(0,3)、(1,6)' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(0)
  })

  it('同一道题使用 answer 与 feedback 两种槽名时仍能发现答案冲突', () => {
    const course = twoScenes(
      { task: '标准大气压下，水的沸点是多少？', answer: '100℃' },
      { prompt: '标准大气压下，水的沸点是多少？', feedback: '90℃' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(1)
    expect(result.issues[0]).toMatchObject({
      severity: 'blocking',
      message: expect.stringContaining('answer / feedback'),
    })
  })

  it('同一明确事实标签的数值反转直接阻断', async () => {
    const course = twoScenes(
      { evidence: '标准大气压下水的沸点：100℃' },
      { takeaway: '标准大气压下水的沸点：90℃' },
    )
    const result = await factAuditCourse(course, { llm: clean })
    expect(result.consistencyConflictCount).toBe(1)
    expect(blockingOf(result.issues)).toHaveLength(1)
  })

  it('同一对页面存在多个不同事实冲突时逐项报告，不因类别相同漏掉第二项', () => {
    const course = twoScenes(
      { evidence: '水的沸点：100℃；水的冰点：0℃' },
      { evidence: '水的沸点：90℃；水的冰点：-10℃' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(2)
    expect(result.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('水的沸点'),
      expect.stringContaining('水的冰点'),
    ]))
  })

  it('受控错误槽即使写成“标签：数值”也不进入跨页事实锚点', () => {
    const course = twoScenes(
      { aiClaim: '水的沸点：90℃', reveal: '水的沸点：100℃' },
      { evidence: '水的沸点：100℃' },
    )
    course.scenes[0] = { ...course.scenes[0]!, sceneType: 'ai-verify' }

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(0)
  })

  it('同一知识点跨页口诀漂移给提醒，不把可能存在的两个助记版本直接判事实错误', async () => {
    const course = twoScenes(
      { mnemonic: '两湖两广两河山' },
      { mnemonic: '两湖两广两山河' },
    )
    const result = await factAuditCourse(course, { llm: clean })
    expect(result.consistencyConflictCount).toBe(1)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('口诀冲突') }),
    ]))
  })

  it('同一术语跨页采用不同定义时给出统一口径提醒', () => {
    const course = twoScenes(
      { definition: '惯性是物体保持原有运动状态的性质。' },
      { definition: '惯性是一种维持运动的力。' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(1)
    expect(result.issues[0]).toMatchObject({
      severity: 'warning',
      message: expect.stringContaining('术语冲突'),
    })
  })

  it('definition 与 meaning 两种槽名属于同一术语口径', () => {
    const course = twoScenes(
      { definition: '惯性是物体保持原有运动状态的性质。' },
      { meaning: '惯性是一种维持运动的力。' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(1)
    expect(result.issues[0]).toMatchObject({ severity: 'warning' })
  })

  it('纯符号公式差异只提醒人工确认，不由本地字符串比较器直接判事实错误', () => {
    const course = twoScenes(
      { task: '写出牛顿第二定律。', formula: 'F=ma' },
      { question: '写出牛顿第二定律。', equation: 'a=F/m' },
    )

    const result = auditLocalCourseConsistency(course)

    expect(result.conflictCount).toBe(1)
    expect(result.issues[0]).toMatchObject({ severity: 'warning' })
  })

  it('单页复核只报告涉及该页的冲突，仍与全课其他页面比较', async () => {
    const course = twoScenes(
      { task: '标准大气压下，水的沸点是多少？', feedback: '答案：100℃。' },
      { task: '标准大气压下，水的沸点是多少？', feedback: '答案：90℃。' },
    )
    const unrelated = { ...course.scenes[0]!, id: 'consistency-unrelated', kpId: 'kp-other', contentSlots: { topic: '另一知识点' } }
    course.scenes.push(unrelated)

    const unrelatedResult = await factAuditCourse(course, { llm: clean, sceneIds: [unrelated.id] })
    expect(unrelatedResult.consistencyConflictCount).toBe(0)
    expect(unrelatedResult.consistencyAuditedSceneIds).toEqual([unrelated.id])

    const touchedResult = await factAuditCourse(course, { llm: clean, sceneIds: ['consistency-right'] })
    expect(touchedResult.consistencyConflictCount).toBe(1)
  })
})

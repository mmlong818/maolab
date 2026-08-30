import { describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../../domain.js'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { auditCoursePageContentState, visiblePageText } from '../page-content-audit.js'
import type { VisiblePageContent } from '../page-content-contract.js'
import {
  fillPlannedPages,
  regeneratePlannedPage,
  type PageContentLLMCall,
} from '../page-content-generator.js'
import { buildCoursePlanningState } from '../page-first-planner.js'

function approvedCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  const course = compileLessonFromKps({
    courseId: 'course-page-content-test',
    kps: [{
      id: 'kp-poem',
      canonicalName: '《芣苢》中叠词与重章叠句的表达效果',
      knowledgeType: 'conceptual',
      learningObjectives: [
        '能识别《芣苢》中“采采”等叠词及其表意功能',
        '理解重章叠句在节奏、情感与劳动场景再现中的作用',
        '能结合诗句分析动作动词的层进性与画面感',
      ],
      misconceptions: ['反复出现的句子只是重复，没有表达作用'],
    }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
    groundingByKp: {
      'kp-poem': {
        excerpt: '采采芣苢，薄言采之。\n采采芣苢，薄言有之。\n\n作品结构：全诗三章，每章四句，共十二句；每章第二、四句的末字发生变化。',
        citation: '《诗经·周南》',
        provenance: { source: 'textbook', evidenceStatus: 'authoritative-excerpt' },
      },
    },
  })
  return {
    ...course,
    planning: { ...course.planning!, status: 'plan-approved' },
  }
}

function validLLM(): PageContentLLMCall {
  return vi.fn(async params => {
    const input = JSON.parse(params.user) as {
      page: {
        contentSpec: { kind: VisiblePageContent['kind']; [key: string]: unknown }
        learningAction: string
        newInformation: string
      }
      allowedSources: Array<{ sourceRef: string }>
      fixedStudentContent?: VisiblePageContent
    }
    const teacherCompanion = {
      script: `请看清楚画面中的内容，先完成“${input.page.learningAction}”，再说出你判断时使用的依据。`,
      notes: ['留出独立观察或作答时间。'],
    }
    if (input.fixedStudentContent) return { teacherCompanion }
    return {
      content: contentFor(input.page.contentSpec, input.page.learningAction, input.page.newInformation, input.allowedSources[0]?.sourceRef),
      teacherCompanion,
    }
  })
}

function contentFor(
  spec: { kind: VisiblePageContent['kind']; [key: string]: unknown },
  learningAction: string,
  newInformation: string,
  sourceRef?: string,
): VisiblePageContent {
  const evidence = [{
    text: sourceRef ? '原文中相同句式反复出现，同时更换关键词。' : '材料中相同句式反复出现，同时更换关键词。',
    ...(sourceRef ? { sourceRef } : {}),
  }]
  switch (spec.kind) {
    case 'observation':
      return {
        kind: 'observation',
        title: sourceRef ? '观察原文的反复与变化' : '观察材料的反复与变化',
        prompt: `请完成：${learningAction}`,
        materialCaption: sourceRef ? '按诗章顺序逐行观察。' : '课堂自编材料：同一句式反复出现，关键词逐步变化。',
        evidenceLabels: ['重复的句式', '变化的词语'],
      }
    case 'explanation':
      return {
        kind: 'explanation',
        title: String(spec.focus),
        coreStatement: `${String(spec.focus)}通过可检查的形式变化推进表达。`,
        evidence,
        boundary: '必须结合具体词句和结构证据判断，不能只看是否出现相同文字。',
      }
    case 'question':
      return {
        kind: 'question',
        title: '先判断，再说明依据',
        prompt: String(spec.promptGoal),
        materials: [sourceRef ? '请回看前页已经标出的重复句式和变化词语。' : '课堂自编材料：相同句式反复出现，同时更换关键词。'],
        responseInstruction: sourceRef ? '先写下判断，再引用一处原文说明理由。' : '先写下判断，再引用一处材料说明理由。',
      }
    case 'answer':
      return {
        kind: 'answer',
        title: '核对判断与依据',
        conclusion: '反复形式与关键词变化共同推进表达。',
        evidence,
        correction: '把只说“重复”的答案改成“指出反复形式并说明表达推进”。',
      }
    case 'worked-step':
      return {
        kind: 'worked-step',
        title: String(spec.focus),
        steps: [{
          step: '圈出反复出现的句式。',
          reason: '先确认可直接观察的结构证据。',
          result: '相同句式在各章反复出现。',
        }],
      }
    case 'practice':
      return {
        kind: 'practice',
        title: '独立练习',
        prompt: `${String(spec.taskGoal)}请结合新的诗句完成判断。`,
        materials: ['新诗句：河水汤汤，行人彭彭。'],
        responseInstruction: sourceRef ? '写出手法、原文证据和表达效果。' : '写出手法、材料证据和表达效果。',
      }
    case 'feedback':
      return {
        kind: 'feedback',
        title: learningAction.includes('迁移') ? '迁移任务反馈' : '练习反馈',
        successCriteria: ['写明手法并引用材料', '说明表达作用'],
        conclusion: '相同句式形成反复节奏，关键词变化推动内容展开。',
        evidence,
        revisionAction: '补上原文证据和表达作用。',
      }
    case 'recap':
      return {
        kind: 'recap',
        title: '本课总结',
        concepts: ['重章叠句是句式和章法的反复。', '叠词是相同字词的重叠使用。'],
        evidence,
        methods: ['先找形式', '再引原文', '最后说明表达作用'],
      }
    case 'transfer':
      return {
        kind: 'transfer',
        title: '迁移任务',
        prompt: String(spec.taskGoal),
        materials: ['新材料：另一首诗中连续三章使用同一句式，但每章更换一个动作词。'],
        responseInstruction: '判断所用手法，并结合变化说明表达效果。',
      }
    case 'course-orientation':
    case 'course-structure':
    case 'source-material':
      throw new Error(`${spec.kind} 应由程序锁定，不应交给模型生成。`)
  }
}

describe('强类型页面正文生成', () => {
  it('只填充已确认页面，并原样保留页面数量、ID、顺序和来源正文', async () => {
    const course = approvedCourse()
    const originalPlanning = structuredClone(course.planning)
    const llm = validLLM()

    const result = await fillPlannedPages(course, { llm })

    expect(course.planning).toEqual(originalPlanning)
    expect(result.course.planning?.status).toBe('review')
    expect(result.pageContent.status).toBe('review')
    expect(result.pageContent.pages.map(page => page.pageId)).toEqual(course.planning?.pages.map(page => page.id))
    expect(result.pageContent.pages.map(page => page.order)).toEqual(course.planning?.pages.map(page => page.order))
    expect(result.pageContent.pages.map(page => page.purpose)).toEqual(course.planning?.pages.map(page => page.purpose))
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length)
    expect(result.audit).toEqual([])

    const source = result.pageContent.pages.find(page => page.content.kind === 'source-material')
    const orientation = result.pageContent.pages.find(page => page.content.kind === 'course-orientation')
    const observation = result.pageContent.pages.find(page => page.content.kind === 'observation')
    expect(orientation?.content).toMatchObject({ goals: [
      '能识别《芣苢》中“采采”等叠词及其表意功能',
    ] })
    expect(observation?.content).toMatchObject({
      kind: 'observation',
      materialCaption: '采采芣苢，薄言采之。\n采采芣苢，薄言有之。\n\n作品结构：全诗三章，每章四句，共十二句；每章第二、四句的末字发生变化。',
      evidenceLabels: ['关键词句', '形式或内容的线索', '可直接引用的原文依据'],
    })
    expect(source?.content).toEqual({
      kind: 'source-material',
      title: '《芣苢》中叠词与重章叠句的表达效果',
      body: '采采芣苢，薄言采之。\n采采芣苢，薄言有之。\n\n作品结构：全诗三章，每章四句，共十二句；每章第二、四句的末字发生变化。',
      citation: '《诗经·周南》',
    })
  })

  it('页面计划未确认时拒绝生成，不消耗模型调用', async () => {
    const course = approvedCourse()
    course.planning = { ...course.planning!, status: 'planning' }
    const llm = validLLM()

    await expect(fillPlannedPages(course, { llm })).rejects.toThrow(/plan-approved/)
    expect(llm).not.toHaveBeenCalled()
  })

  it('单页模型调用异常时由页面级循环重试，不中断整门课', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let failedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      if (!failedOnce && JSON.parse(params.user).page.contentSpec.kind === 'answer') {
        failedOnce = true
        throw new Error('模型返回的 JSON 格式错误')
      }
      return base(params)
    })

    const result = await fillPlannedPages(course, { llm })

    expect(failedOnce).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('版式字段超限时在结构校验阶段给出具体字段并重试', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    let sawFieldFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(reason => reason.includes('content.prompt'))) sawFieldFeedback = true
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'question') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            prompt: '这是一段超过投影片容量的题目文字。'.repeat(12),
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(sawFieldFeedback).toBe(true)
    expect(result.audit).toEqual([])
  })

  it('没有教材原文的语言观察页必须标明课堂自编材料', async () => {
    const course = approvedCourse()
    course.sourceMaterial = course.sourceMaterial.map(source => {
      const { excerpt: _excerpt, ...metadataOnly } = source
      return metadataOnly
    })
    course.planning = buildCoursePlanningState({
      courseId: course.id,
      topic: course.topic,
      subject: course.subject,
      goals: course.goals,
      kps: [{
        id: 'kp-poem',
        canonicalName: course.topic,
        knowledgeType: 'conceptual',
        misconceptions: ['重复的句子没有表达作用'],
      }],
      sourceMaterial: course.sourceMaterial,
    })
    course.planning = { ...course.planning, status: 'plan-approved' }
    const base = validLLM()
    let rejectedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (output.content?.kind === 'observation') {
        const materialCaption = rejectedOnce ? '课堂自编材料：同一句式反复出现，关键词逐步变化。' : '同一句式反复出现，关键词逐步变化。'
        rejectedOnce = true
        return { ...output, content: { ...output.content, materialCaption } }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(result.audit).toEqual([])
    expect(result.pageContent.pages.find(page => page.content.kind === 'observation')?.content).toMatchObject({
      materialCaption: expect.stringMatching(/^课堂自编材料：/),
    })
  })

  it('没有来源绑定时阻断把课堂自编材料伪装成原文摘录', async () => {
    const course = approvedCourse()
    course.sourceMaterial = course.sourceMaterial.map(source => {
      const { excerpt: _excerpt, ...metadataOnly } = source
      return metadataOnly
    })
    course.planning = buildCoursePlanningState({
      courseId: course.id,
      topic: course.topic,
      subject: course.subject,
      goals: course.goals,
      kps: [{ id: 'kp-poem', canonicalName: course.topic, knowledgeType: 'conceptual' }],
      sourceMaterial: course.sourceMaterial,
    })
    course.planning = { ...course.planning, status: 'plan-approved' }
    const result = await fillPlannedPages(course, { llm: validLLM() })
    const observation = result.pageContent.pages.find(page => page.content.kind === 'observation')!
    if (observation.content.kind === 'observation') {
      observation.content.materialCaption = '课堂自编材料：教材原文摘录，第一条改革措施。'
      observation.content.evidenceLabels = ['记录原文依据']
    }

    const issues = auditCoursePageContentState(course.planning, result.pageContent, course.sourceMaterial)

    expect(issues.some(issue => issue.pageId === observation.pageId && issue.code === 'unsupported-source-claim')).toBe(true)
  })

  it('原文型页面只有目录信息时在调用模型前阻断', async () => {
    const course = approvedCourse()
    course.sourceMaterial = course.sourceMaterial.map(source => {
      const { excerpt: _excerpt, ...metadataOnly } = source
      return metadataOnly
    })
    const llm = validLLM()

    await expect(fillPlannedPages(course, { llm })).rejects.toThrow(/需要可核验原文/)
    expect(llm).not.toHaveBeenCalled()
  })

  it('兼容模型增加的单层 page 包装，但程序锁定页仍忽略模型正文', async () => {
    const course = approvedCourse()
    const base = validLLM()
    const llm: PageContentLLMCall = vi.fn(async params => ({ page: await base(params) }))

    const result = await fillPlannedPages(course, { llm })
    const orientation = result.pageContent.pages.find(page => page.content.kind === 'course-orientation')

    expect(result.audit).toEqual([])
    expect(orientation?.content).toMatchObject({
      kind: 'course-orientation',
      learningQuestion: `怎样理解${course.topic}？`,
    })
  })

  it('开场和课程结构会移除教材内部题号，不把备课索引投给学生', async () => {
    const course = approvedCourse()
    const orientation = course.planning!.pages.find(page => page.contentSpec.kind === 'course-orientation')!
    if (orientation.contentSpec.kind === 'course-orientation') {
      orientation.contentSpec = {
        ...orientation.contentSpec,
        goalStatements: ['能说明叠词的表达作用，完成练习题④（教材验证题）'],
      }
    }
    const structure = course.planning!.pages.find(page => page.contentSpec.kind === 'course-structure')!
    if (structure.contentSpec.kind === 'course-structure') {
      structure.contentSpec = {
        ...structure.contentSpec,
        items: [{ title: '辨析叠词，完成练习题④（教材验证题）' }],
      }
    }

    const result = await fillPlannedPages(course, { llm: validLLM() })
    const studentText = result.pageContent.pages.map(page => visiblePageText(page.content)).join('\n')

    expect(studentText).not.toContain('练习题④')
    expect(studentText).not.toContain('教材验证题')
    expect(studentText).toContain('能说明叠词的表达作用')
  })

  it('每次请求都明确给出唯一 JSON 字段结构和教师讲稿事实边界', async () => {
    const course = approvedCourse()
    const base = validLLM()
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { page: { contentSpec: { kind: string } }; fixedStudentContent?: unknown }
      expect(params.system).toContain('唯一允许的输出结构：')
      expect(params.system).toContain('不得自行添加字数、年代、作者背景、统计数量')
      expect(params.system).toContain('读取信息的书写顺序与根据坐标定位时寻找两条线的操作顺序不是一回事')
      expect(params.system).toContain('自然形态通常只能说近似或统计自相似')
      if (input.fixedStudentContent) expect(params.system).not.toContain('"content":')
      if (input.page.contentSpec.kind === 'observation' && !input.fixedStudentContent) {
        expect(params.system).toContain('"prompt":"观察问题"')
        expect(params.system).toContain('"evidenceLabels":["证据标签"]')
      }
      return base(params)
    })

    await expect(fillPlannedPages(course, { llm })).resolves.toMatchObject({ audit: [] })
  })

  it('问题页返回答案字段时严格拒绝并重试，最终答案只存在于后续页面', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'question') {
        rejectedOnce = true
        return { ...output, content: { ...output.content, answer: '这是不应出现在问题页的答案。' } }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })
    const prompt = result.pageContent.pages.find(page => page.content.kind === 'question')!
    const response = result.pageContent.pages.find(page => page.pairId === prompt.pairId && page.pairRole === 'response')!

    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(prompt.content).not.toHaveProperty('answer')
    expect(['answer', 'worked-step']).toContain(response.content.kind)
  })

  it('问题材料用来源定义句直接完成判断时拒绝并携原因重试', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    let sawQualityFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(reason => reason.includes('直接给出本题判断'))) {
        sawQualityFeedback = true
      }
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'question') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            prompt: '有人认为“薄言”是实义短语。你认为这一判断是否成立？',
            materials: ['词语说明：薄、言均为语助词，无实义。'],
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(sawQualityFeedback).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('题干用评价性措辞自行泄露判断方向时拒绝并重试', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    let sawQualityFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(reason => reason.includes('题干自身'))) sawQualityFeedback = true
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'question') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            prompt: '有人误将“薄言”理解为实义短语，忽视其助词性质。请判断这一说法是否成立。',
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(sawQualityFeedback).toBe(true)
    expect(result.audit).toEqual([])
  })

  it('回应页的成立判断与后续纠错方向冲突时拒绝并重试', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    let sawQualityFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(reason => reason.includes('结论方向自相矛盾'))) sawQualityFeedback = true
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'answer') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            conclusion: '该说法成立，但这是误将反复当作无作用的错误理解。',
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(sawQualityFeedback).toBe(true)
    expect(result.audit).toEqual([])
  })

  it('生成问题页时从来源和前序摘要中移除会直接完成判断的注释', async () => {
    const course = approvedCourse()
    course.sourceMaterial[0]!.excerpt += '\n词语说明：薄、言均为语助词，无实义；采，采摘。'
    const questionPage = course.planning!.pages.find(page => page.contentSpec.kind === 'question')!
    if (questionPage.contentSpec.kind === 'question') {
      questionPage.contentSpec = {
        ...questionPage.contentSpec,
        promptGoal: '判断“薄言是实义短语”是否成立，并引用本课证据。',
      }
    }
    const base = validLLM()
    let inspected = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as {
        page: { contentSpec: { kind: string } }
        allowedSources: Array<{ excerpt: string }>
        priorStudentPages: Array<{ visibleText: string }>
      }
      if (input.page.contentSpec.kind === 'question') {
        inspected = true
        expect(input.allowedSources.map(source => source.excerpt).join('\n')).not.toContain('无实义')
        expect(input.priorStudentPages.map(page => page.visibleText).join('\n')).not.toContain('无实义')
        expect(input.allowedSources.map(source => source.excerpt).join('\n')).toContain('采，采摘')
      }
      return base(params)
    })

    await expect(fillPlannedPages(course, { llm })).resolves.toMatchObject({ audit: [] })
    expect(inspected).toBe(true)
  })

  it('没有规划图像的任务页明确禁止声称存在图表', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let checked = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { page: { contentSpec: { kind: string }; visualSpec: { required: boolean } } }
      if (input.page.contentSpec.kind === 'practice' && !input.page.visualSpec.required) {
        checked = true
        expect(params.system).toContain('本课唯一知识领域')
        expect(params.system).toContain('《芣苢》中叠词与重章叠句的表达效果')
        expect(params.system).toContain('本页没有规划外部图像或表格')
        expect(params.system).toContain('局部放大图')
        expect(params.system).toContain('需要的数据或文字材料必须完整写入正文')
      }
      return base(params)
    })

    await fillPlannedPages(course, { llm })
    expect(checked).toBe(true)
  })

  it('自动移除模型写入的计划外证据引用，但保留证据正文', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let injected = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { allowedSources: Array<{ sourceRef: string }> }
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!injected && input.allowedSources.length === 0 && output.content?.kind === 'feedback') {
        injected = true
        return {
          ...output,
          content: {
            ...output.content,
            evidence: [{ text: '依据迁移题中的课堂自编材料。', sourceRef: '课堂自编材料' }],
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })
    const feedback = result.pageContent.pages.find(page => (
      page.content.kind === 'feedback'
      && page.sourceRefs.length === 0
      && page.content.evidence.some(item => item.text.includes('课堂自编材料'))
    ))

    expect(injected).toBe(true)
    expect(feedback?.content.kind).toBe('feedback')
    if (feedback?.content.kind === 'feedback') {
      expect(feedback.content.evidence).toEqual([{ text: '依据迁移题中的课堂自编材料。' }])
    }
  })

  it('自动移除学生可见文字中的内部来源编号', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let injectedRef = ''
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { allowedSources: Array<{ sourceRef: string }> }
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!injectedRef && input.allowedSources[0] && output.content?.kind === 'practice') {
        injectedRef = input.allowedSources[0].sourceRef
        return {
          ...output,
          content: {
            ...output.content,
            materials: [...output.content.materials, `内部引用 ${injectedRef}`],
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(injectedRef).not.toBe('')
    expect(result.pageContent.pages.map(page => visiblePageText(page.content)).join('\n')).not.toContain(injectedRef)
  })

  it('语文迁移页明确禁止把真实作品伪装成课堂自编材料', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let checked = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { page: { contentSpec: { kind: string } } }
      if (input.page.contentSpec.kind === 'transfer') {
        checked = true
        expect(params.system).toContain('明确的现代白话短句')
        expect(params.system).toContain('不得把真实作品标成“课堂自编”')
        expect(params.system).toContain('不能用相近但不同的现象替代目标概念')
      }
      return base(params)
    })

    await expect(fillPlannedPages(course, { llm })).resolves.toMatchObject({ audit: [] })
    expect(checked).toBe(true)
  })

  it('叠词迁移页拒绝把数量短语反复当成叠词', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'transfer') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            materials: ['课堂自编材料：孩子们一片一片地收好树叶。'],
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('正文或讲稿中的作品句数与来源冲突时拒绝生成', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: { script: string; notes: string[] } }
      if (!rejectedOnce && output.content?.kind === 'explanation') {
        rejectedOnce = true
        return {
          ...output,
          content: { ...output.content, coreStatement: '《芣苢》全诗三章六句，使用重章叠句。' },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('分别核对全诗总句数与每章句数，不把两个口径互相比较', async () => {
    const course = approvedCourse()
    const base = validLLM()
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (output.content?.kind !== 'explanation') return output
      return {
        ...output,
        content: {
          ...output.content,
          coreStatement: '全诗三章，每章四句，共十二句；各章句式反复，关键动词依次变化。',
        },
      }
    })

    const result = await fillPlannedPages(course, { llm })

    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length)
    expect(result.audit).toEqual([])
  })

  it('正文遗漏来源明确给出的第四句变化时拒绝生成', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'explanation') {
        rejectedOnce = true
        return {
          ...output,
          content: { ...output.content, coreStatement: '每章第二句的末字依次变化，形成层进。' },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('学生投影片引号不配对时拒绝生成', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'explanation') {
        rejectedOnce = true
        return {
          ...output,
          content: { ...output.content, coreStatement: '“采采没有配对引号。' },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('声明数量与实际列项不一致时携审计原因重试', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    let sawQualityFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(reason => reason.includes('数量'))) sawQualityFeedback = true
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'feedback') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            conclusion: '材料中共有六个叠词：远远；层层叠叠；深深浅浅；轻轻；浓浓。',
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(sawQualityFeedback).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('前后对应项数量不一致时携审计原因重试', async () => {
    const course = approvedCourse()
    const base = validLLM()
    let rejectedOnce = false
    let sawQualityFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(reason => reason.includes('对应项数量'))) sawQualityFeedback = true
      const output = await base(params) as { content?: VisiblePageContent; teacherCompanion: unknown }
      if (!rejectedOnce && output.content?.kind === 'explanation') {
        rejectedOnce = true
        return {
          ...output,
          content: {
            ...output.content,
            evidence: [{
              text: '末字由“采／有”到“掇／捋”再到“袺／襭”依次替换，依次呈现采摘、拾取、成把捋下、提起衣襟兜住、掖在腰带上兜满。',
              sourceRef: course.sourceMaterial[0] ? `source:1:${course.sourceMaterial[0].kpId}` : undefined,
            }],
          },
        }
      }
      return output
    })

    const result = await fillPlannedPages(course, { llm })

    expect(rejectedOnce).toBe(true)
    expect(sawQualityFeedback).toBe(true)
    expect(llm).toHaveBeenCalledTimes(course.planning!.pages.length + 1)
    expect(result.audit).toEqual([])
  })

  it('备课检查时只重生成指定页面并递增正文版本', async () => {
    const course = approvedCourse()
    const initial = await fillPlannedPages(course, { llm: validLLM() })
    const target = initial.pageContent.pages.find(page => page.content.kind === 'feedback')!
    const untouched = initial.pageContent.pages.find(page => page.pageId !== target.pageId)!
    const llm = validLLM()

    const regenerated = await regeneratePlannedPage(initial.course, target.pageId, { llm })

    expect(llm).toHaveBeenCalledTimes(1)
    expect(regenerated.pageContent.contentRevisionId).toBe(`${course.planning!.planRevisionId}:content:2`)
    expect(regenerated.pageContent.pages.find(page => page.pageId === untouched.pageId)).toBe(untouched)
    expect(regenerated.audit).toEqual([])
  })

  it('单页重生成会把已落库核查意见传给模型，并使旧核查版本失效', async () => {
    const course = approvedCourse()
    const initial = await fillPlannedPages(course, { llm: validLLM() })
    const target = initial.pageContent.pages.find(page => page.content.kind === 'feedback')!
    initial.course.factAudit = {
      contentRevisionId: initial.pageContent.contentRevisionId,
      auditedSceneCount: initial.pageContent.pages.length,
      fatalCount: 1,
      issues: [{
        id: 'fact-1', severity: 'blocking', targetId: target.pageId,
        message: '结论与题设矛盾。', impact: '学生会得到错误答案。', fix: '按题设重新计算。',
      }],
    }
    const base = validLLM()
    let sawFeedback = false
    const llm: PageContentLLMCall = vi.fn(async params => {
      const input = JSON.parse(params.user) as { qualityFeedback?: string[] }
      if (input.qualityFeedback?.some(item => item.includes('按题设重新计算'))) sawFeedback = true
      return base(params)
    })

    const regenerated = await regeneratePlannedPage(initial.course, target.pageId, { llm })

    expect(sawFeedback).toBe(true)
    expect(regenerated.course.factAudit).toBeUndefined()
  })

  it('正文审计阻断来源改写、学生页内部旁白和教师讲稿受众错误', async () => {
    const course = approvedCourse()
    const result = await fillPlannedPages(course, { llm: validLLM() })
    const tampered = structuredClone(result.pageContent)
    const source = tampered.pages.find(page => page.content.kind === 'source-material')!
    if (source.content.kind === 'source-material') source.content.body = '被模型改写的材料'
    const question = tampered.pages.find(page => page.content.kind === 'question')!
    if (question.content.kind === 'question') question.content.responseInstruction = '保留你的原始判断，下一页再对照检验。'
    question.teacherCompanion.script = '教师应引导学生完成本页目标，然后再继续。'

    const issues = auditCoursePageContentState(course.planning!, tampered, course.sourceMaterial)
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'source-body-changed',
      'internal-student-text',
      'teacher-script-audience',
    ]))
  })

  it('正文审计阻断计划外增页和无新增作用的重复页面', async () => {
    const course = approvedCourse()
    const result = await fillPlannedPages(course, { llm: validLLM() })
    const tampered = structuredClone(result.pageContent)
    const feedbackPages = tampered.pages.filter(page => page.content.kind === 'feedback')
    feedbackPages[1]!.content = structuredClone(feedbackPages[0]!.content)
    tampered.pages.push({ ...structuredClone(tampered.pages[0]!), pageId: 'unplanned-page', order: 999 })

    const issues = auditCoursePageContentState(course.planning!, tampered, course.sourceMaterial)
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['page-count', 'extra-page', 'semantic-duplicate']))
  })

  it('正文审计阻断把所有分形自相似绝对化为局部与整体完全相同', async () => {
    const course = approvedCourse()
    const result = await fillPlannedPages(course, { llm: validLLM() })
    const explanation = result.pageContent.pages.find(page => page.content.kind === 'explanation')!
    if (explanation.content.kind === 'explanation') {
      explanation.content.coreStatement = '分形的自相似性质是指局部放大后与整体形状完全相同。'
      explanation.content.boundary = '局部与整体不完全相同的图形不能称为自相似。'
    }

    const issues = auditCoursePageContentState(course.planning!, result.pageContent, course.sourceMaterial)
    expect(issues.map(issue => issue.code)).toContain('self-similarity-overclaim')
  })

  it('正文审计阻断字段各自合法但整页无法容纳的讲解、回答和总结', async () => {
    const course = approvedCourse()
    const result = await fillPlannedPages(course, { llm: validLLM() })
    const tampered = structuredClone(result.pageContent)
    const explanation = tampered.pages.find(page => page.content.kind === 'explanation')!
    if (explanation.content.kind === 'explanation') {
      explanation.content.coreStatement = '这一页需要完整解释概念、适用条件、判断依据和使用方法。'.repeat(4)
      explanation.content.evidence = [
        { text: '第一条证据包含过多背景、过程、结论和补充说明。'.repeat(4) },
        { text: '第二条证据继续重复背景、过程、结论和补充说明。'.repeat(4) },
      ]
      explanation.content.boundary = '适用边界继续加入大量不属于学生投影片的详细说明。'.repeat(4)
    }
    const answer = tampered.pages.find(page => page.content.kind === 'answer')!
    if (answer.content.kind === 'answer') {
      answer.content.conclusion = '该判断不成立，需要结合文本结构和词义逐项核对。'.repeat(6)
      answer.content.evidence = [
        { text: '第一条来源证据需要说明对应词句和具体作用。'.repeat(4), sourceRef: answer.sourceRefs[0] },
        { text: '第二条来源证据需要说明形式变化和表达效果。'.repeat(4), sourceRef: answer.sourceRefs[0] },
      ]
      answer.content.correction = '修正时需要删去原判断并补入完整依据。'.repeat(6)
    }
    const recap = tampered.pages.find(page => page.content.kind === 'recap')!
    if (recap.content.kind === 'recap') {
      recap.content.concepts = Array.from({ length: 4 }, (_, index) => `概念${index + 1}需要完整解释定义、作用、边界和文本表现。`.repeat(3))
    }

    const issues = auditCoursePageContentState(course.planning!, tampered, course.sourceMaterial)
    expect(issues.filter(issue => issue.code === 'page-density').map(issue => issue.pageId)).toEqual(expect.arrayContaining([
      explanation.pageId,
      answer.pageId,
      recap.pageId,
    ]))
  })

  it('反馈页允许用三条短证据完整覆盖三个并列维度', async () => {
    const course = approvedCourse()
    const result = await fillPlannedPages(course, { llm: validLLM() })
    const feedback = result.pageContent.pages.find(page => page.content.kind === 'feedback')!
    const sourceRef = feedback.sourceRefs[0]
    if (feedback.content.kind === 'feedback') {
      feedback.content.successCriteria = ['三个维度均有依据']
      feedback.content.conclusion = '结论同时覆盖政治、经济和军事三个方面。'
      feedback.content.evidence = ['政治措施有对应事实', '经济措施有对应事实', '军事措施有对应事实']
        .map(text => ({ text, ...(sourceRef ? { sourceRef } : {}) }))
      feedback.content.revisionAction = '补齐缺少的维度和事实。'
    }

    const issues = auditCoursePageContentState(course.planning!, result.pageContent, course.sourceMaterial)
    expect(issues.some(issue => issue.pageId === feedback.pageId && issue.code === 'page-density')).toBe(false)
  })
})

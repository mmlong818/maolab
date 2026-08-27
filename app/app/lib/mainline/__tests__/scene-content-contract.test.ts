import { describe, expect, it } from 'vitest'
import { sceneContentContract, specializedContentKind } from '../presentation/scene-content-contract.js'
import { pickMasterRouted } from '../presentation/master-routing.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

function courseClone(sceneType?: string) {
  const course = sceneType
    ? GOLDEN_MAINLINE_COURSES.find(item => item.scenes.some(scene => scene.sceneType === sceneType))
    : GOLDEN_MAINLINE_COURSES[0]
  if (!course) throw new Error(`golden samples need a ${sceneType} scene`)
  return structuredClone(course)
}

function routeToMaster(
  course: ReturnType<typeof courseClone>,
  scene: ReturnType<typeof courseClone>['scenes'][number],
  family: 'contrast' | 'recap',
  target: number,
) {
  for (let index = 0; index < 5_000; index += 1) {
    course.id = `content-contract-${family}-${index}`
    if (pickMasterRouted(course, scene, family) === target) return
  }
  throw new Error(`unable to route ${family} to master ${target}`)
}

describe('scene content contract', () => {
  it('keeps mandatory concept content on screen beside a timeline', () => {
    const course = courseClone('concept-build')
    const scene = course.scenes.find(item => item.sceneType === 'concept-build')!
    scene.contentSlots = {
      statement: '核心结论',
      example: '对应示例',
      timelineEvents: '755|起兵\n763|平叛',
    }

    const contract = sceneContentContract(course, scene)
    expect(specializedContentKind(scene)).toBe('timeline')
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['statement', 'example', 'timelineEvents.0', 'timelineEvents.1'])
    expect(contract.displayEntries.map(entry => entry.value)).toEqual(['核心结论', '对应示例', '755　起兵', '763　平叛'])
    expect(contract.visualEntries.map(entry => entry.value)).toEqual(['2 个节点沿时间轴由上到下排列'])
    expect(contract.planningEntries).toEqual([])
    expect(contract.displaySummary).toBe('核心表述、示例、时间线')
  })

  it('treats source-reading slots as preparation notes because the page uses course data', () => {
    const course = courseClone('source-reading')
    const scene = course.scenes.find(item => item.sceneType === 'source-reading')!
    scene.contentSlots = { coreQuestion: '为什么会发生？', structuralTurn: '结构转折' }

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['course.topic', 'course.knowledgePoints'])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['coreQuestion', 'structuralTurn'])
  })

  it('uses only the confirmed board as visible text on an illustrated recap page', () => {
    const course = courseClone('recap')
    const scene = course.scenes.find(item => item.sceneType === 'recap')!
    scene.imageUrl = '/recap.png'
    scene.contentSlots = { path: '观察→理解→应用', takeaway: '课后收获' }
    scene.boardText = ['板书一', '板书二']

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.value)).toEqual(['板书一', '板书二'])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['path', 'takeaway'])
    expect(contract.displaySummary).toBe('原配图、确认板书')
  })

  it('reports the template-derived recap slots as the actual non-image page content', () => {
    const course = courseClone('recap')
    const scene = course.scenes.find(item => item.sceneType === 'recap')!
    delete scene.imageUrl
    scene.infoShape = 'hierarchy'
    scene.contentSlots = {
      shapeSummary: '安史之乱是多条矛盾共同断裂的结果',
      shapeItem1: '节度使权力扩张形成外重内轻',
      shapeItem2: '财政与军制问题削弱中央控制',
      shapeItem3: '战乱扩大后地方割据长期延续',
      takeaway: '解释历史转折要连接结构、事件与后果',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual([
      'shapeSummary', 'shapeItem1', 'shapeItem2', 'shapeItem3', 'takeaway',
    ])
    expect(contract.planningEntries).toEqual([])
    expect(contract.displaySummary).toBe('本课总论断、结构分支、核心收获')
  })

  it('keeps misconception and correction visible on an illustrated contrast page', () => {
    const course = courseClone('contrast')
    course.qualityStatus = 'draft'
    const scene = course.scenes.find(item => item.sceneType === 'contrast')!
    scene.imageUrl = '/contrast.png'
    scene.contentSlots = {
      misconception: '错误理解',
      correction: '正确解释',
      timelineEvents: '之前|之后',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['misconception'])
    expect(contract.revealEntries.map(entry => entry.key)).toEqual(['correction'])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['timelineEvents'])
    expect(specializedContentKind(scene)).toBeNull()
  })

  it('uses the same itemized AI claims and reveals that the classroom renders', () => {
    const course = courseClone()
    const scene = course.scenes[0]!
    scene.sceneType = 'ai-verify'
    scene.sceneTechnique = 'comparison-slider'
    scene.contentSlots = {
      aiClaim: '合并说法', reveal: '合并核查',
      aiClaim1: '分项说法一', reveal1: '分项核查一',
      aiClaim2: '分项说法二', reveal2: '分项核查二',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['aiClaim1'])
    expect(contract.displayEntries.map(entry => entry.value)).toEqual(['分项说法一'])
    expect(contract.revealEntries.map(entry => entry.key)).toEqual(['reveal1', 'aiClaim2', 'reveal2'])
    expect(contract.revealEntries.map(entry => entry.value)).toEqual(['分项核查一', '分项说法二', '分项核查二'])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['aiClaim', 'reveal'])
    expect(contract.displaySummary).toBe('AI 的说法（首屏）')
  })

  it('keeps itemized AI verification beside a specialized function plot', () => {
    const course = courseClone()
    const scene = course.scenes[0]!
    scene.sceneType = 'ai-verify'
    scene.sceneTechnique = 'comparison-slider'
    scene.contentSlots = {
      aiClaim: '合并说法', reveal: '合并核查',
      aiClaim1: '分项说法一', reveal1: '分项核查一',
      aiClaim2: '分项说法二', reveal2: '分项核查二',
      funcExpr: '\\(y=2x-1\\)',
      funcPlotPoints: '0,-1 1,1',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.specializedKind).toBe('function-plot')
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['aiClaim1'])
    expect(contract.revealEntries.map(entry => entry.key)).toEqual([
      'reveal1', 'aiClaim2', 'reveal2', 'funcExpr',
    ])
    expect(contract.visualEntries.map(entry => entry.key)).toEqual(['funcPlotPoints.curve'])
    expect(contract.visualEntries[0]?.value).toContain('1 个连续分支分别连线，共 2 个采样点')
    expect(contract.displayEntries.some(entry => entry.value.includes('0,-1 1,1'))).toBe(false)
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['aiClaim', 'reveal'])
  })

  it('separates force labels from the vector data used to draw arrows', () => {
    const course = courseClone()
    const scene = course.scenes[0]!
    scene.sceneType = 'worked-example'
    scene.contentSlots = {
      problem: '分析物体受到的力',
      completionPrompt: '题面已有：研究对象已经选定。请在【待补】处补出下一步，并说明依据。',
      steps: '先选研究对象，再逐个找力',
      forceVectors: 'G|重力|39.2|N|270|gravity\nT|拉力|39.2|N|90|tension',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries).toContainEqual(expect.objectContaining({
      key: 'completionPrompt',
      label: '当前题目',
    }))
    expect(contract.specializedKind).toBe('force')
    expect(contract.displayEntries.map(entry => entry.value)).toEqual([
      '分析物体受到的力',
      '题面已有：研究对象已经选定。请在【待补】处补出下一步，并说明依据。',
    ])
    expect(contract.revealEntries.map(entry => entry.value)).toEqual(['先选研究对象，再逐个找力', 'G 39.2N', 'T 39.2N'])
    expect(contract.displayEntries.concat(contract.revealEntries).map(entry => entry.value)).toEqual([
      '分析物体受到的力',
      '题面已有：研究对象已经选定。请在【待补】处补出下一步，并说明依据。',
      '先选研究对象，再逐个找力', 'G 39.2N', 'T 39.2N',
    ])
    expect(contract.visualEntries.map(entry => entry.value)).toEqual([
      '重力从物体中心指向 270°；以向右为 0°，逆时针为正，箭头长度按 39.2N 比例绘制',
      '拉力从物体中心指向 90°；以向右为 0°，逆时针为正，箭头长度按 39.2N 比例绘制',
    ])
    expect(contract.planningEntries).toEqual([])
    expect(contract.displayEntries.some(entry => entry.value.includes('|gravity'))).toBe(false)
  })

  it('makes the worked-example confirmation text match the actual student slide', () => {
    const course = courseClone()
    const scene = course.scenes[0]!
    scene.sceneType = 'worked-example'
    scene.contentSlots = {
      problem: '判断拉力与摩擦力是否二力平衡。',
      completionPrompt: '已知：木块向右匀速，拉力和摩擦力均为 6 N。请在【待补】处逐条核验二力平衡条件并说明依据。',
      steps: '第一步确认状态：匀速直线运动，合力为零；第二步受力分析：画出四个力；第三步逐条验证四条件。',
    }
    scene.boardText = ['同体·等大·反向·共线→平衡']

    const contract = sceneContentContract(course, scene)

    expect(contract.displayEntries.map(entry => [entry.label, entry.value])).toEqual([
      ['题目', '判断拉力与摩擦力是否二力平衡。'],
      ['当前题目', '已知：木块向右匀速，拉力和摩擦力均为 6 N。请在【待补】处逐条核验二力平衡条件并说明依据。'],
    ])
    expect(contract.revealEntries).toEqual([{
      key: 'steps',
      label: '解题过程',
      value: '确认状态：匀速直线运动，合力为零\n受力分析：画出四个力\n逐条验证四条件：作用在同一物体上、大小相等、方向相反且在同一直线上，因此拉力和摩擦力是一对平衡力。',
      source: 'slot',
    }])
  })

  it('does not invent explanatory copy or steps beyond the stored slide content', () => {
    const course = courseClone()
    const scene = course.scenes[0]!
    scene.sceneType = 'worked-example'
    scene.contentSlots = {
      problem: '用描点法画出函数图象。',
      completionPrompt: '已知 x=-1、0、1，请写出一个对应的 y 值计算过程。',
      steps: '第一步列表取值：取 x=-1、0、1，分别计算对应的 y 值。',
    }

    const contract = sceneContentContract(course, scene)

    expect(contract.displayEntries.map(entry => [entry.label, entry.value])).toEqual([
      ['题目', '用描点法画出函数图象。'],
      ['当前题目', '已知 x=-1、0、1，请写出一个对应的 y 值计算过程。'],
    ])
  })

  it('reports geometry labels as text and coordinates or edges as drawing relationships', () => {
    const course = courseClone('concept-build')
    const scene = course.scenes.find(item => item.sceneType === 'concept-build')!
    scene.contentSlots = {
      statement: '直角三角形的边角关系',
      example: '观察三角形 ABC',
      geoVertices: 'A(0,0);B(4,0);C(4,3)',
      geoEdges: 'AB;BC;CA',
      geoAngleLabels: '∠ABC=90°',
      geoAuxLines: '连接 A、C→标出直角',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.specializedKind).toBe('geometry')
    expect(contract.displayEntries.map(entry => entry.value)).toEqual([
      '直角三角形的边角关系', '观察三角形 ABC', 'A、B、C', '∠ABC=90°', '连接 A、C', '标出直角',
    ])
    expect(contract.visualEntries.map(entry => entry.value)).toEqual([
      '坐标 (0,0)', '坐标 (4,0)', '坐标 (4,3)', 'AB、BC、CA',
    ])
    expect(contract.planningEntries).toEqual([])
    expect(contract.displayEntries.some(entry => entry.value === 'A(0,0);B(4,0);C(4,3)')).toBe(false)
  })

  it.each([
    {
      name: 'poem',
      kind: 'poem',
      slots: { poemTitle: '静夜思', poemAuthor: '李白', poemLines: '床前明月光\n疑是地上霜' },
      rawKeys: ['poemLines'],
      expectedText: '床前明月光',
    },
    {
      name: 'dialogue',
      kind: 'dialogue',
      slots: { dialogueScript: 'Teacher: What changed?\nStudent: The evidence changed.' },
      rawKeys: ['dialogueScript'],
      expectedText: 'Teacher：What changed?',
    },
    {
      name: 'chemistry equation',
      kind: 'chemistry',
      slots: {
        chemEquation: '2H_2 + O_2 \\rightarrow 2H_2O',
        chemEquationAtoms: 'H:4=4\nO:2=2',
        chemEquationCondition: '点燃',
        chemEquationStates: 'H2:气体\nO2:气体',
        chemEquationEnergy: '放热',
      },
      rawKeys: ['chemEquationAtoms', 'chemEquationStates'],
      expectedText: '反应物 4；生成物 4',
    },
    {
      name: 'circuit',
      kind: 'circuit',
      slots: {
        circuitTopology: 'E1|battery|6|V\nR1|resistor|10|Ω',
        circuitConnections: 'E1-R1',
      },
      rawKeys: ['circuitTopology', 'circuitConnections'],
      expectedText: 'E1 · 6V',
    },
    {
      name: 'classical Chinese',
      kind: 'chinese',
      slots: {
        classicalText: '学而时习之',
        classicalTranslation: '学习后按时温习',
        classicalGloss: '习|温习|动词',
      },
      rawKeys: ['classicalGloss'],
      expectedText: '习：温习；动词',
    },
    {
      name: 'English vocabulary',
      kind: 'english',
      slots: {
        vocabCards: 'evidence|evɪdəns|noun|证据|Use evidence.|名词',
      },
      rawKeys: ['vocabCards'],
      expectedText: 'evidence /evɪdəns/ noun；证据；Use evidence.；名词',
    },
    {
      name: 'biology structure',
      kind: 'biology',
      slots: {
        structureCallouts: '肺泡|气体交换|呼吸系统\n毛细血管|运输气体|循环系统',
      },
      rawKeys: ['structureCallouts'],
      expectedText: '呼吸系统；肺泡：气体交换',
    },
    {
      name: 'optics',
      kind: 'optics',
      slots: {
        opticsScene: 'scene|refraction\nn1|1\nn2|1.5\ntheta1|30',
      },
      rawKeys: ['opticsScene'],
      expectedText: 'θ₁=30°',
    },
  ])('turns $name source serialization into renderer-matched content', ({ kind, slots, rawKeys, expectedText }) => {
    const course = courseClone()
    course.qualityStatus = 'draft'
    const scene = course.scenes[0]!
    delete scene.imageUrl
    scene.sceneType = 'concept-build'
    scene.contentSlots = { statement: '核心结论', example: '例子', ...slots }

    const contract = sceneContentContract(course, scene)
    expect(contract.specializedKind).toBe(kind)
    expect(contract.displayEntries.map(entry => entry.value)).toContain(expectedText)
    expect(contract.planningEntries).toEqual([])
    for (const key of rawKeys) {
      expect(contract.displayEntries.some(entry => entry.value === scene.contentSlots[key])).toBe(false)
    }
  })

  it('includes only the board lines actually rendered by the matrix contrast master', () => {
    const course = courseClone('contrast')
    course.qualityStatus = 'draft'
    const scene = course.scenes.find(item => item.sceneType === 'contrast')!
    delete scene.imageUrl
    scene.sceneTechnique = 'comparison-slider'
    scene.contentSlots = { misconception: '错误理解', correction: '正确解释' }
    scene.boardText = ['依据一', '依据二', '依据三', '不会上屏的第四条']
    routeToMaster(course, scene, 'contrast', 5)

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.value)).toEqual(['错误理解'])
    expect(contract.revealEntries.map(entry => entry.value)).toEqual(['正确解释'])
    expect(contract.displaySummary).toBe('常见误区')
  })

  it('matches the matrix recap master instead of listing its hidden path', () => {
    const course = courseClone('recap')
    const scene = course.scenes.find(item => item.sceneType === 'recap')!
    delete scene.imageUrl
    scene.infoShape = 'progressive'
    scene.contentSlots = {
      path: '观察→解释→迁移',
      takeaway: '用证据修正原有解释',
      serialHook: '下一次继续追问证据边界',
    }
    scene.boardText = ['板书一', '板书二', '板书三', '板书四']
    routeToMaster(course, scene, 'recap', 5)

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual([
      'takeaway', 'serialHook', 'boardText.0', 'boardText.1', 'boardText.2', 'boardText.3',
    ])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['path'])
    expect(contract.displaySummary).toBe('核心收获、下集预告、确认板书')
  })

  it('does not claim that triptych panel titles are visible when the renderer omits them', () => {
    const course = courseClone('visual-observation')
    course.qualityStatus = 'draft'
    const scene = course.scenes.find(item => item.sceneType === 'visual-observation')!
    delete scene.imageUrl
    scene.visualLayout = 'three-panel'
    scene.sceneTechnique = 'layered-reveal'
    scene.contentSlots = {
      panelATitle: '标题一', panelA: '说明一',
      panelBTitle: '标题二', panelB: '说明二',
      panelCTitle: '标题三', panelC: '说明三',
    }

    const contract = sceneContentContract(course, scene)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['panelA', 'panelB', 'panelC'])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['panelATitle', 'panelBTitle', 'panelCTitle'])
  })

  it('reports the confirmed board while an approved image page is still generating', () => {
    const course = courseClone('visual-observation')
    course.qualityStatus = 'passed'
    const scene = course.scenes.find(item => item.sceneType === 'visual-observation')!
    delete scene.imageUrl
    scene.contentSlots = { panelA: '规划说明，不直接上屏' }
    scene.boardText = ['等待配图时显示的确认板书']

    const contract = sceneContentContract(course, scene)
    expect(contract.hasImage).toBe(false)
    expect(contract.displayEntries.map(entry => entry.key)).toEqual(['boardText.0'])
    expect(contract.planningEntries.map(entry => entry.key)).toEqual(['panelA'])
    expect(contract.displaySummary).toBe('配图生成中、确认板书')
  })
})

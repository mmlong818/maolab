const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = path.resolve(__dirname, '../../data/maolab.db')
const BACKUP_DIR = path.resolve(__dirname, '../../data/backups')
const COURSE_COUNT = 112
const TEACHER_ID = 'teacher-longlaoshi'

const TOPICS = [
  t('初中物理', 'middle', '初中', '八年级', '速度的物理意义', '速度描述物体运动快慢，公式 $v=\\frac{s}{t}$ 中，$v$ 表示单位时间内通过的路程。', '人步行约 $1.1\\text{ m/s}$，表示每秒前进约 1.1 米。', '把速度理解成“走得远”而忽略时间。', '$v=\\frac{s}{t}$'),
  t('初中物理', 'middle', '初中', '八年级', '声音的产生与传播', '声音由物体振动产生，传播需要介质，真空不能传声。', '敲桌面时手能感到振动，耳朵能听到声音。', '以为只要有声源，声音就一定能传播。', ''),
  t('初中物理', 'middle', '初中', '八年级', '光的反射定律', '反射时反射角等于入射角，入射光线、反射光线和法线在同一平面内。', '照镜子能看到自己，是光按反射规律进入眼睛。', '把镜面当作发光物体。', ''),
  t('初中物理', 'middle', '初中', '八年级', '密度的概念', '密度表示单位体积物质的质量，公式 $\\rho=\\frac{m}{V}$。', '同样大小的铁块比木块重，是因为铁的密度更大。', '把密度和总质量混为一谈。', '$\\rho=\\frac{m}{V}$'),
  t('初中数学', 'middle', '初中', '七年级', '一次函数图像', '一次函数 $y=kx+b$ 的图像是一条直线，$k$ 决定倾斜方向，$b$ 决定与纵轴交点。', '出租车费用可以写成“起步价 + 每公里费用”。', '只记直线形状，不会解释 $k$ 和 $b$。', '$y=kx+b$'),
  t('初中数学', 'middle', '初中', '七年级', '有理数加减', '有理数加减要先判断方向和符号，再处理绝对值。', '温度从 -3 度上升 5 度，结果是 2 度。', '把负号当成普通减号。', ''),
  t('初中数学', 'middle', '初中', '七年级', '角平分线', '角平分线把一个角分成两个相等的角，线上点到角两边距离相等。', '折纸让角的两边重合，折痕就是角平分线。', '只看图像居中，不检验相等关系。', ''),
  t('初中数学', 'middle', '初中', '七年级', '方程的等量关系', '方程用未知数表达题目中的相等关系，解方程就是找到让等式成立的值。', '3 支笔一共 12 元，可以写成 $3x=12$。', '先算答案，再硬凑方程。', '$3x=12$'),
  t('小学数学', 'primary', '小学', '五年级', '分数的意义', '分数表示把整体平均分后取其中若干份，关键是“同一个整体”和“平均分”。', '一个披萨平均分成 4 份，吃 1 份就是 $\\frac{1}{4}$。', '把没有平均分的份数也当成分数。', '$\\frac{1}{4}$'),
  t('小学数学', 'primary', '小学', '五年级', '小数乘法', '小数乘法先按整数乘，再根据因数的小数位数确定积的小数位数。', '0.8 元的贴纸买 3 张，共 2.4 元。', '只移动小数点，不理解数量意义。', '$0.8\\times3=2.4$'),
  t('小学数学', 'primary', '小学', '五年级', '长方体体积', '长方体体积等于长、宽、高的乘积，表示空间中能装下多少单位体积。', '长 4、宽 3、高 2 的盒子体积是 24。', '把表面积和体积混在一起。', '$V=abh$'),
  t('小学数学', 'primary', '小学', '五年级', '平均数', '平均数表示一组数据的整体水平，可理解为把总量平均分。', '三天读书 10、20、30 页，平均每天读 20 页。', '把平均数当作每个数据都必须等于它。', ''),
  t('初中化学', 'middle', '初中', '九年级', '质量守恒定律', '化学反应前后原子的种类和数目不变，因此总质量守恒。', '铁生锈质量变大，是因为氧气也参加了反应。', '只比较固体质量，忽略气体参加反应。', ''),
  t('初中化学', 'middle', '初中', '九年级', '溶液浓度', '溶质质量分数表示溶质质量占溶液质量的比例。', '10 克盐溶进 90 克水，溶质质量分数是 10%。', '把溶剂质量当作分母。', '$w=\\frac{m_{溶质}}{m_{溶液}}$'),
  t('初中化学', 'middle', '初中', '九年级', '酸碱中和', '酸和碱反应生成盐和水，可用于调节酸碱性。', '胃酸过多时，弱碱性药物可以中和部分酸。', '把“中和”误解成任何两种液体混合。', ''),
  t('初中化学', 'middle', '初中', '九年级', '氧气的性质', '氧气能支持燃烧，但氧气本身不是可燃物。', '带火星木条在氧气中复燃，说明氧气支持燃烧。', '把支持燃烧误认为氧气会燃烧。', ''),
  t('初中生物', 'middle', '初中', '七年级', '细胞结构', '细胞膜、细胞质和细胞核分工合作，维持细胞生命活动。', '细胞核像资料室，保存遗传信息。', '把细胞器名称背熟但不知道功能。', ''),
  t('初中生物', 'middle', '初中', '七年级', '光合作用', '绿色植物利用光能，把二氧化碳和水转化为有机物并释放氧气。', '植物白天制造养分，离不开叶绿体和光。', '以为植物只从土壤里“吃”养分。', '$CO_2+H_2O\\rightarrow 有机物+O_2$'),
  t('初中生物', 'middle', '初中', '七年级', '消化与吸收', '消化把大分子食物分解成小分子，吸收让营养进入血液。', '米饭越嚼越甜，是淀粉开始被分解。', '把消化和吸收当成同一件事。', ''),
  t('初中生物', 'middle', '初中', '七年级', '生态系统', '生态系统由生物部分和非生物环境共同组成，物质循环、能量流动。', '草、兔、狼、阳光和土壤共同构成草原生态系统。', '只把动物植物看作生态系统。', ''),
  t('初中地理', 'middle', '初中', '七年级', '经纬网定位', '经线表示东西方向的位置关系，纬线表示南北方向的位置关系，经纬度共同定位。', '用经纬度可以像坐标一样确定城市位置。', '把经线和纬线作用记反。', ''),
  t('初中地理', 'middle', '初中', '七年级', '等高线地形图', '等高线越密坡度越陡，越稀坡度越缓，闭合形态可判断山峰和盆地。', '登山路线通常会避开等高线特别密的坡面。', '只看颜色，不读线距和数值。', ''),
  t('初中地理', 'middle', '初中', '七年级', '季风气候', '季风气候受海陆热力差异影响，风向和降水随季节明显变化。', '我国东部夏季多雨，与夏季风带来水汽有关。', '把季风简单理解成固定方向的风。', ''),
  t('初中地理', 'middle', '初中', '七年级', '河流流向判断', '河流一般从高处流向低处，可结合等高线弯曲方向判断上下游。', '地图上河流穿过等高线时，可以判断水往哪里流。', '只看河道形状，不看海拔变化。', ''),
  t('高中物理', 'high', '高中', '高一', '匀变速直线运动', '加速度恒定时，速度随时间均匀变化，位移与时间呈二次关系。', '汽车从静止起步，速度每秒增加 2 m/s。', '把速度变化快慢和速度大小混淆。', '$v=v_0+at$'),
  t('高中物理', 'high', '高中', '高一', '牛顿第二定律', '物体加速度与合外力成正比，与质量成反比，方向与合外力相同。', '同样推力下，空购物车比满购物车更容易加速。', '把力当成维持运动的原因。', '$F=ma$'),
  t('高中物理', 'high', '高中', '高一', '功和能', '力对物体做功会引起能量变化，功是能量转化的量度。', '把书举高，外力做功转化为重力势能。', '只看是否用力，不看位移方向。', '$W=Fs\\cos\\theta$'),
  t('高中物理', 'high', '高中', '高一', '电场强度', '电场强度描述电场对单位正电荷的作用力，反映电场本身的强弱和方向。', '试探电荷受力越大，该处电场越强。', '以为电场强度取决于试探电荷大小。', '$E=\\frac{F}{q}$'),
]

const VARIANTS = [
  { name: '基础理解', purpose: 'introduce', depth: 'understanding' },
  { name: '情境应用', purpose: 'reinforce', depth: 'application' },
  { name: '错因纠偏', purpose: 'remediation', depth: 'analysis' },
  { name: '复习巩固', purpose: 'review', depth: 'application' },
]

const BLUEPRINTS = [
  {
    key: 'concept-inquiry',
    label: '概念探究课',
    totalMinutes: 31,
    segments: [
      seg('socratic', '用问题打开概念', 0, ['single-example', 'single-question', 'single-claim']),
      seg('lecture', '定义和边界讲清楚', 0, ['image-caption', 'derivation-step']),
      seg('interactive', '当场判断是否理解', 1, ['dialogue-turn', 'single-question', 'worked-example', 'single-question']),
      seg('case-study', '把概念放回生活场景', 2, ['media-interlude', 'recap-bullet']),
    ],
  },
  {
    key: 'lab-demo',
    label: '实验演示课',
    totalMinutes: 34,
    segments: [
      seg('flipped', '先观察现象', 0, ['image-caption', 'single-question', 'dialogue-turn']),
      seg('case-study', '拆解实验变量', 1, ['demonstration', 'dialogue-turn', 'single-claim']),
      seg('interactive', '预测和验证', 1, ['single-question', 'worked-example', 'demonstration', 'single-question']),
      seg('lecture', '回到规律表达', 2, ['derivation-step']),
      seg('case-study', '迁移到新现象', 2, ['recap-bullet']),
    ],
  },
  {
    key: 'misconception-clinic',
    label: '错因门诊课',
    totalMinutes: 29,
    segments: [
      seg('interactive', '先暴露常见错误', 0, ['single-question', 'dialogue-turn']),
      seg('socratic', '追问错误从哪里来', 0, ['single-example', 'single-claim', 'image-caption', 'dialogue-turn']),
      seg('quest', '三步闯关纠偏', 1, ['single-question', 'worked-example', 'single-question']),
      seg('case-study', '学生自己总结', 2, ['media-interlude', 'recap-bullet']),
    ],
  },
  {
    key: 'formula-workshop',
    label: '公式工坊课',
    totalMinutes: 36,
    segments: [
      seg('lecture', '先给公式使用条件', 0, ['single-claim', 'derivation-step', 'image-caption', 'single-question']),
      seg('interactive', '变量逐个解释', 0, ['single-question', 'dialogue-turn']),
      seg('case-study', '完整例题走一遍', 1, ['worked-example', 'worked-example', 'image-caption']),
      seg('quest', '换情境迁移', 2, ['single-question', 'demonstration']),
      seg('lecture', '公式使用清单', 2, ['recap-bullet']),
    ],
  },
  {
    key: 'review-quest',
    label: '复习闯关课',
    totalMinutes: 28,
    segments: [
      seg('quest', '第一关：认概念和辨例子', 0, ['single-question', 'single-claim', 'single-example', 'image-caption']),
      seg('interactive', '第二关：做判断', 1, ['single-question', 'dialogue-turn', 'worked-example', 'single-question']),
      seg('socratic', '最后用口诀收束', 2, ['media-interlude', 'recap-bullet']),
    ],
  },
  {
    key: 'story-case',
    label: '案例研讨课',
    totalMinutes: 33,
    segments: [
      seg('case-study', '一个真实案例开场', 0, ['single-example', 'image-caption', 'dialogue-turn', 'single-question']),
      seg('socratic', '从案例抽出概念', 0, ['single-question', 'single-claim']),
      seg('interactive', '学生尝试解释', 1, ['worked-example', 'single-question', 'demonstration']),
      seg('case-study', '漫画复盘案例', 2, ['media-interlude', 'single-question', 'recap-bullet']),
    ],
  },
  {
    key: 'map-compare',
    label: '结构比较课',
    totalMinutes: 32,
    segments: [
      seg('lecture', '先画知识地图', 0, ['image-caption', 'single-claim']),
      seg('socratic', '比较相似概念', 0, ['dialogue-turn', 'single-question', 'single-claim']),
      seg('interactive', '用反例拆误区', 1, ['single-example', 'single-question', 'worked-example']),
      seg('case-study', '形成可迁移判断表', 2, ['demonstration', 'media-interlude']),
      seg('lecture', '输出判断清单', 2, ['single-question', 'recap-bullet']),
    ],
  },
]

function t(subject, stage, stageCn, grade, topic, summary, example, misconception, formula) {
  return { subject, stage, stageCn, grade, topic, summary, example, misconception, formula }
}

function seg(method, title, objectiveIndex, atomTypes) {
  return { method, title, objectiveIndex, atomTypes }
}

function dataSvg(title, subtitle, tone = 'blue') {
  const palette = {
    blue: ['#eff6ff', '#1d4ed8'],
    green: ['#ecfdf5', '#047857'],
    warm: ['#fff7ed', '#9a3412'],
    slate: ['#f8fafc', '#334155'],
    rose: ['#fff1f2', '#be123c'],
    violet: ['#f5f3ff', '#6d28d9'],
  }[tone] ?? ['#eff6ff', '#1d4ed8']
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<rect width="1280" height="720" rx="32" fill="${palette[0]}"/>
<rect x="72" y="64" width="1136" height="592" rx="28" fill="#ffffff" stroke="${palette[1]}" stroke-width="5"/>
<path d="M116 510 C300 420 420 610 610 500 S930 360 1160 500" fill="none" stroke="${palette[1]}" stroke-width="10" opacity=".18"/>
<circle cx="184" cy="162" r="48" fill="${palette[1]}" opacity=".13"/>
<circle cx="1084" cy="174" r="34" fill="${palette[1]}" opacity=".18"/>
<text x="128" y="286" font-family="Microsoft YaHei, Arial" font-size="66" font-weight="800" fill="#111827">${escapeXml(short(title, 18))}</text>
<text x="128" y="388" font-family="Microsoft YaHei, Arial" font-size="36" fill="#374151">${escapeXml(short(subtitle, 34))}</text>
<text x="128" y="514" font-family="Microsoft YaHei, Arial" font-size="28" font-weight="700" fill="${palette[1]}">完整课程画面</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function short(value, max) {
  const s = String(value)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function pick(index) {
  return {
    topic: TOPICS[index % TOPICS.length],
    variant: VARIANTS[Math.floor(index / TOPICS.length) % VARIANTS.length],
    blueprint: BLUEPRINTS[index % BLUEPRINTS.length],
  }
}

function atomBase(courseId, segmentId, lineId, objectiveIds, sourceLeafId) {
  return {
    rundownSegmentId: segmentId,
    scriptLineId: lineId,
    objectiveIds,
    skippable: false,
    meta: { generatedAt: Date.now(), revision: 1 },
    sourceLeafId,
  }
}

function makeAtom(type, ctx) {
  const { courseId, atomIndex, topic, variant, segment, objectiveId, sourceLeafId, nodeId } = ctx
  const id = `${courseId}-atom-${String(atomIndex).padStart(2, '0')}`
  const base = atomBase(courseId, segment.id, `${courseId}-line-${String(atomIndex).padStart(2, '0')}`, [objectiveId], sourceLeafId)
  const tone = ['blue', 'green', 'warm', 'slate', 'rose', 'violet'][atomIndex % 6]

  if (type === 'single-example') {
    return {
      id, type, ...base,
      payload: {
        title: `${topic.topic}：先看一个真实场景`,
        body: `${topic.example}\n这不是装饰性的例子，它负责回答“这个概念到底在描述什么”。`,
        studentVisible: `${topic.example}\n请先说出这里的对象、变化和判断依据。`,
        teacherNote: `追问学生：如果把场景里的条件换掉，${topic.topic} 的判断会不会变？`,
      },
    }
  }
  if (type === 'single-claim') {
    return {
      id, type, ...base,
      payload: {
        claim: topic.summary,
        support: `${variant.name}课型下，本页只保留一个核心判断：先讲清定义，再进入应用。`,
      },
    }
  }
  if (type === 'image-caption') {
    return {
      id, type, ...base,
      payload: {
        imageUrl: dataSvg(topic.topic, topic.example, tone),
        imageAlt: `${topic.topic} 的课堂结构图`,
        caption: `图中只保留一个关系：${topic.example}`,
        studentCaption: `看图时只问一件事：它怎样体现“${topic.topic}”？`,
        imagePrompt: `课堂白板结构图，主题 ${topic.topic}，强调一个真实情境和一个判断箭头。`,
      },
    }
  }
  if (type === 'single-question') {
    const isMisconception = atomIndex % 2 === 0
    return {
      id, type, ...base,
      payload: {
        stem: isMisconception ? `下面哪句话最容易暴露“${topic.topic}”的误区？` : `学完这一页，哪句话最符合“${topic.topic}”？`,
        kind: 'mcq',
        options: isMisconception
          ? [topic.misconception, topic.summary, '先找定义，再判断例子是否对应。', '把题目条件逐项圈出来。']
          : [topic.summary, topic.misconception, '只要背关键词就能解决所有题。', '例子和定义可以互相替代。'],
        answer: isMisconception ? 0 : 0,
        onCorrect: isMisconception ? '对，这就是本节要拆掉的常见误区。' : '对，答案必须回到定义本身。',
        onIncorrect: `先停一下：${topic.misconception} 这类说法为什么不严谨？`,
        allowRetry: true,
      },
    }
  }
  if (type === 'dialogue-turn') {
    const teacher = atomIndex % 3 === 0
    return {
      id, type, ...base,
      payload: {
        speaker: teacher ? 'teacher' : 'student',
        line: teacher
          ? `别急着套结论。先说：${topic.topic} 描述的对象是什么？判断依据是什么？`
          : `我以前会犯的错是：${topic.misconception} 现在我得回到定义。`,
        pausesForStudent: !teacher,
      },
    }
  }
  if (type === 'derivation-step') {
    return {
      id, type, ...base,
      payload: {
        motivation: `为了避免“会背不会用”，这一页把 ${topic.topic} 的判断过程写成可检查的步骤。`,
        expression: topic.formula || '$\\text{现象}\\rightarrow\\text{条件}\\rightarrow\\text{判断}$',
        justification: `公式或逻辑链只在边界条件成立时使用。本课边界：${topic.summary}`,
      },
    }
  }
  if (type === 'demonstration') {
    return {
      id, type, ...base,
      payload: {
        medium: 'diagram',
        src: `diagram://${courseId}/${nodeId}`,
        narration: `演示分三步：先固定一个条件，再改变一个条件，最后观察“${topic.topic}”的判断是否变化。`,
        imageUrl: dataSvg(`演示：${topic.topic}`, '固定条件 → 改变条件 → 观察结果', tone),
      },
    }
  }
  if (type === 'worked-example') {
    return {
      id, type, ...base,
      payload: {
        problemStatement: `用“${topic.topic}”解释：${topic.example}`,
        steps: [
          { stepNum: 1, action: '圈出题目中的对象和条件。', explanation: '先确定讨论对象，避免乱套概念。' },
          { stepNum: 2, action: `对照定义：${short(topic.summary, 34)}`, explanation: '定义是判断依据，不是背诵材料。' },
          { stepNum: 3, action: `排除误区：${topic.misconception}`, explanation: '说明为什么错误说法站不住。' },
          { stepNum: 4, action: '用一句完整话作答。', explanation: '答案必须包含依据。' },
        ],
        conclusion: `所以，这道题考的不是记忆，而是能否把“${topic.topic}”放回具体条件中。`,
      },
    }
  }
  if (type === 'media-interlude') {
    const useSong = (courseId.charCodeAt(courseId.length - 1) + atomIndex) % 3 === 0
    return {
      id, type, ...base,
      payload: {
        title: useSong ? `${topic.topic} 口诀` : `${topic.topic} 复盘漫画`,
        kpIds: [`${courseId}-kp-core`],
        media: useSong ? {
          kind: 'song',
          genre: topic.stage === 'primary' ? '儿歌口诀' : '课堂口诀',
          lines: [
            { text: `${topic.topic}，先定义，`, kpHint: topic.topic },
            { text: '看对象，再看条件。', kpHint: '审题' },
            { text: `误区别踩：${short(topic.misconception, 18)}。`, kpHint: '错因' },
            { text: '例子能讲清，才算真理解。', kpHint: '迁移' },
          ],
          chorus: ['先定义，后应用；有依据，才说明。'],
        } : {
          kind: 'comic',
          protagonist: '学生小陈和老师',
          panels: [
            {
              scene: `学生看到 ${topic.topic} 题目，准备直接背结论。`,
              narration: '第一格：直觉先跑出来。',
              speech: { who: '学生', text: `我是不是记住“${short(topic.summary, 18)}”就行？` },
              kpHint: topic.topic,
              imageUrl: dataSvg('先暴露直觉', topic.misconception, 'warm'),
            },
            {
              scene: '老师把定义、条件和例子拆成三列。',
              narration: '第二格：用结构纠偏。',
              speech: { who: '老师', text: '定义是方向盘，例子只是路面。' },
              kpHint: '定义与例子',
              imageUrl: dataSvg('定义 / 条件 / 例子', topic.topic, 'green'),
            },
            {
              scene: '学生用自己的话重讲一遍，并指出原来的误区。',
              narration: '第三格：能复述才算完成。',
              speech: { who: '学生', text: `我知道了，不能${short(topic.misconception, 14)}。` },
              kpHint: '复述',
              imageUrl: dataSvg('自己讲出来', topic.example, 'blue'),
            },
          ],
        },
      },
    }
  }
  return {
    id, type: 'recap-bullet', ...base,
    payload: {
      bullet: `本节收束：${topic.topic} 不是一句背诵结论，而是一套能解释例子的判断方法。`,
      refObjectiveId: objectiveId,
    },
  }
}

function makeCourse(n) {
  const index = n - 1
  const { topic, variant, blueprint } = pick(index)
  const id = `realcheck-${String(n).padStart(3, '0')}`
  const now = Date.now() + n
  const title = `真检课程 ${String(n).padStart(3, '0')} · ${topic.subject} · ${topic.topic}（${variant.name} · ${blueprint.label}）`
  const sourceLeafId = `${id}-leaf`
  const objectiveIds = [`${id}-obj-1`, `${id}-obj-2`, `${id}-obj-3`]
  const segmentModels = blueprint.segments.map((s, i) => ({ ...s, id: `${id}-seg-${i + 1}`, order: i + 1 }))

  let atomIndex = 0
  const rundownSegments = []
  const atoms = []
  for (const segment of segmentModels) {
    const nodes = []
    for (const atomType of segment.atomTypes) {
      atomIndex += 1
      const node = {
        id: `${id}-node-${String(atomIndex).padStart(2, '0')}`,
        order: nodes.length + 1,
        role: roleFor(atomType, nodes.length),
        expectedAtomType: atomType,
        brief: briefFor(atomType, topic, segment.title),
        objectiveIds: [objectiveIds[segment.objectiveIndex]],
        scaffolding: {
          mustMention: [topic.topic, short(topic.summary, 22)],
          mustAvoid: [topic.misconception, '一页塞入多个新概念'],
          materialRefs: [`${topic.subject}-${topic.grade}-${topic.topic}`],
        },
        interaction: interactionFor(atomType, topic),
        estimatedSeconds: secondsFor(atomType),
        sourceLeafId,
        mediaKind: atomType === 'media-interlude' ? (((n + atomIndex) % 3 === 0) ? 'song' : 'comic') : undefined,
      }
      nodes.push(node)
      atoms.push(makeAtom(atomType, {
        courseId: id,
        atomIndex,
        topic,
        variant,
        blueprint,
        segment,
        objectiveId: objectiveIds[segment.objectiveIndex],
        sourceLeafId,
        nodeId: node.id,
      }))
    }
    rundownSegments.push({ id: segment.id, method: segment.method, nodes })
  }

  const scriptDocs = Object.fromEntries(segmentModels.map(segment => {
    const segNodes = rundownSegments.find(s => s.id === segment.id).nodes
    const segAtoms = atoms.filter(atom => atom.rundownSegmentId === segment.id)
    const lines = segNodes.map((node, i) => ({
      id: segAtoms[i]?.scriptLineId ?? `${id}-line-${segment.order}-${i + 1}`,
      text: `这一段是“${segment.title}”。第 ${i + 1} 页要完成：${node.brief}。讲的时候要点名误区“${topic.misconception}”，再把学生拉回定义。`,
      nodeId: node.id,
      pauseAfterSec: node.interaction.hasInteraction ? 4 : 1,
      speaker: 'teacher',
    }))
    return [segment.id, {
      outlineItemId: segment.id,
      teachingModeId: segment.method,
      teacherId: TEACHER_ID,
      lines,
      estimatedDurationSec: lines.reduce((sum, line) => sum + Math.ceil(line.text.length / 4) + (line.pauseAfterSec ?? 0), 0),
      feedback: {
        correctDefaults: ['这个判断有依据。', '你已经把定义和例子连起来了。'],
        incorrectDefaults: [`先别急，检查是不是掉进了这个误区：${topic.misconception}`, '回到定义，再重新看题目条件。'],
        llmEnhance: false,
      },
    }]
  }))

  const narrations = Object.fromEntries(atoms.map(atom => [atom.id, narrationFor(atom, topic)]))
  const selfNarrations = Object.fromEntries(atoms.map(atom => [atom.id, selfNarrationFor(atom, topic)]))

  return {
    id,
    title,
    origin: 'one-line',
    rawInput: { text: `${topic.subject}${topic.grade}：${topic.topic}。${topic.summary}`, materials: [] },
    status: 'ready',
    textbookSource: {
      textbookId: `realcheck-textbook-${topic.subject}`,
      textbookTitle: `${topic.subject}真实检查课程库`,
      stage: topic.stageCn,
      subject: topic.subject,
      version: '真检生成版',
      grade: topic.grade,
      volume: '上册',
      chapterId: `${id}-chapter`,
      chapterTitle: topic.topic,
      sectionId: sourceLeafId,
      sectionTitle: `${variant.name} · ${blueprint.label}`,
    },
    materialAudit: {
      coverage: [{ topic: topic.topic, evidence: topic.example }],
      gaps: [],
      boundaries: { include: [topic.topic, '定义边界', '典型例子', '常见误区'], exclude: ['竞赛拓展', '跨章节压轴综合题'] },
      proposedObjectives: [
        { id: objectiveIds[0], statement: `说清“${topic.topic}”的定义和边界。`, rationale: '真实课堂必须先保证概念不偏。', selected: true },
        { id: objectiveIds[1], statement: `能用例子解释“${topic.topic}”。`, rationale: '从会背走向会用。', selected: true },
        { id: objectiveIds[2], statement: `能识别并修正常见误区：${topic.misconception}`, rationale: '防止低质量完成。', selected: true },
      ],
      keywords: [topic.topic, topic.subject, variant.name, blueprint.label],
      materialAnalysis: {
        status: 'complete',
        coreQuestion: `学生如何从“记住 ${topic.topic}”走向“会解释和会判断”？`,
        logic: '情境进入，定义校准，例题验证，误区回收。',
        knowledgeMap: [{ concept: topic.topic, children: ['定义', '例子', '误区', '迁移判断'] }],
      },
      studentSituation: {
        priorKnowledge: ['能阅读短题干', '能参与一轮课堂问答'],
        pitfalls: [{ pitfall: topic.misconception, whyHappens: '学生只记表面关键词，没有检查概念边界。', fix: '用反例和步骤化判断纠偏。', severity: 'critical' }],
      },
      generatedAt: now,
    },
    teachingPlan: {
      id,
      topic: topic.topic,
      hasReferenceMaterial: true,
      audience: {
        stage: topic.stage,
        grade: topic.grade,
        priorKnowledge: ['基本课堂阅读能力', '能跟随一步到两步推理'],
        knownGaps: [topic.misconception, '把例子当定义'],
        learningStyle: `${blueprint.label}：先让学生看见问题，再给出结构化解释。`,
      },
      knowledgeBoundary: {
        inScope: [topic.topic, '基础定义', '典型例子', '常见误区'],
        outOfScope: ['竞赛题', '跨章节压轴题'],
        adjacent: ['生活情境', '基础审题', '课堂复述'],
      },
      knowledgeSummary: topic.summary,
      knowledgeVision: `本课把“${topic.topic}”从孤立知识点变成可解释、可判断、可复述的一套方法。`,
      depth: variant.depth,
      purpose: variant.purpose,
      objectives: [
        { id: objectiveIds[0], statement: `能准确说出“${topic.topic}”的含义。`, bloomLevel: 'L2-Understand', successCriteria: '不用背诵腔，能指出讨论对象和边界。' },
        { id: objectiveIds[1], statement: `能把“${topic.topic}”用于一个具体例子。`, bloomLevel: 'L3-Apply', successCriteria: '解释中包含题目条件和判断依据。' },
        { id: objectiveIds[2], statement: `能识别并修正误区：${topic.misconception}`, bloomLevel: 'L4-Analyze', successCriteria: '能说明错误为什么错。' },
      ],
      sourceLeafId,
      meta: { generatedAt: now, approvedAt: now, editedByUser: false, revision: 2 },
    },
    methodPlan: {
      id,
      segments: segmentModels.map(s => ({
        id: s.id,
        order: s.order,
        objectiveIds: [objectiveIds[s.objectiveIndex]],
        title: s.title,
        method: s.method,
        rationale: rationaleFor(s.method, blueprint.label, topic.topic),
        estimatedMinutes: Math.max(6, Math.round(blueprint.totalMinutes / segmentModels.length)),
      })),
      overallStrategy: `${blueprint.label}：${segmentModels.map(s => s.title).join(' → ')}。`,
      totalMinutes: blueprint.totalMinutes,
      meta: { generatedAt: now, approvedAt: now, editedByUser: false, revision: 2 },
    },
    rundown: {
      id,
      segments: rundownSegments,
      globalNotes: {
        pacing: topic.stage === 'primary' ? 'slow' : 'comfortable',
        tone: topic.stage === 'high' ? 'rigorous' : 'friendly',
        constraints: ['每页只承载一个语义单元', '所有互动必须回收误区', '不要出现未生成内容'],
      },
      meta: { generatedAt: now, approvedAt: now, editedByUser: false, revision: 2 },
    },
    showScript: makeShowScript(id, topic, segmentModels, rundownSegments, now),
    scriptDocs,
    atoms,
    atomGenWarnings: [],
    atomQAWarnings: [],
    atomReuseLog: [],
    atomReuseRejectedCount: 0,
    selectedTeacherId: TEACHER_ID,
    narrations,
    narrationsTeacherId: TEACHER_ID,
    selfNarrations,
    selfNarrationsTeacherId: TEACHER_ID,
    payloadOverrides: {},
    payloadOverridesTeacherId: TEACHER_ID,
    knowledgePointIds: [`${id}-kp-core`],
    mediaForms: [],
    createdAt: now,
    updatedAt: now,
  }
}

function roleFor(type, orderInSegment) {
  if (orderInSegment === 0) return type === 'single-question' ? 'activate' : 'hook'
  if (type === 'single-question') return 'probe'
  if (type === 'worked-example') return 'practice'
  if (type === 'media-interlude') return 'synthesize'
  if (type === 'recap-bullet') return 'recap'
  if (type === 'derivation-step') return 'develop'
  if (type === 'image-caption' || type === 'demonstration') return 'illustrate'
  return 'introduce'
}

function briefFor(type, topic, segmentTitle) {
  const map = {
    'single-example': `用具体例子进入“${topic.topic}”`,
    'single-claim': `给出“${topic.topic}”的核心判断`,
    'image-caption': `把“${topic.topic}”画成一张可读图`,
    'single-question': `检查学生是否避开误区：${topic.misconception}`,
    'dialogue-turn': `用师生对话暴露真实疑问`,
    'derivation-step': `把公式或判断链写成一步`,
    'demonstration': `演示条件变化如何影响判断`,
    'worked-example': `完整解决一个例题`,
    'media-interlude': `用口诀或漫画复盘`,
    'recap-bullet': `收束为一句可复述的话`,
  }
  return `${segmentTitle}：${map[type] ?? type}`
}

function interactionFor(type, topic) {
  if (type !== 'single-question' && type !== 'dialogue-turn') return { hasInteraction: false }
  return {
    hasInteraction: true,
    prompt: `请判断这句话是否有问题：“${topic.misconception}”`,
    onCorrect: 'extend',
    onIncorrect: 'hint',
    maxRetries: 2,
  }
}

function secondsFor(type) {
  return {
    'single-question': 95,
    'worked-example': 130,
    'media-interlude': 120,
    'demonstration': 110,
    'derivation-step': 100,
  }[type] ?? 75
}

function rationaleFor(method, label, topic) {
  const map = {
    lecture: `用于把“${topic}”的定义和边界一次讲准。`,
    interactive: `用于即时发现学生是否真的理解“${topic}”。`,
    socratic: `用于让学生先说直觉，再被问题推向定义。`,
    flipped: `用于先观察或试错，再回到规律。`,
    'case-study': `用于把“${topic}”放进完整情境里讨论。`,
    quest: `用于把复习拆成明确闯关任务。`,
  }
  return `${label}中采用该方法：${map[method]}`
}

function narrationFor(atom, topic) {
  const p = atom.payload
  if (atom.type === 'single-question') return `这一页不要急着选答案，先找有没有掉进误区：“${topic.misconception}”。`
  if (atom.type === 'worked-example') return `这一页按步骤走。重点是每一步都能回到“${topic.topic}”的定义，而不是只看最后答案。`
  if (atom.type === 'media-interlude') return `这一页用媒体方式复盘，把定义、例子和误区重新连成一条线。`
  if (atom.type === 'derivation-step') return `这一页讲公式或判断链。请特别注意它的使用条件。`
  return `这一页讲“${topic.topic}”：${short(p.claim || p.title || p.caption || p.bullet || topic.summary, 60)}`
}

function selfNarrationFor(atom, topic) {
  if (atom.type === 'single-question') return `先自己判断，再看选项。只要你能说出为什么错，就说明你在理解。`
  if (atom.type === 'media-interlude') return `看完这一页后，尝试不用原话复述“${topic.topic}”。`
  return `读这一页时，问自己：它和“${topic.topic}”的定义有什么关系？`
}

function makeShowScript(id, topic, segmentModels, rundownSegments, now) {
  const events = segmentModels.map((segment, i) => {
    const node = rundownSegments[i].nodes[Math.min(1, rundownSegments[i].nodes.length - 1)]
    return {
      id: `${id}-event-${i + 1}`,
      type: i === 0 ? 'key-question' : i === segmentModels.length - 1 ? 'summarize' : 'misconception',
      actorId: i === 0 ? 'student-thinker' : i === segmentModels.length - 1 ? 'student-steady' : 'teacher',
      atNodeId: node.id,
      intent: i === 0 ? '让学生把真实疑问说出口。' : i === segmentModels.length - 1 ? '让学生完成结尾复述。' : `回收误区：${topic.misconception}`,
      payoff: i > 0 && i < segmentModels.length - 1 ? '用定义和例子修正。' : undefined,
    }
  })
  return {
    id,
    cast: [
      { studentId: 'student-thinker', studentName: '小陈', dramaticRole: 'questioner', arc: `从困惑“${topic.topic}”是什么，到能问出条件边界。` },
      { studentId: 'student-steady', studentName: '小美', dramaticRole: 'summarizer', arc: `把“${topic.topic}”整理成可复述的步骤。` },
    ],
    arcSummary: `围绕“${topic.topic}”，从直觉错误走向定义、例子和迁移判断。`,
    segments: segmentModels.map((segment, i) => ({
      segmentId: segment.id,
      dramaticFunction: i === 0 ? 'setup' : i === segmentModels.length - 1 ? 'resolution' : 'rising',
      paceNote: i === 0 ? '开场要快速暴露问题。' : i === segmentModels.length - 1 ? '结尾必须由学生复述。' : '中段要持续回收误区。',
      events: [events[i]],
    })),
    meta: { generatedAt: now, approvedAt: now, editedByUser: false, revision: 2 },
  }
}

async function main() {
  if (process.env.ALLOW_LEGACY_SEED_REALCHECK !== '1') {
    console.error('[disabled] seed-realcheck-courses is quarantined because it creates artificial uniform validation data. Use live-generated courses after the correct flow passes real-world checks.')
    process.exitCode = 1
    return
  }

  if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`)
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const backupPath = path.join(BACKUP_DIR, `maolab-before-varied-realcheck-${stamp}.db`)
  const db = new Database(DB_PATH)
  await db.backup(backupPath)

  const oldIds = db.prepare('select id from courses_v2').all().map(row => row.id)
  const courses = Array.from({ length: COURSE_COUNT }, (_, i) => makeCourse(i + 1))
  const insertCourse = db.prepare(`
    insert into courses_v2 (id, title, origin, status, data, created_at, updated_at)
    values (@id, @title, @origin, @status, @data, @created_at, @updated_at)
  `)

  db.transaction(() => {
    if (oldIds.length > 0) {
      const placeholders = oldIds.map(() => '?').join(',')
      db.prepare(`delete from student_responses where course_id in (${placeholders})`).run(...oldIds)
      db.prepare(`delete from atom_by_kp where course_id in (${placeholders})`).run(...oldIds)
    }
    db.prepare('delete from courses_v2').run()

    for (const course of courses) {
      insertCourse.run({
        id: course.id,
        title: course.title,
        origin: course.origin,
        status: course.status,
        data: JSON.stringify(course),
        created_at: course.createdAt,
        updated_at: course.updatedAt,
      })
    }
  })()

  const rows = db.prepare('select data from courses_v2').all().map(r => JSON.parse(r.data))
  const structureSignatures = new Set(rows.map(c => `${c.methodPlan.segments.map(s => s.method).join('>')}|${c.atoms.map(a => a.type).join('>')}`))
  const stats = {
    backupPath,
    oldCount: oldIds.length,
    inserted: rows.length,
    readyCount: rows.filter(c => c.status === 'ready').length,
    uniqueTitles: new Set(rows.map(c => c.title)).size,
    structurePatterns: structureSignatures.size,
    atomCounts: Array.from(new Set(rows.map(c => c.atoms.length))).sort((a, b) => a - b),
    segmentCounts: Array.from(new Set(rows.map(c => c.methodPlan.segments.length))).sort((a, b) => a - b),
    mediaCourses: rows.filter(c => c.atoms.some(a => a.type === 'media-interlude')).length,
    demonstrationCourses: rows.filter(c => c.atoms.some(a => a.type === 'demonstration')).length,
    sample: rows.slice(0, 3).map(c => ({
      id: c.id,
      title: c.title,
      atoms: c.atoms.length,
      methods: c.methodPlan.segments.map(s => s.method),
      atomTypes: c.atoms.map(a => a.type),
    })),
  }
  db.close()
  console.log(JSON.stringify(stats, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})

const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

const BASE_URL = process.env.MAOLAB_BASE_URL || 'http://localhost:3000'
const DB_PATH = path.resolve(__dirname, '../../data/maolab.db')
const BACKUP_DIR = path.resolve(__dirname, '../../data/backups')
const LOG_PATH = process.env.REAL_FLOW_LOG || ''

const TOPICS = [
  ['初中物理', '速度的物理意义', '面向八年级学生。重点讲清速度不是单纯“走得远”，而是单位时间通过的路程。必须包含例子：人步行的速度约为 1.1 m/s，表示每秒前进约 1.1 米。'],
  ['初中物理', '声音的产生与传播', '面向八年级学生。讲清声音由振动产生，传播需要介质，真空不能传声。需要包含敲桌面、空气传播、月球真空三个情境。'],
  ['初中物理', '光的反射定律', '面向八年级学生。讲清入射角、反射角、法线，避免把镜子误认为光源。'],
  ['初中物理', '密度的概念', '面向八年级学生。讲清密度表示单位体积的质量，公式 rho=m/V，避免把密度和总质量混淆。'],
  ['初中数学', '一次函数图像', '面向七年级学生。讲清 y=kx+b 的图像是一条直线，k 影响倾斜方向，b 影响截距。用出租车计费作例子。'],
  ['初中数学', '有理数加减', '面向七年级学生。用温度变化、收入支出解释正负数加减，重点处理负号和减号的混淆。'],
  ['初中数学', '角平分线', '面向七年级学生。用折纸和到角两边距离相等解释角平分线，避免只凭视觉判断“看起来居中”。'],
  ['初中数学', '方程的等量关系', '面向七年级学生。用买笔、票价、人数分组等场景讲清如何把文字关系翻译成方程。'],
  ['小学数学', '分数的意义', '面向五年级学生。强调同一个整体、平均分、取其中几份。用披萨和纸条例子。'],
  ['小学数学', '小数乘法', '面向五年级学生。用买贴纸和长度缩放解释小数乘法，避免只机械移动小数点。'],
  ['小学数学', '长方体体积', '面向五年级学生。讲清体积是空间单位的堆叠，公式 V=长乘宽乘高，不要和表面积混淆。'],
  ['小学数学', '平均数', '面向五年级学生。讲清平均数是总量平均分，不能误解为每一个数据都等于平均数。'],
  ['初中化学', '质量守恒定律', '面向九年级学生。讲清化学反应前后原子种类和数目不变，包含铁生锈和气体参加反应的例子。'],
  ['初中化学', '溶液浓度', '面向九年级学生。讲清溶质质量分数，分母是溶液质量，不是溶剂质量。'],
  ['初中化学', '酸碱中和', '面向九年级学生。讲清酸和碱反应生成盐和水，用胃酸过多作生活例子。'],
  ['初中化学', '氧气的性质', '面向九年级学生。讲清氧气支持燃烧但本身不是可燃物，用带火星木条复燃实验。'],
  ['初中生物', '细胞结构', '面向七年级学生。讲清细胞膜、细胞质、细胞核的功能分工，用学校或城市类比但不能喧宾夺主。'],
  ['初中生物', '光合作用', '面向七年级学生。讲清植物利用光能把二氧化碳和水转化为有机物并释放氧气，纠正植物只从土壤吃养分的误区。'],
  ['初中生物', '消化与吸收', '面向七年级学生。讲清消化和吸收不是同一件事，用米饭越嚼越甜作例子。'],
  ['初中生物', '生态系统', '面向七年级学生。讲清生态系统包含生物和非生物环境，包含草、兔、狼、阳光、土壤的例子。'],
  ['初中地理', '经纬网定位', '面向七年级学生。讲清经线、纬线、经度、纬度共同定位，避免经纬线作用记反。'],
  ['初中地理', '等高线地形图', '面向七年级学生。讲清等高线疏密和坡度关系，能判断山峰、山谷、陡坡。'],
  ['初中地理', '季风气候', '面向七年级学生。讲清季风风向和降水随季节变化，用我国东部夏季多雨作例子。'],
  ['初中地理', '河流流向判断', '面向七年级学生。讲清河流从高处流向低处，结合等高线弯曲方向判断上下游。'],
  ['高中物理', '匀变速直线运动', '面向高一学生。讲清加速度恒定时速度均匀变化，包含 v=v0+at 和汽车起步例子。'],
  ['高中物理', '牛顿第二定律', '面向高一学生。讲清 F=ma、合外力、加速度方向，纠正力是维持运动原因的误区。'],
  ['高中物理', '功和能', '面向高一学生。讲清功是能量转化的量度，包含 W=Fs cos theta 和举书例子。'],
  ['高中物理', '电场强度', '面向高一学生。讲清 E=F/q 表示电场本身性质，不取决于试探电荷大小。'],
  ['小学科学', '月相变化', '面向四年级学生。讲清月相来自太阳、地球、月球相对位置变化，不是地球影子每天遮住月亮。'],
  ['小学科学', '水的三态变化', '面向四年级学生。讲清熔化、凝固、汽化、液化，用冰块、烧水、水杯外壁水珠作例子。'],
  ['初中语文', '说明文的说明顺序', '面向八年级学生。讲清时间顺序、空间顺序、逻辑顺序，结合一篇介绍校园建筑的短文。'],
  ['初中英语', '一般过去时', '面向七年级学生。讲清过去发生的动作和状态，包含 yesterday、last week，并处理动词过去式变化。'],
]

const VARIANTS = [
  '概念探究课',
  '实验演示课',
  '错因纠偏课',
  '公式工坊课',
  '复习闯关课',
  '案例研讨课',
  '结构比较课',
  '生活迁移课',
]

function log(message) {
  const line = typeof message === 'string' ? message : JSON.stringify(message)
  console.log(line)
  if (LOG_PATH) fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`, 'utf8')
}

function logError(message) {
  const line = typeof message === 'string' ? message : String(message)
  console.error(line)
  if (LOG_PATH) fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ERROR ${line}\n`, 'utf8')
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : fallback
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function postJson(url, body, method = 'POST', opts = {}) {
  const attempts = opts.attempts ?? 1
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await postJsonOnce(url, body, method)
    } catch (error) {
      lastError = error
      const msg = String(error.message || error)
      const retryable = /LLM HTTP (429|5\d\d)|HTTP (429|5\d\d)|fetch failed|ECONNRESET|ETIMEDOUT/.test(msg)
      if (!retryable || attempt === attempts) break
      const baseDelayMs = msg.includes('429') ? 120_000 : 25_000
      const delayMs = opts.retryDelayMs ?? Math.min(baseDelayMs * attempt, 300_000)
      log(`[retry] ${method} ${url} attempt=${attempt}/${attempts} after ${Math.round(delayMs / 1000)}s: ${msg}`)
      await sleep(delayMs)
    }
  }
  throw lastError
}

async function postJsonOnce(url, body, method = 'POST') {
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { text }
  }
  if (!res.ok) {
    const detail = json?.error || json?.text || text || `HTTP ${res.status}`
    throw new Error(`${method} ${url} failed: ${detail}`)
  }
  return json
}

async function postBinary(url, body, method = 'POST', opts = {}) {
  const attempts = opts.attempts ?? 1
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}${url}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const buf = Buffer.from(await res.arrayBuffer())
      if (!res.ok) {
        let detail = buf.toString('utf8')
        try {
          const json = JSON.parse(detail)
          detail = json?.detail || json?.error || detail
        } catch {
          // keep text detail
        }
        throw new Error(`${method} ${url} failed: ${detail || res.status}`)
      }
      return {
        bytes: buf.length,
        contentType: res.headers.get('content-type') || '',
      }
    } catch (error) {
      lastError = error
      const msg = String(error.message || error)
      const retryable = /video export failed|HTTP (429|5\d\d)|fetch failed|ECONNRESET|ETIMEDOUT/.test(msg)
      if (!retryable || attempt === attempts) break
      const delayMs = opts.retryDelayMs ?? Math.min(30_000 * attempt, 180_000)
      log(`[retry] ${method} ${url} attempt=${attempt}/${attempts} after ${Math.round(delayMs / 1000)}s: ${msg}`)
      await sleep(delayMs)
    }
  }
  throw lastError
}

async function getJson(url) {
  const res = await fetch(`${BASE_URL}${url}`, { headers: { accept: 'application/json' } })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { text }
  }
  if (!res.ok) throw new Error(`GET ${url} failed: ${json?.error || text || res.status}`)
  return json
}

async function waitFor(courseId, wanted, timeoutMs, label) {
  const start = Date.now()
  let lastStatus = ''
  while (Date.now() - start < timeoutMs) {
    const { course } = await getJson(`/api/v2/course-state/${courseId}`)
    if (course.status !== lastStatus) {
      log(`[${courseId}] ${label}: ${course.status} atoms=${course.atoms?.length || 0} scripts=${Object.keys(course.scriptDocs || {}).length}`)
      lastStatus = course.status
    }
    if (course.status === 'failed') throw new Error(`[${courseId}] failed: ${course.failureReason || 'unknown'}`)
    if (wanted.includes(course.status)) return course
    await sleep(4000)
  }
  throw new Error(`[${courseId}] timeout waiting for ${wanted.join('/')} during ${label}; last=${lastStatus}`)
}

async function backupAndClearCourses() {
  if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`)
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const backupPath = path.join(BACKUP_DIR, `maolab-before-real-flow-${stamp}.db`)
  await db.backup(backupPath)
  const oldIds = db.prepare('select id from courses_v2').all().map(row => row.id)
  db.transaction(() => {
    if (oldIds.length > 0) {
      const placeholders = oldIds.map(() => '?').join(',')
      db.prepare(`delete from student_responses where course_id in (${placeholders})`).run(...oldIds)
      db.prepare(`delete from atom_by_kp where course_id in (${placeholders})`).run(...oldIds)
    }
    db.prepare('delete from courses_v2').run()
  })()
  db.close()
  log({ backupPath, cleared: oldIds.length })
}

function makeRequest(i) {
  const [subject, topic, paragraph] = TOPICS[i % TOPICS.length]
  const variant = VARIANTS[i % VARIANTS.length]
  const cycle = Math.floor(i / TOPICS.length) + 1
  const number = String(i + 1).padStart(3, '0')
  return {
    topic: `真实流程 ${number} · ${subject} · ${topic} · ${variant} · 第${cycle}轮`,
    paragraph: [
      paragraph,
      `课型要求：${variant}。`,
      '必须让课程结构服务于这个具体课型，不要套同一个模板。',
      '必须生成讲稿、互动题、视觉演示或媒体内容，并能进入演讲模式和授课模式。',
      '如果涉及公式或单位，必须用学生能读懂的语言解释物理或数学意义。',
    ].join('\n'),
  }
}

async function approveRundown(courseId) {
  await postJson(`/api/v2/rundown/${courseId}`, {}, 'PATCH', { attempts: 3 })
  await waitFor(courseId, ['rundown-approved'], 60_000, 'rundown approve')
}

async function approveShowScript(courseId) {
  const show = await postJson(`/api/v2/showscript/${courseId}`, {}, 'POST', { attempts: 8 })
  if (show.showScript) {
    await postJson(`/api/v2/showscript/${courseId}`, { showScript: show.showScript, approve: true }, 'PUT', { attempts: 3 })
  }
  await waitFor(courseId, ['rundown-approved'], 20_000, 'show script')
}

async function exportVideo(courseId) {
  const exported = await postBinary(`/api/v2/export-video/${courseId}`, { teacherId: 'teacher-longlaoshi', mode: 'lecture' }, 'POST', { attempts: 3 })
  const publicPath = path.resolve(__dirname, '../public/generated-videos', `${courseId}.mp4`)
  if (!fs.existsSync(publicPath)) {
    throw new Error(`[${courseId}] video export missing: ${publicPath}`)
  }
  const stat = fs.statSync(publicPath)
  if (stat.size < 100_000) {
    throw new Error(`[${courseId}] video export too small: ${stat.size} bytes`)
  }
  log(`[video] ${courseId} bytes=${stat.size} response=${exported.bytes} path=${publicPath}`)
  return {
    videoPath: publicPath,
    videoBytes: stat.size,
    responseBytes: exported.bytes,
    contentType: exported.contentType,
  }
}

async function runOne(i) {
  const req = makeRequest(i)
  log(`[new] ${req.topic}`)
  const analyze = await postJson('/api/v2/analyze', req, 'POST', { attempts: 8 })
  const courseId = analyze.courseId
  await waitFor(courseId, ['plan-draft'], 15_000, 'analyze')

  await postJson(`/api/v2/plan/${courseId}/approve`, {}, 'POST', { attempts: 3 })
  await waitFor(courseId, ['plan-approved'], 20_000, 'plan approve')

  await postJson(`/api/v2/method-plan/${courseId}`, {}, 'POST', { attempts: 8 })
  await waitFor(courseId, ['method-draft'], 300_000, 'method plan')

  await postJson(`/api/v2/method-plan/${courseId}`, {}, 'PATCH', { attempts: 3 })
  let afterMethod = await waitFor(courseId, ['method-approved', 'rundown-drafting', 'rundown-draft'], 120_000, 'method approve')
  if (afterMethod.status === 'method-approved') {
    await sleep(12_000)
    afterMethod = await getJson(`/api/v2/course-state/${courseId}`).then(json => json.course)
  }
  if (afterMethod.status === 'method-approved') {
    try {
      await postJson(`/api/v2/rundown/${courseId}`, {}, 'POST', { attempts: 8 })
    } catch (error) {
      if (!String(error.message || error).includes('rundown generation already in progress')) throw error
      log(`[${courseId}] rundown already in progress; continue polling`)
    }
  }
  await waitFor(courseId, ['rundown-draft'], 480_000, 'rundown')

  await approveRundown(courseId)
  await approveShowScript(courseId)

  await postJson(`/api/v2/script-only/${courseId}`, {}, 'POST', { attempts: 8 })
  await waitFor(courseId, ['scripted'], 720_000, 'script')

  await postJson(`/api/v2/atoms-only/${courseId}`, {}, 'POST', { attempts: 8 })
  const ready = await waitFor(courseId, ['ready'], 1_500_000, 'atoms')
  await postJson('/api/v2/narrate', { courseId, teacherId: 'teacher-longlaoshi', mode: 'lecture', force: true }, 'POST', { attempts: 8 })
  await postJson(`/api/v2/repair-grounding/${courseId}`, { teacherId: 'teacher-longlaoshi' }, 'POST', { attempts: 3 })
  const finalCourse = await getJson(`/api/v2/course-state/${courseId}`).then(json => json.course)
  const atomCount = ready.atoms?.length || 0
  const scriptCount = Object.keys(finalCourse.scriptDocs || {}).length
  const narrationCount = Object.keys(finalCourse.narrations || {}).length
  if (atomCount < 20 || scriptCount < 3 || narrationCount !== atomCount) {
    throw new Error(`[${courseId}] incomplete output: atoms=${atomCount}, scripts=${scriptCount}, narrations=${narrationCount}`)
  }
  const video = await exportVideo(courseId)
  log(`[done] ${courseId} ready atoms=${atomCount} scripts=${scriptCount} narrations=${narrationCount} video=${video.videoBytes}`)
  return { courseId, title: finalCourse.title, atomCount, scriptCount, narrationCount, status: finalCourse.status, ...video }
}

async function main() {
  if (process.env.ALLOW_LEGACY_REAL_FLOW !== '1') {
    logError('[disabled] run-real-course-flow is quarantined because it uses legacy repair-grounding and full-course MP4 export. Use the fragment/beat real-check flow after it passes review.')
    process.exitCode = 1
    return
  }

  const count = Number(arg('count', '1'))
  const concurrency = Math.max(1, Number(arg('concurrency', '1')))
  const from = Math.max(1, Number(arg('from', '1')))
  const paceMs = Math.max(0, Number(arg('pace-ms', '5000')))
  const clear = process.argv.includes('--clear')
  if (clear) await backupAndClearCourses()

  const results = []
  let next = from - 1
  let shouldStop = false
  async function worker(workerId) {
    while (!shouldStop) {
      const i = next
      next += 1
      if (i >= count) return
      try {
        log(`[worker ${workerId}] start course ${i + 1}/${count}`)
        results.push(await runOne(i))
        if (paceMs > 0) await sleep(paceMs)
      } catch (error) {
        logError(`[course ${i + 1}] ${error.stack || error}`)
        results.push({ index: i + 1, error: String(error) })
        shouldStop = true
        return
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)))
  const summary = {
    count,
    from,
    concurrency,
    completed: results.filter(row => row.status === 'ready').length,
    results,
  }
  log(JSON.stringify(summary, null, 2))
  if (results.some(row => row.error)) process.exitCode = 1
}

main().catch(error => {
  logError(error.stack || error)
  process.exitCode = 1
})

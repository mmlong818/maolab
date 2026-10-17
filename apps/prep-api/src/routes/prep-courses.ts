// 3d：备课课程接口（与对话工具共用 PrepFacade）。owner = 已鉴权的账号用户名（req.user_id；闸门已保证是成人且在灰度内）。
// 失败按门面的原因回给前端：状态码 httpStatusOf，正文 failureBody（别人的 id 与不存在一样是 not-found 404）。
import { createHash } from 'node:crypto'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { PrepFailure } from '@maolab/course/services/prep-facade-types'
import { failureBody, httpStatusOf, jobDto } from '../prep/courses.ts'
import { PREP_ERRORS } from '../prep/errors.ts'
import { prepStaleMs } from '../prep/config.ts'

// T5 M1（终审修复）：路径里的 id 上限与 Fastify 的 maxParamLength（缺省 100）一致——validId 接受的 id 一定能命中路由，
// 超长的不会落到兜底、拿到不带 reason 的 404。课程与会话 id 是 UUID 量级。知识点 id 只在请求体里，保留原来的 160
export const ID_MAX = 100
const ID_RE = new RegExp(`^[A-Za-z0-9_.:-]{1,${ID_MAX}}$`)
const KP_ID_RE = /^[A-Za-z0-9_.:-]{1,160}$/
export const validId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
const validKpId = (v: unknown): v is string => typeof v === 'string' && KP_ID_RE.test(v)
export const sendFailure = (reply: FastifyReply, failure: PrepFailure) => reply.code(httpStatusOf(failure.reason)).send(failureBody(failure))
const NOT_FOUND: PrepFailure = { ok: false, reason: 'not-found', message: '课程不存在。' }
const PHASES = ['new', 'review', 'exam-prep'] as const
const ACTIONS = ['save', 'approve', 'structure'] as const
const plainObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

const REQUEST_KEY_MAX = 200
/**
 * 面板截图任务的 requestKey = <prefix>:<页>:<正文修订>，prefix = api:<requestId>。
 * - 同一请求重放得到同一键（拿回同一任务）；修页后正文修订变了，同一页得到新键（投新任务）。
 * - 3c 工具的键以会话 id（uuid）开头，api 的键以 api: 开头，两者不相交。
 * - 上限 200（packages/domain/src/render-jobs.ts）：超长时先截短修订（sha256 十六进制，至少留 16 位，同 3c 工具的 renderKey）；
 *   前缀加页 id 本身就放不下时，改用 <prefix 截短>:#<整键 sha256>（页 id 不含 #，不会与常规形状相撞；按整键算，不同页、不同修订不相撞）。
 */
export function renderRequestKey(prefix: string, pageId: string, revision: string): string {
  const base = `${prefix}:${pageId}:`
  const full = `${base}${revision}`
  if (full.length <= REQUEST_KEY_MAX) return full
  if (base.length + 16 <= REQUEST_KEY_MAX) return `${base}${revision.slice(0, REQUEST_KEY_MAX - base.length)}`
  return `${prefix.slice(0, REQUEST_KEY_MAX - 66)}:#${createHash('sha256').update(full).digest('hex')}`
}
/** 面板请求编号：8–120 个 [A-Za-z0-9_-]（T7 review M3：不含 :、#，api:<requestId>: 前缀判断与 renderRequestKey 的三档形状不会互相混淆） */
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,120}$/
const requestIdOf = (body: unknown): string | undefined => {
  const v = plainObject(body) ? body.requestId : undefined
  return typeof v === 'string' && REQUEST_ID_RE.test(v.trim()) ? v.trim() : undefined
}
const errorCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code

/**
 * 同一 owner 有进行中的备课回合：面板写操作先拒（api 与 harness 的门面各自串行，跨进程只靠 CAS；计划"已定事实"）。
 * 四个写操作都不调模型，不要会话凭证（门面从不拿到 runtime）。
 * api 的门面按 owner LRU 缓存，淘汰会丢掉实例内的按课程写队列（T5 审查 M3）：并发写的最后一道防线是门面里的 CAS（冲突回 409）。
 */
async function guardIdle(app: Parameters<FastifyPluginAsync>[0], ownerName: string, reply: FastifyReply): Promise<boolean> {
  const active = await app.prep.conversations.forOwner(ownerName).activeRuns({ staleAfterMs: prepStaleMs(app.deps.config.prep) })
  if (active.length === 0) return true
  await reply.code(409).send(PREP_ERRORS.turnRunning)
  return false
}

export const prepCourseRoutes: FastifyPluginAsync = async (app) => {
  const { courses } = app.prep
  const owner = (req: { user_id?: string }) => req.user_id!

  app.get('/api/prep/courses', async (req, reply) => {
    const result = await (await courses.facade(owner(req))).listCourses()
    return result.ok ? { courses: result.courses } : sendFailure(reply, result)
  })

  app.get<{ Params: { id: string } }>('/api/prep/courses/:id', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    const result = await (await courses.facade(owner(req))).workbench(req.params.id)
    if (!result.ok) return sendFailure(reply, result)
    const jobs = await courses.jobs(owner(req)).listForCourse(req.params.id, 20)
    return { workbench: result.workbench, jobs: jobs.map(jobDto) }
  })

  app.get<{ Params: { id: string } }>('/api/prep/courses/:id/brief', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    const result = await (await courses.facade(owner(req))).brief(req.params.id)
    return result.ok ? { brief: result.brief } : sendFailure(reply, result)
  })

  app.get<{ Params: { id: string; pageId: string } }>('/api/prep/courses/:id/pages/:pageId', async (req, reply) => {
    if (!validId(req.params.id) || !validId(req.params.pageId)) return sendFailure(reply, NOT_FOUND)
    const facade = await courses.facade(owner(req))
    const [page, audit] = await Promise.all([facade.readCourse(req.params.id, req.params.pageId), facade.auditPage(req.params.id, req.params.pageId)])
    if (!page.ok) return sendFailure(reply, page)
    if (!audit.ok) return sendFailure(reply, audit)
    return { page: page.course, audit: audit.audit }
  })

  app.get<{ Params: { id: string } }>('/api/prep/courses/:id/jobs', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    const read = await (await courses.facade(owner(req))).readCourse(req.params.id)
    if (!read.ok) return sendFailure(reply, read)
    return { jobs: (await courses.jobs(owner(req)).listForCourse(req.params.id, 20)).map(jobDto) }
  })

  app.post('/api/prep/courses', async (req, reply) => {
    const b = plainObject(req.body) ? req.body : {}
    const kpIds = b.kpIds
    if (!Array.isArray(kpIds) || kpIds.length < 1 || kpIds.length > 6 || !kpIds.every(validKpId)) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    if (b.lessonPhase !== undefined && !PHASES.includes(b.lessonPhase as never)) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    if (!(await guardIdle(app, owner(req), reply))) return reply
    const result = await (await courses.facade(owner(req))).planCourse({ kpIds: [...new Set(kpIds as string[])], ...(b.lessonPhase ? { lessonPhase: b.lessonPhase as (typeof PHASES)[number] } : {}) })
    return result.ok ? reply.code(201).send({ course: result.course }) : sendFailure(reply, result)
  })

  app.patch<{ Params: { id: string } }>('/api/prep/courses/:id/plan', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    const b = plainObject(req.body) ? req.body : {}
    if (!ACTIONS.includes(b.action as never)) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    if (!(await guardIdle(app, owner(req), reply))) return reply
    // updates/operation 由门面的 updatePlan 用迁入的 schema 与结构规则校验（与对话工具同一条路径）
    const command = {
      action: b.action as (typeof ACTIONS)[number],
      ...(b.updates !== undefined ? { updates: b.updates as never } : {}),
      ...(b.operation !== undefined ? { operation: b.operation as never } : {}),
    }
    const result = await (await courses.facade(owner(req))).updatePlan(req.params.id, command, { imagesAvailable: app.deps.config.prep.imagesAvailable })
    return result.ok ? { plan: result.plan } : sendFailure(reply, result)
  })

  // 4b：建修订版（Ruling [4b]）。写课程文档，与其他面板写操作一样先过 guardIdle（备课对话进行中 409）；新建 201，族里已有更新的课 200
  app.post<{ Params: { id: string } }>('/api/prep/courses/:id/revise', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    if (!(await guardIdle(app, owner(req), reply))) return reply
    const result = await (await courses.facade(owner(req))).reviseCourse(req.params.id)
    if (!result.ok) return sendFailure(reply, result)
    const existing = (result.revision as { existing?: unknown }).existing === true
    return reply.code(existing ? 200 : 201).send({ revision: result.revision })
  })

  app.post<{ Params: { id: string; pageId: string } }>('/api/prep/courses/:id/pages/:pageId/accept', async (req, reply) => {
    if (!validId(req.params.id) || !validId(req.params.pageId)) return sendFailure(reply, NOT_FOUND)
    if (!(await guardIdle(app, owner(req), reply))) return reply
    const result = await (await courses.facade(owner(req))).acceptPage(req.params.id, req.params.pageId)
    return result.ok ? { acceptance: result.acceptance } : sendFailure(reply, result)
  })

  app.post<{ Params: { id: string } }>('/api/prep/courses/:id/accept', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    if (!(await guardIdle(app, owner(req), reply))) return reply
    const result = await (await courses.facade(owner(req))).acceptCourse(req.params.id)
    return result.ok ? { acceptance: result.acceptance } : sendFailure(reply, result)
  })

  // 截图：只投可截图的页（门面判定，3c render_page 同一规则），别的请求投的、还在排队或运行中的同页任务跳过；
  // requestKey 见 renderRequestKey：同一请求重放拿回同一批任务，修页后（修订变了）再点会投新任务。
  // 3b 交接"被拦页之后的任务重新入队"：被拦页修好后再点一次，就把当前所有可截图页（含 PAGE_NOT_NEXT 耗尽的后续页）重新入队。
  // 只投任务、不改课程，所以不受进行中的对话回合限制（同 3c：工具与面板并发投递时 worker 对已截过的页返回 skipped）。
  app.post<{ Params: { id: string } }>('/api/prep/courses/:id/render', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    const requestId = requestIdOf(req.body)
    if (!requestId) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    const renderable = await (await courses.facade(owner(req))).renderablePages(req.params.id)
    if (!renderable.ok) return sendFailure(reply, renderable)
    if (renderable.pageIds.length === 0) return { jobs: [], skipped: [], ...(renderable.note ? { note: renderable.note } : {}) }
    const jobs = courses.jobs(owner(req))
    const prefix = `api:${requestId}`
    const active = new Set((await jobs.listForCourse(req.params.id, 100))
      .filter((job) => job.kind === 'render-page' && (job.status === 'queued' || job.status === 'running') && !job.requestKey.startsWith(`${prefix}:`))
      .map((job) => String(job.payload.pageId)))
    const queued = []
    const skipped: string[] = []
    // 逐个 await：任务 id 以投递事务号开头，领取顺序即投递顺序，worker 按页序截图
    for (const pageId of renderable.pageIds) {
      if (active.has(pageId)) { skipped.push(pageId); continue }
      try {
        const { job } = await jobs.enqueue({ courseId: req.params.id, kind: 'render-page', requestKey: renderRequestKey(prefix, pageId, renderable.revisions[pageId] ?? ''), payload: { pageId } })
        queued.push(jobDto(job))
      } catch (error) {
        if (errorCode(error) === 'COURSE_NOT_FOUND') return sendFailure(reply, NOT_FOUND)
        if (errorCode(error) === 'REQUEST_KEY_CONFLICT') return reply.code(409).send(PREP_ERRORS.requestKeyConflict)
        throw error
      }
    }
    return reply.code(202).send({ jobs: queued, skipped })
  })

  // 导出：未就绪（没整课验收等）门面回 not-ready（422，details.blockers），不投任务；requestKey = api:<requestId>
  app.post<{ Params: { id: string } }>('/api/prep/courses/:id/export', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, NOT_FOUND)
    const requestId = requestIdOf(req.body)
    if (!requestId) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    const ready = await (await courses.facade(owner(req))).exportReadiness(req.params.id)
    if (!ready.ok) return sendFailure(reply, ready)
    try {
      const { job } = await courses.jobs(owner(req)).enqueue({ courseId: req.params.id, kind: 'export-pptx', requestKey: `api:${requestId}` })
      return reply.code(202).send({ job: jobDto(job), export: ready.export })
    } catch (error) {
      if (errorCode(error) === 'COURSE_NOT_FOUND') return sendFailure(reply, NOT_FOUND)
      if (errorCode(error) === 'REQUEST_KEY_CONFLICT') return reply.code(409).send(PREP_ERRORS.requestKeyConflict)
      throw error
    }
  })
}

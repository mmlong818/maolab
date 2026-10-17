// 插件 yunyi-prep：服务 yunyiPrep（3c）。prep 工具经它拿到本会话的 owner、按 owner 缓存的备课门面、渲染队列与本次调用的模型通道。
// 身份只从 agent 经 yunyiSessions 取（spec 11 第 3 条）；私密会话一律拒绝（prep 不是私密 preset，防误挂）。
// PG：配置了 url（profile：YUNYI_PREP_PG_URL，缺省同 YUNYI_PG_URL）时课程、知识点、产物、任务都走 PG；
//     未配置时课程只在进程内（开发用，重启即丢），没有知识点、渲染队列与产物存储。
// 门面按 owner 复用：生成、审计、验收的按课程串行队列在实例内（3a 裁决）；LRU 上限 maxOwners，被逐出的 owner 下次新建实例，此时只靠 CAS。
// 门面只拿 owner 绑定的文档仓储与知识点，不持有任何会话的凭证或通道：模型、图像、产物通道每次工具调用经 runtime() 新建，
//   由门面在 runWithCourseRuntime 里只用于这一次调用（Note for T5：sessionCourseLlm 的 authFailed 是实例状态，不得缓存）。
// 课程模块懒加载（3c 裁决 F4）：apply() 不加载，首个备课工具调用时 tsImport 一次；tutor 宿主不背这个成本。
// 共享的东西（课程模块、按 owner 的门面与文档仓储）在 apply() 时的异步上下文里创建，不继承触发它的会话
//   （llm-yunyi.ts resolveCredential 的告诫：会话上下文里惰性创建的共享资源会让别的会话继承第一个初始化者）。
import { AsyncLocalStorage } from 'node:async_hooks'
import { courseAssetSinkFor, createPool, PgCourseArtifacts, PgCourseDocuments, PgCourseKnowledge, PgRenderJobs, type OwnerRenderJobs } from '@maolab/domain'
import type { PrepDocumentStore, PrepFacade, PrepKnowledgePort, PrepRuntime } from '@maolab/course/services/prep-facade-types'
import { cachedLoader, loadCourseApi, type CourseApi } from './course-loader.ts'
import { newModelMeter, sessionCourseLlm, sessionImage, sessionSleep, type LlmStreamer, type ModelMeter } from './model.ts'

export const name = 'yunyi-prep'
export const inject = ['yunyiSessions', 'llm']

type AgentLike = { id: unknown }

export interface PrepSessions {
  ownerOf(agent: AgentLike): string | undefined
  credentialOf(agent: AgentLike): string | undefined
  isPrivateSession(sessionId: string): boolean
}

export type PrepRefusalReason = 'no-session' | 'private-session' | 'prep-unavailable'
export interface PrepRefusal { ok: false; reason: PrepRefusalReason; message: string }
export type PrepJobs = Pick<OwnerRenderJobs, 'enqueue' | 'get' | 'listForCourse'>

export interface PrepScope {
  owner: string
  sessionId: string
  facade: PrepFacade
  jobs: PrepJobs | undefined
  imagesAvailable: boolean
  /**
   * 本次工具调用的通道（每次调用新建，不缓存）；会话没有云一凭证时返回 undefined，调用方据此不发任何模型或图像请求（用户裁决 D7）。
   * signal 传工具的 exec.signal：模型调用、退避（sleep）与图像请求都随它取消；调用方还要把它作为 options.signal 交给门面。
   */
  runtime(courseId: string, signal: AbortSignal): { runtime: PrepRuntime; meter: ModelMeter } | undefined
}

export interface YunyiPrep {
  scope(agent: AgentLike | undefined): Promise<PrepScope | PrepRefusal>
}

export interface PrepDeps {
  course: CourseApi
  sessions: PrepSessions
  llm: LlmStreamer
  documentsFor(owner: string): PrepDocumentStore
  knowledge: PrepKnowledgePort
  jobsFor?(owner: string): PrepJobs
  assetsFor?(owner: string, courseId: string): NonNullable<PrepRuntime['assets']>
  model: string
  imageModel: string
  baseUrl: string
  maxOwners?: number
  fetchImpl?: typeof fetch
  /** 在调用会话之外的异步上下文里运行（apply() 用启动时的 AsyncLocalStorage.snapshot()）；按 owner 共享的门面与文档仓储经它创建 */
  detached?: <R>(fn: () => R) => R
}

const refusal = (reason: PrepRefusalReason, message: string): PrepRefusal => ({ ok: false, reason, message })

export function createPrep(deps: PrepDeps): YunyiPrep {
  const maxOwners = deps.maxOwners ?? 512
  const detached = deps.detached ?? (<R>(fn: () => R): R => fn())
  const facades = new Map<string, PrepFacade>()
  const facadeFor = (owner: string): PrepFacade => {
    const cached = facades.get(owner)
    if (cached) {
      facades.delete(owner)
      facades.set(owner, cached)
      return cached
    }
    // 门面的依赖只有 owner 绑定的文档仓储与知识点：任何会话的凭证、模型、图像、产物通道都不进这里
    const facade = detached(() => deps.course.createPrepFacade({ documents: deps.documentsFor(owner), knowledge: deps.knowledge }))
    facades.set(owner, facade)
    if (facades.size > maxOwners) {
      const oldest = facades.keys().next()
      if (!oldest.done) facades.delete(oldest.value)
    }
    return facade
  }
  // 图像要同时有图像模型与产物存储（没有 PG 时没有产物存储，runtime() 也就不给图像通道）
  const imagesAvailable = deps.imageModel.length > 0 && deps.assetsFor !== undefined

  return {
    async scope(agent) {
      if (!agent) return refusal('no-session', '没有会话上下文，不能备课。')
      const sessionId = String(agent.id)
      if (deps.sessions.isPrivateSession(sessionId)) return refusal('private-session', '私密会话不能备课。')
      const owner = deps.sessions.ownerOf(agent)
      if (!owner) return refusal('no-session', '会话没有归属账号，不能备课。')
      return {
        owner,
        sessionId,
        facade: facadeFor(owner),
        jobs: deps.jobsFor?.(owner),
        imagesAvailable,
        runtime(courseId, signal) {
          // 凭证在调用时读（会话 resume 可能换了凭证）；没有就什么通道都不建
          const credential = deps.sessions.credentialOf(agent)
          if (!credential) return undefined
          const meter = newModelMeter()
          const assets = deps.assetsFor?.(owner, courseId)
          const runtime: PrepRuntime = {
            llm: sessionCourseLlm({ llm: deps.llm, sessionId, model: deps.model, signal, meter }),
            sleep: sessionSleep(signal),
            ...(assets ? { assets } : {}),
            ...(assets && deps.imageModel
              ? { image: sessionImage({ baseUrl: deps.baseUrl, credential, model: deps.imageModel, signal, meter, assets, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) }) }
              : {}),
          }
          return { runtime, meter }
        },
      }
    },
  }
}

export interface PrepConfig {
  url?: string
  courseSchema?: string
  knowledgeSchema?: string
  model?: string
  imageModel?: string
  baseUrl?: string
  maxOwners?: number
}

interface PrepCtx {
  yunyiSessions: PrepSessions
  llm: LlmStreamer
  provide(name: string, value: unknown): void
  effect(fn: () => () => Promise<void> | void): void
}

const EMPTY_KNOWLEDGE: PrepKnowledgePort = { knowledgePoints: async () => [], knowledgePointSources: async () => [] }

/** apply 的实现；load 可替换（测试用计数或失败的加载器验证懒加载与重试） */
export function createPrepService(ctx: PrepCtx, config: PrepConfig = {}, load: () => Promise<CourseApi> = loadCourseApi): void {
  const pool = config.url ? createPool(config.url) : undefined
  const courseSchema = config.courseSchema || 'course'
  const documents = pool ? new PgCourseDocuments(pool, { schema: courseSchema }) : undefined
  const jobs = pool ? new PgRenderJobs(pool, { schema: courseSchema }) : undefined
  const artifacts = pool ? new PgCourseArtifacts(pool, { schema: courseSchema }) : undefined
  const knowledge: PrepKnowledgePort = pool ? new PgCourseKnowledge(pool, { schema: config.knowledgeSchema || 'kp' }) : EMPTY_KNOWLEDGE
  const memory = new Map<string, PrepDocumentStore>()
  // 插件启动时的异步上下文（不属于任何会话）：懒加载与按 owner 的共享对象都在这里创建
  const outside: <R>(fn: () => R) => R = AsyncLocalStorage.snapshot()

  // 首个备课工具调用时才加载课程模块（3c 裁决 F4）；并发首调共用一次加载，失败不缓存
  const ready = cachedLoader(() => outside(async () => {
    const api = await load()
    return createPrep({
      course: api,
      sessions: ctx.yunyiSessions,
      llm: ctx.llm,
      documentsFor: (owner) => {
        if (documents) return documents.forOwner(owner)
        let store = memory.get(owner)
        if (!store) {
          store = api.createMemoryCourseDocuments()
          memory.set(owner, store)
        }
        return store
      },
      knowledge,
      ...(jobs ? { jobsFor: (owner: string) => jobs.forOwner(owner) } : {}),
      ...(artifacts ? { assetsFor: (owner: string, courseId: string) => courseAssetSinkFor(artifacts.forOwner(owner), courseId) } : {}),
      model: config.model || 'glm-5.3',
      imageModel: config.imageModel ?? '',
      baseUrl: config.baseUrl || 'https://api.everai.cloud/v1',
      ...(config.maxOwners ? { maxOwners: config.maxOwners } : {}),
      detached: outside,
    })
  }))

  const service: YunyiPrep = {
    async scope(agent) {
      let prepared: YunyiPrep
      try {
        prepared = await ready()
      } catch (error) {
        process.stderr.write(`yunyi-prep: 加载 @maolab/course 失败：${error instanceof Error ? error.message : String(error)}\n`)
        return refusal('prep-unavailable', '备课服务暂不可用（课程模块未加载），请稍后再试。')
      }
      return prepared.scope(agent)
    },
  }
  ctx.provide('yunyiPrep', service)
  ctx.effect(() => async () => { await pool?.end() })
}

export function apply(ctx: PrepCtx, config: PrepConfig = {}): void {
  createPrepService(ctx, config)
}

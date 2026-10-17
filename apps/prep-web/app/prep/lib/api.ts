// 备课 api 客户端（只走 /api/prep/*，经 apiFetch 带 X-Session-Token）。错误统一抛 PrepApiError（status、code、reason、details）。
// 产物下载只走按 owner 校验的 /api/prep/artifacts/<id>（见 artifact-url.ts），从不请求渲染页的数据地址（projectionRenderDataPath，api 永远 404）。
import { apiFetch } from '@/lib/auth/client'
import { readNdjson } from './ndjson'
import type { ChatFrame, PrepSession, PrepTranscriptItem } from './chat-state'
import type { PrepJob, PrepWorkbench } from './panel-model'

export interface PrepCourseRow { courseId: string; topic: string; qualityStatus: string; planStatus: string | null; sessionStatus: string | null; createdAt: number }
export interface PrepPageRow { pageId: string; order: number; purpose: string; learningAction?: string; needsImage: boolean; status: string; lastDiagnostic: string | null; render: { evidenceId: string; blocking: boolean; issues: string[] } | null; accepted: boolean }

/** 知识点检索结果（/api/prep/knowledge/search）：k12-knowledge-points 数据集 */
export interface PrepKnowledgePoint { id: string; name: string; subject: string; gradeBand: string; summary: string }
export interface PrepKnowledgeFacets { datasetVersion: string | null; gradeBands: Array<{ gradeBand: string; subjects: string[] }> }

/** S4：课程包（/api/prep/packages）。url、recallUrl 是按 owner 校验的产物地址 */
export interface PrepPackageVersion { version: number; sourceCourseId: string; url: string; filename: string; bytes: number; pageCount: number; createdAt: number }
export interface PrepPackage { packageId: string; status: 'active' | 'recalled'; createdAt: number; recalledAt: number | null; recallReason: string | null; recallUrl: string | null; versions: PrepPackageVersion[] }

export class PrepApiError extends Error {
  status: number
  code?: string
  reason?: string
  details?: unknown
  constructor(status: number, body: { error?: string; code?: string; reason?: string; details?: unknown }) {
    super(body.error ?? `请求失败（${status}）`)
    this.name = 'PrepApiError'
    this.status = status
    if (body.code) this.code = body.code
    if (body.reason) this.reason = body.reason
    if (body.details !== undefined) this.details = body.details
  }
}

const errorBody = async (response: Response) => {
  const data = (await response.json().catch(() => null)) as unknown
  return (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as { error?: string; code?: string; reason?: string; details?: unknown }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await apiFetch(url, { method, cache: 'no-store', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  if (!response.ok) throw new PrepApiError(response.status, await errorBody(response))
  return (await response.json().catch(() => ({}))) as T
}
const enc = encodeURIComponent

export const prepApi = {
  status: () => call<{ enabled: true; hasCredential: boolean; imagesAvailable: boolean }>('GET', '/api/prep/status'),
  courses: () => call<{ courses: PrepCourseRow[] }>('GET', '/api/prep/courses'),
  course: (id: string) => call<{ workbench: PrepWorkbench; jobs: PrepJob[] }>('GET', `/api/prep/courses/${enc(id)}`),
  brief: (id: string) => call<{ brief: unknown }>('GET', `/api/prep/courses/${enc(id)}/brief`),
  createCourse: (kpIds: string[]) => call<{ course: { courseId: string; imagePages: string[]; pages: PrepPageRow[] } }>('POST', '/api/prep/courses', { kpIds }),
  updatePlan: (id: string, command: { action: 'save' | 'approve' | 'structure'; updates?: unknown; operation?: unknown }) => call<{ plan: unknown }>('PATCH', `/api/prep/courses/${enc(id)}/plan`, command),
  acceptPage: (id: string, pageId: string) => call<{ acceptance: unknown }>('POST', `/api/prep/courses/${enc(id)}/pages/${enc(pageId)}/accept`, {}),
  acceptCourse: (id: string) => call<{ acceptance: unknown }>('POST', `/api/prep/courses/${enc(id)}/accept`, {}),
  render: (id: string, requestId: string) => call<{ jobs: PrepJob[]; skipped: string[]; note?: string }>('POST', `/api/prep/courses/${enc(id)}/render`, { requestId }),
  exportPptx: (id: string, requestId: string) => call<{ job: PrepJob }>('POST', `/api/prep/courses/${enc(id)}/export`, { requestId }),
  /** S4：导出课程包。当前验收版本已导出过时 unchanged（不投任务） */
  exportPackage: (id: string, requestId: string) => call<{ job: PrepJob; packageId: string } | { unchanged: true; packageId: string; version: PrepPackageVersion }>('POST', `/api/prep/courses/${enc(id)}/package`, { requestId }),
  packages: (courseId: string) => call<{ packages: PrepPackage[] }>('GET', `/api/prep/packages?courseId=${enc(courseId)}`),
  recallPackage: (packageId: string, requestId: string, reason?: string) => call<{ package: PrepPackage; recallUrl: string | null }>('POST', `/api/prep/packages/${enc(packageId)}/recall`, { requestId, ...(reason ? { reason } : {}) }),
  /** 4b：建修订版；新建 201、族里已有更新的课 200（existing: true），都返回修订版（或那门更新的课）的 courseId */
  revise: (courseId: string) => call<{ revision: { courseId: string; existing: boolean; note: string } }>('POST', `/api/prep/courses/${enc(courseId)}/revise`, {}),
  knowledgeFacets: () => call<PrepKnowledgeFacets>('GET', '/api/prep/knowledge/facets'),
  /** 关键词为空时要带学段或学科（api 否则 400 QUERY_REQUIRED） */
  searchKnowledge: (query: { q: string; gradeBand?: string; subject?: string; limit?: number }) => {
    const params = new URLSearchParams({ q: query.q })
    if (query.gradeBand) params.set('gradeBand', query.gradeBand)
    if (query.subject) params.set('subject', query.subject)
    if (query.limit) params.set('limit', String(query.limit))
    return call<{ items: PrepKnowledgePoint[] }>('GET', `/api/prep/knowledge/search?${params}`)
  },
  sessions: () => call<{ sessions: PrepSession[] }>('GET', '/api/prep/sessions'),
  createSession: (input: { title?: string; courseId?: string }) => call<{ session: PrepSession }>('POST', '/api/prep/sessions', input),
  session: (id: string) => call<{ session: PrepSession; messages: PrepTranscriptItem[]; running: string[] }>('GET', `/api/prep/sessions/${enc(id)}`),
  cancel: async (id: string) => { await call('POST', `/api/prep/sessions/${enc(id)}/cancel`, {}) },
  /**
   * 发一条消息：流式时逐帧回调；同 requestId 正在处理（202 PREP_RUN_IN_PROGRESS）返回 'running'（不回调），
   * 已完成（回放，JSON 体）返回 'replayed' 并以一帧 done 回调。其余失败（403 凭证、409 冲突或取消、429、500、504）抛 PrepApiError。
   */
  async send(sessionId: string, body: { content: string; requestId: string; courseId?: string }, onFrame: (frame: ChatFrame) => void, signal?: AbortSignal): Promise<'streamed' | 'running' | 'replayed'> {
    const response = await apiFetch(`/api/prep/sessions/${enc(sessionId)}/messages`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) })
    if (response.status === 202) return 'running'
    if (!response.ok) throw new PrepApiError(response.status, await errorBody(response))
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('application/x-ndjson') || !response.body) {
      onFrame({ type: 'done', ...((await response.json()) as Omit<Extract<ChatFrame, { type: 'done' }>, 'type'>) })
      return 'replayed'
    }
    for await (const frame of readNdjson(response.body)) onFrame(frame as ChatFrame)
    return 'streamed'
  },
}

/** 请求编号：api 要求 ^[A-Za-z0-9_-]{8,120}$（消息、截图、导出同一口径）；UUID 与后备形状都满足 */
export const newRequestId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`)

/** 课程所在的修订族：revision.familyId，没有时是课程自己的 id（同 @maolab/course 的 revisionOf） */
export function courseFamilyId(course: Record<string, unknown>, courseId: string): string {
  const revision = course.revision as { familyId?: unknown } | undefined
  if (revision && typeof revision.familyId === 'string' && revision.familyId) return revision.familyId
  return typeof course.id === 'string' && course.id ? course.id : courseId
}

export const REVISE_CONFIRM = '建修订版会新建一门课：正文、截图、整课审查和验收都要重新做（模型会重新生成，内容和现在不会完全一样）。原来的课保持不变。确定建修订版吗？'
/** 只有整课验收过的课（planning.status === 'ready'）能建修订版；没验收的直接改 */
export function canRevise(course: unknown): boolean {
  return (course as { planning?: { status?: unknown } } | null | undefined)?.planning?.status === 'ready'
}

// S4：课程包（拆分 spec 4）。导出 = 投 export-package 任务（worker 截图、打包、签名）；撤回 = 本地状态 + 签名撤回单，由运营带到云一自习室执行。
// 包按"老师 + 修订族"分配，跨版本同一 packageId；撤回后同族再导出得到新包。owner 只来自已鉴权的账号（别人的包与不存在一样 404）。
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { buildRecall } from '@maolab-core/course-package'
import { courseArtifactUrlOf, RECALL_CONTENT_TYPE, type ExportPackage, type ExportVersion } from '@maolab/domain'
import { jobDto } from '../prep/courses.ts'
import { PREP_ERRORS } from '../prep/errors.ts'
import { sendFailure, validId } from './prep-courses.ts'

export const PACKAGE_ERRORS = {
  signingUnconfigured: { error: '备课室还没有配置课程包签名钥，暂时不能导出课程包。请联系管理员。', code: 'PACKAGE_SIGNING_UNCONFIGURED' },
} as const
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,120}$/
const REASON_MAX = 300
const plainObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const requestIdOf = (body: unknown): string | undefined => {
  const v = plainObject(body) ? body.requestId : undefined
  return typeof v === 'string' && REQUEST_ID_RE.test(v.trim()) ? v.trim() : undefined
}
const errorCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code

const versionDto = (v: ExportVersion) => ({
  version: v.version, sourceCourseId: v.sourceCourseId, url: courseArtifactUrlOf(v.artifactId),
  filename: `${v.packageId}-v${v.version}.maolab-course.zip`, bytes: v.bytes, pageCount: v.pageCount, createdAt: v.createdAt,
})
const packageDto = (p: ExportPackage, versions: ExportVersion[] = []) => ({
  packageId: p.packageId, status: p.status, createdAt: p.createdAt,
  recalledAt: p.recalledAt ?? null, recallReason: p.recallReason ?? null,
  recallUrl: p.recallArtifactId ? courseArtifactUrlOf(p.recallArtifactId) : null,
  versions: versions.map(versionDto),
})

export const prepPackageRoutes: FastifyPluginAsync = async (app) => {
  const { courses } = app.prep
  const owner = (req: { user_id?: string }) => req.user_id!
  const signingKey = () => app.deps.config.prep.packageSigningKey
  const unconfigured = (reply: FastifyReply) => reply.code(503).send(PACKAGE_ERRORS.signingUnconfigured)

  // 导出：草稿不合格 → 422（blockers）；最新版本就是当前验收签名 → 200 unchanged；否则 202 投任务
  app.post<{ Params: { id: string } }>('/api/prep/courses/:id/package', async (req, reply) => {
    if (!validId(req.params.id)) return sendFailure(reply, { ok: false, reason: 'not-found', message: '课程不存在。' })
    const requestId = requestIdOf(req.body)
    if (!requestId) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    if (!signingKey()) return unconfigured(reply)
    const draft = await (await courses.facade(owner(req))).packageDraft(req.params.id)
    if (!draft.ok) return sendFailure(reply, draft)
    const exports = courses.exports(owner(req))
    const pkg = await exports.ensureActivePackage(draft.draft.familyId)
    const [listed] = await exports.list({ familyId: draft.draft.familyId }).then((all) => all.filter((p) => p.packageId === pkg.packageId))
    const latest = listed?.versions.at(-1)
    if (latest && latest.signature === draft.draft.signature) {
      return reply.code(200).send({ unchanged: true, packageId: pkg.packageId, package: packageDto(pkg, listed!.versions), version: versionDto(latest) })
    }
    try {
      const { job } = await courses.jobs(owner(req)).enqueue({ courseId: req.params.id, kind: 'export-package', requestKey: `api:${requestId}`, payload: { packageId: pkg.packageId } })
      return reply.code(202).send({ job: jobDto(job), packageId: pkg.packageId })
    } catch (error) {
      if (errorCode(error) === 'COURSE_NOT_FOUND') return reply.code(404).send(PREP_ERRORS.notFound)
      if (errorCode(error) === 'REQUEST_KEY_CONFLICT') return reply.code(409).send(PREP_ERRORS.requestKeyConflict)
      throw error
    }
  })

  // 列表：给了 courseId 只列这门课所在修订族的包（新的在前）
  app.get<{ Querystring: { courseId?: string } }>('/api/prep/packages', async (req, reply) => {
    const courseId = req.query.courseId
    let familyId: string | undefined
    if (courseId !== undefined) {
      if (!validId(courseId)) return reply.code(404).send(PREP_ERRORS.notFound)
      familyId = await courses.familyOf(owner(req), courseId)
      if (!familyId) return reply.code(404).send(PREP_ERRORS.notFound)
    }
    const listed = await courses.exports(owner(req)).list(familyId ? { familyId } : {})
    reply.header('cache-control', 'private, no-store')
    return { packages: listed.map((p) => packageDto(p, p.versions)) }
  })

  // 撤回：已撤回的原样返回第一次的撤回单；撤回单只在备课室生效，需交给自习室运营执行
  app.post<{ Params: { packageId: string } }>('/api/prep/packages/:packageId/recall', async (req, reply) => {
    if (!validId(req.params.packageId)) return reply.code(404).send(PREP_ERRORS.notFound)
    if (!requestIdOf(req.body)) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    const rawReason = plainObject(req.body) ? req.body.reason : undefined
    if (rawReason !== undefined && (typeof rawReason !== 'string' || rawReason.trim().length > REASON_MAX)) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    const reason = typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : undefined
    const exports = courses.exports(owner(req))
    const existing = await exports.get(req.params.packageId)
    if (!existing) return reply.code(404).send(PREP_ERRORS.notFound)
    if (existing.status === 'recalled') return { package: packageDto(existing), recallUrl: existing.recallArtifactId ? courseArtifactUrlOf(existing.recallArtifactId) : null }
    const key = signingKey()
    if (!key) return unconfigured(reply)
    const slip = buildRecall({ packageId: existing.packageId, ...(reason ? { reason } : {}) }, key)
    const stored = await courses.artifacts(owner(req)).put({ bytes: slip, contentType: RECALL_CONTENT_TYPE, kind: 'recall' })
    const recalled = await exports.recall(existing.packageId, { ...(reason ? { reason } : {}), artifactId: stored.id })
    return { package: packageDto(recalled), recallUrl: recalled.recallArtifactId ? courseArtifactUrlOf(recalled.recallArtifactId) : null }
  })
}

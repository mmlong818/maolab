// S4：export-package 任务（拆分 spec 4.1）。只导出包草稿合格（发布判定 + 教师最终签名）的课程；
// 页面图与 PPTX 导出同一套：planProjectionExport 的 renderCourse 按 settle 'export' 逐页截图（1920×1080）。
// 版本号由 exports.appendVersion 定（同签名 unchanged，不截图）；打包、签名、隐私扫描都在 @maolab-core/course-package。
// 包存成永久产物（kind 'package'）：运营可能隔几天才取，老师也要能重新下载已交付的版本。
import { courseArtifactUrl, createMainlineCourseStore, GenerationRenderRunError, packageContentOf, packageDraftOf, planProjectionExport, projectionRenderUrl } from '@maolab/course'
import { ALLOWED_PNG_CHUNKS, buildPackage, PackageError, type GradeBand, type SigningKey } from '@maolab-core/course-package'
import { PACKAGE_CONTENT_TYPE, type OwnerExports, type RenderJob } from '@maolab/domain'
import type { CapturedProjection } from './capture.ts'
import { RenderWorkerError, type RenderWorkerErrorCode } from './errors.ts'
import { installProjectionRoutes } from './page-host.ts'
import { captureChecked, type RenderJobDeps } from './jobs.ts'

export const KNOWLEDGE_DATASET_NAME = 'k12-knowledge-points'

export interface PackagingDeps {
  /** MAOLAB_PACKAGE_SIGNING_KEY；没配置时任务不可重试地失败 */
  signingKey: SigningKey | undefined
  /** @maolab-core/course-package 的版本，写进 manifest.exporter */
  coreVersion: string
  exportsFor(owner: string): Pick<OwnerExports, 'get' | 'appendVersion'>
  /** 隐私扫描用：老师账号的用户名、外部 id、显示名、邮箱（非空的） */
  identifiersOf(owner: string): Promise<string[]>
  datasetVersion(): Promise<string | undefined>
  knowledgePoints(ids: readonly string[]): Promise<Array<{ id: string; subject: string; gradeBand: GradeBand }>>
}

export interface PackageJobResult {
  packageId: string
  version: number
  artifactId: string
  url: string
  filename: string
  bytes: number
  sha256: string
  pageCount: number
  unchanged: boolean
}

const fail = (code: RenderWorkerErrorCode, message: string, details?: unknown): never => { throw new RenderWorkerError(code, message, false, details) }

/** 只保留白名单里的块（Chromium 可能写 iCCP 等色彩元数据）；块原样拷贝，CRC 不变 */
export function stripPng(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const parts: Uint8Array[] = [png.subarray(0, 8)]
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const end = offset + 12 + length
    if (end > png.length) break
    if (ALLOWED_PNG_CHUNKS.has(type)) parts.push(png.subarray(offset, end))
    offset = end
    if (type === 'IEND') break
  }
  return Buffer.concat(parts)
}

const filenameOf = (pptxFilename: string, version: number): string => `${pptxFilename.replace(/\.pptx$/i, '')}-v${version}.maolab-course.zip`

export async function exportPackage(job: RenderJob, deps: RenderJobDeps): Promise<PackageJobResult> {
  const packageId = typeof job.payload.packageId === 'string' && job.payload.packageId.trim() ? job.payload.packageId : undefined
  if (!packageId) return fail('PACKAGE_INPUT', '课程包任务没有指定包（payload.packageId）。')
  const packaging = deps.packaging
  if (!packaging?.signingKey) return fail('PACKAGE_SIGNING_UNCONFIGURED', '备课室没有配置课程包签名钥（MAOLAB_PACKAGE_SIGNING_KEY），不能导出课程包。')
  const signingKey = packaging.signingKey
  const store = createMainlineCourseStore(deps.documentsFor(job.owner))
  const artifacts = deps.artifacts.forOwner(job.owner)
  const course = await store.findMainlineCourse(job.courseId)
  if (!course) throw new GenerationRenderRunError('COURSE_NOT_FOUND', `课程不存在：${job.courseId}`)
  const draft = packageDraftOf(course)
  if (!draft.ok) return fail('NOT_READY', draft.message, { blockers: draft.blockers ?? [] })
  const exports = packaging.exportsFor(job.owner)
  const pkg = await exports.get(packageId)
  if (!pkg) return fail('PACKAGE_NOT_FOUND', `课程包 ${packageId} 不存在。`)
  if (pkg.status === 'recalled') return fail('PACKAGE_RECALLED', '这个课程包已撤回，不能再出新版本；请重新导出得到新课程包。')

  const plan = planProjectionExport(course, deps.now())
  const content = packageContentOf(draft.draft.snapshot)
  if (content.pages.length !== plan.pageCount) return fail('PACKAGE_inconsistent', `课程页数对不上（文字 ${content.pages.length} 页，截图 ${plan.pageCount} 页）。`)

  const build = async (version: number) => {
    const datasetVersion = await packaging.datasetVersion()
    if (!datasetVersion) return fail('KNOWLEDGE_DATASET_MISSING', '知识点数据集没有导入（kp.datasets 里没有 k12-knowledge-points）。')
    const points = await packaging.knowledgePoints(draft.draft.kpIds)
    const first = points.find((p) => p.id === draft.draft.kpIds[0])
    if (!first) return fail('KNOWLEDGE_DATASET_MISSING', '课程的知识点不在知识点数据集里。', { kpIds: draft.draft.kpIds })
    const routes = deps.routes ?? installProjectionRoutes
    const shots = await deps.withContext(async (context) => {
      const log = await routes(context, deps.origin, { courseId: job.courseId, course: async () => plan.renderCourse, artifact: (id) => artifacts.get(id) })
      const out: CapturedProjection['screenshot'][] = []
      for (let pageNumber = 1; pageNumber <= plan.pageCount; pageNumber += 1) {
        const { screenshot } = await captureChecked(log, () =>
          deps.capture(context, projectionRenderUrl(deps.origin, job.courseId, pageNumber), pageNumber, { timeoutMs: deps.timeoutMs, settle: 'export' }))
        out.push(screenshot)
      }
      return out
    })
    let bytes: Uint8Array
    try {
      bytes = buildPackage({
        packageId,
        version,
        title: draft.draft.title,
        subject: first.subject,
        gradeBand: first.gradeBand,
        kpIds: draft.draft.kpIds,
        knowledgeDataset: { name: KNOWLEDGE_DATASET_NAME, version: datasetVersion },
        pages: content.pages.map((page, index) => ({ ...page, png: stripPng(shots[index]!) })),
        outline: content.outline,
        exporter: { product: 'maolab', coreVersion: packaging.coreVersion },
        createdAt: new Date(deps.now()),
        identifiers: await packaging.identifiersOf(job.owner),
      }, signingKey)
    } catch (error) {
      if (error instanceof PackageError) return fail(`PACKAGE_${error.code}`, error.message, { detail: error.detail })
      throw error
    }
    const stored = await artifacts.put({ bytes, contentType: PACKAGE_CONTENT_TYPE, kind: 'package', courseId: job.courseId })
    return { artifactId: stored.id, sha256: stored.sha256, bytes: stored.byteSize, pageCount: plan.pageCount }
  }

  let out: Awaited<ReturnType<OwnerExports['appendVersion']>>
  try {
    out = await exports.appendVersion(packageId, { sourceCourseId: job.courseId, signature: draft.draft.signature, build })
  } catch (error) {
    const code = (error as { code?: unknown }).code
    if (code === 'RECALLED') return fail('PACKAGE_RECALLED', '这个课程包已撤回，不能再出新版本；请重新导出得到新课程包。')
    if (code === 'NOT_FOUND') return fail('PACKAGE_NOT_FOUND', `课程包 ${packageId} 不存在。`)
    throw error
  }
  const v = out.version
  return { packageId, version: v.version, artifactId: v.artifactId, url: courseArtifactUrl(v.artifactId), filename: filenameOf(plan.filename, v.version), bytes: v.bytes, sha256: v.sha256, pageCount: v.pageCount, unchanged: out.kind === 'unchanged' }
}

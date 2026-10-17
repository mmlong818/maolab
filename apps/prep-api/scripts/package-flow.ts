// S4：备课室课程包全链（接在 prep-flow 之后，课程已整课验收）：导出 v1 → 下载并用公钥读包 → 再导出 unchanged →
// 建修订版并走完（确认计划、逐页生成、截图、整课审查、验收）→ 导出 v2（同一包 id）→ 撤回 → 下载撤回单并验签。
// 产物写到 outDir：lesson-v1.zip、lesson-v2.zip、recall.json、public.pem（给自习室的跨产品全链用）。summary.package 只写固定度量。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicKeysFromPem, readPackage, readRecall } from '@maolab-core/course-package'
import type { PrepFlowContext } from './prep-flow.ts'

export interface PackageFlowContext extends PrepFlowContext {
  outDir: string
  publicKeyPem: string
}

export async function runPackageFlow(ctx: PackageFlowContext, courseId: string, summary: Record<string, unknown>, check: (ok: boolean, message: string) => void): Promise<void> {
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${ctx.webBase}${path}`, { method, headers: { 'x-session-token': ctx.token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> }
  }
  const chat = async (sessionId: string, content: string, requestId: string) => {
    const res = await fetch(`${ctx.webBase}/api/prep/sessions/${sessionId}/messages`, { method: 'POST', headers: { 'x-session-token': ctx.token, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ content, requestId }) })
    return (await res.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, any>)
  }
  const download = async (url: string, name: string): Promise<Uint8Array> => {
    const res = await fetch(`${ctx.webBase}${url}?name=${encodeURIComponent(name)}&token=${encodeURIComponent(ctx.token)}`)
    check(res.status === 200 && String(res.headers.get('content-disposition')).startsWith('attachment;'), `下载 ${name}：${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  let n = 0
  const rid = (tag: string) => `${ctx.ridPrefix}-pkg-${tag}-${String(++n).padStart(4, '0')}`
  const publicKeys = publicKeysFromPem([ctx.publicKeyPem])
  mkdirSync(ctx.outDir, { recursive: true })
  const out: Record<string, unknown> = {}

  /** 导出并等 worker 做完，返回列表里这门课所在修订族的包 */
  const exportOnce = async (label: string, id: string) => {
    const queued = await api('POST', `/api/prep/courses/${id}/package`, { requestId: rid(label) })
    check(queued.status === 202, `${label} 课程包入队 ${queued.status} ${JSON.stringify(queued.body).slice(0, 300)}`)
    await ctx.waitRender(label, id)
    const jobs = (await api('GET', `/api/prep/courses/${id}/jobs`)).body.jobs as Array<{ kind: string; status: string; error: { code: string; message: string } | null }>
    const job = jobs.find((j) => j.kind === 'export-package')
    check(job?.status === 'succeeded', `${label} 课程包任务 ${job?.status} ${JSON.stringify(job?.error)}`)
    const listed = await api('GET', `/api/prep/packages?courseId=${id}`)
    return { packageId: queued.body.packageId as string, packages: (listed.body.packages ?? []) as Array<{ packageId: string; status: string; recallUrl: string | null; versions: Array<{ version: number; url: string; pageCount: number }> }> }
  }
  const readVersion = async (url: string, file: string) => {
    const bytes = await download(url, file)
    writeFileSync(join(ctx.outDir, file), bytes)
    return readPackage(bytes, { publicKeys })
  }

  // 1. v1
  const first = await exportOnce('v1', courseId)
  const v1Row = first.packages.find((p) => p.packageId === first.packageId)?.versions.find((v) => v.version === 1)
  check(Boolean(v1Row), '列表里应有 v1')
  const v1 = await readVersion(v1Row!.url, 'lesson-v1.zip')
  out.v1 = { version: v1.manifest.version, pageCount: v1.manifest.pageCount, kpCount: v1.manifest.kpIds.length, subject: v1.manifest.subject, gradeBand: v1.manifest.gradeBand, dataset: v1.manifest.knowledgeDataset.name, exporter: v1.manifest.exporter.product, images: v1.images.size }
  check(v1.manifest.packageId === first.packageId && v1.manifest.version === 1, 'v1 的 manifest 包 id 与版本')
  // 2. 同一门课再导出：unchanged，不投任务
  const again = await api('POST', `/api/prep/courses/${courseId}/package`, { requestId: rid('again') })
  check(again.status === 200 && again.body.unchanged === true, `再导出应 unchanged：${again.status}`)
  out.unchanged = again.body.unchanged === true

  // 3. 修订版走完整课验收
  const revised = await api('POST', `/api/prep/courses/${courseId}/revise`, {})
  check(revised.status === 201, `建修订版 ${revised.status}`)
  const revisionId = revised.body.revision.courseId as string
  check((await api('PATCH', `/api/prep/courses/${revisionId}/plan`, { action: 'approve', updates: [] })).status === 200, '修订版确认计划')
  const session = (await api('POST', '/api/prep/sessions', { courseId: revisionId })).body.session.id as string
  let pages = 0
  for (let i = 0; i < 40; i += 1) {
    const done = (await chat(session, `TOOL:generate_page:${JSON.stringify({ courseId: revisionId })}`, rid('gen'))).at(-1)!
    if (done.tools?.[0]?.ok !== true) break
    pages += 1
  }
  check(pages > 0, `修订版生成页数 ${pages}`)
  check((await api('POST', `/api/prep/courses/${revisionId}/render`, { requestId: rid('render') })).status === 202, '修订版截图入队')
  await ctx.waitRender('revision-render', revisionId)
  check((await chat(session, `TOOL:audit_course:${JSON.stringify({ courseId: revisionId })}`, rid('audit'))).at(-1)!.tools?.[0]?.ok === true, '修订版整课审查')
  const unaccepted = ((await api('GET', `/api/prep/courses/${revisionId}`)).body.workbench?.unacceptedPageIds ?? []) as string[]
  for (const pageId of unaccepted) check((await api('POST', `/api/prep/courses/${revisionId}/pages/${pageId}/accept`, {})).status === 200, `修订版验收 ${pageId}`)
  check((await api('POST', `/api/prep/courses/${revisionId}/accept`, {})).status === 200, '修订版整课验收')

  // 4. v2：同一修订族 → 同一包 id，版本 2
  const second = await exportOnce('v2', revisionId)
  check(second.packageId === first.packageId, `修订版应进同一个课程包：${second.packageId} vs ${first.packageId}`)
  const pkg = second.packages.find((p) => p.packageId === first.packageId)
  check(JSON.stringify(pkg?.versions.map((v) => v.version)) === '[1,2]', `版本应为 1、2：${JSON.stringify(pkg?.versions.map((v) => v.version))}`)
  const v2 = await readVersion(pkg!.versions.find((v) => v.version === 2)!.url, 'lesson-v2.zip')
  out.v2 = { version: v2.manifest.version, pageCount: v2.manifest.pageCount, samePackageId: v2.manifest.packageId === first.packageId }

  // 5. 撤回 → 撤回单验签
  const recalled = await api('POST', `/api/prep/packages/${first.packageId}/recall`, { requestId: rid('recall'), reason: '全链走查：撤回演示' })
  check(recalled.status === 200 && typeof recalled.body.recallUrl === 'string', `撤回 ${recalled.status}`)
  const slipBytes = await download(recalled.body.recallUrl as string, 'recall.json')
  writeFileSync(join(ctx.outDir, 'recall.json'), slipBytes)
  const slip = readRecall(slipBytes, { publicKeys })
  check(slip.packageId === first.packageId, '撤回单的包 id')
  writeFileSync(join(ctx.outDir, 'public.pem'), ctx.publicKeyPem)
  const after = await api('POST', `/api/prep/courses/${revisionId}/package`, { requestId: rid('after') })
  check(after.status === 202 && after.body.packageId !== first.packageId, `撤回后再导出应得到新包：${after.status}`)
  await ctx.waitRender('after-recall', revisionId)
  out.recall = { verified: slip.packageId === first.packageId, newPackageAfterRecall: after.body.packageId !== first.packageId }
  summary.package = out
}

// 假模型端到端（S3 迁入后的验收；S4 起接着导出课程包两版与撤回单，见 package-flow.ts）：api + harness + render 排空子进程 + 静态前端（模仿 Nginx）。
// 经 api 走完整条备课链，再用浏览器核对面板（链路在 prep-flow.ts，与 3e 的容器栈共用）。
// 只动 course_test_prep_e2e3d* schema 与 course_test_prep_e2e3d_* 账号；准备阶段失败也清理。summary.json 只含固定度量（时间、id 等运行间差异的字段不写）。
// 用法：corepack pnpm build && corepack pnpm -C apps/prep-api e2e:prep [--real-browser]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPackageFlow } from './package-flow.ts'
import { runPrepFlow } from './prep-flow.ts'
import { startPrepStack } from './prep-stack.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
// S3 的结果留在 2026-10-17-s3-prep；S4 起写到这里（课程包、撤回单、公钥给自习室的跨产品全链用）
const OUT = join(ROOT, 'docs', 'real-check', '2026-10-17-s4-package')
const SCHEMA = 'course_test_prep_e2e3d'
const T = 'course_test_prep_e2e3d_t'
const fakeCapture = !process.argv.includes('--real-browser')
const problems: string[] = []
const check = (ok: boolean, message: string) => { if (!ok) problems.push(message) }
const summary: Record<string, unknown> = { fakeCapture }
let stack: Awaited<ReturnType<typeof startPrepStack>> | undefined

/**
 * 排空并核对（同 3c e2e 的 drainAndVerify）：排空脚本跑满 --max-jobs 时也以 0 退出，所以要 truncated 为 false、counts 里有 idle，
 * 且本课没有排队或运行中的任务。summary 只留 counts（排空汇总里的时间字段不写）。
 */
async function drainAndVerify(label: string, courseId: string): Promise<Record<string, unknown>> {
  const drained = await stack!.drain()
  const counts = (drained.counts ?? {}) as Record<string, number>
  check(drained.truncated === false, `${label} 排空跑满 --max-jobs 还没到 idle：${JSON.stringify(counts)}`)
  check(counts.idle === 1, `${label} 排空没有跑到 idle：${JSON.stringify(counts)}`)
  const left = (await stack!.pool.query(`select count(*)::int as n from ${SCHEMA}.render_jobs where course_id = $1 and status in ('queued', 'running')`, [courseId])).rows[0] as { n: number }
  check(left.n === 0, `${label} 排空后仍有 ${left.n} 个排队或运行中的任务`)
  return { counts }
}

try {
  stack = await startPrepStack({ mode: 'fake', schema: SCHEMA, owners: [T], fakeCapture })
  await stack.pool.query(`update account.users set external_id = 'yy_' || username where username = $1`, [T])
  await stack.store.setCredential(T, { apiKey: `key-${T}` })
  const token = await stack.store.createToken(T)
  const live = stack
  const ctx = {
    webBase: live.webBase, apiBase: live.apiBase, token, courseSchema: SCHEMA, ridPrefix: 'req-e2e3d', panelOut: join(OUT, 'panel.png'), liveWorker: false,
    query: (sql: string, params: unknown[]) => live.pool.query(sql, params), waitRender: drainAndVerify,
  }
  const flow = await runPrepFlow(ctx, summary, check)
  if (flow.courseId && problems.length === 0) await runPackageFlow({ ...ctx, outDir: OUT, publicKeyPem: live.packagePublicKeyPem }, flow.courseId, summary, check)
  else check(false, '备课链没走通，跳过课程包')
} catch (error) {
  problems.push(`中断：${error instanceof Error ? error.name : 'error'}`)
  process.stderr.write(`中断：${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
} finally {
  await stack?.stop().catch(() => undefined)
}
summary.problems = problems
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ ok: problems.length === 0, problems })}\n`)
process.exit(problems.length === 0 ? 0 : 1)

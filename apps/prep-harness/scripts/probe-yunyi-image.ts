// D3 实测（3c）：云一网关有没有可用的图像模型。只读 .env 的 LEARNING_LLM_API_KEY（dotenv.parse，不并进 process.env），
// 只打印模型 id 与状态码，不打印密钥；写文件前做密钥值匹配检查。
// 用法：corepack pnpm -C apps/prep-harness exec tsx scripts/probe-yunyi-image.ts [--generate]
// 不带 --generate 只列模型；带上时对第一个疑似图像模型发一次最小的生成请求（产生一次费用，计到该凭证）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OUT = join(ROOT, 'docs', 'real-check', '2026-10-14-phase3c-prep', 'image-probe.json')
// 与 apps/prep-harness/src/llm-yunyi.ts:318 的缺省一致；固定写死、不读 .env 的地址（3c 实测时 .env 的 LEARNING_LLM_BASE_URL 与此相同，早先 2e/2f 记录过地址与密钥不配套的 401）
const BASE = 'https://api.everai.cloud/v1'
const IMAGE_ID = /image|img|cogview|wanx|flux|dall|seedream|kolors|stable-?diffusion|sdxl/i

const envFile = join(ROOT, '.env')
const key = existsSync(envFile) ? parse(readFileSync(envFile)).LEARNING_LLM_API_KEY?.trim() : undefined
if (!key) {
  process.stdout.write('跳过：.env 没有 LEARNING_LLM_API_KEY\n')
  process.exit(0)
}
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
const redact = (text: string): string => text.split(key).join('[REDACTED]')

const report: Record<string, unknown> = { base: BASE, at: new Date().toISOString() }
const models = await fetch(`${BASE}/models`, { headers })
report.modelsStatus = models.status
const ids = models.ok ? (((await models.json()) as { data?: Array<{ id?: string }> }).data ?? []).map((model) => model.id ?? '').filter(Boolean) : []
report.modelCount = ids.length
report.imageCandidates = ids.filter((id) => IMAGE_ID.test(id))
if (process.argv.includes('--generate')) {
  const model = (report.imageCandidates as string[])[0]
  if (model) {
    const res = await fetch(`${BASE}/images/generations`, { method: 'POST', headers, body: JSON.stringify({ model, prompt: '白色背景上的一个红色圆形，简单示意图', size: '1024x1024', n: 1, response_format: 'b64_json' }) })
    const text = await res.text()
    let body: { data?: Array<{ b64_json?: string; url?: string }> } = {}
    try { body = JSON.parse(text) as typeof body } catch { body = {} }
    const b64 = body.data?.[0]?.b64_json
    report.generate = { model, status: res.status, hasB64: Boolean(b64), hasUrl: Boolean(body.data?.[0]?.url), b64Bytes: b64 ? Buffer.from(b64, 'base64').byteLength : 0, errorHead: res.ok ? null : redact(text.slice(0, 200)) }
  } else {
    report.generate = { skipped: '没有疑似图像模型' }
  }
}
const json = `${JSON.stringify(report, null, 2)}\n`
if (json.includes(key)) throw new Error('探测结果里出现了密钥，拒绝写文件')
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, json)
process.stdout.write(json)

// 渲染页的数据通路（3b 已定事实"渲染数据通路"）：worker 在自己的浏览器上下文里拦截请求并供数，不经任何 HTTP 接口。
// - /api/prep/render/<courseId>/：只认本任务的 courseId，返回 { contract, course }；别的 id 一律 404
// - /api/prep/artifacts/<id>：只给本任务 owner 的产物，且只放行存储收的图片类型 png/jpeg/webp/svg；取不到 404（页面里按坏图计，门禁会拦）；
//   svg 响应带锁死的 CSP 与 nosniff（Ruling [final]）
// - 页面源（apps/prep-web 静态站点）上的其他 /api 一律 404；页面源之外的请求一律拦下（TTS、公共图像服务、外链字体都到不了外网）
// - /api 判断见 classifyRequestPath：原始路径与每轮解码结果都归一检查，任一是 api 即按 api；
//   含 %25、反斜杠、%2f、%5c 或解码失败的路径直接拦下（Ruling [T7] I1/N1）
// - WebSocket 不经 context.route，单独拦：一律关闭，不连任何服务端（Ruling [T7] I2）
// - 数据源抛错时回 500 并记入 failed，不让异常逃出路由回调（Ruling [T7] I3）
import type { BrowserContext, Route } from 'playwright-core'
import { parseCourseArtifactPath, parseProjectionRenderDataPath, PROJECTION_RENDER_CONTRACT } from '@maolab/course'
import { ARTIFACT_CONTENT_TYPES } from '@maolab/domain'

export interface ProjectionDataSource {
  courseId: string
  course(): Promise<unknown | undefined>
  artifact(id: string): Promise<{ bytes: Uint8Array; contentType: string } | undefined>
}

export interface InterceptLog {
  served: string[]
  notFound: string[]
  /** 被拦下的请求：页面源之外的记 origin（含 ws://），页面源上的可疑路径记原始 pathname */
  blocked: string[]
  /** 数据源抛错（回 500）的路径 */
  failed: string[]
}

const MAX_DECODE_ROUNDS = 3
const ENCODED_SEPARATOR = /\\|%2f|%5c/i
/**
 * 产物放行存储收的全部图片类型（Ruling [final]，取代 Ruling [T7] N4 的只放位图）：经纬网 svg 是 3a 生成链路的现有输出；
 * 渲染页用 <img> 加载 svg 不执行脚本，直接导航到 svg 的情况由 SVG_HEADERS 的 CSP 兜住。gif 存储不收，不列（M2）。
 */
export const RENDER_ARTIFACT_CONTENT_TYPES: ReadonlySet<string> = new Set(ARTIFACT_CONTENT_TYPES.filter((type) => type.startsWith('image/')))
const SVG_HEADERS = { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'X-Content-Type-Options': 'nosniff' }

/** 只合并斜杠、解析点段、小写（不解码） */
function collapsePath(path: string): string {
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return `/${segments.join('/')}`.toLowerCase()
}

function isApiPath(normalized: string): boolean {
  return normalized === '/api' || normalized.startsWith('/api/')
}

/**
 * 同源请求路径的分类（Ruling [T7] I1/N1）：
 * - abort：原始路径含 %25（多重编码；静态导出从不需要）、反斜杠、%2f、%5c，或任一轮解码失败、解码出分隔符，或 3 轮后仍在变
 * - api：原始路径或任一轮解码后的结果，归一后是 /api 或 /api/ 开头（Nginx 只解一次，任何一种读法是 api 都按 api 处理）
 * - static：其余
 */
export function classifyRequestPath(rawPathname: string): 'abort' | 'api' | 'static' {
  if (/%25/i.test(rawPathname)) return 'abort'
  let current = rawPathname
  let api = false
  // 第 0 轮是原始路径；之后最多解码 3 轮，第 4 次只用来确认已不再变化
  for (let round = 0; round <= MAX_DECODE_ROUNDS; round += 1) {
    if (ENCODED_SEPARATOR.test(current)) return 'abort'
    if (isApiPath(collapsePath(current))) api = true
    let next: string
    try { next = decodeURIComponent(current) } catch { return 'abort' }
    if (next === current) return api ? 'api' : 'static'
    current = next
  }
  return 'abort'
}

export async function installProjectionRoutes(context: BrowserContext, origin: string, source: ProjectionDataSource): Promise<InterceptLog> {
  const log: InterceptLog = { served: [], notFound: [], blocked: [], failed: [] }
  const allowed = new URL(origin).origin
  const notFound = (route: Route, path: string) => { log.notFound.push(path); return route.fulfill({ status: 404, body: '' }) }
  const failed = (route: Route, path: string) => { log.failed.push(path); return route.fulfill({ status: 500, body: '' }) }
  await context.routeWebSocket(() => true, (ws) => {
    let target = ws.url()
    try { target = new URL(ws.url()).origin } catch { /* 记原样 */ }
    log.blocked.push(target)
    return ws.close()
  })
  const handle = async (route: Route) => {
    const url = new URL(route.request().url())
    if (url.origin !== allowed) {
      log.blocked.push(url.origin)
      return route.abort('blockedbyclient')
    }
    const kind = classifyRequestPath(url.pathname)
    if (kind === 'abort') {
      log.blocked.push(url.pathname)
      return route.abort('blockedbyclient')
    }
    if (kind === 'static') return route.continue()
    // 已知的两条路径只认规范写法（原始 pathname 精确匹配），其余 /api 一律 404
    const dataId = parseProjectionRenderDataPath(url.pathname)
    if (dataId !== undefined) {
      if (dataId !== source.courseId) return notFound(route, url.pathname)
      let course: unknown
      try { course = await source.course() } catch { return failed(route, url.pathname) }
      if (!course) return notFound(route, url.pathname)
      log.served.push(url.pathname)
      return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ contract: PROJECTION_RENDER_CONTRACT, course }) })
    }
    const artifactId = parseCourseArtifactPath(url.pathname)
    if (artifactId !== undefined) {
      let artifact: Awaited<ReturnType<ProjectionDataSource['artifact']>>
      try { artifact = await source.artifact(artifactId) } catch { return failed(route, url.pathname) }
      const type = artifact?.contentType.split(';')[0]!.trim().toLowerCase()
      if (!artifact || !type || !RENDER_ARTIFACT_CONTENT_TYPES.has(type)) return notFound(route, url.pathname)
      log.served.push(url.pathname)
      return route.fulfill({ status: 200, contentType: type, headers: type === 'image/svg+xml' ? SVG_HEADERS : { 'X-Content-Type-Options': 'nosniff' }, body: Buffer.from(artifact.bytes) })
    }
    return notFound(route, url.pathname)
  }
  // 兜底：回调里的任何异常（含上下文已关闭时的 fulfill 失败）都不能逃成未处理的拒绝
  await context.route('**/*', (route) => handle(route).catch(() => route.abort('failed').catch(() => undefined)))
  return log
}

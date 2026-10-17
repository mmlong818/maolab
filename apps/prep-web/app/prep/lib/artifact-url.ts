// 课程文档与任务结果里的产物地址（/api/prep/artifacts/<id>，api 按 owner 校验）给 <img> 与下载链接用：浏览器带不了请求头，统一加 ?token=（tokenize 由调用方给 withAuthToken）。
// 不改原对象；已带 token 的地址不重复加。只认产物前缀，渲染页的数据地址（projectionRenderDataPath，api 永远 404）不在此列。
export const ARTIFACT_PREFIX = '/api/prep/artifacts/'
const hasToken = (url: string) => /[?&]token=/.test(url)

export function withArtifactTokens<T>(value: T, tokenize: (url: string) => string): T {
  if (typeof value === 'string') return (value.startsWith(ARTIFACT_PREFIX) && value.length > ARTIFACT_PREFIX.length && !/\s/.test(value) && !hasToken(value) ? tokenize(value) : value) as T
  if (Array.isArray(value)) return value.map((v) => withArtifactTokens(v, tokenize)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withArtifactTokens(v, tokenize)])) as T
  return value
}

export const isArtifactUrl = (url: string): boolean => url.startsWith(ARTIFACT_PREFIX) && url.length > ARTIFACT_PREFIX.length && !/\s/.test(url)

/** 下载链接：只给产物地址（ARTIFACT_PREFIX 开头）加 token（终审 M6 纵深防御：任务结果里别的地址一律不带 token） */
export function downloadHref(url: string, filename: string | null, tokenize: (url: string) => string): string {
  const named = filename ? `${url}${url.includes('?') ? '&' : '?'}name=${encodeURIComponent(filename)}` : url
  return isArtifactUrl(url) ? tokenize(named) : named
}

// 3d 终审修复（T14 review minor）：本机模拟 Nginx 时按 Nginx 的方式归一请求路径，再做 location 判定。
// Nginx 匹配 location 前先归一 URI：%XX 解码一次（解出的 / 与 . 照样参与归一）、合并重复斜杠（merge_slashes 缺省开）、
// 处理 . 与 ..（越过根是 400），? 之后是查询串。非法的 % 转义与解出的 NUL 也是 400。大小写不变（location 区分大小写）。
// apps/prep-web/nginx 的 `location ^~ /api/prep/render` 是纯前缀：/api/prep/renderfoo 同样命中（404），所以这里用 startsWith，不要求后面跟 /。

/** 归一后的路径；Nginx 会回 400 的请求返回 null */
export function nginxNormalizedPath(rawUrl: string): string | null {
  const path = rawUrl.split('?', 1)[0] ?? ''
  if (!path.startsWith('/')) return null
  if (/%(?![0-9a-fA-F]{2})/.test(path)) return null
  const decoded = path.replace(/%([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
  if (decoded.includes('\0')) return null
  const segments: string[] = []
  const parts = decoded.split('/')
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(seg)
  }
  const last = parts.at(-1)
  const trailing = segments.length > 0 && (last === '' || last === '.' || last === '..')
  return `/${segments.join('/')}${trailing ? '/' : ''}`
}

/** 与 `location ^~ /api/prep/render` 同一判定（先归一，再纯前缀） */
export const nginxBlocksPrepRender = (normalized: string): boolean => normalized.startsWith('/api/prep/render')

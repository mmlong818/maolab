// 终审修复（T14 review minor）：本机模拟 Nginx 的路径归一与 `location ^~ /api/prep/render` 一致
import { expect, test } from 'vitest'
import { nginxBlocksPrepRender, nginxNormalizedPath } from '../scripts/nginx-path.ts'

test('normalizes like nginx: decode once, merge slashes, dot segments; bad escapes and escaping the root are 400', () => {
  expect(nginxNormalizedPath('/api/prep/%72ender/c-1/?token=x')).toBe('/api/prep/render/c-1/')
  expect(nginxNormalizedPath('/api//prep///render')).toBe('/api/prep/render')
  expect(nginxNormalizedPath('/api/prep/./render')).toBe('/api/prep/render')
  expect(nginxNormalizedPath('/api/x/../prep/render/')).toBe('/api/prep/render/')
  expect(nginxNormalizedPath('/api/prep%2Frender')).toBe('/api/prep/render')
  expect(nginxNormalizedPath('/api/prep%252Frender')).toBe('/api/prep%2Frender')
  expect(nginxNormalizedPath('/%61pi/prep/status')).toBe('/api/prep/status')
  expect(nginxNormalizedPath('/')).toBe('/')
  for (const bad of ['/api/prep/%zz', '/../api/prep/render', '/api/%00/x', 'api/prep']) expect([bad, nginxNormalizedPath(bad)]).toEqual([bad, null])
})

test('the render location is a pure prefix after normalization (renderfoo, %72ender and /./render are blocked; other prep paths are not)', () => {
  const blocked = (url: string) => { const p = nginxNormalizedPath(url); return p !== null && nginxBlocksPrepRender(p) }
  for (const url of ['/api/prep/render', '/api/prep/render/c-1/', '/api/prep/renderfoo', '/api/prep/%72ender/c-1/', '/api/prep/./render', '//api//prep/render', '/api/prep%2Frender/c-1']) expect([url, blocked(url)]).toEqual([url, true])
  for (const url of ['/api/prep/status', '/api/prep/courses/c-1/render', '/api/Prep/render', '/api/prep/rend', '/prep/render']) expect([url, blocked(url)]).toEqual([url, false])
})

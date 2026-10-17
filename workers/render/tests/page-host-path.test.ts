import { expect, test } from 'vitest'
import { ARTIFACT_CONTENT_TYPES } from '@maolab/domain'
import { classifyRequestPath, RENDER_ARTIFACT_CONTENT_TYPES } from '../src/page-host.ts'

test('ordinary static paths pass through', () => {
  expect(classifyRequestPath('/prep/render/')).toBe('static')
  expect(classifyRequestPath('/_next/static/chunks/app/%5Bid%5D/page-abc.js')).toBe('static')
  expect(classifyRequestPath('/apix/y')).toBe('static')
})

test('api paths are recognised however they are spelled', () => {
  expect(classifyRequestPath('/api')).toBe('api')
  expect(classifyRequestPath('/api/prep/render/x/')).toBe('api')
  expect(classifyRequestPath('//api/x')).toBe('api')
  expect(classifyRequestPath('/API/x')).toBe('api')
  expect(classifyRequestPath('/%61pi/x')).toBe('api')
})

test('a path that is api before decoding stays api even if decoding dot segments would remove the api segment', () => {
  // Nginx 匹配 location 时看到的是 /api/..（只解一次）；归一后 /x 不能把它变成静态请求
  expect(classifyRequestPath('/api/%2e%2e/x')).toBe('api')
  expect(classifyRequestPath('/api/.%2e/x')).toBe('api')
})

test('%25, encoded separators, backslashes and undecodable paths are aborted', () => {
  expect(classifyRequestPath('/api/%252e%252e/x')).toBe('abort')
  expect(classifyRequestPath('/api/x%252f..%252f..%252fy')).toBe('abort')
  expect(classifyRequestPath('/%2561pi/x')).toBe('abort')
  expect(classifyRequestPath('/a/..%2fapi/x')).toBe('abort')
  expect(classifyRequestPath('/a/..%5Capi/x')).toBe('abort')
  expect(classifyRequestPath('/a\\b')).toBe('abort')
  expect(classifyRequestPath('/%E0%A4%A')).toBe('abort')
})

test('the render page serves exactly the image types the artifact store accepts: no gif, svg included (Ruling [final], M2)', () => {
  expect([...RENDER_ARTIFACT_CONTENT_TYPES].sort()).toEqual(['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'])
  expect([...RENDER_ARTIFACT_CONTENT_TYPES].every((type) => ARTIFACT_CONTENT_TYPES.includes(type))).toBe(true)
})

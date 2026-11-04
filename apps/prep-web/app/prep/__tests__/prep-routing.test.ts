import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import nextConfig from '../../../next.config'

const root = resolve(__dirname, '..', '..', '..')
const conf = () => readFileSync(resolve(root, 'nginx', 'default.conf.template'), 'utf8')

test('nginx sends /api/prep to the Node api, streaming with a long read timeout, after the ^~ render 404 and before the generic /api/', () => {
  const c = conf()
  const render = c.indexOf('location ^~ /api/prep/render {')
  const prep = c.indexOf('location ~ ^/api/prep(/|$) {')
  expect(render).toBeGreaterThan(-1)
  expect(prep).toBeGreaterThan(render)
  expect(prep).toBeLessThan(c.indexOf('location /api/ {'))
  const block = c.slice(prep, c.indexOf('\n    }', prep))
  expect(block).toContain('proxy_pass ${API_UPSTREAM};')
  expect(block).toContain('proxy_buffering off;')
  expect(block).toContain('proxy_read_timeout 900s;')
  expect(block).toContain('gzip off;')
})

test('nginx forwards only /.well-known/acme-challenge/ to ACME_UPSTREAM (cert-manager), and the image renders both variables', () => {
  const c = conf()
  const at = c.indexOf('location ^~ /.well-known/acme-challenge/ {')
  expect(at).toBeGreaterThan(-1)
  expect(at).toBeLessThan(c.indexOf('location = / {'))
  expect(c.slice(at, c.indexOf('\n    }', at))).toContain('proxy_pass ${ACME_UPSTREAM};')
  const docker = readFileSync(resolve(root, 'Dockerfile'), 'utf8')
  expect(docker).toContain('ACME_UPSTREAM=https://cert-manager.sdp.ndaeweb.com')
  expect(docker).toMatch(/NGINX_ENVSUBST_FILTER='\^\(API_UPSTREAM\|ACME_UPSTREAM\)\$'/)
})

test('next dev forwards every /api path to prep-api (the api itself answers 404 for the render path)', async () => {
  const rules = (await (nextConfig('phase-development-server').rewrites as () => Promise<{ beforeFiles: Array<{ source: string; destination: string }> }>)()).beforeFiles
  expect(rules).toEqual([{ source: '/api/:path*', destination: 'http://127.0.0.1:8101/api/:path*' }])
})

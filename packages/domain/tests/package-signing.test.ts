import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSigningKeyPair } from '@maolab-core/course-package'
import { expect, test } from 'vitest'
import { courseCoreVersion, loadPackageSigningKey } from '../src/package-signing.ts'

const dir = mkdtempSync(join(tmpdir(), 'maolab-signing-'))
const pair = generateSigningKeyPair()
const keyFile = join(dir, 'private.pem')
writeFileSync(keyFile, pair.privateKeyPem)

test('unset means packages cannot be signed (export answers 503), not a startup failure', () => {
  expect(loadPackageSigningKey({})).toBeUndefined()
  expect(loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: '  ' })).toBeUndefined()
})

test('a configured key file is read and its key id matches the public key', () => {
  expect(loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: keyFile })?.keyId).toBe(pair.keyId)
})

test('a configured but missing or wrong key refuses to start, without echoing the file content', () => {
  expect(() => loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: join(dir, 'nope.pem') })).toThrow(/MAOLAB_PACKAGE_SIGNING_KEY/)
  const publicOnly = join(dir, 'public.pem')
  writeFileSync(publicOnly, pair.publicKeyPem)
  expect(() => loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: publicOnly })).toThrow(/MAOLAB_PACKAGE_SIGNING_KEY/)
})

// 平台（SDP）不方便挂文件：变量值也可以直接是 PEM 内容；门户的环境变量常把换行存成字面的 \n
test('the variable may hold the PEM itself, with real or escaped newlines', () => {
  expect(loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: pair.privateKeyPem })?.keyId).toBe(pair.keyId)
  expect(loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: pair.privateKeyPem.trim().replace(/\r?\n/g, '\\n') })?.keyId).toBe(pair.keyId)
})

test('inline PEM that is not an ed25519 private key refuses to start without echoing the key', () => {
  let message = ''
  try { loadPackageSigningKey({ MAOLAB_PACKAGE_SIGNING_KEY: pair.publicKeyPem }) } catch (e) { message = (e as Error).message }
  expect(message).toMatch(/MAOLAB_PACKAGE_SIGNING_KEY/)
  expect(message).not.toContain('BEGIN')
  expect(message).not.toContain(pair.publicKeyPem.split('\n')[1]!)
})

test('the core version written into packages is the installed course-package version', () => {
  expect(courseCoreVersion()).toMatch(/^\d+\.\d+\.\d+$/)
})

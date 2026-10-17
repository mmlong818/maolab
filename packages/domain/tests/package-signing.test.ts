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

test('the core version written into packages is the installed course-package version', () => {
  expect(courseCoreVersion()).toMatch(/^\d+\.\d+\.\d+$/)
})

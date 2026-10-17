// S4：生成课程包签名钥。私钥（private.pem，0600）给备课室的 api 与 render worker（MAOLAB_PACKAGE_SIGNING_KEY 指向它），
// 公钥（public.pem）交给云一自习室运营（YUNYI_PACKAGE_PUBLIC_KEYS）。不覆盖已有文件：轮换时换一个目录生成，自习室新旧公钥并存。
// 用法：corepack pnpm -C apps/prep-api package:keygen --out <目录>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { generateSigningKeyPair } from '@maolab-core/course-package'

export interface KeyFiles { keyId: string; privateKeyPath: string; publicKeyPath: string; publicKeyPem: string }

export function exportKeyFiles(dir: string): KeyFiles {
  const privateKeyPath = join(dir, 'private.pem')
  const publicKeyPath = join(dir, 'public.pem')
  for (const path of [privateKeyPath, publicKeyPath]) if (existsSync(path)) throw new Error(`已存在，不覆盖：${path}`)
  mkdirSync(dir, { recursive: true })
  const pair = generateSigningKeyPair()
  writeFileSync(privateKeyPath, pair.privateKeyPem, { mode: 0o600 })
  writeFileSync(publicKeyPath, pair.publicKeyPem)
  return { keyId: pair.keyId, privateKeyPath, publicKeyPath, publicKeyPem: pair.publicKeyPem }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: 'string' } } })
  if (!values.out) {
    process.stderr.write('用法：package:keygen --out <目录>\n')
    process.exit(2)
  }
  const out = exportKeyFiles(resolve(values.out))
  process.stdout.write(`${JSON.stringify({ keyId: out.keyId, privateKey: out.privateKeyPath, publicKey: out.publicKeyPath })}\n`)
}

// S4：课程包签名钥（render worker 签包、api 签撤回单）。MAOLAB_PACKAGE_SIGNING_KEY 是 ed25519 私钥 PEM 文件的路径，
// 或直接是 PEM 内容（以 -----BEGIN 开头；平台环境变量里换行可写成字面的 \n）。
// 没设 = 本实例不能导出课程包（接口答 503），设了却读不出 = 配置错误，启动即失败。私钥内容不进错误信息，路径才进。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { signingKeyFromPem, type SigningKey } from '@maolab-core/course-package'

export const PACKAGE_SIGNING_KEY_ENV = 'MAOLAB_PACKAGE_SIGNING_KEY'

export function loadPackageSigningKey(env: NodeJS.ProcessEnv = process.env): SigningKey | undefined {
  const path = env[PACKAGE_SIGNING_KEY_ENV]?.trim()
  if (!path) return undefined
  if (path.startsWith('-----BEGIN')) {
    try {
      return signingKeyFromPem(path.replace(/\\n/g, '\n'))
    } catch {
      throw new Error(`${PACKAGE_SIGNING_KEY_ENV} 不是 ed25519 私钥（PKCS#8 PEM）：变量里直接写的 PEM`)
    }
  }
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`${PACKAGE_SIGNING_KEY_ENV} 指向的文件读不了：${path}`)
  }
  try {
    return signingKeyFromPem(pem)
  } catch {
    throw new Error(`${PACKAGE_SIGNING_KEY_ENV} 不是 ed25519 私钥（PKCS#8 PEM）：${path}`)
  }
}

/** 已安装的 @maolab-core/course-package 版本（写进 manifest.exporter.coreVersion）；包只导出 "."，按入口文件找 package.json */
export function courseCoreVersion(): string {
  const entry = createRequire(import.meta.url).resolve('@maolab-core/course-package')
  const pkg = JSON.parse(readFileSync(join(dirname(entry), '..', 'package.json'), 'utf8')) as { version?: unknown }
  if (typeof pkg.version !== 'string') throw new Error('@maolab-core/course-package 的 package.json 没有 version')
  return pkg.version
}

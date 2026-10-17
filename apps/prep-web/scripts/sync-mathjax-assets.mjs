import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_VERSION = '4.1.3'
const RESOURCE_ID = 'cross.math-typesetting-local-runtime'
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const OUTPUT_ROOT = path.join(APP_ROOT, 'public', 'vendor', 'mathjax')
const require = createRequire(import.meta.url)
const PACKAGE_ROOT = path.dirname(require.resolve('mathjax/package.json'))
const MHCHEM_PACKAGE_ROOT = path.dirname(
  require.resolve('@mathjax/mathjax-mhchem-font-extension/package.json'),
)

const COPY_ALLOWLIST = [
  'LICENSE',
  'tex-svg.js',
  'a11y',
  'sre',
  path.join('input', 'tex', 'extensions'),
]

const MHCHEM_COPY_ALLOWLIST = ['package.json', 'svg.js']
const MHCHEM_OUTPUT_ROOT = path.join(OUTPUT_ROOT, 'font-extensions', 'mhchem')

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolute))
    } else if (entry.isFile()) {
      files.push(absolute)
    }
  }

  return files
}

async function copyAllowlistedAssets() {
  const packageInfo = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  const mhchemPackageInfo = JSON.parse(
    await readFile(path.join(MHCHEM_PACKAGE_ROOT, 'package.json'), 'utf8'),
  )
  if (packageInfo.version !== EXPECTED_VERSION) {
    throw new Error(`MathJax 版本漂移：期望 ${EXPECTED_VERSION}，实际 ${packageInfo.version}`)
  }
  if (mhchemPackageInfo.version !== EXPECTED_VERSION) {
    throw new Error(
      `MathJax mhchem 字体扩展版本漂移：期望 ${EXPECTED_VERSION}，实际 ${mhchemPackageInfo.version}`,
    )
  }

  const expectedRoot = path.resolve(APP_ROOT, 'public', 'vendor', 'mathjax')
  if (path.resolve(OUTPUT_ROOT) !== expectedRoot) {
    throw new Error('MathJax 客户端资源目录校验失败')
  }

  await rm(OUTPUT_ROOT, { recursive: true, force: true })
  await mkdir(OUTPUT_ROOT, { recursive: true })

  for (const relative of COPY_ALLOWLIST) {
    const source = path.join(PACKAGE_ROOT, relative)
    await stat(source)
    await cp(source, path.join(OUTPUT_ROOT, relative), { recursive: true })
  }

  await mkdir(MHCHEM_OUTPUT_ROOT, { recursive: true })
  for (const relative of MHCHEM_COPY_ALLOWLIST) {
    const source = path.join(MHCHEM_PACKAGE_ROOT, relative)
    await stat(source)
    await cp(source, path.join(MHCHEM_OUTPUT_ROOT, relative))
  }

  const copiedFiles = (await listFiles(OUTPUT_ROOT)).sort()
  const files = await Promise.all(copiedFiles.map(async absolute => {
    const data = await readFile(absolute)
    return {
      path: path.relative(OUTPUT_ROOT, absolute).split(path.sep).join('/'),
      bytes: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
    }
  }))

  const manifest = {
    resourceId: RESOURCE_ID,
    package: 'mathjax',
    version: packageInfo.version,
    license: packageInfo.license,
    entrypoint: 'tex-svg.js',
    copiedFrom: COPY_ALLOWLIST.map(relative => relative.split(path.sep).join('/')),
    fontExtension: {
      package: mhchemPackageInfo.name,
      version: mhchemPackageInfo.version,
      license: mhchemPackageInfo.license,
      target: 'font-extensions/mhchem',
      copiedFrom: MHCHEM_COPY_ALLOWLIST,
    },
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  }

  await writeFile(
    path.join(OUTPUT_ROOT, 'mathjax-assets.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  process.stdout.write(
    `MathJax ${manifest.version} 同源资源已同步：${manifest.fileCount} 个文件，${manifest.totalBytes} 字节\n`,
  )
}

await copyAllowlistedAssets()

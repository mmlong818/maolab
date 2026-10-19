/**
 * 导入知识点种子包到本地数据库（需先 `pnpm db:init`）
 *
 * 用法:
 *   pnpm db:seed-kp                       # 从 GitHub 最新 Release 下载 kp-seed.sqlite.gz
 *   pnpm db:seed-kp --file <path>         # 使用本地种子包（.sqlite.gz）
 *
 * 本地库已有 pep-cn 知识点时拒绝执行，不覆盖已有数据。
 */
import { createReadStream, createWriteStream, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import Database from 'better-sqlite3'

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') ?? './data/maolab.db'
const RELEASE_URL = 'https://github.com/mmlong818/maolab/releases/latest/download/kp-seed.sqlite.gz'
// 顺序满足外键依赖
const TABLES = [
  'knowledge_point_clusters',
  'knowledge_points',
  'knowledge_point_sources',
  'chapter_node_knowledge_points',
  'kp_relations',
]

async function fetchSeedGz(dir: string): Promise<string> {
  const fileArg = process.argv.indexOf('--file')
  if (fileArg !== -1) return process.argv[fileArg + 1]!
  console.log(`[seed-kp] 下载 ${RELEASE_URL}`)
  const res = await fetch(RELEASE_URL).catch((err: Error) => {
    // Node 内置 fetch 默认不读 HTTPS_PROXY，走代理的网络会直接连不上
    throw new Error(`下载失败（${err.message}）。需要代理时设置 NODE_USE_ENV_PROXY=1（Node ≥ 22.21）后重试，` +
      `或手动下载 ${RELEASE_URL} 后用 --file 指定`)
  })
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`)
  const gzPath = join(dir, 'kp-seed.sqlite.gz')
  writeFileSync(gzPath, Buffer.from(await res.arrayBuffer()))
  return gzPath
}

function importSeed(seedPath: string): void {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')
  try {
    const existing = db.prepare(`SELECT COUNT(*) AS n FROM knowledge_points WHERE curriculum_system = 'pep-cn'`)
      .get() as { n: number }
    if (existing.n > 0) throw new Error(`本地库已有 ${existing.n} 条 pep-cn 知识点，未导入。需要重来请先 pnpm db:reset`)
    db.exec(`ATTACH DATABASE '${seedPath}' AS seed`)
    const counts = JSON.parse((db.prepare(`SELECT value FROM seed.seed_meta WHERE key = 'counts'`)
      .get() as { value: string }).value) as Record<string, number>
    db.transaction(() => {
      for (const table of TABLES) {
        const cols = (db.prepare(`PRAGMA seed.table_info(${table})`).all() as { name: string }[])
          .map(c => `\`${c.name}\``).join(', ')
        const n = db.prepare(`INSERT INTO main.${table} (${cols}) SELECT ${cols} FROM seed.${table}`).run().changes
        if (n !== counts[table]) throw new Error(`${table} 导入 ${n} 行，种子包记录为 ${counts[table]}`)
        console.log(`✓ ${table}: ${n}`)
      }
    })()
    db.exec('DETACH DATABASE seed')
  } finally {
    db.close()
  }
}

async function main(): Promise<void> {
  if (!existsSync(DB_PATH)) throw new Error(`${DB_PATH} 不存在，请先运行 pnpm db:init`)
  const dir = mkdtempSync(join(tmpdir(), 'maolab-kp-seed-'))
  try {
    const gzPath = await fetchSeedGz(dir)
    const seedPath = join(dir, 'kp-seed.sqlite')
    await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(seedPath))
    importSeed(seedPath)
    console.log('[seed-kp] 完成')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`[seed-kp] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})

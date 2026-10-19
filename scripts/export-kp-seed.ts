/**
 * 导出知识点种子包（仅 pep-cn 教材知识点，不含学生/课程等应用数据）
 *   data/kp-seed.sqlite.gz  → 作为 GitHub Release 附件发布，新开发者用 `pnpm db:seed-kp` 导入
 */
import { createReadStream, createWriteStream, rmSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import Database from 'better-sqlite3'

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') ?? './data/maolab.db'
const SEED_PATH = './data/kp-seed.sqlite'

const KP_IDS = `(SELECT id FROM main.knowledge_points WHERE curriculum_system = 'pep-cn')`
// 顺序即导入顺序，满足外键依赖
const SEED_TABLES: Array<[string, string]> = [
  ['knowledge_point_clusters', `id IN (SELECT cluster_id FROM main.knowledge_points WHERE curriculum_system = 'pep-cn')`],
  ['knowledge_points', `id IN ${KP_IDS}`],
  ['knowledge_point_sources', `knowledge_point_id IN ${KP_IDS}`],
  ['chapter_node_knowledge_points', `knowledge_point_id IN ${KP_IDS}`],
  ['kp_relations', `from_kp_id IN ${KP_IDS} AND to_kp_id IN ${KP_IDS}`],
]

async function main(): Promise<void> {
  rmSync(SEED_PATH, { force: true })
  // 对 maolab.db 只做 SELECT，写入只发生在挂载的 seed 库
  new Database(SEED_PATH).close() // 此构建下 ATTACH 无法自行创建新文件，先建空库
  const db = new Database(DB_PATH, { fileMustExist: true })
  db.exec(`ATTACH DATABASE '${SEED_PATH}' AS seed`)
  const counts: Record<string, number> = {}
  for (const [table, where] of SEED_TABLES) {
    db.exec(`CREATE TABLE seed.${table} AS SELECT * FROM main.${table} WHERE ${where}`)
    counts[table] = (db.prepare(`SELECT COUNT(*) AS n FROM seed.${table}`).get() as { n: number }).n
    console.log(`✓ ${table}: ${counts[table]}`)
  }
  db.exec(`CREATE TABLE seed.seed_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  db.prepare(`INSERT INTO seed.seed_meta VALUES ('exported_at', ?), ('counts', ?)`)
    .run(new Date().toISOString(), JSON.stringify(counts))
  db.exec('VACUUM seed')
  db.exec('DETACH DATABASE seed')
  db.close()
  await pipeline(createReadStream(SEED_PATH), createGzip({ level: 9 }), createWriteStream(`${SEED_PATH}.gz`))
  rmSync(SEED_PATH)
  console.log(`\n输出: ${SEED_PATH}.gz (${(statSync(`${SEED_PATH}.gz`).size / 2 ** 20).toFixed(1)} MB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

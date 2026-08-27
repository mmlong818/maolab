/**
 * seed-rehearsal-mastery · 为排练场灌一份**可解释、可精确撤销**的种子学情
 * (C-0' A 方向,2026-07-28)
 *
 * 背景:16 门主线课的 KP 在 concept_mastery 里零覆盖(表里仅有的 8 行是孤儿数据,
 * concept_id 不属于任何现存课程)。排练引擎按铁律「无学情记录 → 零反应」,
 * 于是排练场对所有真实课程都只演绎、不出报告。
 *
 * ## 分数不是随机数
 *
 *   score = 0.72 − 0.16 × 该 KP 被教材标注的误区条数
 *
 * 建模假设写在明处:教材标注误区越多 → 越容易学错 → 假定掌握越弱。
 * 可被质疑、可被替换,但**它有理由**。落地也自洽:排练场恰好在教材认为学生会
 * 栽跟头的地方显出反应。阈值参照 mastery.ts:< 0.6 薄弱,< 0.25 走神。
 *
 * ## 数据安全(首版 P0 的修正)
 *
 * 种子与真实作答同表同 profile 且无来源字段。首版 `--clear` 直接 DELETE、写入直接
 * upsert,文档却说「清掉种子」——真实作答一旦出现,照文档执行会不可逆删改真数据。
 * 现在:
 * - **默认遇到已有记录整批中止**,一行不写;要覆盖须显式 `--force`
 * - 每次写入把原分数与原时间戳记进台账 `data/seed-mastery-ledger.json`
 * - `--clear` 只撤本脚本写的、且此后未被改动过的行——**分数与 last_reviewed_at
 *   都得对上**才认(分数会碰撞:真实作答可能算出同一个数,时间戳才是写入指纹),
 *   对不上就跳过并报告。**宁可留下一条种子,不动一条真数据**
 * - 中途出现真实作答后再次 `--force`,台账基线改记那条真作答,回滚不会把它抹掉
 * - 写入/清理各自放事务;台账先提交库再原子替换文件,崩在中间只会丢「可自动撤销」
 *   这个便利(种子退化为真实数据、无人再碰),不会丢数据
 *
 * 逻辑在 `app/app/lib/mainline/rehearsal/seed-mastery.ts`(有临时库回归测试),
 * 本文件只是 CLI 薄壳。
 *
 * 用法:
 *   pnpm tsx scripts/seed-rehearsal-mastery.ts --list
 *   pnpm tsx scripts/seed-rehearsal-mastery.ts --course <courseId> [--force]
 *   pnpm tsx scripts/seed-rehearsal-mastery.ts --course <courseId> --clear
 */

import { join } from 'node:path'
// 直接用 better-sqlite3 而非 @maolab/db,与 scripts/init-db.ts 一致:
// 根脚本走裸 tsx,不经 Next 的 transpilePackages,workspace 包解析不到。
import Database from 'better-sqlite3'
import {
  clearSeed,
  seedMastery,
  seedScoreFor,
  SEED_PROFILE_ID,
} from '../app/app/lib/mainline/rehearsal/seed-mastery.js'

const DB_PATH = (process.env.DATABASE_URL ?? 'file:./data/maolab.db').replace(/^file:/, '')
const LEDGER_PATH = process.env.SEED_LEDGER_PATH ?? join(DB_PATH, '..', 'seed-mastery-ledger.json')

interface CourseRow { id: string; title: string; data: string }

function mainlineCourses(conn: Database.Database) {
  return (conn.prepare('SELECT id, title, data FROM courses_v2').all() as CourseRow[])
    .flatMap(row => {
      try {
        const parsed = JSON.parse(row.data) as { schemaKind?: string; payload?: Record<string, unknown> }
        return parsed.schemaKind === 'mainline' && parsed.payload
          ? [{ id: row.id, title: row.title, payload: parsed.payload }]
          : []
      } catch {
        return []
      }
    })
}

/** 一门课里每个 KP 被教材标注了几条误区——读幕上的溯源字段,与排练引擎同源。 */
function misconceptionCountByKp(payload: Record<string, unknown>): Map<string, number> {
  const scenes = (payload.scenes ?? []) as { kpId?: string; misconceptionSource?: string; misconceptionSources?: string[] }[]
  const texts = new Map<string, Set<string>>()
  for (const scene of scenes) {
    if (!scene.kpId) continue
    const sources = scene.misconceptionSources?.length
      ? scene.misconceptionSources
      : scene.misconceptionSource ? [scene.misconceptionSource] : []
    if (sources.length === 0) continue
    const bucket = texts.get(scene.kpId) ?? new Set<string>()
    for (const t of sources) bucket.add(t)
    texts.set(scene.kpId, bucket)
  }
  const counts = new Map<string, number>()
  for (const s of (payload.sourceMaterial ?? []) as { kpId?: string }[]) {
    if (s.kpId) counts.set(s.kpId, texts.get(s.kpId)?.size ?? 0)
  }
  return counts
}

function main() {
  const argv = process.argv.slice(2)
  const conn = new Database(DB_PATH)

  if (argv.includes('--list')) {
    const existing = new Set((conn.prepare('SELECT concept_id FROM concept_mastery WHERE profile_id = ?')
      .all(SEED_PROFILE_ID) as { concept_id: string }[]).map(r => r.concept_id))
    console.log('主线课程(id | 标题 | KP 数 | 已有学情覆盖):')
    for (const c of mainlineCourses(conn)) {
      const kps = [...misconceptionCountByKp(c.payload).keys()]
      console.log(`  ${c.id}  ${c.title.slice(0, 24).padEnd(26)} KP ${String(kps.length).padStart(2)}  覆盖 ${kps.filter(k => existing.has(k)).length}`)
    }
    return
  }

  const courseId = argv[argv.indexOf('--course') + 1]
  if (!argv.includes('--course') || !courseId) {
    console.error('必须用 --course <courseId> 显式指定课程。不做全库批量——种子写进真表,范围要看得见。')
    process.exit(1)
  }

  const course = mainlineCourses(conn).find(c => c.id === courseId)
  if (!course) {
    console.error(`找不到 mainline 课程 ${courseId}(--list 查看可用课程)`)
    process.exit(1)
  }
  const counts = misconceptionCountByKp(course.payload)
  if (counts.size === 0) {
    console.error('该课没有可识别的 KP,不写入。')
    process.exit(1)
  }

  if (argv.includes('--clear')) {
    const out = clearSeed(conn, LEDGER_PATH, courseId)
    console.log(`《${course.title}》种子撤销:删除 ${out.removed.length} 条,恢复原值 ${out.restored.length} 条。`)
    for (const r of out.restored) console.log(`  恢复 ${r.kpId} → ${r.to}`)
    for (const s of out.skipped) {
      console.log(`  跳过 ${s.kpId}:当前 ${s.currentScore} ≠ 种子 ${s.seededScore},已被真实作答改动,不动它。`)
    }
    if (out.removed.length + out.restored.length + out.skipped.length === 0) {
      console.log('  台账里没有该课的种子记录(可能从未播种,或已撤销)。')
    }
    return
  }

  const out = seedMastery(conn, LEDGER_PATH, courseId, counts, { force: argv.includes('--force') })

  if (out.written.length === 0 && out.refused.length > 0) {
    console.error(`拒绝写入:《${course.title}》已有 ${out.refused.length} 条学情记录,可能是真实作答。`)
    for (const r of out.refused) console.error(`  ${r.kpId} 当前 ${r.existingScore}`)
    console.error('确认要覆盖请加 --force(原值会记进台账,--clear 可精确恢复)。')
    process.exit(1)
  }

  console.log(`《${course.title}》 ${course.id}`)
  console.log('模型:score = 0.72 − 0.16 × 教材标注误区条数    阈值:< 0.6 薄弱,< 0.25 走神\n')
  for (const [kpId, n] of counts) {
    const score = seedScoreFor(n)
    const verdict = score < 0.25 ? '走神' : score < 0.6 ? '薄弱' : '正常'
    const prev = out.written.find(w => w.kpId === kpId)?.previousScore
    const note = prev === null || prev === undefined ? '' : `  (覆盖原值 ${prev},已记台账)`
    console.log(`  ${kpId}  误区 ${n} 条 → ${score.toFixed(2)}  [${verdict}]${note}`)
  }
  const weak = [...counts.values()].filter(n => seedScoreFor(n) < 0.6).length
  console.log(`\n写入 ${out.written.length} 条,其中 ${weak} 条判薄弱——排练场将在这些知识点上产生可溯源反应。`)
  console.log(`台账:${LEDGER_PATH}`)
  console.log('这是**种子学情**,不是真实作答。--clear 只撤本脚本写的、此后未被改动过的行。')
}

main()

/**
 * seed-mastery · 排练场种子学情的核心逻辑(2026-07-28)
 *
 * 与 CLI(`scripts/seed-rehearsal-mastery.ts`)分离,只依赖 node 内建与一个结构化
 * sqlite 接口,便于用临时库单测——这条是被复审逼出来的:首版把逻辑写死在脚本里,
 * 无法回归验证,而它做的是**写真库**的事。
 *
 * ## 一条红线
 *
 * 种子与真实作答共用 concept_mastery 同表同 profile,表上没有来源字段。
 * 因此本模块的全部设计只服务一句话:**宁可留下一条种子,不动一条真数据。**
 * 每处判断拿不准时都倒向「当作真实数据、不碰」。
 *
 * ## 种子身份怎么认(两轮复审打磨出来的)
 *
 * 台账 `{seededScore, seededReviewedAt}` 记下写入时的分数**与时间戳**,
 * 只有两者都与当前行一致才认定「这行仍是我写的种子、此后没人动过」。
 *
 * 第一版只比分数,被复审指出:真实作答完全可能算出与种子相同的分数,
 * 只更新了 `last_reviewed_at`——那种情况下 `--clear` 会删掉真作答。
 * 分数是可碰撞的值,时间戳才是写入事件的指纹,必须一起比。
 *
 * ## 再次 force 会重取基线
 *
 * 「真实 0.90 → force 种子 → 学生作答 0.82 → 再次 force → clear」这条路径上,
 * 若一味保留最初的 previousScore,clear 会把 0.82 抹成 0.90——**用回滚的名义
 * 销毁中途产生的真数据**。所以再次写入时:当前行仍是未被动过的种子 → 保留原基线
 * (幂等重播);当前行已不是 → 它就是新的真实基线,台账改记它。
 *
 * ## 崩溃语义(台账是文件,数据库是库,没有跨二者的事务)
 *
 * 顺序固定为**先提交数据库,再原子替换台账文件**(临时文件 + rename)。
 * 崩在中间 → 种子行存在但台账无记录 → 此后一律被当作真实数据:拒绝覆盖、
 * clear 不碰。丢的是「能自动撤销」这个便利,不会丢数据。反过来先写台账则会
 * 出现「台账声称某行是种子、实际那行是真数据」,那是会删错东西的方向。
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 只声明本模块用得到的那几个方法,不 import better-sqlite3 的类型。
 * app 包一向经 `@maolab/db` 的 openSqliteRaw 访问数据库、不直接依赖 better-sqlite3,
 * 为一个种子脚本给 app 加 @types 依赖不划算(CLAUDE.md 谨慎引入依赖)。
 * 结构化声明还有个副作用好处:本模块与具体驱动解耦,测试可注入任何兼容实现。
 */
export interface SqliteLike {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number }
  }
  /** 只按无参形式使用:`db.transaction(() => {…})()`。声明收窄到实际用法,
   *  才能被 better-sqlite3 的 `Transaction<F>` 结构性满足。 */
  transaction(fn: () => void): () => void
}

export const SEED_PROFILE_ID = 'default'
const BASE = 0.72
const PER_MISCONCEPTION = 0.16
const FLOOR = 0.05
const EPS = 1e-9

/**
 * 种子分数的建模假设,写在明处:
 * **教材给某个知识点标注的误区越多,说明它越容易被学错,假定学生掌握得越弱。**
 * 可以被质疑、可以被替换,但它有理由,不是掷骰子。
 * 阈值参照 mastery.ts:< 0.6 判薄弱,< 0.25 判走神。
 */
export function seedScoreFor(misconceptionCount: number): number {
  return Math.max(FLOOR, Number((BASE - PER_MISCONCEPTION * misconceptionCount).toFixed(4)))
}

export interface SeedLedgerEntry {
  courseId: string
  kpId: string
  /** 本脚本写入的分数 */
  seededScore: number
  /** 本脚本写入的 last_reviewed_at。与 seededScore 一起构成「这行还是我写的那行」的指纹。 */
  seededReviewedAt: number
  /** 写入前该 KP 的分数;此前无记录则为 null。--clear 据此精确回滚。 */
  previousScore: number | null
  /** 写入前该 KP 的 last_reviewed_at;回滚要连时间一起还原,否则不叫「恢复原值」。 */
  previousReviewedAt: number | null
  seededAt: number
}

interface Ledger { entries: SeedLedgerEntry[] }

export function readLedger(path: string): Ledger {
  if (!existsSync(path)) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Ledger
    return Array.isArray(parsed.entries) ? parsed : { entries: [] }
  } catch {
    return { entries: [] }
  }
}

/** 临时文件 + rename:替换是原子的,不会留下半截 JSON 让下次读取静默退化成空台账。 */
function writeLedger(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(ledger, null, 2), 'utf8')
  renameSync(tmp, path)
}

interface MasteryRow { score: number; reviewedAt: number }

function rowOf(db: SqliteLike, kpId: string): MasteryRow | null {
  const row = db.prepare(
    'SELECT score, last_reviewed_at AS reviewedAt FROM concept_mastery WHERE profile_id = ? AND concept_id = ?',
  ).get(SEED_PROFILE_ID, kpId) as MasteryRow | undefined
  return row ?? null
}

/**
 * 这一行是否**仍是本脚本写的、此后没被动过的种子**。
 * 分数与时间戳都得对上:分数会碰撞(真实作答可能恰好算出同一个数),
 * 时间戳才是写入事件的指纹。任一不符 → 当作真实数据。
 */
function isUntouchedSeed(row: MasteryRow | null, entry: SeedLedgerEntry | undefined): boolean {
  if (!row || !entry) return false
  return Math.abs(row.score - entry.seededScore) < EPS && row.reviewedAt === entry.seededReviewedAt
}

export interface SeedOutcome {
  written: { kpId: string; score: number; previousScore: number | null }[]
  /** 因已有**非本脚本种子**的记录而被拒绝的 KP(未加 force 时) */
  refused: { kpId: string; existingScore: number }[]
}

/**
 * 写入种子学情。**默认遇到已有记录整批中止**——种子与真数据同表,
 * 不问自取地覆盖等于毁掉别人的作答。要覆盖须显式 force。
 *
 * 例外:目标行本身就是本脚本写的、此后没被动过的种子,重播不算覆盖任何人的东西,
 * 直接放行(幂等),台账里的原始基线原样保留。
 */
export function seedMastery(
  db: SqliteLike,
  ledgerPath: string,
  courseId: string,
  counts: ReadonlyMap<string, number>,
  opts: { force?: boolean } = {},
): SeedOutcome {
  const ledger = readLedger(ledgerPath)
  const entryOf = (kpId: string) => ledger.entries.find(e => e.kpId === kpId)

  const refused: SeedOutcome['refused'] = []
  const states = new Map<string, { row: MasteryRow | null; untouchedSeed: boolean }>()
  for (const kpId of counts.keys()) {
    const row = rowOf(db, kpId)
    const untouchedSeed = isUntouchedSeed(row, entryOf(kpId))
    states.set(kpId, { row, untouchedSeed })
    if (row && !untouchedSeed) refused.push({ kpId, existingScore: row.score })
  }
  if (refused.length > 0 && !opts.force) return { written: [], refused }

  const now = Date.now()
  const written: SeedOutcome['written'] = []
  const stmt = db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, concept_id) DO UPDATE SET score = excluded.score, last_reviewed_at = excluded.last_reviewed_at`)

  db.transaction(() => {
    for (const [kpId, n] of counts) {
      stmt.run(randomUUID(), SEED_PROFILE_ID, kpId, seedScoreFor(n), now)
    }
  })()

  // 数据库已提交,再落台账(顺序理由见文件头「崩溃语义」)
  for (const [kpId, n] of counts) {
    const state = states.get(kpId)!
    const existing = entryOf(kpId)
    // 仍是未被动过的种子 → 沿用最初的真实基线(幂等重播);
    // 否则当前值就是新的真实基线——中途产生的真作答不能被旧基线抹掉。
    const baseline = state.untouchedSeed && existing
      ? { score: existing.previousScore, reviewedAt: existing.previousReviewedAt }
      : { score: state.row?.score ?? null, reviewedAt: state.row?.reviewedAt ?? null }

    const score = seedScoreFor(n)
    const next: SeedLedgerEntry = {
      courseId,
      kpId,
      seededScore: score,
      seededReviewedAt: now,
      previousScore: baseline.score,
      previousReviewedAt: baseline.reviewedAt,
      seededAt: now,
    }
    if (existing) Object.assign(existing, next)
    else ledger.entries.push(next)
    written.push({ kpId, score, previousScore: baseline.score })
  }
  writeLedger(ledgerPath, ledger)

  return { written, refused: opts.force ? refused : [] }
}

export interface ClearOutcome {
  restored: { kpId: string; to: number }[]
  removed: string[]
  /** 分数或时间戳已对不上台账 → 真实作答动过它,一律不碰 */
  skipped: { kpId: string; seededScore: number; currentScore: number | null }[]
}

/**
 * 撤销种子。**只撤本脚本写的、且此后未被改动过的那些行。**
 * 分数或时间戳对不上就说明真实作答已经覆盖过它——宁可留下一条种子,不动一条真数据。
 * 恢复时分数与 last_reviewed_at 一并还原,才配叫「恢复原值」。
 */
export function clearSeed(
  db: SqliteLike,
  ledgerPath: string,
  courseId: string,
): ClearOutcome {
  const ledger = readLedger(ledgerPath)
  const out: ClearOutcome = { restored: [], removed: [], skipped: [] }
  if (!ledger.entries.some(e => e.courseId === courseId)) return out

  const del = db.prepare('DELETE FROM concept_mastery WHERE profile_id = ? AND concept_id = ?')
  const upd = db.prepare('UPDATE concept_mastery SET score = ?, last_reviewed_at = ? WHERE profile_id = ? AND concept_id = ?')

  const keep: SeedLedgerEntry[] = []
  db.transaction(() => {
    for (const entry of ledger.entries) {
      if (entry.courseId !== courseId) { keep.push(entry); continue }
      const row = rowOf(db, entry.kpId)
      if (!isUntouchedSeed(row, entry)) {
        out.skipped.push({ kpId: entry.kpId, seededScore: entry.seededScore, currentScore: row?.score ?? null })
        keep.push(entry)
        continue
      }
      if (entry.previousScore === null) {
        del.run(SEED_PROFILE_ID, entry.kpId)
        out.removed.push(entry.kpId)
      } else {
        upd.run(entry.previousScore, entry.previousReviewedAt ?? entry.seededAt, SEED_PROFILE_ID, entry.kpId)
        out.restored.push({ kpId: entry.kpId, to: entry.previousScore })
      }
    }
  })()

  writeLedger(ledgerPath, { entries: keep })
  return out
}

/** 某门课当前有哪些 KP 的分数来自种子(供页面披露来源,别让教师误读为真实班级记录)。 */
export function seededKpIds(db: SqliteLike, ledgerPath: string, courseId: string): Set<string> {
  const ledger = readLedger(ledgerPath)
  const out = new Set<string>()
  for (const entry of ledger.entries) {
    if (entry.courseId !== courseId) continue
    if (isUntouchedSeed(rowOf(db, entry.kpId), entry)) out.add(entry.kpId)
  }
  return out
}

/**
 * 当前数据库里所有仍与台账指纹一致的演示种子。课程库和新课生成没有 courseId
 * 上下文，也必须能排除这些分数，避免演示数据静默驱动真实教学决策。
 */
export function seededKpIdsAll(db: SqliteLike, ledgerPath: string): Set<string> {
  const ledger = readLedger(ledgerPath)
  const out = new Set<string>()
  for (const entry of ledger.entries) {
    if (isUntouchedSeed(rowOf(db, entry.kpId), entry)) out.add(entry.kpId)
  }
  return out
}

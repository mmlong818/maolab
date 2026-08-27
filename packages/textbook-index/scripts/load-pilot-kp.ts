#!/usr/bin/env tsx
/**
 * PR2.5 · Pilot KP 数据落库
 *
 * 用法：
 *   pnpm tsx packages/textbook-index/scripts/load-pilot-kp.ts \
 *     --tree=12eed579-1883-4b7c-b543-3bac585a4f16 [--concurrency=3] [--model=claude-cli:haiku]
 *
 * 边界：
 *   - 写真实 DB (data/maolab.db)，调用前由调用者保证已备份
 *   - 不改 annotator / 不改 schema / 不接 AdaptiveController
 *   - 失败叶子跳过，记入失败列表；不重试
 */

import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ensureKnowledgePointTables,
  findKpByCanonicalHash,
  insertCluster,
  insertKnowledgePoint,
  insertSourceRefs,
  linkChapterNodeKp,
  openSqliteRaw,
} from '@maolab/db'
import {
  computeCanonicalHash,
  newClusterId,
  newKpId,
  type KnowledgePoint,
  type KnowledgePointCluster,
  type SourceRef,
} from '@maolab/shared-types'

import {
  collectLeaves,
  createClaudeCliCaller,
  createKnowledgePointExtractionAnnotator,
  inferStage,
  inferSubject,
  indexLessonsByChapterId,
  type AnnotationContext,
  type TextbookFullInfo,
} from '../src/index.js'

// repo root = scripts/../../../  (this file: packages/textbook-index/scripts/load-pilot-kp.ts)
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const TREES_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-trees')
const DB_PATH = resolve(REPO_ROOT, 'data/maolab.db')

interface CliArgs {
  tree: string
  model: string
  concurrency: number
}

function parseArgs(argv: string[]): CliArgs {
  const out: Record<string, string> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq < 0) out[a.slice(2)] = 'true'
    else out[a.slice(2, eq)] = a.slice(eq + 1)
  }
  if (!out.tree) {
    console.error('用法: --tree=<id> [--concurrency=3] [--model=claude-cli:haiku]')
    process.exit(2)
  }
  return {
    tree: out.tree,
    model: out.model ?? 'claude-cli:haiku',
    concurrency: Math.max(1, parseInt(out.concurrency ?? '3', 10) || 3),
  }
}

interface LeafKpDraft {
  canonicalName: string
  canonicalNameEn: string
  aliases: string[]
  subject: string
  curriculumSystem: string
  gradeBand?: string
  dimensions: NonNullable<KnowledgePoint['dimensions']>
  confidence: number
}

interface LeafExtractResult {
  leafId: string
  title: string
  ok: boolean
  err?: string
  kps: LeafKpDraft[]
}

async function extractAll(
  tree: TextbookFullInfo,
  args: CliArgs,
): Promise<LeafExtractResult[]> {
  const subject = inferSubject(tree.textbookTitle)
  const stage = inferStage(tree.textbookTitle)
  const allLeaves = collectLeaves(tree.chapterTree)
  const lessonsIdx = indexLessonsByChapterId(tree.nationalLessons ?? [])

  console.log(`[load-pilot-kp] tree: ${tree.textbookTitle}`)
  console.log(`[load-pilot-kp] subject=${subject} stage=${stage} leaves=${allLeaves.length}`)
  console.log(`[load-pilot-kp] concurrency=${args.concurrency} model=${args.model}`)

  const annotator = createKnowledgePointExtractionAnnotator({ model: args.model })
  const llmCall = createClaudeCliCaller({ debug: false, timeoutMs: 180_000 })
  const results: LeafExtractResult[] = new Array(allLeaves.length)
  let nextIdx = 0
  let completed = 0

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const i = nextIdx++
      if (i >= allLeaves.length) return
      const leaf = allLeaves[i]!
      const ctx: AnnotationContext = {
        chapterId: leaf.node.id,
        chapterTitle: leaf.node.title,
        subject,
        stage,
        ancestorTitles: leaf.ancestorTitles,
        linkedLessonTitles: lessonsIdx.get(leaf.node.id) ?? [],
        textbookTitle: tree.textbookTitle,
      }
      const rec: LeafExtractResult = {
        leafId: leaf.node.id,
        title: leaf.node.title,
        ok: false,
        kps: [],
      }
      try {
        const { annotation } = await annotator.annotate(ctx, {
          apiKey: '',
          llmCall,
          model: annotator.model,
        })
        rec.ok = true
        rec.kps = annotation.value as LeafKpDraft[]
      } catch (err) {
        rec.err = err instanceof Error ? err.message : String(err)
      }
      results[i] = rec
      completed++
      const tag = rec.ok ? 'OK ' : 'FAIL'
      console.log(
        `[${tag}] (${completed}/${allLeaves.length}) w${workerId} kps=${rec.kps.length} · ${leaf.node.title}`,
      )
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, (_, k) => worker(k + 1)))
  return results
}

interface LoadStats {
  insertedClusters: number
  insertedKps: number
  insertedSourceRefs: number
  chapterNodeLinks: number
  skippedLeaves: number
  reusedKps: number
}

type RawDb = ReturnType<typeof openSqliteRaw>

function loadIntoDb(
  db: RawDb,
  treeId: string,
  results: LeafExtractResult[],
): LoadStats {
  const stats: LoadStats = {
    insertedClusters: 0,
    insertedKps: 0,
    insertedSourceRefs: 0,
    chapterNodeLinks: 0,
    skippedLeaves: 0,
    reusedKps: 0,
  }

  const tx = db.transaction(() => {
    for (const leaf of results) {
      if (!leaf.ok) {
        stats.skippedLeaves++
        continue
      }
      leaf.kps.forEach((draft, idx) => {
        const hashInput = {
          canonicalNameEn: draft.canonicalNameEn,
          subject: draft.subject,
        }
        const canonicalHash = computeCanonicalHash(
          draft.gradeBand ? { ...hashInput, gradeBand: draft.gradeBand } : hashInput,
        )
        const existing = findKpByCanonicalHash(db, canonicalHash)
        let kpId: string
        if (existing) {
          kpId = existing.id
          stats.reusedKps++
        } else {
          const now = Date.now()
          const cluster: KnowledgePointCluster = {
            id: newClusterId(),
            canonicalNameEn: draft.canonicalNameEn,
            subject: draft.subject,
            memberKpIds: [],
            createdAt: now,
            updatedAt: now,
          }
          insertCluster(db, cluster)
          stats.insertedClusters++

          kpId = newKpId()
          const kp: KnowledgePoint = {
            id: kpId,
            clusterId: cluster.id,
            canonicalName: draft.canonicalName,
            canonicalNameEn: draft.canonicalNameEn,
            aliases: draft.aliases ?? [],
            subject: draft.subject,
            curriculumSystem: draft.curriculumSystem,
            canonicalHash,
            provenance: { sourceRefs: [] },
            dimensions: draft.dimensions,
            createdAt: now,
            updatedAt: now,
          }
          if (draft.gradeBand) kp.gradeBand = draft.gradeBand
          insertKnowledgePoint(db, kp)
          stats.insertedKps++
        }

        const ref: SourceRef = {
          kind: 'pep-cn',
          systemId: 'pep-2019',
          textbookId: treeId,
          leafNodeId: leaf.leafId,
          confidence: draft.confidence,
          capturedAt: Date.now(),
        }
        insertSourceRefs(db, kpId, [ref])
        stats.insertedSourceRefs++

        linkChapterNodeKp(db, leaf.leafId, kpId, idx)
        stats.chapterNodeLinks++
      })
    }
  })

  tx()
  return stats
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const treePath = resolve(TREES_DIR, `${args.tree}.json`)
  const tree = JSON.parse(await readFile(treePath, 'utf-8')) as TextbookFullInfo

  const t0 = Date.now()
  const extractResults = await extractAll(tree, args)
  const extractMs = Date.now() - t0

  console.log('')
  console.log(`[load-pilot-kp] extract done in ${(extractMs / 1000).toFixed(1)}s`)
  const failures = extractResults.filter((r) => !r.ok)
  console.log(`[load-pilot-kp] zod-pass: ${extractResults.length - failures.length}/${extractResults.length}`)

  const db = openSqliteRaw(DB_PATH)
  ensureKnowledgePointTables(db)

  let stats: LoadStats
  try {
    stats = loadIntoDb(db, args.tree, extractResults)
  } catch (err) {
    console.error('[load-pilot-kp] FATAL during DB write, transaction rolled back:', err)
    db.close()
    process.exit(1)
  }

  // 终态查询
  const kpTotal = (db.prepare(`SELECT COUNT(*) AS c FROM knowledge_points`).get() as { c: number }).c
  const clusterTotal = (db.prepare(`SELECT COUNT(*) AS c FROM knowledge_point_clusters`).get() as { c: number }).c
  const sourceTotal = (db.prepare(`SELECT COUNT(*) AS c FROM knowledge_point_sources`).get() as { c: number }).c
  const linkTotal = (db.prepare(`SELECT COUNT(*) AS c FROM chapter_node_knowledge_points`).get() as { c: number }).c
  const kpWithoutSource = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM knowledge_points kp
         WHERE NOT EXISTS (SELECT 1 FROM knowledge_point_sources WHERE knowledge_point_id = kp.id)`,
      )
      .get() as { c: number }
  ).c

  db.close()

  const totalMs = Date.now() - t0
  console.log('')
  console.log('========== PR2.5 落库统计 ==========')
  console.log(`extract failures (skipped):  ${stats.skippedLeaves}`)
  console.log(`inserted clusters:           ${stats.insertedClusters}`)
  console.log(`inserted KPs:                ${stats.insertedKps}`)
  console.log(`reused (dedup) KPs:          ${stats.reusedKps}`)
  console.log(`inserted source_refs:        ${stats.insertedSourceRefs}`)
  console.log(`chapter_node_kp links:       ${stats.chapterNodeLinks}`)
  console.log('--- DB 终态 ---')
  console.log(`knowledge_points total:                 ${kpTotal}`)
  console.log(`knowledge_point_clusters total:         ${clusterTotal}`)
  console.log(`knowledge_point_sources total:          ${sourceTotal}`)
  console.log(`chapter_node_knowledge_points total:    ${linkTotal}`)
  console.log(`KPs without any source (should be 0):   ${kpWithoutSource}`)
  console.log(`total elapsed:                          ${(totalMs / 1000).toFixed(1)}s`)
  console.log('====================================')

  if (failures.length > 0) {
    console.log('')
    console.log('Skipped leaves:')
    for (const f of failures) {
      console.log(`  - ${f.leafId.slice(0, 8)} "${f.title}" :: ${(f.err ?? '').slice(0, 200)}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

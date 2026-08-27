#!/usr/bin/env tsx
import { syncIndex, saveIndex, DEFAULT_INDEX_PATH } from '../src/index.js'

async function main() {
  console.log('[textbook-index] 同步中...')
  const t0 = Date.now()
  const index = await syncIndex()
  const ms = Date.now() - t0

  const byStage = new Map<string, number>()
  const bySubject = new Map<string, number>()
  for (const e of index.entries) {
    byStage.set(e.stage, (byStage.get(e.stage) ?? 0) + 1)
    bySubject.set(`${e.stage}/${e.subject}`, (bySubject.get(`${e.stage}/${e.subject}`) ?? 0) + 1)
  }

  await saveIndex(index, DEFAULT_INDEX_PATH)
  console.log(`[textbook-index] ✓ ${index.entries.length} 本教材入库 (${ms}ms) → ${DEFAULT_INDEX_PATH}`)
  console.log(`  module_version: ${index.moduleVersion}`)
  console.log('  按学段:')
  for (const [s, n] of byStage) console.log(`    ${s}: ${n}`)
  console.log('  按学科 (前 20):')
  let i = 0
  for (const [k, n] of Array.from(bySubject).sort((a, b) => b[1] - a[1])) {
    if (++i > 20) break
    console.log(`    ${k}: ${n}`)
  }

  // 被版本白名单挡掉的要说出来。高中数学曾因标签是「人教A版」而整个学段零入库,
  // 静默丢弃让这个缺口活了很久也没人发现。
  if (index.rejectedVersions.size > 0) {
    console.log(`  被版本白名单挡掉 ${Array.from(index.rejectedVersions.values()).reduce((a, b) => a + b, 0)} 本:`)
    for (const [k, n] of Array.from(index.rejectedVersions).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${k}: ${n}`)
    }
  }
}

main().catch(e => {
  console.error('[textbook-index] 同步失败:', e)
  process.exit(1)
})

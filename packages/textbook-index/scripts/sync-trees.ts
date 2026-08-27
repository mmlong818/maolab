#!/usr/bin/env tsx
import { loadIndex, fetchAllTextbooks, DEFAULT_INDEX_PATH } from '../src/index.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const TREES_DIR = 'data/textbook-trees'

async function main() {
  console.log('[trees] 加载教材索引...')
  const index = await loadIndex(DEFAULT_INDEX_PATH)
  console.log(`[trees] 待拉取 ${index.entries.length} 本教材的章节树 + 国家课资源包`)

  const t0 = Date.now()
  let lastLog = 0
  const results = await fetchAllTextbooks(index.entries, {
    concurrency: 8,
    onProgress: (done, total, title) => {
      const now = Date.now()
      if (now - lastLog > 2000 || done === total) {
        const pct = ((done / total) * 100).toFixed(1)
        console.log(`  [${done}/${total}] ${pct}%  ${title}`)
        lastLog = now
      }
    },
  })
  const ms = Date.now() - t0
  console.log(`[trees] ✓ ${results.length}/${index.entries.length} 拉取完成 (${(ms / 1000).toFixed(1)}s)`)

  // 写每本一个 json 到 data/textbook-trees/{id}.json
  await mkdir(TREES_DIR, { recursive: true })
  let withChapters = 0
  let withLessons = 0
  let totalLessons = 0
  const summary: Array<{ id: string; title: string; chapters: number; lessons: number }> = []
  for (const r of results) {
    const path = `${TREES_DIR}/${r.textbookId}.json`
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(r, null, 0), 'utf-8')
    if (r.chapterTree.length > 0) withChapters++
    if (r.nationalLessons.length > 0) withLessons++
    totalLessons += r.nationalLessons.length
    summary.push({
      id: r.textbookId,
      title: r.textbookTitle.slice(0, 60),
      chapters: r.chapterTree.length,
      lessons: r.nationalLessons.length,
    })
  }
  // 写汇总
  await writeFile(`${TREES_DIR}/_summary.json`, JSON.stringify(summary, null, 2), 'utf-8')

  console.log(`[trees] 摘要:`)
  console.log(`  有章节树: ${withChapters}/${results.length}`)
  console.log(`  有国家课资源: ${withLessons}/${results.length}`)
  console.log(`  国家课总数: ${totalLessons}`)
  console.log(`  写入: ${TREES_DIR}/{textbookId}.json`)
}

main().catch(e => {
  console.error('[trees] 失败:', e)
  process.exit(1)
})

import { type NextRequest, NextResponse } from 'next/server'
import { loadIndex, searchTextbooks, listFacets } from '@maolab/textbook-index'
import path from 'node:path'

// 索引在 packages/textbook-index/data/ 下,从 app 目录推 ../packages/textbook-index/data/textbook-index.json
const INDEX_PATH = path.resolve(process.cwd(), '../packages/textbook-index/data/textbook-index.json')

let cached: Awaited<ReturnType<typeof loadIndex>> | null = null
async function getIndex() {
  if (cached) return cached
  cached = await loadIndex(INDEX_PATH)
  return cached
}

export async function GET(req: NextRequest) {
  try {
    const index = await getIndex()
    const sp = req.nextUrl.searchParams
    if (sp.get('facets') === '1') {
      return NextResponse.json({ facets: listFacets(index), total: index.entries.length })
    }
    const stage = sp.get('stage') as '小学' | '初中' | '高中' | null
    const result = searchTextbooks(index, {
      ...(stage ? { stage } : {}),
      ...(sp.get('subject') ? { subject: sp.get('subject')! } : {}),
      ...(sp.get('version') ? { version: sp.get('version')! } : {}),
      ...(sp.get('grade') ? { grade: sp.get('grade')! } : {}),
      ...(sp.get('volume') ? { volume: sp.get('volume')! } : {}),
      ...(sp.get('q') ? { q: sp.get('q')! } : {}),
    })
    return NextResponse.json({
      items: result.map(e => ({
        id: e.id,
        title: e.title,
        stage: e.stage,
        subject: e.subject,
        version: e.version,
        grade: e.grade,
        volume: e.volume,
      })),
      total: result.length,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

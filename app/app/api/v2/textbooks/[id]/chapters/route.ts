import { type NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { loadFullInfo, flattenChapters, getLessonsForChapter, pickSubResource } from '@maolab/textbook-index'

const TREES_DIR = path.resolve(process.cwd(), '../packages/textbook-index/data/textbook-trees')

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const info = await loadFullInfo(id, TREES_DIR)
  if (!info) {
    return NextResponse.json({ error: 'textbook not found in trees cache' }, { status: 404 })
  }
  const flat = flattenChapters(info.chapterTree)
  // 给每个章节标注:有几节国家课 + 是否有 lesson_plandesign(教学设计)
  const chapters = flat.map(c => {
    const lessons = getLessonsForChapter(info.nationalLessons, c.id)
    const hasPlanDesign = lessons.some(l => pickSubResource(l, 'lesson_plandesign'))
    return {
      ...c,
      lessonCount: lessons.length,
      hasPlanDesign,
    }
  })
  return NextResponse.json({
    textbookId: info.textbookId,
    textbookTitle: info.textbookTitle,
    totalLessons: info.nationalLessons.length,
    chapters,
  })
}

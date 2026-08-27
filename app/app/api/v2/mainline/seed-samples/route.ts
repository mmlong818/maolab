import { NextResponse } from 'next/server'
import { GOLDEN_MAINLINE_COURSES } from '../../../../lib/mainline/index.js'
import { saveMainlineCourse } from '../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

/** 把内置黄金样板课落库（开发/演示用）。P1 垂直切片的数据来源。 */
export async function POST() {
  const seeded: string[] = []
  for (const course of GOLDEN_MAINLINE_COURSES) {
    await saveMainlineCourse(course)
    seeded.push(course.id)
  }
  return NextResponse.json({ ok: true, seeded })
}

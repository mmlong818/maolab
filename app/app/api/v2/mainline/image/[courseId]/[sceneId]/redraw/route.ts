import { type NextRequest, NextResponse } from 'next/server'
import { IMAGE_SCENE_TYPES } from '../../../../../../../lib/mainline/domain.js'
import { fillImages } from '../../../../../../../lib/mainline/generation/fill-images.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string; sceneId: string }> }) {
  const { courseId, sceneId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: '课程不存在。' }, { status: 404 })

  const scene = course.scenes.find(item => item.id === sceneId)
  if (!scene) return NextResponse.json({ error: '这一幕不存在。' }, { status: 404 })
  if (!IMAGE_SCENE_TYPES.includes(scene.sceneType)) {
    return NextResponse.json({ error: '这一幕不属于可生成配图的幕型。' }, { status: 400 })
  }

  try {
    const result = await fillImages({ ...course, scenes: [scene] }, { force: true })
    const redrawn = result.course.scenes[0]
    if (!redrawn?.imageUrl || result.failedSceneIds.length > 0) {
      return NextResponse.json({ error: '图片重绘失败，请稍后再试。' }, { status: 502 })
    }

    const nextCourse = {
      ...course,
      scenes: course.scenes.map(item => item.id === sceneId ? redrawn : item),
    }
    await saveMainlineCourse(nextCourse)
    return NextResponse.json({
      ok: true,
      sceneId,
      imageUrl: redrawn.imageUrl,
      imagePrompt: redrawn.imagePrompt,
      imageFidelity: redrawn.imageFidelity,
      imageAspect: redrawn.imageAspect,
    })
  } catch (error) {
    console.error('[mainline-image-redraw]', error)
    return NextResponse.json({ error: '图片重绘失败，请稍后再试。' }, { status: 500 })
  }
}

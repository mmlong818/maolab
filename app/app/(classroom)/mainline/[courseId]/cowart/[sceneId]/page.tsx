import { notFound } from 'next/navigation'
import { CowartImageEditor } from '@/components/mainline/cowart/CowartImageEditor'
import { findMainlineCourse } from '@/lib/mainline/store'
import { courseImageTarget } from '@/lib/mainline/page-image-target'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MainlineCowartPage({
  params,
}: {
  params: Promise<{ courseId: string; sceneId: string }>
}) {
  const { courseId, sceneId } = await params
  const course = await findMainlineCourse(courseId)
  const target = course ? courseImageTarget(course, sceneId) : undefined
  if (!target?.scene.imageUrl) return notFound()

  return (
    <CowartImageEditor
      courseId={courseId}
      sceneId={sceneId}
      imageUrl={target.scene.imageUrl}
      visualFocus={target.scene.visualFocus}
    />
  )
}

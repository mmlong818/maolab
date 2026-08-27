import { notFound } from 'next/navigation'
import { CowartImageEditor } from '@/components/mainline/cowart/CowartImageEditor'
import { findMainlineCourse } from '@/lib/mainline/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MainlineCowartPage({
  params,
}: {
  params: Promise<{ courseId: string; sceneId: string }>
}) {
  const { courseId, sceneId } = await params
  const course = await findMainlineCourse(courseId)
  const scene = course?.scenes.find(item => item.id === sceneId)
  if (!scene?.imageUrl) return notFound()

  return (
    <CowartImageEditor
      courseId={courseId}
      sceneId={sceneId}
      imageUrl={scene.imageUrl}
      visualFocus={scene.visualFocus}
    />
  )
}

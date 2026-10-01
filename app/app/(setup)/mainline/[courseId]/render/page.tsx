import { notFound } from 'next/navigation'
import { StageCanvas } from '@/components/mainline/StageCanvas'
import { findMainlineCourse } from '@/lib/mainline/store'

export const runtime = 'nodejs'

export default async function GenerationRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ export?: string }>
}) {
  const [{ courseId }, query] = await Promise.all([params, searchParams])
  if (query.export !== '1') return notFound()
  const course = await findMainlineCourse(courseId)
  if (!course?.pageContent || !course.generationSession) return notFound()
  return <StageCanvas courses={[course]} />
}

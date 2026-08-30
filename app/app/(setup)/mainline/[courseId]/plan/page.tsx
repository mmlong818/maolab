import { notFound, redirect } from 'next/navigation'
import { findMainlineCourse } from '@/lib/mainline/store'
import { CoursePlanReview } from './CoursePlanReview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MainlinePlanPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const course = await findMainlineCourse(courseId)
  if (!course) return notFound()
  if (!course.planning) redirect(`/mainline/${courseId}/prep`)
  if (course.planning.status === 'review' || course.planning.status === 'ready') {
    redirect(`/mainline/${courseId}/prep`)
  }
  if (course.planning.status === 'archived') redirect('/mainline')

  return (
    <CoursePlanReview
      courseId={course.id}
      topic={course.topic}
      subject={course.subject}
      gradeBand={course.gradeBand}
      revisionNo={course.revision?.revisionNo ?? 1}
      planning={course.planning}
    />
  )
}

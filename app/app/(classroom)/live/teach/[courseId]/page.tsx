import { redirect } from 'next/navigation'
import { findMainlineCourse } from '../../../../lib/mainline/store.js'

export default async function TeachLivePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const course = await findMainlineCourse(courseId)
  redirect(course ? `/mainline/${courseId}` : '/mainline')
}

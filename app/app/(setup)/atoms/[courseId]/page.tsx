import { redirect } from 'next/navigation'

/** 旧 v2 页已停用,重定向到 mainline 课程库(round06 Phase A)。 */
export default function LegacyRedirect() {
  redirect('/mainline')
}

import { redirect } from 'next/navigation'

/** 旧 Sprint 0 generator UI 已停用,重定向到 mainline 课程库(round06 Phase C 补漏)。 */
export default function LegacyGeneratorRedirect() {
  redirect('/mainline')
}
